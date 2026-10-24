import { useState } from 'react'

import { BIN_COUNT, BIN_MIN_MW, BIN_MW } from '../lib/analysis'
import styles from './ErrorCharts.module.css'
import ui from './ui.module.css'

interface Props {
  bins: number[]
  overPct: number
  ready: boolean
}

const BIN_GW = BIN_MW / 1000
const MIN_GW = BIN_MIN_MW / 1000
const SPAN_GW = BIN_COUNT * BIN_GW
const ZERO_BIN = -MIN_GW / BIN_GW // index of the first over-forecast bin
const signed = (x: number) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(1)

/** Number of hours by size of miss, under-forecasts left of zero, over-forecasts right. */
export default function ErrorHistogram({ bins, overPct, ready }: Props) {
  const [hoverBin, setHoverBin] = useState<number | null>(null)
  const max = Math.max(1, ...bins)
  const zeroLeft = `${(ZERO_BIN / BIN_COUNT) * 100}%`

  let tipRange = ''
  if (hoverBin != null) {
    const lo = MIN_GW + hoverBin * BIN_GW
    const hi = lo + BIN_GW
    tipRange =
      hoverBin === 0
        ? `Below ${signed(hi)} GW`
        : hoverBin === BIN_COUNT - 1
          ? `Above ${signed(lo)} GW`
          : `${signed(lo)} to ${signed(hi)} GW`
  }

  return (
    <div className={ui.card} style={{ flex: '1 1 420px' }}>
      <div className={ui.cardHead}>
        <div className={ui.titleBlock}>
          <h2 className={ui.title}>Error distribution</h2>
          <span className={ui.sub}>Number of hours by size of miss, in 0.5 GW steps</span>
        </div>
        <div className={styles.overPill}>
          <span className={styles.overPct}>{overPct}%</span>
          <span>of hours over-forecast</span>
        </div>
      </div>

      <div className={styles.frame}>
        <div className={styles.plot}>
          <div className={styles.baseLine} />
          <div className={styles.bars} style={{ gridTemplateColumns: `repeat(${BIN_COUNT}, minmax(0, 1fr))` }}>
            {bins.map((n, k) => (
              <div key={k} className={styles.barSlot} onMouseEnter={() => setHoverBin(k)} onMouseLeave={() => setHoverBin(null)}>
                <div
                  className={styles.bar}
                  style={{
                    bottom: 0,
                    height: `${ready ? (n / max) * 100 : 0}%`,
                    background: k < ZERO_BIN ? 'var(--lime)' : 'var(--forest)',
                    opacity: hoverBin == null || hoverBin === k ? 1 : 0.35,
                    borderRadius: '5px 5px 0 0',
                    left: 0,
                    right: 0,
                    transitionDelay: `${k * 0.025}s`,
                  }}
                />
              </div>
            ))}
          </div>
          <div className={styles.zeroMark} style={{ left: zeroLeft }} />
          <span className={styles.zeroText} style={{ left: zeroLeft }}>
            Spot on
          </span>
          {hoverBin != null && (
            <div
              className={ui.tooltip}
              style={{
                top: 20,
                width: 178,
                gap: 5,
                left: `${((hoverBin + 0.5) / BIN_COUNT) * 100}%`,
                transform: hoverBin > 13 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)',
              }}
            >
              <span style={{ fontWeight: 600 }}>{tipRange}</span>
              <span className={ui.tipLabel}>
                {bins[hoverBin]} {bins[hoverBin] === 1 ? 'hour' : 'hours'}
              </span>
            </div>
          )}
        </div>
        <div className={styles.xAxis}>
          {[-4, -2, 0, 2, 4, 6].map((g) => (
            <span key={g} className={`${ui.axisLabel} ${styles.xLabel}`} style={{ left: `${((g - MIN_GW) / SPAN_GW) * 100}%` }}>
              {(g > 0 ? '+' : g < 0 ? '−' : '') + Math.abs(g) + (g ? ' GW' : '')}
            </span>
          ))}
        </div>
        <div className={styles.direction}>
          <span>← Forecast too low</span>
          <span>Forecast too high →</span>
        </div>
      </div>
    </div>
  )
}
