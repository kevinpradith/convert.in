import { readFile, writeFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Hero } from '../src/ui/Landing.tsx'

/**
 * Write the hero into dist/index.html.
 *
 * Nothing on this page exists until React has been fetched, parsed and run, so
 * the first thing a visitor sees is an empty sky and the largest paint on the
 * page waits on the whole bundle. The hero is the one part that is the same for
 * everybody on every visit: static text, a wordmark and three clouds, none of
 * it dependent on what the visitor has done before. Rendered here it is in the
 * HTML response, and the browser paints it, fetches the display italic it is
 * set in, and finishes its largest paint while the bundle is still arriving.
 *
 * It is markup, not hydration: main.tsx mounts over the top and replaces these
 * nodes with its own. The two agree because they are the same component, so the
 * swap moves nothing. The one thing that would show is the entrance animation
 * running a second time on the new nodes, and main.tsx turns it off for that
 * reason once it has taken over.
 *
 * English regardless of what the visitor last chose, because the response is
 * one file served to everyone. Someone reading in Indonesian sees the English
 * hero until the bundle lands, which is the same moment they would otherwise
 * have seen nothing at all.
 */
const html = await readFile('dist/index.html', 'utf8')
const hero = renderToStaticMarkup(createElement(Hero, { lang: 'en', onLang: () => {} }))

/*
  React writes a preload for every image it renders here, and the clouds are not
  rendered below the medium breakpoint: on a phone that is 32 KiB fetched at the
  front of the queue, ahead of the bundle, for three pictures the layout has
  already hidden. The wordmark's preload is left alone, since that one is on
  screen at every width.
*/
const withoutHiddenClouds = hero.replace('<link rel="preload" as="image" href="./cloud.webp"/>', '')

const root = '<div id="root"></div>'
if (!html.includes(root)) throw new Error('dist/index.html has no empty #root to prerender into')

/*
  And now that the first screen is markup, the bundle can wait for it. 75 KiB
  asked for at the same priority as the font and the photograph the hero is
  actually made of means all three land late together on a phone connection;
  asked for after them it costs a third of a second off both paints, and costs
  the two controls in the hero that long before they answer a click.

  Its own file rather than an inline script because the Content-Security-Policy
  this ships under allows neither inline script nor eval, and it is not worth
  weakening for three lines. The timer is not a second chance at loading it, it
  is the only one: load waits on every image and font, and one that never
  answers would otherwise leave a page that looks finished and does nothing.
*/
const entry = html.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/)
if (!entry) throw new Error('dist/index.html has no module entry to defer')

await writeFile(
  'dist/boot.js',
  `let done=0
const load=()=>{
  if (done++) return
  const tag=document.createElement('script')
  tag.type='module'
  tag.crossOrigin=''
  tag.src=${JSON.stringify(entry[1])}
  document.head.appendChild(tag)
}
addEventListener('load',load)
setTimeout(load,2000)
`,
)

await writeFile(
  'dist/index.html',
  html
    .replace(root, `<div id="root">${withoutHiddenClouds}</div>`)
    .replace(entry[0], '<script src="./boot.js" defer></script>'),
)
