# Command line

Every tool in the browser window is here, over the same `src/core`, so a
change lands in both at once. The README covers installing it and the dozen
commands worth knowing; this is the rest, including what each image format
costs and what a password on a PDF does and does not protect.

The command is `convert.in` however it was installed; the package is
[`convert-in`](https://www.npmjs.com/package/convert-in), because the two are
named by different rules. Released versions carry an npm provenance attestation,
built by the workflow in `.github/workflows/release.yml` with no publishing token
in this repository at all.

`npm link` works the same on Windows, macOS and Linux: npm writes `convert.in`
shims into its own bin directory, including the `.cmd` and `.ps1` ones Windows
needs. The launcher is a Node script rather than a shell script for exactly
that reason, and because a shell script's executable bit does not survive a
checkout on Windows.

If npm's global prefix needs root on your machine, point a symlink at it
instead:

```sh
ln -s "$PWD/bin/convert.in.mjs" ~/.local/bin/convert.in
```

Then:

```sh
convert.in                         # banner and the full guide
convert.in help id                 # the same guide in Bahasa Indonesia

convert.in convert photo.png --to webp     # -> photo.webp, beside the input
convert.in convert *.heic --to jpeg -o out/
convert.in convert logo.png --to webp --lossless
convert.in images shot-*.png       # -> shot.pdf, beside the first input
convert.in images scan-*.jpg -o scan.pdf --size a4 --margin 24
convert.in compress passport.pdf --max-size 500kb
convert.in merge part-1.pdf part-2.pdf -o whole.pdf
convert.in select scan.pdf 1-3,7   # -> scan-selected.pdf
convert.in rotate scan.pdf 90 --pages 2-4
convert.in rotate scan.pdf 180 --pages even   # the half a duplex feeder flipped
convert.in resize report.pdf a4    # every page on one sheet, scaled to fit
convert.in split book.pdf 10       # -> book-pages/
convert.in protect scan.pdf        # asks for the password, never takes it from argv
convert.in unlock locked.pdf
convert.in watermark scan.pdf "CONFIDENTIAL" --opacity 0.2
convert.in number report.pdf --format "{n} / {total}" --position bottom-right
convert.in info offer.pdf          # pages and size, what it says about who made
                                   # it, and what its encryption really covers
convert.in clean offer.pdf         # -> offer-clean.pdf, saying nothing
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

## Image formats

`convert` reads PNG, JPEG, WebP, AVIF and JPEG XL and writes the same five. The
browser app reads six more, GIF, BMP, TIFF, ICO, HEIC and SVG, because the only
decoders for those are the ones a browser already ships.

Both surfaces run the same WebAssembly codecs, the ones
[Squoosh](https://github.com/GoogleChromeLabs/squoosh) settled on after
measuring, packaged as [jSquash](https://github.com/jamsinclair/jSquash) and
licensed Apache-2.0: MozJPEG, libwebp, libavif, libjxl and Oxipng. So a file
converted in the window and the same file converted at the prompt come out
identical. They are loaded on demand, because the AVIF encoder alone is 3.5 MB
and nobody should download it to turn a PNG into a JPEG.

The browser decodes with `createImageBitmap` first and falls back to those same
codecs, which is what makes the extra six formats work and what makes JPEG XL
work in a browser that has never heard of it.

Quality is 1 to 100. The scales are not comparable between formats, so the
defaults are deliberately different numbers, chosen to look alike rather than to
read alike. JPEG 80 is the long-standing web default and the point past which
MozJPEG's gains flatten out; the WebP and AVIF figures come from
[Malte Ubl's DSSIM measurements](https://www.industrialempathy.com/posts/avif-webp-quality-settings/)
against JPEG at matched quality; JPEG XL's is libjxl's own.

| Format  | Default  | Why                                                                                |
| ------- | -------- | ---------------------------------------------------------------------------------- |
| JPEG    | 80       | the reference                                                                      |
| WebP    | 82       | measured equal to JPEG 80                                                          |
| AVIF    | 64       | measured equal to JPEG 80, at roughly a third off the size                         |
| JPEG XL | 75       | libjxl's default, on the libjpeg scale                                             |
| PNG     | lossless | then run through Oxipng, which on flat graphics is routinely an order of magnitude |

Three things happen to a file on the way through, and all three are the point.

**Metadata is dropped.** Converting decodes to pixels and encodes again, so EXIF,
GPS coordinates, camera serial numbers, editing history and colour profiles are
left behind. A photo posted straight from a phone otherwise carries where it was
taken.

**A sideways photo is turned the right way up.** JPEG records the camera angle in
a tag rather than in the pixels, and
[no other format carries that tag](https://zpl.fi/exif-orientation-in-different-formats/),
so the rotation is baked into the pixels instead. Both sides do this: the
browser through `createImageBitmap`'s `imageOrientation: 'from-image'`, and the
CLI through MozJPEG's own orientation handling. `test/browser/suite.py` bolts an
orientation tag onto a JPEG by hand and checks a 240x180 file comes out 180x240.

**Transparency is flattened for JPEG**, which has no alpha channel, onto
`--background` (white unless told otherwise). Every other format keeps it. Without
this, transparent pixels land on whatever was underneath them, which in most
drawing tools is black.

Animation is not kept: an animated GIF or WebP converts as its first frame.

## Passwords

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
but a reader that simply ignores `/P` will print the document anyway.

Two consequences are worth being blunt about, because both were confirmed
against this tool rather than assumed:

- **Whoever holds the open password can remove the restrictions**, including
  with `convert.in unlock`. Anyone able to decrypt the file holds the file
  encryption key, and the permissions password protects nothing from them. Set
  restrictions to state an intention, not to enforce one against a reader who
  already has the document open.
- **A permissions-only file comes apart with no password at all.** Its open
  password is empty, so it is not asked for. The CLI now says so instead of
  prompting for a secret that is not required.

Only an open password keeps a document from being read.

**Encryption is not a signature.** `AESV3` is AES in CBC mode with no integrity
check, so ciphertext can be altered without the change being detected. [Practical
Decryption exFiltration](https://dl.acm.org/doi/10.1145/3319535.3354214) (ACM CCS 2019) turned that malleability into working attacks against all 27 readers its
authors tested. [ISO/TS 32003:2023](https://pdfa.org/pdf-2-0-adds-aes-gcm-support/)
adds AES-GCM to PDF 2.0 to close it, but Acrobat does not read GCM yet, so AESV3
remains the only choice a recipient can actually open. An encrypted PDF keeps its
contents from someone without the password; it does not prove the file arrived
the way it left. A digital signature does that, and this tool does not sign.

That paper's other attack needs a _partially_ encrypted file, which the format
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

**Files this project did not write open too.** Every earlier standard revision is
still in circulation, so the audit has pypdf write the same document five ways,
RC4-40, RC4-128, AES-128, AES-256 revision 5 and AES-256 revision 6, and drives
`convert.in unlock` against each. All five open with the right password, refuse
the wrong one, keep their metadata, and re-protect as AES-256 revision 6, which
is the way to bring an old file up to the current cipher: unlock it, then lock it
again.

Two defects it caught, both now fixed:

- Unlocking used to lose the document's title, author, subject and keywords. The
  decrypting re-parse drops the trailer's `/Info` reference, so the information
  dictionary was still in the file with nothing pointing at it.
- The unlocked file kept the old encryption dictionary as an orphan object. Some
  readers, including this project's own, scan for `/Encrypt` and so called the
  unlocked file locked.

`pdf to images` has no CLI equivalent: pdf.js rasterises onto a canvas, which the
browser has and Node does not.

---

[Back to the README](../README.md)
