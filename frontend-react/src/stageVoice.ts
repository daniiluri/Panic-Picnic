const packetSamples = 1600
const voiceRate = 16000
const magic = new TextEncoder().encode('voice\n')

function packetHeader(round: string, turn: number) {
  return new TextEncoder().encode(`voice\n${round}\n${turn}\n`)
}

export function publishVoice(ws: WebSocket | null, round: string, turn: number, pcm: ArrayBuffer) {
  if (
    pcm.byteLength === packetSamples * 2 &&
    ws?.readyState === WebSocket.OPEN &&
    ws.bufferedAmount < 8192
  )
    ws.send(new Blob([packetHeader(round, turn), pcm]))
}

export function createVoiceInbox() {
  let listener: ((packet: Uint8Array<ArrayBuffer>) => void) | undefined
  return {
    receive(packet: ArrayBuffer) {
      const bytes = new Uint8Array(packet)
      if (!magic.every((value, index) => bytes[index] === value)) return false
      listener?.(bytes)
      return true
    },
    listen(round: string, turn: number, context: AudioContext) {
      const header = packetHeader(round, turn)
      const playing = new Set<AudioBufferSourceNode>()
      let next = 0
      const receive = (bytes: Uint8Array<ArrayBuffer>) => {
        if (
          context.state !== 'running' ||
          bytes.length !== header.length + packetSamples * 2 ||
          !header.every((value, index) => bytes[index] === value)
        )
          return
        if (next > context.currentTime + 0.35) return
        const buffer = context.createBuffer(1, packetSamples, voiceRate)
        const channel = buffer.getChannelData(0)
        const pcm = new DataView(bytes.buffer, header.length)
        for (let i = 0; i < channel.length; i++) channel[i] = pcm.getInt16(i * 2, true) / 32768
        const source = context.createBufferSource()
        source.buffer = buffer
        source.connect(context.destination)
        playing.add(source)
        source.onended = () => {
          source.disconnect()
          playing.delete(source)
        }
        next = Math.max(context.currentTime + 0.035, next)
        source.start(next)
        next += buffer.duration
      }
      listener = receive
      return () => {
        if (listener === receive) listener = undefined
        for (const source of playing) source.stop()
      }
    },
  }
}
export interface StageVoice {
  publish(round: string, turn: number, pcm: ArrayBuffer): void
  listen(round: string, turn: number, context: AudioContext): () => void
}

export async function openStageMic(
  context: AudioContext,
  track: MediaStreamTrack,
  signal: AbortSignal,
  send: (pcm: ArrayBuffer) => void,
) {
  await context.resume()
  await context.audioWorklet.addModule('/stage-voice-processor.js')
  signal.throwIfAborted()
  if (track.readyState !== 'live') throw new Error('Microphone disconnected')
  const node = new AudioWorkletNode(context, 'picnic-stage-voice', {
    channelCount: 1,
    channelCountMode: 'explicit',
  })
  // The device manager keeps its original track disabled between games.
  const input = track.clone()
  let source: MediaStreamAudioSourceNode | undefined
  function stop() {
    input.stop()
    source?.disconnect()
    node.disconnect()
    node.port.close()
  }
  try {
    source = context.createMediaStreamSource(new MediaStream([input]))
    node.port.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => {
      if (!signal.aborted) send(data)
    }
    source.connect(node)
    node.connect(context.destination) // The processor outputs silence to this device.
    signal.addEventListener('abort', stop, { once: true })
    input.enabled = true
  } catch (error) {
    stop()
    throw error
  }
}
