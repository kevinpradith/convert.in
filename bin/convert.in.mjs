#!/usr/bin/env node
/**
 * Cross-platform launcher.
 *
 * Node rather than a shell script on purpose: npm generates .cmd and .ps1 shims
 * around a Node bin on Windows, so `convert.in` works the same from PowerShell,
 * cmd, Git Bash, macOS and Linux. A #!/bin/sh launcher only works where there is
 * a POSIX shell, and its executable bit does not survive a Windows checkout.
 *
 * Two ways in, and which one runs is decided by what is on disk rather than by
 * a flag. An installed package carries dist-cli/, built by prepack, and runs
 * plain JavaScript with no compiler anywhere near it. A clone does not, so tsx
 * compiles the TypeScript in memory and there is still no build step to forget
 * while working on it.
 */
import { existsSync } from 'node:fs'

const bundle = new URL('../dist-cli/cli.mjs', import.meta.url)

if (existsSync(bundle)) {
  await import(bundle.href)
} else {
  const { register } = await import('tsx/esm/api')
  const unregister = register()
  try {
    await import(new URL('../src/cli.ts', import.meta.url).href)
  } finally {
    await unregister()
  }
}
