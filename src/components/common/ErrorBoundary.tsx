import React from 'react'
import { isChunkLoadError, isChunkUnreachable } from '../../utils/lazyChunk'

interface State {
  error: Error | null
  errorInfo: React.ErrorInfo | null
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
      // ...and this says the file could not be fetched AT ALL, which a reload
      // does not change. Blaming a stale deploy here would send the user round
      // a loop that cannot end.
      const blocked = chunk && isChunkUnreachable(this.state.error)

      return (
        <div className="p-4 m-4 rounded-lg border border-error/30 bg-error/5">
          <h2 className="text-error font-bold mb-2">
            {chunk ? "Couldn't load part of the app" : 'Something went wrong'}
          </h2>
          {chunk && (
            <p className="text-xs text-base-content/70 mb-2">
              {blocked
                ? 'The browser could not fetch one of this app’s files. A content blocker, browser shield, VPN or network filter is the usual cause — check whether one is blocking this site, then reload.'
                : 'One of this app’s files could not be downloaded. That usually means the app was updated while this tab was open, or a cached copy is damaged. Reloading fixes both.'}
            </p>
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
            <button
              className="btn btn-sm btn-primary mt-2"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
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
