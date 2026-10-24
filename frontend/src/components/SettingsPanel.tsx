import { modeDescription, rangeLabel } from '../lib/format'
import type { Mode, Preset, Settings } from '../types'
import Segmented, { type SegmentOption } from './Segmented'
import styles from './SettingsPanel.module.css'
import ui from './ui.module.css'

const PRESETS: Record<Exclude<Preset, 'custom'>, [number, number]> = {
  month: [1, 31],
  w1: [1, 7],
  w2: [8, 14],
  w3: [15, 21],
  w4: [22, 28],
}

const PRESET_OPTIONS: SegmentOption<Preset>[] = [
  { value: 'month', label: 'Whole month', span: 2 },
  { value: 'custom', label: 'Custom', span: 2 },
  { value: 'w1', label: 'Week 1' },
  { value: 'w2', label: 'Week 2' },
  { value: 'w3', label: 'Week 3' },
  { value: 'w4', label: 'Week 4' },
]

const MODE_OPTIONS: SegmentOption<Mode>[] = [
  { value: 'horizon', label: 'Hours ahead', title: 'Forecast made at least X hours before' },
  { value: 'day_ahead', label: 'Day before', title: 'Forecast available at a set time the day before' },
]

const DECISION_TIMES = ['06:00', '09:00', '12:00', '15:00']

const isoDay = (day: number) => `2026-01-${String(day).padStart(2, '0')}`
const dayFromInput = (value: string) => {
  const d = Number.parseInt(value.slice(8), 10)
  return d >= 1 && d <= 31 ? d : null
}

interface Props {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  onReset: () => void
  isDefault: boolean
  warning: string | null
  flashWarning: boolean
}

export default function SettingsPanel({ settings: s, onChange, onReset, isDefault, warning, flashWarning }: Props) {
  const pickPreset = (preset: Preset) => {
    if (preset === 'custom') onChange({ preset })
    else onChange({ preset, start: PRESETS[preset][0], end: PRESETS[preset][1] })
  }

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.heading}>Forecast settings</span>
        <button type="button" className={styles.reset} style={{ opacity: isDefault ? 0.45 : 1 }} onClick={onReset}>
          Reset
        </button>
      </div>

      <div className={styles.field}>
        <div className={styles.fieldHead}>
          <span className={ui.eyebrow}>Period</span>
          <span className={styles.value}>{rangeLabel(s.start, s.end)}</span>
        </div>
        <Segmented label="Period" options={PRESET_OPTIONS} value={s.preset} onChange={pickPreset} columns={4} />
        {s.preset === 'custom' && (
          <div className={styles.dates}>
            <input
              type="date"
              aria-label="First day"
              min="2026-01-01"
              max="2026-01-31"
              value={isoDay(s.start)}
              onChange={(e) => {
                const d = dayFromInput(e.target.value)
                if (d) onChange({ start: d, end: Math.max(d, s.end) })
              }}
            />
            <input
              type="date"
              aria-label="Last day"
              min="2026-01-01"
              max="2026-01-31"
              value={isoDay(s.end)}
              onChange={(e) => {
                const d = dayFromInput(e.target.value)
                if (d) onChange({ end: d, start: Math.min(d, s.start) })
              }}
            />
          </div>
        )}
      </div>

      <div className={styles.field}>
        <span className={ui.eyebrow}>Forecast timing</span>
        <Segmented
          label="Forecast timing"
          options={MODE_OPTIONS}
          value={s.mode}
          onChange={(mode) => onChange({ mode })}
          columns={2}
        />
      </div>

      {s.mode === 'horizon' ? (
        <div className={styles.box}>
          <div className={styles.fieldHead}>
            <label htmlFor="horizon" className={styles.boxLabel}>
              Hours ahead
            </label>
            <span className={styles.big}>
              {s.horizon}
              <span className={styles.unit}> h</span>
            </span>
          </div>
          <input
            id="horizon"
            type="range"
            min={0}
            max={48}
            step={1}
            value={s.horizon}
            onChange={(e) => onChange({ horizon: Number(e.target.value) })}
          />
          <div className={styles.ticks} aria-hidden="true">
            {[0, 12, 24, 36, 48].map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        </div>
      ) : (
        <div className={styles.box}>
          <span className={styles.boxLabel}>Decision time, day before</span>
          <Segmented
            label="Decision time"
            options={DECISION_TIMES.map((t) => ({ value: t, label: t }))}
            value={DECISION_TIMES.includes(s.decision) ? s.decision : null}
            onChange={(decision) => onChange({ decision })}
            columns={4}
            mono
          />
          <input
            type="time"
            aria-label="Decision time"
            className={styles.time}
            value={s.decision}
            onChange={(e) => e.target.value && onChange({ decision: e.target.value })}
          />
        </div>
      )}

      <span className={styles.desc}>{modeDescription(s)}</span>

      {warning && (
        <div id="coverage" role="status" className={`${styles.warning} ${flashWarning ? styles.flash : ''}`}>
          <span className={styles.warnIcon} aria-hidden="true">
            !
          </span>
          <span>{warning}</span>
        </div>
      )}
    </div>
  )
}
