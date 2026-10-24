import { ukDateTime } from '../lib/format'
import styles from './Header.module.css'

interface Props {
  fetchedAt: string | null
  loading: boolean
}

export default function Header({ fetchedAt, loading }: Props) {
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        <h1 className={styles.title}>January 2026 purchase decisions</h1>
        <span className={styles.sub}>
          How far the national wind forecast was from actual output, depending on how early the purchase decision had
          to be made.
        </span>
      </div>
      <div className={styles.badge} title="Elexon Insights API: FUELHH (actuals) and WINDFOR (forecasts)">
        <span className={`${styles.dot} ${loading ? styles.dotLoading : ''}`} />
        <span className={styles.source}>Elexon</span>
        <span>· fetched {fetchedAt ? ukDateTime(fetchedAt) : '…'}</span>
      </div>
    </header>
  )
}
