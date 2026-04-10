import { useConnectModal } from '@rainbow-me/rainbowkit'
import { useRef, useState } from 'react'
import { useAccount, useDisconnect } from 'wagmi'
import { useSpyMode } from '../../contexts/SpyMode'

export function WalletConnect() {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const { openConnectModal } = useConnectModal()
  const { spyAddress, isSpyMode, enableSpy, disableSpy } = useSpyMode()
  const [open, setOpen] = useState(false)
  const [spyInput, setSpyInput] = useState('')
  const [showSpyInput, setShowSpyInput] = useState(false)
  const [spyError, setSpyError] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const handleSpySubmit = () => {
    if (enableSpy(spyInput)) {
      setSpyInput('')
      setShowSpyInput(false)
      setSpyError(false)
      setOpen(false)
    } else {
      setSpyError(true)
    }
  }

  // Spy mode active: show spy badge
  if (isSpyMode && spyAddress) {
    const spyDisplay = `${spyAddress.slice(0, 6)}...${spyAddress.slice(-4)}`
    return (
      <div className="flex items-center gap-1.5">
        <div className="badge badge-warning badge-sm gap-1 font-mono text-[10px]">
          SPY {spyDisplay}
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-xs text-warning"
          onClick={disableSpy}
          title="Exit Spy Mode"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    )
  }

  if (!isConnected) {
    return (
      <div className="flex items-center gap-1.5">
        <button type="button" className="btn btn-primary btn-sm" onClick={openConnectModal}>
          Connect Wallet
        </button>
        <div className="relative">
          <button
            type="button"
            className="btn btn-ghost btn-xs opacity-50 hover:opacity-100"
            onClick={() => setShowSpyInput((v) => !v)}
            title="Spy Mode"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          {showSpyInput && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-base-200 rounded-box shadow-lg p-2 w-72">
              <p className="text-[10px] text-base-content/50 mb-1">View as address (read-only)</p>
              <div className="flex gap-1">
                <input
                  type="text"
                  className={`input input-xs input-bordered flex-1 font-mono text-[11px] ${spyError ? 'input-error' : ''}`}
                  placeholder="0x..."
                  value={spyInput}
                  onChange={(e) => { setSpyInput(e.target.value); setSpyError(false) }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSpySubmit()}
                  autoFocus
                />
                <button type="button" className="btn btn-primary btn-xs" onClick={handleSpySubmit}>
                  Go
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
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
        <ul className="menu menu-sm bg-base-200 rounded-box shadow-lg absolute right-0 top-full mt-1 z-50 w-52 p-1">
          <li>
            <button onClick={handleCopy} className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2-2v1"/></svg>
              Copy Address
            </button>
          </li>
          <li>
            <button
              onClick={() => { setShowSpyInput((v) => !v); }}
              className="flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              Spy Mode
            </button>
          </li>
          {showSpyInput && (
            <li className="px-2 py-1">
              <div className="flex gap-1 p-0 hover:bg-transparent active:bg-transparent">
                <input
                  type="text"
                  className={`input input-xs input-bordered flex-1 font-mono text-[11px] ${spyError ? 'input-error' : ''}`}
                  placeholder="0x..."
                  value={spyInput}
                  onChange={(e) => { setSpyInput(e.target.value); setSpyError(false) }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSpySubmit()}
                  autoFocus
                />
                <button type="button" className="btn btn-primary btn-xs" onClick={handleSpySubmit}>
                  Go
                </button>
              </div>
            </li>
          )}
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
