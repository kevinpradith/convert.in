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

If you touch anything under `src/core/`, the browser is not the only consumer:
the CLI imports the same modules. `npm run cli -- --help` is the quickest way to
check you have not broken it.

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

Both suites need `playwright` and `pypdf`; the browser one also needs
`python3 -m playwright install chromium` once.

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
