import { useLanguage } from './i18n'
import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { Camera, Check, CircleHelp, Mic, X, Copy, Theater } from 'lucide-react'
import { avatars, games, type Game } from './game'

const gameIcons = { frenzy: Camera, quiz: CircleHelp, hop: Mic, comedy: Theater }
export function GameKind({ game }: { game: Game }) {
  const Icon = gameIcons[game]
  return <Icon size={15} strokeWidth={2.6} aria-hidden="true" />
}
export function PalmGuide() {
  const { t } = useLanguage()
  return (
    <div className="gesture-guide">
      <div className="palm-demo" aria-hidden="true">
        <span className="gesture-hand">
          <i>🫴</i>
        </span>
        <span className="gesture-hand">
          <i>🫴</i>
        </span>
      </div>
      <div>
        <strong>{t('Palms up. Switch!')}</strong>
        <small>{t('One hand rises as the other drops.')}</small>
      </div>
    </div>
  )
}
export function Basket() {
  return (
    <span className="basket" aria-hidden="true">
      <i />
      <b />
      <em />
    </span>
  )
}
export function Badge({ index }: { index: number }) {
  const { message } = useLanguage()
  const avatar = avatars[index]
  return (
    <span
      className="avatar-badge"
      style={{ background: avatar.color }}
      aria-label={message(avatar.name)}
    >
      {avatar.symbol}
    </span>
  )
}
export function Modal({
  title,
  children,
  close,
  initialFocus,
}: {
  title: string
  children: ReactNode
  close: () => void
  initialFocus?: RefObject<HTMLElement | null>
}) {
  const { t } = useLanguage()
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => {
    const dialog = ref.current!
    const previous = document.activeElement
    dialog.showModal()
    initialFocus?.current?.focus()
    return () => {
      dialog.close()
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [initialFocus])
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
      onClick={(e) => {
        if (e.target === ref.current) {
          const b = ref.current!.getBoundingClientRect()
          if (
            e.clientX < b.left ||
            e.clientX > b.right ||
            e.clientY < b.top ||
            e.clientY > b.bottom
          )
            close()
        }
      }}
    >
      <div className="dialog-heading">
        <h2 id={id}>{title}</h2>
        <button className="icon-btn" aria-label={t('Close dialog')} onClick={close}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  )
}
export function CopyInvite({ code }: { code: string }) {
  const { t } = useLanguage()
  const [copied, setCopied] = useState<'idle' | 'copied' | 'manual'>('idle')
  async function copy() {
    try {
      await navigator.clipboard.writeText(new URL('/?room=' + code, location.href).href)
      setCopied('copied')
    } catch {
      setCopied('manual')
    }
  }
  return (
    <button className="btn ghost compact" onClick={copy}>
      {copied === 'copied' ? <Check size={16} /> : <Copy size={16} />}
      <span aria-live="polite">
        {copied === 'manual'
          ? t('Share the room code {code}', { code })
          : copied === 'copied'
            ? t('Link copied')
            : t('Copy invite link')}
      </span>
    </button>
  )
}
export function Timer({ endsAt }: { endsAt: number | null }) {
  const { t } = useLanguage()
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    const tick = () => setNow(performance.now())
    tick()
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
  }, [endsAt])
  return (
    <span className="timer">
      {endsAt === null ? '—' : Math.max(0, Math.ceil((endsAt - now) / 1000))}
      <small>{t('s')}</small>
    </span>
  )
}

export function RoundBanner({
  game,
  label,
  title,
  endsAt,
}: {
  game?: Game
  label: string
  title: string
  endsAt?: number | null
}) {
  const { t } = useLanguage()
  return (
    <header className={`round-banner ${game ?? 'podium-banner'}`}>
      <div className="banner-copy">
        <span className="banner-label">{label}</span>
        <h1>{title}</h1>
        {endsAt != null && (
          <div className="banner-clock">
            {t('Starts in')} <Timer endsAt={endsAt} />
          </div>
        )}
      </div>
      <img src={game ? games[game].art : '/art/party-crew.webp'} alt="" />
    </header>
  )
}
