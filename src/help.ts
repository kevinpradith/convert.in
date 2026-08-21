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

export function banner(lang: Lang): string {
  return `${ART}\n${dim(TAGLINE[lang])}\n`
}

const EN = `
USAGE
  convert.in <command> [options]

COMMANDS
  images  <img...>            JPEG and PNG into one PDF, one image per page
  merge   <pdf...>            Join PDFs in the order given
  select  <in.pdf> <pages>    Keep those pages in that order: reorder, delete, extract
  rotate  <in.pdf> [degrees]  Turn pages, 90 by default
  split   <in.pdf> [every]    One PDF per chunk of pages, 1 by default
  protect <in.pdf>            Lock with a password, AES-256, Acrobat X and later
  unlock  <in.pdf>            Take the password off a locked file
  watermark <in.pdf> <text>   Stamp text diagonally across the pages
  number  <in.pdf>            Print page numbers
  info    <in.pdf>            Pages, file size, dimensions, whether it is locked

OUTPUT
  -o is optional. Without it the result lands beside the input:

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

OPTIONS
  -o, --out <path>       Output file, or output folder for split
  -p, --pages <ranges>   1-based: "1-3,7" or "8-". Repeat a page to duplicate it
  -f, --force            Overwrite an existing file, or write into a used folder
      --size <mode>      fit (default), a4, letter                 images
      --orientation <o>  auto (default), portrait, landscape       images
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
  -h, --help [id]        This guide. Add "id" for Bahasa Indonesia

THE WEB APP
  Every command here has a tool in the window, and both sit on the same code
  underneath, so the two cannot drift apart. Start it with: npm run dev

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
  convert.in images shot-*.png
  convert.in images shot*.png --sort natural
  convert.in images scan-*.jpg -o scan.pdf --size a4 --margin 24
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
  --size fit maps one pixel to one point, so the ratio is exact but a printed
  page can come out an odd physical size. Use --size a4 when it goes to paper.
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
  images  <gambar...>          JPEG dan PNG jadi satu PDF, satu gambar per halaman
  merge   <pdf...>             Gabung PDF sesuai urutan yang diberikan
  select  <in.pdf> <halaman>   Ambil halaman itu sesuai urutannya: susun ulang, hapus, petik
  rotate  <in.pdf> [derajat]   Putar halaman, bawaannya 90
  split   <in.pdf> [tiap]      Satu PDF per kelompok halaman, bawaannya 1
  protect <in.pdf>             Kunci dengan password, AES-256, Acrobat X and later
  unlock  <in.pdf>             Lepas password dari berkas yang terkunci
  watermark <in.pdf> <teks>    Cap teks miring melintasi halaman
  number  <in.pdf>             Cetak nomor halaman
  info    <in.pdf>             Jumlah halaman, ukuran, dimensi, status kunci

HASIL
  -o boleh dikosongkan. Tanpa itu hasilnya mendarat di sebelah berkas asal:

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

OPSI
  -o, --out <path>       Berkas hasil, atau folder hasil untuk split
  -p, --pages <rentang>  Mulai dari 1: "1-3,7" atau "8-". Ulangi nomor untuk menggandakan
  -f, --force            Timpa berkas yang sudah ada, atau tulis ke folder yang terpakai
      --size <mode>      fit (bawaan), a4, letter                  images
      --orientation <o>  auto (bawaan), portrait, landscape        images
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
  -h, --help [id]        Panduan ini. Tambahkan "id" untuk Bahasa Indonesia

APLIKASI WEB
  Tiap perintah di sini punya tool di jendela, dan dua-duanya berdiri di atas
  kode yang sama, jadi tidak bisa melenceng satu sama lain. Jalankan dengan:
  npm run dev

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
  --size fit memetakan satu piksel ke satu point, jadi rasionya persis tetapi
  ukuran cetaknya bisa aneh. Untuk dicetak, pakai --size a4.
  Watermark dan nomor halaman digambar dengan font bawaan yang cuma mencakup
  Latin-1, jadi teks di luar itu ditolak, bukan diam-diam dibuang.

  Belum ada di PATH?      npm link, dari folder project. Atau jalankan langsung:
                          node "${LAUNCHER}"
  In English:             convert.in help en
`

export function guide(lang: Lang): string {
  return banner(lang) + (lang === 'id' ? ID : EN)
}
