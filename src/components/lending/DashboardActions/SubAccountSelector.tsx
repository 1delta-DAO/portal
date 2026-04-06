import React, { useEffect, useMemo, useState } from 'react'
import type { UserSubAccount } from '../../../hooks/lending/useUserData'
import { abbreviateUsd } from '../../../utils/format'
import { fetchNextAccount, type NextAccountData } from '../../../sdk/lending-helper/fetchNextAccount'

interface SubAccountSelectorProps {
  subAccounts: UserSubAccount[]
  selectedAccountId: string | null
  onChange: (accountId: string | null) => void
  /** Shows "Create new account" button */
  allowCreate: boolean
  /** Required for fetching next account ID */
  chainId?: string
  lender?: string
  account?: string
}

export const SubAccountSelector: React.FC<SubAccountSelectorProps> = ({
  subAccounts,
  selectedAccountId,
  onChange,
  allowCreate,
  chainId,
  lender,
  account,
}) => {
  const [nextAccount, setNextAccount] = useState<NextAccountData | null>(null)
  const [loadingNext, setLoadingNext] = useState(false)
  const [creatingNew, setCreatingNew] = useState(false)
  const [customId, setCustomId] = useState('')

  // Fetch next account info when create is allowed and we have the required params
  useEffect(() => {
    if (!allowCreate || !chainId || !lender || !account) {
      setNextAccount(null)
      return
    }

    let cancelled = false
    setLoadingNext(true)

    fetchNextAccount({ chainId, lender, account }).then((res) => {
      if (cancelled) return
      setNextAccount(res.success && res.data ? res.data : null)
      setLoadingNext(false)
    })

    return () => { cancelled = true }
  }, [allowCreate, chainId, lender, account])

  // Reset "creating new" state when switching lenders etc.
  useEffect(() => {
    setCreatingNew(false)
    setCustomId('')
  }, [chainId, lender])

  // Available IDs for SELECT mode: unused IDs within the range
  const activeSet = useMemo(() => {
    if (!nextAccount) return new Set<string>()
    return new Set(nextAccount.activeAccountIds)
  }, [nextAccount])

  if (subAccounts.length === 0 && !allowCreate) return null

  const isSelect = nextAccount?.accountType === 'SELECT'
  const isAutogen = nextAccount?.accountType === 'AUTOGEN'

  const handleCreateClick = () => {
    if (isSelect) {
      setCreatingNew(true)
      // Default to the suggested next ID
      const nextId = nextAccount!.nextAccountId
      setCustomId(nextId)
      onChange(nextId)
    } else {
      // AUTOGEN: omit accountId, protocol creates on-chain
      setCreatingNew(true)
      onChange(null)
    }
  }

  const handleCustomIdChange = (val: string) => {
    setCustomId(val)
    // Only pass valid numeric values
    if (/^\d+$/.test(val)) {
      onChange(val)
    }
  }

  // Whether the selected ID is an existing sub-account
  const isExistingSelected = subAccounts.some((s) => s.accountId === selectedAccountId)

  return (
    <div className="form-control">
      <label className="label-text text-xs mb-1">Sub-account</label>
      <div className="flex flex-wrap gap-1.5">
        {subAccounts.map((sub, i) => {
          const isActive = sub.accountId === selectedAccountId && !creatingNew
          return (
            <button
              key={sub.accountId}
              type="button"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors border cursor-pointer ${
                isActive
                  ? 'border-primary bg-primary/10 ring-1 ring-primary'
                  : 'border-base-300 bg-base-200/50 hover:bg-base-200'
              }`}
              onClick={() => {
                setCreatingNew(false)
                onChange(sub.accountId)
              }}
            >
              <span className="font-semibold">#{i + 1}</span>
              <span className="text-base-content/70">{abbreviateUsd(sub.balanceData.nav)}</span>
              {sub.health != null && (
                <span
                  className={`badge badge-xs font-semibold ${
                    sub.health < 1.1 ? 'badge-error' : sub.health < 1.3 ? 'badge-warning' : 'badge-success'
                  }`}
                >
                  {sub.health.toFixed(2)}
                </span>
              )}
            </button>
          )
        })}
        {allowCreate && (
          <button
            type="button"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-colors border cursor-pointer ${
              creatingNew
                ? 'border-primary bg-primary/10 ring-1 ring-primary'
                : 'border-base-300 bg-base-200/50 hover:bg-base-200'
            }`}
            disabled={loadingNext}
            onClick={handleCreateClick}
            title={nextAccount?.createHint ?? 'Create a new sub-account'}
          >
            {loadingNext ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <span>+ New</span>
            )}
          </button>
        )}
      </div>

      {/* SELECT: show ID input when creating new */}
      {creatingNew && isSelect && nextAccount && (
        <div className="mt-2 flex items-center gap-2">
          <label className="text-[10px] text-base-content/60 shrink-0">Account ID:</label>
          <input
            type="text"
            inputMode="numeric"
            className={`input input-bordered input-xs w-20 ${
              customId && activeSet.has(customId) ? 'input-error' : ''
            }`}
            value={customId}
            onChange={(e) => handleCustomIdChange(e.target.value)}
            placeholder={nextAccount.nextAccountId}
          />
          <span className="text-[10px] text-base-content/40">
            {nextAccount.accountIdRange[0]}–{nextAccount.accountIdRange[1]}
          </span>
          {customId && activeSet.has(customId) && (
            <span className="text-[10px] text-error">Already in use</span>
          )}
        </div>
      )}

      {/* AUTOGEN: info text when creating new */}
      {creatingNew && isAutogen && (
        <div className="mt-2 text-[10px] text-base-content/50">
          Account ID will be generated on-chain automatically.
        </div>
      )}
    </div>
  )
}
