/** The one setting worth remembering between visits. */

export type Lang = 'en' | 'id'

const KEY = { lang: 'convert.in:lang' }

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

export function loadLang(): Lang {
  const stored = read(KEY.lang)
  if (stored === 'en' || stored === 'id') return stored
  // Fall back to the browser's own preference before assuming English. This
  // runs while the first render is being set up, so an environment without
  // navigator.languages has to give a language rather than a blank page.
  const offered = navigator.languages ?? [navigator.language]
  return offered.some((tag) => tag?.toLowerCase().startsWith('id')) ? 'id' : 'en'
}

export function saveLang(lang: Lang): void {
  write(KEY.lang, lang)
}
