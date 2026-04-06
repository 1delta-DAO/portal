// Thin alias kept for the existing trading-action call sites. New code should
// import `ErrorAlert` from `components/common/ErrorAlert` directly.
import React from 'react'
import { ErrorAlert } from '../../common/ErrorAlert'

interface Props {
  error: string
}

export const ErrorDisplay: React.FC<Props> = ({ error }) => <ErrorAlert error={error} />
