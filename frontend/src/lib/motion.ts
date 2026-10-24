export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Stagger a bar's grow-in (bottom, height) but not its hover fade (opacity); order matches `.bar` in ErrorCharts.module.css. */
export const barDelay = (seconds: number) => `${seconds}s, ${seconds}s, 0s`
