import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { STRINGS } from '../src/ui/i18n.ts'

/**
 * public/fonts/playfair-italic-headline.woff2 carries the alphabet of one line
 * of the page and nothing else, because that line is the only thing set in it
 * and the full latin subset is five times the size. The saving depends on the
 * headline staying inside that alphabet: reword it, or add a language, and a
 * character the file does not carry drops silently to the fallback serif in the
 * middle of a word.
 *
 * The @font-face declares the same alphabet as its unicode-range, so that is
 * what this reads. Regenerate the file and the range together:
 *
 *   python3 -m fontTools.subset <the full Playfair Display italic latin woff2> \
 *     --text="$(the characters below)" --flavor=woff2 --layout-features='*' \
 *     --output-file=public/fonts/playfair-italic-headline.woff2
 *
 * The subset is then renamed to "Convert Display" in name IDs 1, 3, 4 and 6.
 * Playfair Display carries "Playfair Display" as a Reserved Font Name, and
 * clause 3 of the SIL Open Font License forbids a Modified Version from using
 * it. A subset is a Modified Version, so the file this repository ships cannot
 * answer to the original family name. public/fonts/OFL.txt carries the licence
 * and both copyright lines, and scripts/notices.mjs copies it into the notices
 * the application serves.
 */
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

const face = css.slice(css.indexOf("font-family: 'Convert Display'"))
const range = face.slice(face.indexOf('unicode-range:'), face.indexOf('}'))

const carried = new Set<number>()
for (const point of range.matchAll(/U\+([0-9A-F]{4})(?:-([0-9A-F]{4}))?/g)) {
  const first = parseInt(point[1]!, 16)
  const last = point[2] ? parseInt(point[2], 16) : first
  for (let code = first; code <= last; code++) carried.add(code)
}

test('the headline italic stays inside the alphabet its font was cut to', () => {
  assert.ok(carried.size > 0, 'no unicode-range found for the display face')

  for (const [lang, strings] of Object.entries(STRINGS)) {
    const missing = [...strings.hero.titleEm].filter((c) => !carried.has(c.codePointAt(0)!))
    assert.deepEqual(
      missing,
      [],
      `${lang}: ${JSON.stringify(missing.join(''))} is not in the subset, so it would render in the fallback serif`,
    )
  }
})
