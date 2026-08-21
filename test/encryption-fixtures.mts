/**
 * Writes the PDFs that encryption-audit.py inspects.
 *
 *   npm run audit:fixtures -- ./fixtures
 *   python3 test/encryption-audit.py ./fixtures
 *
 * They are generated rather than committed because the audit needs a document
 * that carries something to lose: metadata, an interactive form, real page
 * content. A binary fixture in the repository would also have to be trusted,
 * and the point of the audit is to trust nothing.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib'
import { protectPdf, unlockPdf } from '../src/core/pdf-security.ts'

const out = process.argv[2] ?? 'fixtures'
await mkdir(out, { recursive: true })

const pdf = await PDFDocument.create()
const font = await pdf.embedFont(StandardFonts.Helvetica)
for (let i = 0; i < 3; i++) {
  pdf.addPage([300, 400]).drawText(`page ${i + 1}`, { x: 40, y: 340, size: 18, font })
}
pdf.setTitle('Audit Source')
pdf.setAuthor('convert.in')
pdf.setSubject('encryption audit')
pdf.setKeywords(['audit', 'aes'])
pdf
  .getForm()
  .createTextField('who')
  .addToPage(pdf.getPage(0), { x: 40, y: 200, width: 200, height: 24 })

const plain = await pdf.save()
const openOnly = await protectPdf(plain, { openPassword: 'hunter2' })

const files: [string, Uint8Array][] = [
  ['plain.pdf', plain],
  ['open-only.pdf', openOnly],
  [
    'both.pdf',
    await protectPdf(plain, {
      openPassword: 'openpw',
      permissionsPassword: 'ownerpw',
      printing: 'low',
      changes: 'none',
      copying: false,
    }),
  ],
  [
    'perms-only.pdf',
    await protectPdf(plain, {
      permissionsPassword: 'ownerpw',
      printing: 'none',
      changes: 'none',
      copying: false,
    }),
  ],
  ['unlocked.pdf', await unlockPdf(openOnly, 'hunter2')],
  ['relocked.pdf', await protectPdf(openOnly, { openPassword: 'second', currentPassword: 'hunter2' })],
]

for (const [name, bytes] of files) await writeFile(`${out}/${name}`, bytes)
console.log(`wrote ${files.length} fixtures to ${out}`)
