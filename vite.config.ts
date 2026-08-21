import { cpSync, readFileSync, writeFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * pdf.js does not bundle four kinds of asset; it fetches them only when a
 * document turns out to need them. Without them it warns and carries on, which
 * means the page renders blank or with the wrong glyphs rather than failing:
 *
 *   wasm/           JBIG2 and JPEG 2000 decoders, which is how the pages of a
 *                   scanned document are almost always stored, plus the colour
 *                   engine
 *   cmaps/          the Adobe character maps CJK text is written against
 *   standard_fonts/ the fourteen fonts a PDF may reference without embedding
 *   iccs/           the fallback CMYK profile
 *
 * Copying each directory whole also carries the licence files sitting in it,
 * which is exactly what redistributing those binaries requires.
 *
 * Paths come straight from node_modules rather than through the package entry
 * points, matching scripts/notices.mjs: pdfjs-dist declares no "exports", and a
 * package that does is free to keep these directories out of it.
 */
function pdfjsAssets(): Plugin {
  return {
    name: 'pdfjs-assets',
    buildStart() {
      // Several thousand small files, so a few seconds on a slow filesystem.
      // The stamp keeps that out of every dev server restart while still
      // recopying when the dependency moves.
      const source = 'node_modules/pdfjs-dist/'
      const { version } = JSON.parse(readFileSync(`${source}package.json`, 'utf8'))
      const stamp = 'public/pdfjs/.version'
      try {
        if (readFileSync(stamp, 'utf8') === version) return
      } catch {
        // not copied yet
      }
      for (const dir of ['wasm', 'cmaps', 'standard_fonts', 'iccs']) {
        cpSync(source + dir, `public/pdfjs/${dir}`, { recursive: true })
      }
      writeFileSync(stamp, version)
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), pdfjsAssets()],
})
