/**
 * The differentiator made visible.
 *
 * Renders the cascade: battery degrading -> can use continue? -> repair? ->
 * second-life? -> EOL collection -> responsible recycling. Each stage shows its
 * live count from the backend, so the funnel is data, not decoration.
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BatteryCharging,
  CheckCircle2,
  ClipboardCheck,
  Factory,
  Leaf,
  Recycle,
  Search,
  XCircle,
} from 'lucide-react'
import { useApp, useAsync, useToast } from '../context/AppContext'
import { api } from '../services/api'
import { PATHWAY_META } from '../services/api'
import type { Pathway, PreventionDecision } from '../services/api'
import { AvoidanceTrendChart } from '../components/charts'
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
import { inr, num } from '../lib/format'

const STAGES: Array<{
  pathway: Pathway
  icon: typeof Leaf
  test: string
  blurb: string
}> = [
  {
    pathway: 'CONTINUE_USE',
    icon: BatteryCharging,
    test: 'Can current use continue?',
    blurb: 'Above the EOL threshold with adequate usable capacity.',
  },
  {
    pathway: 'REPAIR_REFURBISHMENT',
    icon: ClipboardCheck,
    test: 'If not — can repair/refurbishment be assessed?',
    blurb: 'Below traction use, but recoverable capacity remains.',
  },
  {
    pathway: 'SECOND_LIFE_ASSESSMENT',
    icon: Leaf,
    test: 'If not — can second-life be assessed?',
    blurb: 'Too degraded for vehicles; may suit a stationary application.',
  },
  {
    pathway: 'EOL_CANDIDATE',
    icon: Recycle,
    test: 'If not — EOL collection and responsible recycling',
    blurb: 'No realistic preservation pathway remains.',
  },
]

export default function Prevention() {
  const { meta } = useApp()
  const { data, error, loading, reload } = useAsync(() => api.preventionFleet(), [])
  const [detail, setDetail] = useState<{
    pathway: PreventionDecision
    lifecycle: { events: Array<{ event: string; occurred_at: string }>; battery_lifecycle_id: string }
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const { push } = useToast()

  const ledger = data?.ledger

  const funnel = useMemo(
    () =>
      STAGES.map((s) => ({
        ...s,
        count: ledger?.counts[s.pathway.toLowerCase() as keyof typeof ledger.counts] ?? 0,
      })),
    [ledger],
  )

  const avoided = ledger
    ? ledger.total_batteries - ledger.counts.eol_candidate
    : 0

  const openBattery = async (batteryId: string) => {
    setBusy(true)
    try {
      const d = await api.battery(batteryId)
      setDetail({ pathway: d.pathway, lifecycle: d.lifecycle })
    } catch (e) {
      push(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  const record = async (batteryId: string, pathway: string) => {
    setBusy(true)
    try {
      await api.recordIntervention(batteryId, pathway, 'operator')
      push(`Decision recorded for ${batteryId}. Added to the lifecycle audit trail.`, 'success')
      setDetail(null)
      reload()
    } catch (e) {
      push(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading && !data) return <Spinner label="Evaluating pathways" />
  if (error) return <ErrorBox message={error} onRetry={reload} />

  const rows = data?.fleet ?? []
  const actionable = rows.filter((r) => r.pathway !== 'CONTINUE_USE')

  return (
    <>
      <PageHeader
        title="Waste Prevention Engine"
        subtitle="The core differentiator. A degraded battery is not automatically waste — every pack is routed through recovery pathways before it is called end-of-life."
      />

      <Notice kind="good">
        <b>Decision support, not certification.</b> A second-life or repair recommendation means{' '}
        <i>technical assessment is required</i>. EVolve AI does not certify a pack fit for any
        application, safe, or unsafe.
      </Notice>

      {/* ---------- the cascade ---------- */}
      <Card
        className="mt-4"
        title="Lifecycle pathway cascade"
        subtitle="Every battery answers these questions in order, and stops at the first pathway that applies"
      >
        <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
          {funnel.map((stage, i) => {
            const Icon = stage.icon
            const meta2 = PATHWAY_META[stage.pathway]
            return (
              <div key={stage.pathway} className="relative">
                <Link
                  to={`/batteries?pathway=${stage.pathway}`}
                  className="block h-full rounded-xl border border-ink-200 bg-white px-4 py-3.5 transition-colors hover:border-brand-300 hover:bg-brand-50/40"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                      <Icon size={15} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[10.5px] font-bold uppercase tracking-wide text-ink-400">
                        Step {i + 1}
                      </div>
                      <div className="truncate text-[12.5px] font-semibold text-ink-900">
                        {meta2.label}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2.5 text-[28px] font-bold leading-none tnum text-ink-900">
                    {stage.count}
                  </div>
                  <div className="mt-1 text-[11.5px] leading-snug text-ink-500">{stage.blurb}</div>
                  <div className="mt-2 flex items-center gap-1 text-[11px] font-medium text-brand-700">
                    {stage.test} <ArrowRight size={11} />
                  </div>
                </Link>
              </div>
            )
          })}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Kpi
            label="Batteries retained from waste"
            value={num(avoided)}
            tone="good"
            testId="prevent-avoided"
          />
          <Kpi
            label="Avoidable waste"
            value={`${ledger?.potential_eol_waste_avoided_kg.toFixed(0) ?? 0} kg`}
            tone="good"
            sub="estimated, not measured"
          />
          <Kpi
            label="Prevention ratio"
            value={`${ledger?.prevention_ratio_pct.toFixed(1) ?? 0}%`}
            tone={ledger && ledger.prevention_ratio_pct >= 70 ? 'good' : 'warn'}
            sub="of fleet not routed to EOL"
          />
        </div>
        <MethodNote>
          {ledger?.method} Cost basis:{' '}
          {ledger &&
            Object.entries(ledger.cost_basis_inr)
              .map(([k, v]) => `${k.replace(/_/g, ' ')} ${inr(v)}`)
              .join(' · ')}
        </MethodNote>
      </Card>

      {/* ---------- ledger ---------- */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Retained versus EOL" subtitle="Pathway mix across the fleet">
          {ledger ? (
            <AvoidanceTrendChart
              data={[
                { label: 'Batteries', retained: avoided, eol: ledger.counts.eol_candidate },
              ]}
            />
          ) : (
            <EmptyState message="Loading" />
          )}
        </Card>

        <Card title="Estimated economics" subtitle="Planning figures, clearly labelled as estimates">
          {ledger ? (
            <table className="table-base">
              <tbody>
                <tr>
                  <td className="text-ink-600">Intervention candidates</td>
                  <td className="text-right font-semibold tnum">
                    {ledger.potential_intervention_candidates}
                  </td>
                </tr>
                <tr>
                  <td className="text-ink-600">Estimated intervention cost</td>
                  <td className="text-right tnum">{inr(ledger.estimated_intervention_cost_inr)}</td>
                </tr>
                <tr>
                  <td className="text-ink-600">Purchase value deferred</td>
                  <td className="text-right tnum text-brand-700">
                    {inr(ledger.estimated_purchase_value_avoided_inr)}
                  </td>
                </tr>
                <tr className="bg-ink-50/60">
                  <td className="font-semibold text-ink-800">Net estimated benefit</td>
                  <td className="text-right font-bold tnum text-brand-700">
                    {inr(ledger.net_estimated_benefit_inr)}
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <EmptyState message="Loading" />
          )}
          {ledger && (
            <p className="mt-2 text-[11px] leading-snug text-ink-400">{ledger.disclaimer}</p>
          )}
        </Card>
      </div>

      {/* ---------- per-battery decisions ---------- */}
      <Card
        className="mt-4"
        title="Per-battery pathway decisions"
        subtitle={`${actionable.length} battery/batteries need a prevention decision. Select one to see every rule that fired.`}
      >
        <div className="scroll-thin max-h-[520px] overflow-auto rounded-lg border border-ink-200">
          <table className="table-base">
            <thead className="sticky top-0 bg-ink-50">
              <tr>
                <th>Battery</th>
                <th>Zone</th>
                <th className="text-right">SOH</th>
                <th>Pathway</th>
                <th>Rules fired</th>
                <th>Assessment</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {actionable.map((r) => (
                <tr key={r.battery_id} data-testid={`prev-row-${r.battery_id}`}>
                  <td>
                    <Link to={`/batteries/${r.battery_id}`} className="font-semibold text-brand-700">
                      {r.battery_id}
                    </Link>
                    <div className="text-[10.5px] text-ink-400">{r.vehicle_id}</div>
                  </td>
                  <td className="text-[12px] text-ink-600">{r.zone}</td>
                  <td className="text-right tnum font-semibold">{r.soh_pct.toFixed(1)}%</td>
                  <td>
                    <span className={`badge ${PATHWAY_META[r.pathway as Pathway]?.tone}`}>
                      {PATHWAY_META[r.pathway as Pathway]?.short ?? r.pathway}
                    </span>
                  </td>
                  <td className="text-[11px] text-ink-500">{r.rules_fired?.length ?? 0} rules</td>
                  <td className="max-w-[22rem] text-[11.5px] leading-snug text-ink-600">
                    {r.wording}
                  </td>
                  <td>
                    <button
                      className="btn btn-sm"
                      disabled={busy}
                      onClick={() => openBattery(r.battery_id)}
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {actionable.length === 0 && (
            <EmptyState message="No battery requires intervention" hint="All packs are above the EOL threshold." />
          )}
        </div>
      </Card>

      {/* ---------- decision drawer ---------- */}
      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/40 p-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="card my-8 w-full max-w-2xl animate-fadeUp"
            onClick={(e) => e.stopPropagation()}
            data-testid="prevention-drawer"
          >
            <div className="border-b border-ink-200 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[16px] font-bold text-ink-900">
                    {detail.pathway.battery_id}
                  </h2>
                  <div className="text-[11.5px] text-ink-500">
                    BLID {detail.lifecycle.battery_lifecycle_id} · vehicle{' '}
                    {detail.pathway.vehicle_id} · {detail.pathway.zone}
                  </div>
                </div>
                <button className="btn btn-sm" onClick={() => setDetail(null)}>
                  Close
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className={`badge ${PATHWAY_META[detail.pathway.pathway as Pathway]?.tone}`}>
                  {detail.pathway.pathway_label}
                </span>
                <span className="text-[12.5px] text-ink-700">SOH {detail.pathway.soh_pct.toFixed(1)}%</span>
              </div>
            </div>

            <div className="space-y-4 px-5 py-4">
              <Notice kind="info">{detail.pathway.wording}</Notice>

              <div>
                <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-ink-500">
                  Rules that fired ({detail.pathway.rule_count})
                </h3>
                <ul className="space-y-1.5">
                  {detail.pathway.rules_fired.map((r, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 rounded-lg border border-ink-200 bg-ink-50/50 px-3 py-2"
                    >
                      {r.rule.startsWith('R') ? (
                        <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-brand-600" />
                      ) : (
                        <XCircle size={13} className="mt-0.5 shrink-0 text-amber-600" />
                      )}
                      <div>
                        <div className="text-[12.5px] leading-snug text-ink-800">{r.statement}</div>
                        <div className="mt-0.5 font-mono text-[10.5px] text-ink-400">
                          {r.rule} · {JSON.stringify(r.evidence)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Kpi
                  label="Potential waste avoided"
                  value={`${detail.pathway.potential_avoided_units} unit`}
                  tone={detail.pathway.potential_avoided_units > 0 ? 'good' : 'default'}
                  sub={`${detail.pathway.potential_avoided_waste_kg.toFixed(0)} kg`}
                />
                <Kpi
                  label="Estimated intervention cost"
                  value={inr(detail.pathway.estimated_intervention_cost_inr)}
                />
              </div>

              {detail.pathway.requires_technical_assessment && (
                <Notice kind="warn">
                  This pathway requires <b>technical assessment</b> before any action. EVolve AI
                  does not certify fitness for repair, reuse or any second-life application.
                </Notice>
              )}

              <div className="flex flex-wrap gap-2 border-t border-ink-200 pt-3">
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => record(detail.pathway.battery_id, detail.pathway.pathway)}
                >
                  <ClipboardCheck size={14} /> Record this decision
                </button>
                <Link to={`/batteries/${detail.pathway.battery_id}`} className="btn">
                  <Search size={14} /> Full battery detail
                </Link>
              </div>
              <p className="text-[11px] text-ink-400">{detail.pathway.decision_basis}</p>
            </div>
          </div>
        </div>
      )}

      {/* ---------- thresholds ---------- */}
      {meta && (
        <Card className="mt-4" title="Pathway thresholds in force" subtitle="Named constants, editable in the backend">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-brand-200 bg-brand-50/60 px-3 py-2.5">
              <div className="text-[11px] text-ink-600">EOL threshold</div>
              <div className="text-[20px] font-bold tnum text-ink-900">
                {meta.thresholds.eol_soh_pct}%
              </div>
              <div className="text-[11px] text-ink-500">at or below → intervention considered</div>
            </div>
            <div className="rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2.5">
              <div className="text-[11px] text-ink-600">Traction-use floor</div>
              <div className="text-[20px] font-bold tnum text-ink-900">
                {meta.thresholds.traction_use_floor_soh_pct}%
              </div>
              <div className="text-[11px] text-ink-500">below → vehicle use not supported</div>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5">
              <div className="text-[11px] text-ink-600">Second-life floor</div>
              <div className="text-[20px] font-bold tnum text-ink-900">
                {meta.thresholds.second_life_floor_soh_pct}%
              </div>
              <div className="text-[11px] text-ink-500">below → EOL candidate</div>
            </div>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-ink-500">
            <Factory size={12} /> Recovery routes: continue → repair/refurbishment → second-life → EOL
            collection → responsible recycling.
          </p>
        </Card>
      )}
    </>
  )
}

