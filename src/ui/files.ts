import { useRef } from 'react'
import { explain } from '../core/pdf-security.ts'

/**
 * Run something at most once at a time, however many times the button is
 * pressed.
 *
 * A click reaches its handler before React has re-rendered the button that
 * disabled itself, so two clicks inside one frame, which is what a double click
 * is, both get through. For anything that hands files over that means being
 * asked to save the same set twice: measured at four saves from one double
 * click on "Download 2", and it scales with the count on the button.
 *
 * A ref answers now rather than at the next render, which is the whole point of
 * using one here.
 */
export function useOnce(): (job: () => Promise<void>) => Promise<void> {
  const running = useRef(false)
  return async (job) => {
    if (running.current) return
    running.current = true
    try {
      await job()
    } finally {
      running.current = false
    }
  }
}

/**
 * Names come from whatever the dropped file was called, which can carry path
 * separators, control characters or a leading dot. Browsers mostly sanitise the
 * download attribute themselves, but the safe name is cheap to build and does
 * not depend on which browser is asking.
 */
function safeName(name: string): string {
  const cleaned = name
    .replace(/[/\\]/g, '-')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    // Trimmed before the leading dots are taken off, not after: " .bashrc"
    // survived the other order, because the dot was no longer at the front.
    .trim()
    .replace(/^\.+/, '')
  return cleaned === '' ? 'convert.in.pdf' : cleaned.slice(0, 200)
}

/** Hand a blob to the browser's downloader. */
export function save(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = safeName(name)
  link.click()
  // Revoking straight away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/**
 * Save several files one after another. Browsers throttle rapid-fire downloads
 * and ask once for permission, so they are spaced out rather than fired at once.
 */
export async function saveAll(files: { blob: Blob; name: string }[]): Promise<void> {
  // A zip would be one file instead of a permission prompt, but that means a new
  // dependency for something most people do a handful of times a week.
  for (const [index, file] of files.entries()) {
    save(file.blob, file.name)
    if (index < files.length - 1) await new Promise((done) => setTimeout(done, 180))
  }
}

/** "holiday photos.HEIC" -> "holiday photos" */
export function stem(name: string): string {
  return name.replace(/\.[^./\\]+$/, '') || name
}

export async function readBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer())
}

export function toBlob(bytes: Uint8Array, type: string): Blob {
  return new Blob([bytes as BlobPart], { type })
}

export function message(error: unknown): string {
  // explain() turns the library's internal complaints into something a person
  // who only picked a file can act on. The CLI routes its errors through the
  // same function, so both surfaces say the same thing about the same failure.
  return explain(error)
}

/** Pad to a fixed width so exported page files sort correctly in a file manager. */
export function numbered(name: string, index: number, total: number): string {
  return `${name}-${String(index + 1).padStart(String(total).length, '0')}`
}

/**
 * crypto.randomUUID exists only in a secure context, so a build served over
 * plain http from another machine would have none. These ids are React keys,
 * not secrets, so any unique string will do.
 */
export function newId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
