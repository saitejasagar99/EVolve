import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  ArrowRight,
  BatteryCharging,
  BookOpen,
  Boxes,
  Info,
  Layers,
  MapPin,
  Recycle,
  Search,
  Sparkles,
  Zap,
} from 'lucide-react'
import { api, type SharedBatterySummary } from '../services/api'

export default function ConsumerDiscardedBatteries() {
  const location = useLocation()
  const isLifecycleTrackingMode = location.pathname.includes('lifecycle-tracking')

  const [loading, setLoading] = useState(true)
  const [batteries, setBatteries] = useState<SharedBatterySummary[]>([])
  const [counts, setCounts] = useState({
    all: 0,
    awaiting_assessment: 0,
    second_life: 0,
    recycling: 0,
    tracking: 0,
  })
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [chemistry, setChemistry] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState(
    isLifecycleTrackingMode ? 'COLLECTION_TRACKING' : 'ALL'
  )
  const [stateFilter, setStateFilter] = useState('ALL')
  const [minCapacity, setMinCapacity] = useState('')
  const [maxCapacity, setMaxCapacity] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    if (location.pathname.includes('lifecycle-tracking')) {
      setStatusFilter('COLLECTION_TRACKING')
    }
  }, [location.pathname])

  const fetchBatteries = async () => {
    try {
      setLoading(true)
      const res = await api.recyclingBatteries({
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        chemistry: chemistry !== 'ALL' ? chemistry : undefined,
        state: stateFilter !== 'ALL' ? stateFilter : undefined,
        min_capacity: minCapacity ? parseFloat(minCapacity) : undefined,
        max_capacity: maxCapacity ? parseFloat(maxCapacity) : undefined,
        search: searchTerm.trim() || undefined,
      })
      setBatteries(res.batteries || [])
      setCounts(res.counts || { all: 0, awaiting_assessment: 0, second_life: 0, recycling: 0, tracking: 0 })
    } catch (err: any) {
      console.error('Failed to load shared batteries:', err)
      setError('Unable to fetch discarded battery records at this time.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBatteries()
  }, [chemistry, statusFilter, stateFilter])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    fetchBatteries()
  }

  const getPathwayBadge = (badge?: string, status?: string) => {
    const val = badge || status || ''
    if (val === 'SECOND_LIFE_CANDIDATE' || val === 'APPROVED_FOR_SECOND_LIFE') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
          <Zap className="h-3 w-3" />
          Second-Life Candidate
        </span>
      )
    }
    if (val === 'RECYCLING_CANDIDATE' || val === 'APPROVED_FOR_RECYCLING') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700 border border-purple-200">
          <Recycle className="h-3 w-3" />
          Material Recycling Candidate
        </span>
      )
    }
    if (val === 'IN_RECOVERY' || val === 'PROCESSING' || val === 'RECOVERY_COMPLETED') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700 border border-teal-200">
          <Layers className="h-3 w-3" />
          In Mineral Recovery
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 border border-amber-200">
        <Sparkles className="h-3 w-3" />
        Awaiting Diagnostic Assessment
      </span>
    )
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      {/* Top Header */}
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-600">
            <Recycle className="h-4 w-4" />
            <span>{isLifecycleTrackingMode ? 'Circularity Tracking' : 'Circular Economy Discovery'}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900">
            {isLifecycleTrackingMode ? 'Lifecycle Tracking' : 'Discover Discarded Batteries'}
          </h1>
          <p className="mt-1 text-sm text-ink-600 max-w-2xl">
            {isLifecycleTrackingMode
              ? 'Track verified retired EV batteries progressing through collection logistics, technical testing, and material recovery pipelines.'
              : 'Explore authoritative retired EV batteries registered by vehicle owners. Understand their lifecycle condition, inspect components, and participate in circular reuse or certified recycling.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/consumer/parts-guide"
            className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3.5 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50 transition"
          >
            <BookOpen className="h-4 w-4 text-brand-600" />
            Parts & Materials Guide
          </Link>
          <Link
            to="/consumer/reuse-vs-recycling"
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-50 px-3.5 py-2 text-xs font-semibold text-brand-800 border border-brand-200 hover:bg-brand-100 transition"
          >
            <Zap className="h-4 w-4 text-brand-600" />
            Reuse vs Recycling
          </Link>
        </div>
      </div>

      {/* Safety & Non-Marketplace Disclaimer Banner */}
      <div className="mb-6 rounded-2xl border border-ink-200 bg-white p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 shrink-0 text-brand-600 mt-0.5" />
          <div className="text-xs leading-relaxed text-ink-700">
            <span className="font-semibold text-ink-900">Non-Commercial Discovery & Certified Safety Protocol: </span>
            This discovery catalog connects high-voltage battery owners with certified circular logistics and technical evaluators. Batteries are not retail consumer goods. Any second-life application requires qualified bench testing by certified technicians. Vehicle owner personal information is strictly protected.
          </div>
        </div>
      </div>

      {/* Status Stage Tabs */}
      <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-ink-200 pb-3 text-sm">
        <button
          onClick={() => setStatusFilter('ALL')}
          className={`rounded-xl px-3.5 py-1.5 font-medium transition ${
            statusFilter === 'ALL'
              ? 'bg-ink-900 text-white'
              : 'text-ink-600 hover:bg-ink-100'
          }`}
        >
          All Batteries ({counts.all})
        </button>
        <button
          onClick={() => setStatusFilter('PENDING_ASSESSMENT')}
          className={`rounded-xl px-3.5 py-1.5 font-medium transition ${
            statusFilter === 'PENDING_ASSESSMENT'
              ? 'bg-amber-600 text-white'
              : 'text-ink-600 hover:bg-ink-100'
          }`}
        >
          Awaiting Assessment ({counts.awaiting_assessment})
        </button>
        <button
          onClick={() => setStatusFilter('APPROVED_FOR_SECOND_LIFE')}
          className={`rounded-xl px-3.5 py-1.5 font-medium transition ${
            statusFilter === 'APPROVED_FOR_SECOND_LIFE'
              ? 'bg-emerald-600 text-white'
              : 'text-ink-600 hover:bg-ink-100'
          }`}
        >
          Second-Life Candidates ({counts.second_life})
        </button>
        <button
          onClick={() => setStatusFilter('APPROVED_FOR_RECYCLING')}
          className={`rounded-xl px-3.5 py-1.5 font-medium transition ${
            statusFilter === 'APPROVED_FOR_RECYCLING'
              ? 'bg-purple-600 text-white'
              : 'text-ink-600 hover:bg-ink-100'
          }`}
        >
          Recycling Candidates ({counts.recycling})
        </button>
        <button
          onClick={() => setStatusFilter('COLLECTION_TRACKING')}
          className={`rounded-xl px-3.5 py-1.5 font-medium transition ${
            statusFilter === 'COLLECTION_TRACKING'
              ? 'bg-teal-600 text-white'
              : 'text-ink-600 hover:bg-ink-100'
          }`}
        >
          In Logistics & Processing ({counts.tracking})
        </button>
      </div>

      {/* Search and Secondary Filter Controls */}
      <div className="mb-6 rounded-2xl border border-ink-200 bg-white p-4 shadow-sm">
        <form onSubmit={handleSearchSubmit} className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
          {/* Search Term */}
          <div className="sm:col-span-2">
            <label className="block text-2xs font-semibold uppercase tracking-wider text-ink-500">Search</label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search battery ID, vehicle model, city..."
                className="w-full rounded-xl border border-ink-200 pl-9 pr-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Chemistry */}
          <div>
            <label className="block text-2xs font-semibold uppercase tracking-wider text-ink-500">Chemistry</label>
            <select
              value={chemistry}
              onChange={(e) => setChemistry(e.target.value)}
              className="mt-1 w-full rounded-xl border border-ink-200 p-2 text-xs focus:border-brand-500 focus:outline-none"
            >
              <option value="ALL">All Chemistries</option>
              <option value="LFP">LFP (Iron Phosphate)</option>
              <option value="NMC">NMC (Nickel Manganese)</option>
              <option value="NCA">NCA (Nickel Cobalt Al)</option>
            </select>
          </div>

          {/* State */}
          <div>
            <label className="block text-2xs font-semibold uppercase tracking-wider text-ink-500">Region / State</label>
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="mt-1 w-full rounded-xl border border-ink-200 p-2 text-xs focus:border-brand-500 focus:outline-none"
            >
              <option value="ALL">All States</option>
              <option value="Telangana">Telangana</option>
              <option value="Karnataka">Karnataka</option>
              <option value="Maharashtra">Maharashtra</option>
              <option value="Delhi">Delhi</option>
              <option value="Tamil Nadu">Tamil Nadu</option>
              <option value="Gujarat">Gujarat</option>
            </select>
          </div>

          {/* Capacity Min */}
          <div>
            <label className="block text-2xs font-semibold uppercase tracking-wider text-ink-500">Min Capacity (kWh)</label>
            <input
              type="number"
              value={minCapacity}
              onChange={(e) => setMinCapacity(e.target.value)}
              placeholder="e.g. 20"
              className="mt-1 w-full rounded-xl border border-ink-200 p-2 text-xs focus:border-brand-500 focus:outline-none"
            />
          </div>

          {/* Capacity Max & Submit */}
          <div>
            <label className="block text-2xs font-semibold uppercase tracking-wider text-ink-500">Max Capacity (kWh)</label>
            <div className="flex gap-2 mt-1">
              <input
                type="number"
                value={maxCapacity}
                onChange={(e) => setMaxCapacity(e.target.value)}
                placeholder="e.g. 80"
                className="w-full rounded-xl border border-ink-200 p-2 text-xs focus:border-brand-500 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-xl bg-ink-900 px-3 py-2 text-xs font-semibold text-white hover:bg-ink-800 transition"
              >
                Apply
              </button>
            </div>
          </div>
        </form>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Battery Cards Grid */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        </div>
      ) : batteries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-300 bg-white p-12 text-center">
          <BatteryCharging className="mx-auto h-12 w-12 text-ink-400" />
          <h3 className="mt-3 text-base font-semibold text-ink-900">No Eligible Batteries Match Your Filters</h3>
          <p className="mt-1 text-sm text-ink-500 max-w-md mx-auto">
            Try adjusting your chemistry, lifecycle status, or state filters to view available discarded batteries.
          </p>
          <div className="mt-4">
            <button
              onClick={() => {
                setChemistry('ALL')
                setStatusFilter('ALL')
                setStateFilter('ALL')
                setMinCapacity('')
                setMaxCapacity('')
                setSearchTerm('')
              }}
              className="text-xs font-semibold text-brand-600 hover:text-brand-700"
            >
              Reset all filters
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {batteries.map((b) => (
            <div
              key={b.battery_id}
              className="card-interactive flex flex-col justify-between rounded-2xl border border-ink-200 bg-white p-5 shadow-sm hover:border-brand-400 hover:shadow-lg transition-all duration-300 group"
            >
              <div>
                {/* Badges Header */}
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-ink-900">{b.battery_id}</span>
                  {getPathwayBadge(b.pathway_badge, b.sharing_status)}
                </div>

                {/* Title */}
                <h3 className="mt-2 text-base font-bold text-ink-900">
                  {b.vehicle_manufacturer} {b.vehicle_model}
                </h3>
                <p className="text-xs text-ink-500">
                  Model Year: {b.purchase_year || 'Recorded'} • Category: {b.category}
                </p>

                {/* Core Specifications */}
                <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-xl border border-ink-100 bg-ink-50/70 p-3 text-xs">
                  <div>
                    <span className="text-ink-500">Chemistry:</span>
                    <p className="font-semibold text-ink-900">{b.chemistry}</p>
                  </div>
                  <div>
                    <span className="text-ink-500">Rated Capacity:</span>
                    <p className="font-semibold text-ink-900">{b.rated_capacity_kwh} kWh</p>
                  </div>
                  <div>
                    <span className="text-ink-500">Nominal Voltage:</span>
                    <p className="font-semibold text-ink-900">
                      {b.voltage_v ? `${b.voltage_v} V DC` : '350.0 V DC'}
                    </p>
                  </div>
                  <div>
                    <span className="text-ink-500">Reported Condition:</span>
                    <p className="font-semibold text-ink-900 capitalize">
                      {b.reported_condition || 'Service Retired'}
                    </p>
                  </div>
                </div>

                {/* Identified Components Chip */}
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-950">
                  <Boxes className="h-4 w-4 text-emerald-600 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="font-bold block leading-tight">9 Identified Components</span>
                    <span className="text-[10.5px] text-emerald-700 truncate block">Cells · Modules · BMS · Enclosure · Busbars</span>
                  </div>
                </div>

                {/* Region Location */}
                <div className="mt-3 flex items-center gap-1.5 text-xs text-ink-600">
                  <MapPin className="h-3.5 w-3.5 text-ink-400 shrink-0" />
                  <span>Approx. Location: <span className="font-medium text-ink-800">{b.approximate_area}</span></span>
                </div>

                {/* Recommended Next Step */}
                <div className="mt-2.5 rounded-lg bg-brand-50/50 p-2 text-xs text-brand-900 border border-brand-100">
                  <span className="font-semibold">Next Step: </span>
                  {b.recommended_next_step}
                </div>
              </div>

              {/* Bottom Action */}
              <div className="mt-4 pt-3 border-t border-ink-100">
                <Link
                  to={`/consumer/discarded-batteries/${b.battery_id}`}
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('last_viewed_battery_id', b.battery_id)
                    }
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink-900 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-600 transition"
                >
                  <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                  <span>Explore Battery &amp; Components</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
