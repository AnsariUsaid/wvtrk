import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'

import { ApiError, postChat } from '../api'
import type { ChatMessage, Settings } from '../types'
import styles from './ChatWidget.module.css'

const SUGGESTIONS = [
  'How accurate was the forecast for this period?',
  'Which day had the worst forecast?',
  'Is buying at 06:00 or 12:00 the day before more accurate?',
]

/** Round button in the bottom-right corner that opens a chat panel over the left of the dashboard. */
export default function ChatWidget({ settings }: { settings: Settings }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const pending = useRef<AbortController>(undefined)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending, error])

  useEffect(() => () => pending.current?.abort(), [])

  const send = async (text: string) => {
    const content = text.trim()
    if (!content || sending) return
    const next: ChatMessage[] = [...messages, { role: 'user', content }]
    setMessages(next)
    setDraft('')
    setError(null)
    setSending(true)
    pending.current = new AbortController()
    try {
      const { reply } = await postChat(next, settings, pending.current.signal)
      setMessages([...next, { role: 'assistant', content: reply }])
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    send(draft)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(draft)
    }
  }

  return (
    <>
      {open && (
        <section
          className={styles.panel}
          role="dialog"
          aria-label="Ask Windsight"
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        >
          <header className={styles.head}>
            <div className={styles.titleBlock}>
              <span className={styles.title}>Ask Windsight</span>
              <span className={styles.sub}>Answers from the January 2026 data</span>
            </div>
            <button type="button" className={styles.close} aria-label="Close chat" onClick={() => setOpen(false)}>
              ×
            </button>
          </header>

          <div ref={listRef} className={styles.list} aria-live="polite">
            {messages.length === 0 && (
              <div className={styles.empty}>
                <p>Ask about forecast accuracy, the worst days or hours, or how timing changes the error.</p>
                {SUGGESTIONS.map((q) => (
                  <button key={q} type="button" className={styles.suggestion} onClick={() => send(q)}>
                    {q}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`${styles.bubble} ${m.role === 'user' ? styles.user : styles.bot}`}>
                {m.content}
              </div>
            ))}
            {sending && (
              <div className={`${styles.bubble} ${styles.bot} ${styles.typing}`} aria-label="Thinking">
                <span />
                <span />
                <span />
              </div>
            )}
            {error && (
              <div role="alert" className={styles.error}>
                {error}
              </div>
            )}
          </div>

          <form className={styles.form} onSubmit={onSubmit}>
            <textarea
              ref={inputRef}
              rows={1}
              maxLength={2000}
              placeholder="Ask a question…"
              aria-label="Your question"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <button type="submit" className={styles.send} disabled={sending || !draft.trim()} aria-label="Send">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M4 12h14M12 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        className={styles.fab}
        aria-label={open ? 'Close chat' : 'Open chat'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? (
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path
              d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17A2.5 2.5 0 0 1 4 14.5z"
              fill="currentColor"
            />
          </svg>
        )}
      </button>
    </>
  )
}
