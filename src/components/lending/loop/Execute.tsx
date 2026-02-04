import { useState } from 'react'
import { Address, Hex } from 'viem'
import { LoopQuote, LoopQuoteResponse, Tx } from './types'
import { useAccount, useWalletClient } from 'wagmi'

type Props = {
  params: Record<string, string | number | boolean | bigint>
}

const endpoint = 'https://portal.1delta.io/v1/actions/lending/loop'

export function ExecuteLoopButton({ params }: Props) {
  const { data: signer } = useWalletClient()
  const { address: account } = useAccount()
  const [quotes, setQuotes] = useState<LoopQuote[]>([])
  const [permissions, setPermissions] = useState<Tx[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ----------------------------
  // Fetch quotes
  // ----------------------------
  const fetchQuotes = async () => {
    setLoading(true)
    setError(null)

    try {
      const qs = new URLSearchParams(
        Object.entries(account ? { ...params, account } : params).map(([k, v]) => [k, String(v)])
      )

      const res = await fetch(`${endpoint}?${qs}`)
      //   if (!res.ok) throw new Error('Failed to fetch quotes')

      const data: LoopQuoteResponse = await res.json()
      setQuotes(data.quotes)
      setPermissions(data.permissionTxns)
      setSelected(0)
    } catch (e: any) {
      setError(e.message ?? 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  // ----------------------------
  // Execute tx
  // ----------------------------
  const execute = async () => {
    if (selected === null) return
    const quote = quotes[selected]

    await signer?.sendTransaction({
      to: quote.tx.to as Address,
      data: quote.tx.data as Hex,
      value: BigInt(quote.tx.value ?? 0n),
    })
  }

  // ----------------------------
  // Execute tx
  // ----------------------------
  const executePermission = async (tx: Tx) => {
    await signer?.sendTransaction(tx as any)
  }

  return (
    <div className="space-y-4">
      {/* FETCH */}
      <button className="btn btn-primary w-full" disabled={loading} onClick={fetchQuotes}>
        {loading ? 'Fetching quotes…' : 'Get Loop Quotes'}
      </button>

      {/* ERROR */}
      {error && <div className="text-error text-sm">{error}</div>}

      {/* PERMISSIONS */}

      {permissions.length > 0 &&
        permissions.map((tx) => (
          <button
            className="btn btn-primary w-full"
            disabled={loading}
            onClick={() => executePermission(tx)}
          >
            {(tx as any)?.info}
          </button>
        ))}

      {/* QUOTES */}
      {quotes.length > 0 && (
        <div className="space-y-2">
          {quotes.map((q, i) => (
            <button
              key={i}
              onClick={() => setSelected(i)}
              className={`w-full rounded-xl border p-3 text-left ${
                selected === i ? 'border-primary bg-primary/10' : 'border-base-300'
              }`}
            >
              <div className="flex justify-between">
                <span className="font-medium">{q.position.aggregator}</span>
                <span className="text-sm opacity-70">
                  Debt ${q.position.positionDebtUSD.toFixed(2)}
                </span>
              </div>

              <div className="text-sm opacity-70">
                Collateral ${q.position.positionCollateralUSD.toFixed(2)}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* EXECUTE */}
      {selected !== null && (
        <button className="btn btn-success w-full" onClick={execute}>
          Execute Loop
        </button>
      )}
    </div>
  )
}
