# Security policy

## Reporting a vulnerability

Please report security issues privately rather than opening a public issue.

Use [GitHub's private vulnerability reporting](https://github.com/kevinpradith/convert.in/security/advisories/new)
on this repository. It opens a private thread visible only to the maintainer,
and it can be turned into a published advisory once a fix is out.

Expect an acknowledgement within seven days. If you have had no reply after
that, the report may not have reached anyone, so open a public issue saying only
that you are waiting on a security response. Do not put the details in it.

## Supported versions

This project is pre-1.0 and there is no maintenance branch. Fixes land on `main`
and go out in the next tag. Run the latest release.

| Version | Supported |
| --- | --- |
| latest release | yes |
| anything older | no |

## What is in scope

The claim this project makes is that no file ever leaves the machine it is
opened on, and that a document locked with a password is locked with something
worth calling encryption. Anything that breaks either claim is a vulnerability
here, whatever else it is elsewhere:

- Any path by which file bytes, a filename, or a password reach the network.
- A weakness in the password handling in `src/core/pdf-security.ts`, including
  the key derivation, the cipher choice, and anything left in the clear in a
  file the tool has just encrypted.
- A way past the Content-Security-Policy in `vercel.json` and `public/_headers`,
  since the policy is what makes the privacy claim hold even if a dependency is
  compromised. The same applies to the cross-origin isolation headers beside it.
- Anything a crafted filename can do to the name a finished file is saved
  under, which `safeName` in `src/ui/files.ts` is responsible for.
- Cross-site scripting through a crafted file, in particular an SVG, which the
  browser decoder renders through an `<img>` element on purpose because that
  context runs no script.
- A crafted PDF or image that reads or writes outside its own data.

## What is not in scope

- Permissions on a PDF being liftable by anyone who can open it. This is how the
  format works, and both the CLI and the web app say so before they write such a
  file rather than leaving it to be discovered.
- Denial of service from a file you supply to your own copy. A large document
  will make the tab work hard. There is nothing on the other side of it to
  exhaust.
- Anything that requires an attacker to already be running code as you.
- Reports produced by a scanner with no accompanying explanation of how the
  finding applies to a static, serverless application.

## How this is tested

Every claim above has a check behind it rather than a paragraph. `npm test`
covers the core, `python3 test/encryption-audit.py` reads encrypted files back
with an unrelated library so a mistake both sides of `pdf-lib` agree on is still
caught, `npm run test:cli` drives every command end to end, and
`npm run test:browser` serves the real build with the real headers and fails if
a single request leaves the origin. See [CONTRIBUTING.md](CONTRIBUTING.md) for
how to run them.

The supply chain around those checks is pinned rather than floating: every
GitHub Action is referenced by commit rather than by tag, since moving a tag is
exactly how `tj-actions/changed-files` was turned into a secret exfiltrator
across 23,000 repositories in March 2025 (CVE-2025-30066), and the two Python
packages CI installs are pinned in `test/requirements.txt`.
