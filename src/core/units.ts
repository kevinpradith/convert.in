/**
 * Numbers as people read them. Shared, because the command line and the browser
 * app report the same conversion and should not measure it differently.
 */

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * How much smaller the result is, as a whole percentage: positive for a saving,
 * negative when the file grew. Only the number is shared. The wording is not,
 * because one of the two places this runs speaks two languages.
 */
export function sizeChange(before: number, after: number): number {
  if (before === 0) return 0
  return Math.round((1 - after / before) * 100)
}
