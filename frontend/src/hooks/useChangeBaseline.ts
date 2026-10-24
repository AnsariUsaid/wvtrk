import { useEffect, useRef, useState } from 'react'

const BURST_MS = 1500

/**
 * Remember the result from before the user started changing settings, so cards can show
 * "▲ 120 MW" style deltas. A burst of changes (e.g. dragging the slider) keeps one baseline.
 */
export function useChangeBaseline<T>(settingsKey: string, latest: T | null): T | null {
  const [baseline, setBaseline] = useState<T | null>(null)
  const lastKey = useRef(settingsKey)
  const latestRef = useRef(latest)
  const burstUntil = useRef(0)

  useEffect(() => {
    if (settingsKey === lastKey.current) return
    lastKey.current = settingsKey
    const now = Date.now()
    if (now > burstUntil.current && latestRef.current != null) setBaseline(latestRef.current)
    burstUntil.current = now + BURST_MS
  }, [settingsKey])

  useEffect(() => {
    latestRef.current = latest
  }, [latest])

  return baseline
}
