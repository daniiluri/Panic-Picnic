import { useLanguage } from './i18n'
import { lazy, Suspense } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  Crown,
  Flag,
  LockKeyhole,
  Play,
  RotateCcw,
  Trophy,
} from 'lucide-react'
import {
  avatars,
  games,
  gameIds,
  isPlayableGame,
  playableGameIds,
  type PlayableGame,
  type Player,
  type Room,
  type Send,
} from './game'
import { Badge, CopyInvite, RoundBanner, Timer } from './ui'

const Stage = lazy(() => import('./Stage'))

type Props = { room: Room; me: Player; send: Send }
function Name({ p, me, host }: { p: Player; me: string; host: string }) {
  const { t } = useLanguage()
  return (
    <span className="player-name">
      {p.name}
      {p.id === me && <small>{t('you')}</small>}
      {p.id === host && <Crown size={15} aria-label={t('Host')} />}
    </span>
  )
}
export function Lobby({ room, me, send }: Props) {
  const { t, message } = useLanguage()
  const ready = room.players.filter((p) => p.ready && p.connected).length
  const host = room.host === me.id
  return (
    <div className="room-grid">
      <section className="panel invite-panel">
        <h1>{t('Your picnic room')}</h1>
        <p>{t('Share this code with friends on the same Wi-Fi.')}</p>
        <div
          className="room-code"
          role="group"
          aria-label={t('Room code {code}', { code: room.code })}
        >
          {room.code.split('').map((c, i) => (
            <span key={i} aria-hidden="true">
              {c}
            </span>
          ))}
        </div>
        <CopyInvite code={room.code} />
      </section>
      <section className="panel">
        <div className="section-head">
          <h2>{t('Who’s in?')}</h2>
          <span className="count-label">{room.players.length}/6</span>
        </div>
        <ul className="players">
          {room.players.map((p) => (
            <li key={p.id}>
              <Badge index={p.avatar} />
              <Name p={p} me={me.id} host={room.host} />
              <span className={'status ' + (p.ready && p.connected ? 'ok' : '')}>
                {!p.connected ? t('Reconnecting') : p.ready ? t('Ready') : t('Getting ready')}
              </span>
            </li>
          ))}
        </ul>
        <section className="pick-avatar">
          <div>
            <Suspense
              fallback={<div className="stage stage-avatar">{t('Loading character…')}</div>}
            >
              <Stage mode="avatar" entries={[me]} />
            </Suspense>
            <b>{message(avatars[me.avatar].name)}</b>
          </div>
          <div>
            <h2>{t('Pick your character')}</h2>
            <div className="avatar-options">
              {avatars.map((a, i) => (
                <button
                  key={a.name}
                  title={message(a.name)}
                  aria-label={t('Choose {name}', { name: message(a.name) })}
                  aria-pressed={me.avatar === i}
                  onClick={() => send({ type: 'avatar', index: i })}
                >
                  <Badge index={i} />
                </button>
              ))}
            </div>
          </div>
        </section>
        <div className="panel-action">
          {host ? (
            <>
              <button
                className="btn primary full"
                disabled={ready < 2}
                onClick={() => send({ type: 'start' })}
              >
                <Play size={18} fill="currentColor" />
                {t('Start match')}
              </button>
              <p className="helper">
                {ready < 2
                  ? t('Waiting for two ready players.')
                  : t('Choose the game lineup next.')}
              </p>
            </>
          ) : (
            <>
              <button
                className={'btn full ' + (me.ready ? 'ghost' : 'primary')}
                onClick={() => send({ type: 'ready', value: !me.ready })}
              >
                <Check size={18} />
                {me.ready ? t('Undo ready') : t('I’m ready')}
              </button>
              <p className="helper">{t('The host starts the match.')}</p>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
export function Playlist({ room, me, send }: Props) {
  const { t } = useLanguage()
  const host = room.host === me.id
  const order = [
    ...room.playlist,
    ...playableGameIds.filter((id) => !room.playlist.includes(id)),
    ...gameIds.filter((id) => !isPlayableGame(id)),
  ]
  function update(list: PlayableGame[]) {
    send({ type: 'playlist', games: list })
  }
  function move(index: number, step: number) {
    const list = [...room.playlist]
    ;[list[index], list[index + step]] = [list[index + step], list[index]]
    update(list)
  }
  return (
    <section className="panel play-panel">
      <h1>{t('Pick the lineup')}</h1>
      <p>
        {host
          ? t('Choose your games and put them in play order.')
          : t('The host is putting your games in play order.')}
      </p>
      <div className="playlist">
        {order.map((id) => {
          const playable = isPlayableGame(id)
          const idx = playable ? room.playlist.indexOf(id) : -1
          return (
            <div className={'lineup-row ' + (idx < 0 ? 'off' : '')} key={id}>
              <button
                className="lineup-toggle"
                aria-label={
                  playable
                    ? t(idx < 0 ? 'Add {game}' : 'Remove {game}', {
                        game: t(games[id].name),
                      })
                    : undefined
                }
                aria-pressed={idx >= 0}
                disabled={!playable || !host || (idx >= 0 && room.playlist.length === 1)}
                onClick={
                  playable
                    ? () =>
                        update(
                          idx < 0 ? [...room.playlist, id] : room.playlist.filter((x) => x !== id),
                        )
                    : undefined
                }
              >
                <span className="check-box" aria-hidden="true">
                  {!playable ? <LockKeyhole size={14} /> : idx >= 0 && <Check size={17} />}
                </span>
                <img src={games[id].art} alt="" />
                <span>
                  <strong>{t(games[id].name)}</strong>
                  <small>
                    {playable ? (
                      <>
                        {idx >= 0 ? t('Round {n}', { n: idx + 1 }) : t('Out of lineup')} ·{' '}
                        {t(games[id].time)}
                      </>
                    ) : (
                      t('Temporarily unavailable')
                    )}
                  </small>
                </span>
              </button>
              {host && idx >= 0 && (
                <div className="reorder">
                  <button
                    className="icon-btn"
                    aria-label={t('Move {game} earlier', { game: t(games[id].name) })}
                    disabled={idx === 0}
                    onClick={() => move(idx, -1)}
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    className="icon-btn"
                    aria-label={t('Move {game} later', { game: t(games[id].name) })}
                    disabled={idx === room.playlist.length - 1}
                    onClick={() => move(idx, 1)}
                  >
                    <ArrowDown size={16} />
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {host ? (
        <button className="btn primary full" onClick={() => send({ type: 'launch' })}>
          <Flag size={19} />
          {t('Launch lineup')}
        </button>
      ) : (
        <p className="wait">{t('Waiting for the host to launch…')}</p>
      )}
    </section>
  )
}

function metric(room: Room, p: Player, { t, count, language }: ReturnType<typeof useLanguage>) {
  if (room.game === 'hop')
    return p.finish_ms !== null
      ? (p.finish_ms / 1000).toLocaleString(language, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }) +
          ' ' +
          t('s')
      : t('{n}/12 blocks', { n: p.value })
  return count(p.value, 'switch')
}
export function Results({ room, me, send, endsAt }: Props & { endsAt: number | null }) {
  const locale = useLanguage()
  const { t, count } = locale
  const podium = room.phase === 'podium'
  const next = room.playlist[room.game_index + 1]
  const key = (p: Player) =>
    podium ? p.points : p.finish_ms !== null ? 1000000 - p.finish_ms : p.value
  const players = room.players.filter((p) => podium || p.playing).sort((a, b) => key(b) - key(a))
  const champions = players.filter((p) => key(p) === key(players[0]))
  return (
    <section className="panel play-panel results-panel">
      <RoundBanner
        game={podium ? undefined : room.game}
        label={
          podium
            ? t('Final standings')
            : t(games[room.game].name) +
              ' · ' +
              t('Round {n} of {total}', { n: room.game_index + 1, total: room.playlist.length })
        }
        title={
          podium ? t('The picnic podium') : room.skipped ? t('Round skipped') : t('Round results')
        }
      />
      {podium && champions.length > 0 && (
        <p className="winner-caption">
          <Trophy size={20} />
          <strong>
            {champions.length === 1
              ? t('{name} wins the picnic!', { name: champions[0].name })
              : t('{names} share the win!', {
                  names: new Intl.ListFormat(locale.language).format(champions.map((p) => p.name)),
                })}
          </strong>
        </p>
      )}
      {players.length > 0 && (
        <ol className="ranking">
          {players.map((p) => (
            <li key={p.id} className={key(p) === key(players[0]) ? 'first-place' : ''}>
              <strong className="place">
                #{players.findIndex((other) => key(other) === key(p)) + 1}
              </strong>
              <Badge index={p.avatar} />
              <div className="ranking-name">
                <Name p={p} me={me.id} host={room.host} />
                {!podium && (
                  <small>
                    {metric(room, p, locale)} · {t('{n} total', { n: p.points })}
                  </small>
                )}
              </div>
              <strong className="points">
                {podium ? '' : '+'}
                {count(podium ? p.points : p.award, 'pt')}
              </strong>
            </li>
          ))}
        </ol>
      )}
      {room.skipped && !podium && <p>{t('Fewer than two players could play this round.')}</p>}
      {!podium ? (
        <div className={`up-next ${next ?? 'podium-banner'}`}>
          {next ? <img src={games[next].art} alt="" /> : <Trophy size={32} />}
          <div>
            <small>{next ? t('Up next') : t('Final standings')}</small>
            <h2>{next ? t(games[next].name) : t('The picnic podium')}</h2>
          </div>
          <Timer endsAt={endsAt} />
        </div>
      ) : room.host === me.id ? (
        <button className="btn primary full" onClick={() => send({ type: 'rematch' })}>
          <RotateCcw size={18} /> {t('Play again')}
        </button>
      ) : (
        <p className="wait">{t('The host can start a rematch.')}</p>
      )}
    </section>
  )
}
