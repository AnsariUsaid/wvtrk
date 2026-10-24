import { describe, expect, it } from 'vitest'

import type { HourRow, Slot } from '../types'
import { coverageWarning, fullDayProfile, histogram, insights, missingHourRun, overForecastPct } from './analysis'
import { clock, selectionLabel, signedGw, ukDateTime } from './format'

const slot = (hour: number, forecast: number | null, day = 5): Slot => ({
  startTime: `2026-01-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00Z`,
  actual: 10000,
  forecast,
  publishTime: null,
  error: forecast == null ? null : forecast - 10000,
})

describe('histogram', () => {
  it('puts errors in 0.5 GW bins and clamps the ends', () => {
    const bins = histogram([-9000, -4000, -3500, 0, 499, 500, 20000])
    expect(bins).toHaveLength(22)
    expect(bins[0]).toBe(2) // -9000 clamped, -4000 exactly on the edge
    expect(bins[1]).toBe(1)
    expect(bins[8]).toBe(2) // 0 and 499
    expect(bins[9]).toBe(1)
    expect(bins[21]).toBe(1)
  })

  it('counts over-forecast hours', () => {
    expect(overForecastPct([100, -5, 0, 300])).toBe(50)
    expect(overForecastPct([])).toBe(0)
  })
})

describe('missing hours', () => {
  it('finds a run that wraps past midnight', () => {
    const slots = [22, 23, 0, 1, 2].map((h) => slot(h, null)).concat([slot(12, 1)])
    expect(missingHourRun(slots)).toEqual([22, 23, 0, 1, 2])
    expect(coverageWarning(589, 744, slots)).toBe(
      '589 of 744 hours have a forecast this far ahead. Night hours (22:00–03:00) are missing.',
    )
  })

  it('falls back to a general message for daytime gaps', () => {
    expect(coverageWarning(10, 12, [slot(12, null), slot(14, null)])).toMatch(/Some hours are missing\.$/)
  })

  it('says nothing extra when every hour has a forecast', () => {
    expect(missingHourRun([slot(1, 5)])).toBeNull()
  })
})

describe('profile and insights', () => {
  const profile: HourRow[] = fullDayProfile([
    { hour: 1, slots: 31, meanError: 3000, mae: 3100 },
    { hour: 2, slots: 31, meanError: 3000, mae: 3100 },
    { hour: 3, slots: 31, meanError: 3000, mae: 3100 },
    { hour: 15, slots: 31, meanError: -500, mae: 900 },
  ])

  it('fills all 24 hours', () => {
    expect(profile).toHaveLength(24)
    expect(profile[0]).toEqual({ hour: 0, slots: 0, meanError: 0, mae: 0 })
  })

  it('describes the bias and worst window', () => {
    const text = insights({ rangeText: 'the whole of January', bias: 1854, nmae: 17.7, profile, overPct: 81 })
    expect(text.headline).toBe(
      'Over the whole of January, forecasts were on average 1.9 GW higher than actual wind output.',
    )
    expect(text.detail).toContain('overnight: between 01:00 and 04:00 the forecast was 3.0 GW too high')
    expect(text.detail).toContain('81% of hours were over-forecast')
  })
})

describe('format', () => {
  it('formats clock times and signed GW', () => {
    expect(clock(25)).toBe('01:00')
    expect(signedGw(-1250)).toBe('−1.3 GW')
  })

  it('describes a selection', () => {
    const base = { start: '2026-01-01', end: '2026-01-31' }
    expect(selectionLabel({ ...base, mode: 'horizon', horizon: 24, cutoff: null })).toBe('24 h ahead')
    expect(
      selectionLabel({ start: '2026-01-05', end: '2026-01-11', mode: 'day_ahead', horizon: null, cutoff: '09:00:00' }),
    ).toBe('5–11 Jan, day before at 09:00')
  })

  it('shows fetch time in UK time', () => {
    expect(ukDateTime('2026-10-24T10:57:18Z')).toBe('24 Oct 2026, 11:57')
  })
})
