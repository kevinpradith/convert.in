/**
 * Bundle the command line tool for publishing.
 *
 * In a clone, `bin/convert.in.mjs` compiles the TypeScript in memory with tsx,
 * which is why there is no build step to forget while working on it. That is
 * the wrong shape for an installed package: tsx and the esbuild binary under it
 * are 12 MB of compiler that every user would download to run a tool that could
 * have shipped as JavaScript, and they are devDependencies, so an install would
 * not have them at all and the command would fail on its first line.
 *
 * So `prepack` runs this. Everything in `dependencies` stays external: the PDF
 * and codec packages resolve their own WebAssembly next to themselves, and
 * inlining them would break that and bloat the file besides.
 */
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'

const { dependencies, engines } = JSON.parse(readFileSync('package.json', 'utf8'))

const result = await build({
  entryPoints: ['src/cli.ts'],
  outfile: 'dist-cli/cli.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  // The floor in package.json, not the Node running this build: a bundle
  // downlevelled to something older than the engines field is a lie, and one
  // targeting something newer breaks for the people the field promises.
  target: `node${engines.node.replace(/^\D+/, '')}`,
  external: Object.keys(dependencies),
  banner: { js: '#!/usr/bin/env node' },
  sourcemap: false,
  legalComments: 'inline',
  metafile: true,
})

const [output] = Object.values(result.metafile.outputs)
console.log(`dist-cli/cli.mjs  ${(output.bytes / 1024).toFixed(1)} kB`)
