# convert.in

Local image and PDF tools. The web app does all of its work inside the browser and
the CLI does all of its work on your machine, so no file is ever uploaded anywhere.

## Web app

```sh
npm install
npm run dev       # http://localhost:5173
npm run build     # static files in dist/, host them anywhere or open them locally
```

Three tools, all in one window:

| Tool | What it does |
| --- | --- |
| **Images to PDF** | JPEG and PNG in, one image per page. Fit-to-image, A4 or Letter, with an optional margin. |
| **Organize PDF** | Drop any number of PDFs, then reorder, rotate, delete and duplicate pages. Save the result as one file or as one file per page. |
| **Stamp PDF** | A watermark across the pages, or page numbers on them. Select tiles to stamp only those. |
| **Protect PDF** | Lock with a password, or hand it a locked file and take the password off. |
| **PDF to images** | Rasterise pages to PNG or JPEG at 72, 144 or 288 dpi. |

Drop files anywhere in the window, drag tiles to reorder, click a tile to select
it, or type a range like `1-3,7` into the Pages box in the toolbar.

### Web and CLI, side by side

Both sit on the same `src/core`, so a change lands in both at once, and page
ranges are parsed by the same function down to the error messages.

| What you want | In the window | On the command line |
| --- | --- | --- |
| Images into one PDF | Images to PDF | `images` |
| Join documents | Organize, drop several | `merge` |
| Reorder, delete, extract | Organize, drag and select | `select` |
| Turn pages | Organize, the rotate buttons | `rotate` |
| One file per chunk | Organize, Save pages separately | `split` |
| Watermark | Stamp, Watermark | `watermark` |
| Page numbers | Stamp, Page numbers | `number` |
| Lock with a password | Protect | `protect` |
| Take a password off | Protect, it detects the lock | `unlock` |
| What is in this file | the count in the toolbar | `info` |
| Pages out as images | PDF to images | none: it needs a canvas |

Two flags are deliberately CLI-only. `--force` has no meaning in a browser, where
a download never overwrites anything. `--sort natural` has none either, because
there you drag the tiles into the order you want.

Appearance (Auto, Light, Dark) and language (English, Indonesia) sit at the
bottom of the sidebar and are remembered in `localStorage`. Auto follows the
system, live, with no reload.

### Look

Apple's current design language read in greyscale: translucent layers over a soft
backdrop, capsule controls, and radii that nest concentrically (an inner radius
is its parent's minus the padding between them).

Black, white and grey only, every channel equal. Emphasis is carried by ink
rather than a hue, and it is spent only on the things a person acts on: the
primary button, the current selection, the active tool, the focus ring. It is
still a single `--c-accent` token, so one line brings a colour back if that is
ever wanted.

Depth does the work colour would: four large luminance blobs behind the glass so
it has something to refract, layered shadows, a lit top edge on every pane, and a
4.5% film of SVG noise to stop those gradients banding on 8-bit displays.

Every colour is declared once with CSS `light-dark()`, so the theme switch only
changes `color-scheme` and there is no second palette to keep in sync.

The three accessibility settings Apple's own glass was criticised for ignoring
are honoured: `prefers-reduced-transparency` drops the blur and makes surfaces
opaque, `prefers-contrast: more` strengthens borders and secondary text, and
`prefers-reduced-motion` removes the transitions.

### Scale

Type follows the macOS text styles, named as Apple names them: caption 11,
footnote 12, body 13, headline 15, title 17, display 21. Body is 13 because that
is what a Mac window uses. Spacing and control heights sit on the 4pt grid.

The golden ratio is used where it does real work and not as a grid: the display
step is body x 1.618, and the empty-state icon nests 40 inside 64. Line length is
capped in `ch` rather than pixels, because that is what readability depends on.

### Security sweep

`npm audit` reports no vulnerabilities in either the runtime or the development
tree. There is no `eval`, no `innerHTML`, no shell invocation anywhere in the
source. `localStorage` holds the theme and the language and nothing else; a
password is never written to it.

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

### Responsive

One layout, three shapes:

| Width | Shape |
| --- | --- |
| `< 640px` | Edge to edge, no window chrome, two tile columns, toolbars scroll sideways behind a fade |
| `640–1023px` | Floating window, sidebar still behind the menu button |
| `>= 1024px` | Sidebar pinned open |

Below 1024px the sidebar becomes a drawer rather than a second navigation: it is
the same component, so there is one thing to keep correct. Escape closes it, and
so does picking a tool.

On a coarse pointer every control grows to the 44px minimum touch target, and
the per-tile remove button stops hiding behind hover, since there is no hover to
reveal it. The viewport uses `dvh` so a phone's disappearing toolbar cannot crop
the footer, and `env(safe-area-inset-*)` keeps the interface clear of notches.

## Hosting it

The build is static files and nothing else: no server, no environment variables,
no API routes, so there is no server side to misconfigure or leak. `base` is
`'./'`, so it works from a subdirectory too, such as a GitHub Pages project site.

```sh
npm run build      # -> dist/
```

Drop `dist/` on Vercel, Netlify, Cloudflare Pages, GitHub Pages, or any static
host. `vercel.json` carries the build settings and the response headers;
`public/_headers` carries the identical headers for Netlify and Cloudflare Pages,
generated from the same values so the two cannot drift.

The headers set a strict Content-Security-Policy: `default-src 'self'`,
`connect-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`. A privacy
tool should not merely promise it never uploads anything; the CSP means that even
a compromised dependency has nowhere to send a file. The whole browser suite is
re-run against the built output served with these exact headers, so the policy is
known to be one the app can actually live under rather than one that looks good
in a config file. A test asserts the two header files still agree, because they
are maintained by hand and a policy that drifts between hosts is worse than no
policy at all.

`script-src` carries one addition, `'wasm-unsafe-eval'`. pdf.js decodes JBIG2 and
JPEG 2000 images in WebAssembly, and browsers refuse to compile a WebAssembly
module under a CSP that does not say so. The keyword permits exactly that and
nothing else: `eval` and the `Function` constructor stay blocked, which the
browser suite checks by running both from a real same-origin script rather than
through the automation channel, since that channel is exempt from CSP and would
have reported a pass either way.

Two things to keep in mind:

- **Serve it over HTTPS.** Encryption itself does not need a secure context, as
  `crypto.getRandomValues` is available either way, but everything else about
  handling someone's documents over plain http is a bad idea. Vercel, Netlify
  and Cloudflare all do HTTPS by default.
- **Do not switch on the host's analytics.** Vercel Analytics and Speed Insights
  inject a script that reports page views. It never sees a file, but it does make
  "nothing leaves this browser" less true than it is now, and it would be the
  first thing to fail the off-origin test.

## CLI

Put it on your PATH once, from the project folder:

```sh
npm link
```

That works the same on Windows, macOS and Linux: npm writes `convert.in` shims
into its own bin directory, including the `.cmd` and `.ps1` ones Windows needs.
The launcher is a Node script rather than a shell script for exactly that
reason, and because a shell script's executable bit does not survive a checkout
on Windows.

If npm's global prefix needs root on your machine, point a symlink at it instead:

```sh
ln -s "$PWD/bin/convert.in.mjs" ~/.local/bin/convert.in
```

Then:

```sh
convert.in                         # banner and the full guide
convert.in help id                 # the same guide in Bahasa Indonesia

convert.in images shot-*.png       # -> shot.pdf, beside the first input
convert.in images scan-*.jpg -o scan.pdf --size a4 --margin 24
convert.in merge part-1.pdf part-2.pdf -o whole.pdf
convert.in select scan.pdf 1-3,7   # -> scan-selected.pdf
convert.in rotate scan.pdf 90 --pages 2-4
convert.in split book.pdf 10       # -> book-pages/
convert.in protect scan.pdf        # asks for the password, never takes it from argv
convert.in unlock locked.pdf
convert.in watermark scan.pdf "CONFIDENTIAL" --opacity 0.2
convert.in number report.pdf --format "{n} / {total}" --position bottom-right
convert.in info scan.pdf
```

`-o` is optional: without it the result is named after the input and written
beside it. With several inputs the name comes from what they share, so
`shot1.png … shot12.png` becomes `shot.pdf`. Nothing is overwritten without
`--force`.

Page order is the order the files arrive in, which is however your shell
expanded the glob. Most shells put `shot10.png` before `shot2.png`; this zsh has
`numeric_glob_sort` on, so it does not. `--sort natural` counts the way you do,
and a warning is printed whenever the incoming order looks lexical.

Pages are 1-based, `1-3,7` and `8-` both work, and repeating a page duplicates
it. `select`, `rotate` and `split` take their argument positionally or as a flag,
so `select scan.pdf 1-3` and `select scan.pdf --pages 1-3` are the same thing.

Windows paths are translated automatically, so `'C:\Users\me\shot.png'` resolves
to `/mnt/c/Users/me/shot.png`. Quote it, or the shell eats the backslashes before
the CLI ever sees them.

### Passwords

Encryption is AES-256 written as `V 5` / `R 6`, which is the setting Acrobat
calls **Acrobat X and later**, its strongest. The test suite reads those markers
straight out of the produced bytes rather than trusting the library.

Acrobat's two passwords are both here. The **open password** is needed to read
the file at all; the **permissions password** lifts the restrictions (printing,
changes, copying). Acrobat refuses to let the two be identical and so does this:
if they match, anyone who can open the file already holds owner rights and the
restrictions are decoration.

The CLI asks for passwords rather than taking them as arguments, because a
password in `argv` lands in shell history and is visible in `ps`. Pipe one in for
scripts:

```sh
printf '%s' "$PASSWORD" | convert.in unlock locked.pdf
```

Passing `--open-password` or `--password` still works and prints a warning saying
why it is a bad idea. In the web app, password fields are never persisted and are
cleared as soon as the file is saved.

Screen-reader access is always permitted, which is what Acrobat also forces for
256-bit AES. Denying a screen reader is not a restriction worth offering.

#### What it does not do

Three limits are worth stating plainly, because none of them are defects in this
tool: they are properties of the format, and they hold for Acrobat too.

**Permissions are a request, not a lock.** Printing, copying and editing are bits
in the `/P` field that a reader is expected to honour. Revision 6 stores them
again inside the encrypted `/Perms` entry, so tampering with them is detectable,
but a reader that simply ignores `/P` will print the document anyway. If a file
carries only a permissions password, anyone can open it, and what happens next is
the reader's choice. Only an open password keeps a document from being read.

**Encryption is not a signature.** `AESV3` is AES in CBC mode with no integrity
check, so ciphertext can be altered without the change being detected. [Practical
Decryption exFiltration](https://dl.acm.org/doi/10.1145/3319535.3354214) (ACM CCS
2019) turned that malleability into working attacks against all 27 readers its
authors tested. [ISO/TS 32003:2023](https://pdfa.org/pdf-2-0-adds-aes-gcm-support/)
adds AES-GCM to PDF 2.0 to close it, but Acrobat does not read GCM yet, so AESV3
remains the only choice a recipient can actually open. An encrypted PDF keeps its
contents from someone without the password; it does not prove the file arrived
the way it left. A digital signature does that, and this tool does not sign.

That paper's other attack needs a *partially* encrypted file, which the format
permits and some writers produce. This one never does: `/StmF` and `/StrF` both
point at the standard crypt filter, and the audit greps the finished bytes for
the source document's own title, author, page text and field names to prove none
of them survived in the clear.

**The password is the whole strength.** Revision 6 derives the key with a
hardened SHA-2 loop rather than the single MD5 of the older revisions, which
makes each guess far more expensive, but it is not a memory-hard function such as
Argon2 and offline guessing is still the attack that matters. A short password is
a short password whatever the cipher is.

The encryption is checked against an implementation that is not the one writing
it. `test/encryption-audit.py` opens the produced files with **pypdf** and
asserts, among other things, that the encryption dictionary is `/V 5 /R 6
/CFM /AESV3` with `/U` and `/O` at 48 bytes and `/UE`, `/OE`, `/Perms` at 32, 32
and 16; that the right password opens the file and a wrong or empty one does
not; that `--printing low` really clears the high-resolution bit; and that
title, author, keywords and form fields survive both locking and unlocking.

```sh
npm run audit:fixtures -- ./fixtures     # writes the documents to inspect
python3 test/encryption-audit.py ./fixtures
```

The fixtures are generated rather than committed: the audit needs a document with
something to lose, and a binary blob in the repository would itself have to be
trusted. `pypdf` is the only extra requirement.

Two defects it caught, both now fixed:

- Unlocking used to lose the document's title, author, subject and keywords. The
  decrypting re-parse drops the trailer's `/Info` reference, so the information
  dictionary was still in the file with nothing pointing at it.
- The unlocked file kept the old encryption dictionary as an orphan object. Some
  readers, including this project's own, scan for `/Encrypt` and so called the
  unlocked file locked.

`pdf to images` has no CLI equivalent: pdf.js rasterises onto a canvas, which the
browser has and Node does not.

## Layout

```
src/core/     plain TypeScript, no UI imports. Uint8Array in, Uint8Array out.
src/prompt.ts   hidden password prompt, plus the piped-stdin path for scripts.
src/cli.ts    argument parsing over that core, via node:util parseArgs.
src/help.ts   banner and the guide, English and Bahasa Indonesia.
src/term.ts   TTY dimming, WSL detection, byte sizes.
bin/convert.in  POSIX launcher, symlink it onto your PATH.
src/ui/       React components. The tools are thin wrappers around core.
src/ui/i18n.ts   Both languages in one object; `id` must match `en` or the build fails.
src/ui/prefs.ts  Theme and language, persisted, with storage failures swallowed.
test/         node:test over core, no framework.
test/browser/   the built app driven in a real browser, under the shipped headers.
test/encryption-audit.py  the produced PDFs read back by pypdf, not by pdf-lib.
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

Two suites reach past the core and need Python, because the whole point of both
is to check the work with something other than the library that produced it:

```sh
npm run build
npm run audit:fixtures -- ./fixtures   # documents with something to lose
python3 test/encryption-audit.py ./fixtures   # pypdf reads the encryption back
npm run test:browser                   # the built app, driven in Chromium
```

`npm run test:browser` serves `dist/` with the contents of `public/_headers` and
drives every tool through the interface: images in, pages out, a watermark that
has to be findable in the text of the saved file, a password that has to open it
and a wrong one that must not. It also checks what should *not* happen: no
request leaves the origin, pdf.js never warns that an asset is missing, and
nothing is refused by the Content-Security-Policy.

They need `playwright` (plus `python3 -m playwright install chromium`) and
`pypdf`. Nothing else in the project does.

## Deliberate limits

- **JPEG and PNG only** for image input. JPEGs are embedded byte for byte, so nothing
  is re-compressed. HEIC would need a ~1 MB wasm decoder, which is not worth carrying
  until an iPhone photo actually shows up.
- **No compress tool.** Worthwhile PDF compression rebuilds the whole document the way
  Ghostscript does. What a browser can manage is re-encoding the images inside, which
  does nothing at all for a text-only PDF.
- **Watermarks and page numbers are Latin-1 only.** They draw with the built-in
  Helvetica so nothing has to be shipped or fetched; text outside Latin-1 is
  refused with a message rather than silently dropped.
- **Form fields do not survive page rearranging.** Merge, select and split are
  built on page copying, which carries a form's widgets but not the AcroForm
  that gives them names and values. Both the CLI and the web app say so before
  doing it. Rotate, watermark, number and protect leave forms intact.
- **A permissions-protected file has to be unlocked first** before the other
  tools touch it. pdf-lib will not open an encrypted document without being
  handed a password, even the empty one a reader would use.
- **No Office formats.** docx to PDF needs LibreOffice on a server, and a server is
  the one thing this project does not have.
- **No Web Worker** around pdf-lib, so a very large job will freeze the tab while it
  runs. pdf.js already has its own worker, so previews and rasterising are fine.

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

pdf.js is the one to keep an eye on: it is Apache-2.0, whose attribution clause
is stricter than MIT's. Adding a runtime dependency means adding it to the list
in `scripts/notices.mjs`.

Two things this repository cannot settle for you. Whether the name **convert.in**
collides with an existing trademark is worth checking before putting it on a
domain. And if any of this were written on an employer's time or equipment, their
IP agreement may give them a claim on it regardless of the licence file.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the terms contributions are accepted
under.
