import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BatteryCharging,
  CheckCircle2,
  FileText,
  MapPin,
  ShieldAlert,
  Sparkles,
  Truck,
  Wrench,
  Info,
} from 'lucide-react'
import { api, type CustomerBatteryRecord, type BatteryDisposalReportResponse } from '../services/api'
import { useAuth } from '../context/AuthContext'

const REPORTING_REASONS = [
  'Reached the end of its useful EV service',
  'Reduced performance',
  'Removed during vehicle repair or replacement',
  'Damaged in an accident',
  'Other',
]

const CONDITIONS = [
  { value: 'Working', label: 'Working', desc: 'Battery operates normally with reduced range.' },
  { value: 'Reduced performance', label: 'Reduced performance', desc: 'Noticeable range drops, slow charging, or power throttling.' },
  { value: 'Damaged', label: 'Damaged', desc: 'Physical impact, water ingress, or thermal warning history.' },
  { value: 'Unknown', label: 'Unknown', desc: 'Condition cannot be verified safely.' },
]

export default function CustomerReportEol() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [battery, setBattery] = useState<CustomerBatteryRecord | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<BatteryDisposalReportResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Form State
  const [reason, setReason] = useState(REPORTING_REASONS[0])
  const [condition, setCondition] = useState('Working')
  const [professionallyAssessed, setProfessionallyAssessed] = useState(false)
  const [assessmentNotes, setAssessmentNotes] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [pincode, setPincode] = useState('')
  const [sharingConsent, setSharingConsent] = useState(true)
  const [supportingDetails, setSupportingDetails] = useState('')

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        const res = await api.customerBatteries()
        if (res.batteries && res.batteries.length > 0) {
          const primaryId = res.primary_battery_id || res.batteries[0].battery_id
          const detail = await api.customerBattery(primaryId)
          if (detail.battery) {
            setBattery(detail.battery)
            setCity(detail.battery.city || user?.city || 'Hyderabad')
            setState(detail.battery.state || user?.state || 'Telangana')
            setPincode(user?.pincode || '')
          }
        }
      } catch (err: any) {
        console.error('Failed to load battery:', err)
        setError('Could not load your registered EV battery. Please check your battery registration.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!battery) {
      setError('No registered battery record found to report.')
      return
    }
    if (!city || !state) {
      setError('Please provide your city and state for collection logistics.')
      return
    }

    try {
      setSubmitting(true)
      setError(null)
      const res = await api.reportBatteryEol(battery.battery_id, {
        reporting_reason: reason,
        current_condition: condition,
        professionally_assessed: professionallyAssessed,
        assessment_notes: professionallyAssessed ? assessmentNotes : undefined,
        collection_city: city,
        collection_state: state,
        collection_pincode: pincode || undefined,
        sharing_consent: sharingConsent,
        supporting_details: supportingDetails || undefined,
      })
      setResult(res)
    } catch (err: any) {
      console.error('Submission failed:', err)
      setError(err?.message || 'Failed to submit end-of-life assessment request.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  if (result) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-2xl border border-emerald-200 bg-white p-8 shadow-sm">
          <div className="flex items-center gap-3 text-emerald-600">
            <CheckCircle2 className="h-8 w-8" />
            <h1 className="text-2xl font-bold tracking-tight text-ink-900">
              End-of-Life Assessment Report Submitted
            </h1>
          </div>

          <div className="mt-4 rounded-xl bg-emerald-50/80 p-4 border border-emerald-100">
            <p className="text-sm font-medium text-emerald-900">{result.message}</p>
            <p className="mt-1 text-xs text-emerald-700">
              Report Reference ID: <span className="font-mono font-semibold">{result.report_id}</span> • Battery ID: <span className="font-mono font-semibold">{result.battery_id}</span>
            </p>
          </div>

          {/* Structured Next Steps */}
          <div className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
              Authorized Circular Next Steps
            </h2>
            <div className="mt-3 space-y-3">
              {result.next_steps.map((step: string, idx: number) => (
                <div key={idx} className="flex items-start gap-3 rounded-lg border border-ink-100 bg-ink-50/50 p-3 text-sm text-ink-800">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500 font-semibold text-xs text-white">
                    {idx + 1}
                  </span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Safety Notice */}
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
              <div className="text-xs leading-relaxed text-amber-800">
                <span className="font-semibold text-amber-900">Safety & Testing Notice: </span>
                {result.disclaimer}
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button
              onClick={() => navigate('/customer/discarded-batteries')}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 transition"
            >
              <FileText className="h-4 w-4" />
              View My Discarded Batteries
            </button>
            <button
              onClick={() => navigate('/customer')}
              className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-5 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50 transition"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-600">
          <Truck className="h-4 w-4" />
          <span>EV Owner Circular Lifecycle</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900">
          Report a Battery for End-of-Life Assessment
        </h1>
        <p className="mt-1 text-sm text-ink-600">
          Connect your retired or degraded battery to certified diagnostic testing, second-life evaluation, or authorized hydrometallurgical recycling.
        </p>
      </div>

      {/* Mandatory Safety Warning Banner */}
      <div className="mb-6 rounded-2xl border-2 border-rose-300 bg-rose-50/90 p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-rose-100 p-2 text-rose-600">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-rose-900">
              Crucial Safety Warning — High Voltage Danger (300V – 800V DC)
            </h2>
            <p className="mt-1 text-sm font-medium leading-relaxed text-rose-800">
              Do NOT attempt to open, dismantle, or transport high-voltage EV batteries yourself. Unauthorized handling can cause severe electric shock, thermal runaway fire, or toxic chemical exposure.
            </p>
            <p className="mt-2 text-xs text-rose-700">
              All physical diagnostics and handling are executed exclusively by certified circular logistics and testing partners.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Step 1: Registered Battery Details */}
        <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink-900">
            <BatteryCharging className="h-5 w-5 text-brand-600" />
            1. Registered Battery Information
          </h2>
          <p className="mt-1 text-xs text-ink-500">
            Authoritative battery record registered under your EV owner account.
          </p>

          {battery ? (
            <div className="mt-4 grid grid-cols-2 gap-4 rounded-xl border border-ink-100 bg-ink-50/60 p-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-ink-500">Battery ID</p>
                <p className="font-mono text-sm font-bold text-ink-900">{battery.battery_id}</p>
              </div>
              <div>
                <p className="text-xs text-ink-500">Vehicle</p>
                <p className="text-sm font-semibold text-ink-900">{battery.vehicle_manufacturer} {battery.vehicle_model}</p>
                <p className="text-xs text-ink-500">{battery.purchase_year}</p>
              </div>
              <div>
                <p className="text-xs text-ink-500">Chemistry & Capacity</p>
                <p className="text-sm font-semibold text-ink-900">{battery.chemistry} • {battery.rated_capacity_kwh} kWh</p>
              </div>
              <div>
                <p className="text-xs text-ink-500">Last Estimated SOH</p>
                <p className="text-sm font-bold text-emerald-600">
                  {battery.soh_pct !== null ? `${battery.soh_pct}%` : 'Pending assessment'}
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
              No registered battery found. Please register your EV in your profile or dashboard first.
            </div>
          )}
        </div>

        {/* Step 2: Reason for Reporting */}
        <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink-900">
            <FileText className="h-5 w-5 text-brand-600" />
            2. Reason for Reporting End-of-Life Status
          </h2>
          <p className="mt-1 text-xs text-ink-500">
            Select the primary reason this battery is being retired or evaluated.
          </p>

          <div className="mt-4 space-y-2">
            {REPORTING_REASONS.map((r) => (
              <label
                key={r}
                className={`flex cursor-pointer items-center justify-between rounded-xl border p-3.5 transition ${
                  reason === r
                    ? 'border-brand-500 bg-brand-50/40 text-brand-900 font-medium'
                    : 'border-ink-200 bg-white hover:bg-ink-50 text-ink-800'
                }`}
              >
                <span className="text-sm">{r}</span>
                <input
                  type="radio"
                  name="reporting_reason"
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  className="h-4 w-4 text-brand-600"
                />
              </label>
            ))}
          </div>
        </div>

        {/* Step 3: Current Physical & Operational Condition */}
        <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink-900">
            <Wrench className="h-5 w-5 text-brand-600" />
            3. Current Condition
          </h2>
          <p className="mt-1 text-xs text-ink-500">
            Select the observed physical or operational state of the battery pack.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {CONDITIONS.map((c) => (
              <label
                key={c.value}
                className={`flex cursor-pointer flex-col rounded-xl border p-4 transition ${
                  condition === c.value
                    ? 'border-brand-500 bg-brand-50/40'
                    : 'border-ink-200 bg-white hover:bg-ink-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink-900">{c.label}</span>
                  <input
                    type="radio"
                    name="condition"
                    checked={condition === c.value}
                    onChange={() => setCondition(c.value)}
                    className="h-4 w-4 text-brand-600"
                  />
                </div>
                <p className="mt-1 text-xs text-ink-500">{c.desc}</p>
              </label>
            ))}
          </div>
        </div>

        {/* Step 4: Professional Assessment Check */}
        <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink-900">
            <Sparkles className="h-5 w-5 text-brand-600" />
            4. Professional Removal or Assessment
          </h2>
          <p className="mt-1 text-xs text-ink-500">
            Has this pack already been inspected by an authorized service technician or service station?
          </p>

          <div className="mt-4 space-y-3">
            <label className="flex items-center gap-3 text-sm text-ink-800">
              <input
                type="checkbox"
                checked={professionallyAssessed}
                onChange={(e) => setProfessionallyAssessed(e.target.checked)}
                className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
              />
              <span>Yes, this battery was professionally removed or evaluated by a technician.</span>
            </label>

            {professionallyAssessed && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-ink-700">
                  Diagnostic Notes or Technician Findings (Optional)
                </label>
                <textarea
                  value={assessmentNotes}
                  onChange={(e) => setAssessmentNotes(e.target.value)}
                  placeholder="e.g. Scanned with OBD tool: Cell delta voltage < 15mV; SOH estimated around 68%; no DTC fault codes."
                  rows={2}
                  className="mt-1 w-full rounded-xl border border-ink-200 p-3 text-sm focus:border-brand-500 focus:outline-none"
                />
              </div>
            )}
          </div>
        </div>

        {/* Step 5: Location Details */}
        <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink-900">
            <MapPin className="h-5 w-5 text-brand-600" />
            5. Approximate Location for Collection Logistics
          </h2>
          <p className="mt-1 text-xs text-ink-500">
            Consumers see only City and State. Street address and pincode are never exposed publicly.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-ink-700">City *</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Hyderabad"
                required
                className="mt-1 w-full rounded-xl border border-ink-200 p-2.5 text-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-700">State *</label>
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="e.g. Telangana"
                required
                className="mt-1 w-full rounded-xl border border-ink-200 p-2.5 text-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-700">Pincode (Internal logistics only)</label>
              <input
                type="text"
                value={pincode}
                onChange={(e) => setPincode(e.target.value)}
                placeholder="e.g. 500081"
                className="mt-1 w-full rounded-xl border border-ink-200 p-2.5 text-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-xs font-medium text-ink-700">Additional Supporting Details (Optional)</label>
            <textarea
              value={supportingDetails}
              onChange={(e) => setSupportingDetails(e.target.value)}
              placeholder="e.g. Replaced under warranty; battery currently stored in dry warehouse; includes original high-voltage disconnect plug."
              rows={2}
              className="mt-1 w-full rounded-xl border border-ink-200 p-3 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Step 6: Sharing Consent & Privacy Disclaimer */}
        <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-ink-900">
            6. Circular Discovery & Privacy Authorization
          </h2>

          <div className="mt-4 space-y-4">
            <label className="flex items-start gap-3 text-sm text-ink-800">
              <input
                type="checkbox"
                checked={sharingConsent}
                onChange={(e) => setSharingConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
              />
              <span>
                I agree to share this battery's technical condition and general region for recycling assessment and second-life evaluation.
              </span>
            </label>

            <div className="rounded-xl border border-ink-100 bg-ink-50/70 p-4 text-xs leading-relaxed text-ink-600">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 shrink-0 text-brand-600 mt-0.5" />
                <div>
                  <p className="font-semibold text-ink-800">Explicit Disclaimer & Privacy Protection:</p>
                  <p className="mt-1">
                    An assessment request or reported status does not guarantee that a battery is safe or functional. All second-life reuse requires qualified testing by certified professionals. Your full name, phone number, email, and vehicle registration are never disclosed to second-life consumers.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex items-center justify-end gap-4 pt-2">
          <Link
            to="/customer"
            className="rounded-xl border border-ink-200 bg-white px-5 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50 transition"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting || !battery}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 disabled:opacity-50 transition"
          >
            {submitting ? 'Submitting Assessment Request...' : 'Submit End-of-Life Report'}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  )
}
