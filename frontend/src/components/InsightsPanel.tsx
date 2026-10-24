import type { Insights } from '../lib/analysis'
import styles from './InsightsPanel.module.css'
import ui from './ui.module.css'

const GLOSSARY = [
  { name: 'Average error', tag: 'MAE', text: 'The typical size of a miss, ignoring direction.' },
  { name: 'Bias', tag: null, text: 'Forecast minus actual, averaged. Positive means the forecast was too high.' },
  { name: 'Error %', tag: 'NMAE', text: 'Average error divided by average wind output.' },
  { name: 'Big-miss error', tag: 'RMSE', text: 'Like average error, but large misses count for more.' },
]

export default function InsightsPanel({ insights }: { insights: Insights | null }) {
  return (
    <>
      <div className={styles.story}>
        <div className={styles.ring} aria-hidden="true" />
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowDot} />
          What this shows
        </span>
        <p className={styles.headline}>{insights?.headline ?? 'Loading the latest figures…'}</p>
        {insights && <p className={styles.detail}>{insights.detail}</p>}
        <p className={styles.causes}>
          Likely causes of the over-forecast: wind farms being told to switch off when the grid is full (curtailment),
          and the two datasets not covering exactly the same set of wind farms.
        </p>
      </div>
      <div className={styles.glossary}>
        <span className={`${ui.title} ${styles.glossaryTitle}`}>What the numbers mean</span>
        {GLOSSARY.map((g) => (
          <div key={g.name} className={styles.term}>
            <span className={styles.termName}>
              {g.name} {g.tag && <span className={styles.termTag}>{g.tag}</span>}
            </span>
            <span className={styles.termText}>{g.text}</span>
          </div>
        ))}
      </div>
    </>
  )
}
