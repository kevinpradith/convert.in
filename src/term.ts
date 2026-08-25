import { readFileSync } from 'node:fs'

/** Small terminal helpers: no colour, only weight, to match the web UI. */

const styled = process.stdout.isTTY === true && process.env['NO_COLOR'] === undefined

export const dim = (text: string) => (styled ? `\x1b[2m${text}\x1b[0m` : text)

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
