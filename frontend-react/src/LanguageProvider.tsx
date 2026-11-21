import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { LanguageContext, translator, type Language } from './i18n'

function initialLanguage(): Language {
  const saved = localStorage.getItem('picnic-language')
  if (saved === 'ru' || saved === 'en') return saved
  for (const tag of navigator.languages) {
    const language = tag.split('-')[0].toLowerCase()
    if (language === 'ru' || language === 'en') return language
  }
  return 'en'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState(initialLanguage)
  const context = useMemo(() => ({ ...translator(language), setLanguage }), [language])
  useEffect(() => {
    document.documentElement.lang = language
    document.title = 'Panic Picnic · ' + context.t('Party Arcade')
    localStorage.setItem('picnic-language', language)
  }, [context, language])
  return <LanguageContext.Provider value={context}>{children}</LanguageContext.Provider>
}
