"""Feed damaged files to the CLI and insist it stays a tool rather than a stack trace.

Every other suite here hands the code files it wrote itself. This one hands it
files nobody wrote on purpose: bytes flipped in the middle of an object, a
document cut off halfway through, a header with a digit changed. A PDF reader is
a parser over input it did not produce, which is the shape of software that
fails badly, so the question is not whether a damaged file is refused but how.

Three things are treated as failures, and none of them is "the file was
rejected":

  - a crash that reaches the terminal as a stack trace, or as the name of an
    internal error class, rather than as a sentence about the file
  - an exit code that is neither 0 nor 1, which is what a signal or an
    unhandled rejection looks like from the outside
  - a run that never finishes, since a parser that loops on damaged input is a
    denial of service in a tool people point at whole folders

The mutations are seeded, so a failure here reproduces exactly:

    python3 test/fuzz-cli.py fixtures --rounds 200 --seed 7

Usage:
    npm run build
    npm run audit:fixtures -- ./fixtures
    python3 test/fuzz-cli.py fixtures
"""

import argparse
import pathlib
import random
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
CLI = ['node', str(ROOT / 'bin' / 'convert.in.mjs')]

# What a crash looks like on the way out. The first is a stack frame; the rest
# are the names JavaScript gives its own faults, which reach a person only when
# nothing translated them into a sentence about their file.
CRASH_MARKS = (
    '\n    at ',
    'TypeError',
    'RangeError',
    'ReferenceError',
    'AssertionError',
    'Unhandled',
)

# One command per shape of work: reading, rebuilding, drawing, re-encoding, and
# the image path, which goes through a different set of decoders entirely.
COMMANDS = [
    ('info', []),
    ('clean', ['-o', '{out}.pdf']),
    ('select', ['--pages', '1', '-o', '{out}.pdf']),
    ('rotate', ['--degrees', '90', '-o', '{out}.pdf']),
    ('number', ['-o', '{out}.pdf']),
    ('watermark', ['--text', 'DRAFT', '-o', '{out}.pdf']),
    ('compress', ['-o', '{out}.pdf']),
]

IMAGE_COMMANDS = [
    ('info', []),
    ('convert', ['--to', 'webp', '-o', '{out}.webp']),
]


def damage(data: bytes, rng: random.Random) -> bytes:
    """Break a file the way a bad transfer or a dying disk breaks one."""
    out = bytearray(data)
    for _ in range(rng.randint(1, 12)):
        out[rng.randrange(len(out))] = rng.randrange(256)
    roll = rng.random()
    if roll < 0.25:
        # Cut short: the cross-reference table at the end goes missing, which is
        # the most common real damage a PDF arrives with.
        out = out[: rng.randrange(1, len(out))]
    elif roll < 0.35:
        # Keep the header, lose the body. A file that announces itself and then
        # has nothing to show reaches different code than random noise does.
        out = out[: rng.randrange(1, min(64, len(out)))]
    return bytes(out)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('fixtures', nargs='?', default='fixtures')
    parser.add_argument('--rounds', type=int, default=120)
    parser.add_argument('--seed', type=int, default=7)
    options = parser.parse_args()

    corpus = pathlib.Path(options.fixtures)
    seeds = [
        (corpus / name, kind)
        for name, kind in [
            ('plain.pdf', 'pdf'),
            ('scan.pdf', 'pdf'),
            ('perms-only.pdf', 'pdf'),
            ('talkative.pdf', 'pdf'),
            ('photo.jpg', 'image'),
            ('grey.png', 'image'),
        ]
        if (corpus / name).is_file()
    ]
    if not seeds:
        print(f'no fixtures in {corpus}: run "npm run audit:fixtures -- ./{corpus}" first')
        return 2

    rng = random.Random(options.seed)
    # A temporary directory rather than the corpus: a damaged file left next to
    # the fixtures is a file some later run would read as though it were one.
    work = pathlib.Path(tempfile.mkdtemp(prefix='convert-in-fuzz-'))
    failures = []
    print(f'== {options.rounds} damaged files, seed {options.seed} ==')
    try:
        for round_number in range(options.rounds):
            source, kind = rng.choice(seeds)
            broken = work / f'r{round_number}{source.suffix}'
            broken.write_bytes(damage(source.read_bytes(), rng))

            command, rest = rng.choice(COMMANDS if kind == 'pdf' else IMAGE_COMMANDS)
            args = [command, str(broken)] + [
                part.replace('{out}', str(work / f'o{round_number}')) for part in rest
            ]
            try:
                done = subprocess.run(
                    CLI + args, capture_output=True, text=True, cwd=ROOT, timeout=90
                )
            except subprocess.TimeoutExpired:
                failures.append(f'{command} never finished on {broken.name}')
                continue

            said = done.stdout + done.stderr
            if done.returncode not in (0, 1):
                failures.append(f'{command} exited {done.returncode} on {broken.name}')
            hit = next((mark for mark in CRASH_MARKS if mark in said), None)
            if hit is not None:
                failures.append(
                    f'{command} answered with {hit.strip()!r} on {broken.name}: '
                    f'{said.strip()[:160]!r}'
                )
    finally:
        shutil.rmtree(work, ignore_errors=True)

    for failure in failures:
        print('  FAIL  ' + failure)
    print(f'\n== {options.rounds - len(failures)} clean, {len(failures)} failed ==')
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
