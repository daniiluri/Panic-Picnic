import { useLanguage } from './i18n'
import { useEffect, useRef } from 'react'
import { CameraOff, Hand } from 'lucide-react'
import type { CameraFeed } from './cameraFeed'
import type { Player, Room } from './game'
import { Badge } from './ui'
import './CameraWall.css'

type FeedProps = { feed: CameraFeed; round: string }

function LocalCamera({ feed, round, stream }: FeedProps & { stream: MediaStream }) {
  const { t } = useLanguage()
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const video = ref.current!
    video.srcObject = stream
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    let active = true
    let encoding = false
    const timer = window.setInterval(() => {
      if (encoding || !video.videoWidth || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)
        return
      const scale = Math.min(1, 320 / Math.max(video.videoWidth, video.videoHeight))
      const w = Math.round(video.videoWidth * scale)
      const h = Math.round(video.videoHeight * scale)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      ctx.drawImage(video, 0, 0, w, h)
      encoding = true
      canvas.toBlob(
        (image) => {
          encoding = false
          if (active && image) feed.publish(round, image)
        },
        'image/jpeg',
        0.65,
      )
    }, 100)
    return () => {
      active = false
      window.clearInterval(timer)
      video.srcObject = null
    }
  }, [feed, round, stream])
  return <video ref={ref} autoPlay muted playsInline aria-label={t('Your shared camera')} />
}

function RemoteCamera({ feed, round, player }: FeedProps & { player: Player }) {
  const { t } = useLanguage()
  const ref = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const img = ref.current!
    let currentUrl = ''
    let timeout = 0
    function clear() {
      window.clearTimeout(timeout)
      img.removeAttribute('src')
      if (currentUrl) URL.revokeObjectURL(currentUrl)
      currentUrl = ''
    }
    const unsubscribe = feed.subscribe(player.id, round, (frame) => {
      const previous = currentUrl
      currentUrl = URL.createObjectURL(frame)
      img.src = currentUrl
      if (previous) URL.revokeObjectURL(previous)
      window.clearTimeout(timeout)
      timeout = window.setTimeout(clear, 2000)
    })
    return () => {
      unsubscribe()
      clear()
    }
  }, [feed, round, player.id])
  return <img ref={ref} alt={t('{name}’s live camera', { name: player.name })} />
}

interface WallProps {
  room: Room
  me: Player
  stream: MediaStream | null
  feed: CameraFeed
  hint: string
}

export function CameraWall({ room, me, stream, feed, hint }: WallProps) {
  const { t, count, message } = useLanguage()
  return (
    <section className="camera-wall" aria-label={t('Room cameras')}>
      <ul>
        {room.players.map((p) => {
          const own = p.id === me.id
          return (
            <li key={p.id} className={own ? 'camera-tile own-camera' : 'camera-tile'}>
              <div className="camera-picture">
                <div className="camera-placeholder">
                  <Badge index={p.avatar} />
                  <small>
                    {!p.connected
                      ? t('Reconnecting')
                      : !p.playing
                        ? t('Watching')
                        : t('Waiting for camera')}
                  </small>
                </div>
                {p.connected &&
                  p.playing &&
                  (own ? (
                    stream && <LocalCamera feed={feed} round={room.round_id} stream={stream} />
                  ) : (
                    <RemoteCamera feed={feed} round={room.round_id} player={p} />
                  ))}
              </div>
              <div className="camera-caption">
                <strong>
                  {p.name}
                  {own && <small> · {t('You')}</small>}
                </strong>
                {p.playing ? (
                  <span className="camera-score" aria-label={count(p.value, 'switch')}>
                    <Hand size={14} />
                    {p.value}
                  </span>
                ) : (
                  <CameraOff size={16} aria-label={t('Camera off')} />
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <p className="camera-hint">
        {me.playing
          ? message(hint) || t('Lift one hand as the other drops.')
          : t('You’re watching this round.')}
      </p>
    </section>
  )
}
