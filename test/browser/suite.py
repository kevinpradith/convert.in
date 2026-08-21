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


def png(width, height, grey):
    """A real PNG, built here so the suite needs no image library."""
    raw = b''.join(b'\x00' + bytes([grey, grey, grey]) * width for _ in range(height))

    def chunk(kind, body):
        return (
            struct.pack('>I', len(body))
            + kind
            + body
            + struct.pack('>I', zlib.crc32(kind + body))
        )

    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(raw))
        + chunk(b'IEND', b'')
    )


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

        print('== images to PDF ==')
        current = tool('Images to PDF')
        current.locator('input[type=file]').set_input_files(
            [str(FIXTURES / 'grey.png'), str(FIXTURES / 'pale.png')])
        current.locator('img').first.wait_for(timeout=30000)
        reader = saved(lambda: current.get_by_role('button', name='Save PDF').click())
        check(len(reader.pages) == 2, f'two images became two pages ({len(reader.pages)})')

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
