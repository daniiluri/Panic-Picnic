import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Command, Room, Seat } from './game'
import { createCameraInbox } from './cameraFeed'
import { createVoiceInbox, publishVoice } from './stageVoice'

const SEAT_KEY = 'panic-picnic-seat'

export function useRoom(releaseDevices: () => void) {
  const [seat, setSeat] = useState<Seat | null>(() => {
    const saved = sessionStorage.getItem(SEAT_KEY)
    return saved ? JSON.parse(saved) : null
  })
  const [room, setRoom] = useState<Room | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const socket = useRef<WebSocket | null>(null)
  const [voiceInbox] = useState(createVoiceInbox)
  const voice = useMemo(() => ({
    listen: voiceInbox.listen,
    publish(round: string, turn: number, pcm: ArrayBuffer) {
      publishVoice(socket.current, round, turn, pcm)
    },
  }), [voiceInbox])
  const [cameraInbox] = useState(createCameraInbox)
  const cameraFeed = useMemo(
    () => ({
      subscribe: cameraInbox.subscribe,
      publish(round: string, image: Blob) {
        const ws = socket.current
        if (ws?.readyState === WebSocket.OPEN && ws.bufferedAmount === 0 && image.size < 48 * 1024)
          ws.send(new Blob([round, '\n', image]))
      },
    }),
    [cameraInbox],
  )

  const clearSeat = useCallback(() => {
    releaseDevices()
    sessionStorage.removeItem(SEAT_KEY)
    setSeat(null)
    setRoom(null)
    setConnected(false)
    setEndsAt(null)
    history.replaceState(null, '', location.pathname)
  }, [releaseDevices])

  useEffect(() => {
    if (!seat) return
    let active = true
    let attempt = 0
    let timer: ReturnType<typeof setTimeout>
    function connect() {
      if (!active || !seat) return
      const url = new URL('/api/rooms/' + seat.code + '/live', location.href)
      url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(url)
      ws.binaryType = 'arraybuffer'
      socket.current = ws
      ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: seat.token }))
      ws.onmessage = ({ data }) => {
        if (!active) return
        if (data instanceof ArrayBuffer) {
          if (!voiceInbox.receive(data)) cameraInbox.receive(data)
          return
        }
        const message: Room | { type: 'error'; message: string } = JSON.parse(data)
        if (message.type === 'error') {
          setError(message.message)
          return
        }
        attempt = 0
        setConnected(true)
        setRoom(message)
        setEndsAt(message.remaining_ms === null ? null : performance.now() + message.remaining_ms)
      }
      ws.onclose = ({ code, reason }) => {
        if (!active) return
        socket.current = null
        setConnected(false)
        if ([4000, 4001, 4004].includes(code)) {
          clearSeat()
          setError(code === 4000 ? '' : reason)
        } else {
          timer = setTimeout(connect, Math.min(3000, 350 * 2 ** attempt++))
        }
      }
    }
    timer = setTimeout(connect, 0)
    return () => {
      active = false
      clearTimeout(timer)
      socket.current?.close()
      socket.current = null
    }
  }, [seat, clearSeat, cameraInbox, voiceInbox])

  async function enter(name: string, code?: string) {
    const path = code
      ? '/api/rooms/' + encodeURIComponent(code.toUpperCase()) + '/join'
      : '/api/rooms'
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    })
    if (!response.ok) {
      const problem = await response.json()
      throw new Error(
        typeof problem.detail === 'string'
          ? problem.detail
          : 'Use a nickname between 1 and 20 characters.',
      )
    }
    const next: Seat = await response.json()
    sessionStorage.setItem(SEAT_KEY, JSON.stringify(next))
    history.replaceState(null, '', '?room=' + next.code)
    setError('')
    setSeat(next)
  }

  const send = useCallback((command: Command) => {
    if (socket.current?.readyState !== WebSocket.OPEN) {
      setError('Reconnecting to your room. Try again in a moment.')
      return
    }
    setError('')
    socket.current.send(JSON.stringify(command))
  }, [])

  function leave() {
    if (socket.current?.readyState === WebSocket.OPEN) send({ type: 'leave' })
    else clearSeat()
  }
  return {
    seat,
    room,
    connected,
    error,
    endsAt,
    enter,
    send,
    cameraFeed,
    voice,
    leave,
    dismissError: () => setError(''),
  }
}
