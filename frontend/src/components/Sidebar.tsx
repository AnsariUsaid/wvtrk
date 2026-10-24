import type { ReactNode } from 'react'

import styles from './Sidebar.module.css'

export const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'forecast', label: 'Forecast vs actual' },
  { id: 'patterns', label: 'Error patterns' },
  { id: 'insights', label: 'Insights' },
  { id: 'about', label: 'How it works' },
] as const

export type SectionId = (typeof SECTIONS)[number]['id']

export function Brand() {
  return (
    <div className={styles.brand}>
      <div className={styles.logo} aria-hidden="true">
        <div className={styles.logoDot} />
      </div>
      <span className={styles.name}>Windsight</span>
    </div>
  )
}

interface Props {
  active: SectionId
  onNavigate: (id: SectionId) => void
  children: ReactNode // the settings panel
}

export default function Sidebar({ active, onNavigate, children }: Props) {
  return (
    <aside className={styles.sidebar}>
      <Brand />
      <nav className={styles.nav} aria-label="Sections">
        <span className={styles.navTitle}>Main menu</span>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={styles.navItem}
            aria-current={active === s.id ? 'true' : undefined}
            onClick={() => onNavigate(s.id)}
          >
            <span className={styles.navDot} />
            {s.label}
          </button>
        ))}
      </nav>
      {children}
    </aside>
  )
}
