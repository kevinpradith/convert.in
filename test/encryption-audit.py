"""Audit convert.in's PDF encryption against an implementation that did not write it.

pdf-lib produces the files; pypdf reads them back. Anything both agree on is a
property of the file rather than of one library's opinion of it.

Usage:

    npm run audit:fixtures -- ./fixtures
    python3 test/encryption-audit.py ./fixtures

Requires pypdf. Exits non-zero on the first failing expectation, so it drops
straight into CI.
"""
import re, subprocess, sys, pathlib
from pypdf import PdfReader, PdfWriter
from pypdf._encryption import PasswordType
from pypdf.constants import UserAccessPermissions as UAP

D = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '.')
ok, bad = [], []
def check(cond, label):
    (ok if cond else bad).append(label)
    print(('  PASS  ' if cond else '  FAIL  ') + label)

def encdict(name):
    raw = (D / name).read_bytes().decode('latin1')
    i = raw.find('/Filter /Standard')
    if i < 0: return ''
    j, depth, k = raw.rfind('<<', 0, i), 0, raw.rfind('<<', 0, i)
    while k < len(raw):
        if raw.startswith('<<', k): depth += 1; k += 2
        elif raw.startswith('>>', k):
            depth -= 1; k += 2
            if depth == 0: break
        else: k += 1
    return re.sub(r'\s+', ' ', raw[j:k])

print('== 1. encryption dictionary, ISO 32000-2 / Acrobat X and later ==')
d = encdict('open-only.pdf')
for token, label in [
    ('/Filter /Standard', 'standard security handler'),
    ('/V 5', 'V 5, the AES-256 handler'),
    ('/R 6', 'R 6, the revision Acrobat X and later writes'),
    ('/Length 256', 'file encryption key is 256 bits'),
    ('/CFM /AESV3', 'crypt filter method AESV3'),
    ('/Length 32', 'crypt filter key is 32 bytes'),
    ('/StmF /StdCF', 'streams go through the standard crypt filter'),
    ('/StrF /StdCF', 'strings go through the standard crypt filter'),
    ('/AuthEvent /DocOpen', 'authenticated at document open'),
]:
    check(token in d, f'{label}: {token}')
# ISO 32000-2 Table 21: hex strings, /U and /O 48 bytes, /UE /OE 32, /Perms 16
for key, want in (('/U', 48), ('/O', 48), ('/UE', 32), ('/OE', 32), ('/Perms', 16)):
    m = re.search(re.escape(key) + r' <([0-9a-fA-F]+)>', d)
    check(bool(m) and len(m.group(1)) // 2 == want,
          f'{key} is a {want}-byte hex string (found {len(m.group(1))//2 if m else 0})')
check('/EncryptMetadata false' not in d, 'metadata is encrypted (the spec default, and Acrobat\'s)')

print()
print('== 2. an independent implementation opens it ==')
r = PdfReader(D / 'open-only.pdf')
check(r.is_encrypted, 'pypdf sees encryption')
check(r.decrypt('hunter2') != PasswordType.NOT_DECRYPTED, 'the password opens it')
check(len(r.pages) == 3, 'three pages readable')
check('page 2' in r.pages[1].extract_text(), 'page content intact')
check(PdfReader(D / 'open-only.pdf').decrypt('wrong') == PasswordType.NOT_DECRYPTED, 'wrong password refused')
check(PdfReader(D / 'open-only.pdf').decrypt('') == PasswordType.NOT_DECRYPTED, 'empty password refused')

print()
print('== 3. Acrobat permission semantics ==')
r3 = PdfReader(D / 'both.pdf')
check(r3.decrypt('openpw') == PasswordType.USER_PASSWORD, 'open password authenticates as user')
p = r3.user_access_permissions
check(UAP.PRINT in p, 'printing allowed')
check(UAP.PRINT_TO_REPRESENTATION not in p, 'high-resolution printing denied, so "low" means low')
check(UAP.MODIFY not in p, 'modifying denied')
check(UAP.EXTRACT not in p, 'copying denied')
check(UAP.ADD_OR_MODIFY not in p, 'annotating denied')
check(UAP.FILL_FORM_FIELDS not in p, 'form filling denied')
check(UAP.ASSEMBLE_DOC not in p, 'assembly denied')
check(UAP.EXTRACT_TEXT_AND_GRAPHICS in p, 'screen-reader access always allowed')
check(PdfReader(D / 'both.pdf').decrypt('ownerpw') == PasswordType.OWNER_PASSWORD,
      'permissions password authenticates as owner')

r5 = PdfReader(D / 'perms-only.pdf')
check(r5.is_encrypted and r5.decrypt('') == PasswordType.USER_PASSWORD,
      'permissions-only file is encrypted yet opens with no prompt')
check(UAP.PRINT not in r5.user_access_permissions, 'and its restrictions are in force')

print()
print('== 4. nothing is lost on the way through ==')
plain = PdfReader(D / 'plain.pdf')
enc = PdfReader(D / 'open-only.pdf'); enc.decrypt('hunter2')
unl = PdfReader(D / 'unlocked.pdf')
want_meta = {k: v for k, v in (plain.metadata or {}).items() if k in ('/Title', '/Author', '/Subject', '/Keywords')}
check(len(want_meta) == 4, 'the source really carries metadata to lose')
check(all((enc.metadata or {}).get(k) == v for k, v in want_meta.items()), 'protect keeps metadata')
check(list((enc.get_fields() or {}).keys()) == ['who'], 'protect keeps form fields')
check(not unl.is_encrypted, 'unlocked file carries no /Encrypt')
check(len(unl.pages) == 3 and 'page 3' in unl.pages[2].extract_text(), 'unlock keeps pages and content')
check(all((unl.metadata or {}).get(k) == v for k, v in want_meta.items()), 'unlock keeps metadata')
check(list((unl.get_fields() or {}).keys()) == ['who'], 'unlock keeps form fields')


print()
print('== 5. re-locking an already locked file ==')
rl = PdfReader(D / 'relocked.pdf')
check(rl.is_encrypted, 'relocked file is encrypted')
check(rl.decrypt('second') != PasswordType.NOT_DECRYPTED, 'the new password opens it')
check(PdfReader(D / 'relocked.pdf').decrypt('hunter2') == PasswordType.NOT_DECRYPTED, 'the old password no longer does')
check(len(rl.pages) == 3 and 'page 1' in rl.pages[0].extract_text(), 'content survived re-locking')
d2 = encdict('relocked.pdf')
check('/V 5' in d2 and '/R 6' in d2, 're-lock still writes V5/R6')
check(len(re.findall(r'/Filter /Standard', (D/'unlocked.pdf').read_bytes().decode('latin1'))) == 0,
      'the unlocked file has no encryption dictionary left in it at all')

print()
print('== 6. files this project did not write ==')
# Every other check here reads back something pdf-lib produced, which cannot
# say whether a locked PDF from anywhere else opens at all. So encrypt with
# pypdf, in the older schemes real documents still arrive in, and drive the
# actual command a person would run.
FOREIGN = D / 'foreign'
FOREIGN.mkdir(exist_ok=True)
source = PdfReader(D / 'plain.pdf')
schemes = [
    ('RC4-40', 'rc4-40'),
    ('RC4-128', 'rc4-128'),
    ('AES-128', 'aes-128'),
    ('AES-256-R5', 'aes-256-r5'),
    ('AES-256', 'aes-256-r6'),
]
for algorithm, slug in schemes:
    locked = FOREIGN / f'{slug}.pdf'
    unlocked = FOREIGN / f'{slug}-unlocked.pdf'
    unlocked.unlink(missing_ok=True)
    writer = PdfWriter(clone_from=source)
    writer.encrypt('hunter2', 'ownerpw', algorithm=algorithm)
    writer.write(locked)

    run = subprocess.run(
        ['node', 'bin/convert.in.mjs', 'unlock', str(locked), '-o', str(unlocked)],
        input='hunter2\n', capture_output=True, text=True,
    )
    check(run.returncode == 0, f'{algorithm}: convert.in unlock exits cleanly ({run.stderr.strip()[:60]})')
    if run.returncode != 0:
        continue
    back = PdfReader(unlocked)
    check(not back.is_encrypted, f'{algorithm}: the result carries no encryption')
    check(len(back.pages) == 3, f'{algorithm}: all three pages came through')
    check('page 2' in back.pages[1].extract_text(), f'{algorithm}: page content is readable')
    check(back.metadata is not None and back.metadata.title == 'Audit Source',
          f'{algorithm}: the title survived')

    wrong = subprocess.run(
        ['node', 'bin/convert.in.mjs', 'unlock', str(locked),
         '-o', str(FOREIGN / f'{slug}-nope.pdf')],
        input='wrong\n', capture_output=True, text=True,
    )
    check(wrong.returncode != 0, f'{algorithm}: a wrong password is refused')

print()
print('== 7. nothing readable is left outside the ciphertext ==')
# The direct-exfiltration half of PDFex (Muller et al., ACM CCS 2019) needs a
# partially encrypted file: the format permits ciphertext and plaintext side by
# side, and a reader will happily render both. /StmF and /StrF above say every
# stream and every string goes through the crypt filter; this says the same
# thing from the outside, by looking for the source document's own words in the
# bytes we shipped.
for name, password in (('open-only.pdf', 'hunter2'), ('both.pdf', 'openpw'), ('perms-only.pdf', '')):
    raw = (D / name).read_bytes()
    # Title and author live in /Info, the text in a content stream, the field
    # name in the AcroForm. Different places, all of them strings or streams.
    for probe in (b'Audit Source', b'convert.in', b'encryption audit', b'page 1', b'who'):
        check(probe not in raw, f'{name}: {probe.decode()!r} is not sitting in the file in the clear')
    # A name object is not a string and the spec never encrypts one, so finding
    # /Helvetica is correct rather than a leak. Assert that, so a future change
    # that starts leaking real strings cannot hide behind it.
    check(raw.count(b'Helvetica') == raw.count(b'/Helvetica'),
          f'{name}: the only Helvetica in the file is the font name object, which is never encrypted')

print()
print('== 8. a file that only pretends to be encrypted ==')
# The other half of PDFex: the format lets ciphertext and plaintext sit side by
# side, so a document can announce AES-256, prompt for a password, and still
# carry every page in the clear. Nothing warns about it, because nothing about
# it breaks the spec. Built here rather than reasoned about, with real R6 key
# material lifted from a file this project wrote, so a reader would accept the
# password and show the same document either way.
real = (D / 'open-only.pdf').read_bytes().decode('latin1')

def keymaterial(key):
    return re.search(r'/%s <([0-9a-fA-F]+)>' % key, real).group(1).encode()

body = b'BT /F1 14 Tf 20 200 Td (CONFIDENTIAL SALARY DATA) Tj ET\n'
objects = [
    b'<< /Type /Catalog /Pages 2 0 R >>',
    b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] '
    b'/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    b'<< /Length %d >>\nstream\n' % len(body) + body + b'endstream',
    b'<< /Title (Payroll 2026) /Author (payroll.admin) >>',
    b'<< /Filter /Standard /V 5 /R 6 /Length 256 '
    b'/CF << /StdCF << /AuthEvent /DocOpen /CFM /AESV3 /Length 32 >> >> '
    # The whole trick. Both are legal values, and both mean "encrypt nothing".
    b'/StmF /Identity /StrF /Identity '
    b'/U <%s> /O <%s> /UE <%s> /OE <%s> /Perms <%s> /P -4 >>'
    % tuple(keymaterial(k) for k in ('U', 'O', 'UE', 'OE', 'Perms')),
]
out = bytearray(b'%PDF-1.7\n%\xe2\xe3\xcf\xd3\n')
offsets = []
for number, obj in enumerate(objects, 1):
    offsets.append(len(out))
    out += b'%d 0 obj\n' % number + obj + b'\nendobj\n'
start = len(out)
out += b'xref\n0 %d\n0000000000 65535 f \n' % (len(objects) + 1)
for offset in offsets:
    out += b'%010d 00000 n \n' % offset
out += (b'trailer\n<< /Size %d /Root 1 0 R /Info 6 0 R /Encrypt 7 0 R '
        b'/ID [<0102030405060708090a0b0c0d0e0f10> <0102030405060708090a0b0c0d0e0f10>] >>\n'
        b'startxref\n%d\n%%%%EOF\n' % (len(objects) + 1, start))
pretend = D / 'pretends-encrypted.pdf'
pretend.write_bytes(bytes(out))

# The premise: this really is readable with no password at all.
raw = pretend.read_bytes()
check(b'CONFIDENTIAL SALARY DATA' in raw, 'the fixture really does leave its page in the clear')
check(b'payroll.admin' in raw, 'and its author')

told = subprocess.run(
    ['node', 'bin/convert.in.mjs', 'info', str(pretend)],
    capture_output=True, text=True,
)
said = told.stdout + told.stderr
check('encrypted, needs a password' not in said,
      'info does not call a file protected when its pages are readable')
check('does not encrypt everything' in said,
      f'info says what is actually readable ({said.strip()[-60:]!r})')

print()
print(f'== {len(ok)} passed, {len(bad)} failed ==')
for b in bad: print('   FAILED:', b)
sys.exit(1 if bad else 0)
