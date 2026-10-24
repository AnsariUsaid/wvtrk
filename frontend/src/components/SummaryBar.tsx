import type { Delta } from '../lib/analysis'
import styles from './SummaryBar.module.css'
import ui from './ui.module.css'

export interface SummaryItem {
  label: string
  value: string
  delta: Delta | null
}

/** Compact metrics that stick to the top once the overview cards scroll away. */
export default function SummaryBar({ id, items, pulse }: { id: string; items: SummaryItem[]; pulse: boolean }) {
  return (
    <div id={id} className={styles.bar}>
      <div className={styles.row}>
        {items.map((it) => (
          <div key={it.label} className={`${styles.item} ${pulse ? styles.pulse : ''}`}>
            <span className={styles.label}>{it.label}</span>
            <span className={styles.value}>{it.value}</span>
            {it.delta && (
              <span className={`${ui.badge} ${it.delta.better ? ui.badgeBetter : ui.badgeWorse} ${styles.delta}`}>
                {it.delta.text}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
