import { BACKEND_BASE_URL } from '../../config/backend'
import {
  EMPTY_POSITION_TOTALS,
  type EarnPosition,
  type EarnPositionSourceStatus,
  type EarnPositionTotals,
  type EarnPositionsResponse,
} from './positionTypes'

const ENDPOINT = `${BACKEND_BASE_URL}/v1/data/earn/positions`

export interface FetchEarnPositionsParams {
  /** One or more chains. Sent as a CSV — one request covers all of them. */
  chainIds: string[]
  account: string
  /** Fetch one half only. Omit for both. */
  venueKind?: 'lending' | 'vault'
  /** Keep dust and zero-share rows. Off by default. */
  includeZero?: boolean
}

export interface FetchEarnPositionsResult {
  success: boolean
  items?: EarnPosition[]
  totals?: EarnPositionTotals
  sources?: EarnPositionSourceStatus[]
  /** A lending read was incomplete — treat totals as a lower bound. */
  partial?: boolean
  /** Something was served from a last-known-good snapshot. */
  stale?: boolean
  error?: string
}

/**
 * Fetch everything the account holds on the supply side, both halves, all
 * chains, in ONE request.
 *
 * Note what this deliberately does NOT do — and what the older vaults path has
 * to: it does not fetch a per-chain vault catalogue first, and it does not send
 * a list of vault addresses back to the server to be checked. `/vaults/user`
 * cannot discover, so a client composing this itself must post the whole
 * catalogue as a query string, per chain. Discovery is server-side here, so
 * this is a single unpaginated GET.
 */
export async function fetchEarnPositions(
  params: FetchEarnPositionsParams
): Promise<FetchEarnPositionsResult> {
  try {
    const qs = new URLSearchParams()
    qs.set('chainIds', params.chainIds.join(','))
    qs.set('account', params.account)
    if (params.venueKind) qs.set('venueKind', params.venueKind)
    if (params.includeZero) qs.set('includeZero', 'true')

    const res = await fetch(`${ENDPOINT}?${qs}`)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        success: false,
        error: `HTTP ${res.status}: ${text || res.statusText}`,
      }
    }

    const json = await res.json()
    if (json.success === false) {
      return {
        success: false,
        error: json.error?.message ?? 'Earn positions failed',
      }
    }

    const body: EarnPositionsResponse = json.data ?? json
    return {
      success: true,
      items: Array.isArray(body.items) ? body.items : [],
      totals: body.totals ?? EMPTY_POSITION_TOTALS,
      sources: body.sources ?? [],
      partial: body.partial,
      stale: body.stale,
    }
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Unknown error' }
  }
}
