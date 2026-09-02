# Hosting it

The build is static files and nothing else: no server, no environment variables,
no API routes, so there is no server side to misconfigure or leak. `base` is
`'./'`, so it works from a subdirectory too, such as a GitHub Pages project site.

```sh
npm run build      # -> dist/
```

Drop `dist/` on Vercel, Netlify, Cloudflare Pages, GitHub Pages, or any static
host. [convertin.kevinpradith.my.id](https://convertin.kevinpradith.my.id) is one
such copy, on Vercel, built from `main` by the settings below and nothing else. `vercel.json` carries the build settings and the response headers;
`public/_headers` carries the identical headers for Netlify and Cloudflare Pages,
generated from the same values so the two cannot drift.

The headers set a strict Content-Security-Policy: `default-src 'self'`,
`connect-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`. A privacy
tool should not merely promise it never uploads anything; the CSP means that even
a compromised dependency has nowhere to send a file. The whole browser suite is
re-run against the built output served with these exact headers, so the policy is
known to be one the app can actually live under rather than one that looks good
in a config file. A test asserts the two header files still agree, because they
are maintained by hand and a policy that drifts between hosts is worse than no
policy at all.

The pages are also cross-origin isolated, with `Cross-Origin-Opener-Policy:
same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. Every asset here
is same-origin, so the cost is nothing, and it puts the document in its own
process group where a Spectre-class read of another origin's memory has nothing
to reach.

`require-trusted-types-for 'script'` is **not** set, and that is a decision
rather than an omission. It was tested: pdf.js ships no Trusted Types policy of
its own, so the directive blocks it from starting its worker and it silently
falls back to decoding pages on the main thread. Adding a default policy that
waves script URLs through would satisfy the directive and defend against
nothing. The app has no HTML sinks at all — no `innerHTML`, no
`dangerouslySetInnerHTML`, no `eval` — which is what the directive exists to
protect, so the honest position is to say so here.

`script-src` carries one addition, `'wasm-unsafe-eval'`. pdf.js decodes JBIG2 and
JPEG 2000 images in WebAssembly, and browsers refuse to compile a WebAssembly
module under a CSP that does not say so. The keyword permits exactly that and
nothing else: `eval` and the `Function` constructor stay blocked, which the
browser suite checks by running both from a real same-origin script rather than
through the automation channel, since that channel is exempt from CSP and would
have reported a pass either way.

Two things to keep in mind:

- **Serve it over HTTPS.** Encryption itself does not need a secure context, as
  `crypto.getRandomValues` is available either way, but everything else about
  handling someone's documents over plain http is a bad idea. Vercel, Netlify
  and Cloudflare all do HTTPS by default.
- **Do not switch on the host's analytics.** Vercel Analytics and Speed Insights
  inject a script that reports page views. It never sees a file, but it does make
  "nothing leaves this browser" less true than it is now, and it would be the
  first thing to fail the off-origin test.

---

[Back to the README](../README.md)
