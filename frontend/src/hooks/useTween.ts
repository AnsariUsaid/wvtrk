import { useEffect, useRef, useState } from 'react'

import { prefersReducedMotion } from '../lib/motion'

type Values = (number | null)[]

/**
 * Animate a list of numbers from their previous values to new ones (ease-out cubic).
 * Nulls are not animated: they appear/disappear immediately.
 */
export function useTween(target: Values, duration: number, from?: Values): Values {
  const [shown, setShown] = useState<Values>(() => from ?? target)
  const shownRef = useRef(shown)
  shownRef.current = shown

  useEffect(() => {
    const start = shownRef.current
    if (prefersReducedMotion() || duration <= 0) {
      setShown(target)
      return
    }
    const t0 = performance.now()
    let raf = 0
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / duration)
      const e = 1 - Math.pow(1 - k, 3)
      setShown(
        target.map((v, i) => {
          const a = start[i]
          return v == null || a == null ? v : a + (v - a) * e
        }),
      )
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    // Background tabs pause animation frames; make sure we still land on the final values.
    const fallback = setTimeout(() => {
      cancelAnimationFrame(raf)
      setShown(target)
    }, duration + 150)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(fallback)
    }
    // target is compared by identity: callers memoise it.
  }, [target, duration])

  return shown
}
