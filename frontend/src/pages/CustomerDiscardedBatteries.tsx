import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  BatteryCharging,
  Clock,
  HelpCircle,
  Layers,
  MessageSquare,
  PlusCircle,
  Recycle,
  ShieldCheck,
  Truck,
  Zap,
} from 'lucide-react'
import { api, type DiscardedBatteryItem } from '../services/api'

export default function CustomerDiscardedBatteries() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<DiscardedBatteryItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showStatusHelp, setShowStatusHelp] = useState(false)

  const loadData = async () => {
    try {
      setLoading(true)
      const res = await api.getCustomerDiscardedBatteries()
      setItems(res.discarded_batteries || [])
    } catch (err: any) {
      console.error('Failed to load discarded batteries:', err)
      setError(err?.message || 'Failed to fetch discarded battery records.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING_ASSESSMENT':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 border border-amber-200">
            <Clock className="h-3 w-3" />
            Reported • Awaiting Assessment
          </span>
        )
      case 'APPROVED_FOR_SECOND_LIFE':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
            <Zap className="h-3 w-3" />
            Recommended for Reuse
          </span>
        )
      case 'APPROVED_FOR_RECYCLING':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700 border border-purple-200">
            <Recycle className="h-3 w-3" />
            Recommended for Recycling
          </span>
        )
      case 'COLLECTION_REQUESTED':
      case 'SCHEDULED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 border border-blue-200">
            <Truck className="h-3 w-3" />
            Collection Scheduled
          </span>
        )
      case 'COLLECTED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 border border-indigo-200">
            <ShieldCheck className="h-3 w-3" />
            Collected
          </span>
        )
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700 border border-teal-200">
            <Layers className="h-3 w-3" />
            In Processing
          </span>
        )
      case 'RECOVERY_COMPLETED':
      case 'RECOVERED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 border border-emerald-300">
            <ShieldCheck className="h-3 w-3" />
            Recovered & Closed
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-700">
            {status}
          </span>
        )
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      {/* Top Banner */}
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-600">
            <Recycle className="h-4 w-4" />
            <span>Customer Circular Records</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900">
            My Discarded Batteries
          </h1>
          <p className="mt-1 text-sm text-ink-600">
            Track end-of-life battery assessment reports, circular evaluation progress, and anonymous inquiry engagement.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowStatusHelp(!showStatusHelp)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3.5 py-2 text-xs font-medium text-ink-700 hover:bg-ink-50 transition"
          >
            <HelpCircle className="h-4 w-4 text-ink-500" />
            Status Guide
          </button>
          <Link
            to="/customer/report-eol"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 transition"
          >
            <PlusCircle className="h-4 w-4" />
            Report a Battery
          </Link>
        </div>
      </div>

      {/* Privacy Guarantee Note */}
      <div className="mb-6 rounded-2xl border border-brand-200 bg-brand-50/60 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 shrink-0 text-brand-600 mt-0.5" />
          <div className="text-xs leading-relaxed text-brand-900">
            <span className="font-semibold">Privacy & Identity Protection: </span>
            Your battery's technical condition is anonymized when shared with certified circular diagnostic partners and second-life buyers. Your name, phone number, email address, and vehicle license plate are never visible to consumers.
          </div>
        </div>
      </div>

      {/* Expandable Lifecycle Status Guide */}
      {showStatusHelp && (
        <div className="mb-6 rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink-800">
            Lifecycle Status Stages Explained
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs text-ink-600">
            <div className="rounded-xl border border-ink-100 p-3 bg-ink-50/50">
              <p className="font-semibold text-ink-900">1. Reported / Pending Assessment</p>
              <p className="mt-1">Battery report received; queued for diagnostic verification by authorized partner.</p>
            </div>
            <div className="rounded-xl border border-ink-100 p-3 bg-ink-50/50">
              <p className="font-semibold text-ink-900">2. Recommended for Reuse / Recycling</p>
              <p className="mt-1">Testing facility determined whether pack is suitable for stationary storage or mineral extraction.</p>
            </div>
            <div className="rounded-xl border border-ink-100 p-3 bg-ink-50/50">
              <p className="font-semibold text-ink-900">3. Collection Scheduled & Picked Up</p>
              <p className="mt-1">Reverse logistics assigned; pack is picked up by certified hazardous materials handler.</p>
            </div>
            <div className="rounded-xl border border-ink-100 p-3 bg-ink-50/50">
              <p className="font-semibold text-ink-900">4. In Processing & Recovered</p>
              <p className="mt-1">Dismantled or hydrometallurgically refined into critical battery-grade minerals.</p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-300 bg-white p-12 text-center">
          <BatteryCharging className="mx-auto h-12 w-12 text-ink-400" />
          <h3 className="mt-3 text-base font-semibold text-ink-900">No Discarded Batteries Reported</h3>
          <p className="mt-1 text-sm text-ink-500 max-w-md mx-auto">
            You haven't reported any batteries for end-of-life assessment or recycling yet. If your EV battery has degraded or been replaced, you can report it for circular evaluation.
          </p>
          <div className="mt-6">
            <Link
              to="/customer/report-eol"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 transition"
            >
              <PlusCircle className="h-4 w-4" />
              Report End-of-Life Battery
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div
              key={item.report_id || item.battery_id}
              className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm hover:border-ink-300 transition"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-sm font-bold text-ink-900">{item.battery_id}</span>
                    {getStatusBadge(item.sharing_status || item.lifecycle_status)}
                    {item.professionally_assessed && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-2xs font-semibold text-sky-700 border border-sky-200">
                        Professionally Evaluated
                      </span>
                    )}
                  </div>
                  <h3 className="mt-1 text-base font-semibold text-ink-900">
                    {item.vehicle_manufacturer} {item.vehicle_model} ({item.purchase_year})
                  </h3>
                  <p className="text-xs text-ink-500">
                    Reported on {new Date(item.reported_at).toLocaleDateString()} • Reason: <span className="text-ink-700 font-medium">{item.reporting_reason}</span>
                  </p>
                </div>

                {/* Consumer Enquiries Badge */}
                <div className="flex items-center gap-2">
                  <div className="rounded-xl border border-ink-100 bg-ink-50 px-3.5 py-1.5 text-center">
                    <p className="text-2xs uppercase tracking-wider text-ink-500 font-medium">Inquiries</p>
                    <p className="text-sm font-bold text-ink-900 flex items-center justify-center gap-1">
                      <MessageSquare className="h-3.5 w-3.5 text-brand-500" />
                      {item.enquiries_count}
                    </p>
                  </div>
                </div>
              </div>

              {/* Technical & Location Attributes */}
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-ink-100 pt-4 sm:grid-cols-4 text-xs">
                <div>
                  <p className="text-ink-500">Condition Reported</p>
                  <p className="font-semibold text-ink-800 capitalize">{item.current_condition}</p>
                </div>
                <div>
                  <p className="text-ink-500">Last Estimated SOH</p>
                  <p className="font-semibold text-emerald-600">
                    {item.soh_pct !== null ? `${item.soh_pct}%` : 'Not recorded'}
                  </p>
                </div>
                <div>
                  <p className="text-ink-500">Approx. Location</p>
                  <p className="font-semibold text-ink-800">{item.collection_city}, {item.collection_state}</p>
                </div>
                <div>
                  <p className="text-ink-500">Second-Life Suitability</p>
                  <p className="font-semibold text-brand-700">{item.second_life_suitability || 'Pending'}</p>
                </div>
              </div>

              {item.assessment_notes && (
                <div className="mt-3 rounded-xl bg-ink-50/70 p-3 text-xs text-ink-700">
                  <span className="font-semibold text-ink-900">Technician Diagnostic Notes: </span>
                  {item.assessment_notes}
                </div>
              )}

              {/* Bottom Actions */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-3">
                <span className="text-2xs text-ink-500">
                  Report ID: <span className="font-mono">{item.report_id}</span>
                </span>

                <div className="flex items-center gap-2">
                  <Link
                    to={`/customer/lifecycle?battery_id=${item.battery_id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50 transition"
                  >
                    <Layers className="h-3.5 w-3.5 text-brand-500" />
                    View Lifecycle Audit
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
