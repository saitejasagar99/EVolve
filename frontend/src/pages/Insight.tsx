import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarClock,
  ClipboardList,
  Eye,
  Info,
  Leaf,
  Network,
  Recycle,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useAsync, useToast } from '../context/AppContext'
import { api } from '../services/api'
import type { ScenarioRun } from '../services/api'
import { ScenarioCompareChart } from '../components/charts'
import {
  Card,
  EmptyState,
  ErrorBox,
  Kpi,
  Meter,
  MethodNote,
  Notice,
  PageHeader,
  Spinner,
} from '../components/ui'
import { num, SEVERITY_TONE, titleise } from '../lib/format'

// ---------------------------------------------------------------------------
// Circularity & Traceability
// ---------------------------------------------------------------------------

export function CircularityPage() {
  const circ = useAsync(() => api.circularity(), [])
  const blind = useAsync(() => api.blindSpots(), [])
  const trace = useAsync(() => api.traceability(), [])

  if (circ.loading && !circ.data) return <Spinner label="Computing circularity" />
  if (circ.error) return <ErrorBox message={circ.error} onRetry={circ.reload} />
  const c = circ.data
  if (!c) return <ErrorBox message="No circularity score returned" />

  return (
    <>
      <PageHeader
        title="Circularity &amp; Traceability"
        subtitle="A transparent composite score, plus the environmental blind spots that traceability gaps create."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ---------- score ---------- */}
        <Card className="lg:col-span-1">
          <div className="text-center">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
              Circularity score
            </div>
            <div
              className="mt-1 text-[52px] font-bold leading-none tnum text-brand-700"
              data-testid="circularity-score"
            >
              {c.overall_score.toFixed(0)}
            </div>
            <div className="text-[12px] text-ink-400">out of 100</div>
            <div className="mt-2 inline-block rounded-full bg-brand-50 px-3 py-1 text-[12px] font-semibold text-brand-800">
              {c.grade}
            </div>
          </div>

          <div className="mt-4 space-y-2.5">
            {c.components.map((comp) => (
              <div key={comp.name}>
                <div className="flex items-baseline justify-between text-[12.5px]">
                  <span className="text-ink-700">{comp.label}</span>
                  <span className="tnum font-semibold text-ink-900">{comp.raw_pct.toFixed(0)}%</span>
                </div>
                <Meter
                  value={comp.raw_pct}
                  tone={
                    comp.raw_pct >= 75
                      ? 'bg-brand-500'
                      : comp.raw_pct >= 50
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                  }
                  height="h-1.5"
                />
                <details className="group mt-0.5">
                  <summary className="cursor-pointer text-[10.5px] text-ink-400 hover:text-ink-700">
                    <span className="group-open:hidden">how is this calculated?</span>
                    <span className="hidden group-open:inline">hide</span>
                  </summary>
                  <p className="mt-1 text-[11px] leading-snug text-ink-500">{comp.explainer}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-ink-400">
                    weight {(comp.weight * 100).toFixed(0)}% × {comp.raw_pct.toFixed(1)}% ={' '}
                    {comp.points.toFixed(2)} pts
                  </p>
                </details>
              </div>
            ))}
          </div>

          <div className="mt-3 border-t border-ink-200 pt-2.5">
            <div className="flex items-baseline justify-between text-[12px]">
              <span className="text-ink-600">Sum of component points</span>
              <span className="tnum font-semibold">
                {c.reconciliation.sum_of_component_points.toFixed(2)}
              </span>
            </div>
            <div className="flex items-baseline justify-between text-[12px]">
              <span className="text-ink-600">Reconciled score</span>
              <span className="tnum font-semibold text-brand-700">
                {c.reconciliation.overall_score.toFixed(1)} ✓
              </span>
            </div>
          </div>

          <Notice kind="warn">{c.disclaimer}</Notice>
          <MethodNote>{c.method}</MethodNote>
        </Card>

        {/* ---------- blind spots ---------- */}
        <div className="space-y-4 lg:col-span-2">
          <Card
            title="Environmental blind spots"
            subtitle="Records that are incomplete precisely because someone has to chase them"
            actions={
              blind.data && (
                <span
                  className={`badge ${
                    blind.data.total_findings > 0
                      ? 'border-amber-300 bg-amber-50 text-amber-800'
                      : 'border-brand-300 bg-brand-50 text-brand-800'
                  }`}
                  data-testid="blindspot-count"
                >
                  {blind.data.total_findings} findings · {blind.data.affected_batteries} batteries
                </span>
              )
            }
          >
            {!blind.data ? (
              <Spinner label="Scanning records" />
            ) : blind.data.total_findings === 0 ? (
              <EmptyState message="No blind spots detected" />
            ) : (
              <>
                <Notice kind="warn">{blind.data.why_it_matters}</Notice>

                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {Object.entries(blind.data.by_category).map(([cat, n]) => (
                    <div key={cat} className="rounded-lg border border-ink-200 px-3 py-2">
                      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-500">
                        {titleise(cat)}
                      </div>
                      <div className="text-[22px] font-bold tnum text-ink-900">{n}</div>
                    </div>
                  ))}
                </div>

                <div className="scroll-thin mt-4 max-h-96 overflow-auto rounded-lg border border-ink-200">
                  <table className="table-base">
                    <thead className="sticky top-0 bg-ink-50">
                      <tr>
                        <th>Battery</th>
                        <th>Severity</th>
                        <th>Issue</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(blind.data.findings).flatMap(([cat, items]) =>
                        items.map((f, i) => (
                          <tr key={`${cat}-${i}`} data-testid="blindspot-row">
                            <td>
                              <Link
                                to={`/batteries/${f.battery_id}`}
                                className="font-semibold text-brand-700"
                              >
                                {f.battery_id}
                              </Link>
                              <div className="font-mono text-[10px] text-ink-400">
                                {f.battery_lifecycle_id}
                              </div>
                            </td>
                            <td>
                              <span className={`badge ${SEVERITY_TONE[f.severity]}`}>
                                {f.severity}
                              </span>
                            </td>
                            <td className="max-w-[16rem] text-[11.5px] text-ink-600">{f.issue}</td>
                            <td className="max-w-[16rem] text-[11.5px] text-brand-800">
                              {f.action}
                            </td>
                          </tr>
                        )),
                      )}
                    </tbody>
                  </table>
                </div>
                <MethodNote>{blind.data.method}</MethodNote>
              </>
            )}
          </Card>

          {trace.data && (
            <Card title="Lifecycle distribution" subtitle={`${trace.data.events} audit-trail events recorded`}>
              <div className="grid gap-3 sm:grid-cols-4">
                {Object.entries(trace.data.lifecycle_counts).map(([status, n]) => (
                  <div key={status} className="rounded-lg border border-ink-200 px-3 py-2.5">
                    <div className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-500">
                      {titleise(status)}
                    </div>
                    <div className="text-[22px] font-bold tnum text-ink-900">{n}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-[11.5px] text-ink-500">
                <b>Strongest component:</b> {titleise(c.strongest_component.name)} (
                {c.strongest_component.pct}%)
                <span className="mx-2">·</span>
                <b>Weakest:</b> {titleise(c.weakest_component.name)} (
                {c.weakest_component.pct}%)
              </div>
            </Card>
          )}
        </div>
      </div>

      <Card className="mt-4" title="Circularity counts" subtitle="Underlying numbers behind each component">
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {Object.entries(c.counts).map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between border-b border-ink-100 py-1.5">
              <span className="text-[12px] text-ink-600">{titleise(k)}</span>
              <span className="tnum text-[13px] font-semibold text-ink-900">{v}</span>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}

// ---------------------------------------------------------------------------
// Digital Twin
// ---------------------------------------------------------------------------

export function TwinPage() {
  const { push } = useToast()
  const base = useAsync(() => api.twinBaseline(), [])
  const [run, setRun] = useState<ScenarioRun | null>(null)
  const [busy, setBusy] = useState(false)

  const runScenario = async (_id: string, params: ScenarioRun['params']) => {
    setBusy(true)
    try {
      setRun(await api.runScenario(params))
    } catch (e) {
      push(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (base.loading && !base.data) return <Spinner label="Building digital twin" />
  if (base.error) return <ErrorBox message={base.error} onRetry={base.reload} />
  if (!base.data) return <ErrorBox message="No twin baseline returned" />

  const r = base.data.results

  return (
    <>
      <PageHeader
        title="Fleet Digital Twin"
        subtitle="Ask what happens if fleet size, intervention capacity or recycling capacity changes — answered by the same models and the same rules."
      />

      <Notice kind="info">
        The twin re-runs the real pipeline over a resampled copy of the fleet. It is not a
        projection model of its own — changing the fleet changes which packs cross a threshold,
        which is what moves the numbers.
      </Notice>

      {/* ---------- current state ---------- */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Kpi label="Batteries" value={num(r.total_batteries)} />
        <Kpi label="EOL · 12 mo" value={num(r.potential_eol_12_months)} />
        <Kpi label="EOL candidates" value={num(r.eol_candidates)} tone="warn" />
        <Kpi label="Retained" value={num(r.retained_batteries)} tone="good" />
        <Kpi label="Intervention cand." value={num(r.intervention_candidates)} tone="good" />
        <Kpi label="Collection batches" value={num(r.collection_batches)} />
        <Kpi label="Circularity" value={r.circularity_score.toFixed(0)} tone="good" />
      </div>

      {/* ---------- scenario buttons ---------- */}
      <Card
        className="mt-4"
        title="Named scenarios"
        subtitle="Each re-runs the full pipeline with one change"
      >
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {base.data.scenarios.map((s) => (
            <button
              key={s.id}
              data-testid={`twin-${s.id}`}
              disabled={busy}
              onClick={() => runScenario(s.id, s.params)}
              className="card flex flex-col items-start px-4 py-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40 disabled:opacity-50"
            >
              <div className="flex items-center gap-1.5">
                <Network size={13} className="text-brand-600" />
                <span className="text-[12.5px] font-semibold text-ink-900">{s.label}</span>
              </div>
              <div className="mt-1 text-[11.5px] text-ink-500">{s.question}</div>
            </button>
          ))}
        </div>
      </Card>

      {/* ---------- result ---------- */}
      {run && (
        <>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card title="Scenario result" subtitle={Object.entries(run.params).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ')}>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(run.delta)
                  .filter(([, d]) => Math.abs(d.change) > 0.0001)
                  .slice(0, 8)
                  .map(([k, d]) => (
                    <div
                      key={k}
                      className="rounded-lg border border-ink-200 px-3 py-2"
                    >
                      <div className="text-[10.5px] uppercase tracking-wide text-ink-500">
                        {titleise(k)}
                      </div>
                      <div className="mt-0.5 text-[17px] font-bold tnum text-ink-900">
                        {d.scenario}
                      </div>
                      <div
                        className={`text-[11px] tnum font-medium ${
                          k.includes('avoided') || k.includes('retained') || k.includes('circularity')
                            ? d.change >= 0
                              ? 'text-brand-700'
                              : 'text-rose-600'
                            : d.change <= 0
                              ? 'text-brand-700'
                              : 'text-rose-600'
                        }`}
                      >
                        {d.change >= 0 ? '+' : ''}
                        {d.change}
                        {d.change_pct !== null && (
                          <span className="text-ink-400"> ({d.change_pct > 0 ? '+' : ''}{d.change_pct}%)</span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
              {Object.values(run.delta).every((d) => Math.abs(d.change) < 0.0001) && (
                <div className="mt-3">
                  <Notice kind="info">
                    This scenario matches the current state — no metric moved. That is the honest
                    result for a change that does not bind.
                  </Notice>
                </div>
              )}
            </Card>

            <Card title="Before vs after" subtitle="Metrics that changed">
              <ScenarioCompareChart
                data={Object.entries(run.delta)
                  .filter(([, d]) => Math.abs(d.change) > 0.0001)
                  .map(([k, d]) => ({ label: titleise(k), baseline: d.baseline, scenario: d.scenario }))}
                metric="value"
              />
            </Card>
          </div>

          <Card className="mt-4" title="Scenario limitations" subtitle="What this simulation does not capture">
            <ul className="space-y-1.5">
              {run.limitations.map((l, i) => (
                <li key={i} className="flex items-start gap-2 text-[12.5px] text-ink-600">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-500" />
                  {l}
                </li>
              ))}
            </ul>
            <div className="mt-3">{run.method}</div>
          </Card>
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Action Plan
// ---------------------------------------------------------------------------

export function ActionPlanPage() {
  const { data, error, loading, reload } = useAsync(() => api.actionPlan(), [])

  if (loading && !data) return <Spinner label="Building action plan" />
  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (!data) return <ErrorBox message="No action plan returned" />

  const icons = { IMMEDIATE: AlertTriangle, NEXT_30_DAYS: CalendarClock, NEXT_6_MONTHS: ClipboardList }
  const tones = {
    IMMEDIATE: 'border-rose-300 bg-rose-50',
    NEXT_30_DAYS: 'border-amber-300 bg-amber-50',
    NEXT_6_MONTHS: 'border-sky-300 bg-sky-50',
  }

  return (
    <>
      <PageHeader
        title="Action Plan"
        subtitle="Concrete, time-boxed work generated from the forecast, prevention, collection, capacity and traceability services."
      />

      <Notice kind="info">{data.note}</Notice>

      <div className="mt-4 space-y-4">
        {data.horizons.map((h) => {
          const Icon = icons[h.horizon as keyof typeof icons] ?? ClipboardList
          return (
            <Card
              key={h.horizon}
              className={`border-l-4 ${tones[h.horizon as keyof typeof tones] ?? ''}`}
              title={
                <span className="flex items-center gap-2">
                  <Icon size={15} />
                  {h.horizon.replace(/_/g, ' ')}
                  <span className="badge border-ink-200 bg-white text-ink-600">{h.count}</span>
                </span>
              }
              subtitle={`${h.count} action${h.count === 1 ? '' : 's'}`}
            >
              {h.items.length === 0 ? (
                <EmptyState message="Nothing pending for this horizon" />
              ) : (
                <ol className="space-y-2.5">
                  {h.items.map((item, i) => (
                    <li
                      key={i}
                      className="rounded-lg border border-ink-200 bg-white px-4 py-3"
                      data-testid="action-item"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">
                            {i + 1}
                          </span>
                          <span className="text-[13px] font-semibold text-ink-900">
                            {item.action}
                          </span>
                        </div>
                        <span
                          className={`badge ${
                            item.priority === 'CRITICAL'
                              ? 'border-rose-400 bg-rose-100 text-rose-900'
                              : item.priority === 'HIGH'
                                ? 'border-orange-300 bg-orange-50 text-orange-900'
                                : 'border-ink-300 bg-ink-100 text-ink-700'
                          }`}
                        >
                          {item.priority}
                        </span>
                      </div>
                      <p className="mt-1.5 pl-7 text-[12.5px] leading-relaxed text-ink-600">
                        {item.rationale}
                      </p>
                      {item.batteries.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5 pl-7">
                          {item.batteries.map((b) => (
                            <Link
                              key={b}
                              to={`/batteries/${b}`}
                              className="rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 font-mono text-[10.5px] text-brand-700 hover:border-brand-300 hover:bg-brand-50"
                            >
                              {b}
                            </Link>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          )
        })}
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-[11.5px] text-ink-400">
        <Info size={12} /> {data.generated_from}
      </p>
    </>
  )
}

// ---------------------------------------------------------------------------
// Methodology
// ---------------------------------------------------------------------------

const PIPELINE = [
  {
    n: 1,
    title: 'Data',
    body: 'BMS / telematics readings, or a synthetic fleet generated from a documented degradation law. Demo data is labelled SYNTHETIC on every response.',
    icon: Info,
  },
  {
    n: 2,
    title: 'Data Quality',
    body: 'Five measurable dimensions produce a Data Confidence Score. Insufficient history blocks the forecast rather than guessing a date.',
    icon: ShieldCheck,
  },
  {
    n: 3,
    title: 'Battery Intelligence',
    body: 'Random Forest / gradient boosting estimate SOH and the months-to-EOL horizon. Isolation Forest (one-class, fitted on known-good packs) flags anomalies.',
    icon: Sparkles,
  },
  {
    n: 4,
    title: 'Waste Forecast',
    body: 'Estimates are bucketed into 3 / 6 / 12-month horizons and smoothed into a monthly expected-inflow curve.',
    icon: CalendarClock,
  },
  {
    n: 5,
    title: 'Waste Prevention',
    body: 'A transparent ruleset routes each pack through continue → repair → second-life → EOL, returning the exact rules that fired.',
    icon: Leaf,
  },
  {
    n: 6,
    title: 'Collection Optimisation',
    body: 'Priority-ordered, zone-clustered, capacity-constrained batching with a nearest-neighbour route, measured against solo visits.',
    icon: Network,
  },
  {
    n: 7,
    title: 'Lifecycle Tracking',
    body: 'An append-only audit trail keyed by Battery Lifecycle ID (BLID), with timestamps, handler and evidence reference.',
    icon: ClipboardList,
  },
  {
    n: 8,
    title: 'Circularity',
    body: 'Five weighted components produce a composite score that can be recalculated by hand from the published values.',
    icon: Recycle,
  },
  {
    n: 9,
    title: 'Scenario Simulation',
    body: 'The digital twin re-runs the same models and rules over a resampled fleet, so capacity ceilings bind visibly.',
    icon: Eye,
  },
]

export function MethodologyPage() {
  const metrics = useAsync(() => api.metrics(), [])

  return (
    <>
      <PageHeader
        title="Methodology"
        subtitle="How EVolve AI gets from raw telemetry to a collection decision, and what it deliberately does not claim."
      />

      {/* ---------- pipeline ---------- */}
      <div className="grid gap-2.5 md:grid-cols-3 xl:grid-cols-5">
        {PIPELINE.map((p) => {
          const Icon = p.icon
          return (
            <div key={p.n} className="card px-4 py-3.5">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-600 text-[11px] font-bold text-white">
                  {p.n}
                </span>
                <Icon size={14} className="text-brand-600" />
                <span className="text-[12.5px] font-semibold text-ink-900">{p.title}</span>
              </div>
              <p className="mt-1.5 text-[11.5px] leading-snug text-ink-500">{p.body}</p>
            </div>
          )
        })}
      </div>

      {/* ---------- differentiation ---------- */}
      <Card
        className="mt-4"
        title="How EVolve AI differs from existing approaches"
        subtitle="Stated without claiming novelty"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-ink-500">
              Where existing ecosystems focus
            </h3>
            <ul className="space-y-1.5">
              {[
                'EPR registration and compliance reporting',
                'Battery passport and digital product documentation',
                'Battery diagnostics and health monitoring',
                'Recycling and material recovery processes',
                'Second-life product development and certification',
              ].map((t) => (
                <li key={t} className="flex items-start gap-2 text-[12.5px] text-ink-600">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-300" />
                  {t}
                </li>
              ))}
            </ul>
            <p className="mt-2.5 text-[11.5px] leading-snug text-ink-400">
              These are valuable and largely complementary. EVolve AI does not replace any of them.
            </p>
          </div>
          <div>
            <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-brand-700">
              Where EVolve AI focuses
            </h3>
            <div className="space-y-1.5">
              {[
                ['PREDICT', 'Which packs may become waste, and when'],
                ['PREVENT', 'Which of those can still be kept in service or given a second-life assessment'],
                ['OPTIMIZE', 'How to collect the unavoidable ones efficiently, and whether capacity can absorb them'],
                ['TRACE', 'Where every pack is, and which records are missing'],
              ].map(([k, v]) => (
                <div key={k} className="flex items-start gap-2">
                  <span className="rounded bg-brand-100 px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-brand-800">
                    {k}
                  </span>
                  <span className="text-[12.5px] text-ink-600">{v}</span>
                </div>
              ))}
            </div>
            <p className="mt-2.5 text-[11.5px] leading-snug text-ink-400">
              The operational decision layer between prediction and action — not a compliance,
              passport or recycling system.
            </p>
          </div>
        </div>
        <Notice kind="warn">
          EVolve AI does <b>not</b> claim to be the first EV battery recycling or circularity
          system, and does not claim no existing solutions exist. It is a decision-support
          prototype.
        </Notice>
      </Card>

      {/* ---------- honest ML reporting ---------- */}
      {metrics.data && metrics.data.soh && (
        <Card
          className="mt-4"
          title="Model performance, reported honestly"
          subtitle={`Trained on a synthetic cohort of ${metrics.data.dataset.n_batteries} batteries`}
        >
          <Notice kind="danger">
            <b>{metrics.data.honesty.headline}</b>
            <div className="mt-1.5">{metrics.data.honesty.why_soh_r2_is_so_high}</div>
            <div className="mt-1.5">
              <b>What would change this:</b> {metrics.data.honesty.what_would_change_this}
            </div>
          </Notice>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-ink-200 px-3 py-3">
              <div className="text-[12px] font-semibold text-ink-900">State of Health</div>
              <table className="mt-1.5 w-full text-[12px]">
                <tbody>
                  <MetricRow label="MAE" v={metrics.data.soh.mae as number} />
                  <MetricRow label="RMSE" v={metrics.data.soh.rmse as number} />
                  <MetricRow label="R²" v={metrics.data.soh.r2 as number} />
                  <MetricRow label="Baseline MAE" v={metrics.data.soh.baseline_mae as number} muted />
                  <MetricRow
                    label="Skill vs baseline"
                    v={metrics.data.soh.skill_vs_baseline_pct as number}
                    suffix="%"
                  />
                </tbody>
              </table>
            </div>
            <div className="rounded-lg border border-ink-200 px-3 py-3">
              <div className="text-[12px] font-semibold text-ink-900">EOL horizon</div>
              <table className="mt-1.5 w-full text-[12px]">
                <tbody>
                  <MetricRow label="MAE (months)" v={metrics.data.eol.mae as number} />
                  <MetricRow label="R²" v={metrics.data.eol.r2 as number} />
                  <MetricRow
                    label="Within ±3 months"
                    v={metrics.data.eol.within_3_months_pct as number}
                    suffix="%"
                  />
                  <MetricRow
                    label="Baseline within ±3 mo"
                    v={metrics.data.eol.baseline_within_3_months_pct as number}
                    suffix="%"
                    muted
                  />
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-ink-200 px-3 py-3">
            <div className="text-[12px] font-semibold text-ink-900">
              Anomaly detection ({metrics.data.anomaly.model})
            </div>
            <div className="mt-1.5 grid gap-3 sm:grid-cols-4">
              <MetricCard label="Precision" v={metrics.data.anomaly.precision.toFixed(3)} />
              <MetricCard label="Recall" v={metrics.data.anomaly.recall.toFixed(3)} />
              <MetricCard label="F1" v={metrics.data.anomaly.f1.toFixed(3)} />
              <MetricCard label="Positive cases" v={num(metrics.data.anomaly.n_positive_cases)} />
            </div>
          </div>

          <h3 className="mb-2 mt-4 text-[12px] font-bold uppercase tracking-wide text-ink-500">
            Known limitations
          </h3>
          <ol className="space-y-1">
            {metrics.data.limitations.map((l, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px] text-ink-600">
                <span className="tnum shrink-0 text-ink-400">{i + 1}.</span>
                {l}
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[11.5px] text-ink-400">{metrics.data.baseline_note}</p>
        </Card>
      )}
    </>
  )
}

function MetricRow({
  label,
  v,
  suffix = '',
  muted,
}: {
  label: string
  v: number
  suffix?: string
  muted?: boolean
}) {
  return (
    <tr>
      <td className={muted ? 'text-ink-400' : 'text-ink-600'}>{label}</td>
      <td className={`text-right tnum font-semibold ${muted ? 'text-ink-400' : 'text-ink-900'}`}>
        {v}
        {suffix}
      </td>
    </tr>
  )
}

function MetricCard({ label, v }: { label: string; v: string }) {
  return (
    <div className="rounded border border-ink-200 px-2.5 py-2">
      <div className="text-[10.5px] uppercase tracking-wide text-ink-500">{label}</div>
      <div className="text-[17px] font-bold tnum text-ink-900">{v}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// About
// ---------------------------------------------------------------------------

export function AboutPage() {
  const { health, meta } = useAsync2()
  return (
    <>
      <PageHeader
        title="About EVolve AI"
        subtitle="Predictive EV Battery Waste Prevention &amp; Circularity Intelligence"
      />

      <Card>
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
            <Leaf size={24} />
          </div>
          <div>
            <div className="text-[20px] font-bold text-ink-900">EVolve AI</div>
            <div className="text-[13px] text-ink-600">
              Predictive EV Battery Waste Prevention &amp; Circularity Intelligence
            </div>
            <div className="mt-1 text-[12.5px] italic text-ink-500">
              "Predict. Prevent. Optimize. Trace."
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-brand-200 bg-brand-50/60 px-4 py-3.5">
          <div className="text-[12px] font-bold uppercase tracking-wide text-brand-800">
            The problem
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-700">
            EV batteries are an emerging waste stream. Operators often cannot predict when a pack
            will reach end of life, cannot tell whether it can still be kept in service or
            refurbished, and lose sight of where packs are once they leave the vehicle. The result
            is premature disposal, missed second-life opportunities, inefficient collection and
            capacity mismatch at the recycling stage.
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <h3 className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-ink-500">
              What it answers
            </h3>
            <ul className="space-y-1">
              {[
                'Which batteries are likely to become waste in the future?',
                'Which of those can still be prevented from becoming waste?',
                'Which should be prioritised for EOL collection?',
                'Can collection activities be intelligently batched?',
                'Is recycling capacity sufficient for predicted EOL volume?',
                'Where is each battery in its lifecycle?',
                'How much waste can be avoided through intervention?',
                'What happens if fleet or capacity changes?',
              ].map((q) => (
                <li key={q} className="flex items-start gap-2 text-[12.5px] text-ink-600">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-500" />
                  {q}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-ink-500">
              System
            </h3>
            <dl className="space-y-1.5 text-[12.5px]">
              {[
                ['Frontend', 'React · TypeScript · Vite · Tailwind · Recharts · React Router'],
                ['Backend', 'Python · FastAPI · Pydantic · SQLAlchemy'],
                ['Database', 'SQLite (PostgreSQL-portable: one URL, no dialect-specific SQL)'],
                ['ML', 'scikit-learn — Random Forest / Gradient Boosting · Isolation Forest'],
                ['GenAI', 'Optional. Deterministic local fallback when no key is configured'],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="w-20 shrink-0 text-ink-500">{k}</dt>
                  <dd className="text-ink-700">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="mt-5">
          <Notice kind="warn">
            <b>What EVolve AI does not do.</b> It does not certify a battery safe or unsafe, does
            not guarantee an RUL or failure date, does not assert official regulatory or EPR
            compliance, and does not claim to be the first system of its kind. Anomaly signals
            require technical inspection. Second-life recommendations require technical assessment.
          </Notice>
        </div>

        {health && meta && (
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[11.5px] text-ink-500">
            <span>API {health.status}</span>
            <span>Models trained: {String(health.models_trained)}</span>
            <span>GenAI: {health.genai_mode}</span>
            <span>Data: {health.provenance.label}</span>
            <span>Batteries: {health.batteries}</span>
          </div>
        )}
      </Card>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/methodology" className="btn">
          <ShieldCheck size={14} /> Read the methodology
        </Link>
        <Link to="/prevention" className="btn btn-primary">
          <Leaf size={14} /> See waste prevention in action
        </Link>
      </div>
    </>
  )
}

function useAsync2() {
  const health = useAsync(() => api.health(), [])
  const meta = useAsync(() => api.meta(), [])
  return { health: health.data, meta: meta.data }
}