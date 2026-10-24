import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { getHealth, queryFor } from './api'
import styles from './App.module.css'
import ErrorByHourChart from './components/ErrorByHourChart'
import ErrorHistogram from './components/ErrorHistogram'
import ForecastChart from './components/ForecastChart'
import Header from './components/Header'
import HowItWorks from './components/HowItWorks'
import InsightsPanel from './components/InsightsPanel'
import OverviewCards, { type MetricDeltas, type ShownMetrics } from './components/OverviewCards'
import SettingsPanel from './components/SettingsPanel'
import Sidebar, { Brand } from './components/Sidebar'
import StatusBanner from './components/StatusBanner'
import SummaryBar from './components/SummaryBar'
import ui from './components/ui.module.css'
import { useChangeBaseline } from './hooks/useChangeBaseline'
import { useDashboardData } from './hooks/useDashboardData'
import { useMediaQuery, useRevealOnScroll, useScrolledPast } from './hooks/useLayout'
import { useTween } from './hooks/useTween'
import { coverageWarning, delta, fullDayProfile, histogram, insights, overForecastPct } from './lib/analysis'
import { mw, rangeLabel, selectionLabel, signedMw } from './lib/format'
import { DEFAULT_SETTINGS, type Settings } from './types'

const ZEROS = [0, 0, 0, 0, 0]

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const { data, loading, error, retry } = useDashboardData(settings)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [pulse, setPulse] = useState(false)
  const [flashWarning, setFlashWarning] = useState(false)
  const pulseTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const narrow = useMediaQuery('(max-width: 899px)')
  const scrolled = useScrolledPast('overview', 170)
  useRevealOnScroll('[data-reveal]', ui.hidden)

  useEffect(() => {
    getHealth()
      .then((h) => setFetchedAt(h.fetchedAt))
      .catch(() => setFetchedAt(null))
  }, [])

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }))
    setPulse(true)
    clearTimeout(pulseTimer.current)
    pulseTimer.current = setTimeout(() => setPulse(false), 900)
  }, [])
  const reset = () => update(DEFAULT_SETTINGS)
  const isDefault = queryFor(settings) === queryFor(DEFAULT_SETTINGS) && settings.preset === 'month'

  // ---------- Derived figures ----------
  const metrics = data?.metrics ?? null
  const coverage = metrics?.coverage
  const total = coverage?.slotsTotal ?? (settings.end - settings.start + 1) * 24
  const partial = !!coverage?.partialCoverage

  const target = useMemo(
    () => (metrics ? [metrics.mae ?? 0, metrics.bias ?? 0, metrics.nmae ?? 0, metrics.rmse ?? 0, coverage!.slotsUsed] : ZEROS),
    [metrics, coverage],
  )
  const [mae, bias, nmae, rmse, used] = useTween(target, 800, ZEROS) as number[]
  const shown: ShownMetrics | null = metrics ? { mae, bias, nmae, rmse, used } : null

  const baseline = useChangeBaseline(queryFor(settings), metrics)
  const deltas: MetricDeltas = {}
  if (baseline && metrics && baseline !== metrics && baseline.mae != null && metrics.mae != null) {
    deltas.mae = delta(metrics.mae, baseline.mae, { unit: ' MW' })
    deltas.bias = delta(metrics.bias!, baseline.bias!, { unit: ' MW', compareSize: true })
    deltas.nmae = delta(metrics.nmae!, baseline.nmae!, { unit: ' pts', decimals: 1 })
    deltas.rmse = delta(metrics.rmse!, baseline.rmse!, { unit: ' MW' })
    deltas.used = delta(metrics.coverage.slotsUsed, baseline.coverage.slotsUsed, { unit: ' h', higherIsBetter: true })
  }
  const vsLabel = baseline && Object.values(deltas).some(Boolean) ? selectionLabel(baseline.selection) : null

  const derived = useMemo(() => {
    if (!data) return null
    const slots = data.generation.slots
    const errors = slots.flatMap((s) => (s.error == null ? [] : [s.error]))
    const profile = fullDayProfile(data.profile.hours)
    const overPct = overForecastPct(errors)
    const sel = data.metrics.selection
    const isMonth = sel.start.endsWith('-01') && sel.end.endsWith('-31')
    const range = rangeLabel(Number(sel.start.slice(8)), Number(sel.end.slice(8)))
    const cov = data.metrics.coverage
    return {
      bins: histogram(errors),
      overPct,
      profile,
      warning: cov.partialCoverage ? coverageWarning(cov.slotsUsed, cov.slotsTotal, slots) : null,
      insights:
        data.metrics.bias == null
          ? null
          : insights({
              rangeText: isMonth ? 'the whole of January' : range,
              bias: data.metrics.bias,
              nmae: data.metrics.nmae ?? 0,
              profile,
              overPct,
            }),
      subtitle: `${range} 2026 · GW`,
    }
  }, [data])

  const flashCoverage = () => {
    document.getElementById('coverage')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setFlashWarning(true)
    setTimeout(() => setFlashWarning(false), 900)
  }

  const settingsPanel = (
    <SettingsPanel
      settings={settings}
      onChange={update}
      onReset={reset}
      isDefault={isDefault}
      warning={derived?.warning ?? null}
      flashWarning={flashWarning}
    />
  )

  return (
    <div className={styles.layout}>
      {!narrow && (
        <Sidebar>
          {settingsPanel}
        </Sidebar>
      )}

      <div className={styles.content}>
        {narrow && (
          <div className={styles.narrowBrand}>
            <Brand />
          </div>
        )}
        <Header fetchedAt={fetchedAt} loading={loading} />

        {scrolled && !narrow && shown && (
          <SummaryBar
            id="summary-bar"
            pulse={pulse}
            items={[
              { label: 'Average error', value: `${mw(shown.mae)} MW`, delta: deltas.mae ?? null },
              { label: 'Bias', value: `${signedMw(shown.bias)} MW`, delta: deltas.bias ?? null },
              { label: 'Error %', value: `${shown.nmae.toFixed(1)}%`, delta: deltas.nmae ?? null },
              { label: 'Hours', value: `${mw(shown.used)} / ${mw(total)}`, delta: deltas.used ?? null },
            ]}
          />
        )}

        {narrow && <div className={styles.narrowSettings}>{settingsPanel}</div>}

        <main className={`${styles.main} ${loading && data ? styles.updating : ''}`} aria-busy={loading}>
          {error && <StatusBanner message={error} onRetry={retry} />}

          <section id="overview" className={styles.row} data-reveal>
            <OverviewCards
              metrics={shown}
              total={total}
              partial={partial}
              biasSign={Math.sign(metrics?.bias ?? 0) || 1}
              deltas={deltas}
              vsLabel={vsLabel}
              pulse={pulse}
              onHoursClick={flashCoverage}
            />
          </section>

          <section id="forecast" className={styles.row} data-reveal>
            <ForecastChart
              actuals={data?.generation.actuals ?? []}
              slots={data?.generation.slots ?? []}
              subtitle={derived?.subtitle ?? '…'}
              height={narrow ? 250 : 320}
            />
          </section>

          <section id="patterns" className={styles.row} data-reveal>
            <ErrorByHourChart profile={derived?.profile ?? fullDayProfile([])} ready={!!derived} />
            <ErrorHistogram bins={derived?.bins ?? histogram([])} overPct={derived?.overPct ?? 0} ready={!!derived} />
          </section>

          <section id="insights" className={styles.row} data-reveal>
            <InsightsPanel insights={derived?.insights ?? null} />
          </section>

          <section id="about" className={`${ui.card} ${styles.about}`} data-reveal>
            <HowItWorks />
          </section>
        </main>
      </div>
    </div>
  )
}
