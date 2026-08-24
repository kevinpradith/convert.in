## What this changes

<!-- The behaviour, not the diff. What someone using the tools would notice. -->

## Why

<!-- Link the issue if there is one: Fixes #123. If there is not, say what went
     wrong or what was missing. -->

## Checks

<!-- Tick what you ran. Leave the rest unticked rather than guessing. -->

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] Touched `src/core/`, so the CLI was checked too: `npm run cli -- --help`
- [ ] Touched encryption, so the independent audit was run:
      `npm run audit:fixtures -- ./fixtures && python3 test/encryption-audit.py ./fixtures`
- [ ] Touched the interface, the headers or anything pdf.js loads, so the browser
      suite was run against the real build: `npm run build && npm run test:browser`
- [ ] Added a dependency, so it is listed in `scripts/notices.mjs` and
      `npm run notices` was run

## Anything left undone

<!-- A known limit, a case not covered, a follow-up worth its own issue. Saying
     so is better than it being found later. -->
