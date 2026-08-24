import { createContext, useContext } from 'react'
import type { Lang } from './prefs.ts'

/**
 * Two languages, one object, no library. TypeScript checks that `id` covers
 * every key `en` has, so a missing translation is a build error rather than a
 * blank label.
 */
const en = {
  tagline: 'Everything runs in this browser. Nothing is uploaded, so nothing can leak.',
  appearance: 'Appearance',
  /** Shown while a long render works through a document, so a ten-second wait
   *  on a five-hundred-page file reads as progress rather than a hang. */
  progress: (done: number, total: number) => `${done} of ${total}…`,
  brokeTitle: 'This tool stopped working',
  brokeHint:
    'Something went wrong while drawing this tool. Your other tools still hold their files. Try again, and if it keeps happening the file is probably one this cannot read.',
  brokeRetry: 'Try again',
  licences: 'Licences',
  language: 'Language',
  theme: { system: 'Auto', light: 'Light', dark: 'Dark' },
  chooseFiles: 'Choose files',
  menu: 'Menu',
  selectRange: 'Select pages by number',
  rangePlaceholder: '1-3,7',
  applyRange: 'Select',
  clear: 'Clear',
  selectAll: 'Select all',
  deselectAll: 'Deselect all',
  remove: 'Remove',
  tools: {
    convert: { label: 'Convert images', hint: 'PNG, JPEG, WebP, AVIF, JPEG XL' },
    compress: { label: 'Compress PDF', hint: 'Re-encode the pictures inside' },
    sign: { label: 'Sign PDF', hint: 'Draw a signature onto a page' },
    images: { label: 'Images to PDF', hint: 'Any image, one per page' },
    organize: { label: 'Organize PDF', hint: 'Merge, reorder, rotate, split' },
    export: { label: 'PDF to images', hint: 'Rasterise pages out' },
    protect: { label: 'Protect PDF', hint: 'Password, Acrobat-grade' },
    stamp: { label: 'Stamp PDF', hint: 'Watermark, page numbers' },
  },
  convert: {
    emptyTitle: 'Drop images here',
    emptyHint:
      'PNG, JPEG, WebP, AVIF, JPEG XL, GIF, BMP, TIFF, ICO, HEIC and SVG go in. PNG, JPEG, WebP, AVIF and JPEG XL come out. Nothing is uploaded, and every scrap of metadata, EXIF and GPS included, is left behind.',
    add: 'Add images',
    count: (n: number) => `${n} image${n === 1 ? '' : 's'}`,
    format: 'To',
    quality: 'Quality',
    lossless: 'Lossless',
    losslessNote: 'Nothing is thrown away',
    flattens: 'JPEG has no transparency: transparent areas come out white.',
    change: (percent: number) =>
      percent === 0
        ? 'the same size'
        : percent > 0
          ? `${percent}% smaller`
          : `${-percent}% larger`,
    run: (n: number, format: string) => `Convert ${n} to ${format}`,
    download: (n: number) => (n === 1 ? 'Download' : `Download ${n}`),
    resize: 'Size',
    keepSize: 'Leave as is',
    width: 'Width',
    height: 'Height',
    pixels: 'px',
    fits: 'Fitted inside the box, so nothing is cropped.',
  },
  compress: {
    emptyTitle: 'Drop a PDF here',
    emptyHint:
      'The pictures inside are re-encoded, which is where nearly all the weight of a scan is. A PDF that is only text has nothing to shrink and comes back untouched.',
    quality: 'Quality',
    maxSide: 'Longest side',
    unlimited: 'Leave as is',
    run: 'Compress',
    working: 'Re-encoding…',
    save: 'Save PDF',
    nothingToDo: 'No images in this PDF, so there was nothing to re-encode.',
    noneSmaller: (n: number) =>
      `Its ${n} image${n === 1 ? '' : 's'} ${n === 1 ? 'was' : 'were'} already smaller than this would make ${n === 1 ? 'it' : 'them'}.`,
    result: (percent: number, replaced: number) =>
      `${percent}% smaller, ${replaced} image${replaced === 1 ? '' : 's'} re-encoded`,
    hint: 'Capping the longest side is worth more than quality on anything scanned above 300 dpi.',
  },
  sign: {
    emptyTitle: 'Drop a PDF here',
    emptyHint:
      'Draw your signature, or bring a PNG of one, and place it on a page. Nothing is uploaded, which is the point: a signature is the last thing to hand to a stranger\u2019s server.',
    notCrypto:
      'This draws a picture of a signature, like signing a printout and scanning it. It is not a cryptographic signature and proves nothing about who signed.',
    draw: 'Draw',
    upload: 'Use an image',
    clearDrawing: 'Clear',
    drawHere: 'Sign here',
    where: 'Where',
    onPage: 'Page',
    lastPage: 'Last page',
    width: 'Width',
    points: 'pt',
    run: 'Sign PDF',
    working: 'Signing…',
    needSignature: 'Draw a signature first, or bring an image of one.',
  },
  images: {
    emptyTitle: 'Drop images here',
    emptyHint:
      'One image per page, in whatever format it arrives. JPEGs are embedded untouched, so nothing is re-compressed on the way in; anything else becomes a lossless PNG first.',
    add: 'Add images',
    count: (n: number) => `${n} image${n === 1 ? '' : 's'}`,
    selected: (n: number) => `${n} selected`,
    page: 'Page',
    turn: 'Turn',
    margin: 'Margin',
    marginLabel: 'Margin in points',
    fit: 'Fit image',
    a4: 'A4',
    letter: 'Letter',
    auto: 'Auto',
    portrait: 'Portrait',
    landscape: 'Landscape',
    save: 'Save PDF',
    building: 'Building…',
  },
  organize: {
    emptyTitle: 'Drop PDFs here',
    emptyHint:
      'Every page becomes a tile. Drag to reorder, click to select, then save the result as one file or as one file per page.',
    add: 'Add PDFs',
    pages: (n: number) => `${n} page${n === 1 ? '' : 's'}`,
    files: (n: number) => `${n} files`,
    selected: (n: number) => `${n} selected`,
    rotateLeft: 'Rotate left',
    rotateRight: 'Rotate right',
    deleteSelected: 'Delete selected',
    nothingSelected: 'Nothing selected: rotation and splitting apply to every page.',
    formsWarning:
      'This document has form fields. Rearranging pages leaves the form behind, so they will stop working.',
    someSelected: (n: number) => `${n} page${n === 1 ? '' : 's'} selected.`,
    saveSeparately: 'Save pages separately',
    save: 'Save PDF',
    reading: 'Reading pages…',
    building: 'Building…',
    splitting: 'Splitting…',
  },
  protect: {
    emptyTitle: 'Drop a PDF here',
    emptyHint:
      'Lock it with a password, or hand over a locked one and take the password off. Encryption is AES-256, the setting Acrobat calls "Acrobat X and later".',
    lockedNotice: 'This file is locked. Give its password to open it up.',
    restrictedNotice: 'This file is encrypted but opens without a prompt: only its permissions are locked.',
    openPassword: 'Open password',
    openHint: 'Needed to open the file at all. Leave blank to restrict only.',
    permissionsPassword: 'Permissions password',
    permissionsHint: 'Lifts the restrictions below. Must differ from the open password.',
    password: 'Password',
    printing: 'Printing',
    printingNone: 'None',
    printingLow: 'Low',
    printingHigh: 'Full',
    changes: 'Changes',
    changesNone: 'None',
    changesAssembly: 'Pages',
    changesForms: 'Forms',
    changesComments: 'Comments',
    changesAny: 'Any',
    copying: 'Allow copying text and images',
    restrictionsNote:
      'Printing, changes and copying are honoured by the reader rather than enforced by the cipher. Only an open password keeps a document from being read.',
    restrictionsOpenToAnyone:
      'These restrictions carry no open password, so the file opens for anyone and they come off again with no password at all. Set an open password if the document should stay shut.',
    restrictionsLiftable:
      'Anyone you give the open password to can take these restrictions off, with this tool or any other. They record an intention; they do not enforce one.',
    lock: 'Lock PDF',
    unlock: 'Remove password',
    working: 'Working…',
    cipher: 'AES-256 · Acrobat X and later',
  },
  stamp: {
    emptyTitle: 'Drop a PDF here',
    emptyHint:
      'Stamp a watermark across the pages, or print page numbers on them. Select pages first to stamp only those.',
    watermark: 'Watermark',
    numbers: 'Page numbers',
    text: 'Text',
    textPlaceholder: 'DRAFT',
    opacity: 'Opacity',
    angle: 'Angle',
    textSize: 'Size',
    textSizeAuto: 'auto',
    margin: 'Margin',
    position: 'Position',
    start: 'Start at',
    format: 'Format',
    allPages: 'Stamping every page. Select tiles to narrow it down.',
    somePages: (n: number) => `Stamping ${n} page${n === 1 ? '' : 's'}.`,
    save: 'Save PDF',
    working: 'Working…',
  },
  export: {
    emptyTitle: 'Drop a PDF here',
    emptyHint:
      'Pages are rasterised in this browser. Pick the ones you want, or take the lot.',
    open: 'Open another',
    pages: (n: number) => `${n} page${n === 1 ? '' : 's'}`,
    pageLabel: (n: number) => `Page ${n}`,
    format: 'Format',
    size: 'Size',
    save: (n: number) => `Save ${n} image${n === 1 ? '' : 's'}`,
    rendering: 'Rendering…',
    reading: 'Reading pages…',
  },
}

/** `en` is the shape of record; `id` must match it exactly or this file fails to build. */
type Strings = typeof en

const id: Strings = {
  tagline: 'Semua diproses di peramban ini. Tidak ada yang diunggah, jadi tidak ada yang bocor.',
  appearance: 'Tampilan',
  progress: (done: number, total: number) => `${done} dari ${total}…`,
  brokeTitle: 'Alat ini berhenti bekerja',
  brokeHint:
    'Ada yang salah waktu menggambar alat ini. Alat lain masih memegang berkasnya masing-masing. Coba lagi, dan kalau terus berulang kemungkinan berkasnya memang tidak terbaca di sini.',
  brokeRetry: 'Coba lagi',
  licences: 'Lisensi',
  language: 'Bahasa',
  theme: { system: 'Otomatis', light: 'Terang', dark: 'Gelap' },
  chooseFiles: 'Pilih berkas',
  menu: 'Menu',
  selectRange: 'Pilih halaman lewat nomor',
  rangePlaceholder: '1-3,7',
  applyRange: 'Pilih',
  clear: 'Kosongkan',
  selectAll: 'Pilih semua',
  deselectAll: 'Batal pilih',
  remove: 'Hapus',
  tools: {
    convert: { label: 'Konversi gambar', hint: 'PNG, JPEG, WebP, AVIF, JPEG XL' },
    compress: { label: 'Kompres PDF', hint: 'Encode ulang gambar di dalamnya' },
    sign: { label: 'Tanda tangan PDF', hint: 'Bubuhkan tanda tangan ke halaman' },
    images: { label: 'Gambar ke PDF', hint: 'Gambar apa saja, per halaman' },
    organize: { label: 'Tata PDF', hint: 'Gabung, susun, putar, pisah' },
    export: { label: 'PDF ke gambar', hint: 'Halaman jadi gambar' },
    protect: { label: 'Kunci PDF', hint: 'Password, setara Acrobat' },
    stamp: { label: 'Cap PDF', hint: 'Watermark, nomor halaman' },
  },
  convert: {
    emptyTitle: 'Taruh gambar di sini',
    emptyHint:
      'Yang masuk: PNG, JPEG, WebP, AVIF, JPEG XL, GIF, BMP, TIFF, ICO, HEIC dan SVG. Yang keluar: PNG, JPEG, WebP, AVIF dan JPEG XL. Tidak ada yang diunggah, dan semua metadata, termasuk EXIF dan lokasi GPS, ditinggal.',
    add: 'Tambah gambar',
    count: (n: number) => `${n} gambar`,
    format: 'Ke',
    quality: 'Kualitas',
    lossless: 'Tanpa kehilangan',
    losslessNote: 'Tidak ada yang dibuang',
    flattens: 'JPEG tidak punya transparansi: bagian transparan jadi putih.',
    change: (percent: number) =>
      percent === 0
        ? 'ukurannya sama'
        : percent > 0
          ? `${percent}% lebih kecil`
          : `${-percent}% lebih besar`,
    run: (n: number, format: string) => `Konversi ${n} ke ${format}`,
    download: (n: number) => (n === 1 ? 'Unduh' : `Unduh ${n}`),
    resize: 'Ukuran',
    keepSize: 'Biarkan apa adanya',
    width: 'Lebar',
    height: 'Tinggi',
    pixels: 'px',
    fits: 'Dipaskan di dalam kotak, jadi tidak ada yang terpotong.',
  },
  compress: {
    emptyTitle: 'Taruh PDF di sini',
    emptyHint:
      'Gambar di dalamnya di-encode ulang, dan di situlah hampir semua bobot sebuah hasil pindaian berada. PDF yang isinya cuma teks tidak punya yang bisa diperkecil dan kembali apa adanya.',
    quality: 'Kualitas',
    maxSide: 'Sisi terpanjang',
    unlimited: 'Biarkan apa adanya',
    run: 'Kompres',
    working: 'Meng-encode ulang…',
    save: 'Simpan PDF',
    nothingToDo: 'Tidak ada gambar di PDF ini, jadi tidak ada yang bisa di-encode ulang.',
    noneSmaller: (n: number) => `${n} gambar di dalamnya sudah lebih kecil daripada hasil pengaturan ini.`,
    result: (percent: number, replaced: number) =>
      `${percent}% lebih kecil, ${replaced} gambar di-encode ulang`,
    hint: 'Membatasi sisi terpanjang lebih berpengaruh daripada kualitas untuk apa pun yang dipindai di atas 300 dpi.',
  },
  sign: {
    emptyTitle: 'Taruh PDF di sini',
    emptyHint:
      'Gambar tanda tanganmu, atau bawa PNG-nya, lalu tempatkan di halaman. Tidak ada yang diunggah, dan justru itu intinya: tanda tangan adalah hal terakhir yang pantas diserahkan ke server orang lain.',
    notCrypto:
      'Ini menggambar tanda tangan, seperti menandatangani hasil cetak lalu memindainya. Bukan tanda tangan kriptografis dan tidak membuktikan siapa yang menandatangani.',
    draw: 'Gambar',
    upload: 'Pakai gambar',
    clearDrawing: 'Hapus',
    drawHere: 'Tanda tangan di sini',
    where: 'Posisi',
    onPage: 'Halaman',
    lastPage: 'Halaman terakhir',
    width: 'Lebar',
    points: 'pt',
    run: 'Tanda tangani',
    working: 'Menandatangani…',
    needSignature: 'Gambar tanda tangan dulu, atau bawa gambarnya.',
  },
  images: {
    emptyTitle: 'Taruh gambar di sini',
    emptyHint:
      'Satu gambar per halaman, format apa pun. JPEG ditanam apa adanya, jadi tidak ada yang dikompres ulang; format lain jadi PNG lossless dulu.',
    add: 'Tambah gambar',
    count: (n: number) => `${n} gambar`,
    selected: (n: number) => `${n} dipilih`,
    page: 'Halaman',
    turn: 'Arah',
    margin: 'Margin',
    marginLabel: 'Margin dalam point',
    fit: 'Ikut gambar',
    a4: 'A4',
    letter: 'Letter',
    auto: 'Otomatis',
    portrait: 'Tegak',
    landscape: 'Mendatar',
    save: 'Simpan PDF',
    building: 'Menyusun…',
  },
  organize: {
    emptyTitle: 'Taruh PDF di sini',
    emptyHint:
      'Tiap halaman jadi satu kotak. Seret untuk menyusun ulang, klik untuk memilih, lalu simpan jadi satu berkas atau satu berkas per halaman.',
    add: 'Tambah PDF',
    pages: (n: number) => `${n} halaman`,
    files: (n: number) => `${n} berkas`,
    selected: (n: number) => `${n} dipilih`,
    rotateLeft: 'Putar kiri',
    rotateRight: 'Putar kanan',
    deleteSelected: 'Hapus yang dipilih',
    nothingSelected: 'Tidak ada yang dipilih: putar dan pisah berlaku untuk semua halaman.',
    formsWarning:
      'Dokumen ini punya isian formulir. Menata ulang halaman meninggalkan formulirnya, jadi isiannya berhenti berfungsi.',
    someSelected: (n: number) => `${n} halaman dipilih.`,
    saveSeparately: 'Simpan per halaman',
    save: 'Simpan PDF',
    reading: 'Membaca halaman…',
    building: 'Menyusun…',
    splitting: 'Memisah…',
  },
  protect: {
    emptyTitle: 'Taruh satu PDF di sini',
    emptyHint:
      'Kunci dengan password, atau serahkan yang sudah terkunci lalu lepas passwordnya. Enkripsinya AES-256, setelan yang Acrobat sebut "Acrobat X and later".',
    lockedNotice: 'Berkas ini terkunci. Masukkan passwordnya untuk membuka.',
    restrictedNotice: 'Berkas ini terenkripsi tapi terbuka tanpa diminta password: yang dikunci cuma izinnya.',
    openPassword: 'Password buka',
    openHint: 'Dibutuhkan untuk membuka berkasnya. Kosongkan kalau cuma mau membatasi.',
    permissionsPassword: 'Password izin',
    permissionsHint: 'Mencabut batasan di bawah. Harus beda dari password buka.',
    password: 'Password',
    printing: 'Cetak',
    printingNone: 'Tidak',
    printingLow: 'Rendah',
    printingHigh: 'Penuh',
    changes: 'Ubahan',
    changesNone: 'Tidak',
    changesAssembly: 'Halaman',
    changesForms: 'Formulir',
    changesComments: 'Komentar',
    changesAny: 'Bebas',
    copying: 'Izinkan menyalin teks dan gambar',
    restrictionsNote:
      'Cetak, ubahan dan salinan dipatuhi oleh aplikasi pembacanya, bukan dipaksakan oleh enkripsinya. Hanya password buka yang benar-benar menahan dokumen supaya tidak terbaca.',
    restrictionsOpenToAnyone:
      'Batasan ini tidak disertai password buka, jadi berkasnya terbuka untuk siapa saja dan batasannya lepas lagi tanpa password sama sekali. Isi password buka kalau dokumennya memang harus tertutup.',
    restrictionsLiftable:
      'Siapa pun yang lu kasih password buka bisa mencabut batasan ini, lewat alat ini atau alat lain mana pun. Batasan ini mencatat niat, bukan memaksakannya.',
    lock: 'Kunci PDF',
    unlock: 'Lepas password',
    working: 'Memproses…',
    cipher: 'AES-256 · Acrobat X and later',
  },
  stamp: {
    emptyTitle: 'Taruh satu PDF di sini',
    emptyHint:
      'Bubuhkan watermark melintasi halaman, atau cetak nomor halaman. Pilih halamannya dulu kalau cuma sebagian yang mau dicap.',
    watermark: 'Watermark',
    numbers: 'Nomor halaman',
    text: 'Teks',
    textPlaceholder: 'RAHASIA',
    opacity: 'Kepekatan',
    angle: 'Sudut',
    textSize: 'Ukuran',
    textSizeAuto: 'auto',
    margin: 'Margin',
    position: 'Posisi',
    start: 'Mulai dari',
    format: 'Format',
    allPages: 'Mengecap semua halaman. Pilih kotaknya kalau mau sebagian saja.',
    somePages: (n: number) => `Mengecap ${n} halaman.`,
    save: 'Simpan PDF',
    working: 'Memproses…',
  },
  export: {
    emptyTitle: 'Taruh satu PDF di sini',
    emptyHint:
      'Halaman digambar ulang di peramban ini. Pilih yang lu mau, atau ambil semuanya.',
    open: 'Buka yang lain',
    pages: (n: number) => `${n} halaman`,
    pageLabel: (n: number) => `Halaman ${n}`,
    format: 'Format',
    size: 'Ukuran',
    save: (n: number) => `Simpan ${n} gambar`,
    rendering: 'Menggambar…',
    reading: 'Membaca halaman…',
  },
}

export const STRINGS: Record<Lang, Strings> = { en, id }

export const LangContext = createContext<Lang>('en')

export function useT(): Strings {
  return STRINGS[useContext(LangContext)]
}
