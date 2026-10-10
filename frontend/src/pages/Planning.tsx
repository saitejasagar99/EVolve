import { Link } from 'react-router-dom'
import { AlertTriangle, Factory, GitCompare, MapPin } from 'lucide-react'
import { useState } from 'react'
import { useApp, useAsync, useToast } from '../context/AppContext'
import { api } from '../services/api'
import type { SimulateParams } from '../services/api'
import {
  CapacityBarChart,
  CumulativeEolChart,
  EolForecastChart,
  ScenarioCompareChart,
} from '../components/charts'
import {
  Card,
  EmptyState,
  ErrorBox,
  Kpi,
  MethodNote,
  Meter,
  Notice,
  PageHeader,
  Spinner,
} from '../components/ui'
import { num, titleise } from '../lib/format'

/** Metrics the scenario chart compares, typed against the run payload. */
type ScenarioMetricKey =
  | 'potential_eol_12_months'
  | 'eol_candidates'
  | 'intervention_candidates'
  | 'retained_batteries'
  | 'potential_waste_avoided_units'
  | 'collection_batches'
  | 'circularity_score'

const SCENARIO_METRICS: Array<[ScenarioMetricKey, string]> = [
  ['potential_eol_12_months', 'Potential EOL (12 mo)'],
  ['eol_candidates', 'EOL candidates'],
  ['intervention_candidates', 'Intervention candidates'],
  ['retained_batteries', 'Retained batteries'],
  ['potential_waste_avoided_units', 'Waste avoided (units)'],
  ['collection_batches', 'Collection batches'],
  ['circularity_score', 'Circularity score'],
]

// ---------------------------------------------------------------------------
// Future Waste Forecast
// ---------------------------------------------------------------------------

export function ForecastPage() {
  const { meta } = useApp()
  const { data, error, loading, reload } = useAsync(() => api.forecast(), [])

  if (loading && !data) return <Spinner label="Computing forecast" />
  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (!data) return <ErrorBox message="No forecast returned" />

  const { horizons } = data

  return (
    <>
      <PageHeader
        title="Future Battery Waste Forecast"
        subtitle="Which batteries may become waste, when, and how confident that estimate is."
      />

      <Notice kind="warn">
        <b>Forecast / estimate — not a guaranteed failure date.</b> These are ML projections on
        synthetic data, intended for waste-exposure planning.
      </Notice>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {(['3', '6', '12'] as const).map((h) => {
          const block = horizons[`next_${h}_months`]
          return (
            <Kpi
              key={h}
              label={`Potential EOL — next ${h} months`}
              value={num(block?.predicted_eol_count ?? 0)}
              testId={`forecast-${h}m`}
              tone={h === '3' ? 'bad' : h === '6' ? 'warn' : 'default'}
              sub={
                block?.mean_confidence !== null && block?.mean_confidence !== undefined
                  ? `mean confidence ${block.mean_confidence.toFixed(0)}%`
                  : undefined
              }
            />
          )
        })}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Horizon breakdown" subtitle="Counts with data-confidence breakdown">
          <table className="table-base">
            <thead>
              <tr>
                <th>Horizon</th>
                <th className="text-right">Count</th>
                <th className="text-right">High conf.</th>
                <th className="text-right">Mod./Low</th>
                <th className="text-right">Mean conf.</th>
              </tr>
            </thead>
            <tbody>
              {(['3', '6', '12'] as const).map((h) => {
                const b = horizons[`next_${h}_months`]
                return (
                  <tr key={h}>
                    <td>Next {h} months</td>
                    <td className="text-right tnum font-semibold">{b?.predicted_eol_count ?? 0}</td>
                    <td className="text-right tnum text-brand-700">{b?.high_confidence_count ?? 0}</td>
                    <td className="text-right tnum text-amber-700">
                      {b?.moderate_or_low_confidence_count ?? 0}
                    </td>
                    <td className="text-right tnum">
                      {b?.mean_confidence !== null && b?.mean_confidence !== undefined
                        ? b.mean_confidence.toFixed(0)
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="mt-3 space-y-1 text-[11.5px] text-ink-500">
            <div>Batteries analysed: <b className="tnum">{data.totals.batteries_analysed}</b></div>
            <div>In service: <b className="tnum">{data.totals.in_service}</b></div>
            <div>Already EOL or beyond: <b className="tnum">{data.totals.already_eol_or_beyond}</b></div>
          </div>
          {data.totals.excluded_insufficient_history > 0 && (
            <div className="mt-2">
              <Notice kind="warn">{data.totals.excluded_note}</Notice>
            </div>
          )}
        </Card>

        <Card title="Peak exposure" subtitle="Highest expected monthly inflow">
          {data.peak_month ? (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-ink-500">Peak month</div>
              <div className="text-[30px] font-bold tnum text-ink-900">
                {data.peak_month.expected_eol.toFixed(1)}{' '}
                <span className="text-[14px] font-medium text-ink-500">units / month</span>
              </div>
              <div className="mt-1 text-[12.5px] text-ink-600">
                Month {data.peak_month.month} of the {meta?.thresholds.forecast_horizon_months ?? 12}
                -month horizon
              </div>
              {data.high_risk_zone && (
                <div className="mt-3 flex items-center gap-1.5 text-[12.5px]">
                  <MapPin size={13} className="text-rose-600" />
                  Highest-exposure zone: <b>{data.high_risk_zone.zone}</b> (
                  <span className="tnum">{data.high_risk_zone.eol_next_12}</span> units / 12 mo)
                </div>
              )}
            </div>
          ) : (
            <EmptyState message="No EOL inflow forecast" />
          )}
          <MethodNote>{data.method}</MethodNote>
        </Card>
      </div>

      <Card
        className="mt-4"
        title="Expected EOL by month"
        subtitle="Forecast inflow per month across the horizon, with the running total"
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
              Monthly inflow
            </h3>
            <EolForecastChart
              data={data.monthly_forecast}
              thresholds={{
                  eol: data.peak_month?.expected_eol ?? 0,
                  critical: meta?.thresholds.eol_soh_pct ?? 80,
                }}
            />
          </div>
          <div>
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
              Cumulative exposure
            </h3>
            <CumulativeEolChart data={data.monthly_forecast} />
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-ink-400">
          Monthly inflow is a deliberate smoothing: each pack's contribution is spread evenly
          across the months up to its own estimated EOL horizon. That is an assumption about
          arrival distribution, not a claim about the exact month a pack will fail.
        </p>
      </Card>

      <Card
        className="mt-4"
        title="Expected EOL trend by chemistry"
        subtitle="Composition of the in-service fleet, which drives the forecast"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {Object.entries(data.by_chemistry).map(([chem, count]) => (
            <div key={chem} className="rounded-lg border border-ink-200 px-3 py-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                {chem}
              </div>
              <div className="text-[22px] font-bold tnum text-ink-900">{count}</div>
              <div className="mt-1">
                <Meter
                  value={count}
                  max={Math.max(...Object.values(data.by_chemistry))}
                  tone={chem === 'NMC' ? 'bg-sky-500' : 'bg-brand-500'}
                  height="h-1"
                />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11.5px] text-ink-400">{data.disclaimer}</p>
      </Card>

      <div className="mt-4">
        <Link to="/capacity" className="btn">
          <Factory size={14} /> Check processing capacity against this forecast
        </Link>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Capacity Planning
// ---------------------------------------------------------------------------

export function CapacityPage() {
  const { data, error, loading, reload } = useAsync(() => api.capacity(), [])

  if (loading && !data) return <Spinner label="Checking capacity" />
  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (!data) return <ErrorBox message="No capacity plan returned" />

  const mismatch = data.status === 'CAPACITY_MISMATCH'

  return (
    <>
      <PageHeader
        title="Collection & Processing Capacity Planning"
        subtitle="Does downstream capacity keep up with predicted EOL inflow? This is where a collection plan quietly fails."
      />

      <div
        className={`notice ${mismatch ? 'notice-danger' : 'notice-good'} flex items-start gap-2.5`}
        data-testid="capacity-status"
      >
        {mismatch ? (
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        ) : (
          <Factory size={16} className="mt-0.5 shrink-0" />
        )}
        <div>
          <div className="font-bold">{data.status.replace(/_/g, ' ')}</div>
          <div className="mt-0.5">{data.recommendation}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Peak monthly inflow"
          value={data.demand.peak_monthly_units.toFixed(1)}
          testId="cap-inflow"
          tone={mismatch ? 'bad' : 'default'}
        />
        <Kpi
          label="Processing capacity"
          value={num(data.supply.processing_capacity_units_per_month)}
          sub="units / month"
          testId="cap-capacity"
        />
        <Kpi
          label="Processing gap"
          value={data.gap.processing_gap_units.toFixed(1)}
          tone={data.gap.processing_gap_units > 0 ? 'bad' : 'good'}
          sub={
            data.gap.processing_utilisation_pct !== null
              ? `${data.gap.processing_utilisation_pct.toFixed(0)}% utilised`
              : undefined
          }
        />
        <Kpi
          label="Refurbishment capacity"
          value={num(data.supply.refurbishment_capacity_units_per_month)}
          sub="units / month"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Inflow vs capacity" subtitle="Peak and mean month against available processing">
          <CapacityBarChart
            data={[
              {
                label: 'Peak',
                inflow: data.demand.peak_monthly_units,
                capacity: data.supply.processing_capacity_units_per_month,
              },
              {
                label: 'Mean',
                inflow: data.demand.mean_monthly_units,
                capacity: data.supply.processing_capacity_units_per_month,
              },
              {
                label: 'Collection',
                inflow: data.demand.peak_monthly_units,
                capacity: data.supply.collection_capacity_units_per_month,
              },
            ]}
          />
          <MethodNote>{data.method}</MethodNote>
        </Card>

        <Card title="Downstream handlers" subtitle="Capacity sourced from the handlers table, not hardcoded">
          <table className="table-base">
            <thead>
              <tr>
                <th>Handler</th>
                <th>Type</th>
                <th>Zone</th>
                <th className="text-right">Units/mo</th>
                <th>Certification</th>
              </tr>
            </thead>
            <tbody>
              {data.handlers.map((h) => (
                <tr key={h.handler_id}>
                  <td>
                    <div className="font-medium text-ink-800">{h.name}</div>
                    <div className="font-mono text-[10.5px] text-ink-400">{h.handler_id}</div>
                  </td>
                  <td className="text-[12px]">{titleise(h.kind)}</td>
                  <td className="text-[12px] text-ink-600">{h.zone}</td>
                  <td className="text-right tnum font-semibold">{h.monthly_capacity_units}</td>
                  <td>
                    {h.certification_status === 'VERIFIED' ? (
                      <span className="badge border-brand-300 bg-brand-50 text-brand-800">
                        verified
                      </span>
                    ) : (
                      <span className="badge border-amber-300 bg-amber-50 text-amber-800">
                        unverified
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.unverified_handler_count > 0 && (
            <div className="mt-3">
              <Notice kind="warn">{data.unverified_handler_note}</Notice>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/optimizer" className="btn">
          <GitCompare size={14} /> Optimise collection batches
        </Link>
        <Link to="/simulator" className="btn">
          <Factory size={14} /> Test a capacity change
        </Link>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// What-if Simulator
// ---------------------------------------------------------------------------

const SIM_DEFAULTS: SimulateParams = {
  fleet_scale: 1.0,
  intervention_rate: 1.0,
  repair_capacity: 18,
  second_life_capacity: 12,
  recycling_capacity: 30,
  collection_capacity: 40,
  collection_trips: 8,
}

export function SimulatorPage() {
  const { push } = useToast()
  const [params, setParams] = useState<SimulateParams>(SIM_DEFAULTS)
  const [run, setRun] = useState<Awaited<ReturnType<typeof api.runScenario>> | null>(null)
  const [busy, setBusy] = useState(false)

  const runScenario = async (p: SimulateParams) => {
    setBusy(true)
    try {
      const r = await api.runScenario(p)
      setRun(r)
      setParams(p)
    } catch (e) {
      push(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  const set = (k: keyof SimulateParams, v: number) => setParams((prev) => ({ ...prev, [k]: v }))

  const compareKeys = SCENARIO_METRICS

  return (
    <>
      <PageHeader
        title="Waste Reduction What-if Simulator"
        subtitle="Change fleet size, intervention capacity or budget and see the downstream effect on waste, collection demand and circularity."
        actions={
          <Link to="/twin" className="btn">
            <GitCompare size={14} /> Named scenarios
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-4">
        {/* ---------- controls ---------- */}
        <Card title="Scenario parameters" subtitle="All values are inputs to the same rules engine">
          <div className="space-y-4">
            <Slider
              label="Fleet size"
              hint="Multiplies the fleet; duty cycles are jittered from real profiles"
              value={params.fleet_scale ?? 1}
              min={0.5}
              max={3}
              step={0.05}
              display={`${((params.fleet_scale ?? 1) * 100).toFixed(0)}%`}
              onChange={(v) => set('fleet_scale', v)}
              testId="sim-fleet"
            />
            <Slider
              label="Intervention rate"
              hint="Share of prevention candidates actually funded"
              value={params.intervention_rate ?? 1}
              min={0}
              max={1}
              step={0.05}
              display={`${((params.intervention_rate ?? 1) * 100).toFixed(0)}%`}
              onChange={(v) => set('intervention_rate', v)}
              testId="sim-intervention"
            />
            <Slider
              label="Repair capacity"
              hint="Units per period; overflow falls back to EOL"
              value={params.repair_capacity ?? 18}
              min={0}
              max={80}
              step={1}
              display={`${params.repair_capacity} units`}
              onChange={(v) => set('repair_capacity', v)}
              testId="sim-repair"
            />
            <Slider
              label="Second-life capacity"
              hint="Assessment slots per period"
              value={params.second_life_capacity ?? 12}
              min={0}
              max={80}
              step={1}
              display={`${params.second_life_capacity} units`}
              onChange={(v) => set('second_life_capacity', v)}
              testId="sim-secondlife"
            />
            <Slider
              label="Recycling capacity"
              hint="Processing units per month"
              value={params.recycling_capacity ?? 30}
              min={0}
              max={120}
              step={1}
              display={`${params.recycling_capacity} /mo`}
              onChange={(v) => set('recycling_capacity', v)}
              testId="sim-recycling"
            />
            <Slider
              label="Collection capacity"
              hint="Collection units per month"
              value={params.collection_capacity ?? 40}
              min={0}
              max={200}
              step={5}
              display={`${params.collection_capacity} /mo`}
              onChange={(v) => set('collection_capacity', v)}
              testId="sim-collection"
            />
            <Slider
              label="Collection trips"
              hint="Available trips per month"
              value={params.collection_trips ?? 8}
              min={0}
              max={40}
              step={1}
              display={`${params.collection_trips} trips`}
              onChange={(v) => set('collection_trips', v)}
              testId="sim-trips"
            />
          </div>

          <div className="mt-4 flex gap-2 border-t border-ink-200 pt-3">
            <button
              className="btn btn-primary flex-1"
              disabled={busy}
              onClick={() => runScenario(params)}
              data-testid="sim-run"
            >
              {busy ? 'Running…' : 'Run scenario'}
            </button>
            <button className="btn" onClick={() => setParams(SIM_DEFAULTS)}>
              Reset
            </button>
          </div>
        </Card>

        {/* ---------- results ---------- */}
        <div className="space-y-4 lg:col-span-3">
          {!run ? (
            <Card>
              <EmptyState
                message="No scenario run yet"
                hint="Adjust a parameter and press 'Run scenario'. The engine re-runs the same models and the same rules over a resampled fleet."
              />
            </Card>
          ) : (
            <>
              <div
                className={`notice ${run.capacity.status === 'CAPACITY_MISMATCH' ? 'notice-danger' : 'notice-good'}`}
                data-testid="sim-capacity"
              >
                <b>{run.capacity.status.replace(/_/g, ' ')}.</b> Peak inflow{' '}
                {run.capacity.peak_monthly_inflow.toFixed(1)} /mo vs processing capacity{' '}
                {run.capacity.processing_capacity_units_per_month} /mo
                {run.capacity.processing_gap_units > 0 && (
                  <> — gap of {run.capacity.processing_gap_units.toFixed(1)} units/month.</>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {run.delta.potential_eol_12_months && (
                  <Kpi
                    label="Potential EOL · 12 mo"
                    value={num(run.results.potential_eol_12_months)}
                    sub={`${run.delta.potential_eol_12_months.change >= 0 ? '+' : ''}${run.delta.potential_eol_12_months.change} vs current`}
                    tone={
                      run.delta.potential_eol_12_months.change > 0
                        ? 'bad'
                        : run.delta.potential_eol_12_months.change < 0
                          ? 'good'
                          : 'default'
                    }
                    testId="sim-eol12"
                  />
                )}
                {run.delta.intervention_candidates && (
                  <Kpi
                    label="Intervention candidates"
                    value={num(run.results.intervention_candidates)}
                    sub={`${run.delta.intervention_candidates.change >= 0 ? '+' : ''}${run.delta.intervention_candidates.change} vs current`}
                    tone={
                      run.delta.intervention_candidates.change > 0 ? 'good' : 'default'
                    }
                  />
                )}
                {run.delta.potential_waste_avoided_units && (
                  <Kpi
                    label="Waste avoided"
                    value={num(run.results.potential_waste_avoided_units)}
                    sub="units retained"
                    tone="good"
                  />
                )}
                {run.delta.circularity_score && (
                  <Kpi
                    label="Circularity"
                    value={run.results.circularity_score.toFixed(1)}
                    sub={`${run.delta.circularity_score.change >= 0 ? '+' : ''}${run.delta.circularity_score.change}`}
                    tone={run.delta.circularity_score.change >= 0 ? 'good' : 'warn'}
                  />
                )}
              </div>

              <Card
                className="mt-4"
                title="Current vs scenario"
                subtitle="Every published metric the simulator can move"
              >
                <ScenarioCompareChart
                  data={compareKeys
                    .filter(([k]) => run.delta[k] !== undefined)
                    .map(([k, label]) => ({
                      label,
                      baseline: run.delta[k]?.baseline ?? 0,
                      scenario: run.delta[k]?.scenario ?? 0,
                    }))}
                  metric="value"
                />
              </Card>

              <Card className="mt-4" title="Scenario detail" subtitle="Method and known limitations">
                <p className="text-[12.5px] leading-relaxed text-ink-700">{run.method}</p>
                <ul className="mt-3 space-y-1">
                  {run.limitations.map((l, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[12px] text-ink-600">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                      {l}
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  )
}

function Slider({
  label,
  hint,
  value,
  min,
  max,
  step,
  display,
  onChange,
  testId,
}: {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (v: number) => void
  testId?: string
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="label mb-0">{label}</label>
        <span className="tnum text-[12.5px] font-semibold text-ink-800">{display}</span>
      </div>
      {hint && <div className="mb-1 text-[10.5px] leading-snug text-ink-400">{hint}</div>}
      <input
        type="range"
        data-testid={testId}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand-600"
      />
    </div>
  )
}