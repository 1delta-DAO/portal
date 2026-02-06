import { AllocationAction, AllocationOperation, SweepAction } from './types'
import { AssetBalanceSnapshot } from '../../contexts/Simulation/simulateLenderSelections'
import { LenderOperationSelection } from '../../contexts/LenderSelectionContext'
import { TransferToLenderType } from '@1delta/calldata-sdk'
import { zeroAddress } from 'viem'
import type { LendingActionParams } from './fetchLendingAction'

// Convert UI string amount (like "1.23") to bigint respecting decimals
function parseAmountDecimal(amount: string, decimals: number): bigint {
  if (!amount) return 0n
  const [intPart, decPart = ''] = amount.split('.')
  const paddedDec = (decPart + '0'.repeat(decimals)).slice(0, decimals)
  return BigInt(intPart + paddedDec)
}

interface GenerateActionsParams {
  selections: LenderOperationSelection[]
  finalAssetBalances: Record<string, AssetBalanceSnapshot>
  receiver?: string
  payNative?: boolean // wrap?
  receiveNative?: boolean // unwrap?
}

export function generateAllocationActionsForApi({
  selections,
  finalAssetBalances,
  receiver,
  payNative,
  receiveNative,
}: GenerateActionsParams): AllocationAction[] {
  const actions: AllocationAction[] = []

  // ---------- 1) Actions based on lender operations ----------
  for (const sel of selections) {
    if (!sel.pool) continue
    const { asset, lender } = sel.pool
    const useMax = sel.useMax

    const useBalance = sel.useCurrentBalance

    const amountBig = parseAmountDecimal(sel.amount, asset.decimals).toString()

    switch (sel.operation) {
      case 'deposit':
        actions.push({
          type: AllocationOperation.Deposit,
          params: {
            receiver,
            amount: useBalance ? '0' : amountBig,
            asset: asset.address,
            lender,
          },
        })
        break

      case 'withdraw':
        actions.push({
          type: AllocationOperation.Withdraw,
          params: {
            receiver,
            amount: amountBig,
            asset: asset.address,
            lender,
            transferType: useMax ? TransferToLenderType.UserBalance : TransferToLenderType.Amount,
          },
        })
        break

      case 'borrow':
        actions.push({
          type: AllocationOperation.Borrow,
          params: {
            receiver,
            amount: amountBig,
            asset: asset.address,
            lender,
          },
        })
        break

      case 'repay':
        actions.push({
          type: AllocationOperation.Repay,
          params: {
            receiver,
            amount: amountBig,
            asset: asset.address,
            lender,
            transferType: useMax ? TransferToLenderType.UserBalance : TransferToLenderType.Amount,
          },
        })
        break
    }
  }

  // ---------- 2) Final asset transfers (payment vs received) ----------
  for (const bal of Object.values(finalAssetBalances)) {
    const amt = bal.amount

    if (amt === 0) continue

    const absBig = parseAmountDecimal(Math.abs(amt).toString(), bal.asset.decimals).toString()

    // --- pay side (negative) ---
    // to the befinning
    if (amt < 0) {
      const isWnative = bal.asset.props?.isWnative === true

      if (isWnative && payNative) {
        // -> unwrap flow: Transfer native + Wrap into wrapped token
        actions.unshift(
          {
            type: AllocationOperation.Transfer,
            params: {
              asset: zeroAddress,
              amount: absBig,
              receiver,
            },
          },
          {
            type: AllocationOperation.Wrap,
            params: { amount: absBig },
          }
        )
      } else {
        actions.push({
          type: AllocationOperation.Transfer,
          params: {
            asset: bal.asset.address,
            amount: absBig,
            receiver,
          },
        })
      }
    }

    // --- receive side (positive) ---
    // to the end
    if (amt > 0) {
      const isWnative = bal.asset.props?.isWnative === true

      if (isWnative && receiveNative) {
        // withdraw wrapped & unwrap into native token
        actions.push({
          type: AllocationOperation.Unwrap,
          params: {
            amount: absBig,
            receiver: receiver!,
            sweepAction: SweepAction.Amount,
          },
        })
      } else {
        actions.push({
          type: AllocationOperation.Sweep,
          params: {
            amount: absBig,
            asset: bal.asset.address,
            receiver: receiver!,
            sweepAction: SweepAction.Amount,
          },
        })
      }
    }
  }

  return actions
}

const ACTION_TYPE_MAP = {
  deposit: 'Deposit',
  withdraw: 'Withdraw',
  borrow: 'Borrow',
  repay: 'Repay',
} as const

/**
 * Converts a single LenderOperationSelection into query params
 * for the GET /v1/lending endpoint.
 */
export function selectionToLendingParams(
  sel: LenderOperationSelection,
  opts: { chainId: string; operator: string; receiver: string }
): LendingActionParams | null {
  if (!sel.pool) return null

  const { asset, lender } = sel.pool
  const amount = parseAmountDecimal(sel.amount, asset.decimals)
  const isAll =
    sel.useMax && (sel.operation === 'repay' || sel.operation === 'withdraw')

  return {
    chainId: opts.chainId,
    operator: opts.operator,
    amount: amount.toString(),
    lender,
    actionType: ACTION_TYPE_MAP[sel.operation],
    receiver: opts.receiver,
    underlying: asset.address,
    isAll: isAll || undefined,
  }
}
