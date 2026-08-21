#!/usr/bin/env node
/**
 * Cross-platform launcher.
 *
 * Node rather than a shell script on purpose: npm generates .cmd and .ps1 shims
 * around a Node bin on Windows, so `convert.in` works the same from PowerShell,
 * cmd, Git Bash, macOS and Linux. A #!/bin/sh launcher only works where there is
 * a POSIX shell, and its executable bit does not survive a Windows checkout.
 *
 * tsx compiles the TypeScript in memory, so there is no build step to forget.
 */
import { register } from 'tsx/esm/api'

const unregister = register()
try {
  await import(new URL('../src/cli.ts', import.meta.url).href)
} finally {
  await unregister()
}
