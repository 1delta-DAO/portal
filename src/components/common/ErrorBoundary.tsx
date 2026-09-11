import React from 'react'
import { chunkDiagnosis, isChunkLoadError } from '../../utils/lazyChunk'
import { describeProbes } from '../../utils/chunkProbe'

interface State {
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

/**
 * "Retrying in 12 s" for a reload `lazyChunk` has already scheduled — so the
 * screen reads as the app handling it, not as the app having given up. The
 * button beside it lets an impatient user go now.
 */
function ReloadCountdown({ at }: { at: number }) {
  const [now, setNow] = React.useState(Date.now())
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [])
  const seconds = Math.max(0, Math.ceil((at - now) / 1000))
  return (
    <span className="text-xs text-base-content/70 tabular-nums">
      {seconds > 0 ? `Retrying automatically in ${seconds} s…` : 'Retrying…'}
    </span>
  )
}

/** Puts the report on the clipboard, so it can be pasted into a bug report as-is. */
function CopyDetails({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <button
      type="button"
      className="btn btn-ghost btn-xs"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        })
      }}
    >
      {copied ? 'Copied' : 'Copy details'}
    </button>
  )
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null, errorInfo: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo })
    console.error(
      '[ErrorBoundary] Caught render error:\n',
      error,
      '\nComponent stack:',
      errorInfo.componentStack
    )
  }

  render() {
    if (this.state.error) {
      // A failed chunk download is not a bug in this build, and it gets its own
      // copy and its own button because "Try again" CANNOT fix it: React's
      // `lazy` caches the rejected promise, so re-rendering re-throws the same
      // error forever. `lazyChunk` has already retried, re-imported past the
      // cache and, where a reload would help, reloaded — so by the time this
      // renders, those did not work.
      const chunk = isChunkLoadError(this.state.error)
      // Which of the three failures it turned out to be. Only `stale` is fixed
      // by reloading, and telling a user to reload for the other two sends
      // them round a loop that cannot end.
      const diagnosis = chunkDiagnosis(this.state.error)

      return (
        <div className="p-4 m-4 rounded-lg border border-error/30 bg-error/5">
          <h2 className="text-error font-bold mb-2">
            {chunk ? "Couldn't load part of the app" : 'Something went wrong'}
          </h2>
          {chunk && (
            <p className="text-xs text-base-content/70 mb-2">
              {diagnosis?.kind === 'unreachable'
                ? 'This browser will not load one of this app’s files, and reloading will not change that — the file named below is served correctly but the request is being dropped or refused on this machine. A content blocker, browser shield, VPN or network filter is the usual cause; try the site with shields off or in a clean profile.'
                : diagnosis?.probes?.some((p) => p.verdict === 'poisoned')
                  ? 'This browser had cached an error page in place of one of this app’s files — it happens when a file is requested in the moment before an update finishes publishing. The cached copy has been replaced with the real file; reloading will pick it up.'
                  : diagnosis?.retryAt
                    ? 'One of this app’s files could not be downloaded. This usually happens for a minute or so right after an update, while the new files are still being published — the page will keep retrying on its own.'
                    : 'One of this app’s files could not be downloaded, and several automatic retries did not help. If this keeps happening, check for a content blocker or network filter on this site.'}
            </p>
          )}
          {diagnosis?.probes && (
            // Which file, and how it failed — the one fact the import error
            // itself withholds, and the one that ends the guessing.
            <pre className="text-xs text-base-content/70 whitespace-pre-wrap break-words mb-2 rounded border border-base-300 bg-base-200/50 p-2">
              {describeProbes(diagnosis.probes)}
            </pre>
          )}
          <pre className="text-xs text-error/80 whitespace-pre-wrap break-words mb-2">
            {this.state.error.message}
          </pre>
          {this.state.errorInfo?.componentStack && (
            <details className="text-xs text-base-content/60">
              <summary className="cursor-pointer mb-1">Component stack</summary>
              <pre className="whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                {this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}
          {chunk ? (
            <div className="mt-2 flex items-center gap-3">
              <button className="btn btn-sm btn-primary" onClick={() => window.location.reload()}>
                {diagnosis?.retryAt ? 'Reload now' : 'Reload'}
              </button>
              {diagnosis?.retryAt && <ReloadCountdown at={diagnosis.retryAt} />}
              <CopyDetails
                text={[
                  this.state.error.message,
                  diagnosis?.probes ? describeProbes(diagnosis.probes) : '',
                  `page: ${window.location.href}`,
                  `browser: ${navigator.userAgent}`,
                ]
                  .filter(Boolean)
                  .join('\n')}
              />
            </div>
          ) : (
            <button
              className="btn btn-sm btn-outline mt-2"
              onClick={() => this.setState({ error: null, errorInfo: null })}
            >
              Try again
            </button>
          )}
        </div>
      )
    }
    return this.props.children
  }
}
