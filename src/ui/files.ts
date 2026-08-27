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
 * Characters that have no business in a download name.
 *
 * The first ranges are the C0 and C1 control blocks and DEL. The rest are the
 * bidirectional overrides: they carry no glyph of their own and they reorder
 * what the characters after them look like, so a name ending in an override
 * followed by "gnp.exe" is listed by the browser as ending in ".png". That is
 * the filename form of the reordering trick catalogued for source code as
 * CVE-2021-42574, and a downloads folder is exactly where it pays off. Windows
 * additionally refuses < > : " | ? * and reads a colon as an alternate data
 * stream, so those go too.
 */
// eslint-disable-next-line no-control-regex
const UNWANTED = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069<>:"|?*]/g

/**
 * The names Windows keeps for devices rather than files. Microsoft's own naming
 * rules say to avoid them "followed immediately by an extension" as well,
 * because NUL.txt and NUL.tar.gz are both still the null device; the superscript
 * digits are there because Windows reads them as digits in COM# and LPT#. A
 * download offered under one of these either fails or writes to a device, so it
 * gets a prefix, which is what Chromium does with them too.
 */
const RESERVED = /^(con|prn|aux|nul|com[0-9\u00b9\u00b2\u00b3]|lpt[0-9\u00b9\u00b2\u00b3])$/i

/** Longest name handed to the downloader, well inside every filesystem's limit. */
const NAME_LIMIT = 200

/**
 * Build the name a finished file is offered under.
 *
 * It comes from whatever the dropped file was called, which is somebody else's
 * text whenever the document arrived from somebody else. Browsers mostly
 * sanitise the download attribute themselves, but "mostly" and "which browser"
 * are not worth depending on when the alternative is one function.
 *
 * The extension survives whatever else is cut, because a truncated name that no
 * longer ends in .pdf is a file the operating system no longer knows how to
 * open.
 */
export function safeName(name: string): string {
  const cleaned = name
    .replace(/[/\\]/g, '-')
    .replace(UNWANTED, '')
    // Trimmed before the leading dots are taken off, not after: " .bashrc"
    // survived the other order, because the dot was no longer at the front.
    .trim()
    .replace(/^\.+/, '')
    // A trailing dot or space is legal on Unix and silently dropped by Windows,
    // which leaves the two disagreeing about what the file is called.
    .replace(/[\s.]+$/, '')
  if (cleaned === '') return 'convert.in.pdf'
  const stem = cleaned.split('.')[0] ?? ''
  const safe = RESERVED.test(stem) ? `_${cleaned}` : cleaned
  if (safe.length <= NAME_LIMIT) return safe
  const dot = safe.lastIndexOf('.')
  // A dot two thirds of the way through a 300-character name is part of the
  // name, not an extension.
  const extension = dot > 0 && safe.length - dot <= 16 ? safe.slice(dot) : ''
  return safe.slice(0, NAME_LIMIT - extension.length) + extension
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
