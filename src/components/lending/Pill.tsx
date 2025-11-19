// src/components/common/ValuePill.tsx
import React from "react"

interface ValuePillProps {
  /** Display label (e.g. "Dep", "Debt", "APR") */
  label?: string
  /** Numeric value that will be formatted */
  value: number
  /** Optional prefix to show before the formatted value (e.g. "$") */
  prefix?: string
  /** Background color keyword (success, error, warning, primary, etc) */
  tone?: "success" | "error" | "warning" | "info" | "primary" | "neutral"
  /** Additional tailwind classes */
  className?: string
  /** Maximum decimals in displayed value */
  maximumFractionDigits?: number
}

export const ValuePill: React.FC<ValuePillProps> = ({
  label,
  value,
  prefix = "$",
  tone = "success",
  className = "",
  maximumFractionDigits = 0,
}) => {
  const formatted = value.toLocaleString(undefined, {
    maximumFractionDigits,
  })

  // dynamic color classes (DaisyUI-compatible)
  const bg = `bg-${tone}/10`
  const border = `border-${tone}/30`
  const text = `text-${tone}`

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full 
      text-[10px] font-medium border ${bg} ${text} ${border} ${className}`}
      title={`${label ? label + ": " : ""}${prefix}${value.toLocaleString(undefined, {
        maximumFractionDigits: 4,
      })}`}
    >
      {label && <span className="opacity-80">{label}</span>}
      <span className="truncate">
        {prefix}
        {formatted}
      </span>
    </span>
  )
}
