import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BatteryCharging,
  Clock,
  Layers,
  MapPin,
  MessageSquare,
  ShieldCheck,
} from 'lucide-react'
import { api, type ConsumerEnquiryItem } from '../services/api'

export default function ConsumerEnquiries() {
  const [loading, setLoading] = useState(true)
  const [enquiries, setEnquiries] = useState<ConsumerEnquiryItem[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        const res = await api.getConsumerEnquiries()
        setEnquiries(res.enquiries || [])
      } catch (err: any) {
        console.error('Failed to load enquiries:', err)
        setError('Failed to fetch your submitted circular enquiries.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SUBMITTED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 border border-amber-200">
            <Clock className="h-3 w-3" />
            Submitted • Under Review
          </span>
        )
      case 'REVIEWED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 border border-sky-200">
            <Layers className="h-3 w-3" />
            Under Evaluation by Recycler
          </span>
        )
      case 'RESPONDED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
            <CheckCircle2Icon className="h-3 w-3" />
            Coordinated & Contacted
          </span>
        )
      case 'CLOSED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-700">
            Closed
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-700">
            {status}
          </span>
        )
    }
  }

  function CheckCircle2Icon(props: any) {
    return (
      <svg
        {...props}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    )
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-600">
            <MessageSquare className="h-4 w-4" />
            <span>Consumer Communications</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900">
            My Battery Enquiries
          </h1>
          <p className="mt-1 text-sm text-ink-600">
            Track inquiries you have logged regarding eligible discarded and end-of-life battery packs.
          </p>
        </div>

        <Link
          to="/consumer/discarded-batteries"
          className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 transition"
        >
          <BatteryCharging className="h-4 w-4" />
          Discover More Batteries
        </Link>
      </div>

      {/* Privacy Protection Notice */}
      <div className="mb-6 rounded-2xl border border-brand-200 bg-brand-50/60 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 shrink-0 text-brand-600 mt-0.5" />
          <div className="text-xs leading-relaxed text-brand-900">
            <span className="font-semibold">Privacy-Preserving Communication: </span>
            Inquiries are non-binding technical and circular engagement requests. Vehicle owner personal contact details are maintained confidentially. EVolve AI coordinates communications between qualified inquirers, authorized recycling facilities, and battery custodians.
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        </div>
      ) : enquiries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-300 bg-white p-12 text-center">
          <MessageSquare className="mx-auto h-12 w-12 text-ink-400" />
          <h3 className="mt-3 text-base font-semibold text-ink-900">No Enquiries Submitted Yet</h3>
          <p className="mt-1 text-sm text-ink-500 max-w-md mx-auto">
            You haven't logged any technical or second-life inquiries for discarded batteries yet. Explore available batteries and submit an inquiry when interested.
          </p>
          <div className="mt-6">
            <Link
              to="/consumer/discarded-batteries"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 transition"
            >
              Browse Discarded Batteries
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {enquiries.map((enq) => (
            <div
              key={enq.enquiry_id}
              className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm hover:border-brand-300 transition"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-mono text-xs font-bold text-ink-900">{enq.enquiry_id}</span>
                    {getStatusBadge(enq.status)}
                    <span className="text-2xs text-ink-500">
                      Submitted on {new Date(enq.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <h3 className="mt-2 text-base font-bold text-ink-900">
                    Purpose: {enq.enquiry_purpose}
                  </h3>
                  {enq.intended_application && (
                    <p className="text-xs text-brand-700 font-medium">
                      Intended Application: {enq.intended_application}
                    </p>
                  )}
                </div>

                <Link
                  to={`/consumer/discarded-batteries/${enq.battery_id}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50 transition"
                >
                  View Pack
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              {/* Associated Battery Summary */}
              {enq.battery_summary && (
                <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-ink-100 bg-ink-50/70 p-3.5 sm:grid-cols-4 text-xs">
                  <div>
                    <span className="text-ink-500">Battery ID</span>
                    <p className="font-mono font-bold text-ink-900">{enq.battery_id}</p>
                  </div>
                  <div>
                    <span className="text-ink-500">Model & Year</span>
                    <p className="font-semibold text-ink-900">{enq.battery_summary.vehicle_model}</p>
                  </div>
                  <div>
                    <span className="text-ink-500">Specs</span>
                    <p className="font-semibold text-ink-900">
                      {enq.battery_summary.chemistry} • {enq.battery_summary.rated_capacity_kwh} kWh
                    </p>
                  </div>
                  <div>
                    <span className="text-ink-500">Location</span>
                    <p className="font-semibold text-ink-900 flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-ink-400" />
                      {enq.battery_summary.approximate_area}
                    </p>
                  </div>
                </div>
              )}

              {enq.message && (
                <div className="mt-3 rounded-xl bg-ink-50/50 p-3 text-xs text-ink-700 border border-ink-100">
                  <span className="font-semibold text-ink-900">Your Inquiry Notes: </span>
                  {enq.message}
                </div>
              )}

              {enq.response_notes && (
                <div className="mt-3 rounded-xl bg-emerald-50/70 p-3 text-xs text-emerald-900 border border-emerald-200">
                  <span className="font-semibold">Coordinator / Recycler Response: </span>
                  {enq.response_notes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
