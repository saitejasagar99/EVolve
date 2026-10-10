/**
 * EVolve AI — Fleet Owner Dashboard & Multi-Vehicle Battery Intelligence
 *
 * Implements:
 *   A. Fleet Overview (KPI cards: total, valid, analysed, attention, failed, avg SOH, avg RUL)
 *   B. Fleet Battery Health (SOH distribution bins, pathway distribution, risk breakdown)
 *   C. Vehicle Priority List (sortable, searchable, filterable by priority/health/pathway)
 *   D. Maintenance Planning (alert reasons, supporting data, suggested follow-up)
 *   E. Fleet Comparison (side-by-side modal) & CSV Export
 *   F. Fleet Summary & Upload History integration, secure dataset deletion
 *
 * Strict Rule:
 *   Does not populate the dashboard with any hardcoded or sample fleet data.
 *   If no dataset has been uploaded, displays an informative empty state with a prominent
 *   action to upload a dataset.
 */

import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Cpu,
  Download,
  History,
  Info,
  Loader2,
  Search,
  Sparkles,
  Trash2,
  Truck,
  UploadCloud,
  Wrench,
  X,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { api } from '../services/api'
import type {
  FleetAnalysisSummary,
  FleetVehicleRecordItem,
  VehicleComparisonItem,
} from '../types/api'

export default function FleetDashboard() {
  const { analysisId: paramAnalysisId } = useParams<{ analysisId?: string }>()
  const navigate = useNavigate()

  // Active analysis summary state
  const [summary, setSummary] = useState<FleetAnalysisSummary | null>(null)
  const [isLoadingSummary, setIsLoadingSummary] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Records state
  const [records, setRecords] = useState<FleetVehicleRecordItem[]>([])
  const [totalRecords, setTotalRecords] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 15
  const [totalPages, setTotalPages] = useState(1)
  const [isLoadingRecords, setIsLoadingRecords] = useState(false)

  // Filters & Sorting
  const [searchQuery, setSearchQuery] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('All')
  const [healthBandFilter, setHealthBandFilter] = useState('All')
  const [pathwayFilter, setPathwayFilter] = useState('All')
  const [sortBy, setSortBy] = useState('soh_pct')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Vehicle Comparison state
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([])
  const [isComparing, setIsComparing] = useState(false)
  const [comparisonData, setComparisonData] = useState<VehicleComparisonItem[]>([])
  const [isLoadingComparison, setIsLoadingComparison] = useState(false)

  // Active vehicle detail drawer
  const [inspectedVehicle, setInspectedVehicle] = useState<FleetVehicleRecordItem | null>(null)

  // Deletion modal state
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Active view tab: 'overview' | 'vehicles' | 'maintenance'
  const [activeTab, setActiveTab] = useState<'overview' | 'vehicles' | 'maintenance'>('overview')

  // 1. Initial Load: Fetch requested analysis, or fetch latest from history
  useEffect(() => {
    let isMounted = true
    setIsLoadingSummary(true)
    setLoadError(null)

    const init = async () => {
      try {
        let targetId = paramAnalysisId
        if (!targetId) {
          const history = await api.getFleetHistory()
          if (history && history.length > 0) {
            targetId = history[0].analysis_id
          }
        }

        if (!targetId) {
          if (isMounted) {
            setSummary(null)
            setIsLoadingSummary(false)
          }
          return
        }

        const data = await api.getFleetAnalysis(targetId)
        if (isMounted) {
          setSummary(data)
          setIsLoadingSummary(false)
        }
      } catch (err: any) {
        if (isMounted) {
          setLoadError(err.message || 'Failed to load fleet analysis.')
          setIsLoadingSummary(false)
        }
      }
    }

    init()
    return () => {
      isMounted = false
    }
  }, [paramAnalysisId])

  // 2. Fetch Paginated Records when filters or page change
  useEffect(() => {
    if (!summary?.analysis_id) return
    let isMounted = true
    setIsLoadingRecords(true)

    const fetchRecords = async () => {
      try {
        const res = await api.getFleetRecords(summary.analysis_id, {
          search: searchQuery || undefined,
          priority: priorityFilter !== 'All' ? priorityFilter : undefined,
          health_band: healthBandFilter !== 'All' ? healthBandFilter : undefined,
          pathway: pathwayFilter !== 'All' ? pathwayFilter : undefined,
          sort_by: sortBy,
          sort_dir: sortDir,
          page,
          page_size: pageSize,
        })
        if (isMounted) {
          setRecords(res.records)
          setTotalRecords(res.total)
          setTotalPages(res.total_pages)
          setIsLoadingRecords(false)
        }
      } catch (err: any) {
        if (isMounted) {
          console.error('Failed to load fleet records:', err)
          setIsLoadingRecords(false)
        }
      }
    }

    fetchRecords()
    return () => {
      isMounted = false
    }
  }, [summary?.analysis_id, searchQuery, priorityFilter, healthBandFilter, pathwayFilter, sortBy, sortDir, page, pageSize])

  // Comparison toggle
  const toggleSelectVehicle = (vehId: string) => {
    setSelectedVehicleIds((prev) => {
      if (prev.includes(vehId)) {
        return prev.filter((id) => id !== vehId)
      }
      if (prev.length >= 4) {
        alert('You can compare a maximum of 4 vehicles at a time.')
        return prev
      }
      return [...prev, vehId]
    })
  }

  // Launch comparison modal
  const handleOpenComparison = async () => {
    if (!summary || selectedVehicleIds.length < 2) return
    setIsLoadingComparison(true)
    setIsComparing(true)
    try {
      const res = await api.compareFleetVehicles(summary.analysis_id, selectedVehicleIds)
      setComparisonData(res.vehicles)
    } catch (err: any) {
      alert(err.message || 'Failed to load comparison data.')
      setIsComparing(false)
    } finally {
      setIsLoadingComparison(false)
    }
  }

  // Delete analysis & dataset
  const handleDeleteDataset = async () => {
    if (!summary) return
    setIsDeleting(true)
    try {
      await api.deleteFleetUpload(summary.upload_id)
      setShowDeleteConfirm(false)
      navigate('/fleet/welcome')
    } catch (err: any) {
      alert(err.message || 'Failed to delete dataset.')
      setIsDeleting(false)
    }
  }

  // Health chart data
  const healthChartData = useMemo(() => {
    if (!summary?.soh_distribution) return []
    return [
      { range: '<70%', count: summary.soh_distribution['<70%'], fill: '#f43f5e', label: 'Critical' },
      { range: '70-79%', count: summary.soh_distribution['70-79%'], fill: '#f59e0b', label: 'Attention' },
      { range: '80-89%', count: summary.soh_distribution['80-89%'], fill: '#0ea5e9', label: 'Good' },
      { range: '90-100%', count: summary.soh_distribution['90-100%'], fill: '#10b981', label: 'Excellent' },
    ]
  }, [summary])

  // Pathway chart data
  const pathwayChartData = useMemo(() => {
    if (!summary?.pathway_distribution) return []
    const colors: Record<string, string> = {
      CONTINUE_USE: '#10b981',
      REPAIR_REFURBISHMENT: '#0ea5e9',
      SECOND_LIFE_ASSESSMENT: '#f59e0b',
      EOL_CANDIDATE: '#f43f5e',
    }
    const labels: Record<string, string> = {
      CONTINUE_USE: 'Continue Use',
      REPAIR_REFURBISHMENT: 'Repair / Refurbish',
      SECOND_LIFE_ASSESSMENT: 'Second-Life Storage',
      EOL_CANDIDATE: 'EOL Recycling Candidate',
    }
    return Object.entries(summary.pathway_distribution).map(([key, count]) => ({
      name: labels[key] || key,
      value: count,
      fill: colors[key] || '#64748b',
    }))
  }, [summary])

  // Maintenance required vehicles
  const maintenanceVehicles = useMemo(() => {
    return records.filter((r) => r.priority_category === 'Critical' || r.priority_category === 'Attention')
  }, [records])

  // -------------------------------------------------------------------------
  // RENDER: Loading State
  // -------------------------------------------------------------------------
  if (isLoadingSummary) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center bg-cream gap-3">
        <Loader2 className="h-9 w-9 animate-spin text-brand-600" />
        <p className="text-xs font-semibold text-ink-600">Loading Fleet Intelligence Dashboard...</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-cream text-ink-900 pb-20 flex flex-col items-center justify-center p-4">
        <div className="rounded-2xl bg-white border border-rose-200 p-8 max-w-md text-center space-y-4 shadow-2xs">
          <AlertCircle className="h-10 w-10 text-rose-600 mx-auto" />
          <h2 className="text-base font-bold text-ink-900">Analysis Error</h2>
          <p className="text-xs text-rose-700">{loadError}</p>
          <Link
            to="/fleet/upload"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700 transition"
          >
            <span>Upload New Dataset</span>
          </Link>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // RENDER: Empty State (Strict rule: No hardcoded demo data)
  // -------------------------------------------------------------------------
  if (!summary) {
    return (
      <div className="min-h-screen bg-cream text-ink-900 pb-20">
        <div className="mx-auto max-w-4xl px-4 pt-16 text-center space-y-6">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-white border border-ink-100 shadow-2xs text-brand-600">
            <Truck className="h-10 w-10" />
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold text-ink-900">No Fleet Dataset Analysed Yet</h1>
            <p className="mx-auto max-w-md text-sm text-ink-600 leading-relaxed">
              Upload your own electric vehicle battery CSV dataset to generate multi-vehicle health analytics,
              remaining useful life horizons, and maintenance priority lists.
            </p>
          </div>

          <div className="rounded-2xl border border-ink-100 bg-white p-6 max-w-lg mx-auto text-left space-y-3 shadow-2xs">
            <div className="flex items-center gap-2 text-xs font-bold text-ink-800">
              <Sparkles className="h-4 w-4 text-brand-600" />
              <span>Multi-Vehicle Intelligence Features</span>
            </div>
            <ul className="space-y-2 text-xs text-ink-600">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-brand-600 shrink-0" />
                <span>Deterministic SOH regression & anomaly detection</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-brand-600 shrink-0" />
                <span>Critical / Attention / Normal vehicle risk categorization</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-brand-600 shrink-0" />
                <span>Side-by-side technical vehicle comparison & CSV export</span>
              </li>
            </ul>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/fleet/upload"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3.5 text-sm font-bold text-white shadow-2xs hover:bg-brand-700 transition hover:scale-102"
            >
              <UploadCloud className="h-4 w-4" />
              <span>Upload Fleet Dataset</span>
              <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              to="/customer/battery"
              className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-5 py-3.5 text-sm font-semibold text-ink-700 hover:bg-ink-50 transition shadow-2xs"
            >
              <span>Back to Single Battery Wizard</span>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // RENDER: Full Multi-Vehicle Dashboard
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-cream text-ink-900 pb-24">
      {/* Top Header Bar */}
      <div className="border-b border-ink-100 bg-white py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-brand-600 mb-1">
                <Link to="/fleet/welcome" className="hover:underline flex items-center gap-1">
                  <ArrowLeft className="h-3.5 w-3.5" /> Fleet Intelligence
                </Link>
                <span>/</span>
                <span className="font-mono text-ink-500">{summary.filename}</span>
              </div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-extrabold text-ink-900">Fleet Battery Intelligence Dashboard</h1>
                <span className="rounded-full bg-brand-50 border border-brand-200 px-2.5 py-0.5 text-[11px] font-bold text-brand-700">
                  {summary.total_vehicles} EVs
                </span>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap items-center gap-2.5">
              <a
                href={api.exportFleetCsvUrl(summary.analysis_id)}
                download
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-700 px-4 py-2.5 text-xs font-bold text-white shadow-2xs transition"
              >
                <Download className="h-4 w-4" />
                <span>Export Fleet CSV</span>
              </a>

              <Link
                to="/fleet/history"
                className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white hover:bg-ink-50 px-3.5 py-2.5 text-xs font-semibold text-ink-700 shadow-2xs transition"
              >
                <History className="h-4 w-4 text-brand-600" />
                <span>History</span>
              </Link>

              <Link
                to="/fleet/upload"
                className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white hover:bg-ink-50 px-3.5 py-2.5 text-xs font-semibold text-ink-700 shadow-2xs transition"
              >
                <UploadCloud className="h-4 w-4 text-brand-600" />
                <span>New Upload</span>
              </Link>

              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 p-2.5 text-rose-700 transition"
                title="Delete this fleet dataset"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Navigation Sub-Tabs */}
          <div className="flex items-center gap-2 mt-6 border-t border-ink-100 pt-3">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                activeTab === 'overview'
                  ? 'bg-brand-600 text-white shadow-2xs'
                  : 'text-ink-600 hover:bg-ink-100'
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              <span>Fleet Overview</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('vehicles')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                activeTab === 'vehicles'
                  ? 'bg-brand-600 text-white shadow-2xs'
                  : 'text-ink-600 hover:bg-ink-100'
              }`}
            >
              <Cpu className="h-4 w-4" />
              <span>Vehicle Priority List ({totalRecords})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('maintenance')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                activeTab === 'maintenance'
                  ? 'bg-brand-600 text-white shadow-2xs'
                  : 'text-ink-600 hover:bg-ink-100'
              }`}
            >
              <Wrench className="h-4 w-4" />
              <span>Maintenance Planning ({summary.requiring_attention})</span>
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-8 space-y-8">
        {/* =========================================================================
            SECTION A: FLEET OVERVIEW KPI CARDS
           ========================================================================= */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-2xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-500">Fleet Vehicles</span>
            <p className="text-2xl font-black text-ink-900 mt-1">{summary.total_vehicles}</p>
            <span className="text-[10px] text-ink-400 mt-1 block">Uploaded records</span>
          </div>

          <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-2xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-500">Analysed</span>
            <p className="text-2xl font-black text-brand-700 mt-1">{summary.analysed_count}</p>
            <span className="text-[10px] text-emerald-600 font-semibold mt-1 block">Valid model runs</span>
          </div>

          <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-2xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-500">Average SOH</span>
            <p className="text-2xl font-black text-ink-900 mt-1">{summary.avg_soh_pct}%</p>
            <span className="text-[10px] text-ink-400 mt-1 block">Capacity retention</span>
          </div>

          <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-2xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-500">Average RUL</span>
            <p className="text-2xl font-black text-ink-900 mt-1">{summary.avg_eol_months} mo</p>
            <span className="text-[10px] text-ink-400 mt-1 block">Useful life horizon</span>
          </div>

          <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 shadow-2xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Critical Priority</span>
            <p className="text-2xl font-black text-rose-700 mt-1">{summary.critical_count}</p>
            <span className="text-[10px] text-rose-600 font-semibold mt-1 block">&lt;70% SOH or anomaly</span>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-2xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Requires Attention</span>
            <p className="text-2xl font-black text-amber-700 mt-1">{summary.requiring_attention}</p>
            <span className="text-[10px] text-amber-600 font-semibold mt-1 block">Inspection candidates</span>
          </div>
        </div>

        {/* =========================================================================
            SECTION B: FLEET BATTERY HEALTH DISTRIBUTIONS (Overview Tab)
           ========================================================================= */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* SOH Health Distribution Bar Chart */}
              <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-ink-900">State of Health (SOH) Distribution</h3>
                    <p className="text-xs text-ink-500">Fleet count by residual capacity band</p>
                  </div>
                  <span className="text-xs font-semibold text-brand-600">{summary.analysed_count} Packs</span>
                </div>

                <div className="h-64 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={healthChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <XAxis dataKey="range" tick={{ fontSize: 12, fill: '#64748b' }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          borderRadius: '12px',
                          border: '1px solid #e2e8f0',
                          fontSize: '12px',
                        }}
                      />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        {healthChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-4 gap-2 pt-2 border-t border-ink-100 text-center text-xs">
                  {healthChartData.map((d, i) => (
                    <div key={i} className="rounded-lg bg-ink-50/60 p-2">
                      <span className="block font-bold text-ink-900">{d.count}</span>
                      <span className="text-[10px] text-ink-500 font-semibold">{d.range}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Circularity Pathway Routing Breakdown */}
              <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-ink-900">Recommended Circularity Pathways</h3>
                    <p className="text-xs text-ink-500">Algorithmic second-life and recycling routing</p>
                  </div>
                  <span className="text-xs font-semibold text-brand-600">Decision Rules</span>
                </div>

                <div className="space-y-3 pt-2">
                  {pathwayChartData.map((item, idx) => {
                    const pct = summary.analysed_count > 0 ? ((item.value / summary.analysed_count) * 100).toFixed(0) : '0'
                    return (
                      <div key={idx} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-ink-800 flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.fill }} />
                            {item.name}
                          </span>
                          <span className="font-mono text-ink-600">
                            <strong>{item.value}</strong> vehicles ({pct}%)
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-ink-100 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, backgroundColor: item.fill }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-4 mt-4 text-xs text-brand-900 flex items-start gap-2.5">
                  <Info className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
                  <span>
                    Packs with <strong>&ge;70% SOH</strong> are retained in active EV traction or eligible for
                    second-life BESS storage; packs under the 70% threshold are routed to recycling.
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Priority Callouts */}
            <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-ink-900">Immediate Action Required</h3>
                  <p className="text-xs text-ink-500">Top vehicles flagged by degradation and anomaly models</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('maintenance')}
                  className="text-xs font-bold text-brand-600 hover:underline flex items-center gap-1"
                >
                  <span>View All Maintenance Alerts</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {maintenanceVehicles.length === 0 ? (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-center text-xs text-emerald-800">
                  All batteries in this fleet are currently operating within nominal parameters.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {maintenanceVehicles.slice(0, 3).map((v) => (
                    <div
                      key={v.id}
                      onClick={() => setInspectedVehicle(v)}
                      className="rounded-xl border border-ink-100 hover:border-brand-300 p-4 bg-ink-50/30 hover:bg-white transition cursor-pointer space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-ink-900 text-xs">{v.vehicle_id}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            v.priority_category === 'Critical'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {v.priority_category}
                        </span>
                      </div>
                      <div className="text-xs text-ink-600">
                        <span className="font-bold text-ink-900">{v.soh_pct}% SOH</span> · {v.eol_months} mo RUL
                      </div>
                      <p className="text-[11px] text-ink-500 line-clamp-2">{v.alert_reasons[0]}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            SECTION C: VEHICLE PRIORITY LIST (Vehicles Tab)
           ========================================================================= */}
        {activeTab === 'vehicles' && (
          <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-2xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-ink-900">Vehicle Priority List</h3>
                <p className="text-xs text-ink-500">
                  Showing {records.length} of {totalRecords} vehicle records in this fleet
                </p>
              </div>

              {/* Multi-Select Compare Trigger */}
              {selectedVehicleIds.length > 0 && (
                <div className="flex items-center gap-2 bg-brand-50 border border-brand-200 px-3 py-1.5 rounded-xl text-xs">
                  <span className="font-bold text-brand-800">{selectedVehicleIds.length} selected</span>
                  <button
                    type="button"
                    onClick={handleOpenComparison}
                    disabled={selectedVehicleIds.length < 2}
                    className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-bold px-3 py-1 text-xs transition disabled:opacity-40"
                  >
                    Compare Selected
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedVehicleIds([])}
                    className="text-ink-400 hover:text-ink-700"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Filter Controls Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-2.5 text-ink-400" />
                <input
                  type="text"
                  placeholder="Search vehicle or model..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setPage(1)
                  }}
                  className="w-full rounded-xl border border-ink-200 pl-9 pr-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 text-ink-900"
                />
              </div>

              <div>
                <select
                  value={priorityFilter}
                  onChange={(e) => {
                    setPriorityFilter(e.target.value)
                    setPage(1)
                  }}
                  className="w-full rounded-xl border border-ink-200 px-3 py-2 text-xs bg-white text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="All">All Priorities</option>
                  <option value="Critical">Critical Priority</option>
                  <option value="Attention">Attention Needed</option>
                  <option value="Normal">Normal Nominal</option>
                </select>
              </div>

              <div>
                <select
                  value={healthBandFilter}
                  onChange={(e) => {
                    setHealthBandFilter(e.target.value)
                    setPage(1)
                  }}
                  className="w-full rounded-xl border border-ink-200 px-3 py-2 text-xs bg-white text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="All">All Health Bands</option>
                  <option value="Good">Good (&ge;80% SOH)</option>
                  <option value="Attention">Attention (70-79% SOH)</option>
                  <option value="Critical">Critical (&lt;70% SOH)</option>
                </select>
              </div>

              <div>
                <select
                  value={pathwayFilter}
                  onChange={(e) => {
                    setPathwayFilter(e.target.value)
                    setPage(1)
                  }}
                  className="w-full rounded-xl border border-ink-200 px-3 py-2 text-xs bg-white text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="All">All Pathways</option>
                  <option value="CONTINUE_USE">Continue Use</option>
                  <option value="REPAIR_REFURBISHMENT">Repair / Refurbish</option>
                  <option value="SECOND_LIFE_ASSESSMENT">Second-Life</option>
                  <option value="EOL_CANDIDATE">EOL Candidate</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <select
                  value={sortBy}
                  onChange={(e) => {
                    setSortBy(e.target.value)
                    setPage(1)
                  }}
                  className="w-full rounded-xl border border-ink-200 px-3 py-2 text-xs bg-white text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="soh_pct">Sort by SOH %</option>
                  <option value="eol_months">Sort by Remaining Life</option>
                  <option value="anomaly_score">Sort by Anomaly Severity</option>
                  <option value="vehicle_id">Sort by Vehicle ID</option>
                </select>
                <button
                  type="button"
                  onClick={() => setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                  className="rounded-xl border border-ink-200 p-2 text-ink-600 hover:bg-ink-50 transition shrink-0 text-xs font-mono font-bold"
                  title="Toggle sort direction"
                >
                  {sortDir === 'asc' ? '↑' : '↓'}
                </button>
              </div>
            </div>

            {/* Records Table */}
            <div className="overflow-x-auto rounded-xl border border-ink-100">
              <table className="w-full text-left text-xs">
                <thead className="bg-ink-50 text-ink-600 border-b border-ink-100 font-semibold">
                  <tr>
                    <th className="py-3 px-3 w-8">
                      <span className="sr-only">Select</span>
                    </th>
                    <th className="py-3 px-4">Vehicle ID</th>
                    <th className="py-3 px-4">Model</th>
                    <th className="py-3 px-3">SOH %</th>
                    <th className="py-3 px-3">Est. RUL</th>
                    <th className="py-3 px-3">Anomaly</th>
                    <th className="py-3 px-3">Priority</th>
                    <th className="py-3 px-4">Next Recommended Action</th>
                    <th className="py-3 px-3 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 text-ink-700">
                  {isLoadingRecords ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-ink-400">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-brand-600 mb-2" />
                        <span>Loading records...</span>
                      </td>
                    </tr>
                  ) : records.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-ink-400">
                        No vehicle records match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    records.map((r) => {
                      const isSelected = selectedVehicleIds.includes(r.vehicle_id)
                      return (
                        <tr
                          key={r.id}
                          className={`hover:bg-ink-50/50 transition cursor-pointer ${
                            isSelected ? 'bg-brand-50/40' : ''
                          }`}
                          onClick={() => setInspectedVehicle(r)}
                        >
                          <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectVehicle(r.vehicle_id)}
                              className="rounded border-ink-300 text-brand-600 focus:ring-brand-500 h-3.5 w-3.5 cursor-pointer"
                            />
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-ink-900">{r.vehicle_id}</td>
                          <td className="py-3 px-4 text-ink-600">{r.model_name || 'EV Pack'}</td>
                          <td className="py-3 px-3 font-semibold">
                            <span
                              className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold ${
                                r.soh_pct >= 80
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : r.soh_pct >= 70
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {r.soh_pct}%
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono text-ink-800">{r.eol_months} mo</td>
                          <td className="py-3 px-3 font-mono text-ink-600">{r.anomaly_score.toFixed(2)}</td>
                          <td className="py-3 px-3">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                r.priority_category === 'Critical'
                                  ? 'bg-rose-100 text-rose-800'
                                  : r.priority_category === 'Attention'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {r.priority_category}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-ink-600 max-w-xs truncate">{r.recommended_action}</td>
                          <td className="py-3 px-3 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setInspectedVehicle(r)
                              }}
                              className="text-brand-600 hover:text-brand-700 font-bold text-xs"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between text-xs text-ink-500 pt-2">
              <span>
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="rounded-lg border border-ink-200 p-1.5 hover:bg-ink-50 disabled:opacity-40 transition"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  className="rounded-lg border border-ink-200 p-1.5 hover:bg-ink-50 disabled:opacity-40 transition"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            SECTION D: MAINTENANCE PLANNING PANEL (Maintenance Tab)
           ========================================================================= */}
        {activeTab === 'maintenance' && (
          <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-2xs space-y-6">
            <div>
              <h3 className="text-lg font-bold text-ink-900">Maintenance & Inspection Action Plan</h3>
              <p className="text-xs text-ink-500">
                Packs identified with thermal stress, rapid capacity degradation, cell voltage imbalance, or imminent EOL
              </p>
            </div>

            <div className="space-y-4">
              {maintenanceVehicles.length === 0 ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center text-xs text-emerald-800">
                  <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto mb-2" />
                  <p className="font-bold text-sm">No Immediate Maintenance Interventions Needed</p>
                  <p className="mt-1">All vehicles are operating above traction safety floors without significant anomalies.</p>
                </div>
              ) : (
                maintenanceVehicles.map((v) => (
                  <div
                    key={v.id}
                    className="rounded-2xl border border-ink-100 bg-ink-50/40 p-5 space-y-3 hover:border-brand-300 transition"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-ink-100 pb-3">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-black text-ink-900">{v.vehicle_id}</span>
                        <span className="text-xs text-ink-500">{v.model_name || 'EV Pack'}</span>
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                            v.priority_category === 'Critical'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {v.priority_category} Priority
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs font-mono">
                        <span>
                          SOH: <strong>{v.soh_pct}%</strong>
                        </span>
                        <span>
                          Est. RUL: <strong>{v.eol_months} mo</strong>
                        </span>
                        <span>
                          Anomaly: <strong>{v.anomaly_score.toFixed(2)}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Alert Reasons List */}
                    <div className="space-y-1.5">
                      <span className="text-xs font-bold text-ink-700">Root-Cause Alert Indicators:</span>
                      <ul className="space-y-1 text-xs text-ink-600">
                        {v.alert_reasons.map((reason, rIdx) => (
                          <li key={rIdx} className="flex items-start gap-2">
                            <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                            <span>{reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Recommended Follow-up */}
                    <div className="rounded-xl bg-white p-3 border border-ink-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-ink-900">Suggested Follow-Up: </span>
                        <span className="text-ink-700">{v.recommended_action}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setInspectedVehicle(v)}
                        className="rounded-lg bg-ink-100 hover:bg-brand-50 hover:text-brand-700 px-3 py-1 text-xs font-bold transition whitespace-nowrap"
                      >
                        Inspect Telemetry
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          MODAL 1: SIDE-BY-SIDE VEHICLE COMPARISON MODAL
         ========================================================================= */}
      {isComparing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-ink-100 pb-4">
              <div className="flex items-center gap-2">
                <Columns3 className="h-5 w-5 text-brand-600" />
                <h3 className="text-lg font-bold text-ink-900">Side-by-Side Vehicle Comparison</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsComparing(false)}
                className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {isLoadingComparison ? (
              <div className="py-12 text-center text-ink-400">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-brand-600 mb-2" />
                <span>Loading comparison...</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {comparisonData.map((veh) => (
                  <div key={veh.vehicle_id} className="rounded-2xl border border-ink-200 bg-ink-50/30 p-4 space-y-3 text-xs">
                    <div className="border-b border-ink-200 pb-2">
                      <span className="font-mono text-sm font-black text-ink-900">{veh.vehicle_id}</span>
                      <p className="text-[11px] text-ink-500">{veh.model_name || 'EV Pack'}</p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-ink-500">SOH:</span>
                        <span className="font-bold text-ink-900">{veh.soh_pct}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-500">Est. Life:</span>
                        <span className="font-bold text-ink-900">{veh.eol_months} mo</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-500">Anomaly:</span>
                        <span className="font-bold text-ink-900">{veh.anomaly_score.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-500">Risk Tier:</span>
                        <span className="font-bold text-ink-900">{veh.future_risk}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-500">Pathway:</span>
                        <span className="font-bold text-ink-900">{veh.pathway_label}</span>
                      </div>
                    </div>

                    <div className="border-t border-ink-200 pt-2">
                      <span className="font-bold text-ink-700 text-[11px]">Recommended Action:</span>
                      <p className="text-[11px] text-ink-600 mt-1 leading-relaxed">{veh.recommended_action}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          DRAWER: VEHICLE TELEMETRY INSPECTION
         ========================================================================= */}
      {inspectedVehicle && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40 backdrop-blur-xs">
          <div className="h-full w-full max-w-md bg-white p-6 shadow-2xl overflow-y-auto space-y-6">
            <div className="flex items-center justify-between border-b border-ink-100 pb-4">
              <div>
                <span className="text-xs text-ink-500">Vehicle Inspection</span>
                <h3 className="text-xl font-extrabold text-ink-900 font-mono">{inspectedVehicle.vehicle_id}</h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectedVehicle(null)}
                className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Diagnostic Badges */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-xl border border-ink-100 bg-ink-50 p-2.5">
                <span className="text-ink-500 text-[10px] uppercase font-bold">SOH</span>
                <p className="text-base font-black text-ink-900 mt-0.5">{inspectedVehicle.soh_pct}%</p>
              </div>
              <div className="rounded-xl border border-ink-100 bg-ink-50 p-2.5">
                <span className="text-ink-500 text-[10px] uppercase font-bold">Est. RUL</span>
                <p className="text-base font-black text-ink-900 mt-0.5">{inspectedVehicle.eol_months} mo</p>
              </div>
              <div className="rounded-xl border border-ink-100 bg-ink-50 p-2.5">
                <span className="text-ink-500 text-[10px] uppercase font-bold">Anomaly</span>
                <p className="text-base font-black text-ink-900 mt-0.5">{inspectedVehicle.anomaly_score.toFixed(2)}</p>
              </div>
            </div>

            {/* Pathway & Actions */}
            <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-4 space-y-2">
              <span className="text-xs font-bold text-brand-900">Assigned Circularity Pathway:</span>
              <p className="text-sm font-extrabold text-brand-700">{inspectedVehicle.pathway_label}</p>
              <p className="text-xs text-brand-800 leading-relaxed">{inspectedVehicle.recommended_action}</p>
            </div>

            {/* Alert Reasons */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-ink-800">Alert Diagnostics:</span>
              <ul className="space-y-1.5 text-xs text-ink-600">
                {inspectedVehicle.alert_reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button
              type="button"
              onClick={() => setInspectedVehicle(null)}
              className="w-full rounded-xl bg-ink-900 py-3 text-xs font-bold text-white hover:bg-black transition"
            >
              Close Inspection Drawer
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: CONFIRM DATASET DELETION MODAL
         ========================================================================= */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertTriangle className="h-6 w-6" />
              <h3 className="text-base font-bold text-ink-900">Delete Fleet Dataset?</h3>
            </div>
            <p className="text-xs text-ink-600 leading-relaxed">
              This action will permanently delete <strong>{summary.filename}</strong>, along with all associated vehicle
              predictions and analysis results. This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="rounded-xl border border-ink-200 px-4 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteDataset}
                disabled={isDeleting}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 transition"
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                <span>Permanently Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
