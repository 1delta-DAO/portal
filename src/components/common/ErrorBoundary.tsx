import React from 'react'
import { chunkDiagnosis, isChunkLoadError } from '../../utils/lazyChunk'

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
              {diagnosis === 'unreachable'
                ? 'The browser could not fetch one of this app’s files at all. A content blocker, browser shield, VPN or network filter is the usual cause — check whether one is blocking this site, then reload.'
                : diagnosis === 'unavailable'
                  ? 'This tab is running the current version, but one of its files could not be downloaded after several tries. That can happen for a minute or so right after an update while the file is still being published. Reloading in a moment should work.'
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
