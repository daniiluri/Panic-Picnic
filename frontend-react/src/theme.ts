import { useSyncExternalStore } from 'react'

function subscribe(notify: () => void) {
  const observer = new MutationObserver(notify)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}

export function useDarkMode() {
  return useSyncExternalStore(subscribe, () => document.documentElement.dataset.theme === 'dark')
}

export function toggleDarkMode() {
  document.dispatchEvent(new Event('picnic-theme-toggle'))
}
