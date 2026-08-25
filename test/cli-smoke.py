"""Drive every command the CLI offers, once, and read the result back.

The unit tests cover src/core and the browser suite covers the web app. Neither
covers the layer between a typed command and those functions: argument parsing,
output naming, the batch runner that works out every path before writing the
first file, and the warnings printed alongside. That layer is most of src/cli.ts
and it used to have nothing behind it.

Usage:
    npm run build            # bin/convert.in.mjs runs from source, but the
                             # fixtures below are cheaper than a real corpus
    python3 test/cli-smoke.py
"""

import io
import pathlib
import shutil
import struct
import subprocess
import sys
import tempfile
import zlib

from pypdf import PdfReader

ROOT = pathlib.Path(__file__).resolve().parent.parent
CLI = ['node', str(ROOT / 'bin' / 'convert.in.mjs')]

ok, bad = [], []


def check(condition, label):
    (ok if condition else bad).append(label)
    print(('  PASS  ' if condition else '  FAIL  ') + label)


def run(*args, stdin='', expect=0):
    """Run the CLI and return (exit code, stdout + stderr)."""
    done = subprocess.run(
        CLI + [str(a) for a in args],
        input=stdin,
        capture_output=True,
        text=True,
        cwd=ROOT,
    )
    said = done.stdout + done.stderr
    if expect is not None and done.returncode != expect:
        print('  ---- unexpected exit', done.returncode, 'from', ' '.join(str(a) for a in args))
        print('  ---- ' + said.strip()[:400].replace('\n', '\n  ---- '))
    return done.returncode, said


def png(width, height, grey=90):
    """A minimal truecolour PNG, built here so the repo carries no binaries."""
    def chunk(kind, body):
        return (
            struct.pack('>I', len(body))
            + kind
            + body
            + struct.pack('>I', zlib.crc32(kind + body))
        )

    header = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    raw = b''.join(b'\x00' + bytes([grey, grey, grey]) * width for _ in range(height))
    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', header)
        + chunk(b'IDAT', zlib.compress(raw))
        + chunk(b'IEND', b'')
    )


def pages_of(path):
    return len(PdfReader(str(path)).pages)


def outlined_pdf():
    """A four-page document with a two-level table of contents.

    Written out by hand because the point of reading it back with pypdf is that
    nothing which produced it also read it."""
    objects = [
        b'<< /Type /Catalog /Pages 2 0 R /Outlines 6 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R 10 0 R] /Count 4 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
        b'<< /Type /Outlines /First 7 0 R /Last 8 0 R /Count 3 >>',
        b'<< /Title (Chapter one) /Parent 6 0 R /Next 8 0 R '
        b'/Dest [3 0 R /XYZ 0 200 0] >>',
        b'<< /Title (Chapter two) /Parent 6 0 R /Prev 7 0 R '
        b'/First 9 0 R /Last 9 0 R /Count 1 /Dest [5 0 R /XYZ 0 200 0] >>',
        b'<< /Title (Section 2.1) /Parent 8 0 R /Dest [10 0 R /XYZ 0 200 0] >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
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


def bookmarks_of(path):
    """Every bookmark as "title -> 1-based page", read back with pypdf."""
    reader = PdfReader(str(path))
    found = []

    def walk(items):
        for item in items:
            if isinstance(item, list):
                walk(item)
            else:
                found.append(f'{item.title} -> {reader.get_destination_page_number(item) + 1}')

    walk(reader.outline)
    return found


def main():
    work = pathlib.Path(tempfile.mkdtemp(prefix='convert-in-smoke-'))
    try:
        smoke(work)
    finally:
        shutil.rmtree(work, ignore_errors=True)

    print()
    print(f'== {len(ok)} passed, {len(bad)} failed ==')
    for label in bad:
        print('   FAILED:', label)
    sys.exit(1 if bad else 0)


def smoke(work):
    print('== the front door ==')
    code, said = run('--version')
    check(code == 0 and said.strip().startswith('convert.in'), f'--version answers ({said.strip()})')
    code, said = run('--help')
    check(code == 0 and 'COMMANDS' in said, '--help lists the commands')
    code, said = run('proctect', 'x.pdf', expect=1)
    check(code == 1 and 'protect' in said, 'a misspelt command suggests the real one')
    code, said = run('convert', expect=1)
    check(code == 1 and 'no images given' in said, 'a command with no input says so')

    print()
    print('== images in, PDF out ==')
    # Big enough that the pages they become have room for a signature stamp.
    for index, name in enumerate(['shot1.png', 'shot2.png', 'shot10.png']):
        (work / name).write_bytes(png(600 + index * 100, 400))
    code, _ = run('images', work / 'shot1.png', work / 'shot2.png', work / 'shot10.png',
                  '-o', work / 'album.pdf')
    check(code == 0 and pages_of(work / 'album.pdf') == 3, 'images makes one page per picture')

    code, said = run('images', work / 'shot1.png', work / 'shot2.png', work / 'shot10.png',
                     '--sort', 'natural', '-o', work / 'sorted.pdf')
    widths = [round(float(p.mediabox.width)) for p in PdfReader(str(work / 'sorted.pdf')).pages]
    # 600, 700 and 800 pixels at the 96dpi an image claiming nothing is given.
    check(widths == [450, 525, 600], f'--sort natural counts the way a person does ({widths})')

    print()
    print('== one image format into another ==')
    code, _ = run('convert', work / 'shot1.png', '--to', 'webp', '-o', work / 'shot1.webp')
    check(code == 0 and (work / 'shot1.webp').read_bytes()[:4] == b'RIFF', 'convert writes a WebP')
    code, _ = run('convert', work / 'shot1.png', '--to', 'jpeg', '--width', '120',
                  '-o', work / 'small.jpg')
    check(code == 0 and (work / 'small.jpg').read_bytes()[:3] == b'\xff\xd8\xff',
          'convert scales and writes a JPEG')

    print()
    print('== page-level commands ==')
    source = work / 'album.pdf'
    code, _ = run('merge', source, source, '-o', work / 'twice.pdf')
    check(code == 0 and pages_of(work / 'twice.pdf') == 6, 'merge joins in the order given')

    code, _ = run('select', source, '3,1', '-o', work / 'picked.pdf')
    check(code == 0 and pages_of(work / 'picked.pdf') == 2, 'select keeps the pages named')

    code, _ = run('rotate', source, '180', '--pages', 'even', '-o', work / 'turned.pdf')
    turns = [p.rotation for p in PdfReader(str(work / 'turned.pdf')).pages]
    check(code == 0 and turns == [0, 180, 0], f'rotate --pages even turns every other one ({turns})')

    code, _ = run('split', source, '-o', work / 'split')
    parts = sorted((work / 'split').glob('*.pdf'))
    check(code == 0 and len(parts) == 3, f'split writes one file per page ({len(parts)})')

    print()
    print('== bookmarks ==')
    # An outline names its pages by reference, so copying pages leaves the whole
    # table of contents pointing at objects that came nowhere. Read back with
    # pypdf, which shares no code with what wrote the file.
    (work / 'book.pdf').write_bytes(outlined_pdf())
    check(bookmarks_of(work / 'book.pdf') ==
          ['Chapter one -> 1', 'Chapter two -> 3', 'Section 2.1 -> 4'],
          'the fixture really carries a two-level table of contents')

    code, _ = run('merge', work / 'book.pdf', work / 'book.pdf', '-o', work / 'twobooks.pdf')
    check(code == 0 and bookmarks_of(work / 'twobooks.pdf') == [
        'Chapter one -> 1', 'Chapter two -> 3', 'Section 2.1 -> 4',
        'Chapter one -> 5', 'Chapter two -> 7', 'Section 2.1 -> 8',
    ], f'merge carries both sets ({bookmarks_of(work / "twobooks.pdf")})')

    # Chapter one has no page here, so it goes rather than pointing somewhere
    # plausible.
    code, _ = run('select', work / 'book.pdf', '3-4', '-o', work / 'chapter2.pdf')
    check(code == 0 and bookmarks_of(work / 'chapter2.pdf') ==
          ['Chapter two -> 1', 'Section 2.1 -> 2'],
          f'select keeps the ones whose pages came ({bookmarks_of(work / "chapter2.pdf")})')

    code, _ = run('split', work / 'book.pdf', '2', '-o', work / 'halves')
    halves = sorted((work / 'halves').glob('*.pdf'))
    check(len(halves) == 2 and bookmarks_of(halves[1]) == ['Chapter two -> 1', 'Section 2.1 -> 2'],
          'and split gives each half its own')

    print()
    print('== stamping ==')
    code, _ = run('watermark', source, 'CONFIDENTIAL', '-o', work / 'marked.pdf')
    check(code == 0 and pages_of(work / 'marked.pdf') == 3, 'watermark keeps the pages')
    code, said = run('number', source, '-o', work / 'numbered.pdf')
    check(code == 0 and pages_of(work / 'numbered.pdf') == 3, 'number keeps the pages')
    check('3 pages' in said, f'and says how many it numbered ({said.strip()[-30:]!r})')
    code, _ = run('sign', source, work / 'shot1.png', '-o', work / 'signed.pdf')
    check(code == 0 and pages_of(work / 'signed.pdf') == 3, 'sign draws on a page')

    print()
    print('== compress ==')
    code, said = run('compress', source, '-o', work / 'smaller.pdf')
    check(code == 0, 'compress runs on a document with nothing to shrink')
    check('nothing to re-encode' in said or 'came out smaller' in said,
          'and says why nothing happened rather than showing 0%')
    code, said = run('compress', source, '--max-size', '5mb', '-o', work / 'under.pdf')
    check(code == 0 and 'already' in said, 'a file already under the limit is left alone')

    print()
    print('== passwords ==')
    code, said = run('protect', source, '--open-password', 'hunter2', '-o', work / 'locked.pdf')
    check(code == 0, 'protect locks a file')
    check('shell history' in said, 'and warns that a password in argv is visible in ps')
    check(PdfReader(str(work / 'locked.pdf')).is_encrypted, 'the result really is encrypted')

    code, said = run('unlock', work / 'locked.pdf', '-o', work / 'opened.pdf', stdin='hunter2\n')
    check(code == 0 and not PdfReader(str(work / 'opened.pdf')).is_encrypted,
          'unlock takes a piped password and removes the encryption')
    code, said = run('unlock', work / 'locked.pdf', '-o', work / 'nope.pdf',
                     stdin='wrong\n', expect=1)
    check(code == 1 and 'does not open' in said, 'a wrong password is refused in words')

    # A permissions-only file opens with an empty password. Nothing should ask.
    code, _ = run('protect', source, '--permissions-password', 'owner', '--printing', 'none',
                  '-o', work / 'perms.pdf')
    check(code == 0, 'protect writes a permissions-only file')
    code, said = run('protect', work / 'perms.pdf', '--open-password', 'later',
                     '-o', work / 'perms-locked.pdf')
    check(code == 0, 'and re-protecting it does not demand a password that does not exist')

    print()
    print('== metadata ==')
    code, said = run('info', source)
    check(code == 0 and '3 pages' in said, f'info reports the page count ({said.strip()[-40:]!r})')
    code, said = run('clean', source, '-o', work / 'clean.pdf')
    check(code == 0, 'clean runs')
    check(b'Producer' not in (work / 'clean.pdf').read_bytes(), 'and leaves no Producer behind')

    print()
    print('== nothing is overwritten by accident ==')
    code, said = run('convert', work / 'shot1.png', '--to', 'webp',
                     '-o', work / 'shot1.webp', expect=1)
    check(code == 1 and 'already exists' in said, 'an existing output stops the run')
    code, _ = run('convert', work / 'shot1.png', '--to', 'webp',
                  '-o', work / 'shot1.webp', '--force')
    check(code == 0, 'and --force is how you mean it')

    # Two inputs whose names collide would write one file twice. Every output
    # path is worked out before the first byte is written, so this stops early.
    (work / 'a.png').write_bytes(png(10, 10))
    nested = work / 'deep'
    nested.mkdir()
    (nested / 'a.png').write_bytes(png(10, 10))
    code, said = run('convert', work / 'a.png', nested / 'a.png', '--to', 'webp',
                     '-o', work / 'out', expect=1)
    check(code == 1 and 'twice' in said, 'two inputs that would collide stop before writing')

    print()
    print('== a file that is not what it says ==')
    (work / 'not-a.pdf').write_bytes(b'this is not a PDF at all\n')
    code, said = run('info', work / 'not-a.pdf', expect=1)
    check(code == 1 and 'not a PDF' in said, 'a text file called .pdf is named as such')
    check('at ' not in said.split('convert.in:')[-1][:200],
          'and the failure is a sentence, not a stack trace')


if __name__ == '__main__':
    main()
