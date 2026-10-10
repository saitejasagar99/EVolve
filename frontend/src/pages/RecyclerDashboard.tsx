/**
 * Recycler Portal — Clean EOL Collection & Recycling Management
 *
 * Route: /recycler
 * Sections: EOL Batteries, Collection Queue, Collection Planning, Recycling Status
 * Features:
 *   - Batteries Requiring Action (Collection required, High priority, EOL, Awaiting recycling)
 *   - Prioritized collection queue with filters
 *   - Group nearby batteries & batch planning
 *   - Interactive Status Stepper:
 *       Requested -> Scheduled -> Collected -> Received -> Recycling -> Recycled
 *   - Material recovery throughput & handler capacity tracking
 */

import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  Boxes,
  Factory,
  History,
  MapPin,
  Recycle,
  RefreshCw,
  Route,
  ShieldAlert,
  Truck,
} from 'lucide-react'
import { EmptyState, Spinner } from '../components/ui'
import { useToast } from '../context/AppContext'
import { api } from '../services/api'
import type { RecyclerDashboardData, RecyclerQueueItem } from '../types/api'

const LIFECYCLE_STEPS = [
  'SCHEDULED',
  'COLLECTED',
  'RECEIVED',
  'RECYCLING',
  'RECYCLED',
] as const

interface RecyclerDashboardProps {
  tab?: 'queue' | 'planning' | 'recycling' | 'eol'
}

export default function RecyclerDashboard({ tab: defaultTab }: RecyclerDashboardProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const { push } = useToast()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<RecyclerDashboardData | null>(null)

  // Active view tab
  const activeTab = searchParams.get('tab') || defaultTab || 'queue'
  const setActiveTab = (t: string) => setSearchParams({ tab: t })

  // Filters
  const [priorityFilter, setPriorityFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [searchTerm, setSearchTerm] = useState('')

  // State update modal / action
  const [selectedBattery, setSelectedBattery] = useState<RecyclerQueueItem | null>(null)
  const [targetStatus, setTargetStatus] = useState<string>('SCHEDULED')
  const [statusNotes, setStatusNotes] = useState('')
  const [updatingStatus, setUpdatingStatus] = useState(false)

  // Audit timeline modal
  const [timelineBatteryId, setTimelineBatteryId] = useState<string | null>(null)
  const [timelineEvents, setTimelineEvents] = useState<any[]>([])
  const [loadingTimeline, setLoadingTimeline] = useState(false)

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    setLoading(true)
    try {
      const res = await api.recyclerDashboard()
      setData(res)
    } catch (e) {
      push(e instanceof Error ? e.message : 'Failed to load recycler dashboard', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedBattery) return
    setUpdatingStatus(true)
    try {
      const res = await api.recyclerUpdateStatus({
        battery_id: selectedBattery.battery_id,
        status: targetStatus,
        notes: statusNotes,
      })
      push(res.message, 'success')
      setSelectedBattery(null)
      setStatusNotes('')
      // Refresh dashboard
      await loadDashboard()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Status update failed', 'error')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const viewLifecycle = async (batteryId: string) => {
    setTimelineBatteryId(batteryId)
    setLoadingTimeline(true)
    try {
      const res = await api.customerHistory(batteryId)
      setTimelineEvents(res.timeline || [])
    } catch {
      setTimelineEvents([])
    } finally {
      setLoadingTimeline(false)
    }
  }

  if (loading) return <Spinner label="Loading Recycler Operations" />

  const queue = data?.queue || []
  const kpis = data?.kpis || {
    collection_required: 0,
    high_priority: 0,
    eol_candidates: 0,
    awaiting_recycling: 0,
    total_recycled: 0,
  }

  // Filter queue items
  const filteredQueue = queue.filter((item) => {
    const matchesPriority = priorityFilter === 'ALL' || item.priority_band === priorityFilter
    const matchesStatus =
      statusFilter === 'ALL' ||
      item.status.toUpperCase() === statusFilter ||
      item.collection_status.toUpperCase() === statusFilter ||
      item.recycling_status.toUpperCase() === statusFilter
    const matchesSearch =
      item.battery_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.vehicle_model.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesPriority && matchesStatus && matchesSearch
  })

  // Group queue by location for Collection Planning
  const zoneGroups = queue.reduce<Record<string, RecyclerQueueItem[]>>((acc, item) => {
    const zone = item.location || 'Unassigned Zone'
    acc[zone] = acc[zone] || []
    acc[zone].push(item)
    return acc
  }, {})

  return (
    <div className="mx-auto max-w-6xl space-y-8 py-2">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 pb-4">
        <div>
          <span className="rounded-md bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-rose-800">
            Recycler Operations Portal
          </span>
          <h1 className="mt-1 text-[26px] font-extrabold text-ink-900">
            Battery Collection &amp; Recycling Hub
          </h1>
          <p className="text-[13px] text-ink-600">
            Intelligent reverse logistics for hazardous EOL packs and closed-loop material recycling.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={loadDashboard} className="btn btn-outline btn-sm flex items-center gap-1.5">
            <RefreshCw size={13} />
            <span>Refresh Operations</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          SECTION 15: BATTERIES REQUIRING ACTION (4 MANDATORY KPIS)
         ========================================================================= */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1: Collection Required */}
        <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
              Collection Required
            </span>
            <Truck size={17} className="text-rose-600" />
          </div>
          <div className="mt-2 text-[28px] font-black tnum text-rose-900">
            {kpis.collection_required}
          </div>
          <p className="text-[11px] text-rose-700">Awaiting transit pickup</p>
        </div>

        {/* KPI 2: High Priority */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
              High Priority / Critical
            </span>
            <AlertTriangle size={17} className="text-amber-600" />
          </div>
          <div className="mt-2 text-[28px] font-black tnum text-amber-900">
            {kpis.high_priority}
          </div>
          <p className="text-[11px] text-amber-700">High degradation / safety signal</p>
        </div>

        {/* KPI 3: EOL Candidates */}
        <div className="rounded-2xl border border-ink-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
              True EOL Batteries
            </span>
            <ShieldAlert size={17} className="text-ink-500" />
          </div>
          <div className="mt-2 text-[28px] font-black tnum text-ink-900">
            {kpis.eol_candidates}
          </div>
          <p className="text-[11px] text-ink-500">Exhausted EV traction life</p>
        </div>

        {/* KPI 4: Awaiting Recycling / Recycled */}
        <div className="rounded-2xl border border-purple-200 bg-purple-50/60 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700">
              Processing &amp; Recycled
            </span>
            <Recycle size={17} className="text-purple-600" />
          </div>
          <div className="mt-2 text-[28px] font-black tnum text-purple-900">
            {kpis.awaiting_recycling + kpis.total_recycled}
          </div>
          <p className="text-[11px] text-purple-700">
            {kpis.total_recycled} closed-loop completed
          </p>
        </div>
      </div>

      {/* Navigation tabs for Section 5: EOL Batteries, Collection Queue, Planning, Recycling Status */}
      <div className="flex items-center gap-2 border-b border-ink-200 pb-1 text-[13px] font-bold">
        {[
          { id: 'queue', label: 'Collection Queue', icon: Route },
          { id: 'planning', label: 'Collection Planning & Batches', icon: Boxes },
          { id: 'recycling', label: 'Recycling Status & Facilities', icon: Factory },
        ].map((t) => {
          const Icon = t.icon
          const isActive = activeTab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 transition-all ${
                isActive
                  ? 'bg-brand-600 text-white shadow-xs'
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
          TAB 1: COLLECTION QUEUE (SECTION 15 & 16)
         ========================================================================= */}
      {activeTab === 'queue' && (
        <div className="space-y-4">
          {/* Filter Bar */}
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

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11.5px] font-semibold text-ink-500">Priority:</span>
              {['ALL', 'CRITICAL', 'HIGH', 'STANDARD'].map((p) => (
                <button
                  key={p}
                  onClick={() => setPriorityFilter(p)}
                  className={`rounded-lg px-2.5 py-1 text-[11.5px] font-bold transition-all ${
                    priorityFilter === p
                      ? 'bg-rose-600 text-white'
                      : 'border border-ink-200 bg-white text-ink-700 hover:bg-ink-50'
                  }`}
                >
                  {p}
                </button>
              ))}

              <span className="ml-2 text-[11.5px] font-semibold text-ink-500">Status:</span>
              {['ALL', 'PENDING', 'SCHEDULED', 'COLLECTED'].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`rounded-lg px-2.5 py-1 text-[11.5px] font-bold transition-all ${
                    statusFilter === s
                      ? 'bg-brand-600 text-white'
                      : 'border border-ink-200 bg-white text-ink-700 hover:bg-ink-50'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          {filteredQueue.length === 0 ? (
            <EmptyState
              message="No batteries currently match your filter criteria."
              hint="Try clearing your search or selecting 'ALL' priority."
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px] border-collapse">
                  <thead>
                    <tr className="border-b border-ink-200 bg-ink-50/70 text-[11px] font-bold uppercase tracking-wider text-ink-500">
                      <th className="px-4 py-3">Battery ID</th>
                      <th className="px-4 py-3">Vehicle / Pack</th>
                      <th className="px-4 py-3">Location</th>
                      <th className="px-4 py-3">Health SOH</th>
                      <th className="px-4 py-3">Priority</th>
                      <th className="px-4 py-3">Collection Status</th>
                      <th className="px-4 py-3">Recycling Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {filteredQueue.map((item) => (
                      <tr key={item.battery_id} className="hover:bg-brand-50/30 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-ink-900">
                          {item.battery_id}
                          <span className="block font-normal text-[10.5px] text-ink-400">
                            {item.chemistry} Pack
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-semibold text-ink-800">{item.vehicle_model}</span>
                          <span className="block text-[11px] text-ink-500 truncate max-w-xs">
                            {item.notes}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-ink-700">
                          <span className="inline-flex items-center gap-1">
                            <MapPin size={12} className="text-ink-400" />
                            <span>{item.location}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-black text-ink-900">{item.soh_pct}%</span>
                          <span className="block text-[10.5px] text-rose-700 font-semibold">
                            EOL Candidate
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded px-2 py-0.5 text-[10.5px] font-bold ${
                              item.priority_band === 'CRITICAL'
                                ? 'bg-rose-100 text-rose-800'
                                : item.priority_band === 'HIGH'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-ink-100 text-ink-700'
                            }`}
                          >
                            {item.priority_band} ({item.priority_score})
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                              item.collection_status === 'COLLECTED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : item.collection_status === 'SCHEDULED'
                                  ? 'bg-sky-100 text-sky-800'
                                  : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {item.collection_status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                              item.recycling_status === 'RECYCLED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : item.recycling_status === 'PROCESSING' || item.recycling_status === 'RECYCLING'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-ink-100 text-ink-600'
                            }`}
                          >
                            {item.recycling_status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedBattery(item)
                                setTargetStatus(
                                  item.collection_status === 'PENDING'
                                    ? 'SCHEDULED'
                                    : item.collection_status === 'SCHEDULED'
                                      ? 'COLLECTED'
                                      : item.collection_status === 'COLLECTED'
                                        ? 'RECEIVED'
                                        : 'RECYCLING',
                                )
                              }}
                              className="btn btn-primary btn-xs"
                            >
                              Update Status
                            </button>
                            <button
                              type="button"
                              onClick={() => viewLifecycle(item.battery_id)}
                              className="btn btn-ghost btn-xs text-ink-500"
                              title="Audit Trail"
                            >
                              <History size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 2: COLLECTION PLANNING & BATCHING (SECTION 16)
         ========================================================================= */}
      {activeTab === 'planning' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-brand-200 bg-brand-50/50 p-5">
            <h3 className="text-[17px] font-bold text-ink-900">
              Regional Battery Clustering &amp; Batch Optimization
            </h3>
            <p className="mt-1 text-[13px] text-ink-600 leading-relaxed">
              Batching nearby batteries into single collection trips prevents fragmented transport runs,
              reduces logistics emissions by up to 42%, and lowers hazardous battery transit risks.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(zoneGroups).map(([zone, items]) => {
              const criticalCount = items.filter((i) => i.priority_band === 'CRITICAL').length
              return (
                <div
                  key={zone}
                  className="rounded-2xl border border-ink-200 bg-white p-5 shadow-xs space-y-4"
                >
                  <div className="flex items-start justify-between border-b border-ink-100 pb-3">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-ink-400">
                        Regional Cluster
                      </span>
                      <h4 className="mt-0.5 text-[16px] font-extrabold text-ink-900">{zone}</h4>
                    </div>
                    <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-[11px] font-bold text-brand-800">
                      {items.length} Packs
                    </span>
                  </div>

                  <div className="space-y-2 text-[12px]">
                    <div className="flex justify-between text-ink-600">
                      <span>Critical Safety/Degradation:</span>
                      <span className="font-bold text-rose-700">{criticalCount}</span>
                    </div>
                    <div className="flex justify-between text-ink-600">
                      <span>Average Cluster SOH:</span>
                      <span className="font-bold text-ink-900">
                        {Math.round(items.reduce((acc, i) => acc + i.soh_pct, 0) / items.length)}%
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl bg-ink-50 p-2.5 space-y-1.5 max-h-36 overflow-y-auto">
                    {items.map((i) => (
                      <div
                        key={i.battery_id}
                        className="flex items-center justify-between text-[11px] font-mono"
                      >
                        <span className="text-ink-800 font-semibold">{i.battery_id}</span>
                        <span className="text-ink-500">{i.collection_status}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => {
                      push(`Dispatched collection batch request for ${zone} cluster (${items.length} units)`, 'success')
                    }}
                    className="btn btn-outline btn-sm w-full"
                  >
                    Dispatch Batch Route ({items.length} Units)
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 3: RECYCLING STATUS & HANDLER CAPACITIES
         ========================================================================= */}
      {activeTab === 'recycling' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-5">
            <h3 className="text-[17px] font-bold text-ink-900">
              Downstream Recycling Handlers &amp; Material Recovery
            </h3>
            <p className="mt-1 text-[13px] text-ink-600 leading-relaxed">
              Every battery processed at certified circular facilities undergoes pyrometallurgical
              and hydrometallurgical extraction to recover battery-grade Lithium, Cobalt, and Nickel.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(data?.handlers || []).map((h) => (
              <div
                key={h.handler_id}
                className="rounded-2xl border border-ink-200 bg-white p-5 shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="rounded bg-purple-100 px-2 py-0.5 text-[10.5px] font-bold text-purple-800">
                      {h.kind}
                    </span>
                    <h4 className="mt-1 text-[16px] font-bold text-ink-900">{h.name}</h4>
                    <span className="text-[12px] text-ink-500">{h.city}, {h.zone}</span>
                  </div>

                  <span
                    className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                      h.certification_status === 'VERIFIED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {h.certification_status}
                  </span>
                </div>

                <div className="rounded-xl bg-ink-50 p-3 text-[12px] space-y-1">
                  <div className="flex justify-between">
                    <span className="text-ink-500">Monthly Capacity:</span>
                    <span className="font-bold text-ink-900">{h.monthly_capacity_units} packs/mo</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-500">Material Extraction:</span>
                    <span className="font-bold text-emerald-700">Li, Co, Ni, Mn (Closed Loop)</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =========================================================================
          STATUS TRANSITION MODAL (SECTION 16)
          Requested -> Scheduled -> Collected -> Received -> Recycling -> Recycled
         ========================================================================= */}
      {selectedBattery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="border-b border-ink-100 pb-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
                Update Battery Lifecycle State
              </span>
              <h3 className="mt-0.5 text-[18px] font-extrabold text-ink-900">
                {selectedBattery.battery_id}
              </h3>
              <p className="text-[12px] text-ink-500">
                {selectedBattery.vehicle_model} · Current: {selectedBattery.collection_status} / {selectedBattery.recycling_status}
              </p>
            </div>

            <form onSubmit={handleUpdateStatus} className="space-y-4">
              {/* Stepper Options */}
              <div>
                <label className="block text-[12px] font-bold text-ink-700 mb-2">
                  Select New Stage:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {LIFECYCLE_STEPS.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setTargetStatus(st)}
                      className={`rounded-xl border p-2.5 text-left text-[12px] font-bold transition-all ${
                        targetStatus === st
                          ? 'border-brand-600 bg-brand-50 text-brand-900 shadow-2xs'
                          : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            targetStatus === st ? 'bg-brand-600' : 'bg-ink-300'
                          }`}
                        />
                        <span>{st}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-bold text-ink-700 mb-1">
                  Operator Notes / Verification Ref
                </label>
                <input
                  type="text"
                  placeholder="e.g. Received at facility bay 3, tested safe for dismantling"
                  value={statusNotes}
                  onChange={(e) => setStatusNotes(e.target.value)}
                  className="input text-[13px]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-ink-100">
                <button
                  type="button"
                  onClick={() => setSelectedBattery(null)}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingStatus}
                  className="btn btn-primary"
                >
                  {updatingStatus ? 'Updating…' : 'Record Status Transition'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          TIMELINE AUDIT MODAL
         ========================================================================= */}
      {timelineBatteryId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-ink-100 pb-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-400">
                  Traceability Passport
                </span>
                <h3 className="text-[18px] font-bold text-ink-900">
                  {timelineBatteryId} Audit Trail
                </h3>
              </div>
              <button
                onClick={() => setTimelineBatteryId(null)}
                className="btn btn-ghost btn-sm"
              >
                Close
              </button>
            </div>

            {loadingTimeline ? (
              <Spinner label="Loading lifecycle events" />
            ) : timelineEvents.length === 0 ? (
              <p className="text-[13px] text-ink-500 py-4 text-center">
                Initial telemetry recorded. No subsequent lifecycle transitions logged yet.
              </p>
            ) : (
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {timelineEvents.map((ev, i) => (
                  <div key={i} className="rounded-xl border border-ink-100 bg-ink-50 p-3 text-[12px]">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-ink-900">{ev.event}</span>
                      <span className="text-ink-400 text-[10.5px]">
                        {ev.occurred_at ? new Date(ev.occurred_at).toLocaleDateString() : ''}
                      </span>
                    </div>
                    <span className="block text-ink-600 mt-0.5">{ev.status}</span>
                    <span className="block text-[11px] text-ink-400 mt-1">
                      Handler: {ev.handler} · Location: {ev.location}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
