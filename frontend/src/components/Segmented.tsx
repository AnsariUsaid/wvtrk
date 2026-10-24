import styles from './Segmented.module.css'

export interface SegmentOption<T extends string> {
  value: T
  label: string
  span?: number // grid columns this button takes
  title?: string
}

interface Props<T extends string> {
  label: string
  options: SegmentOption<T>[]
  value: T | null
  onChange: (value: T) => void
  columns: number
  mono?: boolean
}

/** A row of toggle buttons where one is selected. */
export default function Segmented<T extends string>({ label, options, value, onChange, columns, mono }: Props<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={styles.group}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          aria-pressed={o.value === value}
          className={`${styles.option} ${mono ? styles.mono : ''}`}
          style={o.span ? { gridColumn: `span ${o.span}` } : undefined}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
