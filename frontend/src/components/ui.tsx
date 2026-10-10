import type { ReactNode } from 'react'
import { AlertTriangle, HelpCircle, Inbox, Loader2 } from 'lucide-react'

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-bold leading-tight tracking-tight text-ink-900">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-[13px] text-ink-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = '',
  padded = true,
}: {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  padded?: boolean
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header
          className={`flex flex-wrap items-start justify-between gap-3 ${
            padded ? 'px-5 pt-5' : ''
          }`}
        >
          <div>
            {title && <h2 className="text-[15px] font-semibold text-ink-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[12.5px] text-ink-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </section>
  )
}

export function Kpi({
  label,
  value,
  sub,
  tone = 'default',
  testId,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: 'default' | 'good' | 'warn' | 'bad'
  testId?: string
}) {
  const toneClass =
    tone === 'good'
      ? 'text-brand-700'
      : tone === 'warn'
        ? 'text-amber-700'
        : tone === 'bad'
          ? 'text-rose-700'
          : 'text-ink-900'
  return (
    <div className="card px-4 py-3.5">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-500">
        {label}
      </div>
      <div className={`kpi-value mt-1 ${toneClass}`} data-testid={testId}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11.5px] leading-snug text-ink-500">{sub}</div>}
    </div>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-ink-500">
      <Loader2 size={16} className="animate-spin" />
      <span className="text-[13px]">{label}...</span>
    </div>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="notice notice-danger flex items-start gap-2.5" role="alert">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <div className="flex-1">
        <div className="font-semibold">Something went wrong</div>
        <div className="mt-0.5 text-[12.5px]">{message}</div>
      </div>
      {onRetry && (
        <button className="btn btn-sm" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}

export function EmptyState({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-10 text-center">
      <Inbox size={22} className="text-ink-300" />
      <div className="text-[13px] font-medium text-ink-600">{message}</div>
      {hint && <div className="max-w-md text-[12px] text-ink-400">{hint}</div>}
    </div>
  )
}

export function Notice({
  kind = 'info',
  children,
  icon = true,
}: {
  kind?: 'info' | 'warn' | 'good' | 'danger'
  children: ReactNode
  icon?: boolean
}) {
  const cls =
    kind === 'warn'
      ? 'notice-warn'
      : kind === 'good'
        ? 'notice-good'
        : kind === 'danger'
          ? 'notice-danger'
          : 'notice-info'
  const Icon = kind === 'warn' || kind === 'danger' ? AlertTriangle : HelpCircle
  return (
    <div className={`notice ${cls}`}>
      {icon && (
        <span className="mr-1.5 inline-block align-[-2px]">
          <Icon size={13} />
        </span>
      )}
      {children}
    </div>
  )
}

/** Horizontal meter bar used for SOH / confidence / priority. */
export function Meter({
  value,
  max = 100,
  tone = 'bg-brand-500',
  height = 'h-1.5',
  width = 'w-full',
}: {
  value: number
  max?: number
  tone?: string
  height?: string
  width?: string
}) {
  const w = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className={`${height} ${width} overflow-hidden rounded-full bg-ink-100`}>
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${w}%` }} />
    </div>
  )
}

/** Methodology disclosure block - keeps "how is this computed" one click away. */
export function MethodNote({ children }: { children: ReactNode }) {
  return (
    <details className="group mt-3">
      <summary className="cursor-pointer list-none text-[12px] font-medium text-ink-500 hover:text-ink-800">
        <span className="group-open:hidden">How is this calculated?</span>
        <span className="hidden group-open:inline">Hide calculation</span>
      </summary>
      <div className="mt-2 rounded-lg border border-ink-200 bg-ink-50/60 px-3.5 py-2.5 text-[12px] leading-relaxed text-ink-600">
        {children}
      </div>
    </details>
  )
}