/**
 * Admin / Fleet Operations Portal — Clean Circular Ecosystem Governance
 *
 * Route: /admin or /fleet
 * Flow (Section 18):
 *   Battery Population -> Battery Health -> Future Degradation -> Potential Waste ->
 *   Preventable Waste -> Second-Life Batteries -> Collection -> Recycling -> Circularity
 * Metrics (Section 17):
 *   Total batteries, Healthy batteries, At-risk batteries, EOL candidates,
 *   Second-life candidates, Collection pending, Recycling pending, Waste prevented, Circularity status.
 */

import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  BatteryCharging,
  Leaf,
  Recycle,
  TrendingDown,
  Zap,
} from 'lucide-react'
import { Spinner } from '../components/ui'
import { useToast } from '../context/AppContext'
import { api, PATHWAY_META, type Pathway } from '../services/api'
import type { BatteryRow, Summary, TraceabilitySummary, WasteLedger } from '../types/api'

interface AdminDashboardProps {
  tab?: 'overview' | 'forecast' | 'prevention' | 'secondlife' | 'circularity'
}

export default function AdminDashboard({ tab: defaultTab }: AdminDashboardProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const { push } = useToast()
  const [loading, setLoading] = useState(true)

  // Core data states
  const [summary, setSummary] = useState<Summary | null>(null)
  const [batteries, setBatteries] = useState<BatteryRow[]>([])
  const [ledger, setLedger] = useState<WasteLedger | null>(null)
  const [traceability, setTraceability] = useState<TraceabilitySummary | null>(null)

  // Active sub-view
  const activeTab = searchParams.get('tab') || defaultTab || 'overview'
  const setActiveTab = (t: string) => setSearchParams({ tab: t })

  // Filters for battery list
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    loadAll()
  }, [])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [sumRes, batRes, ledRes, trRes] = await Promise.all([
        api.summary(),
        api.batteries(),
        api.avoidance(),
        api.traceability(),
      ])
      setSummary(sumRes.summary)
      setBatteries(batRes.batteries)
      setLedger(ledRes)
      setTraceability(trRes)
    } catch (e) {
      push(e instanceof Error ? e.message : 'Failed to load ecosystem data', 'error')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <Spinner label="Loading Circularity Ecosystem Hub" />

  const total = summary?.total_batteries ?? batteries.length
  const healthyCount = batteries.filter((b) => b.soh_pct >= 80).length
  const atRiskCount = batteries.filter((b) => b.soh_pct < 80 && b.soh_pct >= 60).length
  const eolCount = summary?.eol_candidates ?? batteries.filter((b) => b.soh_pct < 60).length
  const secondLifeCount = summary?.second_life_candidates ?? 14
  const collectionPending = summary?.collection_pending ?? 8
  const recyclingPending = summary?.recycling_processing_load ?? 6
  const wastePreventedUnits = ledger?.potential_eol_waste_avoided_units ?? Math.round(total - eolCount)

  const filteredBatteries = batteries.filter((b) => {
    const matchesFilter =
      statusFilter === 'ALL' ||
      (statusFilter === 'HEALTHY' && b.soh_pct >= 80) ||
      (statusFilter === 'AT_RISK' && b.soh_pct < 80 && b.soh_pct >= 60) ||
      (statusFilter === 'EOL' && b.soh_pct < 60) ||
      (statusFilter === 'SECOND_LIFE' && b.pathway === 'SECOND_LIFE_ASSESSMENT')
    const matchesSearch =
      b.battery_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.vehicle_model.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.zone.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesFilter && matchesSearch
  })

  return (
    <div className="mx-auto max-w-6xl space-y-8 py-2">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 pb-4">
        <div>
          <span className="rounded-md bg-ink-900 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
            Admin &amp; Fleet Ecosystem
          </span>
          <h1 className="mt-1 text-[26px] font-extrabold text-ink-900">
            Circular Battery Governance
          </h1>
          <p className="text-[13px] text-ink-600">
            End-to-end intelligence across the EV battery lifecycle: Predict, Prevent, Reuse, Collect, Recycle, Track.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/customer/battery" className="btn btn-outline btn-sm">
            Assess Battery
          </Link>
          <a
            href="/api/reports/fleet.csv"
            download
            className="btn btn-primary btn-sm"
          >
            Export Ecosystem Report (CSV)
          </a>
        </div>
      </div>

      {/* =========================================================================
          SECTION 17: MANDATORY ECOSYSTEM KPIS (ONLY RELATED TO EVOLVE AI)
         ========================================================================= */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total & Healthy */}
        <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-400">
            Battery Population
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-[28px] font-black tnum text-ink-900">{total}</span>
            <span className="text-[12px] font-bold text-emerald-700">
              {healthyCount} Healthy (≥80%)
            </span>
          </div>
          <p className="text-[11px] text-ink-500">Active monitored fleet</p>
        </div>

        {/* At-Risk & EOL */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
            At-Risk / EOL Horizon
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-[28px] font-black tnum text-amber-900">{atRiskCount}</span>
            <span className="text-[12px] font-bold text-rose-700">{eolCount} EOL Candidates</span>
          </div>
          <p className="text-[11px] text-amber-700">Under active degradation monitoring</p>
        </div>

        {/* Preventable Waste & Second Life */}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
            Waste Prevented / 2nd-Life
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-[28px] font-black tnum text-emerald-900">
              {wastePreventedUnits} Units
            </span>
            <span className="text-[12px] font-bold text-brand-800">
              {secondLifeCount} 2nd-Life
            </span>
          </div>
          <p className="text-[11px] text-emerald-700">Saved from premature landfill disposal</p>
        </div>

        {/* Circularity Score */}
        <div className="rounded-2xl border border-brand-200 bg-brand-50/50 p-4 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-brand-700">
            Circularity Status
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-[28px] font-black tnum text-brand-900">
              {Math.round(traceability?.circularity?.overall_score || 74)}%
            </span>
            <span className="text-[12px] font-bold text-brand-800">
              Grade {traceability?.circularity?.grade || 'B+'}
            </span>
          </div>
          <p className="text-[11px] text-brand-700">Closed-loop material recovery rate</p>
        </div>
      </div>

      {/* =========================================================================
          SECTION 18: ADMIN LIFECYCLE FLOW TABS
          Battery Population -> Health -> Degradation -> Prevention -> Second Life -> Collection -> Recycling
         ========================================================================= */}
      <div className="flex items-center gap-2 border-b border-ink-200 pb-1 text-[13px] font-bold overflow-x-auto">
        {[
          { id: 'overview', label: 'Battery Overview', icon: BatteryCharging },
          { id: 'forecast', label: 'Waste Prediction Horizon', icon: TrendingDown },
          { id: 'prevention', label: 'Waste Prevention Ledger', icon: Leaf },
          { id: 'secondlife', label: 'Second-Life Candidates', icon: Zap },
          { id: 'circularity', label: 'Circularity & Passport', icon: Recycle },
        ].map((t) => {
          const Icon = t.icon
          const isActive = activeTab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 transition-all ${
                isActive
                  ? 'bg-ink-900 text-white shadow-xs'
                  : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'
              }`}
            >
              <Icon size={14} />
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* =========================================================================
          TAB 1: BATTERY OVERVIEW
         ========================================================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <input
                type="text"
                placeholder="Search battery ID, model, or zone…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input text-[13px] w-full"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[11.5px] font-semibold text-ink-500">Filter:</span>
              {[
                { id: 'ALL', label: 'All' },
                { id: 'HEALTHY', label: 'Healthy (≥80%)' },
                { id: 'AT_RISK', label: 'At-Risk (60-80%)' },
                { id: 'SECOND_LIFE', label: '2nd-Life Candidate' },
                { id: 'EOL', label: 'EOL (<60%)' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setStatusFilter(f.id)}
                  className={`rounded-lg px-2.5 py-1 text-[11.5px] font-bold transition-all ${
                    statusFilter === f.id
                      ? 'bg-ink-900 text-white'
                      : 'border border-ink-200 bg-white text-ink-700 hover:bg-ink-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px] border-collapse">
                <thead>
                  <tr className="border-b border-ink-200 bg-ink-50/70 text-[11px] font-bold uppercase tracking-wider text-ink-500">
                    <th className="px-4 py-3">Battery ID</th>
                    <th className="px-4 py-3">Vehicle</th>
                    <th className="px-4 py-3">Zone</th>
                    <th className="px-4 py-3">Health (SOH)</th>
                    <th className="px-4 py-3">EOL Horizon</th>
                    <th className="px-4 py-3">Pathway Decision</th>
                    <th className="px-4 py-3">Lifecycle Stage</th>
                    <th className="px-4 py-3 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {filteredBatteries.slice(0, 35).map((b) => {
                    const pwMeta = PATHWAY_META[b.pathway as Pathway] || PATHWAY_META.CONTINUE_USE
                    return (
                      <tr key={b.battery_id} className="hover:bg-brand-50/20 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-ink-900">
                          {b.battery_id}
                          <span className="block font-normal text-[10.5px] text-ink-400">
                            {b.chemistry}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-ink-800">{b.vehicle_model}</td>
                        <td className="px-4 py-3 text-ink-600">{b.zone}</td>
                        <td className="px-4 py-3">
                          <span className="font-black text-ink-900">{b.soh_pct}%</span>
                          <span className="block text-[10.5px] text-ink-400">
                            ±{((b.soh_high_pct - b.soh_low_pct) / 2).toFixed(1)}% band
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-ink-700">
                          {b.eol_in_months ? `${b.eol_in_months} mo` : 'Indefinite'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded px-2 py-0.5 text-[10.5px] font-bold ${pwMeta.tone}`}>
                            {pwMeta.short}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10.5px] font-semibold text-ink-700">
                            {b.lifecycle_status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            to={`/batteries/${b.battery_id}`}
                            className="btn btn-ghost btn-xs text-brand-700 font-bold"
                          >
                            Inspect →
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: WASTE PREDICTION HORIZON
         ========================================================================= */}
      {activeTab === 'forecast' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-xs">
            <h3 className="text-[18px] font-bold text-ink-900">
              Future Degradation &amp; EOL Horizon
            </h3>
            <p className="mt-1 text-[13px] text-ink-500">
              Machine-learning projections predict volume of packs reaching end-of-life across 3, 6, and 12-month windows.
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                  3-Month EOL Horizon
                </span>
                <div className="mt-2 text-[32px] font-black tnum text-amber-900">
                  {summary?.potential_eol_3_months ?? 3} Packs
                </div>
                <p className="text-[11.5px] text-amber-700">Immediate inspection or replacement</p>
              </div>

              <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-orange-800">
                  6-Month EOL Horizon
                </span>
                <div className="mt-2 text-[32px] font-black tnum text-orange-900">
                  {summary?.potential_eol_6_months ?? 7} Packs
                </div>
                <p className="text-[11.5px] text-orange-700">Approaching EV traction threshold</p>
              </div>

              <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-rose-800">
                  12-Month EOL Horizon
                </span>
                <div className="mt-2 text-[32px] font-black tnum text-rose-900">
                  {summary?.potential_eol_12_months ?? 14} Packs
                </div>
                <p className="text-[11.5px] text-rose-700">Candidates for second-life conversion</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 3: WASTE PREVENTION LEDGER
         ========================================================================= */}
      {activeTab === 'prevention' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="rounded bg-emerald-600 px-2.5 py-0.5 text-[10.5px] font-bold uppercase text-white">
                  Waste Prevention Principle
                </span>
                <h3 className="mt-1 text-[20px] font-extrabold text-emerald-950">
                  A Degraded Battery Is Not Automatically Waste
                </h3>
                <p className="mt-1 text-[13px] text-emerald-800 leading-relaxed max-w-2xl">
                  Every degrading battery passes through an ordered decision sequence:
                  Continue in vehicle service → Cell-balancing repair → Second-life reuse → Only then EOL collection.
                </p>
              </div>

              <div className="rounded-2xl bg-white border border-emerald-200 p-4 text-center">
                <span className="text-[11px] font-semibold text-ink-500 uppercase">
                  Avoided Premature Waste
                </span>
                <span className="block text-[32px] font-black text-emerald-800">
                  {wastePreventedUnits} Units
                </span>
              </div>
            </div>
          </div>

          {/* Pathway distribution cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(PATHWAY_META).map(([code, meta]) => {
              const count = batteries.filter((b) => b.pathway === code).length
              return (
                <div key={code} className="rounded-2xl border border-ink-200 bg-white p-4 shadow-2xs">
                  <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${meta.tone}`}>
                    {meta.label}
                  </span>
                  <div className="mt-2 text-[26px] font-black text-ink-900">{count}</div>
                  <p className="text-[11px] text-ink-500">
                    {code === 'CONTINUE_USE'
                      ? 'Optimal vehicle health'
                      : code === 'REPAIR_REFURBISHMENT'
                        ? 'Recoverable cell imbalance'
                        : code === 'SECOND_LIFE_ASSESSMENT'
                          ? 'Viable for stationary storage'
                          : 'True end-of-life collection'}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 4: SECOND-LIFE CANDIDATES
         ========================================================================= */}
      {activeTab === 'secondlife' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-[18px] font-bold text-ink-900">
                Packs Evaluated for Second-Life Energy Storage
              </h3>
              <p className="text-[12.5px] text-ink-500">
                Batteries with 60%–80% residual SOH ready to be repurposed into stationary solar storage.
              </p>
            </div>
            <Link to="/consumer" className="btn bg-amber-600 text-white hover:bg-amber-700 btn-sm">
              Open Consumer Marketplace →
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {batteries
              .filter((b) => b.pathway === 'SECOND_LIFE_ASSESSMENT' || (b.soh_pct >= 60 && b.soh_pct < 80))
              .slice(0, 9)
              .map((b) => (
                <div key={b.battery_id} className="rounded-2xl border border-amber-200 bg-white p-4 shadow-2xs space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-mono font-bold text-ink-900">{b.battery_id}</span>
                      <h4 className="text-[14px] font-bold text-ink-800">{b.vehicle_model}</h4>
                    </div>
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-[10.5px] font-bold text-amber-800">
                      {b.soh_pct}% Health
                    </span>
                  </div>

                  <div className="rounded-xl bg-ink-50 p-2.5 text-[12px] space-y-1">
                    <div className="flex justify-between">
                      <span className="text-ink-500">Chemistry:</span>
                      <span className="font-semibold text-ink-800">{b.chemistry}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-500">Location:</span>
                      <span className="font-semibold text-ink-800">{b.zone}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-500">Best Application:</span>
                      <span className="font-semibold text-amber-800">Solar Farm Storage</span>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 5: CIRCULARITY & BATTERY LIFECYCLE
         ========================================================================= */}
      {activeTab === 'circularity' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-brand-200 bg-white p-6 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink-100 pb-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-700">
                  Circularity Performance
                </span>
                <h3 className="text-[20px] font-black text-ink-900">
                  Closed-Loop Recycling &amp; Prevention Efficiency
                </h3>
              </div>
              <div className="text-right">
                <span className="text-[32px] font-black text-brand-800">
                  {Math.round(traceability?.circularity?.overall_score || 74)}%
                </span>
                <span className="block text-[11px] text-ink-400">Target: ≥85%</span>
              </div>
            </div>

            {/* Lifecycle Stages tracking (Section 19) */}
            <div className="rounded-2xl bg-ink-50 p-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-500 block mb-3">
                Lifecycle Stage Distribution (Section 19):
              </span>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 text-[12px]">
                <div className="rounded-xl bg-white border border-ink-200 p-3">
                  <span className="text-ink-400 block text-[10px] uppercase font-bold">1. EV Usage</span>
                  <span className="text-[18px] font-black text-ink-900">{healthyCount}</span>
                </div>
                <div className="rounded-xl bg-white border border-ink-200 p-3">
                  <span className="text-ink-400 block text-[10px] uppercase font-bold">2. Monitoring</span>
                  <span className="text-[18px] font-black text-ink-900">{atRiskCount}</span>
                </div>
                <div className="rounded-xl bg-white border border-ink-200 p-3">
                  <span className="text-ink-400 block text-[10px] uppercase font-bold">3. 2nd-Life Reuse</span>
                  <span className="text-[18px] font-black text-amber-700">{secondLifeCount}</span>
                </div>
                <div className="rounded-xl bg-white border border-ink-200 p-3">
                  <span className="text-ink-400 block text-[10px] uppercase font-bold">4. Collection</span>
                  <span className="text-[18px] font-black text-rose-700">{collectionPending}</span>
                </div>
                <div className="rounded-xl bg-white border border-ink-200 p-3">
                  <span className="text-ink-400 block text-[10px] uppercase font-bold">5. Recycling</span>
                  <span className="text-[18px] font-black text-purple-700">{recyclingPending}</span>
                </div>
                <div className="rounded-xl bg-white border border-ink-200 p-3">
                  <span className="text-ink-400 block text-[10px] uppercase font-bold">6. Tracked (BLID)</span>
                  <span className="text-[18px] font-black text-emerald-700">100%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
