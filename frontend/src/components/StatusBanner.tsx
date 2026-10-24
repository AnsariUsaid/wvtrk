import styles from './StatusBanner.module.css'
import ui from './ui.module.css'

/** Shown when the API call fails. Keeps the last good figures on screen underneath. */
export default function StatusBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className={styles.banner}>
      <span className={styles.icon} aria-hidden="true">
        !
      </span>
      <span className={styles.text}>
        {message} The figures below may be out of date.
      </span>
      <button type="button" className={ui.darkButton} onClick={onRetry}>
        Retry
      </button>
    </div>
  )
}
