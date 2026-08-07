import React, { useState } from 'react'
import { TermPending, TermRow, TermSection } from './TermRow'
import { TermsChips } from './TermsChips'
import { RateModelRows } from './RateModelRows'
import { RateSetterRow, type RateSetterState } from './RateSetterRow'
import {
  atMaturityLabel,
  badDebtLabel,
  redemptionImpactLabel,
  redemptionMechanism,
  redemptionOrderLabel,
  formatRaw,
  liquidationModelLabel,
  blockedLabel,
  debtShapeLabel,
  duration,
  earlyRepayLabel,
  exitLabel,
  exposureSummary,
  feeAmount,
  governanceSentence,
  isRebate,
  oracleBandClass,
  pct,
  priceRiskLabel,
  rateKindLabel,
  shortAddress,
  shortDate,
  solvencyLabel,
  triggerLabel,
} from './format'
import { hasExpandableDetail, severityTextClass, splitFindings } from './severity'
import type { AnyTermSheet, FeeTerm, TermSheet, TermSide } from './types'
import { isFullSheet, sideInfo } from './types'

/**
 * The **compose**-depth surface: one card in the Deposit / Borrow panel that
 * replaces the ad-hoc conditional rows those forms grew per lender.
 *
 * Deposit and borrow are deliberately NOT symmetric (same component, different
 * row order and row set) because the two users ask different questions:
 *
 *   supply → what do I earn · when can I get out · what backs it · who can
 *            change the deal
 *   borrow → what do I pay AND does it grow · when is it due and what if I do
 *            nothing · what can take my collateral · what does exiting cost
 *
 * There are **no lender-key conditionals anywhere in this file** — every
 * branch keys off a term-sheet field. That is what makes a newly integrated
 * lender render correctly with zero UI work.
 */

const FeeRow: React.FC<{ fee: FeeTerm }> = ({ fee }) => (
  <TermRow
    label={fee.label}
    hint={fee.description}
    tone={isRebate(fee) ? 'good' : fee.when === 'late' ? 'critical' : 'default'}
    value={
      <>
        {isRebate(fee) ? '−' : ''}
        {feeAmount(fee)}
        {fee.indicative ? <span className="text-base-content/40"> (est.)</span> : null}
      </>
    }
  />
)

function SupplyRows({ sheet }: { sheet: TermSheet }) {
  const s = sheet.supply
  if (!s) return null
  const u = sheet.utilization
  const points = (s.rate.rewards ?? []).filter((r) => r.indicative)

  return (
    <>
      <TermSection title="What you earn">
        <TermRow
          label={`${rateKindLabel(String(s.rate.kind))} rate`}
          value={pct(s.rate.aprTotal)}
          tone="good"
          hint="Nominal APR, not APY. Excludes points programs, which are shown separately because they cannot be priced."
        />
        {s.rate.components.rewards ? (
          <TermRow label="…of which rewards" value={pct(s.rate.components.rewards)} />
        ) : null}
        {s.rate.components.intrinsic ? (
          <TermRow
            label="…from the asset itself"
            value={pct(s.rate.components.intrinsic)}
            hint="Yield the underlying asset earns on its own (e.g. staking), independent of this market."
          />
        ) : null}
        {points.length > 0 ? (
          <TermRow
            label="Points (not priceable)"
            value={pct(points.reduce((a, r) => a + r.apr, 0))}
            tone="warn"
            hint="A points program has no priceable value, so it is deliberately excluded from the headline rate."
          />
        ) : null}
      </TermSection>

      <TermSection title="When you can get out">
        <TermRow
          label="Withdrawals"
          value={exitLabel(s.exit.mode)}
          tone={s.exit.settlement === 'sync' ? 'default' : 'warn'}
        />
        {s.exit.cooldownSecs ? (
          <TermRow
            label="Cooldown"
            value={duration(s.exit.cooldownSecs)}
            tone="warn"
            hint="How long YOUR money is locked. Distinct from the governance timelock, which is how long you have to react to someone changing the deal."
          />
        ) : null}
        {s.exit.priceRisk !== 'none' ? (
          <TermRow
            label="Exit price"
            value={priceRiskLabel(s.exit.priceRisk)}
            tone={s.exit.priceRisk === 'may-be-impossible' ? 'critical' : 'warn'}
          />
        ) : null}
        {s.exit.liquidity ? (
          <TermRow
            label="Withdrawable now"
            value={
              s.exit.liquidity.ratio != null
                ? `${pct(s.exit.liquidity.ratio * 100, 1)} of the pool`
                : s.exit.liquidity.assets.toLocaleString()
            }
            tone={
              s.exit.liquidity.ratio != null && s.exit.liquidity.ratio < 0.02
                ? 'critical'
                : 'default'
            }
          />
        ) : null}
        {u ? (
          <TermRow
            label="Utilization"
            value={pct(u.utilization * 100, 1)}
            tone={u.utilization >= 0.98 ? 'critical' : u.utilization >= 0.9 ? 'warn' : 'default'}
            hint="At 100% the quoted rate is real but the money cannot leave until borrowers repay."
            note={
              u.basis !== 'market'
                ? `Measured on the ${String(u.basis).replace(/-/g, ' ')}, not this market alone.`
                : undefined
            }
          />
        ) : null}
        {s.maturity.kind !== 'perpetual' ? (
          <TermRow label="At maturity" value={atMaturityLabel(s.maturity.atMaturity)} />
        ) : null}
      </TermSection>

      <TermSection title="What backs it">
        {s.backedBy ? (
          <TermRow
            label="Collateral"
            value={exposureSummary(s.backedBy)}
            tone={(s.backedBy.worstRiskScore ?? 0) >= 4 ? 'warn' : 'default'}
            hint={
              s.backedBy.weightBasis === 'unweighted'
                ? 'This lender does not record on-chain which collateral backs which borrow, so this is the accepted SET, not a measured split.'
                : undefined
            }
            note={
              s.backedBy.worstOracleBand === 'HIGH' || s.backedBy.worstOracleBand === 'CRITICAL'
                ? 'Some backing collateral is priced by an oracle flagged as risky.'
                : undefined
            }
          />
        ) : null}
        <TermRow label="Counterparty" value={solvencyLabel(String(s.counterparty.solvency))} />
        {s.counterparty.socializedLoss ? (
          <TermRow label="Bad debt" value="Socialised across lenders" tone="warn" />
        ) : null}
      </TermSection>

      <TermSection title="Fees">
        {s.fees.length === 0 ? <TermRow label="Fees" value="None" tone="good" /> : null}
        {s.fees.map((f, i) => (
          <FeeRow key={`${f.id}-${i}`} fee={f} />
        ))}
      </TermSection>
    </>
  )
}

function BorrowRows({ sheet, rateEdit }: { sheet: TermSheet; rateEdit?: TermsRateEdit }) {
  const b = sheet.borrow
  if (!b) return null

  return (
    <>
      <TermSection title="What you pay">
        <TermRow
          label={`${rateKindLabel(String(b.rate.kind))} rate`}
          value={
            b.rate.kind === 'user-set'
              ? `${pct(b.rate.minApr)} – ${pct(b.rate.maxApr)}`
              : b.rate.kind === 'zero-interest'
                ? 'No ongoing interest'
                : pct(b.rate.apr)
          }
          hint="Nominal APR, not APY."
        />
        {b.rate.userSet?.required ? (
          <RateSetterRow
            rate={b.rate}
            value={rateEdit?.value}
            onChange={rateEdit?.onChange}
            onCommit={rateEdit?.onCommit}
            committing={rateEdit?.committing}
            commitLabel={rateEdit?.commitLabel}
          />
        ) : null}
        <TermRow
          label="Amount owed"
          value={debtShapeLabel(String(b.debtShape))}
          hint="The biggest departure from variable-rate intuition: most fixed-term debt is a static face value that does not accrue."
        />
      </TermSection>

      <TermSection title="When it is due">
        <TermRow
          label="Maturity"
          value={
            b.maturity.kind === 'fixed-date'
              ? shortDate(b.maturity.maturity)
              : b.maturity.kind === 'rolling-duration'
                ? `You choose, up to ${duration(b.maturity.maxDurationSecs)}`
                : 'None — perpetual'
          }
        />
        {b.maturity.atMaturity ? (
          <TermRow
            label="If you do nothing"
            value={atMaturityLabel(b.maturity.atMaturity)}
            tone={
              b.maturity.atMaturity === 'default-seizure' ||
              b.maturity.atMaturity === 'physical-delivery' ||
              b.maturity.atMaturity === 'liquidatable'
                ? 'critical'
                : 'warn'
            }
          />
        ) : null}
        {b.maturity.graceSecs != null ? (
          <TermRow
            label="Grace period"
            value={duration(b.maturity.graceSecs)}
            tone={b.maturity.graceSecs < 86_400 ? 'critical' : 'warn'}
          />
        ) : null}
      </TermSection>

      <TermSection title="What can take your collateral">
        <TermRow
          label="Liquidation trigger"
          value={triggerLabel(String(b.liquidation.trigger))}
          tone={String(b.liquidation.trigger).includes('time') ? 'critical' : 'default'}
          note={
            String(b.liquidation.trigger).includes('time')
              ? 'A healthy, over-collateralised position can still be liquidated for being late.'
              : undefined
          }
        />
        {b.liquidation.ltv != null ? (
          <TermRow label="Max LTV" value={pct(b.liquidation.ltv * 100)} />
        ) : null}
        {b.liquidation.liquidationLtv != null ? (
          <TermRow label="Liquidation at" value={pct(b.liquidation.liquidationLtv * 100)} />
        ) : null}
        {/* HOW it happens, not just what triggers it — "a liquidator seizes
            your collateral" is simply not what a soft-band market does. */}
        <TermRow
          label="How it happens"
          value={liquidationModelLabel(b.liquidation.model)}
          tone={b.liquidation.reversible ? 'good' : 'default'}
          note={
            b.liquidation.reversible
              ? 'No penalty, and it reverses if the price recovers — there is no single liquidation price.'
              : undefined
          }
        />
        <TermRow
          label="Liquidator takes"
          value={
            b.liquidation.seizure === 'full-collateral'
              ? 'ALL of your collateral'
              : b.liquidation.reversible
                ? 'Nothing — conversion is penalty-free'
                : b.liquidation.penalty != null
                  ? `Debt repaid + ${pct(b.liquidation.penalty * 100)}`
                  : undefined
          }
          tone={b.liquidation.seizure === 'full-collateral' ? 'critical' : 'default'}
        />
        {/* Several models charge different rates on different paths; showing
            one number would hide the worse one. */}
        {b.liquidation.penalties?.map((p) => (
          <TermRow key={p.id} label={p.label} value={pct(p.value * 100)} hint={p.description} />
        ))}
        {b.liquidation.bandLtv ? (
          <TermRow
            label="LTV by band count"
            value={`${Object.keys(b.liquidation.bandLtv).length} options`}
            note={Object.entries(b.liquidation.bandLtv)
              .map(([n, ltv]) => `N=${n}: ${pct(ltv * 100)}`)
              .join(' · ')}
            hint="Your collateral factor is fixed by the band count you choose when you open — fewer bands means a higher LTV but a narrower soft-liquidation range."
          />
        ) : null}
        {b.liquidation.windowSecs != null ? (
          <TermRow
            label="Liquidation window"
            value={duration(b.liquidation.windowSecs)}
            tone={b.liquidation.windowSecs < 86_400 ? 'warn' : 'default'}
          />
        ) : null}
        <TermRow label="Bad debt" value={badDebtLabel(b.liquidation.badDebt)} />
        {b.liquidation.redeemable ? (
          <>
            {/* Lead with the MECHANISM. The bare effect reads as a governance
                power; what a borrower needs is who can do it and why. */}
            <TermRow
              label="Redemption"
              value={
                redemptionOrderLabel(b.liquidation.redemption?.order) ?? 'Possible while healthy'
              }
              tone="critical"
              hint={redemptionMechanism(b.liquidation.redemption)}
              note={redemptionImpactLabel(b.liquidation.redemption?.valueImpact)}
            />
            {b.liquidation.redemption?.defence ? (
              <TermRow
                label="What you can do"
                value="Raise your rate"
                tone="good"
                note={b.liquidation.redemption.defence}
              />
            ) : b.liquidation.redemption?.order === 'pro-rata' ? (
              // Saying "raise your rate" here would be actively misleading:
              // every borrower is skimmed, so there is no queue to move in.
              <TermRow
                label="What you can do"
                value="Nothing"
                tone="warn"
                note="Every borrower in this market is skimmed pro-rata — there is no queue to move in and no rate to raise."
              />
            ) : null}
          </>
        ) : null}
        {b.acceptedCollateral ? (
          <TermRow
            label="Accepted collateral"
            value={exposureSummary(b.acceptedCollateral)}
            tone={
              b.acceptedCollateral.worstOracleBand === 'HIGH' ||
              b.acceptedCollateral.worstOracleBand === 'CRITICAL'
                ? 'warn'
                : 'default'
            }
          />
        ) : null}
      </TermSection>

      <TermSection title="Getting out">
        <TermRow
          label="Repay early"
          value={earlyRepayLabel(String(b.exit.earlyRepay))}
          tone={
            b.exit.earlyRepay === 'discount'
              ? 'good'
              : b.exit.earlyRepay === 'penalty' || b.exit.earlyRepay === 'not-allowed'
                ? 'warn'
                : 'default'
          }
        />
        {b.availability.minSize && b.availability.minSize !== b.exit.minDebt ? (
          <TermRow
            label="Minimum borrow"
            value={formatRaw(b.availability.minSize, sheet.asset?.decimals, sheet.asset?.symbol)}
            hint="A borrow below this reverts — validate before building."
          />
        ) : null}
        {b.exit.partialAllowed === false ? (
          <TermRow label="Partial repay" value="Not supported — full close only" tone="warn" />
        ) : null}
        {b.exit.overRepayReverts ? (
          <TermRow
            label="Over-repaying"
            value="REVERTS"
            tone="critical"
            hint="The repayment must be sized to the exact debt; sending more fails the transaction."
          />
        ) : null}
        {b.exit.minDebt ? (
          <TermRow
            label="Minimum debt"
            value={formatRaw(b.exit.minDebt, sheet.asset?.decimals, sheet.asset?.symbol)}
            hint="A borrow below this reverts, and a partial repay may not leave you under it."
          />
        ) : null}
        {b.fees.map((f, i) => (
          <FeeRow key={`${f.id}-${i}`} fee={f} />
        ))}
      </TermSection>

      {b.modes && b.modes.length > 1 ? (
        <TermSection title="Modes">
          {(() => {
            // Aave V3 mainnet publishes ~49 categories. Dumping all of them
            // buries the terms they sit among, and most are irrelevant to the
            // asset in hand: what a borrower wants is the ones that RAISE the
            // LTV above the default. Show those, best first, and say how many
            // were left out rather than silently truncating.
            const def = b.modes!.find((x) => x.isDefault)
            const defLtv = def?.liquidation?.ltv ?? b.liquidation.ltv ?? 0
            const better = b
              .modes!.filter((x) => !x.isDefault && (x.liquidation?.ltv ?? 0) > defLtv)
              .sort((x, y) => (y.liquidation?.ltv ?? 0) - (x.liquidation?.ltv ?? 0))
            const shown = better.slice(0, 4)
            return (
              <>
                <TermRow
                  label={def?.label ?? 'Default'}
                  value={`${pct((defLtv ?? 0) * 100)} LTV`}
                  hint="Applies unless you opt into another mode."
                />
                {shown.map((mode) => (
                  <TermRow
                    key={mode.modeId}
                    label={mode.label ?? `Mode ${mode.modeId}`}
                    value={`${pct((mode.liquidation?.ltv ?? 0) * 100)} LTV`}
                    tone="good"
                    hint={
                      mode.acceptedCollateral
                        ? 'Higher LTV, but this mode restricts which collateral you may post.'
                        : undefined
                    }
                  />
                ))}
                {better.length > shown.length ? (
                  <TermRow
                    label="Other modes"
                    value={`+${better.length - shown.length} more`}
                    note="Modes that do not raise the LTV for this asset are omitted."
                  />
                ) : null}
              </>
            )
          })()}
        </TermSection>
      ) : null}
    </>
  )
}

/** Market-level blocks — shared by both sides, because both are affected. */
function MarketRows({ sheet }: { sheet: TermSheet }) {
  const pending = sheet.coverage?.pending ?? {}
  const notApplicable = sheet.coverage?.notApplicable ?? {}

  return (
    <>
      <TermSection title="Oracle">
        {sheet.oracle ? (
          sheet.oracle.kind === 'none' ? (
            <TermRow
              label="Price oracle"
              value="None — liquidation is time-based"
              hint="Not missing data: this market has no price feed anywhere in its liquidation trigger."
            />
          ) : (
            <>
              <TermRow
                label="Price feed"
                value={
                  <span className={oracleBandClass(sheet.oracle.band)}>
                    {sheet.oracle.provider ?? 'unknown'}
                    {sheet.oracle.band ? ` · ${sheet.oracle.band}` : ''}
                  </span>
                }
              />
              {sheet.oracle.address ? (
                <TermRow
                  label="Oracle contract"
                  value={
                    <span title={sheet.oracle.address}>{shortAddress(sheet.oracle.address)}</span>
                  }
                />
              ) : null}
              {sheet.oracle.priceDescription ? (
                <TermRow label="Reports" value={sheet.oracle.priceDescription} />
              ) : null}
              {sheet.oracle.flags?.length ? (
                <TermRow label="Flags" value={sheet.oracle.flags.join(', ')} tone="critical" />
              ) : null}
            </>
          )
        ) : pending.oracle ? (
          <TermPending label="Price oracle" />
        ) : notApplicable.oracle ? (
          <TermRow label="Price oracle" value="Not applicable" />
        ) : null}
      </TermSection>

      <TermSection title="Who can change the deal">
        {sheet.governance ? (
          <>
            <TermRow
              label="Parameters"
              value={sheet.governance.mutability === 'immutable' ? 'Immutable' : 'Governed'}
              tone={sheet.governance.mutability === 'immutable' ? 'good' : 'default'}
            />
            {sheet.governance.mutability !== 'immutable' ? (
              <TermRow
                label="Notice period"
                value={
                  sheet.governance.timelockSecs ? duration(sheet.governance.timelockSecs) : 'None'
                }
                tone={sheet.governance.timelockSecs ? 'default' : 'warn'}
                hint="How long you have to react to a parameter change. This is NOT a withdrawal lock."
                note={governanceSentence(sheet.governance)}
              />
            ) : null}
          </>
        ) : pending.governance ? (
          <TermPending label="Governance" />
        ) : null}
      </TermSection>
    </>
  )
}

const TITLE_TONE = {
  default: 'text-base-content/40',
  good: 'text-success/80',
  warn: 'text-warning/80',
} as const

export type TermsTitleTone = keyof typeof TITLE_TONE

/**
 * Names the card.
 *
 * Without it the collapsed state is a bare headline — "Variable 4.64% ·
 * withdraw any time" over a chip — which reads as an unlabelled rate dropdown
 * rather than as the terms of the deal. Styled like `TermSection`'s title so
 * the card's name and the names of the blocks inside it are the same language.
 */
const TermsHeader: React.FC<{
  title: string
  subtitle?: React.ReactNode
  tone: TermsTitleTone
}> = ({ title, subtitle, tone }) => (
  <div className="flex items-baseline gap-1.5 min-w-0">
    <span
      className={`text-[10px] font-semibold uppercase tracking-wide shrink-0 ${TITLE_TONE[tone]}`}
    >
      {title}
    </span>
    {subtitle ? (
      <span className="text-[10px] text-base-content/50 truncate">{subtitle}</span>
    ) : null}
  </div>
)

export interface TermsRateEdit {
  /** Controlled value, PERCENT. */
  value?: number
  onChange?: (state: RateSetterState) => void
  /** Provide to show a commit button (an existing position's rate change). */
  onCommit?: (aprPercent: number) => void
  committing?: boolean
  commitLabel?: string
}

export const TermsSummary: React.FC<{
  /**
   * Either shape. List endpoints default to `?terms=digest`, so this is a
   * DIGEST far more often than a full sheet — the component renders the
   * headline, chips and findings from either, and only shows the detail rows
   * when the full sheet is actually present.
   */
  sheet: AnyTermSheet | undefined
  side: TermSide
  /** Start expanded. Defaults to collapsed to keep the action panel compact. */
  defaultOpen?: boolean
  className?: string
  /**
   * Makes the user-set interest rate EDITABLE in place.
   *
   * On the Liquity family the rate is a term the borrower negotiates, not one
   * the protocol publishes — so it is edited where the other terms are read.
   * Omit to render the sheet read-only.
   */
  rateEdit?: TermsRateEdit
  /** True while the full sheet is being fetched — keeps "summary only" from
   *  reading as a permanent fact about the market. */
  termsLoading?: boolean
  /**
   * Overrides the card's name. Defaults to "Deposit terms" / "Borrow terms".
   *
   * Panels that open BOTH sides at once (Loop) name them by ROLE instead —
   * "Collateral" / "Debt" — because two cards that both read "Variable x% · …"
   * are otherwise indistinguishable, and which side you are agreeing to is the
   * one thing that matters there.
   */
  title?: string
  /** Qualifier after the title, e.g. the asset and what the side does. */
  subtitle?: React.ReactNode
  titleTone?: TermsTitleTone
}> = ({
  sheet,
  side,
  defaultOpen = false,
  className,
  rateEdit,
  termsLoading,
  title,
  subtitle,
  titleTone = 'default',
}) => {
  const [open, setOpen] = useState(defaultOpen)
  if (!sheet) return null

  const heading = title ?? (side === 'borrow' ? 'Borrow terms' : 'Deposit terms')

  const info = sideInfo(sheet, side)
  const full = isFullSheet(sheet) ? sheet : undefined
  if (!info) {
    // Absence is meaningful: no borrow block means the market is not borrowable.
    return (
      <div
        className={`rounded-lg border border-base-300 px-2 py-1.5 text-[11px] text-base-content/60 ${className ?? ''}`}
      >
        This market has no {side === 'borrow' ? 'borrow' : 'supply'} side.
      </div>
    )
  }

  // Criticals stay visible while collapsed; everything else moves into the
  // expanded body. See `splitFindings` for why the split is not a blanket
  // "hide the findings".
  const { criticals, secondary } = splitFindings(sheet, side)

  // `canOpen` is nested on the full sheet and hoisted on the digest.
  const sideAny = sheet[side] as
    | { canOpen?: boolean; availability?: { canOpen: boolean; blockedBy?: string } }
    | undefined
  const canOpen = sideAny?.availability?.canOpen ?? sideAny?.canOpen ?? true
  const blockedBy = sideAny?.availability?.blockedBy
  const blocked = !canOpen

  const hasMore = hasExpandableDetail(sheet, side)

  return (
    <section
      className={`rounded-lg border border-base-300 text-[11px] ${className ?? ''}`}
      aria-label={heading}
    >
      {hasMore ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full px-2 py-1.5 flex items-start justify-between gap-2 text-left hover:bg-base-200/40 transition-colors rounded-lg"
          aria-expanded={open}
        >
          <div className="min-w-0 space-y-1">
            <TermsHeader title={heading} subtitle={subtitle} tone={titleTone} />
            <div className="font-medium text-base-content/80">{info.headline}</div>
            <TermsChips sheet={sheet} side={side} limit={3} />
          </div>
          <span className="text-base-content/40 shrink-0 mt-0.5">{open ? '▲' : '▼'}</span>
        </button>
      ) : (
        // Nothing to expand — render the same header as static content rather
        // than a button that does nothing when clicked.
        <div className="w-full px-2 py-1.5 min-w-0 space-y-1">
          <TermsHeader title={heading} subtitle={subtitle} tone={titleTone} />
          <div className="font-medium text-base-content/80">{info.headline}</div>
          <TermsChips sheet={sheet} side={side} limit={3} />
        </div>
      )}

      {blocked ? (
        <div className="mx-2 mb-1.5 rounded border border-error/30 bg-error/10 px-2 py-1 text-error">
          Currently unavailable — {blockedLabel(blockedBy)}.
        </div>
      ) : null}

      {criticals.length > 0 ? (
        <ul className="mx-2 mb-1.5 space-y-1">
          {criticals.map((f) => (
            <li key={f.id} className={`flex gap-1.5 ${severityTextClass(f.severity)}`}>
              <span aria-hidden className="shrink-0">
                ⚠
              </span>
              <span>{f.message}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <div className="border-t border-base-300 px-2 py-2 space-y-2.5">
          {secondary.length > 0 ? (
            <ul className="space-y-1">
              {secondary.map((f) => (
                <li key={f.id} className={`flex gap-1.5 ${severityTextClass(f.severity)}`}>
                  <span aria-hidden className="shrink-0">
                    •
                  </span>
                  <span>{f.message}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {info.description ? <p className="text-base-content/60">{info.description}</p> : null}
          {full ? (
            <>
              {side === 'supply' ? (
                <SupplyRows sheet={full} />
              ) : (
                <BorrowRows sheet={full} rateEdit={rateEdit} />
              )}
              {/* The curve belongs next to the rate it explains: "3.94% now"
                  and "3.94% until utilization moves" are different offers. */}
              <RateModelRows sheet={full} side={side} />
              <MarketRows sheet={full} />
              {full.constraints?.positionIdMeaning ? (
                <TermSection title="Position">
                  <TermRow
                    label="Identified by"
                    value={String(full.constraints.positionModel).replace(/-/g, ' ')}
                    note={full.constraints.positionIdMeaning}
                  />
                </TermSection>
              ) : null}
            </>
          ) : (
            // Digest only. This is normally TRANSIENT — the full sheet is
            // being fetched — so it must not read as a permanent property of
            // the market. Distinguishing loading from failure matters:
            // wording this as a fact made a wrong query param look like every
            // market simply had no terms.
            <p className="text-base-content/50 italic">
              {termsLoading ? 'Loading full terms…' : 'Showing summary terms only.'}
            </p>
          )}
        </div>
      ) : null}
    </section>
  )
}
