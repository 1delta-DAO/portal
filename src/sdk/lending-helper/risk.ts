/**
 * Risk-score banding.
 *
 * Bands 1–5 risk scores into the three tones the UI renders. This exists
 * because three places banded scores independently and drew the lines
 * differently — `RiskBadge` treated 4 as `high` while the earn and optimizer
 * helpers put 4 in `medium`, so the same score rendered amber in one table
 * and red in another. This is the single definition; everything that bands a
 * score calls it.
 */
export function riskBand(score: number | null | undefined): 'low' | 'medium' | 'high' | 'unknown' {
  if (score == null || score === 0) return 'unknown'
  if (score <= 2) return 'low'
  if (score === 3) return 'medium'
  return 'high'
}
