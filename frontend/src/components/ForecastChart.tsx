import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'

import { useTween } from '../hooks/useTween'
import { clock, dayLabel, gw, hourIndex, signedGw, weekdayLabel } from '../lib/format'
import { prefersReducedMotion } from '../lib/motion'
import type { ActualPoint, Slot } from '../types'
import styles from './ForecastChart.module.css'
import ui from './ui.module.css'

const HOURS = 31 * 24
const TICK_STEPS = [1, 3, 6, 12, 24, 48, 72, 96, 168]

interface Props {
  actuals: ActualPoint[] // half-hourly
  slots: Slot[] // hourly, forecast null where none was available
  subtitle: string
  height: number
}

/** Line chart of actual vs forecast output, with hover details and drag-to-zoom. */
export default function ForecastChart({ actuals, slots, subtitle, height: h }: Props) {
  const plotRef = useRef<HTMLDivElement>(null)
  const clipRef = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(700)
  const [hover, setHover] = useState<number | null>(null)
  const [brush, setBrush] = useState<{ a: number; b: number } | null>(null)
  const [zoom, setZoom] = useState<[number, number] | null>(null)

  // Index everything by hour of the month so arrays line up across settings changes.
  const { actual30, bySlot, i0, i1 } = useMemo(() => {
    const actual30 = new Array<number | null>(HOURS * 2).fill(null)
    for (const a of actuals) actual30[Math.round(hourIndex(a.startTime) * 2)] = a.generation
    const bySlot = new Map<number, Slot>()
    for (const s of slots) bySlot.set(Math.round(hourIndex(s.startTime)), s)
    const keys = [...bySlot.keys()]
    return { actual30, bySlot, i0: keys.length ? Math.min(...keys) : 0, i1: keys.length ? Math.max(...keys) + 1 : 1 }
  }, [actuals, slots])

  const target = useMemo(() => {
    const f = new Array<number | null>(HOURS).fill(null)
    bySlot.forEach((s, i) => (f[i] = s.forecast))
    return f
  }, [bySlot])
  const forecast = useTween(target, 750)

  // Reset zoom when the period changes.
  useEffect(() => setZoom(null), [i0, i1])

  useEffect(() => {
    const el = plotRef.current
    if (!el) return
    const measure = () => setW(Math.round(el.getBoundingClientRect().width) || 700)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Draw-in animation on first render.
  useEffect(() => {
    const el = clipRef.current
    if (!el || prefersReducedMotion()) return
    el.style.clipPath = 'inset(0 100% 0 0)'
    el.style.transition = 'clip-path 1.6s cubic-bezier(.65,0,.25,1)'
    const t = setTimeout(() => (el.style.clipPath = 'inset(0 0 0 0)'), 80)
    return () => clearTimeout(t)
  }, [])

  const view: [number, number] = zoom ?? [i0, i1 - 0.5]
  const yMax = 25000
  const X = (t: number) => ((t - view[0]) / (view[1] - view[0])) * w
  const Y = (v: number) => h - 4 - (v / yMax) * (h - 20)

  const paths = useMemo(() => {
    const pt = (t: number, v: number) => `${X(t).toFixed(1)} ${Y(v).toFixed(1)}`
    let act = ''
    for (let j = Math.max(0, Math.floor(view[0] * 2) - 1); j <= Math.min(HOURS * 2 - 1, Math.ceil(view[1] * 2) + 1); j++) {
      const v = actual30[j]
      if (v != null) act += (act ? 'L' : 'M') + pt(j / 2, v)
    }
    let fc = ''
    let area = ''
    let seg: number[] = []
    const flush = () => {
      if (seg.length > 1) {
        const line = seg.map((i) => pt(i, forecast[i]!)).join('L')
        fc += 'M' + line
        const back = [...seg].reverse().map((i) => pt(i, actual30[i * 2] ?? forecast[i]!)).join('L')
        area += `M${line}L${back}Z`
      }
      seg = []
    }
    for (let i = Math.max(0, Math.floor(view[0]) - 1); i <= Math.min(HOURS - 1, Math.ceil(view[1]) + 1); i++) {
      if (forecast[i] != null) seg.push(i)
      else flush()
    }
    flush()
    return { act, fc, area }
  }, [actual30, forecast, w, h, view[0], view[1]]) // X and Y depend only on view, w and h

  const span = view[1] - view[0]
  const step = TICK_STEPS.find((st) => span / st <= Math.max(3, Math.floor(w / 88))) ?? 168
  const xTicks: { x: number; label: string }[] = []
  for (let t = Math.ceil(view[0] / step) * step; t <= view[1]; t += step) {
    const x = X(t)
    if (x >= 16 && x <= w - 16) xTicks.push({ x, label: step >= 24 || t % 24 === 0 ? dayLabel(t) : clock(t) })
  }
  const yTicks = [0, 5000, 10000, 15000, 20000, 25000]

  const fraction = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const fx = fraction(e)
    if (brush) {
      setBrush({ ...brush, b: fx })
      setHover(null)
      return
    }
    const i = Math.max(i0, Math.min(i1 - 1, Math.round(view[0] + fx * span)))
    setHover(i)
  }
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const fx = fraction(e)
    setBrush({ a: fx, b: fx })
  }
  const onPointerUp = () => {
    if (!brush) return
    const lo = Math.min(brush.a, brush.b)
    const hi = Math.max(brush.a, brush.b)
    setBrush(null)
    if (hi - lo <= 0.01) return
    let z0 = view[0] + lo * span
    let z1 = view[0] + hi * span
    if (z1 - z0 < 6) {
      const mid = (z0 + z1) / 2
      z0 = mid - 3
      z1 = mid + 3
    }
    setZoom([Math.max(i0, z0), Math.min(i1 - 0.5, z1)])
  }

  const hovered = hover != null && hover >= Math.floor(view[0]) && hover <= view[1] ? bySlot.get(hover) : undefined
  const brushOn = brush && Math.abs(brush.b - brush.a) > 0.004

  return (
    <div className={ui.card} style={{ flex: '3 1 560px' }}>
      <div className={ui.cardHead}>
        <div className={ui.titleBlock}>
          <h2 className={ui.title}>Actual vs forecast wind output</h2>
          <span className={ui.sub}>{subtitle}</span>
        </div>
        <div className={ui.legend}>
          <span className={ui.legendItem}>
            <span className={ui.swatch} style={{ background: 'var(--forest)' }} />
            Actual (every 30 min)
          </span>
          <span className={ui.legendItem}>
            <span className={ui.swatch} style={{ background: 'var(--lime-2)' }} />
            Forecast (hourly)
          </span>
          <span className={ui.legendItem}>
            <span className={ui.swatch} style={{ background: 'rgba(163,224,95,.45)' }} />
            Gap
          </span>
        </div>
      </div>

      <div className={styles.frame}>
        <div ref={plotRef} className={styles.plot} style={{ height: h }}>
          {yTicks.map((v) => (
            <div key={v}>
              <div className={styles.gridLine} style={{ top: Y(v) }} />
              <span className={`${ui.axisLabel} ${styles.yLabel}`} style={{ top: Y(v) }}>
                {v ? `${v / 1000} GW` : '0'}
              </span>
            </div>
          ))}
          <div ref={clipRef} className={styles.clip}>
            <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Actual and forecast wind output over time">
              <path d={paths.area} fill="rgba(163,224,95,.32)" />
              <path d={paths.act} fill="none" stroke="var(--forest)" strokeWidth={1.7} strokeLinejoin="round" strokeLinecap="round" />
              <path d={paths.fc} fill="none" stroke="var(--lime-2)" strokeWidth={2} strokeLinejoin="round" />
            </svg>
          </div>

          {hovered && hover != null && (
            <HoverDetails
              x={X(hover)}
              w={w}
              yActual={Y(hovered.actual)}
              yForecast={hovered.forecast != null ? Y(forecast[hover] ?? hovered.forecast) : null}
              slot={hovered}
              hour={hover}
            />
          )}
          {brushOn && (
            <div
              className={styles.brush}
              style={{ left: `${Math.min(brush.a, brush.b) * 100}%`, width: `${Math.abs(brush.b - brush.a) * 100}%` }}
            />
          )}
          <div
            className={styles.capture}
            onPointerMove={onPointerMove}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerLeave={() => !brush && setHover(null)}
            onDoubleClick={() => setZoom(null)}
          />
        </div>
        <div className={styles.xAxis}>
          {xTicks.map((t) => (
            <span key={t.x} className={`${ui.axisLabel} ${styles.xLabel}`} style={{ left: t.x }}>
              {t.label}
            </span>
          ))}
        </div>
      </div>

      <div className={styles.foot}>
        <span>Drag across the chart to zoom in. Breaks in the forecast line are hours with no forecast.</span>
        {zoom && (
          <button type="button" className={ui.darkButton} onClick={() => setZoom(null)}>
            {dayLabel(zoom[0])} {clock(zoom[0])} – {dayLabel(zoom[1])} {clock(zoom[1])} · Reset zoom
          </button>
        )}
      </div>
    </div>
  )
}

function HoverDetails(props: { x: number; w: number; yActual: number; yForecast: number | null; slot: Slot; hour: number }) {
  const { x, w, yActual, yForecast, slot, hour } = props
  const lead = slot.publishTime ? hour - hourIndex(slot.publishTime) : null
  const published = slot.publishTime
    ? `Published ${dayLabel(hourIndex(slot.publishTime))} ${clock(hourIndex(slot.publishTime))}, ${lead!.toFixed(1)} h earlier`
    : 'No forecast published this far ahead'
  const err = slot.error
  return (
    <>
      <div className={styles.crosshair} style={{ left: x }} />
      <div className={styles.point} style={{ left: x, top: yActual, background: 'var(--forest)' }} />
      {yForecast != null && <div className={styles.point} style={{ left: x, top: yForecast, background: 'var(--lime-2)' }} />}
      <div
        className={`${ui.tooltip} ${styles.tip}`}
        style={{ left: x, transform: x > w * 0.62 ? 'translateX(calc(-100% - 14px))' : 'translateX(14px)' }}
      >
        <span className={styles.tipTime}>
          {weekdayLabel(hour)} {dayLabel(hour)} · {clock(hour)}
        </span>
        <div className={ui.tipRow}>
          <span className={`${ui.tipLabel} ${ui.legendItem}`}>
            <span className={styles.miniSwatch} style={{ background: 'var(--forest)' }} />
            Actual
          </span>
          <span className={styles.tipValue}>{gw(slot.actual)} GW</span>
        </div>
        <div className={ui.tipRow}>
          <span className={`${ui.tipLabel} ${ui.legendItem}`}>
            <span className={styles.miniSwatch} style={{ background: 'var(--lime-2)' }} />
            Forecast
          </span>
          <span className={styles.tipValue}>{slot.forecast != null ? `${gw(slot.forecast)} GW` : 'No forecast'}</span>
        </div>
        <div className={`${ui.tipRow} ${styles.tipError}`}>
          <span className={ui.tipLabel}>Error</span>
          <span
            className={styles.tipValue}
            style={{ fontWeight: 600, color: err == null ? 'var(--ink-3)' : err >= 0 ? 'var(--forest)' : 'var(--lime-ink)' }}
          >
            {err == null ? '—' : signedGw(err)}
          </span>
        </div>
        <span className={styles.tipNote}>{published}</span>
      </div>
    </>
  )
}
