import React from 'react'

interface State {
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
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
      return (
        <div className="p-4 m-4 rounded-lg border border-error/30 bg-error/5">
          <h2 className="text-error font-bold mb-2">Something went wrong</h2>
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
          <button
            className="btn btn-sm btn-outline mt-2"
            onClick={() => this.setState({ error: null, errorInfo: null })}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
