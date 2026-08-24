# Changelog

All notable changes to this project are recorded here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While the version is below 1.0.0 the CLI flags and the `src/core` exports may
still change between minor versions.

## [Unreleased]

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

### Fixed

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

[Unreleased]: https://github.com/kevinpradith/convert.in/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/kevinpradith/convert.in/releases/tag/v0.1.0
