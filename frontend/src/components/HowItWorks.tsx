import styles from './HowItWorks.module.css'
import ui from './ui.module.css'

const Code = ({ children }: { children: string }) => <span className={styles.code}>{children}</span>

export default function HowItWorks() {
  const steps = [
    {
      title: 'Data',
      body: (
        <>
          Actual output comes from Elexon <Code>FUELHH</Code> (every 30 minutes). Forecasts come from Elexon{' '}
          <Code>WINDFOR</Code>.
        </>
      ),
    },
    { title: 'Choosing a forecast', body: <>For each hour we use the latest forecast published before your cutoff.</> },
    {
      title: 'Assumptions',
      body: (
        <>
          Forecasts are hourly, so only on-the-hour values are compared. Times are UK time, which is the same as UTC in
          January.
        </>
      ),
    },
  ]
  return (
    <>
      <h2 className={ui.title}>About / how it works</h2>
      <div className={styles.steps}>
        {steps.map((s, i) => (
          <div key={s.title} className={styles.step}>
            <span className={styles.number}>{String(i + 1).padStart(2, '0')}</span>
            <span className={styles.stepTitle}>{s.title}</span>
            <p className={styles.body}>{s.body}</p>
          </div>
        ))}
      </div>
    </>
  )
}
