export function PortalLogo({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`inline-block ${className}`}
      viewBox="0 0 400 400"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ width: '1.15em', height: '1.15em', verticalAlign: '-0.18em' }}
    >
      <defs>
        <radialGradient id="bh-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--color-base-100)" />
          <stop offset="55%" stopColor="var(--color-primary)" stopOpacity="0.15" />
          <stop offset="80%" stopColor="var(--color-primary)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--color-accent)" />
        </radialGradient>

        <linearGradient id="bh-disk" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--color-accent)" />
          <stop offset="50%" stopColor="var(--color-primary)" />
          <stop offset="100%" stopColor="var(--color-accent)" />
        </linearGradient>

        <filter id="bh-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>

      {/* outer glow */}
      <circle cx="200" cy="200" r="120" fill="var(--color-primary)" filter="url(#bh-blur)" />

      {/* accretion disk */}
      <ellipse
        cx="200"
        cy="200"
        rx="175"
        ry="30"
        fill="var(--color-primary)"
        stroke="var(--color-primary)"
        strokeWidth="16"
        transform="rotate(-180 200 200)"
        opacity="0.85"
      />

      <ellipse
        cx="200"
        cy="200"
        rx="185"
        ry="15"
        fill="var(--color-base-100)"
        stroke="var(--color-base-100)"
        strokeWidth="12"
        transform="rotate(-180 200 200)"
        opacity="1"
      />

      {/* inner black hole */}
      <circle cx="200" cy="200" r="78" fill="var(--color-base-100)" />

      {/* subtle rim highlight */}
      <circle
        cx="200"
        cy="200"
        r="83"
        fill="none"
        stroke="var(--color-base-content)"
        strokeOpacity="0.1"
        strokeWidth="30"
      />
    </svg>
  )
}
