/** Two settings worth remembering between visits: appearance and language. */

export type Theme = 'system' | 'light' | 'dark'
export type Lang = 'en' | 'id'

const KEY = { theme: 'convert.in:theme', lang: 'convert.in:lang' }

/** Storage throws in private windows and in some embedded viewers. Never let that break the page. */
function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // A remembered preference is a convenience, not something to fail over.
  }
}

export function loadTheme(): Theme {
  const stored = read(KEY.theme)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

export function saveTheme(theme: Theme): void {
  write(KEY.theme, theme)
}

export function loadLang(): Lang {
  const stored = read(KEY.lang)
  if (stored === 'en' || stored === 'id') return stored
  // Fall back to the browser's own preference before assuming English.
  return navigator.languages.some((tag) => tag.toLowerCase().startsWith('id')) ? 'id' : 'en'
}

export function saveLang(lang: Lang): void {
  write(KEY.lang, lang)
}

/**
 * The theme lives on <html> so CSS can answer it without React, which keeps the
 * light and dark palettes in one place instead of scattered across components.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}
