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

        {/* Clip path to limit top ellipses to outer region only */}
        <clipPath id="top-outer-clip">
          <rect x="0" y="0" width="100" height="200" />
          <rect x="300" y="0" width="100" height="200" />
        </clipPath>
      </defs>

      {/* outer glow (background) */}
      <circle cx="200" cy="200" r="120" fill="var(--color-primary)" filter="url(#bh-blur)" />

      {/* Top portions of accretion disk (behind black hole) - clipped to outer edges */}
      <g clipPath="url(#top-outer-clip)">
        <path
          d="M 50 200 A 150 30 0 0 1 350 200"
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="20"
          opacity="0.5"
        />
        <path
          d="M 65 200 A 135 27 0 0 1 335 200"
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="18"
          opacity="0.6"
        />
        <path
          d="M 82 200 A 118 23 0 0 1 318 200"
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="14"
          opacity="0.7"
        />
        <path
          d="M 100 200 A 100 20 0 0 1 300 200"
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="16"
          opacity="0.8"
        />
        <path
          d="M 118 200 A 82 16 0 0 1 282 200"
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="10"
          opacity="0.9"
        />
      </g>

      {/* Gravitational lensing - bottom arcs wrapping under the black hole */}
      <path
        d="M 100 200 A 76 76 0 0 0 300 200"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="16"
        opacity="0.6"
      />
      <path
        d="M 118 200 A 71 71 0 0 0 282 200"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="10"
        opacity="0.7"
      />

      {/* Gravitational lensing - top arcs wrapping over the black hole */}
      <path
        d="M 100 200 A 71 71 0 0 1 300 200"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="16"
        opacity="0.8"
      />
      <path
        d="M 118 200 A 70 70 0 0 1 282 200"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="10"
        opacity="0.9"
      />

      {/* inner black hole */}
      <circle cx="200" cy="200" r="78" fill="var(--color-base-100)" />

      {/* Bottom portions of accretion disk (in front of black hole) */}
      <path
        d="M 50 200 A 150 30 0 0 0 350 200"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="20"
        opacity="0.6"
      />
      <path
        d="M 65 200 A 135 27 0 0 0 335 200"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="18"
        opacity="0.7"
      />
      <path
        d="M 82 200 A 118 23 0 0 0 318 200"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="14"
        opacity="0.8"
      />
      <path
        d="M 100 200 A 100 20 0 0 0 300 200"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="16"
        opacity="0.9"
      />
      <path
        d="M 118 200 A 82 16 0 0 0 282 200"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="10"
        opacity="1"
      />

      {/* Inner ellipse to create 3D depth effect */}
      <ellipse
        cx="200"
        cy="200"
        rx="76"
        ry="12"
        fill="var(--color-base-100)"
        stroke="var(--color-base-100)"
        strokeWidth="1.5"
        opacity="1"
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
