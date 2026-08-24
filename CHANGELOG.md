# Changelog

All notable changes to this project are recorded here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While the version is below 1.0.0 the CLI flags and the `src/core` exports may
still change between minor versions.

## [Unreleased]

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
