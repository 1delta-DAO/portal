import React from 'react'
import { isChunkLoadError } from '../../utils/lazyChunk'

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
      // A chunk that 404s is not a bug in this build — it is a tab holding an
      // index.html from before the last deploy. It gets its own copy and its
      // own button, because "Try again" CANNOT fix it: React's `lazy` caches
      // the rejected promise, so re-rendering re-throws the same error forever.
      // `lazyChunk` reloads automatically; this is what the user sees when that
      // reload was suppressed (offline, or one already happened just now).
      const stale = isChunkLoadError(this.state.error)

      return (
        <div className="p-4 m-4 rounded-lg border border-error/30 bg-error/5">
          <h2 className="text-error font-bold mb-2">
            {stale ? 'This page is out of date' : 'Something went wrong'}
          </h2>
          {stale && (
            <p className="text-xs text-base-content/70 mb-2">
              The app was updated while this tab was open, so part of it is no longer available at
              the address this page has. Reloading picks up the new version.
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
          {stale ? (
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
