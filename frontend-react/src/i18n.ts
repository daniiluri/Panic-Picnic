import { createContext, useContext } from 'react'
import { russian } from './translations'

export type Language = 'en' | 'ru'
type Message = keyof typeof russian
type Values = Record<string, string | number>
const plurals = {
  switch: ['смена', 'смены', 'смен'],
  like: ['лайк', 'лайка', 'лайков'],
  pt: ['очко', 'очка', 'очков'],
} as const
const ruPlural = new Intl.PluralRules('ru')

export function translator(language: Language) {
  function t(key: Message, values?: Values) {
    const template = language === 'ru' ? russian[key] : key
    if (!values) return template
    return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name]))
  }

  // Device and server messages arrive independently of the selected UI language.
  function message(source: string) {
    return Object.hasOwn(russian, source) ? t(source as Message) : source
  }

  function count(value: number, noun: keyof typeof plurals) {
    if (language === 'en') {
      const suffix = value === 1 ? '' : noun === 'switch' ? 'es' : 's'
      return value + ' ' + noun + suffix
    }
    const form = ruPlural.select(value)
    return value + ' ' + plurals[noun][form === 'one' ? 0 : form === 'few' ? 1 : 2]
  }

  return { language, t, message, count }
}

export const LanguageContext = createContext<
  | (ReturnType<typeof translator> & {
      setLanguage: (language: Language) => void
    })
  | null
>(null)

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) throw new Error('LanguageProvider is missing.')
  return context
}
