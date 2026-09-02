import { createContext, useContext } from 'react'
import type { Lang } from './prefs.ts'

/**
 * Two languages, one object, no library. TypeScript checks that `id` covers
 * every key `en` has, so a missing translation is a build error rather than a
 * blank label.
 */
const en = {
  /**
   * The page around the window. The headline names the thing and its one real
   * difference, because a visitor who reads only that line should still know
   * what this is; the sentence under it is the list of what you can actually do
   * here. Neither says anything the app cannot back up.
   */
  hero: {
    badge: 'Free and open source',
    title: 'PDF and image tools',
    titleEm: 'that never upload a file.',
    sub: 'Convert, compress, merge, sign, protect and redact a PDF or an image. Your browser does the work, and there is no server behind it.',
    start: 'Open the tools',
    /** The risk-reversal line every no-signup product owes its primary button:
     *  the three objections someone weighs before clicking, answered where
     *  they are weighed rather than in a footer nobody scrolls to. */
    assure: 'No account, no install, no tracking.',
    repo: 'View on GitHub',
    docs: 'Documentation',
    tools: 'Tools',
  },
  /** Shown while a long render works through a document, so a ten-second wait
   *  on a five-hundred-page file reads as progress rather than a hang. */
  progress: (done: number, total: number) => `${done} of ${total}…`,
  brokeTitle: 'This tool stopped working',
  brokeHint:
    'Something went wrong while drawing this tool. Your other tools still hold their files. Try again, and if it keeps happening the file is probably one this cannot read.',
  brokeRetry: 'Try again',
  licences: 'Licences',
  language: 'Language',
  chooseFiles: 'Choose files',
  menu: 'Menu',
  closeMenu: 'Close the menu',
  selectRange: 'Select pages by number',
  rangePlaceholder: '1-3,7',
  applyRange: 'Select',
  clear: 'Clear',
  selectAll: 'Select all',
  deselectAll: 'Deselect all',
  remove: 'Remove',
  /** Shared by every tool that takes a pile of files rather than one. */
  batch: {
    add: 'Add PDFs',
    count: (n: number) => `${n} PDF${n === 1 ? '' : 's'}`,
    download: (n: number) => (n === 1 ? 'Download' : `Download ${n}`),
    done: 'Done',
    everyPage: 'Every page of every file. Open one file on its own to choose pages.',
    lastPageEach: 'The last page of each file. Open one file on its own to choose a page.',
    mixedLocks:
      'Some of these are locked and some are not, and the two need opposite things done to them. Open one kind at a time.',
  },
  tools: {
    convert: { label: 'Convert images', hint: 'PNG, JPEG, WebP, AVIF, JPEG XL' },
    compress: { label: 'Compress PDF', hint: 'Re-encode the pictures inside' },
    sign: { label: 'Sign PDF', hint: 'Draw a signature onto a page' },
    images: { label: 'Images to PDF', hint: 'Any image, one per page' },
    organize: { label: 'Organize PDF', hint: 'Merge, reorder, rotate, split' },
    export: { label: 'PDF to images', hint: 'Rasterise pages out' },
    protect: { label: 'Protect PDF', hint: 'Password, Acrobat-grade' },
    clean: { label: 'Clean PDF', hint: 'Strip the hidden metadata' },
    redact: { label: 'Redact PDF', hint: 'Black it out and remove it' },
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
      percent === 0 ? 'the same size' : percent > 0 ? `${percent}% smaller` : `${-percent}% larger`,
    run: (n: number, format: string) => `Convert ${n} to ${format}`,
    download: (n: number) => (n === 1 ? 'Download' : `Download ${n}`),
    resize: 'Size',
    width: 'Width',
    height: 'Height',
    fits: 'Fitted inside the box, so nothing is cropped.',
  },
  compress: {
    emptyTitle: 'Drop PDFs here',
    emptyHint:
      'The pictures inside are re-encoded, which is where nearly all the weight of a scan is. A PDF that is only text has nothing to shrink and comes back untouched. Drop as many as you like: there is no queue and no limit, because the work happens in this browser.',
    quality: 'Quality',
    maxSide: 'Longest side',
    unlimited: 'Leave as is',
    target: 'Fit under',
    noTarget: 'No limit',
    targetHint:
      'Every setting is chosen for you when a limit is set, starting gentle and only going harder while the file is still too big.',
    tooBig: (size: string, limit: string) =>
      `${size} is the smallest this gets, and the limit is ${limit}. Splitting the document is the next thing to try.`,
    alreadyUnder: (limit: string) => `Already under ${limit}, so it was left alone.`,
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
  redact: {
    emptyTitle: 'Drop a PDF here',
    emptyHint:
      'Drag a rectangle over anything that should not be there, or search for a word and black out every occurrence of it. What is covered is then removed rather than hidden: the pages are rebuilt from pixels, so there is no text left underneath to select, copy or recover.',
    notice:
      'Every page is rebuilt as an image, so the text stops being selectable and searchable for the recipient too. That is what makes the removal real, and it cannot be undone. The metadata goes with it.',
    replace: 'Open another',
    reading: 'Reading the pages\u2026',
    searching: 'Searching\u2026',
    working: 'Redacting\u2026',
    run: 'Redact',
    find: 'Find',
    findLabel: 'Word or phrase to black out',
    findPlaceholder: 'a name',
    addMatches: 'Black out every match',
    matches: (n: number) =>
      n === 0
        ? 'Nothing matched. A scanned page carries no text, so draw the box instead.'
        : `${n} match${n === 1 ? '' : 'es'} blacked out`,
    detail: 'Detail',
    detailLabel: 'Pixels per inch to rebuild at',
    count: (n: number) => `${n} box${n === 1 ? '' : 'es'}`,
    clearBoxes: 'Remove all boxes',
    wholePage: 'Cover the whole page',
    removeBox: (page: number) => `Remove this box from page ${page}`,
  },
  clean: {
    emptyTitle: 'Drop PDFs here',
    emptyHint:
      'A PDF names its author, the software that wrote it, the company licence it was written under, and often more. None of it shows while reading the document. This lists every piece and takes it out, in this browser, without the file going anywhere.',
    run: 'Clean',
    working: 'Stripping\u2026',
    custom: 'added by the software that wrote it',
    xmp: (size: string) => `${size} of XML saying the same things again`,
    alreadyClean: 'This PDF already says nothing about itself.',
    removed: (fields: number, xmp: number) =>
      [
        fields > 0 ? `${fields} field${fields === 1 ? '' : 's'} removed` : '',
        xmp > 0 ? 'XMP removed' : '',
      ]
        .filter(Boolean)
        .join(' \u00b7 '),
    hint: 'The pages are untouched. This removes what the file says about itself, not what it says.',
  },
  sign: {
    emptyTitle: 'Drop PDFs here',
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
    dpi: 'Detail',
    dpiLabel: 'Pixels per inch',
    dpiAuto: 'As the file says',
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
    paper: 'Sheet',
    paperLabel: 'Put every page on this sheet',
    paperAsIs: 'Sizes as they are',
    save: 'Save PDF',
    reading: 'Reading pages…',
    building: 'Building…',
    splitting: 'Splitting…',
  },
  protect: {
    emptyTitle: 'Drop PDFs here',
    emptyHint:
      'Lock them with a password, or hand over locked ones and take the password off. One password covers the whole pile. Encryption is AES-256, the setting Acrobat calls "Acrobat X and later".',
    lockedNotice: 'This file is locked. Give its password to open it up.',
    partlyOpen: (names: string) =>
      `${names} asks for a password but does not encrypt everything: its pages, or its title and author, can be read straight out of the file without one. The format allows that, so no reader will warn you. Treat it as unprotected.`,
    restrictedNotice:
      'This file is encrypted but opens without a prompt: only its permissions are locked.',
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
    emptyTitle: 'Drop PDFs here',
    emptyHint:
      'Stamp a watermark across the pages, or print page numbers on them. One file on its own lets you pick the pages; a pile of them all get stamped through.',
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
    emptyHint: 'Pages are rasterised in this browser. Pick the ones you want, or take the lot.',
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
  hero: {
    badge: 'Gratis dan sumber terbuka',
    title: 'Alat PDF dan gambar',
    titleEm: 'yang tak pernah mengunggah berkas.',
    sub: 'Konversi, kompres, gabung, tanda tangan, kunci dan sensor PDF atau gambar. Peramban Anda yang bekerja, dan tidak ada server di baliknya.',
    start: 'Buka alatnya',
    assure: 'Tanpa akun, tanpa instal, tanpa pelacakan.',
    repo: 'Lihat di GitHub',
    docs: 'Dokumentasi',
    tools: 'Alat',
  },
  progress: (done: number, total: number) => `${done} dari ${total}…`,
  brokeTitle: 'Alat ini berhenti bekerja',
  brokeHint:
    'Ada yang salah saat menggambar alat ini. Alat lain masih memegang berkasnya masing-masing. Coba lagi, dan jika terus berulang kemungkinan berkasnya memang tidak terbaca di sini.',
  brokeRetry: 'Coba lagi',
  licences: 'Lisensi',
  language: 'Bahasa',
  chooseFiles: 'Pilih berkas',
  menu: 'Menu',
  closeMenu: 'Tutup menu',
  selectRange: 'Pilih halaman lewat nomor',
  rangePlaceholder: '1-3,7',
  applyRange: 'Pilih',
  clear: 'Kosongkan',
  selectAll: 'Pilih semua',
  deselectAll: 'Batal pilih',
  remove: 'Hapus',
  batch: {
    add: 'Tambah PDF',
    count: (n: number) => `${n} PDF`,
    download: (n: number) => (n === 1 ? 'Unduh' : `Unduh ${n}`),
    done: 'Selesai',
    everyPage: 'Semua halaman di semua berkas. Buka satu berkas saja untuk memilih halaman.',
    lastPageEach: 'Halaman terakhir tiap berkas. Buka satu berkas saja untuk memilih halaman.',
    mixedLocks:
      'Sebagian terkunci dan sebagian tidak, dan keduanya butuh perlakuan yang berlawanan. Buka satu jenis dulu.',
  },
  tools: {
    convert: { label: 'Konversi gambar', hint: 'PNG, JPEG, WebP, AVIF, JPEG XL' },
    compress: { label: 'Kompres PDF', hint: 'Encode ulang gambar di dalamnya' },
    sign: { label: 'Tanda tangan PDF', hint: 'Bubuhkan tanda tangan ke halaman' },
    images: { label: 'Gambar ke PDF', hint: 'Gambar apa saja, per halaman' },
    organize: { label: 'Tata PDF', hint: 'Gabung, susun, putar, pisah' },
    export: { label: 'PDF ke gambar', hint: 'Halaman jadi gambar' },
    protect: { label: 'Kunci PDF', hint: 'Password, setara Acrobat' },
    clean: { label: 'Bersihkan PDF', hint: 'Buang metadata tersembunyi' },
    redact: { label: 'Sensor PDF', hint: 'Hitamkan sekaligus hapus isinya' },
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
    width: 'Lebar',
    height: 'Tinggi',
    fits: 'Dipaskan di dalam kotak, jadi tidak ada yang terpotong.',
  },
  compress: {
    emptyTitle: 'Taruh PDF di sini',
    emptyHint:
      'Gambar di dalamnya di-encode ulang, dan di situlah hampir semua bobot sebuah hasil pindaian berada. PDF yang isinya hanya teks tidak punya yang bisa diperkecil dan kembali apa adanya. Taruh sebanyak yang Anda perlukan: tidak ada antrean dan tidak ada batas, karena kerjanya di browser ini.',
    quality: 'Kualitas',
    maxSide: 'Sisi terpanjang',
    unlimited: 'Biarkan apa adanya',
    target: 'Muat di bawah',
    noTarget: 'Tanpa batas',
    targetHint:
      'Semua pengaturan dipilihkan begitu batas ditentukan, mulai dari yang paling ringan dan baru diperkeras selama berkasnya masih kebesaran.',
    tooBig: (size: string, limit: string) =>
      `${size} adalah yang paling kecil yang bisa dicapai, sedangkan batasnya ${limit}. Memisah dokumennya jadi langkah berikutnya.`,
    alreadyUnder: (limit: string) => `Sudah di bawah ${limit}, jadi dibiarkan apa adanya.`,
    run: 'Kompres',
    working: 'Meng-encode ulang…',
    save: 'Simpan PDF',
    nothingToDo: 'Tidak ada gambar di PDF ini, jadi tidak ada yang bisa di-encode ulang.',
    noneSmaller: (n: number) =>
      `${n} gambar di dalamnya sudah lebih kecil daripada hasil pengaturan ini.`,
    result: (percent: number, replaced: number) =>
      `${percent}% lebih kecil, ${replaced} gambar di-encode ulang`,
    hint: 'Membatasi sisi terpanjang lebih berpengaruh daripada kualitas untuk apa pun yang dipindai di atas 300 dpi.',
  },
  redact: {
    emptyTitle: 'Taruh satu PDF di sini',
    emptyHint:
      'Seret kotak di atas apa pun yang tidak seharusnya ada, atau cari sebuah kata lalu hitamkan semua kemunculannya. Yang tertutup lalu dihapus, bukan disembunyikan: halamannya disusun ulang dari piksel, jadi tidak ada teks tersisa di baliknya untuk diseleksi, disalin, atau dipulihkan.',
    notice:
      'Semua halaman disusun ulang jadi gambar, jadi teksnya berhenti bisa diseleksi dan dicari, termasuk oleh penerimanya. Justru itu yang membuat penghapusannya nyata, dan itu tidak bisa dibatalkan. Metadatanya ikut dibuang.',
    replace: 'Buka yang lain',
    reading: 'Membaca halaman\u2026',
    searching: 'Mencari\u2026',
    working: 'Menyensor\u2026',
    run: 'Sensor',
    find: 'Cari',
    findLabel: 'Kata atau frasa yang akan dihitamkan',
    findPlaceholder: 'sebuah nama',
    addMatches: 'Hitamkan semua yang cocok',
    matches: (n: number) =>
      n === 0
        ? 'Tidak ada yang cocok. Halaman hasil pindaian tidak punya teks, jadi kotaknya digambar saja.'
        : `${n} kemunculan dihitamkan`,
    detail: 'Kerapatan',
    detailLabel: 'Piksel per inci untuk menyusun ulang',
    count: (n: number) => `${n} kotak`,
    clearBoxes: 'Hapus semua kotak',
    wholePage: 'Tutup seluruh halaman',
    removeBox: (page: number) => `Hapus kotak ini dari halaman ${page}`,
  },
  clean: {
    emptyTitle: 'Taruh PDF di sini',
    emptyHint:
      'Sebuah PDF menyebut siapa penulisnya, software apa yang menulisnya, lisensi perusahaan mana yang dipakai, dan sering kali lebih dari itu. Tidak ada satu pun yang terlihat saat dokumennya dibaca. Ini menampilkan semuanya lalu membuangnya, di browser ini, tanpa berkasnya pergi ke mana pun.',
    run: 'Bersihkan',
    working: 'Membuang\u2026',
    custom: 'ditambahkan software penulisnya',
    xmp: (size: string) => `${size} XML yang menyebutkan hal yang sama lagi`,
    alreadyClean: 'PDF ini memang sudah tidak menyebut apa pun tentang dirinya.',
    removed: (fields: number, xmp: number) =>
      [fields > 0 ? `${fields} field dibuang` : '', xmp > 0 ? 'XMP dibuang' : '']
        .filter(Boolean)
        .join(' \u00b7 '),
    hint: 'Halamannya tidak disentuh. Yang dibuang adalah apa yang dikatakan berkasnya tentang dirinya sendiri, bukan isinya.',
  },
  sign: {
    emptyTitle: 'Taruh PDF di sini',
    emptyHint:
      'Gambarkan tanda tangan Anda, atau bawa berkas PNG-nya, lalu tempatkan di halaman. Satu tanda tangan berlaku untuk semua berkas yang Anda taruh. Tidak ada yang diunggah, dan justru itu intinya: tanda tangan adalah hal terakhir yang pantas diserahkan ke server orang lain.',
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
    dpi: 'Kerapatan',
    dpiLabel: 'Piksel per inci',
    dpiAuto: 'Ikut kata berkasnya',
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
    paper: 'Kertas',
    paperLabel: 'Taruh semua halaman di kertas ini',
    paperAsIs: 'Ukuran apa adanya',
    save: 'Simpan PDF',
    reading: 'Membaca halaman…',
    building: 'Menyusun…',
    splitting: 'Memisah…',
  },
  protect: {
    emptyTitle: 'Taruh PDF di sini',
    emptyHint:
      'Kunci dengan password, atau serahkan yang sudah terkunci lalu lepas passwordnya. Satu password berlaku untuk seluruh tumpukan. Enkripsinya AES-256, setelan yang Acrobat sebut "Acrobat X and later".',
    lockedNotice: 'Berkas ini terkunci. Masukkan passwordnya untuk membuka.',
    partlyOpen: (names: string) =>
      `${names} meminta password tetapi tidak mengenkripsi semuanya: halamannya, atau judul dan penulisnya, bisa dibaca langsung dari berkasnya tanpa password. Format PDF memang mengizinkan itu, jadi tidak ada pembaca yang memperingatkan. Anggap saja berkas ini tidak terlindungi.`,
    restrictedNotice:
      'Berkas ini terenkripsi tetapi terbuka tanpa diminta password: yang dikunci hanya izinnya.',
    openPassword: 'Password buka',
    openHint: 'Dibutuhkan untuk membuka berkasnya. Kosongkan jika hanya ingin membatasi.',
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
      'Batasan ini tidak disertai password buka, jadi berkasnya terbuka untuk siapa saja dan batasannya lepas lagi tanpa password sama sekali. Isi password buka jika dokumennya memang harus tertutup.',
    restrictionsLiftable:
      'Siapa pun yang Anda beri password buka bisa mencabut batasan ini, lewat alat ini atau alat lain mana pun. Batasan ini mencatat niat, bukan memaksakannya.',
    lock: 'Kunci PDF',
    unlock: 'Lepas password',
    working: 'Memproses…',
    cipher: 'AES-256 · Acrobat X and later',
  },
  stamp: {
    emptyTitle: 'Taruh PDF di sini',
    emptyHint:
      'Bubuhkan watermark melintasi halaman, atau cetak nomor halaman. Satu berkas saja bisa dipilih halamannya; setumpuk berkas dicap seluruhnya.',
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
    allPages: 'Mengecap semua halaman. Pilih kotaknya jika hanya sebagian.',
    somePages: (n: number) => `Mengecap ${n} halaman.`,
    save: 'Simpan PDF',
    working: 'Memproses…',
  },
  export: {
    emptyTitle: 'Taruh satu PDF di sini',
    emptyHint:
      'Halaman digambar ulang di peramban ini. Pilih yang Anda perlukan, atau ambil semuanya.',
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
