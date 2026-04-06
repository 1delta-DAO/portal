// src/components/themeSwitcher.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useIsMobile } from '../../hooks/useIsMobile'

const THEMES = [
  'bloomberg',
  'graphite',
  'terminal',
  'nebula',
  'mars',
  'aurora',
  'cosmos',
  'ember',
  'light',
  'dark',
  'forest',
  'corporate',
  'synthwave',
  'cyberpunk',
  'luxury',
  'dracula',
  'retro',
  'nord',
  'aqua',
  'night',
  'sunset',
  'dim',
  'coffee',
  'autumn',
  'valentine',
  'cupcake',
  'business',
] as const

const DEFAULT_THEME = 'bloomberg'

export function ThemeSwitcher() {
  const [theme, setTheme] = useState<string>(DEFAULT_THEME)
  const [showModal, setShowModal] = useState(false)
  const isMobile = useIsMobile()
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  // Initialize from localStorage & apply once on mount
  useEffect(() => {
    if (typeof window === 'undefined') return

    const stored = window.localStorage.getItem('theme')
    const initial = stored && THEMES.includes(stored as any) ? stored : DEFAULT_THEME

    setTheme(initial)
    document.documentElement.setAttribute('data-theme', initial)
  }, [])

  // Apply on change
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.setAttribute('data-theme', theme)
    window.localStorage.setItem('theme', theme)
  }, [theme])

  // Close dropdown on outside click (desktop only)
  useEffect(() => {
    if (isMobile || !open) return
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, isMobile])

  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme)
    setShowModal(false)
  }

  // Mobile: Icon button + modal
  if (isMobile) {
    return (
      <>
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-circle"
          onClick={() => setShowModal(true)}
          aria-label="Change theme"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-5 h-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z"
            />
          </svg>
        </button>

        {showModal && (
          <div className="modal modal-open" onClick={() => setShowModal(false)}>
            <div className="modal-box" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-bold text-lg mb-4">Choose Theme</h3>
              <div className="grid grid-cols-2 gap-2">
                {THEMES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`btn btn-sm ${theme === t ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => handleThemeChange(t)}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
              <div className="modal-action">
                <button type="button" className="btn btn-sm" onClick={() => setShowModal(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  // Desktop: Dropdown with current theme shown
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        className="btn btn-ghost btn-sm gap-1"
        onClick={() => setOpen((prev) => !prev)}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-4 h-4"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z"
          />
        </svg>
        <span className="text-xs">{theme.charAt(0).toUpperCase() + theme.slice(1)}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full p-2 shadow-lg bg-base-100 rounded-box mt-2 grid grid-cols-2 gap-1 w-56 z-50 border border-base-300">
          {THEMES.map((t) => (
            <button
              key={t}
              type="button"
              className={`text-sm text-left px-2.5 py-1.5 rounded-btn transition-colors ${
                theme === t ? 'bg-primary text-primary-content font-medium' : 'hover:bg-base-200'
              }`}
              onClick={() => {
                setTheme(t)
                setOpen(false)
              }}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
