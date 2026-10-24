import type { Selection, Settings } from '../types'

// All times are January 2026, when UK time is the same as UTC.
export const PERIOD_START_MS = Date.UTC(2026, 0, 1)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MINUS = '−'

/** Hours since 1 Jan 2026 00:00 UTC. */
export const hourIndex = (iso: string) => (Date.parse(iso) - PERIOD_START_MS) / 3_600_000
const dateAt = (hours: number) => new Date(PERIOD_START_MS + Math.round(hours * 60) * 60_000)

export const mw = (v: number) => Math.round(v).toLocaleString('en-GB')
export const signedMw = (v: number) => (v >= 0 ? '+' : MINUS) + mw(Math.abs(v))
export const gw = (v: number) => (v / 1000).toFixed(1)
export const signedGw = (v: number) => (v >= 0 ? '+' : MINUS) + Math.abs(v / 1000).toFixed(1) + ' GW'

/** "09:00" for an hour of day (wraps past midnight). */
export function clock(hours: number): string {
  const h = ((hours % 24) + 24) % 24
  return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`
}

export const dayLabel = (hours: number) => {
  const d = dateAt(hours)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

export const weekdayLabel = (hours: number) => DAYS[dateAt(hours).getUTCDay()]

/** "24 Oct 2026, 11:57" in UK time. */
export function ukDateTime(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('day')} ${get('month')} ${get('year')}, ${get('hour')}:${get('minute')}`
}

export const rangeLabel = (start: number, end: number) => (start === end ? `${start} Jan` : `${start}–${end} Jan`)

const dayOf = (iso: string) => Number(iso.slice(8, 10))

/** Short description of what a result was computed for, e.g. "5–11 Jan, 24 h ahead". */
export function selectionLabel(sel: Selection): string {
  const start = dayOf(sel.start)
  const end = dayOf(sel.end)
  const range = start === 1 && end === 31 ? '' : `${rangeLabel(start, end)}, `
  const timing = sel.mode === 'horizon' ? `${sel.horizon} h ahead` : `day before at ${sel.cutoff?.slice(0, 5)}`
  return range + timing
}

export function modeDescription(s: Settings): string {
  return s.mode === 'horizon'
    ? `Using the forecast made at least ${s.horizon} h before each hour`
    : `Using the forecast available at ${s.decision} on the day before delivery`
}
