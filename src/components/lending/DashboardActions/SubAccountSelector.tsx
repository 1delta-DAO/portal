import React from 'react'
import type { UserSubAccount } from '../../../hooks/lending/useUserData'
import { abbreviateUsd } from '../../../utils/format'

interface SubAccountSelectorProps {
  subAccounts: UserSubAccount[]
  selectedAccountId: string | null
  onChange: (accountId: string | null) => void
  /** true for Deposit (shows "Create new account"), false for others */
  allowCreate: boolean
}

export const SubAccountSelector: React.FC<SubAccountSelectorProps> = ({
  subAccounts,
  selectedAccountId,
  onChange,
  allowCreate,
}) => {
  if (subAccounts.length === 0 && !allowCreate) return null

  return (
    <div className="form-control">
      <label className="label-text text-xs mb-1">Sub-account</label>
      <div className="flex flex-wrap gap-1.5">
        {subAccounts.map((sub, i) => {
          const isActive = sub.accountId === selectedAccountId
          return (
            <button
              key={sub.accountId}
              type="button"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors border cursor-pointer ${
                isActive
                  ? 'border-primary bg-primary/10 ring-1 ring-primary'
                  : 'border-base-300 bg-base-200/50 hover:bg-base-200'
              }`}
              onClick={() => onChange(sub.accountId)}
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
              selectedAccountId === null
                ? 'border-primary bg-primary/10 ring-1 ring-primary'
                : 'border-base-300 bg-base-200/50 hover:bg-base-200'
            }`}
            onClick={() => onChange(null)}
          >
            <span>+ New</span>
          </button>
        )}
      </div>
    </div>
  )
}
