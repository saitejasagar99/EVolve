import { Link } from 'react-router-dom'
import { Boxes, Factory, Route, Truck } from 'lucide-react'
import { useAsync } from '../context/AppContext'
import { api } from '../services/api'
import { PriorityBarChart } from '../components/charts'
import {
  Card,
  EmptyState,
  ErrorBox,
  Kpi,
  MethodNote,
  Notice,
  PageHeader,
  Spinner,
} from '../components/ui'
import { inr, num, PRIORITY_TONE, shortDate } from '../lib/format'

// ---------------------------------------------------------------------------
// EOL Collection — priority queue
// ---------------------------------------------------------------------------

export function CollectionPage() {
  const { data, error, loading, reload } = useAsync(() => api.queue(), [])

  if (loading && !data) return <Spinner label="Building collection queue" />
  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (!data) return <ErrorBox message="No queue returned" />

  return (
    <>
      <PageHeader
        title="EOL Collection Prioritization"
        subtitle="Which end-of-life batteries to collect first, and why. Every score is a transparent weighted sum of named factors."
        actions={
          <Link to="/optimizer" className="btn btn-primary">
            <Boxes size={14} /> Build collection batches
          </Link>
        }
      />

      <Notice kind="warn">
        Priority is a <b>scheduling aid, not a safety rating</b>. A high score means estimated EOL
        urgency and degradation, not that a battery is dangerous.
      </Notice>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="EOL candidates" value={num(data.total)} testId="queue-total" />
        {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((b) => (
          <Kpi
            key={b}
            label={b}
            value={num(data.by_band[b] ?? 0)}
            tone={b === 'CRITICAL' ? 'bad' : b === 'HIGH' ? 'warn' : 'default'}
          />
        ))}
      </div>

      {data.total === 0 ? (
        <Card className="mt-4">
          <EmptyState
            message="No EOL candidates in this dataset"
            hint="Every battery is currently above the EOL threshold, so there is nothing to collect."
          />
        </Card>
      ) : (
        <>
          <Card
            className="mt-4"
            title="Priority ranking"
            subtitle="Top candidates by estimated collection priority"
          >
            <PriorityBarChart
              data={data.queue.map((q) => ({
                battery_id: q.battery_id,
                priority_score: q.priority_score,
                zone: q.zone,
              }))}
            />
          </Card>

          <Card
            className="mt-4"
            title="Collection queue"
            subtitle={`${data.total} batteries with deadline, factors and deadline rationale`}
            padded={false}
          >
            <div className="scroll-thin max-h-[60vh] overflow-auto">
              <table className="table-base" data-testid="queue-table">
                <thead className="sticky top-0 bg-ink-50">
                  <tr>
                    <th>#</th>
                    <th>Battery</th>
                    <th>Zone</th>
                    <th className="text-right">Priority</th>
                    <th className="text-right">SOH</th>
                    <th className="text-right">EOL est.</th>
                    <th>Deadline</th>
                    <th>Top factor</th>
                    <th>Factors</th>
                  </tr>
                </thead>
                <tbody>
                  {data.queue.map((q, i) => {
                    const top = q.factors.reduce((a, b) => (b.points > a.points ? b : a))
                    return (
                      <tr key={q.battery_id}>
                        <td className="tnum text-ink-400">{i + 1}</td>
                        <td>
                          <Link
                            to={`/batteries/${q.battery_id}`}
                            className="font-semibold text-brand-700"
                          >
                            {q.battery_id}
                          </Link>
                          <div className="text-[10.5px] text-ink-400">{q.vehicle_id}</div>
                        </td>
                        <td className="text-[12px] text-ink-600">{q.zone}</td>
                        <td className="text-right">
                          <span className={`badge ${PRIORITY_TONE[q.priority_band]}`}>
                            {q.priority_score.toFixed(0)} {q.priority_band}
                          </span>
                        </td>
                        <td className="text-right tnum">{q.soh_pct.toFixed(1)}%</td>
                        <td className="text-right tnum text-[12px]">
                          {q.eol_in_months === null ? '—' : `${q.eol_in_months.toFixed(1)} mo`}
                        </td>
                        <td className="text-[11.5px] text-ink-600">
                          {shortDate(q.collection_deadline)}
                          <div className="text-[10.5px] text-ink-400">{q.days_to_deadline} days</div>
                        </td>
                        <td className="text-[11.5px] text-ink-600">{top.name.replace(/_/g, ' ')}</td>
                        <td className="text-[11px] text-ink-500">
                          <details className="group">
                            <summary className="cursor-pointer text-brand-700">
                              {q.factors.length} weighted
                            </summary>
                            <ul className="mt-1.5 space-y-1 rounded-lg border border-ink-200 bg-ink-50/60 p-2">
                              {q.factors.map((f) => (
                                <li key={f.name} className="text-[11px] text-ink-600">
                                  {f.name.replace(/_/g, ' ')}:{' '}
                                  <b className="tnum">
                                    {f.points.toFixed(1)} pts
                                  </b>{' '}
                                  <span className="text-ink-400">
                                    ({(f.weight * 100).toFixed(0)}% × {f.raw_value.toFixed(2)})
                                  </span>
                                </li>
                              ))}
                              <li className="border-t border-ink-200 pt-1 text-[11px] font-semibold text-ink-800">
                                Sum {q.reconciliation.sum_of_factor_points.toFixed(2)} = score{' '}
                                {q.reconciliation.priority_score.toFixed(2)} ✓
                              </li>
                            </ul>
                          </details>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <MethodNote>{data.method}</MethodNote>
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Collection Optimizer — batching + schematic map
// ---------------------------------------------------------------------------

export function OptimizerPage() {
  const { data, error, loading, reload } = useAsync(() => api.batches({}), [])

  if (loading && !data) return <Spinner label="Optimising collection" />
  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (!data) return <ErrorBox message="No batching result" />

  return (
    <>
      <PageHeader
        title="Smart Collection Batching"
        subtitle="Not a sort. Nearby EOL batteries are grouped into capacity-feasible trips, and the distance saved versus separate visits is measured."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Batches" value={num(data.total_batches)} testId="batch-count" />
        <Kpi label="Batteries scheduled" value={num(data.total_units)} />
        <Kpi label="Total distance" value={`${num(data.total_distance_km, 1)} km`} />
        <Kpi
          label="Distance saved"
          value={`${num(data.distance_saved_vs_solo_km, 1)} km`}
          tone={data.distance_saved_vs_solo_km > 0 ? 'good' : 'default'}
          sub="versus solo visits"
        />
        <Kpi
          label="Cost saved"
          value={inr(data.cost_saved_vs_solo_inr)}
          tone={data.cost_saved_vs_solo_inr > 0 ? 'good' : 'default'}
        />
      </div>

      {data.total_batches === 0 ? (
        <Card className="mt-4">
          <EmptyState message="No batches to plan" hint="No EOL candidates require collection." />
        </Card>
      ) : (
        <>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card
              className="lg:col-span-2"
              title="Collection batches"
              subtitle="Priority-ordered, zone-clustered, capacity-constrained"
              padded={false}
            >
              <div className="divide-y divide-ink-200">
                {data.batches.map((b) => (
                  <div key={b.batch_code} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[13px] font-bold text-ink-900">
                            {b.batch_code}
                          </span>
                          <span className={`badge ${PRIORITY_TONE[b.priority_band]}`}>
                            {b.priority_band}
                          </span>
                          <span className="badge border-ink-200 bg-ink-50 text-ink-600">
                            <Route size={10} /> {b.zone}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {b.batteries.map((id) => (
                            <Link
                              key={id}
                              to={`/batteries/${id}`}
                              className="rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 font-mono text-[11px] text-brand-700 hover:border-brand-300 hover:bg-brand-50"
                            >
                              {id}
                            </Link>
                          ))}
                        </div>
                      </div>
                      <div className="text-right text-[11.5px]">
                        <div className="tnum text-ink-800">
                          <b>{b.battery_count}</b> units
                        </div>
                        <div className="tnum text-ink-500">
                          {b.estimated_distance_km.toFixed(1)} km
                        </div>
                        <div className="tnum font-semibold text-brand-700">
                          {inr(b.estimated_cost_inr)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-500">
                      <span>
                        Solo visits would cost{' '}
                        <b className="tnum">{inr(b.solo_visit_cost_inr)}</b>
                      </span>
                      <span className="text-brand-700">
                        saves {inr(b.solo_visit_cost_inr - b.estimated_cost_inr)} and{' '}
                        {b.distance_saved_vs_solo_km.toFixed(1)} km
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <div className="space-y-4">
              <Card title="Schematic zone map" subtitle="Illustrative coordinates, not real geography">
                <ZoneMap />
              </Card>

              <Card title="Trip constraints">
                <div className="space-y-2 text-[12.5px]">
                  <div className="flex justify-between">
                    <span className="text-ink-600">Trips available</span>
                    <span className="tnum font-semibold">{data.trips_available}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-600">Capacity per trip</span>
                    <span className="tnum font-semibold">{data.trip_capacity_units} units</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-600">Batches scheduled</span>
                    <span className="tnum font-semibold">{data.scheduled_batches}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-600">Deferred</span>
                    <span className="tnum font-semibold">{data.unscheduled_count}</span>
                  </div>
                </div>
                <MethodNote>
                  {data.method}
                  <div className="mt-1.5">
                    Cost basis: {Object.entries(data.cost_basis_inr).map(([k, v]) => `${k.replace(/_/g, ' ')} ${inr(v)}`).join(' · ')}
                  </div>
                </MethodNote>
              </Card>
            </div>
          </div>

          {data.unscheduled_count > 0 && (
            <Card
              className="mt-4"
              title={`Deferred — ${data.unscheduled_count} battery/batteries`}
              subtitle="Not dropped. These remain in the EOL queue."
            >
              <Notice kind="warn">
                Available trip capacity for this period is <b>{data.trips_available}</b>. Anything
                beyond that is deferred with a reason, never silently discarded.
              </Notice>
              <table className="table-base mt-3">
                <thead>
                  <tr>
                    <th>Battery</th>
                    <th className="text-right">Priority</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {data.unscheduled.map((u) => (
                    <tr key={u.battery_id}>
                      <td>
                        <Link to={`/batteries/${u.battery_id}`} className="font-semibold text-brand-700">
                          {u.battery_id}
                        </Link>
                      </td>
                      <td className="text-right tnum">{u.priority_score.toFixed(0)}</td>
                      <td className="text-[11.5px] text-ink-600">{u.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          <div className="mt-4">
            <Link to="/capacity" className="btn">
              <Factory size={14} /> Can downstream processing keep up?
            </Link>
          </div>
        </>
      )}
    </>
  )
}

// Schematic map: zones as nodes, no external map API.
const ZONE_NODES: Record<string, { x: number; y: number }> = {
  'Hyderabad North': { x: 50, y: 18 },
  'Hyderabad West': { x: 18, y: 46 },
  'Hyderabad East': { x: 82, y: 44 },
  'Hyderabad South': { x: 54, y: 80 },
  Rangareddy: { x: 24, y: 84 },
  Medchal: { x: 80, y: 76 },
}

function ZoneMap() {
  const { data } = useAsync(() => api.batches({}), [])
  const batchByZone = new Map<string, { code: string; count: number }>()
  data?.batches.forEach((b) =>
    batchByZone.set(b.zone, { code: b.batch_code, count: b.battery_count }),
  )

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-ink-200 bg-ink-50/50">
      <svg viewBox="0 0 100 100" className="h-full w-full">
        {Object.entries(ZONE_NODES).map(([zone, pos]) => {
          const batch = batchByZone.get(zone)
          const active = Boolean(batch)
          return (
            <g key={zone}>
              <line
                x1="50"
                y1="50"
                x2={pos.x}
                y2={pos.y}
                stroke={active ? '#10b981' : '#cbd5e1'}
                strokeWidth={active ? 1.2 : 0.7}
                strokeDasharray={active ? undefined : '2 2'}
              />
              <circle
                cx={pos.x}
                cy={pos.y}
                r={active ? 6.5 : 4}
                fill={active ? '#059669' : '#cbd5e1'}
                stroke="white"
                strokeWidth="1.5"
              />
              {active && batch && (
                <text
                  x={pos.x}
                  y={pos.y + 1}
                  textAnchor="middle"
                  fontSize="6"
                  fill="white"
                  fontWeight="700"
                >
                  {batch.count}
                </text>
              )}
              <text
                x={pos.x}
                y={pos.y + (active ? 12 : 9)}
                textAnchor="middle"
                fontSize="5"
                fill="#475569"
              >
                {zone.replace('Hyderabad ', 'Hyd. ').replace('Rangareddy', 'Ranga.')}
              </text>
              {active && batch && (
                <text x={pos.x} y={pos.y - 10} textAnchor="middle" fontSize="5" fill="#047857" fontWeight="700">
                  {batch.code}
                </text>
              )}
            </g>
          )
        })}
        <circle cx="50" cy="50" r="3.5" fill="#0f172a" />
        <text x="50" y="56" textAnchor="middle" fontSize="5" fill="#0f172a" fontWeight="700">
          hub
        </text>
      </svg>
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 text-[10px] text-ink-500">
        <Truck size={10} /> schematic only · not real geography
      </div>
    </div>
  )
}