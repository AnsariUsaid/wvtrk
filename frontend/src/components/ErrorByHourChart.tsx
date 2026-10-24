import { useState } from 'react'

import { clock, gw, signedGw } from '../lib/format'
import type { HourRow } from '../types'
import styles from './ErrorCharts.module.css'
import ui from './ui.module.css'

interface Props {
  profile: HourRow[] // 24 rows
  ready: boolean // false keeps bars flat until data has loaded (for the grow-in animation)
}

/** Mean error for each hour of the day (bars) and average miss size (dots). */
export default function ErrorByHourChart({ profile, ready }: Props) {
  const [hoverHour, setHoverHour] = useState<number | null>(null)

  let top = Math.max(0, ...profile.map((p) => Math.max(p.meanError, p.mae)))
  let bottom = Math.min(0, ...profile.map((p) => p.meanError))
  top = Math.ceil(top / 1000) * 1000 || 1000
  bottom = Math.floor(bottom / 1000) * 1000
  const range = top - bottom
  const zero = (-bottom / range) * 100
  const pct = (v: number) => (v / range) * 100

  const grid: number[] = []
  for (let g = bottom; g <= top; g += 1000) grid.push(g)
  const tip = hoverHour != null ? profile[hoverHour] : null

  return (
    <div className={ui.card} style={{ flex: '1 1 420px' }}>
      <div className={ui.cardHead}>
        <div className={ui.titleBlock}>
          <h2 className={ui.title}>Error by hour of day</h2>
          <span className={ui.sub}>Average error for each hour, UK time</span>
        </div>
        <div className={ui.legend} style={{ gap: 12, fontSize: 12 }}>
          <span className={ui.legendItem}>
            <span className={ui.swatch} style={{ background: 'var(--forest)' }} />
            Too high
          </span>
          <span className={ui.legendItem}>
            <span className={ui.swatch} style={{ background: 'var(--lime)' }} />
            Too low
          </span>
          <span className={ui.legendItem} title="MAE">
            <span className={styles.dotKey} />
            Average size
          </span>
        </div>
      </div>

      <div className={styles.frame} style={{ paddingLeft: 44 }}>
        <div className={styles.plot}>
          {grid.map((g) => (
            <div key={g}>
              <div className={styles.gridLine} style={{ bottom: `${pct(g - bottom)}%` }} />
              <span className={`${ui.axisLabel} ${styles.yLabel}`} style={{ bottom: `${pct(g - bottom)}%` }}>
                {g === 0 ? '0' : `${g > 0 ? '+' : '−'}${Math.abs(g / 1000)} GW`}
              </span>
            </div>
          ))}
          <div className={styles.zeroLine} style={{ bottom: `${zero}%` }} />
          <div className={styles.bars} style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
            {profile.map((p) => {
              const height = ready ? pct(Math.abs(p.meanError)) : 0
              const bottomAt = ready && p.meanError < 0 ? zero - height : zero
              return (
                <div
                  key={p.hour}
                  className={styles.barSlot}
                  onMouseEnter={() => setHoverHour(p.hour)}
                  onMouseLeave={() => setHoverHour(null)}
                >
                  <div
                    className={styles.bar}
                    style={{
                      bottom: `${bottomAt}%`,
                      height: `${height}%`,
                      background: p.meanError >= 0 ? 'var(--forest)' : 'var(--lime)',
                      opacity: hoverHour == null || hoverHour === p.hour ? 1 : 0.35,
                      borderRadius: 5,
                      transitionDelay: `${p.hour * 0.02}s`,
                    }}
                  />
                  <div
                    className={styles.maeDot}
                    style={{
                      bottom: `${ready ? zero + pct(p.mae) : zero}%`,
                      opacity: ready && p.slots ? 1 : 0,
                      transitionDelay: `${p.hour * 0.02}s`,
                    }}
                  />
                </div>
              )
            })}
          </div>
          {tip && (
            <div
              className={ui.tooltip}
              style={{
                top: -6,
                width: 196,
                left: `${((tip.hour + 0.5) / 24) * 100}%`,
                transform: tip.hour > 14 ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)',
              }}
            >
              <span style={{ fontWeight: 600 }}>
                {clock(tip.hour)}–{clock(tip.hour + 1)}
              </span>
              <div className={ui.tipRow}>
                <span className={ui.tipLabel}>Average error</span>
                <span className={ui.mono}>{tip.slots ? signedGw(tip.meanError) : '—'}</span>
              </div>
              <div className={ui.tipRow}>
                <span className={ui.tipLabel}>Average size</span>
                <span className={ui.mono}>{tip.slots ? `${gw(tip.mae)} GW` : '—'}</span>
              </div>
              <div className={ui.tipRow}>
                <span className={ui.tipLabel}>Hours used</span>
                <span className={ui.mono}>{tip.slots}</span>
              </div>
            </div>
          )}
        </div>
        <div className={styles.hourLabels}>
          {profile.map((p) => (
            <span key={p.hour} className={ui.axisLabel} style={{ textAlign: 'center' }}>
              {p.hour % 3 === 0 ? String(p.hour).padStart(2, '0') : ''}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
