// Figures worked out in the browser from the API responses.

import type { HourRow, Slot } from '../types'
import { clock, gw } from './format'

// ---------- Error distribution ----------

export const BIN_MW = 500
export const BIN_MIN_MW = -4000
export const BIN_COUNT = 22 // -4 GW .. +7 GW; values outside go in the end bins

export function histogram(errors: number[]): number[] {
  const bins = new Array<number>(BIN_COUNT).fill(0)
  for (const e of errors) {
    const k = Math.floor((e - BIN_MIN_MW) / BIN_MW)
    bins[Math.max(0, Math.min(BIN_COUNT - 1, k))]++
  }
  return bins
}

export const overForecastPct = (errors: number[]) =>
  errors.length ? Math.round((errors.filter((e) => e > 0).length / errors.length) * 100) : 0

// ---------- Error by hour ----------

/** Always 24 rows, filling hours the API had no data for. */
export function fullDayProfile(rows: HourRow[]): HourRow[] {
  const byHour = new Map(rows.map((r) => [r.hour, r]))
  return Array.from({ length: 24 }, (_, hour) => byHour.get(hour) ?? { hour, slots: 0, meanError: 0, mae: 0 })
}

// ---------- Missing hours ----------

const NIGHT = new Set([20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6, 7])

/** Hours of day with no forecast, as one run around the clock if possible, e.g. [22, 23, 0, 1, 2]. */
export function missingHourRun(slots: Slot[]): number[] | null {
  const missing = [...new Set(slots.filter((s) => s.forecast == null).map((s) => new Date(s.startTime).getUTCHours()))]
  if (!missing.length) return null
  missing.sort((a, b) => a - b)
  // Start the run after the biggest gap between missing hours (going round midnight).
  let startIdx = 0
  let biggestGap = -1
  missing.forEach((h, i) => {
    const prev = missing[(i - 1 + missing.length) % missing.length]
    const gap = (h - prev + 24) % 24 || 24
    if (gap > biggestGap) {
      biggestGap = gap
      startIdx = i
    }
  })
  return [...missing.slice(startIdx), ...missing.slice(0, startIdx)]
}

export function coverageWarning(used: number, total: number, slots: Slot[]): string {
  const head = `${used.toLocaleString('en-GB')} of ${total.toLocaleString('en-GB')} hours have a forecast this far ahead.`
  const run = missingHourRun(slots)
  if (!run) return head
  const contiguous = run.every((h, i) => i === 0 || h === (run[i - 1] + 1) % 24)
  if (contiguous && run.every((h) => NIGHT.has(h))) {
    return `${head} Night hours (${clock(run[0])}–${clock(run[run.length - 1] + 1)}) are missing.`
  }
  return `${head} Some hours are missing.`
}

// ---------- Change badges ("▲ 120 MW") ----------

export interface Delta {
  text: string
  better: boolean
}

/** Change from a baseline value, or null if it is too small to mention. */
export function delta(
  current: number,
  base: number,
  opts: { unit: string; decimals?: number; higherIsBetter?: boolean; compareSize?: boolean },
): Delta | null {
  const { unit, decimals = 0, higherIsBetter = false, compareSize = false } = opts
  const d = compareSize ? Math.abs(current) - Math.abs(base) : current - base
  if (Math.abs(d) < (decimals ? 0.05 : 0.5)) return null
  const size = decimals ? Math.abs(d).toFixed(decimals) : Math.round(Math.abs(d)).toLocaleString('en-GB')
  return { text: `${d > 0 ? '▲' : '▼'} ${size}${unit}`, better: higherIsBetter ? d > 0 : d < 0 }
}

// ---------- Plain-English insights ----------

export interface Insights {
  headline: string
  detail: string
}

export function insights(opts: {
  rangeText: string
  bias: number
  nmae: number
  profile: HourRow[]
  overPct: number
}): Insights {
  const { rangeText, bias, nmae, profile, overPct } = opts
  // Worst 3-hour window (wrapping round midnight) by summed mean error.
  let worst = 0
  let worstStart = 0
  for (let h = 0; h < 24; h++) {
    const sum = [0, 1, 2].reduce((acc, k) => acc + profile[(h + k) % 24].meanError, 0)
    if (Math.abs(sum) > Math.abs(worst)) {
      worst = sum
      worstStart = h
    }
  }
  const when =
    worstStart >= 21 || worstStart <= 4
      ? 'overnight'
      : worstStart < 12
        ? 'in the morning'
        : worstStart < 18
          ? 'in the afternoon'
          : 'in the evening'
  const headline = `Over ${rangeText}, forecasts were on average ${gw(Math.abs(bias))} GW ${bias >= 0 ? 'higher' : 'lower'} than actual wind output.`
  const detail =
    `The biggest misses were ${when}: between ${clock(worstStart)} and ${clock(worstStart + 3)} the forecast was ` +
    `${gw(Math.abs(worst / 3))} GW too ${worst >= 0 ? 'high' : 'low'} on average. ` +
    `${overPct}% of hours were over-forecast, and the typical miss was ${nmae.toFixed(1)}% of average output.`
  return { headline, detail }
}
