/**
 * Dashboard — "Waste Intelligence Dashboard".
 *
 * Reads only from API payloads. The headline band is the prevention story:
 * predicted waste versus what can still be prevented.
 */

import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BatteryCharging,
  ClipboardList,
  Factory,
  Leaf,
  Recycle,
  Sparkles,
  TrendingDown,
  TriangleAlert,
  Zap,
} from 'lucide-react'
import { useApp, useAsync } from '../context/AppContext'
import { api } from '../services/api'
import {
  CapacityBarChart,
  CumulativeEolChart,
  EolForecastChart,
  PathwayDonut,
  ZoneBarChart,
} from '../components/charts'
import { Card, EmptyState, ErrorBox, Kpi, MethodNote, Notice, PageHeader, Spinner } from '../components/ui'
import { inr, num } from '../lib/format'
import { PATHWAY_META } from '../services/api'
import type { Pathway } from '../services/api'

const PATHWAY_FILL: Record<Pathway, string> = {
  CONTINUE_USE: '#10b981',
  REPAIR_REFURBISHMENT: '#0ea5e9',
  SECOND_LIFE_ASSESSMENT: '#f59e0b',
  EOL_CANDIDATE: '#f43f5e',
}

export default function Dashboard() {
  const { meta } = useApp()
  const summary = useAsync(() => api.summary(), [])
  const forecast = useAsync(() => api.forecast(), [])
  const ledger = useAsync(() => api.avoidance(), [])
  const blind = useAsync(() => api.blindSpots(), [])
  const cap = useAsync(() => api.capacity(), [])
  const plan = useAsync(() => api.actionPlan(), [])

  if (summary.loading && !summary.data) return <Spinner label="Loading dashboard" />
  if (summary.error) return <ErrorBox message={summary.error} onRetry={summary.reload} />
  const s = summary.data?.summary
  if (!s) return <ErrorBox message="No summary returned" />

  const th = meta?.thresholds
  const f = forecast.data
  const l = ledger.data

  const donut = (Object.entries(s.pathway_counts) as Array<[Pathway, number]>).map(
    ([k, v]) => ({ name: PATHWAY_META[k]?.short ?? k, value: v, fill: PATHWAY_FILL[k] ?? '#94a3b8' }),
  )

  const immediate = plan.data?.horizons.find((h) => h.horizon === 'IMMEDIATE')
  const next30 = plan.data?.horizons.find((h) => h.horizon === 'NEXT_30_DAYS')

  return (
    <>
      <PageHeader
        title="Waste Intelligence Dashboard"
        subtitle="EVolve AI predicts which batteries may become waste, checks whether that waste can still be prevented, optimises collection for the rest, and traces every pack through its lifecycle."
        actions={
          <>
            <Link to="/customer/battery" className="btn btn-primary font-bold shadow-xs">
              <Sparkles size={14} /> Check My EV Battery
            </Link>
            <Link to="/consumer/marketplace" className="btn">
              <Zap size={14} /> 2nd-Life Market
            </Link>
            <Link to="/forecast" className="btn">
              <TrendingDown size={14} /> Forecast
            </Link>
          </>
        }
      />

      {/* ---------- EVolve AI Customer Hero Banner (Requirement 33) ---------- */}
      <div className="mb-5 rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-700 via-brand-600 to-emerald-800 p-6 text-white shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-white backdrop-blur-xs">
              <Sparkles size={12} /> Smart Battery Intelligence
            </span>
            <h2 className="mt-2 text-[23px] font-black leading-tight text-white sm:text-[27px]">
              You don&apos;t need to understand batteries. EVolve AI does the analysis for you.
            </h2>
            <p className="mt-2 text-[13.5px] text-brand-100 leading-relaxed">
              Answer a few simple questions about your EV. Our AI analyzes your usage, battery behavior and available data to estimate battery health, future risk and the best next action.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <Link
              to="/customer/battery"
              className="btn bg-white text-brand-900 hover:bg-brand-50 border-0 font-extrabold px-5 text-[13.5px] shadow-sm flex items-center justify-center gap-2"
            >
              <span>Check My Battery</span>
              <ArrowRight size={15} />
            </Link>
            <Link
              to="/customer"
              className="btn border border-white/80 text-white hover:bg-white/10 font-semibold px-4 text-[13px] flex items-center justify-center gap-1.5"
            >
              <span>My EV Dashboard</span>
            </Link>
          </div>
        </div>
      </div>

      {/* ---------- headline: predicted vs preventable ---------- */}
      <div className="mb-5">
        <Card padded={false} className="overflow-hidden">
          <div className="grid divide-y divide-ink-200 lg:grid-cols-[1.1fr_1fr] lg:divide-x lg:divide-y-0">
            <div className="bg-gradient-to-br from-brand-50 to-white px-5 py-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-brand-700">
                Waste exposure — next 12 months
              </div>
              <div className="mt-1.5 flex items-baseline gap-2.5">
                <span className="text-[40px] font-bold leading-none tnum text-ink-900">
                  {s.potential_eol_12_months}
                </span>
                <span className="text-[13px] text-ink-600">batteries forecast to reach EOL</span>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-ink-600">
                <span>
                  <b className="tnum text-ink-900">{s.potential_eol_3_months}</b> within 3 months
                </span>
                <span>
                  <b className="tnum text-ink-900">{s.potential_eol_6_months}</b> within 6 months
                </span>
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-brand-300 bg-white px-3 py-2">
                <Leaf size={15} className="shrink-0 text-brand-600" />
                <div className="text-[12.5px] leading-snug">
                  <b className="text-brand-800">{l?.potential_eol_waste_avoided_units ?? 0} of these can be avoided</b>
                  <span className="text-ink-600">
                    {' '}— retained through continued use, repair/refurbishment or second-life assessment.
                  </span>
                </div>
              </div>
              <p className="mt-2.5 text-[11.5px] leading-snug text-ink-500">
                Not every degrading battery should immediately become waste. EVolve AI evaluates
                each pack against every recovery pathway first.
              </p>
            </div>

            <div className="px-5 py-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
                Fleet composition
              </div>
              <div className="mt-2">
                <PathwayDonut data={donut} />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ---------- KPI band ---------- */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Kpi label="Total batteries" value={num(s.total_batteries)} testId="kpi-total" />
        <Kpi
          label="Potential EOL · 3 mo"
          value={num(s.potential_eol_3_months)}
          tone={s.potential_eol_3_months > 0 ? 'bad' : 'good'}
          testId="kpi-eol3"
        />
        <Kpi label="Potential EOL · 6 mo" value={num(s.potential_eol_6_months)} tone="warn" />
        <Kpi label="Potential EOL · 12 mo" value={num(s.potential_eol_12_months)} tone="warn" />
        <Kpi
          label="Intervention candidates"
          value={num(s.intervention_candidates)}
          tone="good"
          sub="repair or second-life"
          testId="kpi-intervention"
        />
        <Kpi label="Collection pending" value={num(s.collection_pending)} />
        <Kpi label="Second-life candidates" value={num(s.second_life_candidates)} tone="warn" />
        <Kpi
          label="Circularity score"
          value={s.circularity_score.toFixed(0)}
          sub="out of 100"
          tone={s.circularity_score >= 65 ? 'good' : 'warn'}
          testId="kpi-circularity"
        />
      </div>

      {/* ---------- alerts ---------- */}
      {(blind.data?.total_findings ?? 0) > 0 && (
        <div className="mb-5">
          <Notice kind="warn">
            <b>{blind.data?.affected_batteries} batteries</b> have environmental blind spots —{' '}
            {blind.data?.total_findings} record-level findings.{' '}
            <Link to="/circularity" className="link">
              Review traceability gaps
            </Link>
          </Notice>
        </div>
      )}

      {/* ---------- charts ---------- */}
      <div className="mb-5 grid gap-4 xl:grid-cols-2">
        <Card title="1 · Future EOL forecast" subtitle="Expected packs reaching the EOL threshold per month">
          {f ? (
            <EolForecastChart
              data={f.monthly_forecast}
              thresholds={{
                eol: f.peak_month?.expected_eol ?? 0,
                critical: th?.eol_soh_pct ?? 80,
              }}
            />
          ) : (
            <EmptyState message="Loading forecast" />
          )}
          <MethodNote>
            {f?.method}
            {f?.totals.excluded_insufficient_history ? (
              <div className="mt-1.5 font-medium text-amber-800">
                {f.totals.excluded_note}
              </div>
            ) : null}
          </MethodNote>
        </Card>

        <Card title="2 · Cumulative waste exposure" subtitle="Running total of predicted EOL units">
          {f ? <CumulativeEolChart data={f.monthly_forecast} /> : <EmptyState message="Loading" />}
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {(['3', '6', '12'] as const).map((h) => (
              <div key={h} className="rounded-lg border border-ink-200 bg-ink-50/60 px-2 py-2">
                <div className="text-[10.5px] uppercase tracking-wide text-ink-500">
                  Next {h} mo
                </div>
                <div className="text-[18px] font-bold tnum text-ink-900">
                  {f?.horizons[`next_${h}_months`]?.predicted_eol_count ?? 0}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="3 · Waste by zone" subtitle="Predicted EOL units per operating zone">
          {f ? <ZoneBarChart data={f.by_zone} /> : <EmptyState message="Loading" />}
          {f?.high_risk_zone && (
            <p className="mt-2 text-[11.5px] text-ink-600">
              Highest exposure: <b>{f.high_risk_zone.zone}</b> with{' '}
              <b className="tnum">{f.high_risk_zone.eol_next_12}</b> units in 12 months.
            </p>
          )}
        </Card>

        <Card
          title="4 · Processing capacity vs forecast"
          subtitle="Does downstream capacity keep up with predicted inflow?"
        >
          {cap.data ? (
            <>
              <CapacityBarChart
                data={[
                  {
                    label: 'Peak month',
                    inflow: cap.data.demand.peak_monthly_units,
                    capacity: cap.data.supply.processing_capacity_units_per_month,
                  },
                  {
                    label: 'Mean month',
                    inflow: cap.data.demand.mean_monthly_units,
                    capacity: cap.data.supply.processing_capacity_units_per_month,
                  },
                ]}
              />
              <div className="mt-3">
                <Notice kind={cap.data.status === 'CAPACITY_MISMATCH' ? 'danger' : 'good'}>
                  <b>{cap.data.status.replace(/_/g, ' ')}.</b> {cap.data.recommendation}
                </Notice>
              </div>
            </>
          ) : (
            <EmptyState message="Loading capacity" />
          )}
        </Card>

        <Card title="5 · Waste avoidance" subtitle="Batteries retained versus routed to EOL">
          {l ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-brand-200 bg-brand-50/60 px-3 py-2.5">
                  <div className="text-[10.5px] font-semibold uppercase tracking-wide text-brand-700">
                    Retained from waste
                  </div>
                  <div className="text-[24px] font-bold tnum text-brand-800">
                    {l.retained_batteries}
                  </div>
                  <div className="text-[11px] text-ink-600">
                    {l.prevention_ratio_pct}% of the fleet
                  </div>
                </div>
                <div className="rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2.5">
                  <div className="text-[10.5px] font-semibold uppercase tracking-wide text-rose-700">
                    EOL candidates
                  </div>
                  <div className="text-[24px] font-bold tnum text-rose-800">
                    {l.potential_eol_candidates}
                  </div>
                  <div className="text-[11px] text-ink-600">
                    {l.potential_eol_waste_avoided_kg.toFixed(0)} kg avoidable
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-baseline justify-between border-t border-ink-200 pt-2.5 text-[12.5px]">
                <span className="text-ink-600">Estimated intervention cost</span>
                <span className="font-semibold tnum text-ink-900">
                  {inr(l.estimated_intervention_cost_inr)}
                </span>
              </div>
              <div className="flex items-baseline justify-between text-[12.5px]">
                <span className="text-ink-600">Purchase value deferred</span>
                <span className="font-semibold tnum text-brand-700">
                  {inr(l.estimated_purchase_value_avoided_inr)}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] text-ink-400">{l.label}</p>
            </>
          ) : (
            <EmptyState message="Loading ledger" />
          )}
        </Card>

        <Card title="6 · Lifecycle distribution" subtitle="Where every battery currently sits">
          <div className="space-y-1.5">
            {Object.entries(s.lifecycle_counts).map(([status, count]) => {
              const pctv = (count / s.total_batteries) * 100
              const tone =
                status === 'IN_SERVICE'
                  ? 'bg-brand-500'
                  : status === 'EOL_CANDIDATE'
                    ? 'bg-amber-500'
                    : status === 'COLLECTED'
                      ? 'bg-sky-500'
                      : 'bg-ink-400'
              return (
                <div key={status}>
                  <div className="flex items-baseline justify-between text-[12.5px]">
                    <span className="text-ink-700">{status.replace(/_/g, ' ')}</span>
                    <span className="tnum text-ink-900">
                      {count}{' '}
                      <span className="text-ink-400">({pctv.toFixed(0)}%)</span>
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-100">
                    <div className={`h-full ${tone}`} style={{ width: `${pctv}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/circularity" className="btn btn-sm">
              <Recycle size={13} /> Circularity &amp; trace
            </Link>
            <Link to="/collection" className="btn btn-sm">
              <BatteryCharging size={13} /> EOL collection
            </Link>
          </div>
        </Card>
      </div>

      {/* ---------- action teaser ---------- */}
      <Card
        title="Next best actions"
        subtitle="Generated from the forecast, prevention, collection and capacity services"
        actions={
          <Link to="/action-plan" className="btn btn-sm">
            Full action plan <ArrowRight size={13} />
          </Link>
        }
      >
        {plan.loading && !plan.data ? (
          <Spinner label="Building plan" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {[
              { h: 'Immediate', items: immediate?.items ?? [], icon: TriangleAlert, tone: 'text-rose-700' },
              { h: 'Next 30 days', items: next30?.items ?? [], icon: ClipboardList, tone: 'text-amber-700' },
            ].map((col) => {
              const Icon = col.icon
              return (
                <div key={col.h}>
                  <div className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-ink-600">
                    <Icon size={13} className={col.tone} /> {col.h}
                  </div>
                  {col.items.length === 0 ? (
                    <p className="text-[12.5px] text-ink-400">Nothing pending.</p>
                  ) : (
                    <ul className="space-y-2">
                      {col.items.slice(0, 4).map((it, i) => (
                        <li key={i} className="rounded-lg border border-ink-200 px-3 py-2">
                          <div className="text-[12.5px] font-medium text-ink-800">{it.action}</div>
                          <div className="mt-0.5 text-[11.5px] leading-snug text-ink-500">
                            {it.rationale}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* ---------- secondary links ---------- */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Link to="/capacity" className="card flex items-center gap-3 px-4 py-3 hover:border-brand-300">
          <Factory size={17} className="text-brand-600" />
          <div>
            <div className="text-[13px] font-semibold text-ink-900">Capacity planning</div>
            <div className="text-[11.5px] text-ink-500">
              {cap.data?.status.replace(/_/g, ' ').toLowerCase() ?? '—'}
            </div>
          </div>
        </Link>
        <Link to="/twin" className="card flex items-center gap-3 px-4 py-3 hover:border-brand-300">
          <TrendingDown size={17} className="text-brand-600" />
          <div>
            <div className="text-[13px] font-semibold text-ink-900">Digital twin</div>
            <div className="text-[11.5px] text-ink-500">Test capacity changes before committing</div>
          </div>
        </Link>
        <Link to="/prevention" className="card flex items-center gap-3 px-4 py-3 hover:border-brand-300">
          <Leaf size={17} className="text-brand-600" />
          <div>
            <div className="text-[13px] font-semibold text-ink-900">Waste prevention</div>
            <div className="text-[11.5px] text-ink-500">Every pathway, with its rules</div>
          </div>
        </Link>
      </div>
    </>
  )
}