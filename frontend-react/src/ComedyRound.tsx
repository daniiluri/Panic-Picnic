import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { Heart, Mic, MicOff, StepForward, Volume2, VolumeX } from 'lucide-react'
import { games, type ComedySet, type Player, type Room, type Send } from './game'
import { useLanguage } from './i18n'
import { unlockSound } from './sound'
import { openStageMic, type StageVoice } from './stageVoice'
import { RoundBanner, Timer } from './ui'
import type { Devices } from './useDevices'
import './ComedyRound.css'

type Props = {
  room: Room
  me: Player
  send: Send
  endsAt: number | null
  devices: Devices
  voice: StageVoice
}

function Theater({
  set,
  performer,
  viewers,
}: {
  set: ComedySet
  performer: Player
  viewers: Player[]
}) {
  const { t } = useLanguage()
  // A restored seat should show the current stage without replaying old throws.
  const [initial] = useState(() => ({ reactions: set.reactions, barrage: set.barrage }))
  const places = [1, 3, 0, 4, 2]
  const cast = (avatar: number) => ({ '--portrait': avatar * 20 + '%' }) as CSSProperties
  return (
    <div
      className="comedy-theater"
      role="img"
      aria-label={t('{name} on the podium, facing the audience.', { name: performer.name })}
      data-barrage={set.barrage}
    >
      <span className="cast-sprite comedian" style={cast(performer.avatar)} />
      {Array.from({ length: 5 }, (_, slot) => {
        const viewer = viewers[places.indexOf(slot)]
        const x = 12 + slot * 19
        const reaction = viewer && set.reactions[viewer.id]
        const fresh = reaction && !initial.reactions[viewer.id]
        const volley = viewer && set.barrage && !initial.barrage
        const style = {
          '--seat': x + '%',
          '--arc': (x + 50) / 2 + '%',
          '--delay': (slot % 3) * 110 + 'ms',
        } as CSSProperties
        return (
          <div key={viewer?.id ?? slot} style={style} aria-hidden="true">
            <div className={'club-seat' + (volley ? ' joins-volley' : '')}>
              {viewer && <span className="cast-sprite spectator" style={cast(viewer.avatar)} />}
              {(volley || (fresh && reaction === 'tomato')) && <i className="throwing-arm" />}
              <i className="chair-back" />
            </div>
            {fresh && reaction === 'like' && <span className="rising-heart">♥</span>}
            {fresh && reaction === 'tomato' && <span className="flying-tomato">🍅</span>}
            {volley && <span className="flying-tomato volley-tomato">🍅</span>}
          </div>
        )
      })}
      {set.barrage && <span className="volley-sign">{t('Tomato volley!')}</span>}
    </div>
  )
}

function StageMic({
  track,
  voice,
  round,
  turn,
}: {
  track: MediaStreamTrack
  voice: StageVoice
  round: string
  turn: number
}) {
  const { t } = useLanguage()
  const [status, setStatus] = useState<'off' | 'opening' | 'live' | 'error'>('off')
  const capture = useRef<AbortController | null>(null)
  useEffect(() => {
    function closeMic() {
      capture.current?.abort()
      capture.current = null
      setStatus('off')
    }
    window.addEventListener('pagehide', closeMic)
    return () => {
      window.removeEventListener('pagehide', closeMic)
      capture.current?.abort()
    }
  }, [])
  async function toggle() {
    if (capture.current) {
      capture.current.abort()
      capture.current = null
      setStatus('off')
      return
    }
    const control = new AbortController()
    capture.current = control
    setStatus('opening')
    try {
      await openStageMic(unlockSound(), track, control.signal, (pcm) =>
        voice.publish(round, turn, pcm),
      )
      if (!control.signal.aborted) setStatus('live')
    } catch {
      if (control.signal.aborted) return
      control.abort()
      capture.current = null
      setStatus('error')
    }
  }
  return (
    <div className="stage-mic">
      <button className="btn ghost compact" disabled={status === 'opening'} onClick={toggle}>
        {status === 'live' ? <MicOff size={16} /> : <Mic size={16} />}
        {t(
          status === 'live'
            ? 'Mute stage mic'
            : status === 'opening'
              ? 'Opening microphone…'
              : 'Open stage mic',
        )}
      </button>
      <small role="status">
        {t(
          status === 'live'
            ? 'Your stage mic is live.'
            : status === 'error'
              ? 'The stage mic could not start. Check microphone access.'
              : 'Open the stage mic to share your voice with this room.',
        )}
      </small>
    </div>
  )
}

function ComedyTurn({
  room,
  me,
  send,
  endsAt,
  devices,
  voice,
  set,
  performer,
  audio,
  toggleAudio,
}: Props & {
  set: ComedySet
  performer: Player
  audio: AudioContext | null
  toggleAudio: () => void
}) {
  const { t } = useLanguage()
  const [draft, setDraft] = useState('')
  const onStage = performer.id === me.id
  const viewers = room.players.filter((p) => p.id !== performer.id && p.connected)
  const votes = Object.values(set.reactions)
  const tomatoes = votes.filter((r) => r === 'tomato').length
  const choice = set.reactions[me.id]
  const track = devices.stream?.getAudioTracks().find((item) => item.readyState === 'live')
  const round = room.round_id
  const turn = set.turn
  useEffect(() => {
    if (!onStage && audio) return voice.listen(round, turn, audio)
  }, [onStage, audio, voice, round, turn])
  function post(e: FormEvent) {
    e.preventDefault()
    if (draft.trim() && !set.joke) send({ type: 'joke', round_id: round, turn, text: draft.trim() })
  }
  return (
    <section className="panel play-panel comedy-panel comedy">
      <div className="round-top">
        <span className="count-label">
          {t('Set {turn} of {total}', { turn, total: set.turns })}
        </span>
        <Timer endsAt={endsAt} />
      </div>
      <div className="club-heading">
        <h1>{t('Picnic Open Mic')}</h1>
        <p>
          {t(onStage ? 'It’s your turn, {name}.' : '{name} has the mic.', { name: performer.name })}
        </p>
      </div>
      <Theater set={set} performer={performer} viewers={viewers} />
      {set.joke && <blockquote className="stage-joke">{set.joke}</blockquote>}
      <div className="reaction-score" aria-live="polite">
        <span>
          <Heart size={16} />
          {t('Likes')} <b>{votes.length - tomatoes}</b>
        </span>
        <span>
          <i aria-hidden="true">🍅</i>
          {t(set.barrage ? 'Tomatoes' : 'Tomatoes for a volley')}{' '}
          <b>{set.barrage ? tomatoes : `${tomatoes}/${set.tomato_threshold}`}</b>
        </span>
        {set.barrage && <span className="volley-status">{t('Tomato volley!')}</span>}
      </div>
      {onStage ? (
        <div className="comedy-controls">
          {!set.joke && (
            <form className="joke-form" onSubmit={post}>
              <label htmlFor="stage-joke">{t('Your joke')}</label>
              <textarea
                id="stage-joke"
                value={draft}
                maxLength={240}
                rows={2}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button className="btn primary compact" disabled={!draft.trim()}>
                {t('Post joke')}
              </button>
            </form>
          )}
          {track ? (
            <StageMic key={track.id} track={track} round={round} turn={turn} voice={voice} />
          ) : !set.joke && (
            <p>{t('You can post a joke or tell it in person.')}</p>
          )}
          <button
            className="inline-link"
            onClick={() => send({ type: 'end_set', round_id: round, turn })}
          >
            <StepForward size={16} />
            {t('Pass the mic')}
          </button>
        </div>
      ) : (
        <div className="comedy-controls">
          <p role="status">
            {t(
              choice === 'like'
                ? 'You liked this set.'
                : choice === 'tomato'
                  ? 'You threw a tomato.'
                  : 'Choose one reaction for this performer.',
            )}
          </p>
          <div className="crowd-buttons">
            <button
              className="btn primary"
              disabled={!!choice}
              aria-pressed={choice === 'like'}
              onClick={() => send({ type: 'react', round_id: round, turn, reaction: 'like' })}
            >
              <Heart size={18} />
              {t('Like this set')}
            </button>
            <button
              className="btn tomato-btn"
              disabled={!!choice}
              aria-pressed={choice === 'tomato'}
              onClick={() => send({ type: 'react', round_id: round, turn, reaction: 'tomato' })}
            >
              <span aria-hidden="true">🍅</span>
              {t('Throw a tomato')}
            </button>
          </div>
          <button className="inline-link" onClick={toggleAudio}>
            {audio ? <VolumeX size={16} /> : <Volume2 size={16} />}
            {t(audio ? 'Mute stage audio' : 'Listen to stage mic')}
          </button>
        </div>
      )}
    </section>
  )
}

export function ComedyRound(props: Props) {
  const { room, me, send, endsAt } = props
  const { t } = useLanguage()
  const [audio, setAudio] = useState<AudioContext | null>(null)
  const [sitting, setSitting] = useState(
    () => sessionStorage.getItem('picnic-sit-out') === room.round_id,
  )
  const status = sitting ? 'sitting' : 'playing'
  useEffect(() => {
    if (room.phase === 'setup' && me.status !== status)
      send({ type: 'participation', round_id: room.round_id, status })
  }, [room.phase, room.round_id, me.status, send, status])
  if (room.comedy) {
    const performer = room.players.find((p) => p.id === room.comedy!.performer_id)
    if (!performer) throw new Error('Active performer is missing from the room')
    return (
      <ComedyTurn
        key={room.comedy.turn}
        {...props}
        set={room.comedy}
        performer={performer}
        audio={audio}
        toggleAudio={() => setAudio(audio ? null : unlockSound())}
      />
    )
  }
  return (
    <section className="panel play-panel comedy">
      <RoundBanner
        game="comedy"
        title={t('Picnic Open Mic')}
        label={t('Warm-up')}
        endsAt={endsAt}
      />
      <p className="warmup-rules">{t(games.comedy.rules)}</p>
      <div className="round-participation">
        <span>{t(sitting ? 'You can react from your seat.' : 'You have a turn on stage.')}</span>
        <button
          className="inline-link"
          onClick={() => {
            if (sitting) sessionStorage.removeItem('picnic-sit-out')
            else sessionStorage.setItem('picnic-sit-out', room.round_id)
            setSitting(!sitting)
          }}
        >
          {t(sitting ? 'Join the performers' : 'Take an audience seat')}
        </button>
      </div>
    </section>
  )
}
