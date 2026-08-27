import { readFileSync } from 'node:fs'

/** Small terminal helpers: no colour, only weight, to match the web UI. */

const styled = process.stdout.isTTY === true && process.env['NO_COLOR'] === undefined

export const dim = (text: string) => (styled ? `\x1b[2m${text}\x1b[0m` : text)

/**
 * Characters a terminal reads as instructions rather than as text.
 *
 * The C0 block minus tab and newline, DEL, the C1 block, and the bidirectional
 * overrides. An escape reaching the terminal is not a display glitch: `ESC [ 2K`
 * erases the line that was being written and a carriage return puts the cursor
 * back at its start, so a value carrying both can overwrite what was printed
 * above it and show whatever it likes. `ESC ] 0 ; text BEL` renames the window.
 * The overrides are the reordering trick catalogued as CVE-2021-42574, which
 * reads the same in a terminal as it does in source code.
 */
// eslint-disable-next-line no-control-regex
const INSTRUCTIONS =
  /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g

/**
 * Make text from a file safe to print.
 *
 * Every string this tool shows about a document, its title, its author, the
 * name of a custom key, comes out of a file somebody else may have written, and
 * printing it is handing that text to the terminal. Newlines and tabs stay,
 * because messages here are written with both.
 */
export const tame = (text: string): string => text.replace(INSTRUCTIONS, '')

/**
 * Put a value on the one line a table row has room for.
 *
 * A newline inside a title is not only untidy: the rows here are aligned by
 * padding, so a value carrying a newline and sixteen spaces prints what looks
 * like another row, with a key and a value of its own choosing.
 */
export const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim()

/**
 * Shorten text that has no business being long.
 *
 * A PDF may carry a five-thousand-character author, and a watermark may be
 * pasted in from a whole document. Neither should scroll a report out of view.
 */
export function cap(text: string, limit = 120): string {
  if (text.length <= limit) return text
  return `${text.slice(0, limit - 1)}…`
}

/**
 * True when this is a WSL shell, where Windows paths need translating.
 * /proc/version names the kernel and is the one check that works on WSL 1 and 2
 * regardless of which shell started the process.
 */
export const isWsl = (() => {
  try {
    return readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft')
  } catch {
    return false
  }
})()
