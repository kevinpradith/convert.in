# Changelog

All notable changes to this project are recorded here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While the version is below 1.0.0 the CLI flags and the `src/core` exports may
still change between minor versions.

## [Unreleased]

## [0.2.1] - 2026-08-26

Three fixes for files the toolkit refused, or failed at without saying so.

### Fixed

- **A PDF locked only by a permissions password can be worked on again.** Such a
  file is encrypted, but its open password is empty, so every reader opens it
  without prompting. Every tool here refused it anyway, with a message telling
  the person to unlock a file they had no password for, and `info` printed the
  page size and then failed before reaching the metadata. All of them now open
  it the way a reader does. The output carries no encryption dictionary, because
  those restrictions live in a flag a reader chooses to honour rather than in
  the cipher, and the document keeps its title and author instead of losing them
  to the decrypting parse.
- **One sentence for a locked file, whichever tool met it first.** The page work
  goes through pdf-lib and the previews, exports and redaction through pdf.js,
  and only the first had its wording translated. A password-protected file
  dropped into PDF to images, Organize or Redact came back as "No password
  given", and a broken cross-reference table as "Invalid PDF structure."
- **A dropped file a tool cannot use is named rather than swallowed.** Dropped
  files are filtered by extension, since a drop event carries no bytes yet, and
  a pile that filtered down to nothing was discarded in silence: the file
  vanished under the pointer and the tool sat there as though nothing had been
  dropped. Such a pile now goes through whole, so the file lands in the list
  under its own name and the run says what is wrong with it. A mixed pile is
  still filtered down to what the tool can use.

## [0.2.0] - 2026-08-26

Four new tools, a size limit to compress towards, and a long run of fixes for
things that reported success over work that had not happened.

### Added

- **Compress PDF**, as a tool and as `compress`. The JPEG images inside the
  document are re-encoded, and optionally capped to a longest side, which on a
  scan is 60 to 90 percent of the file. A PDF that is only text is told it has
  nothing to shrink rather than shown a hollow "0% smaller", and an image is
  only replaced when the new one is genuinely smaller, so a file that is already
  tight comes back byte for byte rather than fractionally larger.
- **Sign PDF**, as a tool and as `sign`. Draw a signature with a mouse, finger
  or stylus, or bring a PNG of one, and place it in any corner of any page. The
  last page is the default, because that is where a contract is signed. Both the
  tool and the guide say plainly that this draws a picture and is not a
  cryptographic signature.
- **Scaling** on the Convert tool and on `convert`, through `--width`,
  `--height` and `--stretch`. Giving one side lets the other follow the picture;
  giving both fits it inside that box unless `--stretch` says otherwise. Scaling
  averages over the area each output pixel covers rather than sampling one, so a
  reduced photo keeps its detail instead of shimmering, and transparent pixels
  contribute coverage without dragging their colour into the edges.

- **No file limits anywhere.** Every tool and command that turns one file into
  one file now runs over a whole list: Compress, Sign, Stamp and Protect in the
  window, and `compress`, `sign`, `select`, `rotate`, `protect`, `unlock`,
  `watermark`, `number` and `info` on the command line. One password locks a
  folder of statements, one drawn signature covers a folder of contracts, and
  the CLI works out every output name before writing the first file, so a run
  that would overwrite something, or give two inputs the same name, stops before
  it has done half the job.
- **A size limit to compress towards**, as `--max-size` on `compress` and as
  "Fit under" in the tool. An upload form states an outcome, not a quality
  setting: a visa application wants 500KB and an HR portal 2MB, and every
  compressor answers with a slider that has to be guessed at and repeated. This
  starts gentle and only goes harder while the file is still too big, and each
  attempt starts from the original, so a document that needs four tries is
  compressed once rather than four times over. A file already under the limit is
  handed back untouched, and a limit nothing can meet still writes the smallest
  attempt and says how far short it fell.
- **`--dpi` on `images`**, and the matching field in the tool, for the page size
  a `fit` page is worked out from.
- **Clean PDF**, as a tool and as `clean`, with `info` now listing what it would
  remove. A PDF names its author, the software that wrote it, the company that
  software was registered to, and the times it was made and last saved, in an
  information dictionary and again in an XMP packet that says the same things in
  XML. None of it shows while reading the document, so a CV, a report or a
  leaked draft carries it out of the building intact. This lists every piece and
  removes every piece, including the packet a page can carry of its own.
  Unlinking an XMP packet is not removing it, since an object nothing points at
  is still written out in full and still readable with `strings`, so the object
  itself goes.
- **One sheet for every page**, as `resize` and as the Sheet control in
  Organize. A PDF does not require one page size, and a document assembled from
  a scan, an export and a downloaded form quite legally holds three; that is
  fine on screen and chaos on paper, where the printer rescales, shifts the
  margins or changes tray at every size change. The content is scaled to fit and
  centred rather than stretched, annotations scale with it, and the sheet turns
  to match each page unless told otherwise, so a landscape chart is not
  letterboxed. A5, A4, A3, Letter and Legal.
- **Bookmarks come with their pages.** A PDF's table of contents is a tree
  hanging off the catalogue whose entries name their pages by reference, so
  copying pages left every one of them pointing at objects that came nowhere and
  the whole outline was dropped. `assemblePages` now rebuilds the tree against
  the pages that came across, so merge, select, split and reorder all keep it.
  Merging lays the sources' outlines end to end; an entry whose page was left
  out is dropped rather than pointed somewhere plausible. Destinations written
  out in full and destinations named through the `/Names /Dests` tree are both
  resolved. Interactive forms are still lost by page copying, and the tools
  still say so.
- **Redact PDF**, in the window. A black rectangle drawn over a paragraph hides
  nothing: PDF renders in layers, so the characters underneath survive the shape
  on top of them, still selectable and still copyable, which is how the details
  behind the bars in the Manafort filings were read. This removes rather than
  covers: each page is rendered to pixels, the rectangles are painted onto those
  pixels, and the document is rebuilt from the images, so there is no text object
  left to select, no vector path to lift and no earlier revision to recover. The
  information dictionary and the XMP packet go with it, since a redacted document
  that still names its author has only moved the leak.

  Two ways to say where. Dragging suits a signature or a corner of a scan.
  Searching suits what dragging is worst at, a name that appears forty times
  across nineteen pages, and it works without a pointer, which dragging cannot.
  The cost is stated in the tool rather than buried: the text stops being
  selectable for the recipient too, and the file is usually larger. The browser
  suite checks the claim from the bytes out, that no text can be extracted from
  any page of the result and that none of the original words are anywhere in it.

  There is no `redact` command, for the same reason there is no `PDF to images`
  one: the rendering runs through a canvas.
- **An end-to-end suite for the command line**, `npm run test:cli`. It drives
  every command once and reads the result back, covering the layer between a
  typed command and `src/core` that nothing else touched: argument parsing,
  output naming, the check that works out every output path before writing the
  first file, and the warnings printed alongside. 34 checks.
- **Cross-origin isolation**, `Cross-Origin-Embedder-Policy: require-corp` and
  `Cross-Origin-Resource-Policy: same-origin` beside the existing
  `Cross-Origin-Opener-Policy`. Every asset here is same-origin, so the cost is
  nothing, and the pages land in their own process group where a Spectre-class
  read of another origin has nothing to reach.
- **info now says what a file's encryption actually covers**, not just that it
  has some. The format lets ciphertext and plaintext sit side by side: `/StmF`
  and `/StrF` name the crypt filter each kind of object goes through, and
  `/Identity` means none. A document can announce AES-256, prompt for a
  password, and still carry every page in the clear for anyone with a text
  editor, without breaking the specification, which is the shape the PDFex work
  (Müller et al., ACM CCS 2019) builds its direct-exfiltration attack on. Such a
  file is now reported as "encrypted in part only", with the readable parts
  named, in `info`, in `unlock`, and in the Protect tool. Nothing this project
  writes is ever partly encrypted; the audit builds one of these and checks the
  report against the bytes.
- **`odd` and `even` page ranges**, wherever `--pages` is taken. A duplex feeder
  that flips the back of every sheet leaves one of those halves upside down, and
  `2,4,6` up to 300 is not a page range anybody should have to type.
- **300 dpi** on PDF to images, in place of the 288 that four times 72 gives.
  300 is the number a print shop asks for.
- **Natural order in Images to PDF.** Files arrive sorted the way a person
  counts, so `shot2.png` comes before `shot10.png` rather than after it.
  Dragging a tile still overrides it. The CLI already had this as `--sort
  natural`.

### Fixed

- **A page number that cannot fit where it was asked for is refused.** `sign`
  has always checked; `number` was drawing into the void, so a margin bigger
  than the page put the label off the edge and a page number that is not on the
  page looked exactly like one that worked.
- **A picture that stops before its own end is named before it is converted.**
  A decoder handed half a file does not refuse it: libjpeg fills what it never
  received with grey, hands back a full-size picture, and prints "Premature end
  of JPEG file" to standard error, which names no file and offers no advice. The
  run then reported success over an image whose bottom was missing. `convert`
  and `images` now say which file is cut short and that they are going ahead
  with what is there.
- **The codecs no longer write on the terminal.** Every Emscripten build is
  started with its printing routed into this project instead, so the C
  libraries' own lines stop landing in the middle of a batch's output. Nothing
  is lost by it: the one condition they reported that a person could act on is
  the one now detected here, with the filename, and on a failed decode their
  last words ride along on the error's cause for whoever opens a console.
- **Redact PDF replaces the document it is given rather than adding to it.**
  It says one at a time and drew one at a time, but the file before was left
  loaded underneath: the previews showed the second document, the search read
  the first, and pressing Redact produced two files. Found by the browser
  suite, which could not download the result of the second run.
- **A page with no width still goes on the sheet.** `resize` skipped one
  entirely, so being asked to put every page on A4 quietly left one at nothing
  by three hundred points.
- **A destination name tree whose kid is its own parent is walked once**, rather
  than until the step count gives up.
- **Page previews are released when they are replaced.** Dropping a second file
  while the first was still rendering left a list of object URLs behind that
  nothing would ever revoke. Revoking now happens inside the state update, so
  no list can be replaced without being released, in Redact and in Stamp.
- **A cropped page is measured and drawn on as the part that is shown.** A page
  carries a MediaBox saying how big the sheet is and, often, a CropBox saying
  how much of it to display; where they differ the CropBox wins and everything
  outside it is simply not drawn. Nothing read it, so a 600-point page cropped
  to its middle 300 was reported by `info` as 600, and a page number asked for
  the bottom right corner landed on part of the sheet no reader displays.
  `visibleBox` is now what `info`, `watermark`, `number`, `sign` and `resize`
  all measure against.
- **Resizing a page whose box does not start at the origin lands square.**
  Scaling happens about the origin, and a cropping tool leaves boxes like
  `[50 50 645 891]`, so the content came out shifted by the corner it started
  at. The old crop is also removed rather than left behind, where a reader would
  have gone on showing the part of the sheet it named, and annotations are moved
  as well as scaled: a comment that keeps its old coordinates while the page
  shifts under it points at the wrong line.
- **A redaction rectangle that is not numbers is refused**, rather than clamped
  into one that paints nothing. A redaction that quietly covers nothing is the
  one failure that tool must not have.
- **An outline that points back at itself no longer runs away with the merge.**
  Nothing in the format stops a bookmark being its own sibling, and following
  one with only a counter to stop it produced ten thousand copies of the same
  entry. With the guard removed the test hangs; with it, it finishes in 23ms.
- **Sizes are quoted in the decimal units SI defines**, where a kilobyte is 1000
  bytes. They were divided by 1024 and labelled `kB`, which meant the compressor's
  "fit under 200 kB" was offered as "195 kB" and `--max-size 500kb` aimed at
  512,000 bytes. An upload form that says 500KB never says which it means, and
  the decimal reading is the smaller of the two, so a file under it is under
  both. Windows will now show these files as slightly smaller than this tool
  does; macOS, most Linux desktops and every disk on the shelf already agree
  with it.
- **A download name can no longer carry a bidirectional override.** Those
  characters have no glyph and reorder what follows them, so a file ending in
  one plus `gnp.exe` is listed by the browser as ending in `.png` — the filename
  form of the reordering trick catalogued for source code as CVE-2021-42574.
  The Windows-illegal characters `< > : " | ? *` go too, along with a trailing
  dot or space, and truncating a very long name now keeps the extension instead
  of leaving a file the operating system cannot open.
- **Every GitHub Action is pinned to a commit** rather than a tag, and the
  workflow token is no longer left in `.git/config`. Moving a tag is exactly how
  `tj-actions/changed-files` was turned into a secret exfiltrator across 23,000
  repositories in March 2025 (CVE-2025-30066). The two Python packages CI
  installs are pinned in `test/requirements.txt`, which Dependabot watches.
- **A file locked only by a permissions password no longer demands a password
  that does not exist.** Such a file opens with an empty one, which is what every
  reader does and what the web app already did, but `protect` on the command line
  failed with "supply the password to open it" and the only way through was to
  work out that the answer was `--password ""`. Opening now tries the empty
  password before giving up. A file that really is locked still refuses.
- **Three of the library's own error messages no longer reach a person
  verbatim.** An empty password against a locked file answered `NEEDS PASSWORD`;
  a damaged encryption dictionary answered `invalid key length: 7` or
  `unsupported encryption algorithm`, naming a field nobody chose in a file they
  did not write.
- **A page named twice is turned once.** `rotate --pages 1,1`, and now any range
  that overlaps `odd` or `even`, rotated that page once per mention.
- **A photo taken sideways no longer becomes a sideways page.** A phone writes
  the sensor's pixels and a tag saying which way the phone was held. Embedding
  the JPEG untouched is what keeps `images` lossless, and it is also what lost
  that tag, so every portrait photo landed on its side. The page is now turned
  instead of the pixels, which costs nothing and keeps the file byte for byte
  the original. The four orientations that mirror as well as turn are decoded
  and rewritten, since a page cannot be flipped.
- **A `fit` page is now the size the image says it is.** One pixel was mapped to
  one point, which made a 3000-pixel scan a page 41 inches across. The page is
  now worked out from the resolution the file claims, read from a PNG's `pHYs`
  chunk or a JPEG's EXIF and JFIF blocks, so that same scan at 300dpi becomes 10
  inches. An image that claims nothing is treated as 96dpi, which is what a
  screen calls an inch, and `--dpi` overrides both.
- **The page under an image is painted white.** A PDF page has no colour of its
  own, so a transparent PNG showed whatever the reader put behind it, which in a
  dark-mode reader is black.
- **A page stored sideways is now stamped in the corner the reader sees.** A
  page carrying `/Rotate`, which is what a scanner produces when the sheet went
  in the short way, is drawn on in its own unrotated space. `sign`, `number` and
  `watermark` all worked out their corner from the stored box, so a signature
  asked for bottom right landed bottom left and ran up the side of the page, and
  a 45 degree watermark leaned the other way. All three now place their content
  on the page as it is displayed. `sign` also measures against the page the
  reader sees, so a wide signature on a turned portrait page is no longer
  refused for not fitting a width that is not the one it is going onto.
- **`unlock --force` no longer leaves the decrypted file readable by everyone.**
  It asks for `0600`, but `writeFile` applies a mode only to a file it creates,
  so overwriting an existing file silently kept that file's old permissions. The
  mode is now set after the write as well.
- **A codec that gives up says so instead of `[object Object]`.** The
  WebAssembly codecs abort by throwing an object rather than an `Error`, so a
  CMYK JPEG, which is what comes out of a print workflow, reached both the
  terminal and the browser as those two words. Aborts are now turned into real
  errors naming the likely reason, and anything else thrown with a message is
  read rather than stringified.
- **A width typed into the size boxes cannot ask for more pixels than exist.**
  There was no ceiling, so a large enough number reached the allocator and came
  back as "Array buffer allocation failed" in a terminal, or a hung tab in a
  browser. The pair of sides is now checked against the same limit a browser
  canvas has.
- **Rasterising a very large page says so rather than writing blank images.**
  Past a canvas's size limit a browser hands back transparent black instead of
  failing, so a poster-sized page at 288 dpi exported as empty files.
- **A PDF whose page tree points back at itself** is reported as damaged
  instead of as "Maximum call stack size exceeded".
- **A run over several files checks all of them before writing any.** A typo in
  the fortieth filename used to be found after thirty-nine files had been
  written.
- **`watermark a.pdf b.pdf` is refused instead of stamping "b.pdf" across
  a.pdf.** When the trailing word also names a file that exists, there is no way
  to tell the text from an input, so it asks for `--text`.
- **Images carrying a colour-key `/Mask` are left alone by `compress`.** The
  ranges are counted in the image's own colour space, and everything comes back
  out as RGB, so a mask written for a greyscale scan would have been read
  against the wrong components.
- **A saved file named " .bashrc" no longer keeps its leading dot.** The name
  was trimmed after the dots were stripped rather than before.
- **A picture the codecs cannot read says so in words.** A truncated PNG
  reported "`unwrap_throw` failed", one whose header claims a size the decoder
  will not allocate reported "unreachable", and libwebp managed "Decoding
  error". None of the three named the file or said what to do about it. The
  bomb case was measured rather than assumed: 147ms and 9 MB, because the
  decoder refuses the allocation instead of attempting it, so there is nothing
  to guard against ahead of time and only the wording needed fixing.
- **Pages and images can be picked out from a keyboard.** The tiles carried a
  click handler and nothing else, so choosing which of them to work on was a
  mouse-only action; the range box covers whole spans but not "this one and
  that one". They are now checkboxes that take focus and answer to space.
- **A failure is announced, not only drawn.** The error bar is the only place a
  tool ever says something went wrong, and it said it silently.
- **A double click no longer saves everything twice.** A click reaches its
  handler before React has re-rendered the button that disabled itself, so both
  halves of an ordinary double click got through. Measured on the built app: one
  double click on "Download 2" asked the browser to save four files, and it
  scaled with whatever number the button was showing. Splitting a forty-page PDF
  was eighty saves. Every handler that hands files over now runs at most once at
  a time.

### Changed

- **TypeScript 7**, the native compiler. It checks this project in about 1.8
  seconds against about 10.3 for 5.9, measured here, and needs no source
  changes.
- **`@types/node` moved down to 20, not up to 26.** The project supports Node
  20.19 and above, and typing against a newer release lets an API that does not
  exist on the floor pass the typechecker. Moving it down turns the engines
  field from a claim into something that is checked; everything already passed
  against it, so the claim was true. Dependabot is told not to offer the major.
- `--position` no longer carries one default for every command. `number` still
  puts a page number at the bottom centre; `sign` puts a signature at the bottom
  right, which is where a form is signed.
- Where a command reads a word after the file name, the matching flag now says
  it once instead so that every positional can be a file: `--pages` for
  `select`, `--text` for `watermark`, `--by` for `rotate` and `--signature` for
  `sign`. The trailing word still works when there is one file.
- Compress, Sign, Stamp and Protect now make the file and then offer the
  download, rather than doing both on one click. A single click that also saves
  has nowhere to say it produced twenty.
- `unlock` asks for a password at the first file that needs one and keeps it for
  the rest, and leaves an unencrypted file in a list alone with a warning
  instead of failing the whole run.

## [0.1.0] - 2026-08-24

First tagged release. Six tools in a browser app, eleven commands on the command
line, and one `src/core` shared by both so a change lands in both at once.

### Added

- **Convert images.** PNG, JPEG, WebP, AVIF and JPEG XL in any direction, with
  GIF, BMP, TIFF, ICO, HEIC and SVG readable on the way in. The same WebAssembly
  codecs run in the browser and at the command line, so the same file converts to
  the same bytes in both. Quality defaults are the settings measured to look
  alike rather than the same number, and the CLI reports what each file cost or
  saved.
- **Images to PDF.** One image per page, fit-to-image or A4 or Letter, with an
  optional margin. A JPEG is embedded byte for byte; anything else is decoded and
  re-written as a lossless PNG, because those are the only two encodings a PDF
  can hold.
- **Organize PDF.** Merge, reorder, rotate, delete and duplicate pages across any
  number of documents, saved as one file or as one file per page.
- **Stamp PDF.** A watermark across the pages or page numbers on them, on the
  whole document or on selected pages.
- **Protect PDF.** AES-256 written as V5/R6, which is what Acrobat calls
  "Acrobat X and later", plus Acrobat's own permissions vocabulary. Unlock takes
  the protection off again.
- **PDF to images.** Pages rasterised to PNG or JPEG at 72, 144 or 288 dpi.
- **Command line** with `convert`, `images`, `merge`, `select`, `rotate`,
  `split`, `protect`, `unlock`, `watermark`, `number` and `info`. Page ranges are
  parsed by the same function the web app uses, down to the error messages.
- **Two languages**, English and Indonesian, and three appearances, Auto, Light
  and Dark, remembered in `localStorage`.
- **Third-party licence notices** generated from what is actually installed and
  shipped inside `dist/`, since the bundle carries MIT and Apache-2.0 code that
  requires its notices to travel with it.

### Security

- Nothing is uploaded, and this is tested rather than promised: the browser suite
  fails if a single request leaves the origin during a full session with every
  tool.
- A strict Content-Security-Policy ships in `vercel.json` and `public/_headers`,
  with `default-src 'self'`, `connect-src 'self'`, `object-src 'none'` and
  `frame-ancestors 'none'`, so even a compromised dependency has nowhere to send
  a file. `script-src` adds `'wasm-unsafe-eval'` and nothing else; the suite
  checks that `eval` and the `Function` constructor are still blocked.
- Encrypted output is read back with an unrelated library, so a mistake both
  sides of `pdf-lib` agree on is still caught.
- Passwords over the 127 bytes an R6 password is truncated to are refused rather
  than silently cut, and a password given as a CLI argument is warned about
  because it survives in shell history and in `ps`.
- Restrictions that a reader can lift are called out before the file is written,
  not in a footnote afterwards.
- Metadata, EXIF and GPS are dropped by every image conversion, which the empty
  state says out loud.

### Fixed

- `sniff` no longer claims a format it cannot back up. An XML declaration says
  XML, not SVG, and every RSS feed starts with one; "BM" is two letters of any
  sentence. The root element now has to be `<svg`, and a bitmap has to carry a
  DIB header of a length the format defines.
- A converted file now belongs to the settings that produced it. Moving the
  quality slider or the lossless switch drops the finished files the way changing
  the format already did, instead of leaving a caption and a download that
  described a setting the controls no longer showed.
- Switching to a format with no lossless mode turns the lossless switch off with
  it. It used to stay on while its control was hidden, so the encoder refused a
  request there was no longer any way to withdraw.
- A file that fails to read while being added reports why rather than leaving an
  empty grid.
- `convert photo.png webp --to avif` is refused instead of quietly picking one of
  the two answers.

[Unreleased]: https://github.com/kevinpradith/convert.in/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/kevinpradith/convert.in/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/kevinpradith/convert.in/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/kevinpradith/convert.in/releases/tag/v0.1.0
