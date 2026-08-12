import React from 'react'
import { Badge } from '../../../common/Badge'

/**
 * The term sheet, as the earn row carries it.
 *
 * Typed loosely on purpose: the sheet is a deep, evolving structure owned by
 * `margin-fetcher/terms`, and mirroring it here would create a second
 * definition that silently falls behind. This component reads the handful of
 * fields it renders and ignores the rest, so a new section on the server is
 * additive rather than a compile error.
 */
interface Props {
  /** `TermSheet` or `TermSheetDigest` — both carry `supply`. */
  termSheet?: any
}

/** Human label for a tag slug: `exit-cooldown` → `exit cooldown`. */
const tagLabel = (t: string) => t.replace(/-/g, ' ')

/**
 * Tags worth colouring. Everything else renders neutral — a growing vocabulary
 * must not depend on this list to be legible.
 */
const WARN_TAGS = new Set([
  'first-loss',
  'nav-drawdown',
  'undercollateralized',
  'exit-queue',
  'exit-fee',
  'gated',
  'kyc',
  'points-inflated',
  'no-oracle',
])

export const TermSheetPanel: React.FC<Props> = ({ termSheet }) => {
  const supply = termSheet?.supply
  if (!supply) return null

  // `info` exists on a full sheet; a digest flattens headline/tags to the top.
  const headline: string | undefined = supply.info?.headline ?? supply.headline
  const description: string | undefined = supply.info?.description
  const implications: string[] = supply.info?.implications ?? []
  const tags: string[] = supply.info?.tags ?? supply.tags ?? []
  const risks: string[] = supply.principal?.risks ?? []
  const counterparty = supply.counterparty
  const availability = supply.availability

  return (
    // No heading of its own: the panel that mounts this already labels the
    // section, and a second "Terms" line inside it read as a nested block.
    <div>
      {headline && <div className="text-xs font-medium">{headline}</div>}

      {description && (
        <p className="mt-1 text-xs leading-relaxed text-base-content/70">{description}</p>
      )}

      {implications.length > 0 && (
        <ul className="mt-1 list-disc pl-4 text-xs text-base-content/70">
          {implications.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}

      {(tags.length > 0 || risks.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.map((t) => (
            <Badge key={t} tone={WARN_TAGS.has(t) ? 'warning' : 'neutral'}>
              {tagLabel(t)}
            </Badge>
          ))}
          {/* Principal risks are always warnings — they describe ways the
              deposit itself can shrink, not merely how the deal is shaped. */}
          {risks.map((r) => (
            <Badge key={r} tone="error">
              {tagLabel(r)}
            </Badge>
          ))}
        </div>
      )}

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {counterparty?.solvency && (
          <Row
            label="Backing"
            value={tagLabel(counterparty.solvency)}
            warn={
              counterparty.solvency === 'undercollateralized' ||
              counterparty.solvency === 'tranched-junior'
            }
          />
        )}
        {counterparty?.kind && <Row label="Counterparty" value={tagLabel(counterparty.kind)} />}
        {availability?.gating && (
          <Row
            label="Access"
            value={tagLabel(availability.gating)}
            warn={availability.gating !== 'permissionless'}
          />
        )}
        {availability?.requires?.length > 0 && (
          <Row label="Requires" value={availability.requires.map(tagLabel).join(', ')} />
        )}
        {supply.principal?.protected === false && (
          <Row label="Principal" value="not protected" warn />
        )}
      </div>

      {termSheet?.profileId && (
        <div className="mt-2 text-[10px] text-base-content/40">{termSheet.profileId}</div>
      )}
    </div>
  )
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <span className="text-base-content/50">{label}: </span>
      <span className={warn ? 'text-warning' : ''}>{value}</span>
    </div>
  )
}
