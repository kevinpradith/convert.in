import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'vite'

/**
 * Reproduce the licence of everything whose code ends up inside dist/.
 *
 * MIT, Apache-2.0, BSD and 0BSD all require the copyright notice to travel with
 * the copy, so the built application ships this file next to it.
 *
 * The list is read out of the bundle rather than written down. It used to be a
 * constant maintained by hand, and it had drifted: thirteen packages were named
 * while twenty-four were being shipped, so eleven notices were missing,
 * including the one for the fonts the application draws every watermark with.
 * A list nobody can forget to update is the only kind worth having for an
 * obligation like this.
 */

/** Build once into a temporary directory, purely to read the module graph. */
async function bundledPackages() {
  const out = await mkdtemp(join(tmpdir(), 'convert-in-notices-'))
  try {
    await build({
      logLevel: 'error',
      build: { outDir: out, emptyOutDir: true, sourcemap: true },
    })
    const found = new Set()
    const assets = join(out, 'assets')
    for (const name of await readdir(assets)) {
      if (!name.endsWith('.map')) continue
      const map = JSON.parse(await readFile(join(assets, name), 'utf8'))
      for (const source of map.sources ?? []) {
        // "../../node_modules/@scope/name/dist/index.js" -> "@scope/name"
        const match = /node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(source)
        if (match) found.add(match[1])
      }
    }
    return [...found].sort()
  } finally {
    await rm(out, { recursive: true, force: true })
  }
}

/** Every spelling a package might use. tslib, for one, uses LICENSE.txt. */
const LICENCE_FILES = [
  'LICENSE',
  'LICENSE.md',
  'LICENSE.txt',
  'LICENCE',
  'LICENCE.md',
  'COPYING',
  'NOTICE',
]

async function licenceOf(name) {
  const root = `node_modules/${name}/`
  for (const candidate of LICENCE_FILES) {
    try {
      const text = await readFile(root + candidate, 'utf8')
      // Two of these ship with CRLF. Left alone they make the generated file
      // differ by platform, and the CI check that it is up to date would fail
      // for a reason that has nothing to do with the licences.
      if (text.trim() !== '') return text.replace(/\r\n/g, '\n').trim()
    } catch {
      // try the next spelling
    }
  }
  // Loudly rather than quietly: shipping a dependency whose notice is missing
  // is the failure this script exists to prevent.
  throw new Error(
    `${name} is in the bundle and ships no licence file. Its terms have to be ` +
      'found and reproduced by hand before this can be released.',
  )
}

const packages = await bundledPackages()
const sections = []
for (const name of packages) {
  // Read straight out of node_modules rather than through the package entry
  // points, because a package is free to keep ./package.json out of its
  // "exports" and several do.
  const manifest = JSON.parse(await readFile(`node_modules/${name}/package.json`, 'utf8'))
  const rule = '='.repeat(78)
  const home = manifest.homepage ?? manifest.repository?.url ?? ''
  sections.push(
    `${rule}\n${name} ${manifest.version} — ${manifest.license}\n${home}\n${rule}\n\n` +
      `${await licenceOf(name)}\n`,
  )
}

const header = `THIRD-PARTY NOTICES

convert.in itself is MIT licensed; see LICENSE. The built application bundles
the libraries below, and their licences require the copyright notices to travel
with any copy, so they are reproduced here in full.

The list is read out of the bundle itself by scripts/notices.mjs rather than
written down, so it cannot fall behind what is actually shipped. Run
"npm run notices" after adding or upgrading a runtime dependency; the CI build
fails if this file is out of date.

`

await writeFile('public/THIRD-PARTY-NOTICES.txt', header + sections.join('\n'))
console.log(`wrote notices for ${packages.length} bundled packages`)
