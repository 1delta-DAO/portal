import { useConnectModal } from '@rainbow-me/rainbowkit'
import { useRef, useState } from 'react'
import { useAccount, useDisconnect } from 'wagmi'

export function WalletConnect() {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const { openConnectModal } = useConnectModal()
  const [open, setOpen] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  if (!isConnected) {
    return (
      <button type="button" className="btn btn-primary btn-sm" onClick={openConnectModal}>
        Connect Wallet
      </button>
    )
  }

  const displayName = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ''

  const handleCopy = () => {
    if (address) navigator.clipboard.writeText(address)
    setOpen(false)
  }

  const handleDisconnect = () => {
    setOpen(false)
    disconnect()
  }

  const handleBlur = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 150)
  }

  const handleFocus = () => {
    clearTimeout(timeoutRef.current)
  }

  return (
    <div className="relative" onBlur={handleBlur} onFocus={handleFocus}>
      <button
        type="button"
        className="btn btn-primary btn-sm flex items-center gap-2"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-xs font-mono">{displayName}</span>
      </button>

      {open && (
        <ul className="menu menu-sm bg-base-200 rounded-box shadow-lg absolute right-0 top-full mt-1 z-50 w-44 p-1">
          <li>
            <button onClick={handleCopy} className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy Address
            </button>
          </li>
          <li>
            <button onClick={handleDisconnect} className="text-error flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Disconnect
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}
