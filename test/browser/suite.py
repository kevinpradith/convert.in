"""Drive the built app in a real browser, served with the headers it ships with.

    npm run build
    npm run audit:fixtures -- ./fixtures
    python3 test/browser/suite.py dist ./fixtures

Serving dist/ with the exact contents of public/_headers is the point: the
Content-Security-Policy is part of what is under test, not scaffolding around
it. A policy that only looks strict in a config file is worth nothing, and one
the app cannot actually live under gets quietly relaxed later.

Requires playwright (with "python3 -m playwright install chromium") and pypdf.
Exits non-zero on the first failing expectation, so it drops straight into CI.
"""
import base64
import functools
import http.server
import io
import pathlib
import re
import struct
import sys
import threading
import zlib

from playwright.sync_api import sync_playwright
from pypdf import PdfReader
from pypdf._encryption import PasswordType

DIST = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'dist')
FIXTURES = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else 'fixtures')
PORT = 8931
BASE = f'http://127.0.0.1:{PORT}/'

ok, bad = [], []


def check(condition, label):
    (ok if condition else bad).append(label)
    print(('  PASS  ' if condition else '  FAIL  ') + label)


# --------------------------------------------------------------------------
# the server, carrying the production headers


def headers_from(path):
    """Read public/_headers, which is the same policy vercel.json declares."""
    found = {}
    for line in pathlib.Path(path).read_text().splitlines():
        match = re.match(r'^ {2}([A-Za-z-]+): (.*)$', line)
        # Strict-Transport-Security is meaningless over http and would only
        # poison the test browser's profile for the next run.
        if match and match.group(1) != 'Strict-Transport-Security':
            found.setdefault(match.group(1), match.group(2))
    return found


def serve(directory, headers):
    class Handler(http.server.SimpleHTTPRequestHandler):
        def end_headers(self):
            for key, value in headers.items():
                self.send_header(key, value)
            super().end_headers()

        def log_message(self, *args):
            pass

    server = http.server.ThreadingHTTPServer(
        ('127.0.0.1', PORT), functools.partial(Handler, directory=str(directory))
    )
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


# --------------------------------------------------------------------------
# fixtures the browser needs and the Node suite does not


def png(width, height, grey, alpha=None, noisy=False):
    """A real PNG, built here so the suite needs no image library.

    With `alpha` given, the left half of every row is opaque and the right half
    is fully transparent, which is what makes the JPEG path testable: JPEG has
    nowhere to put an alpha channel, so those pixels have to land on something.

    With `noisy`, every pixel differs from its neighbours. A flat colour is the
    wrong fixture for anything about compression: it encodes down to a few
    hundred bytes whatever quality is asked for, so a re-encode cannot beat it
    and a correct compressor rightly declines to try.
    """
    if noisy:
        raw = b''.join(
            b'\x00' + b''.join(
                bytes([(x * 7 + y * 3) % 256, (x * 3 + y * 11) % 256, (x ^ y) % 256])
                for x in range(width)
            )
            for y in range(height)
        )
    elif alpha is None:
        raw = b''.join(b'\x00' + bytes([grey, grey, grey]) * width for _ in range(height))
    else:
        row = b''.join(
            bytes([grey, grey, grey, 255 if x < width // 2 else 0]) for x in range(width)
        )
        raw = b''.join(b'\x00' + row for _ in range(height))

    def chunk(kind, body):
        return (
            struct.pack('>I', len(body))
            + kind
            + body
            + struct.pack('>I', zlib.crc32(kind + body))
        )

    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6 if alpha else 2, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(raw))
        + chunk(b'IEND', b'')
    )


def sideways(jpeg):
    """The same JPEG with an EXIF orientation tag saying "turn me a quarter".

    Built by hand rather than with an image library, which is also the point:
    the tag is a few bytes bolted to the front of the file, and every format
    this app writes to drops it. If the pixels are not turned on the way
    through, a photo taken sideways converts sideways.
    """
    entry = struct.pack('<HHIHH', 0x0112, 3, 1, 6, 0)   # orientation = 6
    tiff = b'II' + struct.pack('<HI', 42, 8) + struct.pack('<H', 1) + entry + b'\x00' * 4
    payload = b'Exif\x00\x00' + tiff
    app1 = b'\xff\xe1' + struct.pack('>H', len(payload) + 2) + payload
    return jpeg[:2] + app1 + jpeg[2:]


# A 1x1 GIF, the shortest valid one there is. GIF matters here because it is a
# format the browser decodes and the WebAssembly codecs do not, so converting
# one proves the browser's own decoder is being reached.
TINY_GIF = base64.b64decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7')

# SVG is the one format where the file is markup rather than pixels, so it is the
# one place a document could try to become code. Three ways in: a script element,
# an event handler attribute, and an external reference. An <img> runs none of
# them by specification, which is exactly why the decoder uses one, and this
# fixture is what keeps that true if anyone ever reaches for innerHTML or
# <object> to fix an unrelated bug.
HOSTILE_SVG = (
    '<?xml version="1.0"?>'
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">'
    '<script>window.__ran = true</script>'
    '<rect width="40" height="40" fill="green" onload="window.__ran = true"/>'
    '<image href="http://example.invalid/beacon.png" width="1" height="1"/>'
    '</svg>'
).encode()


def cjk_pdf():
    """CJK text behind a named Adobe CMap, the one thing that makes pdf.js go
    and fetch from cMapUrl. Nothing else in the app exercises that path."""
    content = b'BT /F1 24 Tf 20 100 Td <65E5 672C 8A9E> Tj ET\n'
    objects = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] '
        b'/Resources << /Font << /F1 4 0 R >> >> /Contents 6 0 R >>',
        b'<< /Type /Font /Subtype /Type0 /BaseFont /KozMinPr6N-Regular '
        b'/Encoding /UniJIS-UCS2-H /DescendantFonts [5 0 R] >>',
        b'<< /Type /Font /Subtype /CIDFontType0 /BaseFont /KozMinPr6N-Regular '
        b'/CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 6 >> '
        b'/FontDescriptor 7 0 R /DW 1000 >>',
        b'<< /Length %d >>\nstream\n' % len(content) + content + b'endstream',
        b'<< /Type /FontDescriptor /FontName /KozMinPr6N-Regular /Flags 4 '
        b'/FontBBox [0 -120 1000 880] /ItalicAngle 0 /Ascent 880 /Descent -120 '
        b'/CapHeight 700 /StemV 80 >>',
    ]
    out = bytearray(b'%PDF-1.7\n%\xe2\xe3\xcf\xd3\n')
    offsets = []
    for number, body in enumerate(objects, 1):
        offsets.append(len(out))
        out += b'%d 0 obj\n' % number + body + b'\nendobj\n'
    start = len(out)
    out += b'xref\n0 %d\n0000000000 65535 f \n' % (len(objects) + 1)
    for offset in offsets:
        out += b'%010d 00000 n \n' % offset
    out += b'trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (
        len(objects) + 1,
        start,
    )
    return bytes(out)


# Runs as a real same-origin script. Anything driven through page.evaluate goes
# in over the automation channel, which is exempt from CSP and would report a
# pass whatever the policy said.
PROBE_JS = """(async () => {
  const out = { wasm: null, eval: null };
  try {
    await WebAssembly.instantiate(new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]));
    out.wasm = 'ok';
  } catch (e) { out.wasm = String(e); }
  try { (0, eval)('1+1'); out.eval = 'ran'; } catch (e) { out.eval = 'blocked'; }
  window.__csp = out;
})();
"""
PROBE_HTML = '<!doctype html><meta charset=utf-8><title>csp probe</title>' \
             '<script src="./__csp-probe.js"></script>'


def main():
    for required in ('index.html', 'pdfjs/wasm', 'pdfjs/cmaps'):
        if not (DIST / required).exists():
            sys.exit(f'{DIST / required} is missing. Run "npm run build" first.')
    if not (FIXTURES / 'plain.pdf').exists():
        sys.exit(f'{FIXTURES}/plain.pdf is missing. Run "npm run audit:fixtures -- {FIXTURES}" first.')

    (FIXTURES / 'cjk.pdf').write_bytes(cjk_pdf())
    (FIXTURES / 'grey.png').write_bytes(png(240, 180, 40))
    (FIXTURES / 'pale.png').write_bytes(png(180, 240, 200))
    (FIXTURES / 'half-clear.png').write_bytes(png(120, 80, 30, alpha=True))
    (FIXTURES / 'tiny.gif').write_bytes(TINY_GIF)
    (FIXTURES / 'hostile.svg').write_bytes(HOSTILE_SVG)
    (FIXTURES / 'noisy.png').write_bytes(png(400, 300, 0, noisy=True))
    (DIST / '__csp-probe.js').write_text(PROBE_JS)
    (DIST / '__csp-probe.html').write_text(PROBE_HTML)

    server = serve(DIST, headers_from('public/_headers'))
    try:
        run()
    finally:
        server.shutdown()
        (DIST / '__csp-probe.js').unlink(missing_ok=True)
        (DIST / '__csp-probe.html').unlink(missing_ok=True)

    print(f'\n== {len(ok)} passed, {len(bad)} failed ==')
    for failure in bad:
        print('   FAILED:', failure)
    sys.exit(1 if bad else 0)


def run():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={'width': 1440, 'height': 900})
        requests, responses, offsite, errors, complaints = [], [], [], [], []
        page.on('request', lambda r: requests.append(r.url))
        page.on('response', lambda r: responses.append(r))
        page.on('requestfinished', lambda r: offsite.append(r.url)
                if not r.url.startswith((BASE, 'blob:', 'data:')) else None)
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: complaints.append(f'{m.type}: {m.text}')
                if m.type in ('error', 'warning') else None)
        page.goto(BASE, wait_until='networkidle')

        def tool(name):
            page.get_by_role('button', name=name).click()
            # Every tool stays mounted so switching does not throw away loaded
            # pages; only the active one is not display:none.
            return page.locator('main > div:not(.hidden)')

        def saved(action):
            with page.expect_download(timeout=60000) as download:
                action()
            return PdfReader(io.BytesIO(pathlib.Path(download.value.path()).read_bytes()))

        print('== the CSP allows WebAssembly and still refuses eval ==')
        probe = browser.new_page()
        probe.goto(BASE + '__csp-probe.html', wait_until='networkidle')
        probe.wait_for_function('() => window.__csp')
        result = probe.evaluate('() => window.__csp')
        probe.close()
        check(result['wasm'] == 'ok',
              f"WebAssembly.instantiate runs under the shipped CSP ({result['wasm']})")
        check(result['eval'] == 'blocked',
              f"eval is still refused, so the relaxation is wasm-only ({result['eval']})")

        print('== convert images ==')
        current = tool('Convert images')

        def convert(file, target):
            """Load one file, pick a format, convert, and return what came down."""
            clear = current.get_by_role('button', name='Clear', exact=True)
            if clear.count():
                clear.click()
            current.locator('input[type=file]').set_input_files(file)
            current.locator('img').first.wait_for(timeout=30000)
            current.get_by_role('combobox', name='To').select_option(target)
            current.get_by_role('button', name=re.compile(r'^Convert \d')).click()
            download = current.get_by_role('button', name=re.compile('^Download'))
            download.wait_for(timeout=120000)
            with page.expect_download(timeout=60000) as caught:
                download.click()
            return pathlib.Path(caught.value.path()).read_bytes()

        source = (FIXTURES / 'grey.png').read_bytes()
        webp = convert(str(FIXTURES / 'grey.png'), 'webp')
        check(webp[:4] == b'RIFF' and webp[8:12] == b'WEBP',
              f'a PNG came back as a real WebP ({webp[:4]!r}...{webp[8:12]!r})')
        check(len(webp) < len(source),
              f'and smaller than it went in ({len(source)} -> {len(webp)} bytes)')
        (FIXTURES / 'converted.webp').write_bytes(webp)

        avif = convert(str(FIXTURES / 'grey.png'), 'avif')
        check(avif[4:8] == b'ftyp' and avif[8:12] in (b'avif', b'avis'),
              f'AVIF is written with an AVIF brand ({avif[4:12]!r})')

        jxl = convert(str(FIXTURES / 'grey.png'), 'jxl')
        check(jxl[:2] == b'\xff\x0a' or jxl[:8] == b'\x00\x00\x00\x0cJXL ',
              f'JPEG XL is written with a JPEG XL signature ({jxl[:8]!r})')

        print('== a format only the browser can read ==')
        from_gif = convert(str(FIXTURES / 'tiny.gif'), 'webp')
        check(from_gif[:4] == b'RIFF' and from_gif[8:12] == b'WEBP',
              "a GIF converts, which no codec here decodes: the browser's own did it")

        print('== transparency, going to a format that has none ==')
        flattened = convert(str(FIXTURES / 'half-clear.png'), 'jpeg')
        check(flattened[:3] == b'\xff\xd8\xff', f'JPEG written ({flattened[:3]!r})')
        # Read the pixels back through the browser, which is the only decoder
        # either side of this test has.
        corner = page.evaluate("""async (bytes) => {
          const blob = new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' });
          const bitmap = await createImageBitmap(blob);
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          canvas.getContext('2d').drawImage(bitmap, 0, 0);
          const at = (x) => [...canvas.getContext('2d').getImageData(x, 4, 1, 1).data].slice(0, 3);
          return { opaque: at(4), wasClear: at(bitmap.width - 4) };
        }""", list(flattened))
        check(all(channel > 240 for channel in corner['wasClear']),
              f"transparent pixels came out white rather than black ({corner['wasClear']})")
        check(all(channel < 80 for channel in corner['opaque']),
              f"and the opaque half is still the colour it was ({corner['opaque']})")

        print('== a photo taken sideways ==')
        landscape = convert(str(FIXTURES / 'grey.png'), 'jpeg')
        (FIXTURES / 'sideways.jpg').write_bytes(sideways(landscape))
        turned = convert(str(FIXTURES / 'sideways.jpg'), 'png')
        width, height = struct.unpack('>II', turned[16:24])
        check((width, height) == (180, 240),
              f'the EXIF quarter turn was applied to the pixels ({width}x{height}, was 240x180)')

        print('== an SVG is data, not code ==')
        page.evaluate('delete window.__ran')
        hostile = convert(str(FIXTURES / 'hostile.svg'), 'png')
        check(hostile[:8] == b'\x89PNG\r\n\x1a\n',
              f'the SVG rasterised to a PNG ({hostile[:4]!r})')
        check(page.evaluate('window.__ran === undefined'),
              'neither its script element nor its onload attribute ran')

        print('== a result belongs to the settings that made it ==')
        # Convert once, then move a setting. The finished file is encoded at the
        # old setting, so leaving it on offer would hand back something the
        # controls no longer describe.
        #
        # Clear first, and not only for tidiness: the SVG from the previous check
        # is still loaded, and two finished files make Download save both, spaced
        # apart. The second lands after this block has moved on and gets caught
        # by whichever expect_download is open next.
        current.get_by_role('button', name='Clear', exact=True).click()
        current.locator('input[type=file]').set_input_files(str(FIXTURES / 'grey.png'))
        current.locator('img').first.wait_for(timeout=30000)
        current.get_by_role('combobox', name='To').select_option('webp')
        current.get_by_role('button', name=re.compile(r'^Convert \d')).click()
        current.get_by_role('button', name=re.compile('^Download')).wait_for(timeout=120000)
        current.get_by_role('slider', name='Quality').fill('30')
        check(current.get_by_role('button', name=re.compile('^Download')).count() == 0,
              'moving the quality slider drops the file made at the old quality')

        # AVIF can be lossless and JPEG cannot. Switching between them has to
        # take the setting back down, or the encoder refuses a request the
        # person has no control left to withdraw.
        current.get_by_role('combobox', name='To').select_option('avif')
        current.get_by_role('checkbox', name='Lossless').check()
        current.get_by_role('combobox', name='To').select_option('jpeg')
        current.get_by_role('button', name=re.compile(r'^Convert \d')).click()
        download = current.get_by_role('button', name=re.compile('^Download'))
        download.wait_for(timeout=120000)
        with page.expect_download(timeout=60000) as caught:
            download.click()
        after = pathlib.Path(caught.value.path()).read_bytes()
        check(after[:3] == b'\xff\xd8\xff',
              f'a lossless AVIF switched to JPEG still writes a JPEG ({after[:3]!r})')

        print('== scaling on the way out ==')
        current.get_by_role('button', name='Clear', exact=True).click()
        current.locator('input[type=file]').set_input_files(str(FIXTURES / 'grey.png'))
        current.locator('img').first.wait_for(timeout=30000)
        current.get_by_role('combobox', name='To').select_option('png')
        current.get_by_role('spinbutton', name='Width').fill('60')
        current.get_by_role('button', name=re.compile(r'^Convert \d')).click()
        download = current.get_by_role('button', name=re.compile('^Download'))
        download.wait_for(timeout=120000)
        with page.expect_download(timeout=60000) as caught:
            download.click()
        scaled = pathlib.Path(caught.value.path()).read_bytes()
        # Check what arrived before reading numbers out of it. Unpacking the
        # IHDR of a file that is not a PNG reports a nonsense size rather than
        # the real problem, which is that the wrong file was caught.
        check(scaled[:8] == b'\x89PNG\r\n\x1a\n', f'a PNG came down ({scaled[:4]!r})')
        width, height = struct.unpack('>II', scaled[16:24])
        # 240x180 asked to be 60 wide keeps its shape, so the height follows.
        check((width, height) == (60, 45),
              f'the height followed the width rather than being stretched ({width}x{height})')

        print('== images to PDF ==')
        current = tool('Images to PDF')
        current.locator('input[type=file]').set_input_files(
            [str(FIXTURES / 'grey.png'), str(FIXTURES / 'pale.png')])
        current.locator('img').first.wait_for(timeout=30000)
        reader = saved(lambda: current.get_by_role('button', name='Save PDF').click())
        check(len(reader.pages) == 2, f'two images became two pages ({len(reader.pages)})')

        # PDF holds a JPEG or a PNG and nothing else, so a WebP has to be decoded
        # and re-written on the way in rather than refused at the door.
        current.get_by_role('button', name='Clear', exact=True).click()
        current.locator('input[type=file]').set_input_files(str(FIXTURES / 'converted.webp'))
        current.locator('img').first.wait_for(timeout=30000)
        reader = saved(lambda: current.get_by_role('button', name='Save PDF').click())
        check(len(reader.pages) == 1, 'a WebP goes into a PDF as well')

        print('== compressing a PDF ==')
        # A PDF built here from a photographic JPEG, which is the shape a scan has.
        photo = tool('Convert images')
        photo.get_by_role('button', name='Clear', exact=True).click()
        photo.locator('input[type=file]').set_input_files(str(FIXTURES / 'noisy.png'))
        photo.locator('img').first.wait_for(timeout=30000)
        # The footer only exists once something is loaded, and the width left
        # over from the scaling check would shrink this one too.
        photo.get_by_role('spinbutton', name='Width').fill('')
        photo.get_by_role('combobox', name='To').select_option('jpeg')
        photo.get_by_role('slider', name='Quality').fill('95')
        photo.get_by_role('button', name=re.compile(r'^Convert \d')).click()
        got = photo.get_by_role('button', name=re.compile('^Download'))
        got.wait_for(timeout=120000)
        with page.expect_download(timeout=60000) as caught:
            got.click()
        (FIXTURES / 'photo.jpg').write_bytes(pathlib.Path(caught.value.path()).read_bytes())

        current = tool('Images to PDF')
        current.get_by_role('button', name='Clear', exact=True).click()
        current.locator('input[type=file]').set_input_files(str(FIXTURES / 'photo.jpg'))
        current.locator('img').first.wait_for(timeout=30000)
        with page.expect_download(timeout=60000) as caught:
            current.get_by_role('button', name='Save PDF').click()
        scan = pathlib.Path(caught.value.path()).read_bytes()
        (FIXTURES / 'scan.pdf').write_bytes(scan)

        current = tool('Compress PDF')
        current.locator('input[type=file]').set_input_files(str(FIXTURES / 'scan.pdf'))
        current.get_by_role('combobox', name='Longest side').wait_for(timeout=30000)
        current.get_by_role('slider', name='Quality').fill('30')
        current.get_by_role('button', name='Compress', exact=True).click()
        save = current.get_by_role('button', name='Save PDF')
        save.wait_for(timeout=120000)
        with page.expect_download(timeout=60000) as caught:
            save.click()
        smaller = pathlib.Path(caught.value.path()).read_bytes()
        check(len(smaller) < len(scan),
              f'the PDF came back smaller ({len(scan)} -> {len(smaller)} bytes)')
        check(len(PdfReader(io.BytesIO(smaller)).pages) == 1,
              'and still opens with its page intact')

        # A PDF with no pictures in it has nothing to re-encode, and saying so
        # is the difference between an honest tool and one that looks broken.
        current.locator('input[type=file]').set_input_files(str(FIXTURES / 'plain.pdf'))
        current.get_by_role('button', name='Compress', exact=True).click()
        told = current.get_by_text(re.compile('nothing to re-encode'))
        told.wait_for(timeout=60000)
        check(told.count() == 1, 'a text-only PDF is told it has nothing to shrink')
        check(current.get_by_role('button', name='Save PDF').count() == 0,
              'and is offered no download, because there is no new file')

        print('== signing a PDF ==')
        current = tool('Sign PDF')
        current.locator('input[type=file]').first.set_input_files(str(FIXTURES / 'plain.pdf'))
        pad = current.get_by_label('Sign here')
        pad.wait_for(timeout=30000)
        # Draw a stroke the way a person would, which is the only way the canvas
        # ever gets any ink: there is no programmatic path into it.
        box = pad.bounding_box()
        page.mouse.move(box['x'] + 40, box['y'] + box['height'] / 2)
        page.mouse.down()
        for step in range(1, 12):
            page.mouse.move(box['x'] + 40 + step * (box['width'] - 80) / 11,
                            box['y'] + box['height'] / 2 + (20 if step % 2 else -20))
        page.mouse.up()
        signed = saved(lambda: current.get_by_role('button', name='Sign PDF', exact=True).click())
        check(len(signed.pages) == 3, f'the signed file still has three pages ({len(signed.pages)})')
        # Every page of this fixture already carries an empty /XObject dict, so
        # the question is what is inside it, not whether the key is there.
        def drawings(page):
            return sorted(page.get('/Resources', {}).get('/XObject', {}).keys())

        check(len(drawings(signed.pages[2])) == 1,
              f'the drawing landed on the last page ({drawings(signed.pages[2])})')
        check(drawings(signed.pages[0]) == [] and drawings(signed.pages[1]) == [],
              'and on neither of the others, which nobody asked for')

        print('== PDF to images ==')
        current = tool('PDF to images')
        current.locator('input[type=file]').set_input_files(str(FIXTURES / 'plain.pdf'))
        current.locator('img').first.wait_for(timeout=30000)
        page.wait_for_timeout(1000)
        check(current.locator('img').count() == 3,
              f'three page thumbnails rendered ({current.locator("img").count()})')
        ink = page.evaluate("""() => {
          const img = document.querySelector('main > div:not(.hidden) img');
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const context = canvas.getContext('2d');
          context.drawImage(img, 0, 0);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let dark = 0;
          for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 200) dark++;
          return dark;
        }""")
        check(ink > 50, f'the page rendered with ink on it rather than blank ({ink} dark pixels)')

        print('== a named Adobe CMap is fetched rather than silently missing ==')
        current.locator('input[type=file]').set_input_files(str(FIXTURES / 'cjk.pdf'))
        page.wait_for_timeout(4000)
        cmaps = [r for r in requests if '/pdfjs/cmaps/' in r]
        check(any('UniJIS-UCS2-H' in url for url in cmaps),
              f'pdf.js fetched the CMap the document names ({[c.rsplit("/", 1)[-1] for c in cmaps]})')
        unanswered = [r.url for r in responses if '/pdfjs/' in r.url and r.status != 200]
        check(not unanswered, f'every pdf.js asset request was answered ({unanswered})')

        print('== organize ==')
        current = tool('Organize PDF')
        current.locator('input[type=file]').set_input_files(str(FIXTURES / 'plain.pdf'))
        current.locator('img').first.wait_for(timeout=30000)
        check(current.locator('img').count() == 3,
              f'three pages shown ({current.locator("img").count()})')

        print('== stamp ==')
        current = tool('Stamp PDF')
        current.locator('input[type=file]').set_input_files(str(FIXTURES / 'plain.pdf'))
        current.locator('img').first.wait_for(timeout=30000)
        current.get_by_role('textbox', name='Text', exact=True).fill('CONFIDENTIAL')
        reader = saved(lambda: current.get_by_role('button', name='Save PDF').click())
        check(len(reader.pages) == 3, f'the stamped file still has three pages ({len(reader.pages)})')
        check('CONFIDENTIAL' in reader.pages[0].extract_text(), 'the watermark text is on the page')

        print('== protect ==')
        current = tool('Protect PDF')
        current.locator('input[type=file]').set_input_files(str(FIXTURES / 'plain.pdf'))
        note = current.get_by_text('honoured by the reader')
        note.wait_for(timeout=15000)
        check(note.is_visible(), 'the restrictions note sits next to the controls it qualifies')

        # The note has to follow the settings. Nothing is restricted yet, so it
        # says the general thing; switching printing off has to sharpen it, and
        # adding an open password has to change which of the two limits applies.
        current.get_by_role('group', name='Printing').get_by_role(
            'radio', name='None', exact=True).click()
        check(current.get_by_text('no open password').is_visible(),
              'restricting with no open password is called out as opening for anyone')
        current.locator('input[type=password]').first.fill('browser-pw')
        check(current.get_by_text('can take these restrictions off').is_visible(),
              'once an open password is set, the note says the reader can still lift them')
        reader = saved(lambda: current.get_by_role('button', name='Lock PDF').click())
        check(reader.is_encrypted, 'the saved file is encrypted')
        # With no permissions password the open password is also the owner
        # password, so pypdf reporting OWNER here is the correct reading.
        check(reader.decrypt('browser-pw') != PasswordType.NOT_DECRYPTED,
              'the password typed in the browser opens it')
        check(len(reader.pages) == 3, f'the pages survived ({len(reader.pages)})')
        blank = PdfReader(io.BytesIO((FIXTURES / 'plain.pdf').read_bytes()))
        check(not blank.is_encrypted, 'the source on disk was not touched')

        print('== the session as a whole ==')
        check(not offsite, f'nothing left the origin ({offsite[:3]})')
        check(not errors, f'no uncaught page error ({errors[:2]})')
        missing = [c for c in complaints
                   if 'wasmUrl' in c or 'cMapUrl' in c or 'standardFontDataUrl' in c or 'iccUrl' in c]
        check(not missing, f'pdf.js did not warn about an asset it could not find ({missing})')
        refused = [c for c in complaints if 'Content Security Policy' in c or 'Refused to' in c]
        check(not refused, f'no CSP violation ({refused})')
        browser.close()


if __name__ == '__main__':
    main()
