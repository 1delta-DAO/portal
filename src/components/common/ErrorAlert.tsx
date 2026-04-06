import React, { useCallback, useState } from 'react'

interface ErrorAlertProps {
  /** The error to display. May be a string or an Error instance. */
  error: string | Error | null | undefined
  /** Header label, defaults to "Error". */
  title?: string
  className?: string
}

/**
 * Standard error display — generalizes the existing TradingDashboard
 * `ErrorDisplay` so it can be reused outside the trading flows. Renders a
 * red-bordered card with the error message and a copy-to-clipboard button.
 *
 * Returns null when `error` is falsy so callers can render unconditionally.
 */
export const ErrorAlert: React.FC<ErrorAlertProps> = ({
  error,
  title = 'Error',
  className = '',
}) => {
  const [copied, setCopied] = useState(false)

  const message = error instanceof Error ? error.message : (error ?? '')

  const handleCopy = useCallback(() => {
    if (!message) return
    navigator.clipboard.writeText(message).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [message])

  if (!message) return null

  return (
    <div className={`rounded-lg border border-error/30 bg-error/5 p-2 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-error text-xs font-semibold">{title}</span>
        <button
          type="button"
          className="text-base-content/40 hover:text-base-content/70 transition-colors"
          onClick={handleCopy}
          title="Copy error"
          aria-label="Copy error message"
        >
          {copied ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-3.5 h-3.5 text-success"
            >
              <path
                fillRule="evenodd"
                d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                clipRule="evenodd"
              />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-3.5 h-3.5"
            >
              <path d="M7 3.5A1.5 1.5 0 0 1 8.5 2h3.879a1.5 1.5 0 0 1 1.06.44l3.122 3.12A1.5 1.5 0 0 1 17 6.622V12.5a1.5 1.5 0 0 1-1.5 1.5h-1v-3.379a3 3 0 0 0-.879-2.121L10.5 5.379A3 3 0 0 0 8.379 4.5H7v-1Z" />
              <path d="M4.5 6A1.5 1.5 0 0 0 3 7.5v9A1.5 1.5 0 0 0 4.5 18h7a1.5 1.5 0 0 0 1.5-1.5v-5.879a1.5 1.5 0 0 0-.44-1.06L9.44 6.439A1.5 1.5 0 0 0 8.378 6H4.5Z" />
            </svg>
          )}
        </button>
      </div>
      <div className="text-error text-xs break-words max-h-24 overflow-y-auto">
        {message}
      </div>
    </div>
  )
}
