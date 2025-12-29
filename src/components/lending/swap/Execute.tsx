import { useState } from 'react'
import { Address, Hex } from 'viem'
import { SwapQuote, SwapQuoteResponse, Tx } from './types'
import {  useConnection, useWalletClient } from 'wagmi'

type Props = {
  params: Record<string, string | number | boolean | bigint>
  swapType: 'debt' | 'collateral'
}

const getEndpoint = (swapType: 'debt' | 'collateral') => {
  const baseUrl = 'http://127.0.0.1:8787'
  return swapType === 'debt' ? `${baseUrl}/debt-swap` : `${baseUrl}/collateral-swap`
}

export function ExecuteSwapButton({ params, swapType }: Props) {
  const { data: signer } = useWalletClient()
  const { address: account } = useConnection()
  const [quotes, setQuotes] = useState<SwapQuote[]>([])
  const [permissions, setPermissions] = useState<Tx[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchQuotes = async () => {
    setLoading(true)
    setError(null)

    try {
      const qs = new URLSearchParams(
        Object.entries(account ? { ...params, account } : params).map(([k, v]) => [k, String(v)])
      )

      const endpoint = getEndpoint(swapType)
      const res = await fetch(`${endpoint}?${qs}`)

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error')
        throw new Error(`Failed to fetch quotes: ${errorText}`)
      }

      const data: SwapQuoteResponse = await res.json()
      setQuotes(data.quotes)
      setPermissions(data.permissionTxns)
      setSelected(0)
    } catch (e: any) {
      setError(e.message ?? 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const execute = async () => {
    if (selected === null) return
    const quote = quotes[selected]

    await signer?.sendTransaction({
      to: quote.tx.to as Address,
      data: quote.tx.data as Hex,
      value: BigInt(quote.tx.value ?? 0n),
    })
  }

  const executePermission = async (tx: Tx) => {
    await signer?.sendTransaction(tx as any)
  }

  return (
    <div className="space-y-4">
      <button className="btn btn-primary w-full" disabled={loading} onClick={fetchQuotes}>
        {loading ? 'Fetching quotes…' : `Get ${swapType === 'debt' ? 'Debt' : 'Collateral'} Swap Quotes`}
      </button>

      {error && <div className="text-error text-sm">{error}</div>}

      {permissions.length > 0 &&
        permissions.map((tx, idx) => (
          <button
            key={idx}
            className="btn btn-primary w-full"
            disabled={loading}
            onClick={() => executePermission(tx)}
          >
            {(tx as any)?.info || 'Approve'}
          </button>
        ))}

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
                  Out ${q.position.tradeAmountOutUSD.toFixed(2)}
                </span>
              </div>

              <div className="text-sm opacity-70">
                In ${q.position.tradeAmountInUSD.toFixed(2)}
              </div>
            </button>
          ))}
        </div>
      )}

      {selected !== null && (
        <button className="btn btn-success w-full" onClick={execute}>
          Execute {swapType === 'debt' ? 'Debt' : 'Collateral'} Swap
        </button>
      )}
    </div>
  )
}

