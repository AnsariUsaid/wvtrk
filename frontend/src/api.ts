import type {
  ChatMessage,
  ChatResponse,
  ErrorProfileResponse,
  GenerationResponse,
  HealthResponse,
  MetricsResponse,
  Settings,
} from './types'

// Same origin by default (Vite proxy in dev, one deployment in prod).
const API_BASE = import.meta.env.VITE_API_BASE ?? ''

export class ApiError extends Error {}

const isoDay = (day: number) => `2026-01-${String(day).padStart(2, '0')}`

export function queryFor(s: Settings): string {
  const params = new URLSearchParams({ start: isoDay(s.start), end: isoDay(s.end), mode: s.mode })
  if (s.mode === 'horizon') params.set('horizon', String(s.horizon))
  else params.set('cutoff', s.decision)
  return params.toString()
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let resp: Response
  try {
    resp = await fetch(`${API_BASE}${path}`, init)
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new ApiError("Couldn't reach the data service.")
  }
  if (!resp.ok) {
    const body = await resp.json().catch(() => null)
    const detail =
      typeof body?.detail === 'string'
        ? body.detail
        : resp.status >= 500
          ? "Couldn't reach the data service."
          : `Request failed (${resp.status}).`
    throw new ApiError(detail)
  }
  return resp.json() as Promise<T>
}

const getJson = <T>(path: string, signal?: AbortSignal) => requestJson<T>(path, { signal })

export const getHealth = (signal?: AbortSignal) => getJson<HealthResponse>('/api/health', signal)

export interface DashboardData {
  generation: GenerationResponse
  metrics: MetricsResponse
  profile: ErrorProfileResponse
}

export async function getDashboard(s: Settings, signal?: AbortSignal): Promise<DashboardData> {
  const q = queryFor(s)
  const [generation, metrics, profile] = await Promise.all([
    getJson<GenerationResponse>(`/api/generation?${q}`, signal),
    getJson<MetricsResponse>(`/api/metrics?${q}`, signal),
    getJson<ErrorProfileResponse>(`/api/error-profile?${q}`, signal),
  ])
  return { generation, metrics, profile }
}

export function postChat(messages: ChatMessage[], s: Settings, signal?: AbortSignal): Promise<ChatResponse> {
  const settings = {
    start: isoDay(s.start),
    end: isoDay(s.end),
    mode: s.mode,
    horizon: s.mode === 'horizon' ? s.horizon : null,
    cutoff: s.mode === 'day_ahead' ? s.decision : null,
  }
  return requestJson<ChatResponse>('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, settings }),
    signal,
  })
}
