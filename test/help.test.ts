import { test } from 'node:test'
import assert from 'node:assert/strict'

import { GUIDES } from '../src/help.ts'

/*
  The guides are two long template strings, which is the cheapest way to write
  terminal copy and the easiest to damage without noticing: a reflow over the
  Indonesian one once flattened its command table into a paragraph, and nothing
  failed, because the only test that read a guide asked the English one whether
  the word COMMANDS was in it.

  These are the three things that cannot be seen by reading a diff of a 370-line
  string, and each is a defect that actually shipped.
*/

/** The rows of a guide's command table: everything indented under the heading,
 *  up to the blank line that ends the section. */
function commandRows(lang: 'en' | 'id', heading: string): string[] {
  const body = GUIDES[lang].split(`\n${heading}\n`)[1]
  assert.ok(body, `${lang}: no ${heading} section`)
  return body
    .split('\n\n')[0]!
    .split('\n')
    .filter((line) => line.trim() !== '')
}

const EN_ROWS = commandRows('en', 'COMMANDS')
const ID_ROWS = commandRows('id', 'PERINTAH')

test('both guides list the same commands, in the same order', () => {
  const names = (rows: string[]) => rows.map((row) => row.trim().split(/\s/)[0])
  assert.deepEqual(names(ID_ROWS), names(EN_ROWS))
  // One row each. A table that has been reflowed into prose still holds every
  // command name, so counting the names is not enough on its own.
  assert.equal(ID_ROWS.length, EN_ROWS.length)
})

test('every command row fits the width the guides are set to', () => {
  for (const row of [...EN_ROWS, ...ID_ROWS]) {
    assert.ok(row.length <= 88, `${row.length} columns: ${row}`)
  }
})

/*
  CONTRIBUTING.md commits the Indonesian to the formal register: `you` is Anda,
  and where KBBI marks a word cak, the standard form is the one that belongs.
  These are the forms that had already reached the guide.
*/
test('the Indonesian guide keeps the formal register', () => {
  const cak = /\b(lu|gue|gua|elo|kamu|nggak|ngga|gak|tapi|cuma|kalau|bikin)\b/i
  for (const line of GUIDES.id.split('\n')) {
    assert.equal(cak.exec(line)?.[0], undefined, `cak form in: ${line}`)
  }
})
