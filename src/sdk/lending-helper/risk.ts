/**
 * Risk-score banding.
 *
 * Bands risk scores into the tones the UI renders. This exists
 * because three places banded scores independently and drew the lines
 * differently — the same score rendered amber in one table and red in another.
 * This is the single definition; everything that bands a score calls it.
 *
 * **1–2 low · 3–4 medium · 5 high — and 4 is MEDIUM.** The line is not ours to
 * draw: the backend's `risk_labels` lookup table is what stamps `riskLabel` /
 * `configRiskLabel` on every row we render, and it bands 3 AND 4 as medium
 * (`app/migrations/0003_tables_risk.sql`, plus three `scoreToLabel` copies in
 * the routes). Banding 4 as high here meant the by-config table printed the
 * backend's amber "medium" chip while `RiskSelect` sent `maxRiskScore=3` — the
 * server filters `config_risk_score <= 3`, so every score-4 config vanished
 * under a ceiling that claimed to admit medium. On Avalanche/Euler that was
 * all 33 medium configs and the table came back empty.
 *
 * **6 is `compromised`, not "very high".** The backend (migration 0145) reserves
 * it for objects that are currently drained, insolvent or abandoned — an exit
 * scam, an unremediated exploit, an asset whose backing is gone — and for every
 * config that accepts such an asset as collateral. 5 is the ceiling for a venue
 * that is risky but functioning. Render 6 as its own thing; the API's own
 * label for it is `compromised`.
 */
export type RiskBand = 'low' | 'medium' | 'high' | 'compromised' | 'unknown'

export function riskBand(score: number | null | undefined): RiskBand {
  if (score == null || score === 0) return 'unknown'
  if (score <= 2) return 'low'
  if (score <= 4) return 'medium'
  if (score <= 5) return 'high'
  return 'compromised'
}
