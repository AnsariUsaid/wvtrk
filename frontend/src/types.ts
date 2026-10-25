// Shapes of the backend API responses (see backend/app/main.py).

export type Mode = 'horizon' | 'day_ahead'

export interface Selection {
  start: string
  end: string
  mode: Mode
  horizon: number | null
  cutoff: string | null
}

export interface Coverage {
  slotsUsed: number
  slotsTotal: number
  partialCoverage: boolean
}

export interface Slot {
  startTime: string
  actual: number
  forecast: number | null
  publishTime: string | null
  error: number | null
}

export interface ActualPoint {
  startTime: string
  generation: number
}

export interface GenerationResponse {
  selection: Selection
  coverage: Coverage
  slots: Slot[]
  actuals: ActualPoint[]
}

export interface MetricsResponse {
  selection: Selection
  coverage: Coverage
  mae: number | null
  rmse: number | null
  bias: number | null
  nmae: number | null
  meanActual: number | null
}

export interface HourRow {
  hour: number
  slots: number
  meanError: number
  mae: number
}

export interface ErrorProfileResponse {
  selection: Selection
  coverage: Coverage
  hours: HourRow[]
}

export interface HealthResponse {
  status: string
  fetchedAt: string
  periodStart: string
  periodEnd: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatResponse {
  reply: string
}

// ---------- Dashboard settings (what the user has picked) ----------

export type Preset = 'month' | 'custom' | 'w1' | 'w2' | 'w3' | 'w4'

export interface Settings {
  preset: Preset
  start: number // day of January, 1-31
  end: number // inclusive
  mode: Mode
  horizon: number // hours, 0-48
  decision: string // HH:MM on the day before delivery
}

export const DEFAULT_SETTINGS: Settings = {
  preset: 'month',
  start: 1,
  end: 31,
  mode: 'horizon',
  horizon: 24,
  decision: '09:00',
}
