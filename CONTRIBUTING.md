# Contributing

Issues and pull requests are welcome.

## Licensing of contributions

By opening a pull request you agree that your contribution is licensed under the
[MIT License](LICENSE), the same terms as the rest of the project. There is no
separate agreement to sign. This is worth stating rather than assuming: without
it, a contribution stays under its author's exclusive copyright and the project
has no clear right to ship it.

## Before you open a pull request

```sh
npm install
npm run typecheck
npm test
npm run build
```

## Two choices about the toolchain

`@types/node` is held at the **oldest** Node this project supports rather than
the newest one you are likely to be running. `package.json` says
`"engines": { "node": ">=20.19" }`, and typing against a newer release would let
an API that does not exist on 20 pass the typechecker and fail for whoever is
actually on it. Dependabot is told not to offer the major, because taking it
would lift the floor without anybody deciding to. If you need something newer,
raise the engines floor deliberately and move both together.

`typescript` is on 7, the native compiler. It typechecks this project in about
1.8 seconds against about 10.3 for 5.9, measured on this repository, and it
ships as platform binaries picked by `npm install`, so a fresh clone gets the
one for its own machine.

If you touch anything under `src/core/`, the browser is not the only consumer:
the CLI imports the same modules. `npm run test:cli` drives every command once
and reads the result back, which covers the argument parsing and output naming
that `npm test` does not reach:

```sh
npm run test:cli
```

If you touch encryption, run the independent audit as well. It reads the files
back with `pypdf`, so a mistake that both sides of `pdf-lib` agree on still gets
caught:

```sh
npm run audit:fixtures -- ./fixtures
python3 test/encryption-audit.py ./fixtures
```

If you touch the interface, the response headers or anything pdf.js loads, run
the browser suite. It serves the real `dist/` with the real `public/_headers`,
so a change that only works without the Content-Security-Policy fails here
rather than after deployment:

```sh
npm run build
npm run test:browser
```

All three Python suites install from one pinned file:

```sh
pip install -r test/requirements.txt
python3 -m playwright install chromium
```

They need `playwright` and `pypdf`, and the encryption one needs pypdf's
crypto extra, since every fixture it reads back is AES-256 and pypdf leaves that
dependency optional:

```sh
pip install playwright 'pypdf[crypto]'
python3 -m playwright install chromium   # once, for the browser suite
```

## Adding a dependency

Anything that ends up in the browser bundle also ends up in the licence notices.
Add it to the list in `scripts/notices.mjs` and run `npm run notices`. If it
ships loose files rather than bundled code, copy the directory whole so its
licence file travels with it, the way the pdf.js assets are handled in
`vite.config.ts`. A dependency under a copyleft licence needs discussing first,
since it would change the terms the whole project can ship under.

## Scope

Two things are deliberately absent and are unlikely to be accepted: anything
that uploads a file, and anything that requires a server. The privacy claim is
tested, not promised, and both would break it.
