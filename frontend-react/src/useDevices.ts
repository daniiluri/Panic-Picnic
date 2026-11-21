import { useCallback, useEffect, useRef, useState } from 'react'

export interface Devices {
  status: 'requesting' | 'available' | 'unavailable' | 'released'
  stream: MediaStream | null
  message: string
}
const pending: Devices = {
  status: 'requesting',
  stream: null,
  message: 'Allow camera and mic to join the camera and voice games.',
}
const deniedKey = 'picnic-devices-blocked'
const blocked =
  'Camera and mic access is blocked. To enable devices, check your browser settings.'

export function useDevices() {
  const [devices, setDevices] = useState<Devices>(pending)
  const active = useRef<AbortController | null>(null)

  const request = useCallback(async () => {
    active.current?.abort()
    const control = new AbortController()
    const { signal } = control
    active.current = control
    setDevices(pending)
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error('Open the trusted HTTPS room address to use the camera and mic.')
      const inputs = (await navigator.mediaDevices.enumerateDevices()).filter(
        (device) => device.kind === 'audioinput' || device.kind === 'videoinput',
      )
      signal.throwIfAborted()
      // Some browsers hide their device list until the first grant.
      const has = (kind: MediaDeviceKind) => !inputs.length || inputs.some((d) => d.kind === kind)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: has('audioinput') && {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
        video: has('videoinput') && {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 60 },
        },
      })
      const tracks = stream.getTracks()
      const stop = () => tracks.forEach((track) => track.stop())
      if (signal.aborted) {
        stop()
        return
      }
      signal.addEventListener('abort', stop, { once: true })
      sessionStorage.removeItem(deniedKey)
      function publish() {
        const live = tracks.filter((track) => track.readyState === 'live')
        const cam = live.some((track) => track.kind === 'video')
        const mic = live.some((track) => track.kind === 'audio')
        setDevices({
          status: cam || mic ? 'available' : 'unavailable',
          stream: cam || mic ? stream : null,
          message:
            cam && mic
              ? 'Camera and mic ready for the match.'
              : cam
                ? 'Camera ready. Mic Hop needs a microphone.'
                : mic
                  ? 'Microphone ready. 67 Frenzy needs a camera.'
                  : 'Devices disconnected. You can still watch.',
        })
      }
      for (const track of tracks) {
        track.enabled = false
        track.addEventListener('ended', publish, { signal })
      }
      publish()
    } catch (err) {
      if (signal.aborted) return
      const denied = err instanceof DOMException && err.name === 'NotAllowedError'
      let message = 'Camera and mic couldn’t start. Check your device settings.'
      if (denied) {
        sessionStorage.setItem(deniedKey, 'yes')
        message = blocked
      } else if (err instanceof DOMException && err.name === 'NotFoundError') {
        message = 'No camera or mic found. You can still watch.'
      } else if (err instanceof Error && !(err instanceof DOMException)) {
        message = err.message
      }
      setDevices({ status: 'unavailable', stream: null, message })
    }
  }, [])

  const release = useCallback(() => {
    active.current?.abort()
    active.current = null
    setDevices(
      sessionStorage.getItem(deniedKey)
        ? { status: 'unavailable', stream: null, message: blocked }
        : { status: 'released', stream: null, message: 'Devices are off.' },
    )
  }, [])

  useEffect(() => {
    function open() {
      if (sessionStorage.getItem(deniedKey))
        setDevices({ status: 'unavailable', stream: null, message: blocked })
      else void request()
    }
    const timer = window.setTimeout(open, 0)
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) open()
    }
    window.addEventListener('pagehide', release)
    window.addEventListener('pageshow', onShow)
    return () => {
      clearTimeout(timer)
      active.current?.abort()
      window.removeEventListener('pagehide', release)
      window.removeEventListener('pageshow', onShow)
    }
  }, [request, release])

  return { devices, request, release }
}
