import { useLanguage } from './i18n'
import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  ArrowRight,
  Check,
  ChevronRight,
  Clock3,
  Gamepad2,
  LockKeyhole,
  LogIn,
  Plus,
  Ticket,
  UsersRound,
  Wifi,
  Zap,
} from 'lucide-react'
import { gameIds, games, isPlayableGame, type PlayableGame } from './game'
import { GameKind, Modal, PalmGuide } from './ui'
import './Landing.css'

export type Dialog = 'create' | 'join' | 'help' | PlayableGame | 'leave' | null

export function Landing({ open, darkMode }: { open: (dialog: Dialog) => void; darkMode: boolean }) {
  const { t } = useLanguage()
  const scene = darkMode ? '/art/picnic-in-the-park-night' : '/art/picnic-in-the-park'
  return (
    <main className="home" id="arcade">
      <section className="hero" aria-labelledby="hero-title">
        <div className="container hero-inner">
          <div className="hero-copy">
            <h1 id="hero-title">
              {t('Grab a seat.')} <br />
              {t('Let’s play.')}
            </h1>
            <p>
              {t('Gather your friends for quick party games. Everyone plays on their own screen.')}
            </p>
            <div className="hero-actions">
              <button className="btn primary" onClick={() => open('create')}>
                <Plus size={19} />
                {t('Create a room')}
              </button>
              <button className="btn outline" onClick={() => open('join')}>
                <Ticket size={19} />
                {t('Join with code')}
              </button>
            </div>
            <ul className="picnic-facts" aria-label={t('What you need to play')}>
              <li>
                <UsersRound size={16} />
                {t('2–6 players')}
              </li>
              <li>
                <Wifi size={16} />
                {t('Same Wi-Fi')}
              </li>
            </ul>
          </div>
          <img
            className="picnic-scene"
            src={scene + '.webp'}
            srcSet={`${scene}-small.webp 600w, ${scene}.webp 1200w`}
            sizes="(max-width: 480px) 64vw, (max-width: 700px) 310px, (max-width: 1200px) 50vw, 617px"
            width="1200"
            height="800"
            alt={t('Jam, Dill, and Toast play cards on a checkered picnic blanket.')}
            fetchPriority="high"
          />
        </div>
      </section>
      <section className="shelf container" id="games" aria-labelledby="shelf-title">
        <div className="shelf-heading">
          <h2 id="shelf-title">{t('The game shelf')}</h2>
          <p>{t('Pick a game to see how to play.')}</p>
        </div>
        <div className="game-grid">
          {gameIds.map((id) => {
            const playable = isPlayableGame(id)
            return (
              <article className={'game-card ' + id + (playable ? '' : ' unavailable')} key={id}>
                <div className="card-art">
                  <img src={games[id].art} alt="" />
                </div>
                <div className="card-body">
                  <h3>
                    <button
                      className="game-link"
                      disabled={!playable}
                      onClick={playable ? () => open(id) : undefined}
                      aria-label={
                        playable ? t('How to play {game}', { game: t(games[id].name) }) : undefined
                      }
                      aria-describedby={playable ? undefined : id + '-status'}
                    >
                      {t(games[id].name)}
                      {playable && (
                        <span aria-hidden="true">
                          <ArrowRight size={16} />
                        </span>
                      )}
                    </button>
                  </h3>
                  {playable ? (
                    <>
                      <p>{t(games[id].short)}</p>
                      <div className="card-meta">
                        <span>
                          <GameKind game={id} />
                          {t(games[id].kind)}
                        </span>
                        <span>
                          <Clock3 size={15} />
                          {t(games[id].time)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="game-status" id={id + '-status'}>
                      <LockKeyhole size={15} aria-hidden="true" /> {t('Temporarily unavailable')}
                    </p>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </main>
  )
}

export function EntryDialog({
  mode,
  initialCode,
  deviceNotice,
  enter,
  close,
}: {
  mode: 'create' | 'join'
  initialCode: string
  deviceNotice: ReactNode
  enter: (name: string, code?: string) => Promise<void>
  close: () => void
}) {
  const { t, message } = useLanguage()
  const [name, setName] = useState('')
  const [code, setCode] = useState(initialCode)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const nicknameInput = useRef<HTMLInputElement>(null)
  const joining = mode === 'join'
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await enter(name, joining ? code : undefined)
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the room.')
      setBusy(false)
    }
  }
  return (
    <Modal
      title={joining ? t('Join a room') : t('Create a room')}
      initialFocus={nicknameInput}
      close={() => {
        if (!busy) close()
      }}
    >
      <p className="dialog-intro">
        {joining
          ? t('Enter the four-character code your host shared.')
          : t('Choose a nickname. You’ll get a room code to share with your friends.')}
      </p>
      <form onSubmit={submit} className="entry-form">
        <label>
          {t('Your nickname')}
          <input
            ref={nicknameInput}
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="off"
            placeholder={t('e.g. Toast Malone')}
          />
        </label>
        {joining && (
          <label>
            {t('Room code')}
            <input
              value={code}
              className="code-input"
              required
              maxLength={4}
              minLength={4}
              pattern="[A-Z2-9]{4}"
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              placeholder="ABCD"
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))}
            />
          </label>
        )}
        {error && (
          <p className="form-error" role="alert">
            {message(error)}
          </p>
        )}
        <button
          className="btn primary full"
          disabled={busy || !name.trim() || (joining && code.length !== 4)}
        >
          {joining ? <LogIn size={18} /> : <Plus size={19} />}{' '}
          {busy ? t('Opening room…') : joining ? t('Join room') : t('Create room')}
        </button>
      </form>
      {deviceNotice}
    </Modal>
  )
}

export function HelpDialog({
  detail,
  close,
  create,
}: {
  detail: PlayableGame | 'help'
  close: () => void
  create?: () => void
}) {
  const { t } = useLanguage()
  if (detail === 'help')
    return (
      <Modal title={t('How to play')} close={close}>
        <ol className="help-list">
          <li>
            <UsersRound />
            <div>
              <b>{t('Join the same room')}</b>
              <p>
                {t(
                  'Connect to the same Wi-Fi. One person creates a room and shares the code. Everyone else selects “Join with code” on their own screen.',
                )}
              </p>
            </div>
          </li>
          <li>
            <Gamepad2 />
            <div>
              <b>{t('Get ready to play')}</b>
              <p>
                {t(
                  'Choose a character in the lobby. Once two players are ready, the host picks the games and their order. Each round gives you eight seconds to practice or sit out.',
                )}
              </p>
            </div>
          </li>
          <li>
            <Zap />
            <div>
              <b>{t('Earn party points')}</b>
              <p>
                {t(
                  'Each opponent you finish ahead of earns you one party point. Tied players share a place.',
                )}
              </p>
            </div>
          </li>
        </ol>
        <p className="help-devices">
          {t('67 Frenzy shares video with your room. Mic Hop keeps audio on your device.')}
        </p>
        <button className="btn primary full" onClick={close}>
          <Check size={18} />
          {t('Got it')}
        </button>
      </Modal>
    )
  const game = games[detail]
  return (
    <Modal title={t(game.name)} close={close}>
      <img className="detail-art" src={game.art} alt="" />
      <div className="detail-meta">
        <span>
          <GameKind game={detail} />
          {t(game.kind)}
        </span>
        <span>
          <Clock3 size={15} />
          {t(game.time)}
        </span>
      </div>
      {detail === 'frenzy' && <PalmGuide />}
      <p className="rules">{t(game.rules)}</p>
      <button className="btn primary full" onClick={create ?? close}>
        {create ? <Plus size={18} /> : <ChevronRight size={18} />}{' '}
        {create ? t('Create a room') : t('Got it')}
      </button>
    </Modal>
  )
}
