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

/**
 * The stylesheet is 10 KiB over the wire and it blocks the first paint, so the
 * browser spends a whole round trip finding out what the page looks like, and
 * a second one before it even learns the fonts exist: the @font-face rules are
 * inside the file it is still waiting for. Inlining it collapses both. There is
 * one HTML page here and the CSS is rebuilt with a new hash whenever it
 * changes, so nothing is lost by giving up its separate cache entry.
 */
function inlineCss(): Plugin {
  return {
    name: 'inline-css',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) return html
        return html.replace(
          /<link rel="stylesheet"[^>]*href="\.\/([^"]+\.css)"[^>]*>/g,
          (tag, file: string) => {
            const asset = ctx.bundle?.[file]
            return asset && asset.type === 'asset' ? `<style>${String(asset.source)}</style>` : tag
          },
        )
      },
    },
  }
}

/*
  A Windows drive mounted into WSL delivers no inotify events, so the dev server
  reads every file once and then never hears about an edit again: it goes on
  serving the version it started with, and the only clue is that hot reloading
  quietly stops happening. Polling is the only thing that sees a change across
  that mount. It is switched on where that is the case and nowhere else, so a
  checkout on a native filesystem keeps the cheaper watcher.
*/
const acrossAWindowsMount = process.platform === 'linux' && process.cwd().startsWith('/mnt/')

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), pdfjsAssets(), inlineCss()],
  server: acrossAWindowsMount ? { watch: { usePolling: true, interval: 300 } } : undefined,
  build: {
    rolldownOptions: {
      output: {
        /*
          pdf-lib is shared by seven of the ten tools, so it lands in whatever
          chunk they have in common, and that chunk is also the one the image
          converter needs for its own shell. Left alone, opening the converter
          downloads a PDF writer it will never call. Named here, it becomes a
          chunk of its own that only a tool touching a PDF ever asks for.
        */
        codeSplitting: {
          groups: [{ name: 'pdf-lib', test: /node_modules[\\/]@cantoo[\\/]pdf-lib/ }],
        },
      },
    },
  },
})
