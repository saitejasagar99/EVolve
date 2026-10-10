import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  BatteryCharging,
  Calendar,
  ClipboardCheck,
  FileText,
  MapPin,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingDown,
} from 'lucide-react'
import { useApp, useAsync, useToast } from '../context/AppContext'
import { api, PATHWAY_META } from '../services/api'
import type { Pathway } from '../services/api'
import { DegradationLineChart } from '../components/charts'
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
import { confTone, CONFIDENCE_TONE, inr, months, num, shortDate, sohTone } from '../lib/format'

export function FleetPage({ mode = 'fleet' }: { mode?: 'fleet' | 'batteries' }) {
  const [params, setParams] = useSearchParams()
  const { meta } = useApp()
  const navigate = useNavigate()

  const [search, setSearch] = useState(params.get('search') ?? '')
  const [sort, setSort] = useState(params.get('sort_by') ?? 'soh')
  const [order, setOrder] = useState(params.get('order') ?? 'asc')

  const filters = useMemo(
    () => ({
      pathway: params.get('pathway') || undefined,
      zone: params.get('zone') || undefined,
      min_soh: params.get('min_soh') || undefined,
      max_soh: params.get('max_soh') || undefined,
      max_eol: params.get('max_eol') || undefined,
      anomaly_only: params.get('anomaly_only') === '1',
      confidence_band: params.get('confidence_band') || undefined,
      search: params.get('search') || undefined,
      lifecycle_status: params.get('lifecycle_status') || undefined,
      sort_by: sort,
      order,
    }),
    [params, sort, order],
  )

  const { data, error, loading, reload } = useAsync(
    () => (mode === 'fleet' ? api.fleet(filters) : api.batteries(filters)),
    [mode, JSON.stringify(filters)],
  )

  // Debounce the search box so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(params)
      if (search) next.set('search', search)
      else next.delete('search')
      setParams(next, { replace: true })
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }

  const th = meta?.thresholds
  const rows = mode === 'fleet' ? (data?.batteries ?? []) : (data?.batteries ?? [])
  const zones = useMemo(() => Array.from(new Set(rows.map((r) => r.zone))).sort(), [rows])

  const toggleSort = (key: string) => {
    if (sort === key) setOrder(order === 'asc' ? 'desc' : 'asc')
    else {
      setSort(key)
      setOrder('desc')
    }
  }

  const arrow = (k: string) => (sort === k ? (order === 'asc' ? ' ▲' : ' ▼') : '')

  return (
    <>
      <PageHeader
        title={mode === 'fleet' ? 'Fleet Overview' : 'Battery Intelligence'}
        subtitle={
          mode === 'fleet'
            ? 'Every battery in the active dataset with its health, degradation trend and assigned lifecycle pathway.'
            : 'Per-battery supporting signals: SOH, trend, estimated EOL horizon, anomaly score and data confidence.'
        }
        actions={
          <a href={api.exportUrl(filters)} download className="btn">
            <FileText size={14} /> Export CSV
          </a>
        }
      />

      <Notice kind="warn">
        Battery intelligence is <b>supporting information</b>, not a waste decision. An anomaly is a{' '}
        <b>signal requiring inspection</b>, never a confirmed fault. RUL and EOL horizons are{' '}
        <b>estimates</b>.
      </Notice>

      {/* ---------- filters ---------- */}
      <Card className="mt-4">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <div>
            <label className="label" htmlFor="f-search">
              Search
            </label>
            <input
              id="f-search"
              data-testid="filter-search"
              className="input"
              placeholder="Battery or vehicle id"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="f-pathway">
              Pathway
            </label>
            <select
              id="f-pathway"
              data-testid="filter-pathway"
              className="input"
              value={params.get('pathway') ?? ''}
              onChange={(e) => setParam('pathway', e.target.value || null)}
            >
              <option value="">All pathways</option>
              {Object.entries(PATHWAY_META).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="f-zone">
              Zone
            </label>
            <select
              id="f-zone"
              data-testid="filter-zone"
              className="input"
              value={params.get('zone') ?? ''}
              onChange={(e) => setParam('zone', e.target.value || null)}
            >
              <option value="">All zones</option>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="f-conf">
              Data confidence
            </label>
            <select
              id="f-conf"
              className="input"
              value={params.get('confidence_band') ?? ''}
              onChange={(e) => setParam('confidence_band', e.target.value || null)}
            >
              <option value="">Any confidence</option>
              <option value="High">High</option>
              <option value="Moderate">Moderate</option>
              <option value="Low">Low</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="f-sohmax">
              SOH at most (%)
            </label>
            <input
              id="f-sohmax"
              data-testid="filter-soh-max"
              className="input"
              type="number"
              min={0}
              max={100}
              placeholder="e.g. 80"
              value={params.get('max_soh') ?? ''}
              onChange={(e) => setParam('max_soh', e.target.value || null)}
            />
          </div>
          <div>
            <label className="label" htmlFor="f-eolmax">
              EOL within (months)
            </label>
            <input
              id="f-eolmax"
              data-testid="filter-eol-max"
              className="input"
              type="number"
              min={0}
              placeholder="e.g. 6"
              value={params.get('max_eol') ?? ''}
              onChange={(e) => setParam('max_eol', e.target.value || null)}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-[12.5px] text-ink-700">
            <input
              type="checkbox"
              data-testid="filter-anomaly"
              checked={params.get('anomaly_only') === '1'}
              onChange={(e) => setParam('anomaly_only', e.target.checked ? '1' : null)}
              className="h-3.5 w-3.5 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
            />
            Anomaly flagged only
          </label>
          <button
            className="btn btn-sm"
            data-testid="filter-reset"
            onClick={() => {
              setSearch('')
              setParams(new URLSearchParams(), { replace: true })
            }}
          >
            Reset filters
          </button>
          <span className="ml-auto text-[12.5px] text-ink-500" data-testid="row-count">
            <b className="tnum text-ink-900">{rows.length}</b> match
            {mode === 'fleet' && data && 'total_in_dataset' in data
              ? ` of ${data.total_in_dataset}`
              : ''}
          </span>
        </div>
      </Card>

      {/* ---------- table ---------- */}
      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : loading && !data ? (
        <Spinner label="Loading batteries" />
      ) : (
        <Card className="mt-4" padded={false}>
          <div className="scroll-thin max-h-[68vh] overflow-auto">
            <table className="table-base" data-testid="fleet-table">
              <thead className="sticky top-0 z-10 bg-ink-50">
                <tr>
                  <th>
                    <button onClick={() => toggleSort('battery_id')} className="hover:text-ink-800">
                      Battery{arrow('battery_id')}
                    </button>
                  </th>
                  <th>Vehicle</th>
                  <th>Zone</th>
                  <th>
                    <button onClick={() => toggleSort('soh')} className="hover:text-ink-800">
                      SOH{arrow('soh')}
                    </button>
                  </th>
                  <th>
                    <button onClick={() => toggleSort('eol')} className="hover:text-ink-800">
                      Est. EOL{arrow('eol')}
                    </button>
                  </th>
                  <th>Trend</th>
                  <th>Anomaly</th>
                  <th>Confidence</th>
                  <th>Pathway</th>
                  <th>Lifecycle</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr
                    key={b.battery_id}
                    data-testid={`battery-row-${b.battery_id}`}
                    className="cursor-pointer"
                    onClick={() => navigate(`/batteries/${b.battery_id}`)}
                  >
                    <td>
                      <span className="font-semibold text-brand-700">{b.battery_id}</span>
                      <div className="text-[10.5px] text-ink-400">{b.battery_uid}</div>
                    </td>
                    <td>
                      <div className="text-[12px] text-ink-700">{b.vehicle_id}</div>
                      <div className="text-[10.5px] text-ink-400">{b.vehicle_model}</div>
                    </td>
                    <td className="text-[12px] text-ink-600">{b.zone}</td>
                    <td>
                      <div
                        className={`font-semibold tnum ${sohTone(b.soh_pct, th?.eol_soh_pct ?? 80, th?.second_life_floor_soh_pct ?? 55)}`}
                      >
                        {b.soh_pct.toFixed(1)}%
                      </div>
                      <div className="mt-0.5 w-16">
                        <Meter
                          value={b.soh_pct}
                          tone={
                            b.soh_pct <= (th?.second_life_floor_soh_pct ?? 55)
                              ? 'bg-rose-500'
                              : b.soh_pct <= (th?.eol_soh_pct ?? 80)
                                ? 'bg-amber-500'
                                : 'bg-brand-500'
                          }
                          height="h-1"
                        />
                      </div>
                    </td>
                    <td className="tnum text-[12px]">
                      {b.eol_in_months === null ? (
                        <span className="text-ink-400">no estimate</span>
                      ) : (
                        months(b.eol_in_months)
                      )}
                    </td>
                    <td className="text-[11.5px]">
                      <span
                        className={
                          b.trend.trend_direction === 'DEGRADING' ? 'text-amber-700' : 'text-ink-500'
                        }
                      >
                        {b.trend.trend_direction.replace(/_/g, ' ')}
                      </span>
                      {b.trend.monthly_degradation_pct !== null && (
                        <div className="text-[10.5px] tnum text-ink-400">
                          {b.trend.monthly_degradation_pct.toFixed(2)}%/mo
                        </div>
                      )}
                    </td>
                    <td>
                      {b.anomaly_status === 'POTENTIAL_ANOMALY' ? (
                        <span className="badge border-amber-300 bg-amber-50 text-amber-800">
                          <ShieldAlert size={10} /> signal {b.anomaly_score.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-[11.5px] text-ink-400">no signal</span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <div className="w-12">
                          <Meter value={b.data_confidence} tone={confTone(b.data_confidence)} height="h-1" />
                        </div>
                        <span className="text-[11px] tnum text-ink-600">{b.data_confidence.toFixed(0)}</span>
                      </div>
                      <span className={`badge mt-0.5 ${CONFIDENCE_TONE[b.confidence_band]}`}>
                        {b.confidence_band}
                      </span>
                    </td>
                    <td>
                      {b.pathway && (
                        <span className={`badge ${PATHWAY_META[b.pathway as Pathway]?.tone}`}>
                          {PATHWAY_META[b.pathway as Pathway]?.short ?? b.pathway}
                        </span>
                      )}
                    </td>
                    <td className="text-[11px] text-ink-500">
                      {b.lifecycle_status.replace(/_/g, ' ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && (
            <EmptyState
              message="No batteries match these filters"
              hint="Adjust the filters, or load the demo fleet."
            />
          )}
        </Card>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Battery detail
// ---------------------------------------------------------------------------

export function BatteryDetail() {
  const { id = '' } = useParams()
  const { meta } = useApp()
  const { push } = useToast()
  const { data, error, loading, reload } = useAsync(() => api.battery(id), [id])
  const [expl, setExpl] = useState<Awaited<ReturnType<typeof api.explain>> | null>(null)
  const [busy, setBusy] = useState(false)

  const explain = async () => {
    setBusy(true)
    try {
      setExpl(await api.explain(id, false))
    } catch (e) {
      push(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  const record = async (pathway: string) => {
    setBusy(true)
    try {
      await api.recordIntervention(id, pathway, 'operator')
      push('Decision recorded in the lifecycle audit trail.', 'success')
      reload()
    } catch (e) {
      push(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading && !data) return <Spinner label="Loading battery" />
  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (!data) return <ErrorBox message="Battery not found" />

  const b = data.battery
  const p = data.pathway
  const lc = data.lifecycle
  const th = meta?.thresholds

  return (
    <>
      <Link to="/batteries" className="mb-3 inline-flex items-center gap-1 text-[12.5px] text-ink-500 hover:text-ink-800">
        <ArrowLeft size={13} /> Back to batteries
      </Link>

      <PageHeader
        title={b.battery_id}
        subtitle={`${b.vehicle_id} · ${b.vehicle_model} · ${b.chemistry} · ${b.rating_label} · ${b.zone}`}
        actions={
          <>
            <span className={`badge ${PATHWAY_META[p.pathway as Pathway]?.tone}`}>
              {p.pathway_label}
            </span>
            <button className="btn" onClick={explain} disabled={busy}>
              <Sparkles size={14} /> {busy ? 'Working…' : 'Explain this decision'}
            </button>
          </>
        }
      />

      <Notice kind={b.data_source === 'SIMULATED' ? 'warn' : 'info'}>
        {b.simulation_notice}
      </Notice>

      {/* ---------- headline ---------- */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="State of Health"
          value={`${b.soh_pct.toFixed(1)}%`}
          sub={`model range ${b.soh_low_pct.toFixed(1)}–${b.soh_high_pct.toFixed(1)}%`}
          tone={b.soh_pct <= (th?.eol_soh_pct ?? 80) ? 'warn' : 'good'}
          testId="detail-soh"
        />
        <Kpi
          label="Estimated EOL horizon"
          value={b.eol_in_months === null ? 'No estimate' : months(b.eol_in_months)}
          sub={
            b.eol_range
              ? `range ${b.eol_range.low.toFixed(0)}–${b.eol_range.high.toFixed(0)} mo`
              : 'insufficient history'
          }
        />
        <Kpi
          label="Data confidence"
          value={`${b.data_confidence.toFixed(0)}%`}
          sub={b.confidence_band}
          tone={b.data_confidence >= 75 ? 'good' : b.data_confidence >= 50 ? 'warn' : 'bad'}
        />
        <Kpi
          label="Anomaly score"
          value={b.anomaly_score.toFixed(2)}
          sub={b.anomaly_status === 'POTENTIAL_ANOMALY' ? 'signal — inspect' : 'no signal'}
          tone={b.anomaly_status === 'POTENTIAL_ANOMALY' ? 'warn' : 'default'}
        />
        <Kpi label="Battery age" value={`${b.battery_age_months} mo`} sub={`${num(b.charging_cycles)} cycles`} />
        <Kpi
          label="Est. range now"
          value={`${num(Math.round(b.soh_pct))}%`}
          sub={`of ${b.rating_label} pack`}
        />
      </div>

      {/* ---------- explanation ---------- */}
      {b.anomaly_status === 'POTENTIAL_ANOMALY' && (
        <div className="mt-4">
          <Notice kind="warn">
            <b>Potential anomaly detected — technical inspection recommended.</b> This is a signal
            derived from telemetry, not a confirmed battery fault.
          </Notice>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* ---------- prevention ---------- */}
        <Card
          className="lg:col-span-2"
          title="Waste pathway decision"
          subtitle={`Assigned by ${p.decision_basis}`}
        >
          <Notice kind={p.pathway === 'EOL_CANDIDATE' ? 'danger' : 'good'}>{p.wording}</Notice>

          <h3 className="mb-2 mt-4 text-[12px] font-bold uppercase tracking-wide text-ink-500">
            Rules that fired ({p.rule_count})
          </h3>
          <ul className="space-y-1.5" data-testid="rules-list">
            {p.rules_fired.map((r, i) => (
              <li
                key={i}
                className="rounded-lg border border-ink-200 bg-ink-50/50 px-3 py-2"
              >
                <div className="text-[12.5px] leading-snug text-ink-800">{r.statement}</div>
                <div className="mt-0.5 font-mono text-[10.5px] text-ink-400">
                  {r.rule} · {JSON.stringify(r.evidence)}
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Kpi
              label="Potential waste avoided"
              value={`${p.potential_avoided_units} unit`}
              sub={`${p.potential_avoided_waste_kg.toFixed(0)} kg`}
              tone={p.potential_avoided_units > 0 ? 'good' : 'default'}
            />
            <Kpi label="Est. intervention cost" value={inr(p.estimated_intervention_cost_inr)} />
          </div>

          {p.requires_technical_assessment && (
            <div className="mt-3">
              <Notice kind="warn">
                Requires <b>technical assessment</b>. EVolve AI does not certify this pack fit for
                repair, reuse or any second-life application.
              </Notice>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2 border-t border-ink-200 pt-3">
            <button className="btn btn-primary" disabled={busy} onClick={() => record(p.pathway)}>
              <ClipboardCheck size={14} /> Record {PATHWAY_META[p.pathway as Pathway]?.short} decision
            </button>
            <Link to="/prevention" className="btn">
              Compare all pathways
            </Link>
          </div>
        </Card>

        {/* ---------- signals ---------- */}
        <div className="space-y-4">
          <Card title="Degradation trend">
            <div className="text-[12.5px] text-ink-700">
              <b>{b.trend.trend_direction.replace(/_/g, ' ')}</b>
              {b.trend.monthly_degradation_pct !== null && (
                <span className="tnum">
                  {' '}
                  at {b.trend.monthly_degradation_pct.toFixed(2)}%/month
                </span>
              )}
            </div>
            <MethodNote>{b.trend.note}</MethodNote>

            <div className="mt-4 space-y-2 text-[12px]">
              <div className="flex justify-between">
                <span className="text-ink-600">Peak cell temperature</span>
                <span className="tnum font-semibold">{b.temperature.peak_c.toFixed(1)} °C</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-600">History max</span>
                <span className="tnum">{b.temperature.history_max_c?.toFixed(1) ?? '—'} °C</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-600">Fast-charge share</span>
                <span className="tnum">{(b.fast_charge_ratio * 100).toFixed(0)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-600">Charge cycles</span>
                <span className="tnum">{num(b.charging_cycles)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-600">Daily distance</span>
                <span className="tnum">{b.daily_km} km</span>
              </div>
            </div>
          </Card>

          <Card title="Data quality">
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] text-ink-600">Confidence</span>
              <span className={`badge ${CONFIDENCE_TONE[b.confidence_band]}`}>
                {b.confidence_band}
              </span>
            </div>
            <div className="mt-2">
              <Meter value={b.data_confidence} tone={confTone(b.data_confidence)} height="h-2" />
            </div>
            {b.data_quality_issues.length > 0 ? (
              <ul className="mt-3 space-y-1">
                {b.data_quality_issues.map((i, idx) => (
                  <li key={idx} className="flex items-start gap-1.5 text-[11.5px] text-ink-600">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                    {i}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[11.5px] text-brand-700">No data-quality issues detected.</p>
            )}
            <p className="mt-3 text-[11px] leading-snug text-ink-400">{b.eol_estimate_note}</p>
          </Card>
        </div>
      </div>

      {/* ---------- trend chart ---------- */}
      <Card
        className="mt-4"
        title="Degradation history"
        subtitle={`${lc.degradation_series.length} monthly readings`}
      >
        <DegradationLineChart
          data={lc.degradation_series.map((d) => ({ month_index: d.month_index, soh_pct: d.soh_pct }))}
          eolThreshold={th?.eol_soh_pct ?? 80}
        />
      </Card>

      {/* ---------- lifecycle ---------- */}
      <Card
        className="mt-4"
        title="Lifecycle timeline"
        subtitle={`Battery Lifecycle ID ${lc.battery_lifecycle_id}`}
      >
        <ol className="relative space-y-3 border-l border-ink-200 pl-5">
          {lc.events.map((e, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-500" />
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[12.5px] font-semibold text-ink-900">
                  {e.event.replace(/_/g, ' ')}
                </span>
                <span className="text-[11px] text-ink-400">{shortDate(e.occurred_at)}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11.5px] text-ink-500">
                {e.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={10} /> {e.location}
                  </span>
                )}
                {e.handler && <span>Handler: {e.handler}</span>}
                {e.evidence_ref && (
                  <span className="font-mono text-[10.5px] text-ink-400">{e.evidence_ref}</span>
                )}
              </div>
            </li>
          ))}
        </ol>

        {lc.recycling && (
          <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50/50 px-3.5 py-3">
            <div className="text-[12px] font-semibold text-brand-800">Downstream record</div>
            <div className="mt-1.5 grid gap-2 text-[12px] sm:grid-cols-3">
              <div>
                <div className="text-ink-500">Route</div>
                <div className="font-semibold">{lc.recycling.route}</div>
              </div>
              <div>
                <div className="text-ink-500">Received</div>
                <div>{shortDate(lc.recycling.received_at)}</div>
              </div>
              <div>
                <div className="text-ink-500">Material recovered</div>
                <div className="tnum">{lc.recycling.material_recovered_pct ?? '—'}%</div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {(['COLLECTION_SCHEDULED', 'COLLECTED', 'TECHNICAL_ASSESSMENT', 'PROCESSED'] as const)
            .filter((step) => !lc.events.some((e) => e.event === step))
            .map((step) => (
              <span key={step} className="badge border-ink-200 bg-ink-50 text-ink-400">
                <Calendar size={10} /> {step.replace(/_/g, ' ')} pending
              </span>
            ))}
        </div>

        <Notice kind="info">
          <b>{lc.evidence_note}</b>
        </Notice>
      </Card>

      {/* ---------- GenAI explanation ---------- */}
      <Card
        className="mt-4"
        title="Plain-English explanation"
        subtitle="Generated only from the backend numbers shown on this page"
        actions={
          <span className={`badge ${expl?.source === 'genai' ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-sky-300 bg-sky-50 text-sky-800'}`}>
            {expl ? `source: ${expl.source}` : 'not generated'}
          </span>
        }
      >
        {expl ? (
          <div data-testid="explanation-text">
            <p className="text-[13px] leading-relaxed text-ink-800">{expl.explanation}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-500">
              <span>GenAI key configured: {String(expl.genai_key_configured)}</span>
              {expl.fallback_reason && (
                <span className="badge border-amber-300 bg-amber-50 text-amber-800">
                  fallback: {expl.fallback_reason}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[11.5px] text-ink-400">{expl.note}</p>
            <details className="mt-3">
              <summary className="cursor-pointer text-[12px] font-medium text-ink-500 hover:text-ink-800">
                Show the exact backend facts this text came from
              </summary>
              <pre className="scroll-thin mt-2 max-h-72 overflow-auto rounded-lg border border-ink-200 bg-ink-950 p-3 font-mono text-[11px] leading-relaxed text-ink-100">
                {JSON.stringify(expl.facts_used, null, 2)}
              </pre>
            </details>
          </div>
        ) : (
          <EmptyState
            message="No explanation generated yet"
            hint="Click 'Explain this decision'. Works with or without a GenAI API key."
          />
        )}
        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-ink-400">
          <Search size={11} className="mt-0.5 shrink-0" />
          The language model only explains values already computed by the ML models and the
          prevention rules engine. It never produces a number.
        </p>
      </Card>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/collection" className="btn btn-sm">
          <BatteryCharging size={13} /> EOL collection queue
        </Link>
        <Link to="/circularity" className="btn btn-sm">
          <TrendingDown size={13} /> Circularity &amp; traceability
        </Link>
      </div>
    </>
  )
}