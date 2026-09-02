import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from './kit.tsx'
import { STRINGS } from './i18n.ts'
import type { Lang } from './prefs.ts'

/**
 * A tool that throws while rendering takes the whole page down with it: React
 * unmounts the tree, the window goes white, and every document loaded into
 * every other tool is gone with it. Nothing here is recoverable from disk,
 * because nothing here was ever on disk.
 *
 * So each tool is wrapped separately. One failing tool leaves the other four
 * holding their files, and the message says what to do rather than leaving a
 * blank rectangle.
 *
 * This has to be a class: React exposes error catching only through
 * componentDidCatch and getDerivedStateFromError, and there is no hook for it.
 */
export class Boundary extends Component<{ lang: Lang; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Nothing is reported anywhere: this app has nowhere to report to, and
    // sending a stack trace from a document tool is exactly what it promises
    // not to do. The console is for whoever opens it.
    console.error('convert.in: a tool stopped working', error, info.componentStack)
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children
    const t = STRINGS[this.props.lang]
    return (
      <div className="flex h-full items-center justify-center p-6 sm:p-8">
        <div className="flex max-w-[46ch] flex-col items-center gap-4 text-center">
          <h2 className="text-title font-semibold">{t.brokeTitle}</h2>
          <p className="text-muted text-body leading-[1.55]">{t.brokeHint}</p>
          <Button variant="primary" onClick={() => this.setState({ failed: false })}>
            {t.brokeRetry}
          </Button>
        </div>
      </div>
    )
  }
}
