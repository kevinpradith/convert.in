import { fileURLToPath } from 'node:url'
import { dim } from './term.ts'

/** Terminal copy: the banner, and the guide in both languages. */

const ART = String.raw`
 ┌─┐┌─┐┌┐┌┬  ┬┌─┐┬─┐┌┬┐ ┬┌┐┌
 │  │ ││││└┐┌┘├┤ ├┬┘ │  │││││
 └─┘└─┘┘└┘ └┘ └─┘┴└─ ┴ ·┴┘└┘`

/** Real path to the launcher, so the setup hint is copy-pasteable as printed. */
const LAUNCHER = fileURLToPath(new URL('../bin/convert.in.mjs', import.meta.url))

export type Lang = 'en' | 'id'

const TAGLINE: Record<Lang, string> = {
  en: ' image and PDF tools that never leave this machine',
  id: ' perkakas gambar dan PDF yang tidak pernah keluar dari mesin ini',
}

function banner(lang: Lang): string {
  return `${ART}\n${dim(TAGLINE[lang])}\n`
}

const EN = `
USAGE
  convert.in <command> [options]

COMMANDS
  convert <img...> --to <f>   Between PNG, JPEG, WebP, AVIF and JPEG XL
  compress <pdf...>           Re-encode the pictures inside a PDF
  sign    <pdf...> <sig.png>  Draw a signature image onto a page
  images  <img...>            JPEG and PNG into one PDF, one image per page
  merge   <pdf...>            Join PDFs in the order given
  select  <pdf...> <pages>    Keep those pages in that order: reorder, delete, extract
  rotate  <pdf...> [degrees]  Turn pages, 90 by default
  split   <in.pdf> [every]    One PDF per chunk of pages, 1 by default
  protect <pdf...>            Lock with a password, AES-256, Acrobat X and later
  unlock  <pdf...>            Take the password off a locked file
  watermark <pdf...> <text>   Stamp text diagonally across the pages
  number  <pdf...>            Print page numbers
  info    <pdf...>            Pages, file size, dimensions, whether it is locked

OUTPUT
  -o is optional. Without it the result lands beside the input:

    convert shot.png --to webp  ->  shot.webp
    convert *.png --to avif     ->  beside each file, or -o into one folder
    convert shot.png --to jpeg --width 800   ->  scaled on the way out
    compress scan.pdf      ->  scan-compressed.pdf
    sign    deal.pdf me.png ->  deal-signed.pdf
    images  shot.png       ->  shot.pdf
    images  shot1-12.png   ->  shot.pdf        named after what they share
    merge   a.pdf b.pdf    ->  a-merged.pdf
    select  scan.pdf 1-3   ->  scan-selected.pdf
    rotate  scan.pdf       ->  scan-rotated.pdf
    split   book.pdf 10    ->  book-pages/
    protect scan.pdf       ->  scan-protected.pdf
    unlock  scan.pdf       ->  scan-unlocked.pdf
    watermark scan.pdf X   ->  scan-watermarked.pdf
    number  scan.pdf       ->  scan-numbered.pdf

  Nothing is ever overwritten without --force.

MANY FILES AT ONCE
  Every command that turns one file into one file takes as many as you can name,
  and there is no limit and no queue, because the work happens here. images and
  merge already read a pile; split is the one that stays a single document.

    convert.in number *.pdf -o numbered/
    convert.in protect statements/*.pdf --open-password ...
    convert.in compress scans/*.pdf --quality 40 -o small/

  With one file, -o is that file. With several it is the folder they go into,
  and without it they land beside the originals. Every output name is worked out
  before the first one is written, so a batch that would overwrite something, or
  give two files the same name, stops before it has done half the job.

  Where a command takes a word after the file, name it with the flag instead and
  every word is a file: --pages for select, --text for watermark, --by for
  rotate, --signature for sign.

OPTIONS
  -o, --out <path>       Output file, or the folder for split and for many files
  -p, --pages <ranges>   1-based: "1-3,7" or "8-". Repeat a page to duplicate it
  -f, --force            Overwrite an existing file, or write into a used folder
      --to <format>      png, jpeg, webp, avif, jxl                  convert
      --quality <1-100>  Per-format default, see FORMATS              convert
      --lossless         Throw nothing away: png, webp, avif, jxl     convert
      --background <hex> Behind transparency in JPEG, default #ffffff convert
      --width <px>       Scale to this width, height follows        convert
      --height <px>      Scale to this height, width follows        convert
      --stretch          Give both sides exactly, ignoring the shape convert
      --max-side <px>    Shrink images past this many pixels       compress
      --max-size <size>  Squeeze until it fits, e.g. 500kb, 2mb    compress
      --signature <file> Same as the second positional             sign
      --size <mode>      fit (default), a4, letter                 images
      --orientation <o>  auto (default), portrait, landscape       images
      --dpi <n>          Pixels per inch a fit page is sized by    images
      --margin <pt>      White border, 0 for images, 28 for number
      --sort <mode>      given (default), natural                  images, merge
      --by <degrees>     Same as the degrees positional            rotate
      --every <n>        Same as the every positional              split
      --open-password <pw>          Acrobat's Document Open Password    protect
      --permissions-password <pw>   Acrobat's Permissions Password      protect
      --printing <level>            none, low, high                     protect
      --changes <level>             none, assembly, forms, comments, any  protect
      --no-copying                  Refuse copying of text and images   protect
      --password <pw>               Password the file already has  protect, unlock
      --opacity <0-1>               Default 0.12                        watermark
      --angle <degrees>             Default 45                          watermark
      --text-size <pt>              Auto for watermark, 10 for number   both stamps
      --position <corner>           top or bottom, plus left/center/right  number
      --start <n>                   First number printed, default 1     number
      --format <template>           {n} and {total}, default "{n}"      number
      --quality <1-100>             Default 55                          compress
      --width <pt>                  Signature width on the page, 150    sign
      --position <corner>           Default bottom-right                sign
      --margin <pt>                 From the page edges, default 36     sign
  -h, --help [id]        This guide. Add "id" for Bahasa Indonesia
  -v, --version          Print the version and exit

THE WEB APP
  Every command here has a tool in the window, and both sit on the same code
  underneath, so the two cannot drift apart. Start it with: npm run dev

    convert                       Convert images
    compress                      Compress PDF
    sign                          Sign PDF
    images                        Images to PDF
    merge, select, rotate, split  Organize PDF
    watermark, number             Stamp PDF
    protect, unlock               Protect PDF
    (no command)                  PDF to images, which needs a canvas

  Page ranges are typed the same way in both, because both run the same parser:
  put "1-3,7" in the Pages box in the toolbar.

  Two flags have no browser equivalent, on purpose. --force is meaningless there,
  since a download never overwrites anything. --sort natural is unnecessary,
  since you drag the tiles into the order you want.

MAKING A PDF SMALLER
  compress re-encodes the JPEG images inside the document. That is where nearly
  all the weight of a scan is, so a scanned file typically comes back 60 to 90
  percent smaller. --max-side is worth more than --quality on anything scanned
  above 300 dpi, because the extra pixels cannot be seen at printing size.

    compress scan.pdf                         quality 55, sizes untouched
    compress scan.pdf --max-side 1600         cap the long edge as well
    compress scan.pdf --quality 40 --max-side 1200

  --max-size names the outcome instead of the settings, which is what an upload
  form actually asks for: a visa application wants 500KB, an HR portal 2MB. It
  tries gentle settings first and only goes harder while the file is still too
  big, and every attempt starts from the original, so a document that needs four
  tries is compressed once rather than four times over. A file already under the
  limit is copied out untouched. If nothing gets it under, the smallest attempt
  is still written and the shortfall is reported.

    compress passport.pdf --max-size 500kb    the number the form asked for
    compress filing.pdf --max-size 5mb -o out/

  A PDF that is only text comes back the size it went in, and says so. There
  are no images in it to re-encode, and nothing here rewrites content streams
  or subsets fonts: Ghostscript and MuPDF both do, and both are AGPL, which
  this project cannot ship under.

  An image is only replaced when the new one is genuinely smaller, so a file
  that is already tight is returned untouched rather than made worse.

SIGNING
  sign draws a picture of a signature onto the page, the way signing a printout
  and scanning it back does. It is not a cryptographic signature: it proves
  nothing about who signed or whether the document changed afterwards. Use a
  PNG so the paper shows through around the ink.

    sign deal.pdf me.png                      bottom right of the last page
    sign deal.pdf me.png --position top-right --width 200
    sign deal.pdf me.png --pages 1,4          both pages

  The last page is the default because that is where a contract is signed, and
  stamping all forty is tedious to undo once the file has been sent.

FORMATS
  convert reads PNG, JPEG, WebP, AVIF and JPEG XL, and writes the same five.
  The browser app additionally reads GIF, BMP, TIFF, ICO, HEIC and SVG, because
  the only decoders for those are the ones a browser already has.

  The codecs are the ones Squoosh settled on after measuring: MozJPEG, libwebp,
  libavif, libjxl and Oxipng, as WebAssembly. The same builds run in the browser
  app, so a file converted there and here comes out identical.

  Quality is 1 to 100 and the scales are not comparable between formats, so the
  defaults are not the same number. They are the settings measured to look
  alike, taking JPEG 80 as the reference:

    jpeg 80     the long-standing web default
    webp 82     matched to JPEG 80 by DSSIM
    avif 64     the same, and still a much smaller file
    jxl  75     libjxl's own default, on the libjpeg scale
    png         always lossless, then run through Oxipng

  Three things happen on the way through, and all three are the point:

  Metadata is dropped. Converting decodes to pixels and encodes again, so EXIF,
  GPS coordinates, camera serial numbers, editing history and colour profiles
  are all left behind. That is a feature here, not an oversight: a photo posted
  from a phone otherwise carries where it was taken.

  A sideways photo is turned the right way up. JPEG records the camera angle in
  a tag rather than in the pixels, and no other format carries that tag, so the
  rotation is applied to the pixels instead.

  Transparency is flattened for JPEG, which has no alpha channel, onto
  --background. Every other format keeps it.

  Animation is not kept. An animated GIF or WebP converts as its first frame.

SECURITY
  Passwords are asked for rather than taken as arguments, because a password in
  argv lands in your shell history and is visible in ps. For scripts, pipe it:

    printf '%s' "$PASSWORD" | convert.in unlock locked.pdf

  Encryption is AES-256 written as V5/R6, which is the setting Acrobat calls
  "Acrobat X and later". Acrobat's two passwords are both here: the open password
  is needed to read the file at all, the permissions password lifts the
  restrictions. Acrobat refuses to let them be the same, and so does this: if
  they match, anyone who can open the file already holds owner rights.

  The format uses only the first 127 bytes of a password, so a longer one is
  refused rather than quietly cut down to a length you cannot see.

  unlock opens the older schemes too, RC4-40, RC4-128 and AES-128 as well as
  AES-256, since files written years ago are still in circulation. To bring one
  up to the current cipher, unlock it and then protect it again: the result is
  AES-256 whatever the file arrived as.

  Given --permissions-password on its own, protect does not ask for an open
  password: a permissions-only file is a real thing to want. To set both you
  have to pass both flags, which does put them in your shell history. That is
  the lesser evil, because a permissions password protects nothing from the
  person you handed the open password to anyway.

  Three limits come from the format, not from this tool, and hold for Acrobat
  too. Printing, copying and editing are bits a reader is expected to honour,
  not a lock: whoever holds the open password can take the restrictions off,
  and a file with only a permissions password comes apart with no password at
  all. Only an open password stops a document from being read. AES in
  CBC mode carries no integrity check, so encryption hides the contents but
  does not prove the file arrived the way it left; a signature does that, and
  this tool does not sign. And offline guessing is still the attack that
  matters, so the open password is the whole strength.

PAGE ORDER
  Pages follow the order the files arrive in, which is the order your shell
  expanded the glob. Most shells sort shot10.png before shot2.png; --sort natural
  counts the way you do. A warning is printed when the order looks lexical.

  Rearranging pages leaves an interactive form behind, since page copying carries
  the boxes but not the form itself. merge, select and split say so before doing
  it; rotate, watermark, number and protect leave forms intact.

PATHS
  Paths are whatever your shell already uses: C:\\Users\\me\\a.png in PowerShell or
  cmd, /home/me/a.png on Linux and macOS. Nothing special is needed.

  Inside WSL only, a Windows path is translated for you, because WSL cannot see
  C:\\ but has it mounted at /mnt/c. Quote it there, or the shell eats the
  backslashes before this ever sees them: 'C:\\Users\\me\\a.png'

EXAMPLES
  convert.in convert photo.png --to webp
  convert.in convert *.heic --to jpeg --quality 90 -o converted/
  convert.in convert logo.png --to webp --lossless
  convert.in convert shot.png --to jpeg --background '#000000'
  convert.in convert photo.png --to webp
  convert.in convert *.heic --to jpeg --quality 90 -o converted/
  convert.in convert logo.png --to webp --lossless
  convert.in convert shot.png --to jpeg --background '#000000'
  convert.in images shot-*.png
  convert.in images shot*.png --sort natural
  convert.in images scan-*.jpg -o scan.pdf --size a4 --margin 24
  convert.in compress passport.pdf --max-size 500kb
  convert.in merge part-1.pdf part-2.pdf -o whole.pdf
  convert.in select scan.pdf 1-3,7
  convert.in rotate scan.pdf 90 --pages 2-4
  convert.in split book.pdf 10
  convert.in protect scan.pdf --printing low --changes none
  convert.in unlock locked.pdf
  convert.in watermark scan.pdf "CONFIDENTIAL" --opacity 0.2
  convert.in number report.pdf --format "{n} / {total}" --position bottom-right
  convert.in info scan.pdf

NOTES
  --size fit takes the page size from the resolution the image claims, so a
  3000-pixel scan that says 300dpi becomes a 10-inch page rather than a 41-inch
  one. An image that claims nothing is treated as 96dpi, and --dpi overrides
  both. Use --size a4 when it goes on paper regardless.

  A JPEG goes into the PDF untouched, which is what keeps images lossless and
  is also what loses its EXIF orientation tag, so the page is turned instead of
  the pixels: a photo taken sideways comes out upright, still byte for byte the
  original. The four orientations that mirror as well as turn are decoded and
  rewritten, since a page cannot be flipped.
  Watermarks and page numbers draw with the built-in fonts, which cover Latin-1
  only, so text outside it is refused rather than silently dropped.

  Not on your PATH?   npm link, from the project folder. Or run it directly:
                      node "${LAUNCHER}"
  Bahasa Indonesia:   convert.in help id
`

const ID = `
CARA PAKAI
  convert.in <perintah> [opsi]

PERINTAH
  convert <gambar...> --to <f> Antara PNG, JPEG, WebP, AVIF dan JPEG XL
  compress <in.pdf>            Encode ulang gambar di dalam PDF
  sign    <in.pdf> <ttd.png>   Tempelkan gambar tanda tangan ke halaman
  images  <gambar...>          JPEG dan PNG jadi satu PDF, satu gambar per halaman
  merge   <pdf...>             Gabung PDF sesuai urutan yang diberikan
  select  <in.pdf> <halaman>   Ambil halaman itu sesuai urutannya: susun ulang, hapus, petik
  rotate  <pdf...> [derajat]   Putar halaman, bawaannya 90
  split   <in.pdf> [tiap]      Satu PDF per kelompok halaman, bawaannya 1
  protect <pdf...>             Kunci dengan password, AES-256, Acrobat X and later
  unlock  <pdf...>             Lepas password dari berkas yang terkunci
  watermark <pdf...> <teks>    Cap teks miring melintasi halaman
  number  <pdf...>             Cetak nomor halaman
  info    <pdf...>             Jumlah halaman, ukuran, dimensi, status kunci

HASIL
  -o boleh dikosongkan. Tanpa itu hasilnya mendarat di sebelah berkas asal:

    convert shot.png --to webp  ->  shot.webp
    convert *.png --to avif     ->  di sebelah tiap berkas, atau -o ke satu folder
    convert shot.png --to jpeg --width 800   ->  diperkecil sekalian
    compress scan.pdf      ->  scan-compressed.pdf
    sign    deal.pdf me.png ->  deal-signed.pdf
    images  shot.png       ->  shot.pdf
    images  shot1-12.png   ->  shot.pdf        dinamai dari bagian yang sama
    merge   a.pdf b.pdf    ->  a-merged.pdf
    select  scan.pdf 1-3   ->  scan-selected.pdf
    rotate  scan.pdf       ->  scan-rotated.pdf
    split   book.pdf 10    ->  book-pages/
    protect scan.pdf       ->  scan-protected.pdf
    unlock  scan.pdf       ->  scan-unlocked.pdf
    watermark scan.pdf X   ->  scan-watermarked.pdf
    number  scan.pdf       ->  scan-numbered.pdf

  Tidak ada yang pernah ditimpa tanpa --force.

BANYAK BERKAS SEKALIGUS
  Semua perintah yang mengubah satu berkas jadi satu berkas menerima sebanyak
  yang kamu sebut, tanpa batas dan tanpa antrean, karena kerjanya di sini. images
  dan merge memang sudah membaca banyak; split yang tetap satu dokumen.

    convert.in number *.pdf -o numbered/
    convert.in protect statements/*.pdf --open-password ...
    convert.in compress scans/*.pdf --quality 40 -o small/

  Kalau berkasnya satu, -o adalah berkas hasil. Kalau banyak, -o adalah folder
  tujuannya, dan tanpa -o hasilnya mendarat di sebelah berkas asal. Semua nama
  hasil dihitung sebelum berkas pertama ditulis, jadi kumpulan yang akan menimpa
  sesuatu, atau memberi dua berkas nama yang sama, berhenti sebelum separuh
  pekerjaannya terlanjur jalan.

  Untuk perintah yang minta satu kata setelah berkas, sebut lewat flag supaya
  semua kata dihitung sebagai berkas: --pages untuk select, --text untuk
  watermark, --by untuk rotate, --signature untuk sign.

OPSI
  -o, --out <path>       Berkas hasil, atau folder untuk split dan untuk banyak berkas
  -p, --pages <rentang>  Mulai dari 1: "1-3,7" atau "8-". Ulangi nomor untuk menggandakan
  -f, --force            Timpa berkas yang sudah ada, atau tulis ke folder yang terpakai
      --to <format>      png, jpeg, webp, avif, jxl                   convert
      --quality <1-100>  Bawaan beda per format, lihat FORMAT          convert
      --lossless         Tidak membuang apa pun: png, webp, avif, jxl  convert
      --background <hex> Di balik transparansi JPEG, bawaan #ffffff    convert
      --width <px>       Skalakan ke lebar ini, tinggi mengikuti     convert
      --height <px>      Skalakan ke tinggi ini, lebar mengikuti     convert
      --stretch          Pakai kedua sisi persis, abaikan bentuknya  convert
      --max-side <px>    Perkecil gambar yang melebihi piksel ini  compress
      --max-size <size>  Peras sampai muat, misal 500kb, 2mb       compress
      --signature <file> Sama dengan posisi kedua                  sign
      --size <mode>      fit (bawaan), a4, letter                  images
      --orientation <o>  auto (bawaan), portrait, landscape        images
      --dpi <n>          Piksel per inci penentu ukuran halaman fit images
      --margin <pt>      Bingkai putih, 0 untuk images, 28 untuk number
      --sort <mode>      given (bawaan), natural                   images, merge
      --by <derajat>     Sama dengan posisi derajat                rotate
      --every <n>        Sama dengan posisi tiap                   split
      --open-password <pw>          Document Open Password ala Acrobat  protect
      --permissions-password <pw>   Permissions Password ala Acrobat    protect
      --printing <level>            none, low, high                     protect
      --changes <level>             none, assembly, forms, comments, any  protect
      --no-copying                  Tolak penyalinan teks dan gambar     protect
      --password <pw>               Password yang sudah dipakai berkas  protect, unlock
      --opacity <0-1>               Bawaan 0.12                          watermark
      --angle <derajat>             Bawaan 45                            watermark
      --text-size <pt>              Otomatis untuk watermark, 10 untuk number
      --position <sudut>            top atau bottom, plus left/center/right  number
      --start <n>                   Nomor pertama yang dicetak, bawaan 1  number
      --format <template>           {n} dan {total}, bawaan "{n}"        number
      --quality <1-100>             Bawaan 55                           compress
      --width <pt>                  Lebar tanda tangan di halaman, 150  sign
      --position <corner>           Bawaan bottom-right                 sign
      --margin <pt>                 Dari tepi halaman, bawaan 36        sign
  -h, --help [id]        Panduan ini. Tambahkan "id" untuk Bahasa Indonesia
  -v, --version          Cetak versinya lalu keluar

APLIKASI WEB
  Tiap perintah di sini punya tool di jendela, dan dua-duanya berdiri di atas
  kode yang sama, jadi tidak bisa melenceng satu sama lain. Jalankan dengan:
  npm run dev

    convert                       Konversi gambar
    compress                      Kompres PDF
    sign                          Tanda tangan PDF
    images                        Gambar ke PDF
    merge, select, rotate, split  Tata PDF
    watermark, number             Cap PDF
    protect, unlock               Kunci PDF
    (tanpa perintah)              PDF ke gambar, karena butuh canvas

  Rentang halaman ditulis dengan cara yang sama di dua-duanya, karena parser-nya
  memang satu: ketik "1-3,7" di kotak pilih halaman pada toolbar.

  Dua flag memang tidak punya padanan di peramban. --force tidak ada artinya di
  sana, karena unduhan tidak pernah menimpa apa pun. --sort natural juga tidak
  perlu, karena di sana lu menyeret kotaknya sendiri ke urutan yang lu mau.

MEMPERKECIL PDF
  compress meng-encode ulang gambar JPEG di dalam dokumen. Di situlah hampir
  semua bobot sebuah hasil pindaian berada, jadi berkas scan biasanya kembali
  60 sampai 90 persen lebih kecil. --max-side lebih berpengaruh daripada
  --quality untuk apa pun yang dipindai di atas 300 dpi, karena piksel
  tambahannya tidak terlihat pada ukuran cetak.

    compress scan.pdf                         quality 55, ukuran tidak diubah
    compress scan.pdf --max-side 1600         batasi juga sisi terpanjang
    compress scan.pdf --quality 40 --max-side 1200

  --max-size menyebut hasilnya, bukan pengaturannya, dan itulah yang sebenarnya
  diminta formulir unggahan: pengajuan visa minta 500KB, portal HR 2MB. Yang
  dicoba lebih dulu pengaturan paling ringan, baru diperkeras selama berkasnya
  masih kebesaran, dan setiap percobaan berangkat dari berkas asli, jadi dokumen
  yang butuh empat percobaan tetap dikompres sekali. Berkas yang sudah di bawah
  batas disalin apa adanya. Kalau tidak ada yang berhasil, percobaan terkecil
  tetap ditulis dan kekurangannya dilaporkan.

    compress paspor.pdf --max-size 500kb      angka yang diminta formulirnya
    compress berkas.pdf --max-size 5mb -o out/

  PDF yang isinya cuma teks kembali sebesar aslinya, dan itu dikatakan apa
  adanya. Tidak ada gambar untuk di-encode ulang, dan tidak ada di sini yang
  menulis ulang content stream atau memangkas font: Ghostscript dan MuPDF
  melakukannya, dan keduanya AGPL, yang tidak bisa dipakai proyek ini.

  Gambar hanya diganti kalau yang baru benar-benar lebih kecil, jadi berkas
  yang sudah padat dikembalikan apa adanya, bukan malah dibikin lebih buruk.

TANDA TANGAN
  sign menggambar tanda tangan ke halaman, sama seperti menandatangani hasil
  cetak lalu memindainya kembali. Ini bukan tanda tangan kriptografis: tidak
  membuktikan siapa yang menandatangani maupun apakah dokumennya berubah
  setelah itu. Pakai PNG supaya kertasnya tembus di sekitar tintanya.

    sign deal.pdf me.png                      kanan bawah halaman terakhir
    sign deal.pdf me.png --position top-right --width 200
    sign deal.pdf me.png --pages 1,4          dua halaman itu

  Halaman terakhir jadi bawaan karena di situ kontrak ditandatangani, dan
  mengecap keempat puluh halaman merepotkan untuk dibatalkan setelah berkasnya
  terlanjur dikirim.

FORMAT
  convert membaca PNG, JPEG, WebP, AVIF dan JPEG XL, dan menulis kelima-limanya.
  Aplikasi webnya membaca lebih banyak lagi: GIF, BMP, TIFF, ICO, HEIC dan SVG,
  karena satu-satunya decoder untuk itu memang yang sudah ada di peramban.

  Codec-nya yang dipilih Squoosh setelah diukur: MozJPEG, libwebp, libavif,
  libjxl dan Oxipng, dalam bentuk WebAssembly. Build yang sama dipakai aplikasi
  webnya, jadi berkas yang dikonversi di sana dan di sini hasilnya sama persis.

  Kualitasnya 1 sampai 100, dan skalanya tidak bisa dibandingkan antar format,
  jadi bawaannya sengaja beda angka. Itu setelan yang terukur terlihat setara,
  dengan JPEG 80 sebagai patokannya:

    jpeg 80     bawaan web yang sudah lama dipakai
    webp 82     disetarakan dengan JPEG 80 lewat DSSIM
    avif 64     setara juga, dan berkasnya tetap jauh lebih kecil
    jxl  75     bawaan libjxl sendiri, di skala yang sama dengan libjpeg
    png         selalu lossless, lalu dilewatkan Oxipng

  Ada tiga hal yang terjadi di tengah jalan, dan ketiganya memang tujuannya:

  Metadata dibuang. Konversi membongkar berkasnya jadi piksel lalu menyusunnya
  ulang, jadi EXIF, koordinat GPS, nomor seri kamera, riwayat penyuntingan dan
  profil warna semuanya ditinggal. Itu fitur, bukan kelalaian: foto yang dikirim
  dari ponsel kalau tidak begitu membawa lokasi tempat foto itu diambil.

  Foto yang miring diluruskan. JPEG menyimpan sudut kameranya di sebuah tag,
  bukan di pikselnya, dan tidak ada format lain yang membawa tag itu, jadi
  putarannya diterapkan ke pikselnya.

  Transparansi diratakan untuk JPEG, yang memang tidak punya kanal alpha, ke
  atas --background. Format lain menyimpannya.

  Animasi tidak ikut. GIF atau WebP beranimasi dikonversi sebagai frame pertama.

KEAMANAN
  Password ditanyakan, bukan diambil dari argumen, karena password di argv
  mendarat di history shell lu dan kelihatan di ps. Untuk script, pipe saja:

    printf '%s' "$PASSWORD" | convert.in unlock locked.pdf

  Enkripsinya AES-256 ditulis sebagai V5/R6, itu setelan yang Acrobat sebut
  "Acrobat X and later". Dua password Acrobat ada dua-duanya: open password
  dibutuhkan untuk membuka berkasnya, permissions password mencabut batasannya.
  Acrobat menolak kalau keduanya sama, dan di sini juga ditolak: kalau sama,
  siapa pun yang bisa membuka berkasnya sudah memegang hak owner.

  Format PDF cuma memakai 127 byte pertama dari sebuah password, jadi yang lebih
  panjang ditolak, bukan diam-diam dipotong ke panjang yang tidak lu lihat.

  unlock juga membuka skema yang lebih tua, RC4-40, RC4-128 dan AES-128, bukan
  cuma AES-256, karena berkas yang ditulis bertahun-tahun lalu masih beredar.
  Untuk menaikkannya ke cipher yang sekarang, buka dulu lalu protect lagi:
  hasilnya AES-256, apa pun bentuk berkasnya waktu datang.

  Kalau cuma --permissions-password yang diberikan, protect tidak menanyakan
  open password: berkas yang hanya dibatasi izinnya memang hal yang wajar
  diinginkan. Untuk memasang keduanya, dua flag itu harus ditulis semua, dan itu
  memang masuk ke history shell. Itu pilihan yang lebih ringan, karena
  permissions password toh tidak melindungi apa pun dari orang yang sudah lu
  kasih open password.

  Tiga batasan berikut datang dari format PDF-nya, bukan dari alat ini, dan
  berlaku juga di Acrobat. Cetak, salin dan ubah cuma bit yang diharapkan
  dipatuhi pembaca, bukan kunci: siapa pun yang memegang open password bisa
  mencabut batasannya, dan berkas yang cuma berisi permissions password terbuka
  tanpa password sama sekali. Hanya open password yang benar-benar menahan
  dokumen supaya tidak terbaca. AES mode CBC tidak membawa pemeriksaan
  integritas, jadi enkripsi menyembunyikan isi tapi tidak membuktikan berkasnya
  sampai dalam keadaan yang sama seperti waktu dikirim; tanda tangan digital
  yang melakukan itu, dan alat ini tidak menandatangani. Dan tebakan offline
  tetap serangan yang paling relevan, jadi open password itulah seluruh
  kekuatannya.

URUTAN HALAMAN
  Urutan halaman mengikuti urutan berkas yang masuk, dan itu urutan hasil glob
  dari shell lu. Kebanyakan shell menaruh shot10.png sebelum shot2.png; --sort
  natural menghitung seperti manusia. Ada peringatan kalau urutannya kelihatan
  leksikal.

  Menata ulang halaman meninggalkan formulir interaktif, karena penyalinan
  halaman membawa kotaknya tapi tidak membawa formulirnya. merge, select, dan
  split memberi tahu sebelum melakukannya; rotate, watermark, number, dan protect
  tidak merusaknya.

PATH
  Path-nya persis seperti yang sudah dipakai shell lu: C:\\Users\\me\\a.png di
  PowerShell atau cmd, /home/me/a.png di Linux dan macOS. Tidak perlu apa-apa.

  Khusus di dalam WSL, path Windows diterjemahkan otomatis, karena WSL tidak
  bisa melihat C:\\ tapi memasangnya di /mnt/c. Di sana wajib dikutip, kalau
  tidak backslash-nya sudah dimakan shell sebelum sampai ke sini:
  'C:\\Users\\me\\a.png'

CONTOH
  convert.in images shot-*.png
  convert.in images shot*.png --sort natural
  convert.in images scan-*.jpg -o scan.pdf --size a4 --margin 24
  convert.in compress paspor.pdf --max-size 500kb
  convert.in merge bagian-1.pdf bagian-2.pdf -o utuh.pdf
  convert.in select scan.pdf 1-3,7
  convert.in rotate scan.pdf 90 --pages 2-4
  convert.in split buku.pdf 10
  convert.in protect scan.pdf --printing low --changes none
  convert.in unlock terkunci.pdf
  convert.in watermark scan.pdf "RAHASIA" --opacity 0.2
  convert.in number laporan.pdf --format "{n} / {total}" --position bottom-right
  convert.in info scan.pdf

CATATAN
  --size fit mengambil ukuran halaman dari kerapatan yang disebut gambarnya,
  jadi hasil pindaian 3000 piksel yang mengaku 300dpi jadi halaman 10 inci,
  bukan 41 inci. Gambar yang tidak menyebut apa-apa dianggap 96dpi, dan --dpi
  menimpa keduanya. Untuk dicetak, --size a4 tetap lebih pasti.

  JPEG masuk ke PDF apa adanya, dan justru itu yang membuatnya tanpa kehilangan
  sekaligus yang menghilangkan tag orientasi EXIF-nya, jadi yang diputar
  halamannya, bukan pikselnya: foto yang diambil miring keluar tegak, tetap
  sama persis byte demi byte. Empat orientasi yang juga mencerminkan gambar
  di-decode dan ditulis ulang, karena halaman tidak bisa dicerminkan.
  Watermark dan nomor halaman digambar dengan font bawaan yang cuma mencakup
  Latin-1, jadi teks di luar itu ditolak, bukan diam-diam dibuang.

  Belum ada di PATH?      npm link, dari folder project. Atau jalankan langsung:
                          node "${LAUNCHER}"
  In English:             convert.in help en
`

export function guide(lang: Lang): string {
  return banner(lang) + (lang === 'id' ? ID : EN)
}
