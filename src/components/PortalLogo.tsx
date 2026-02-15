export function PortalLogo({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 400 400"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <filter id="bh-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>

      {/* outer glow (background) */}
      <circle cx="200" cy="200" r="120" fill="var(--color-primary)" filter="url(#bh-blur)" />

      {/* Top portions of accretion disk (behind black hole) */}
      <path
        d="M 25 200 A 175 35 0 0 1 375 200"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="8"
        opacity="0.3"
      />
      <path
        d="M 50 200 A 150 30 0 0 1 350 200"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="12"
        opacity="0.4"
      />
      <path
        d="M 75 200 A 125 25 0 0 1 325 200"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="14"
        opacity="0.5"
      />
      <path
        d="M 95 200 A 105 20 0 0 1 305 200"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="16"
        opacity="0.6"
      />
      <path
        d="M 110 200 A 90 15 0 0 1 290 200"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="10"
        opacity="0.7"
      />

      {/* inner black hole */}
      <circle cx="200" cy="200" r="78" fill="var(--color-base-100)" />

      {/* Bottom portions of accretion disk (in front of black hole) */}
      <path
        d="M 25 200 A 175 35 0 0 0 375 200"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="8"
        opacity="0.4"
      />
      <path
        d="M 50 200 A 150 30 0 0 0 350 200"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="12"
        opacity="0.6"
      />
      <path
        d="M 75 200 A 125 25 0 0 0 325 200"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="14"
        opacity="0.7"
      />
      <path
        d="M 95 200 A 105 20 0 0 0 305 200"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="16"
        opacity="0.8"
      />
      <path
        d="M 110 200 A 90 15 0 0 0 290 200"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="10"
        opacity="0.95"
      />

      {/* event horizon rim highlight */}
      <circle
        cx="200"
        cy="200"
        r="78"
        fill="none"
        stroke="var(--color-base-content)"
        strokeOpacity="0.2"
        strokeWidth="2"
      />
    </svg>
  )
}
