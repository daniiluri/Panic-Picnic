import { useLanguage } from './i18n'
import { useEffect, useState } from 'react'
import {
  CircleHelp,
  Gamepad2,
  LogOut,
  Moon,
  Radio,
  ShieldCheck,
  Sun,
  Video,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { EntryDialog, HelpDialog, Landing, type Dialog } from './Landing'
import { GameRound } from './GameRound'
import { Lobby, Playlist, Results } from './RoomPanels'
import { Basket, Modal } from './ui'
import { chime, unlockSound } from './sound'
import { useRoom } from './useRoom'
import { useDevices } from './useDevices'
import { toggleDarkMode, useDarkMode } from './theme'
import './App.css'

export default function App() {
  const { t, message, language, setLanguage } = useLanguage()
  const darkMode = useDarkMode()
  const { devices, request, release } = useDevices()
  const client = useRoom(release)
  const { room, seat, connected, send } = client
  const [invitedCode] = useState(
    () => new URLSearchParams(location.search).get('room')?.toUpperCase().slice(0, 4) ?? '',
  )
  const [dialog, setDialog] = useState<Dialog>(() => (!seat && invitedCode ? 'join' : null))
  const [sound, setSound] = useState(() => localStorage.getItem('picnic-sound') !== 'off')
  const phase = room?.phase
  useEffect(() => {
    if (phase) window.scrollTo(0, 0)
  }, [phase])
  useEffect(() => {
    if (
      sound &&
      (phase === 'results' || phase === 'podium' || phase === 'setup') &&
      !(phase === 'setup' && room?.game === 'hop')
    )
      chime(phase === 'podium')
  }, [phase, sound, room?.game])
  function open(next: Dialog) {
    if ((next === 'join' || next === 'create') && devices.status === 'released') void request()
    setDialog(next)
  }
  const me = room?.players.find((p) => p.id === seat?.player_id)
  const inRoom = !!seat
  const close = () => setDialog(null)
  const deviceNotice = (
    <div className="device-notice">
      <Video size={17} aria-hidden="true" />
      <span role="status">{message(devices.message)}</span>
      {devices.status === 'unavailable' && (
        <button className="inline-link" onClick={request}>
          {t('Check device access')}
        </button>
      )}
    </div>
  )
  return (
    <div className="app-shell" onClickCapture={unlockSound} onKeyDownCapture={unlockSound}>
      <a className="skip-link" href="#main-content">
        {t('Skip to content')}
      </a>
      <header className="site-head">
        <div className="container nav-inner">
          <button
            className="brand"
            aria-label={t('Panic Picnic home')}
            onClick={() => {
              if (inRoom) open('leave')
              else window.scrollTo(0, 0)
            }}
          >
            <Basket />
            <span>Panic Picnic</span>
          </button>
          <nav aria-label={t('Main')}>
            <a
              className="nav-item"
              href={inRoom ? '#main-content' : '#games'}
              aria-label={inRoom ? t('Party room') : t('Game shelf')}
            >
              <Gamepad2 size={18} />
              <span>{inRoom ? t('Party room') : t('Game shelf')}</span>
            </a>
            <button className="nav-item" aria-label={t('How to play')} onClick={() => open('help')}>
              <CircleHelp size={17} />
              <span>{t('How to play')}</span>
            </button>
          </nav>
          <div className="nav-end">
            <button
              className="theme-toggle"
              aria-label={t('Dark mode')}
              aria-pressed={darkMode}
              title={darkMode ? t('Use light theme') : t('Use dark theme')}
              onClick={toggleDarkMode}
            >
              {darkMode ? <Sun size={19} /> : <Moon size={18} />}
            </button>
            <select
              className="language-select"
              aria-label="Language / Язык"
              title="English / Русский"
              value={language}
              onChange={(event) => setLanguage(event.target.value === 'ru' ? 'ru' : 'en')}
            >
              <option value="en" lang="en">
                EN
              </option>
              <option value="ru" lang="ru">
                RU
              </option>
            </select>
            <button
              className="sound-toggle"
              aria-label={t('Game sounds')}
              title={sound ? t('Mute game sounds') : t('Enable game sounds')}
              aria-pressed={sound}
              onClick={() => {
                const next = !sound
                setSound(next)
                localStorage.setItem('picnic-sound', next ? 'on' : 'off')
                if (next) {
                  unlockSound()
                  chime()
                }
              }}
            >
              {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
              <span>{sound ? t('Sound on') : t('Sound off')}</span>
            </button>
          </div>
        </div>
      </header>
      <div id="main-content" tabIndex={-1}>
        {client.error && (
          <div className="alert container" role="alert">
            {message(client.error)}
            <button
              className="icon-btn"
              aria-label={t('Dismiss error')}
              onClick={client.dismissError}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {!inRoom ? (
          <Landing open={open} darkMode={darkMode} />
        ) : (
          <main className="container room-main">
            <div className="room-strip">
              <span>
                <Radio size={17} />
                <b>{t('Room {code}', { code: seat.code })}</b>
                <span className={'connection ' + (connected ? 'online' : '')}>
                  {connected ? t('Connected') : t('Reconnecting…')}
                </span>
              </span>
              <button className="inline-link" onClick={() => open('leave')}>
                <LogOut size={16} />
                {t('Leave room')}
              </button>
            </div>
            {room && me ? (
              <fieldset className="room-content" disabled={!connected}>
                {phase === 'lobby' ? (
                  <Lobby room={room} me={me} send={send} />
                ) : phase === 'playlist' ? (
                  <Playlist room={room} me={me} send={send} />
                ) : phase === 'results' || phase === 'podium' ? (
                  <Results room={room} me={me} send={send} endsAt={client.endsAt} />
                ) : !connected ? (
                  <section className="panel play-panel">
                    <h1>{t('Reconnecting…')}</h1>
                    <p>{t('We’ll restore your round when the connection returns.')}</p>
                  </section>
                ) : (
                  <GameRound
                    key={room.round_id}
                    room={room}
                    me={me}
                    send={send}
                    endsAt={client.endsAt}
                    devices={devices}
                    cameraFeed={client.cameraFeed}
                  />
                )}
              </fieldset>
            ) : (
              <section className="panel play-panel">
                <h1>{t('Opening the room…')}</h1>
                <p>{t('Your seat is reserved while the connection opens.')}</p>
              </section>
            )}
          </main>
        )}
      </div>
      <footer className="site-footer">
        <div className="container footer-inner">
          <div className="privacy-note">
            <ShieldCheck size={21} aria-hidden="true" />
            <div>
              <h2>{t('Camera & microphone')}</h2>
              <p>
                {t(
                  '67 Frenzy shares video with your room. Mic Hop keeps audio on your device.',
                )}
              </p>
            </div>
          </div>
          {(!inRoom || phase === 'lobby') && deviceNotice}
        </div>
      </footer>
      {(dialog === 'create' || dialog === 'join') && (
        <EntryDialog
          key={dialog}
          mode={dialog}
          initialCode={invitedCode}
          deviceNotice={deviceNotice}
          enter={client.enter}
          close={close}
        />
      )}
      {(dialog === 'help' || dialog === 'frenzy' || dialog === 'hop') && (
        <HelpDialog
          detail={dialog}
          close={close}
          create={!inRoom && dialog !== 'help' ? () => open('create') : undefined}
        />
      )}
      {dialog === 'leave' && (
        <Modal title={t('Leave this picnic?')} close={close}>
          <p className="dialog-intro">
            {t('Your seat and points will be released. The other players can keep playing.')}
          </p>
          <div className="prep-actions">
            <button className="btn ghost" onClick={close}>
              {t('Stay here')}
            </button>
            <button
              className="btn primary"
              onClick={() => {
                client.leave()
                close()
              }}
            >
              {t('Leave room')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
