import type { ReactNode } from 'react'

import styles from './Sidebar.module.css'

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
  children: ReactNode // the settings panel
}

export default function Sidebar({ children }: Props) {
  return (
    <aside className={styles.sidebar}>
      <Brand />
      {children}
    </aside>
  )
}
