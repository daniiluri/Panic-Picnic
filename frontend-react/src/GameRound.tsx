import { useLanguage } from './i18n'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Trophy, Volume2 } from 'lucide-react'
import { CameraWall } from './CameraWall'
import type { CameraFeed } from './cameraFeed'
import { games, type PlayableGame, type Player, type Room, type Send } from './game'
import { openInput, type Feedback } from './media'
import type { Devices } from './useDevices'
import { Badge, GameKind, PalmGuide, RoundBanner, Timer } from './ui'

const Stage = lazy(() => import('./Stage'))
type Props = {
  room: Room
  me: Player
  send: Send
  endsAt: number | null
  devices: Devices
  cameraFeed: CameraFeed
}
const blank: Feedback = { level: 0, hint: '', hit: false }

function useInput({ room, me, send, devices }: Props, sittingOut: boolean) {
  const [capture, setCapture] = useState<{
    track: MediaStreamTrack
    stream: MediaStream | null
    error?: string
  } | null>(null)
  const [feedback, setFeedback] = useState(blank)
  const [practice, setPractice] = useState(0)
  const latest = useRef({ room, me, send })
  const sequence = useRef(me.sequence)
  useEffect(() => {
    latest.current = { room, me, send }
    sequence.current = Math.max(sequence.current, me.sequence)
  }, [room, me, send])

  const kind = room.game === 'frenzy' ? 'video' : 'audio'
  const active = !sittingOut && (room.phase === 'setup' || (me.playing && me.finish_ms === null))
  const track = active
    ? devices.stream?.getTracks().find((t) => t.kind === kind && t.readyState === 'live')
    : undefined

  useEffect(() => {
    if (!track) return
    const control = new AbortController()
    const failed = (message: string) => {
      if (!control.signal.aborted) setCapture({ track, stream: null, error: message })
    }
    void openInput(track, control.signal, {
      ready: (stream) => setCapture({ track, stream }),
      epoch: () => latest.current.room.phase,
      failed,
      update: (sample) => {
        setFeedback(sample)
        if (!sample.hit) return
        const current = latest.current
        if (current.room.phase === 'setup') setPractice((n) => n + 1)
        if (current.room.phase === 'play' && current.me.playing && current.me.finish_ms === null)
          current.send({
            type: 'pulse',
            round_id: current.room.round_id,
            sequence: ++sequence.current,
          })
      },
    }).catch((err) => failed(err instanceof Error ? err.message : 'Device input stopped.'))
    return () => control.abort()
  }, [track])

  const current = capture && capture.track === track ? capture : null
  return { stream: current?.stream ?? null, error: current?.error, feedback, practice, track }
}

function InputPanel({
  game,
  input,
  practice,
  message: deviceMessage,
}: {
  game: PlayableGame
  input: ReturnType<typeof useInput>
  practice: boolean
  message: string
}) {
  const { t, message } = useLanguage()
  const ref = useRef<HTMLVideoElement>(null)
  const camera = game === 'frenzy'
  useEffect(() => {
    const video = ref.current
    if (video) {
      video.srcObject = input.stream
      return () => {
        video.srcObject = null
      }
    }
  }, [input.stream])
  return (
    <div className={'input-panel ' + game + (practice ? ' practice' : '')}>
      {camera && practice && <PalmGuide />}
      {camera && input.stream && (
        <div className="camera-frame">
          <video
            className="camera-preview"
            ref={ref}
            autoPlay
            muted
            playsInline
            aria-label={t('Your private camera preview')}
          />
          <span className="camera-divider" aria-hidden="true" />
        </div>
      )}
      {!camera && input.stream && (
        <div className="sound-meter" aria-label={t('Microphone level')}>
          {Array.from({ length: 19 }, (_, i) => (
            <i
              key={i}
              className={input.feedback.level * 19 > i ? 'lit' : ''}
              style={{ height: 12 + (i % 7) * 4 }}
            />
          ))}
        </div>
      )}
      <div className="device-status">
        <span>
          {message(
            input.error ||
              (input.stream
                ? practice && camera
                  ? t('Keep one hand on each side of the line.')
                  : input.feedback.hint ||
                    (camera
                      ? t('Lift one hand and lower the other.')
                      : t('Listening for short sounds…'))
                : deviceMessage),
          )}
        </span>
        {practice && input.stream && (
          <b>
            {t(camera ? '{n} practice switches' : '{n} practice jumps', { n: input.practice })}
          </b>
        )}
      </div>
    </div>
  )
}

export function GameRound(props: Props) {
  const { t } = useLanguage()
  const { room, me, send, endsAt } = props
  const [sittingOut, setSittingOut] = useState(
    () => sessionStorage.getItem('picnic-sit-out') === room.round_id,
  )
  const input = useInput(props, sittingOut)
  const info = games[room.game]
  const setup = room.phase === 'setup'
  const noDevice = props.devices.status !== 'requesting' && !input.track
  const status = sittingOut || noDevice || input.error ? 'sitting' : input.stream ? 'playing' : null
  useEffect(() => {
    if (setup && status && me.status !== status)
      send({ type: 'participation', round_id: room.round_id, status })
  }, [setup, status, me.status, room.round_id, send])
  const camera = room.game === 'frenzy'
  const deviceMessage = sittingOut
    ? t('You’re sitting out this round.')
    : noDevice
      ? t(
          camera
            ? 'Your camera is unavailable. You’ll watch this round.'
            : 'Your microphone is unavailable. You’ll watch this round.',
        )
      : t(camera ? 'Starting your camera…' : 'Starting your microphone…')
  const racers = room.players.filter((p) => p.playing)
  return (
    <section className={'panel play-panel round-panel ' + room.game}>
      {setup ? (
        <RoundBanner
          game={room.game}
          label={
            t('Warm-up') +
            ' · ' +
            t('Round {n} of {total}', { n: room.game_index + 1, total: room.playlist.length })
          }
          title={t(info.name)}
          endsAt={endsAt}
        />
      ) : (
        <>
          <div className="round-top">
            <span className="detail-meta">
              <span>
                <GameKind game={room.game} />
                {t(info.kind)}
              </span>
            </span>
            <span className="count-label">
              {t('Round')} {room.game_index + 1} / {room.playlist.length}
            </span>
          </div>
          <div className="round-heading">
            <h1>{t(info.name)}</h1>
            {endsAt !== null && <Timer endsAt={endsAt} />}
          </div>
        </>
      )}
      {setup ? (
        <>
          <p className="warmup-rules">{t(info.rules)}</p>
          <InputPanel game={room.game} input={input} practice message={deviceMessage} />
          <div className="round-participation">
            <span>
              {status === 'playing'
                ? t('You’ll play when the countdown ends.')
                : status === 'sitting'
                  ? t('You’ll watch this round.')
                  : t('Getting ready…')}
            </span>
            <button
              className="inline-link"
              onClick={() => {
                if (sittingOut) sessionStorage.removeItem('picnic-sit-out')
                else sessionStorage.setItem('picnic-sit-out', room.round_id)
                setSittingOut(!sittingOut)
              }}
              disabled={!sittingOut && status === 'sitting'}
            >
              {sittingOut ? t('Rejoin round') : t('Sit out')}
            </button>
          </div>
          <ul className="prep-list">
            {room.players.map((p) => (
              <li key={p.id}>
                <span>{p.name}</span>
                <small>
                  {!p.connected
                    ? t('Reconnecting')
                    : p.status === 'playing'
                      ? t('Ready')
                      : p.status === 'sitting'
                        ? t('Sitting out')
                        : t('Preparing')}
                </small>
              </li>
            ))}
          </ul>
        </>
      ) : room.game === 'frenzy' ? (
        <CameraWall
          room={room}
          me={me}
          stream={input.stream}
          feed={props.cameraFeed}
          hint={input.error || (input.stream ? input.feedback.hint : deviceMessage)}
        />
      ) : (
        <>
          <Suspense fallback={<div className="stage stage-race">{t('Loading the course…')}</div>}>
            <Stage mode="race" entries={racers} />
          </Suspense>
          {me.playing && (
            <div className="live-score">
              <Volume2 />
              <strong>{me.value}</strong>
              <span>{t('of 12 blocks')}</span>
            </div>
          )}
          {me.playing && me.finish_ms === null ? (
            <InputPanel input={input} game="hop" practice={false} message={deviceMessage} />
          ) : (
            <p className="wait">
              {me.finish_ms !== null
                ? t('You crossed the finish line!')
                : t('You’re watching this round.')}
            </p>
          )}
          <ul className="live-board">
            {[...racers]
              .sort((a, b) => b.value - a.value)
              .map((p) => (
                <li key={p.id}>
                  <Badge index={p.avatar} />
                  <strong>{p.name}</strong>
                  <span>
                    {p.finish_ms !== null ? <Trophy size={15} /> : null}
                    {p.value}
                    /12
                  </span>
                </li>
              ))}
          </ul>
        </>
      )}
    </section>
  )
}
