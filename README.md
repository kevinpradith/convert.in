# convert.in

[![CI](https://github.com/kevinpradith/convert.in/actions/workflows/ci.yml/badge.svg)](https://github.com/kevinpradith/convert.in/actions/workflows/ci.yml)
[![Licence: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.19-brightgreen.svg)](package.json)
[![Release](https://img.shields.io/github/v/release/kevinpradith/convert.in?label=release)](https://github.com/kevinpradith/convert.in/releases/latest)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/kevinpradith/convert.in/badge)](https://scorecard.dev/viewer/?uri=github.com/kevinpradith/convert.in)

Local image and PDF tools. The web app does all of its work inside the browser and
the CLI does all of its work on your machine, so no file is ever uploaded anywhere.

Try it at **[convertin.kevinpradith.my.id](https://convertin.kevinpradith.my.id)**.
That is the static build in `dist/` on a CDN and nothing else, so it keeps working
after the network goes away and there is no server on the other end to send a file
to.

Version 0.3.0, and every tool in it works. Below 1.0.0 the CLI flags and the
`src/core` exports can still change between minor versions, and
[CHANGELOG.md](CHANGELOG.md) says when they do.

<img
  alt="The convert.in landing page: the headline PDF and image tools that never upload a file, over a photograph of a sky, with the tool window rising into the bottom of the screen."
  src="docs/images/landing.webp"
/>

<img
  alt="The convert.in window: ten tools down the left, three images loaded, and the conversion settings along the bottom."
  src="docs/images/tools.webp"
/>

<sup>Both are captures of the built application in Chromium, shrunk by
<code>convert.in convert --to webp</code>. They are pictures of the thing that ships,
not mock-ups.</sup>

## Contents

- [Why](#why)
- [Quick start](#quick-start)
- [What it does](#what-it-does)
- [Security](#security)
- [Command line](#command-line)
- [Development](#development)
- [Deliberate limits](#deliberate-limits)
- [Licence](#licence)
- [Project](#project)

Three longer documents sit beside this one, because the reader who wants to
convert a file and the reader who wants to know why the redaction works are not
the same person:

|                                                       |                                        |
| ----------------------------------------------------- | -------------------------------------- |
| Every command, flag and format                        | [docs/cli.md](docs/cli.md)             |
| Running your own copy, and the headers it ships with  | [docs/hosting.md](docs/hosting.md)     |
| Why the interface and the PDF work are built this way | [docs/internals.md](docs/internals.md) |

## Why

Converting a file is not a hard problem and has not been one for years. What
changed is the price. The tools a search turns up now meter the thing they do:
three files a day, ten megabytes each, sign in for more, subscribe for a batch.
The work itself is a fraction of a second of somebody's CPU. The limit is not
there because the work is expensive; it is there because it is the only place a
bill can be attached.

The other half is that the file goes somewhere. Pressing Convert on a page sends
a scan of a passport, a signed contract, a medical form to a machine nobody
outside it can inspect, under a retention policy nobody reads. The honest answer
to where that file went is that you cannot know, and a privacy policy is a
promise rather than a mechanism.

This does the work in the page, on the machine already in front of you: the
codecs are WebAssembly and the PDF work is a library in the same tab. There is
no upload to reason about, so there is nothing to meter, nothing to keep and
nothing to leak later. That is not a statement of intent either.
`connect-src 'self'` in the [Content-Security-Policy](docs/hosting.md) means the page
cannot reach another origin even if one of its dependencies were compromised,
and a test in CI fails the build if a single request leaves it.

## Quick start

Node 20.19 or newer, and nothing else. Nothing here needs an account, a server,
or a network connection once the page has loaded.

**In a browser.** Run it, or build the static output and host it anywhere:

```sh
npm install
npm run dev       # http://localhost:5173
npm run build     # static files in dist/, host them anywhere or open them locally
```

**On the command line.** Nothing to clone:

```sh
npx convert-in --help
npm install -g convert-in     # or keep it around as convert.in
```

The published package is the tool compiled to JavaScript and nothing else: no
TypeScript sources, no compiler, five files. From a clone, `npm link` writes the
same shims Windows, macOS and Linux each need, and runs the TypeScript directly
so there is no build step to forget:

```sh
npm link
convert.in --help
```

The alternative for a machine where npm's global prefix wants root is under
[Command line](#command-line).

## What it does

One page: a headline that says what this is, and the window with the tools in
it directly under it. There is no second page and no route to navigate to, so
opening the tools is a scroll rather than a load.

Ten tools, all in one window:

| Tool               | What it does                                                                                                                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Convert images** | PNG, JPEG, WebP, AVIF and JPEG XL, in any direction, plus GIF, BMP, TIFF, ICO, HEIC and SVG on the way in. Scales on the way out. Shows what each file cost or saved.                                                            |
| **Compress PDF**   | Re-encodes the pictures inside, which is where nearly all the weight of a scan is. Give it the limit the upload form asked for and it works out its own settings. Says so when a file has nothing to shrink. Takes a pile.       |
| **Sign PDF**       | Draw a signature or bring a PNG of one, and place it on a page. One signature covers however many files you drop.                                                                                                                |
| **Images to PDF**  | Any image in, one image per page, in the order a person would count them. Pages are sized by the resolution the image claims, and a photo taken sideways comes out upright. Fit-to-image, A4 or Letter, with an optional margin. |
| **Organize PDF**   | Drop any number of PDFs, then reorder, rotate, delete and duplicate pages, and put them all on one sheet if you like. Bookmarks come with their pages. Save the result as one file or as one file per page.                      |
| **Clean PDF**      | Lists what the file says about whoever made it, then takes it out: the information dictionary, the XMP packet, and the custom keys the software that wrote it added.                                                             |
| **Redact PDF**     | Drag a rectangle, or search for a word and black out every occurrence. What is covered is then removed rather than hidden: the pages are rebuilt from pixels, so nothing survives underneath to be selected or copied.           |
| **Stamp PDF**      | A watermark across the pages, or page numbers on them. One file lets you select tiles; a pile gets stamped through.                                                                                                              |
| **Protect PDF**    | Lock with a password, or hand it locked files and take the password off. One password covers the pile. Says so when a file asks for a password but leaves its pages readable anyway.                                             |
| **PDF to images**  | Rasterise pages to PNG or JPEG at 72, 144 or 300 dpi.                                                                                                                                                                            |

Drop files anywhere in the window, drag tiles to reorder, click a tile to select
it, or type a range like `1-3,7` into the Pages box in the toolbar.

### No file limits, because there is nobody to bill for them

Every tool that turns one file into one file takes as many as you can give it,
in the window and on the command line alike, and every command except `split`
does the same:

```sh
convert.in compress scans/*.pdf --quality 40 -o small/
convert.in protect statements/*.pdf --open-password ...
convert.in number *.pdf -o numbered/
```

Nothing is queued, metered or counted, because nothing is being paid for: the
work happens on the machine you are sitting at. In the window the button counts
what it is about to do, and Download hands back every result at once. On the
command line, every output name is worked out before the first file is written,
so a run that would overwrite something, or land two inputs on the same name,
stops before it has done half the job.

### Web and CLI, side by side

Both sit on the same `src/core`, so a change lands in both at once, and page
ranges are parsed by the same function down to the error messages.

| What you want                 | In the window                   | On the command line     |
| ----------------------------- | ------------------------------- | ----------------------- |
| One image format into another | Convert images                  | `convert`               |
| Scale an image                | Convert images, the size boxes  | `convert --width`       |
| Make a scanned PDF smaller    | Compress PDF                    | `compress`              |
| Put a signature on a page     | Sign PDF                        | `sign`                  |
| Images into one PDF           | Images to PDF                   | `images`                |
| Join documents                | Organize, drop several          | `merge`                 |
| Reorder, delete, extract      | Organize, drag and select       | `select`                |
| Turn pages                    | Organize, the rotate buttons    | `rotate`                |
| One file per chunk            | Organize, Save pages separately | `split`                 |
| Watermark                     | Stamp, Watermark                | `watermark`             |
| Page numbers                  | Stamp, Page numbers             | `number`                |
| Lock with a password          | Protect                         | `protect`               |
| Take a password off           | Protect, it detects the lock    | `unlock`                |
| What is in this file          | the count in the toolbar        | `info`                  |
| Pages out as images           | PDF to images                   | none: it needs a canvas |

Two flags are deliberately CLI-only. `--force` has no meaning in a browser, where
a download never overwrites anything. `--sort natural` has none either, because
there you drag the tiles into the order you want.

Language (English, Indonesia) sits at the bottom of the sidebar and is
remembered in `localStorage`. There is one appearance and it is light: the
window is glass over a photograph, which a dark palette has nothing to be.

## Security

`npm audit` reports no vulnerabilities in either the runtime or the development
tree. There is no `eval`, no `innerHTML`, no shell invocation anywhere in the
source. `localStorage` holds the chosen language and nothing else; a
password is never written to it.

Every GitHub Actions step is pinned to a commit rather than a tag, because a tag
is a moving pointer and moving one is exactly how `tj-actions/changed-files` was
turned into a secret exfiltrator across 23,000 repositories in March 2025
(CVE-2025-30066). The workflow token is read-only at the top level, and the
checkout step is told not to leave it in `.git/config`. CodeQL analyses every
push and pull request with the `security-extended` pack, and Dependabot watches
npm, the actions themselves and the two Python packages the suites install.

The browser suite asserts that the page makes **no off-origin request at all**
while running a full convert, stamp, lock and unlock cycle. Only the origin it
was served from, plus `blob:` and `data:`, are allowed; anything else fails the
test. That is the claim on the sidebar, kept honest by a test rather than a
promise.

Three defects this sweep turned up, all fixed:

- **The page-range parser backtracked quadratically.** One regex held two
  optional `\d+` groups, so a hundred thousand digits followed by one stray
  character took 11.6 seconds to reject. Splitting on the dash first leaves only
  anchored `/^\d+$/` tests: the same input is now rejected in 0.2 ms, and a
  million characters take 1.1 ms. A test holds the line.
- **The password prompt could have started echoing.** Hiding what is typed
  relies on replacing a readline internal. If a future Node drops it, the prompt
  now refuses and points at the piped form instead of printing the password
  across the terminal.
- **`crypto.randomUUID` is only defined in a secure context**, so the built app
  served over plain http from another machine would have crashed on the first
  dropped file. The ids are React keys, not secrets, so there is a fallback.

The response headers that carry this, the reasoning behind each one, and the two
directives deliberately left out are in [docs/hosting.md](docs/hosting.md).

## Command line

Everything the window does, over the same `src/core`. The command is
`convert.in` however it was installed; the package is
[`convert-in`](https://www.npmjs.com/package/convert-in), because the two are
named by different rules. Released versions carry an npm provenance attestation,
built by the workflow in `.github/workflows/release.yml` with no publishing token
in this repository at all.

```sh
convert.in                         # banner and the full guide
convert.in help id                 # the same guide in Bahasa Indonesia

convert.in convert photo.png --to webp     # -> photo.webp, beside the input
convert.in convert *.heic --to jpeg -o out/
convert.in images shot-*.png       # -> shot.pdf, beside the first input
convert.in compress passport.pdf --max-size 500kb
convert.in merge part-1.pdf part-2.pdf -o whole.pdf
convert.in select scan.pdf 1-3,7   # -> scan-selected.pdf
convert.in rotate scan.pdf 180 --pages even   # the half a duplex feeder flipped
convert.in split book.pdf 10       # -> book-pages/
convert.in protect scan.pdf        # asks for the password, never takes it from argv
convert.in clean offer.pdf         # -> offer-clean.pdf, saying nothing
```

`-o` is optional: without it the result is named after the input and written
beside it. With several inputs the name comes from what they share, so
`shot1.png … shot12.png` becomes `shot.pdf`. Nothing is overwritten without
`--force`.

The rest is in [docs/cli.md](docs/cli.md): the other commands, how page ranges
and glob order are read, what each image format costs on the way out, and what a
password on a PDF does and does not protect. The tool carries the same guide
itself, in both languages, at `convert.in --help` and `convert.in help id`.

## Development

```
src/core/     plain TypeScript, no UI imports. Uint8Array in, Uint8Array out.
src/core/pdf-errors.ts  a library's failure read into a sentence, no library needed.
src/prompt.ts   hidden password prompt, plus the piped-stdin path for scripts.
src/cli.ts    argument parsing over that core, via node:util parseArgs.
src/help.ts   banner and the guide, English and Bahasa Indonesia.
src/term.ts   TTY dimming, WSL detection, byte sizes.
bin/convert.in.mjs  Node launcher, symlink it onto your PATH.
src/ui/       React components. The tools are thin wrappers around core.
src/ui/i18n.ts   Both languages in one object; `id` must match `en` or the build fails.
src/ui/Landing.tsx  The hero above the window, and the clouds layered around it.
src/ui/prefs.ts  The chosen language, persisted, with storage failures swallowed.
scripts/prerender.mts  Writes the hero into dist/index.html at build time.
scripts/build-cli.mjs  Bundles the CLI for npm, so a release ships no compiler.
test/help.test.ts      Guards the two guides against drifting apart.
test/         node:test over core, no framework.
test/browser/   the built app driven in a real browser, under the shipped headers.
test/encryption-audit.py  the produced PDFs read back by pypdf, not by pdf-lib.
test/cli-smoke.py         every command driven once, end to end.
test/fuzz-cli.py          damaged files, to see how they are refused.
public/fonts/ the two subset typefaces, and the licence they ship under.
docs/cli.md      the command line in full: every command, flag and format.
docs/hosting.md  running your own copy, and every response header it ships with.
docs/internals.md  why the interface, the first paint and the PDF work are so.
docs/images/  the README's screenshots, kept out of public/ so they are not served.
```

`src/core/` does not know whether it is running in a browser or a terminal, which is
the only reason one implementation can serve both. `assemblePages` is the primitive
underneath merge, reorder, delete, extract and split: they are all just a list of
pages in an order.

```sh
npm install
npm run dev         # the web app on http://localhost:5173
npm run build       # static output in dist/
npm test            # node:test over the core, no framework
npm run typecheck
npm run cli -- --help
```

Everything runs from a clean checkout with no configuration: no environment
variables, no services, no accounts.

Four suites reach past the core and need Python, because the point of each is
to check the work with something other than the library that produced it:

```sh
pip install -r test/requirements.txt
python3 -m playwright install chromium

npm run build
npm run audit:fixtures -- ./fixtures   # documents with something to lose
python3 test/encryption-audit.py ./fixtures   # pypdf reads the encryption back
npm run test:cli                       # every command, once, end to end
npm run test:browser                   # the built app, driven in Chromium
npm run test:fuzz -- ./fixtures        # damaged files, seeded so they repeat
```

`npm run test:browser` serves `dist/` with the contents of `public/_headers` and
drives every tool through the interface: images in, pages out, a watermark that
has to be findable in the text of the saved file, a password that has to open it
and a wrong one that must not. It also checks what should _not_ happen: no
request leaves the origin, pdf.js never warns that an asset is missing, and
nothing is refused by the Content-Security-Policy.

`npm run test:cli` covers the layer between a typed command and `src/core`:
argument parsing, output naming, the check that works out every output path
before writing the first file, and the warnings printed alongside.

`npm run test:fuzz` hands the CLI files nobody wrote on purpose: bytes flipped
inside an object, a document cut off halfway, a header with a digit changed. A
PDF reader is a parser over input it did not produce, so the question is not
whether a damaged file is refused but how. A sentence about the file and exit 1
pass; a stack trace, an exit code that is neither 0 nor 1, or a run that never
finishes fail. The mutations are seeded, so anything it finds reproduces from
the seed in its header. CI runs sixty rounds on a push and four hundred on the
weekly schedule, since the value is in the rare mutation.

Their two Python packages are pinned in `test/requirements.txt`. Nothing else in
the project needs Python.

## Deliberate limits

- **Only JPEG goes into a PDF untouched.** PDF can hold a JPEG or a PNG and nothing
  else, so a JPEG is embedded byte for byte and everything else is decoded and
  re-written as a lossless PNG on the way in. Nothing is re-compressed either way.
- **No animation.** An animated GIF or WebP converts as its first frame. Keeping the
  frames would mean an animation encoder for every target format, for a case that is
  better served by a video tool.
- **Scaling, but no cropping.** `convert` will fit a picture inside a width and a
  height, by averaging over the area each output pixel covers rather than picking
  one of them. Choosing _which part_ of a picture to keep is a different
  interface and is not here.
- **PDF compression stops at the pictures.** `compress` re-encodes the JPEGs
  inside the document, which on a scan is 60 to 90 percent of the file and on a
  text-only PDF is nothing at all, which it says rather than reporting a hollow
  "0% smaller". It does not rewrite content streams or subset fonts. Ghostscript
  and MuPDF do both, and both are AGPL, whose terms would reach the whole of this
  project; nothing permissively licensed does the same job in a browser.
- **Signing draws a picture, it does not certify.** `sign` puts an image of a
  signature on the page, the way signing a printout and scanning it back does. It
  proves nothing about who signed or whether the document changed afterwards. A
  cryptographic signature needs a certificate and is a different feature.
- **Watermarks and page numbers are Latin-1 only.** They draw with the built-in
  Helvetica so nothing has to be shipped or fetched; text outside Latin-1 is
  refused with a message rather than silently dropped.
- **Form fields do not survive page rearranging.** Merge, select and split are
  built on page copying, which carries a form's widgets but not the AcroForm
  that gives them names and values. Both the CLI and the web app say so before
  doing it. Rotate, watermark, number and protect leave forms intact.
- **Splitting takes one document.** Everything else runs over a whole list, but
  `split` turns one PDF into a folder of them, and a list of those would be a
  folder of folders with no obvious names. Run it once per file.
- **Page numbers cannot be picked across a pile.** Page 3 of one document is not
  page 3 of the next, so the page grid and the page picker appear for a single
  file and a pile is stamped or signed all the way through. The CLI takes the
  same line: `--pages` is read against each document's own length.
- **A permissions-protected file has to be unlocked first** before the other
  tools touch it. pdf-lib will not open an encrypted document without being
  handed a password, even the empty one a reader would use.
- **No Office formats.** docx to PDF needs LibreOffice on a server, and a server is
  the one thing this project does not have.
- **No Web Worker** around pdf-lib, so a very large job will freeze the tab while it
  runs. pdf.js already has its own worker, so previews and rasterising are fine.
- **No OCR.** Tesseract compiles to WebAssembly under Apache-2.0, so the licence
  fits, but its trained data is fetched from a CDN by default. Anything fetched
  from a CDN breaks both the `connect-src 'self'` policy and the promise the
  policy exists to keep, so it would have to be shipped in the bundle the way the
  pdf.js assets already are, and it is megabytes.

## Licence

convert.in is MIT. See [LICENSE](LICENSE).

MIT rather than Apache-2.0 because this is a small tool with no patent surface
worth granting around, and MIT is the shorter, more widely understood of the
two. Apache-2.0 would be the better choice if the project ever needed to give
contributors and adopters an express patent licence.

The built application bundles code under MIT and Apache-2.0, and both require
their copyright notices to travel with any copy. Those notices are reproduced in
[`public/THIRD-PARTY-NOTICES.txt`](public/THIRD-PARTY-NOTICES.txt), which ships
inside `dist/` and is linked from the sidebar, so anyone running a hosted copy is
served them too. It is generated from what is actually installed:

```sh
npm run notices     # runs automatically as part of npm run build
```

The list is read out of the bundle's own sourcemaps rather than written down, so
it cannot fall behind what is shipped, and CI fails on a tree where the two
disagree. pdf.js is the one to keep an eye on: it is Apache-2.0, whose
attribution clause is stricter than MIT's.

The two typefaces are served as files rather than imported, so they are outside
that graph and are named by hand in the same script. Both are under the
[SIL Open Font License 1.1](https://openfontlicense.org), reproduced in
[`public/fonts/OFL.txt`](public/fonts/OFL.txt). The display face is a subset of
Playfair Display, which reserves its own name; clause 3 of that licence forbids
a modified version from carrying a reserved font name, and a subset is a
modified version, so the file ships as **Convert Display**.

Two things this repository cannot settle for you. Whether the name **convert.in**
collides with an existing trademark is worth checking before putting it on a
domain. And if any of this were written on an employer's time or equipment, their
IP agreement may give them a claim on it regardless of the licence file.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the terms contributions are accepted
under.

## Project

|                                          |                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------- |
| Who wrote it                             | [Kevin Praditiansyah](https://www.linkedin.com/in/kevinpradith/) |
| Every command and flag                   | [docs/cli.md](docs/cli.md)                                       |
| Hosting a copy, and its headers          | [docs/hosting.md](docs/hosting.md)                               |
| How it is built, and why                 | [docs/internals.md](docs/internals.md)                           |
| What changed, and when                   | [CHANGELOG.md](CHANGELOG.md)                                     |
| Reporting a vulnerability                | [SECURITY.md](SECURITY.md)                                       |
| Running the checks before a pull request | [CONTRIBUTING.md](CONTRIBUTING.md)                               |
| How people are expected to behave here   | [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)                         |

Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Below
1.0.0 the CLI flags and the `src/core` exports may still change between minor
versions; the changelog says when they do.

### Support

Questions and ideas belong in
[Discussions](https://github.com/kevinpradith/convert.in/discussions).
A failure that reproduces belongs in
[Issues](https://github.com/kevinpradith/convert.in/issues), through whichever
of the two forms fits. A suspected vulnerability goes privately through
[SECURITY.md](SECURITY.md) rather than either of them.
