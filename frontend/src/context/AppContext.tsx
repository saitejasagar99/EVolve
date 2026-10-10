import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { ApiError, api } from '../services/api'
import type { HealthInfo, Meta } from '../types/api'

// ---------------------------------------------------------------------------
// Data context
// ---------------------------------------------------------------------------

interface AppState {
  health: HealthInfo | null
  meta: Meta | null
  /** Bumped to force every page to refetch after a mutation. */
  revision: number
  refresh: () => void
  loading: boolean
  bootError: string | null
  reload: () => void
}

const Ctx = createContext<AppState | null>(null)

export function useApp(): AppState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp must be used inside <AppProvider>')
  return v
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<HealthInfo | null>(null)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [bootError, setBootError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  const refresh = useCallback(() => setRevision((r) => r + 1), [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([api.health(), api.meta()])
      .then(([h, m]) => {
        if (!alive) return
        setHealth(h)
        setMeta(m)
        setBootError(null)
      })
      .catch((e) => {
        if (!alive) return
        setBootError(e instanceof ApiError ? e.message : String(e))
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [nonce])

  const value = useMemo<AppState>(
    () => ({ health, meta, revision, refresh, loading, bootError, reload }),
    [health, meta, revision, refresh, loading, bootError, reload],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// ---------------------------------------------------------------------------
// Async data hook
// ---------------------------------------------------------------------------

/**
 * Fetch on mount and whenever `revision` changes, so a mutation anywhere in the
 * app refreshes every page consistently.
 */
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
): { data: T | null; error: string | null; loading: boolean; reload: () => void } {
  const { revision } = useApp()
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [local, setLocal] = useState(0)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps)

  useEffect(() => {
    let alive = true
    setLoading(true)
    run()
      .then((d) => {
        if (!alive) return
        setData(d)
        setError(null)
      })
      .catch((e) => {
        if (!alive) return
        setError(e instanceof ApiError ? e.message : String(e))
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [run, revision, local])

  return { data, error, loading, reload: () => setLocal((n) => n + 1) }
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

type ToastKind = 'success' | 'error' | 'info'
interface Toast {
  id: number
  kind: ToastKind
  message: string
}

interface ToastApi {
  push: (message: string, kind?: ToastKind) => void
}

const ToastCtx = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const v = useContext(ToastCtx)
  if (!v) throw new Error('useToast must be used inside <ToastProvider>')
  return v
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, kind, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000)
  }, [])

  const value = useMemo(() => ({ push }), [push])

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex w-[min(26rem,calc(100vw-2.5rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            data-testid="toast"
            className={`animate-fadeUp flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-[13px] shadow-lift ${
              t.kind === 'success'
                ? 'border-brand-300 bg-brand-50 text-brand-900'
                : t.kind === 'error'
                  ? 'border-rose-300 bg-rose-50 text-rose-900'
                  : 'border-ink-200 bg-white text-ink-800'
            }`}
          >
            {t.kind === 'success' ? (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            ) : t.kind === 'error' ? (
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            ) : (
              <Info size={16} className="mt-0.5 shrink-0" />
            )}
            <span className="flex-1 leading-snug">{t.message}</span>
            <button
              aria-label="Dismiss"
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
              className="shrink-0 opacity-50 hover:opacity-100"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}