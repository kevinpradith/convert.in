/**
 * Numbers as people read them. Shared, because the command line and the browser
 * app report the same conversion and should not measure it differently.
 */

/**
 * Sizes in the decimal units SI defines, where a kilobyte is 1000 bytes rather
 * than 1024.
 *
 * The two conventions differ by 2.4 percent per step, which normally nobody
 * would care about. Here it decides whether a file meets a limit: an upload
 * form that says "500KB" almost never says which it means, and a file measured
 * in 1024s is the larger of the two readings. Measuring in 1000s means a file
 * this reports as under the limit is under it on either reading, and it is the
 * convention macOS, most Linux desktops and every disk on the shelf already
 * use. Windows is the odd one out, and will show these files as slightly
 * smaller than this does.
 *
 * IEC 80000-13 reserves KiB and MiB for the 1024s. Those are not used here
 * because no upload form has ever asked for one.
 */
export function humanSize(bytes: number): string {
  if (!Number.isFinite(bytes)) return '? B'
  if (bytes < 1000) return `${Math.round(bytes)} B`
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} kB`
  return `${(bytes / 1_000_000).toFixed(1)} MB`
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
