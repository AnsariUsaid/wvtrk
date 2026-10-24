import { useCallback, useEffect, useState } from 'react'

import { getDashboard, type DashboardData } from '../api'
import type { Settings } from '../types'

const DEBOUNCE_MS = 120

interface State {
  data: DashboardData | null // last successful result, kept while the next one loads
  loading: boolean
  error: string | null
}

/** Load generation, metrics and error profile for the current settings. */
export function useDashboardData(settings: Settings) {
  const [state, setState] = useState<State>({ data: null, loading: true, error: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setState((s) => ({ ...s, loading: true }))
    const timer = setTimeout(() => {
      getDashboard(settings, controller.signal)
        .then((data) => setState({ data, loading: false, error: null }))
        .catch((err: Error) => {
          if (err.name === 'AbortError') return
          setState((s) => ({ ...s, loading: false, error: err.message }))
        })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [settings, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { ...state, retry }
}
