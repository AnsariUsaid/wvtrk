import type { ReactNode } from 'react'

import type { Delta } from '../lib/analysis'
import { mw, signedMw } from '../lib/format'
import styles from './OverviewCards.module.css'
import ui from './ui.module.css'

export interface ShownMetrics {
  mae: number
  bias: number
  nmae: number
  rmse: number
  used: number
}

export type MetricDeltas = Partial<Record<keyof ShownMetrics, Delta | null>>

interface Props {
  metrics: ShownMetrics | null // null until the first load
  total: number
  partial: boolean
  biasSign: number // sign of the latest (not animated) bias
  deltas: MetricDeltas
  vsLabel: string | null
  pulse: boolean
  onHoursClick: () => void
}

function DeltaBadge({ delta, onHero }: { delta?: Delta | null; onHero?: boolean }) {
  if (!delta) return null
  const tone = onHero ? styles.heroBadge : delta.better ? ui.badgeBetter : ui.badgeWorse
  return <span className={`${ui.badge} ${tone} ${styles.delta}`}>{delta.text}</span>
}

function Tile(props: {
  icon: string
  label: string
  value: string
  unit: string
  note: string
  title: string
  delta?: Delta | null
  children?: ReactNode
  onClick?: () => void
}) {
  return (
    <div className={styles.tile} title={props.title} onClick={props.onClick} style={{ cursor: props.onClick ? 'pointer' : undefined }}>
      <div className={styles.tileHead}>
        <span className={styles.icon} aria-hidden="true">
          {props.icon}
        </span>
        <span className={styles.tileLabel}>{props.label}</span>
        <DeltaBadge delta={props.delta} />
      </div>
      <div className={styles.valueRow}>
        <span className={styles.value}>{props.value}</span>
        <span className={styles.unit}>{props.unit}</span>
      </div>
      {props.children}
      <span className={styles.note}>{props.note}</span>
    </div>
  )
}

export default function OverviewCards({ metrics: m, total, partial, biasSign, deltas, vsLabel, pulse, onHoursClick }: Props) {
  const dash = '—'
  const coverage = m && total ? m.used / total : 0
  return (
    <>
      <div className={`${styles.hero} ${pulse ? styles.heroPulse : ''}`} title="MAE: average size of the miss">
        <div className={styles.ring} aria-hidden="true" />
        <div className={styles.blob} aria-hidden="true" />
        <div className={styles.heroHead}>
          <span className={styles.heroLabel}>Average error</span>
          <span className={styles.heroTag}>MAE</span>
        </div>
        <div className={styles.heroBody}>
          <div className={styles.valueRow}>
            <span className={styles.heroValue}>{m ? mw(m.mae) : dash}</span>
            <span className={styles.heroUnit}>MW</span>
          </div>
          <div className={styles.heroFoot}>
            <span>How far off the forecast was, on average</span>
            <DeltaBadge delta={deltas.mae} onHero />
          </div>
        </div>
      </div>

      <div className={`${styles.accuracy} ${pulse ? styles.pulse : ''}`}>
        <div className={styles.accHead}>
          <div className={ui.titleBlock}>
            <span className={ui.title}>Forecast accuracy</span>
            {vsLabel && <span className={styles.vs}>Changes shown vs {vsLabel}</span>}
          </div>
          {m && (
            <span className={`${styles.direction} ${biasSign >= 0 ? styles.tooHigh : styles.tooLow}`}>
              {biasSign >= 0 ? 'Forecast too high' : 'Forecast too low'}
            </span>
          )}
        </div>
        <div className={styles.tiles}>
          <Tile
            icon="±"
            label="Bias"
            value={m ? signedMw(m.bias) : dash}
            unit="MW"
            note="Which way the forecast tends to miss"
            title="Bias: average signed error (forecast − actual)"
            delta={deltas.bias}
          />
          <Tile
            icon="%"
            label="Error %"
            value={m ? m.nmae.toFixed(1) : dash}
            unit="%"
            note="Share of average wind output · NMAE"
            title="NMAE: average error as % of average wind output"
            delta={deltas.nmae}
          />
          <Tile
            icon="↑"
            label="Big-miss error"
            value={m ? mw(m.rmse) : dash}
            unit="MW"
            note="Large misses count more · RMSE"
            title="RMSE: counts large misses more heavily"
            delta={deltas.rmse}
          />
          <Tile
            icon="h"
            label="Hours compared"
            value={m ? mw(m.used) : dash}
            unit={`/ ${mw(total)}`}
            note={partial ? 'Some hours missing · see settings' : 'Every hour has a forecast'}
            title="Hours with a forecast / hours in the period"
            delta={deltas.used}
            onClick={partial ? onHoursClick : undefined}
          >
            <div className={styles.coverage} style={{ background: partial ? 'var(--warn-line)' : '#e3e7df' }}>
              <div className={styles.coverageFill} style={{ width: `${(coverage * 100).toFixed(1)}%` }} />
            </div>
          </Tile>
        </div>
      </div>
    </>
  )
}
