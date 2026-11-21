import { HandSwaps, MOTION_HEIGHT, MOTION_WIDTH, SoundGate } from './detectors'
import { unlockSound } from './sound'

export interface Feedback {
  level: number
  hint: string
  hit: boolean
}
interface InputEvents {
  ready: (stream: MediaStream) => void
  update: (sample: Feedback) => void
  failed: (message: string) => void
  epoch: () => string
}

// The session owns the track. A round borrows it and mutes it again on exit.
export async function openInput(track: MediaStreamTrack, signal: AbortSignal, events: InputEvents) {
  signal.throwIfAborted()
  const stream = new MediaStream([track])
  let frame = 0
  let scheduleFrame: (callback: FrameRequestCallback) => number = (cb) => requestAnimationFrame(cb)
  let cancelFrame = (id: number) => cancelAnimationFrame(id)
  const cleanups: Array<() => void> = [
    () => {
      track.enabled = false
    },
    () => cancelFrame(frame),
  ]
  const release = () => {
    for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  }
  signal.addEventListener('abort', release, { once: true })
  track.enabled = true

  try {
    let sample: (now: number) => void
    if (track.kind === 'audio') {
      const audio = unlockSound()
      const analyser = audio.createAnalyser()
      analyser.fftSize = 1024
      const source = audio.createMediaStreamSource(stream)
      source.connect(analyser)
      cleanups.push(() => {
        source.disconnect()
        analyser.disconnect()
      })
      const buffer = new Float32Array(analyser.fftSize)
      const noise: number[] = []
      let start = 0,
        lastUi = -Infinity
      let gate: SoundGate | null = null
      sample = (now) => {
        if (audio.state !== 'running') {
          if (now - lastUi > 500) {
            events.update({ level: 0, hit: false, hint: 'Tap the page to wake your microphone.' })
            lastUi = now
          }
          return
        }
        analyser.getFloatTimeDomainData(buffer)
        const rms = Math.sqrt(buffer.reduce((total, v) => total + v * v, 0) / buffer.length)
        if (!gate) {
          start ||= now
          noise.push(rms)
          if (now - start < 900) return
          noise.sort((a, b) => a - b)
          gate = new SoundGate(Math.max(0.026, noise[Math.floor(noise.length * 0.25)] * 1.6))
        }
        const hit = gate.read(rms, now)
        if (hit || now - lastUi > 100) {
          lastUi = now
          events.update({
            hit,
            level: Math.min(1, rms / gate.threshold),
            hint: hit ? 'Jump!' : 'Say “ba-ba-ba” close to your mic. Each accent is a jump.',
          })
        }
      }
    } else {
      const video = document.createElement('video')
      scheduleFrame = (cb) => video.requestVideoFrameCallback(cb)
      cancelFrame = (id) => video.cancelVideoFrameCallback(id)
      video.muted = video.playsInline = true
      video.srcObject = stream
      cleanups.push(() => {
        video.pause()
        video.srcObject = null
      })
      await video.play()
      signal.throwIfAborted()
      const canvas = document.createElement('canvas')
      canvas.width = MOTION_WIDTH
      canvas.height = MOTION_HEIGHT
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) throw new Error('The camera preview could not start.')
      const swaps = new HandSwaps()
      let lastUi = -Infinity
      let epoch = events.epoch()
      sample = (now) => {
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
        if (epoch !== events.epoch()) {
          swaps.reset()
          epoch = events.epoch()
        }
        ctx.drawImage(video, 0, 0, MOTION_WIDTH, MOTION_HEIGHT)
        const { data } = ctx.getImageData(0, 0, MOTION_WIDTH, MOTION_HEIGHT)
        const result = swaps.read(data, now)
        if (result.hit || now - lastUi > 140) {
          lastUi = now
          events.update(result)
        }
      }
    }
    events.ready(stream)
    const loop = (now: number) => {
      if (signal.aborted) return
      try {
        sample(now)
        frame = scheduleFrame(loop)
      } catch (err) {
        release()
        events.failed(err instanceof Error ? err.message : 'Device input stopped.')
      }
    }
    frame = scheduleFrame(loop)
  } catch (err) {
    release()
    throw err
  }
}
