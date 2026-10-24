import { useEffect, useState } from 'react'

import { prefersReducedMotion } from '../lib/motion'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}

/** True once the element with this id has scrolled up past `offset` px from the top. */
export function useScrolledPast(id: string, offset: number): boolean {
  const [past, setPast] = useState(false)
  useEffect(() => {
    const onScroll = () => {
      const el = document.getElementById(id)
      setPast(!!el && el.getBoundingClientRect().bottom < offset)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [id, offset])
  return past
}

/** Fade sections in as they scroll into view (those below the fold on first load). */
export function useRevealOnScroll(selector: string, hiddenClass: string) {
  useEffect(() => {
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) return
    const els = [...document.querySelectorAll<HTMLElement>(selector)].filter(
      (el) => el.getBoundingClientRect().top > window.innerHeight,
    )
    els.forEach((el) => el.classList.add(hiddenClass))
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.remove(hiddenClass)
            io.unobserve(e.target)
          }
        }),
      { threshold: 0.06 },
    )
    els.forEach((el) => io.observe(el))
    // Never leave anything hidden for long (e.g. if the observer misses).
    const fallback = setTimeout(() => els.forEach((el) => el.classList.remove(hiddenClass)), 2500)
    return () => {
      io.disconnect()
      clearTimeout(fallback)
    }
  }, [selector, hiddenClass])
}
