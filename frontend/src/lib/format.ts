/** Formatting helpers. Indian digit grouping for INR, matching the backend. */

export function inr(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  const v = Math.round(n)
  const neg = v < 0
  let s = String(Math.abs(v))
  if (s.length > 3) {
    const last3 = s.slice(-3)
    let rest = s.slice(0, -3)
    const parts: string[] = []
    while (rest.length > 2) {
      parts.unshift(rest.slice(-2))
      rest = rest.slice(0, -2)
    }
    if (rest) parts.unshift(rest)
    s = `${parts.join(',')},${last3}`
  }
  return `${neg ? '-' : ''}₹${s}`
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return `${n.toFixed(digits)}%`
}

export function num(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return n.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function months(n: number | null | undefined): string {
  if (n === null || n === undefined) return 'no estimate'
  if (n <= 0) return 'already past threshold'
  if (n < 1) return `${n.toFixed(1)} mo`
  if (n < 24) return `${n.toFixed(1)} mo`
  return `${(n / 12).toFixed(1)} yr`
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function titleise(s: string | null | undefined): string {
  if (!s) return '—'
  return s
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export const CONFIDENCE_TONE: Record<string, string> = {
  High: 'border-brand-300 bg-brand-50 text-brand-800',
  Moderate: 'border-amber-300 bg-amber-50 text-amber-800',
  Low: 'border-rose-300 bg-rose-50 text-rose-800',
}

export const BAND_TONE: Record<string, string> = {
  CRITICAL: 'border-rose-400 bg-rose-100 text-rose-900',
  HIGH: 'border-orange-300 bg-orange-50 text-orange-900',
  MEDIUM: 'border-amber-300 bg-amber-50 text-amber-900',
  LOW: 'border-ink-300 bg-ink-100 text-ink-700',
}

export const PRIORITY_TONE: Record<string, string> = {
  CRITICAL: 'border-rose-400 bg-rose-100 text-rose-900',
  HIGH: 'border-orange-300 bg-orange-50 text-orange-900',
  MEDIUM: 'border-amber-300 bg-amber-50 text-amber-900',
  LOW: 'border-ink-300 bg-ink-100 text-ink-700',
}

export const SEVERITY_TONE: Record<string, string> = {
  CRITICAL: 'border-rose-400 bg-rose-100 text-rose-900',
  HIGH: 'border-orange-300 bg-orange-50 text-orange-900',
  MEDIUM: 'border-amber-300 bg-amber-50 text-amber-900',
  LOW: 'border-ink-300 bg-ink-100 text-ink-700',
}

export function sohTone(soh: number, eolThreshold: number, critical: number): string {
  if (soh <= critical) return 'text-rose-700'
  if (soh <= eolThreshold) return 'text-amber-700'
  return 'text-brand-700'
}

export function confTone(score: number): string {
  if (score >= 75) return 'bg-brand-500'
  if (score >= 50) return 'bg-amber-500'
  return 'bg-rose-500'
}