import { vocabLabel, type EarnMarket, type EarnVocabulary } from '../../../../sdk/earn-helper'

/**
 * The grey sub-line under a row's name: who runs it · what it runs on · kind.
 *
 * One function because three places rendered it and all three disagreed — the
 * table and the detail panel printed `curator · brand`, the history band
 * printed `curator · protocol`.
 *
 * `brand` is documented as "curator where one exists, else the protocol", and
 * the data bears that out: on chain 1 every one of the 54 curated rows has
 * `brand === curator.name`. So `curator · brand` was ALWAYS the same word twice
 * — "Tulipa Capital · Tulipa Capital · Vaults". With a curator present the
 * informative second segment is the PROTOCOL: which stack the deposit actually
 * lands in (Lagoon, Morpho, Gearbox), which is the thing the curator's name
 * cannot tell you.
 *
 * Without a curator, `brand` wins instead: it keeps the generation where
 * `protocol.name` is version-free — `AAVE_V3` arrives as protocol `Aave`, brand
 * `Aave V3` — and an Aave V2 row that reads identically to an Aave V3 row is
 * worse than a slightly less canonical name.
 *
 * The dedupe is kept anyway: the uncurated case still collapses `Strata ·
 * Strata`, and it means a future row whose curator and protocol coincide
 * degrades to one segment rather than to a stutter.
 */
export function venueSubtitle(
  row: EarnMarket,
  vocab: EarnVocabulary,
  opts: { withAsset?: boolean } = {}
): string {
  const curator = row.curator?.name?.trim()
  const stack = curator ? (row.protocol?.name ?? row.brand) : (row.brand ?? row.protocol?.name)

  const parts = [curator, stack, vocabLabel(vocab, 'venueKind', row.venueKind)]
  if (opts.withAsset) parts.push(row.asset.symbol)

  const out: string[] = []
  const seen = new Set<string>()
  for (const part of parts) {
    const value = part?.trim()
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out.join(' · ')
}
