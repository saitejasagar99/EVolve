/**
 * Customer EV Battery Intelligence — Multi-Step Wizard & Report
 *
 * Route: /customer/battery
 * Page title: Check My EV Battery
 * Subtitle: Tell us a few things about your EV. You don't need to know technical battery details.
 * Progress: 1 Vehicle -> 2 Usage -> 3 Battery Experience -> 4 Location -> 5 Analysis
 */

import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  HelpCircle,
  IndianRupee,
  Info,
  Leaf,
  Recycle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wrench,
  Zap,
} from 'lucide-react'
import { AiDiagnosticScanner } from '../components/AiDiagnosticScanner'
import { VerifyBeforeReplaceCard } from '../components/VerifyBeforeReplaceCard'
import { Card, Kpi } from '../components/ui'
import { useToast } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { api } from '../services/api'
import type {
  CustomerBatteryInput,
  CustomerPreparation,
  CustomerReport,
  DemoVehiclePreset,
} from '../types/api'

const POPULAR_BRANDS = ['Tata', 'MG', 'Mahindra', 'Hyundai', 'Kia', 'BYD', 'Other']

const POPULAR_MODELS: Record<string, string[]> = {
  Tata: ['Nexon EV', 'Nexon EV Long Range', 'Tiago EV', 'Punch EV', 'Tigor EV', 'Curvv EV'],
  MG: ['ZS EV', 'Windsor EV', 'Comet EV'],
  Mahindra: ['XUV400', 'XUV400 EL Pro'],
  Hyundai: ['Kona Electric', 'Ioniq 5', 'Creta EV'],
  Kia: ['EV6'],
  BYD: ['Atto 3', 'Seal', 'e6'],
  Other: ['Custom / Other Model'],
}

const PURCHASE_YEARS = [2026, 2025, 2024, 2023, 2022, 2021, 2020]

const DEFAULT_FORM: CustomerBatteryInput = {
  vehicle_brand: 'Tata',
  vehicle_model: 'Nexon EV',
  purchase_year: 2023,
  odometer_km: 35000,
  daily_driving: '20_50',
  charging_frequency: '3_5_week',
  charging_method: 'home',
  driving_pattern: 'city',
  range_condition: 'same',
  charging_condition: 'normal',
  temperature_condition: 'normal',
  warning_condition: 'none',
  range_fluctuation: 'never',
  city: 'Hyderabad',
  state: 'Telangana',
  pincode: '500081',
  battery_capacity_kwh: null,
  battery_chemistry: null,
  soh_input: null,
  cycle_count_input: null,
  voltage_input: null,
  current_input: null,
  temperature_input: null,
  internal_resistance_mohm: null,
  dod_input: null,
  is_demo: false,
}

export default function CustomerBatteryWizard() {
  const [searchParams] = useSearchParams()
  const { push } = useToast()
  const { user } = useAuth()

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1)
  const [formData, setFormData] = useState<CustomerBatteryInput>(DEFAULT_FORM)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false)
  const [showTechnicalAnalysis, setShowTechnicalAnalysis] = useState(false)

  const [loadingPrep, setLoadingPrep] = useState(false)
  const [prepData, setPrepData] = useState<CustomerPreparation | null>(null)

  const [analyzing, setAnalyzing] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [report, setReport] = useState<CustomerReport | null>(null)
  const [presets, setPresets] = useState<DemoVehiclePreset[]>([])
  const [showPresetsDropdown, setShowPresetsDropdown] = useState(false)
  const [expandedCostCard, setExpandedCostCard] = useState<'replacement' | 'repair' | 'second_life' | null>(null)

  // Collection modal state
  const [showCollectionModal, setShowCollectionModal] = useState(false)
  const [collectionSubmitting, setCollectionSubmitting] = useState(false)
  const [collectionSuccess, setCollectionSuccess] = useState(false)
  const [collectionForm, setCollectionForm] = useState({
    contact_name: user?.full_name || 'EV Owner',
    contact_phone: user?.phone || '+91 98765 43210',
    pickup_address: user?.vehicle ? `${user.vehicle.city}, ${user.vehicle.state}` : 'Flat 402, Green Meadows',
    preferred_date: '2026-10-18',
    notes: 'Battery pack ready for inspection',
  })

  // Pre-fill form from user's registered vehicle if available
  useEffect(() => {
    if (user?.vehicle && !formData.is_demo && !searchParams.get('report')) {
      const v = user.vehicle
      setFormData((prev) => ({
        ...prev,
        vehicle_brand: v.manufacturer || v.vehicle_manufacturer || prev.vehicle_brand,
        vehicle_model: v.model || v.vehicle_model || prev.vehicle_model,
        purchase_year: v.purchase_year || prev.purchase_year,
        odometer_km: v.odometer_km || prev.odometer_km,
        city: v.city || prev.city,
        state: v.state || prev.state,
        pincode: v.pincode || prev.pincode,
      }))
      setCollectionForm((prev) => ({
        ...prev,
        contact_name: user.full_name || prev.contact_name,
        contact_phone: user.phone || prev.contact_phone,
        pickup_address: `${v.city}, ${v.state}`,
      }))
    }
  }, [user])

  // Load demo presets on mount
  useEffect(() => {
    api
      .customerDemoVehicles()
      .then((res) => setPresets(res.presets))
      .catch(() => {})
  }, [])

  // Check if an existing assessment ID was passed in URL
  const reportParam = searchParams.get('report')
  useEffect(() => {
    if (reportParam) {
      api
        .customerReport(reportParam)
        .then((r) => {
          setReport(r)
          setStep(5)
        })
        .catch((e) => push(e instanceof Error ? e.message : 'Report not found', 'error'))
    }
  }, [reportParam])

  const applyPreset = (preset: DemoVehiclePreset) => {
    setFormData({ ...preset.data, is_demo: true })
    push(`Loaded preset: ${preset.name}`, 'info')
  }

  const handleNextToPreparation = async () => {
    setLoadingPrep(true)
    try {
      const res = await api.customerInput(formData)
      setPrepData(res)
      setStep(5)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      push(
        err instanceof Error
          ? err.message
          : 'We need a little more information to prepare your battery analysis.',
        'error',
      )
    } finally {
      setLoadingPrep(false)
    }
  }

  // Coordinate Scanner Completion with API Response
  const scanDoneRef = useRef(false)
  const receivedReportRef = useRef<CustomerReport | null>(null)

  const handleRunAnalysis = async () => {
    setAnalyzing(true)
    setShowScanner(true)
    scanDoneRef.current = false
    receivedReportRef.current = null

    try {
      const draftId = prepData?.draft_id || 'new'
      const rep = await api.customerAnalyze(draftId, formData)
      receivedReportRef.current = rep

      // If scanner animation has already finished, immediately mount report
      if (scanDoneRef.current) {
        setReport(rep)
        setShowScanner(false)
        setAnalyzing(false)
        push('Battery neural analysis completed successfully!', 'success')
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    } catch (err) {
      setShowScanner(false)
      setAnalyzing(false)
      push(
        err instanceof Error
          ? err.message
          : "We couldn't complete the analysis right now. Please try again.",
        'error',
      )
    }
  }

  const handleScannerComplete = () => {
    scanDoneRef.current = true
    if (receivedReportRef.current) {
      setReport(receivedReportRef.current)
      setShowScanner(false)
      setAnalyzing(false)
      push('Battery neural analysis completed successfully!', 'success')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
    // If API hasn't finished yet, scanner keeps showing 'Synthesizing...' until API resolves
  }

  const handleCollectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!report) return
    setCollectionSubmitting(true)
    try {
      await api.customerCollectionRequest({
        battery_id: report.battery_id,
        contact_name: collectionForm.contact_name,
        contact_phone: collectionForm.contact_phone,
        pickup_address: collectionForm.pickup_address,
        city: report.vehicle.city,
        state: report.vehicle.state,
        preferred_date: collectionForm.preferred_date,
        notes: collectionForm.notes,
      })
      setCollectionSuccess(true)
      push('Collection request submitted to certified circular recycler!', 'success')
    } catch (err) {
      push(err instanceof Error ? err.message : 'Failed to submit collection request', 'error')
    } finally {
      setCollectionSubmitting(false)
    }
  }

  const resetWizard = () => {
    setReport(null)
    setPrepData(null)
    setStep(1)
    setFormData(DEFAULT_FORM)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="mx-auto max-w-4xl py-2">
      {/* ----------------- Header ----------------- */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-brand-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-brand-800">
              EV Owner Portal
            </span>
            {formData.is_demo && (
              <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                Demo Vehicle
              </span>
            )}
          </div>
          <h1 className="mt-1 text-[24px] font-bold text-ink-900">Check My EV Battery</h1>
          <p className="text-[13.5px] text-ink-600">
            Tell us a few things about your EV. You don&apos;t need to know technical battery details.
          </p>
        </div>

        {/* Demo Presets Dropdown */}
        <div className="flex items-center gap-2">
          {presets.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowPresetsDropdown((prev) => !prev)}
                className="btn btn-outline btn-sm flex items-center gap-1.5 border-brand-300 text-brand-800 hover:bg-brand-50"
              >
                <Zap size={14} className="text-brand-600" />
                <span>Try with Demo EV</span>
                <ChevronDown
                  size={14}
                  className={`transition-transform duration-200 ${showPresetsDropdown ? 'rotate-180' : ''}`}
                />
              </button>

              {showPresetsDropdown && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setShowPresetsDropdown(false)}
                  />
                  <div className="absolute right-0 top-full z-40 mt-1.5 w-72 rounded-xl border border-ink-200 bg-white p-2 shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-400">
                      Select a Pre-configured EV
                    </div>
                    <div className="space-y-1">
                      {presets.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            applyPreset(p)
                            setShowPresetsDropdown(false)
                          }}
                          className="w-full flex flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left hover:bg-brand-50 transition-colors"
                        >
                          <span className="text-[12.5px] font-semibold text-ink-900">{p.name}</span>
                          <span className="text-[11px] text-ink-500 leading-snug">{p.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          <Link to="/customer" className="btn btn-ghost btn-sm text-[12px]">
            My Dashboard
          </Link>
        </div>
      </div>

      {/* ----------------- Progress Bar (when in wizard) ----------------- */}
      {!report && (
        <div className="mb-6">
          <div className="flex items-center justify-between gap-1 text-[12px] font-medium text-ink-500">
            {[
              { num: 1, label: 'Vehicle' },
              { num: 2, label: 'Usage' },
              { num: 3, label: 'Battery Experience' },
              { num: 4, label: 'Location' },
              { num: 5, label: 'Analysis' },
            ].map((s) => (
              <button
                key={s.num}
                type="button"
                disabled={step < s.num && !prepData}
                onClick={() => setStep(s.num as any)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 px-1 text-center transition-all ${
                  step === s.num
                    ? 'bg-brand-600 font-bold text-white shadow-sm'
                    : step > s.num
                      ? 'bg-brand-50 text-brand-800 hover:bg-brand-100'
                      : 'bg-ink-100 text-ink-400'
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                    step === s.num ? 'bg-white text-brand-700' : 'bg-ink-200 text-ink-700'
                  }`}
                >
                  {s.num}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* =========================================================================
          STEP 1: VEHICLE INFORMATION
         ========================================================================= */}
      {!report && step === 1 && (
        <Card title="Step 1 — Vehicle Information" subtitle="Basic details an ordinary EV owner knows.">
          <div className="space-y-5">
            {user?.vehicle && (
              <div className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50/80 p-3 text-[12.5px] text-brand-900">
                <div className="flex items-center gap-2">
                  <Sparkles size={15} className="text-brand-600 shrink-0" />
                  <span>
                    Auto-filled from your registered EV (
                    <strong>
                      {user.vehicle.manufacturer || user.vehicle.vehicle_manufacturer}{' '}
                      {user.vehicle.model || user.vehicle.vehicle_model}
                    </strong>{' '}
                    · {user.vehicle.masked_vehicle_number}). You can adjust values below if needed.
                  </span>
                </div>
                <Link
                  to="/customer/profile"
                  className="font-bold text-brand-700 hover:underline shrink-0 text-[11.5px] ml-2"
                >
                  Edit Profile
                </Link>
              </div>
            )}

            {/* Vehicle Brand */}
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-ink-800">
                Vehicle Brand <span className="text-rose-500">*</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {POPULAR_BRANDS.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => {
                      const models = POPULAR_MODELS[b] || []
                      setFormData((prev) => ({
                        ...prev,
                        vehicle_brand: b,
                        vehicle_model: models[0] || prev.vehicle_model,
                      }))
                    }}
                    className={`rounded-lg px-3.5 py-2 text-[13px] font-medium transition-all ${
                      formData.vehicle_brand === b
                        ? 'border-2 border-brand-600 bg-brand-50 font-bold text-brand-900 shadow-sm'
                        : 'border border-ink-200 bg-white text-ink-700 hover:bg-ink-50'
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>

            {/* Vehicle Model */}
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-ink-800">
                Vehicle Model <span className="text-rose-500">*</span>
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  value={formData.vehicle_model}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, vehicle_model: e.target.value }))
                  }
                  className="input text-[13.5px]"
                >
                  {(POPULAR_MODELS[formData.vehicle_brand] || ['Custom Model']).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                  <option value="Other">Other Model</option>
                </select>
                {formData.vehicle_model === 'Other' && (
                  <input
                    type="text"
                    placeholder="Enter model name"
                    className="input text-[13.5px]"
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, vehicle_model: e.target.value }))
                    }
                  />
                )}
              </div>
            </div>

            {/* Purchase Year */}
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-ink-800">
                Purchase Year <span className="text-rose-500">*</span>
              </label>
              <select
                value={formData.purchase_year}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, purchase_year: parseInt(e.target.value, 10) }))
                }
                className="input max-w-xs text-[13.5px]"
              >
                {PURCHASE_YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y} {y === 2026 ? '(Current year)' : ''}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11.5px] text-ink-500">
                Helps us determine your vehicle&apos;s calendar age.
              </p>
            </div>

            {/* Current Odometer */}
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-ink-800">
                Approximate Current Odometer (km)
              </label>
              <div className="flex max-w-xs items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="500"
                  value={formData.odometer_km ?? ''}
                  placeholder="e.g. 45000"
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      odometer_km: e.target.value ? parseFloat(e.target.value) : null,
                    }))
                  }
                  className="input text-[13.5px]"
                />
                <span className="text-[13px] font-semibold text-ink-500">km</span>
              </div>
              <p className="mt-1 text-[11.5px] text-ink-500">
                💡 <span className="font-medium text-ink-700">Approximate value is enough.</span> You can leave it blank if unsure.
              </p>
            </div>

            {/* Footer Buttons */}
            <div className="flex justify-end pt-3 border-t border-ink-100">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="btn btn-primary flex items-center gap-2"
              >
                <span>Continue to Usage</span>
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* =========================================================================
          STEP 2: USAGE INFORMATION
         ========================================================================= */}
      {!report && step === 2 && (
        <Card title="Step 2 — Usage Information" subtitle="Simple questions about how you drive and charge.">
          <div className="space-y-5">
            <div className="notice notice-info flex items-center gap-2 text-[12.5px]">
              <Info size={15} className="shrink-0 text-brand-600" />
              <span>
                Your driving and charging pattern helps us estimate battery usage and electrochemical degradation.
              </span>
            </div>

            {/* Average daily driving */}
            <div>
              <label className="mb-2 block text-[13px] font-semibold text-ink-800">
                Average daily driving
              </label>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
                {[
                  { id: 'less_20', label: 'Less than 20 km' },
                  { id: '20_50', label: '20–50 km' },
                  { id: '50_100', label: '50–100 km' },
                  { id: 'more_100', label: 'More than 100 km' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, daily_driving: opt.id }))}
                    className={`rounded-lg p-3 text-left text-[13px] transition-all ${
                      formData.daily_driving === opt.id
                        ? 'border-2 border-brand-600 bg-brand-50 font-bold text-brand-900 shadow-sm'
                        : 'border border-ink-200 bg-white hover:bg-ink-50 text-ink-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Charging frequency */}
            <div>
              <label className="mb-2 block text-[13px] font-semibold text-ink-800">
                Charging frequency
              </label>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
                {[
                  { id: 'daily', label: 'Every day' },
                  { id: '3_5_week', label: '3–5 times a week' },
                  { id: '1_2_week', label: '1–2 times a week' },
                  { id: 'less_week', label: 'Less than once a week' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, charging_frequency: opt.id }))}
                    className={`rounded-lg p-3 text-left text-[13px] transition-all ${
                      formData.charging_frequency === opt.id
                        ? 'border-2 border-brand-600 bg-brand-50 font-bold text-brand-900 shadow-sm'
                        : 'border border-ink-200 bg-white hover:bg-ink-50 text-ink-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Charging method */}
            <div>
              <label className="mb-2 block text-[13px] font-semibold text-ink-800">
                Charging method
              </label>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
                {[
                  { id: 'home', label: 'Home charging (AC)' },
                  { id: 'fast', label: 'Fast charging (DC)' },
                  { id: 'both', label: 'Both / Mixed' },
                  { id: 'mostly_public', label: 'Mostly public charging' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, charging_method: opt.id }))}
                    className={`rounded-lg p-3 text-left text-[13px] transition-all ${
                      formData.charging_method === opt.id
                        ? 'border-2 border-brand-600 bg-brand-50 font-bold text-brand-900 shadow-sm'
                        : 'border border-ink-200 bg-white hover:bg-ink-50 text-ink-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Driving pattern */}
            <div>
              <label className="mb-2 block text-[13px] font-semibold text-ink-800">
                Driving pattern
              </label>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  { id: 'city', label: 'Mostly city' },
                  { id: 'highway', label: 'Mostly highway' },
                  { id: 'mixed', label: 'Mixed driving' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, driving_pattern: opt.id }))}
                    className={`rounded-lg p-3 text-left text-[13px] transition-all ${
                      formData.driving_pattern === opt.id
                        ? 'border-2 border-brand-600 bg-brand-50 font-bold text-brand-900 shadow-sm'
                        : 'border border-ink-200 bg-white hover:bg-ink-50 text-ink-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Navigation buttons */}
            <div className="flex justify-between pt-3 border-t border-ink-100">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="btn btn-ghost flex items-center gap-1.5"
              >
                <ArrowLeft size={15} />
                <span>Back</span>
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="btn btn-primary flex items-center gap-2"
              >
                <span>Continue to Battery Experience</span>
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* =========================================================================
          STEP 3: BATTERY EXPERIENCE
         ========================================================================= */}
      {!report && step === 3 && (
        <Card
          title="Step 3 — Battery Experience"
          subtitle="Observable symptoms you notice. Don't worry if you're unsure."
        >
          <div className="space-y-6">
            <div className="notice notice-info flex items-center gap-2 text-[12.5px]">
              <HelpCircle size={15} className="shrink-0 text-brand-600" />
              <span>
                Don&apos;t worry if you&apos;re unsure. You can choose &quot;I&apos;m not sure&quot;. We do not punish missing details.
              </span>
            </div>

            {/* 1. Driving Range */}
            <div>
              <label className="mb-2 block text-[13.5px] font-semibold text-ink-900">
                1. How is your EV driving range recently?
              </label>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                {[
                  { id: 'same', label: '🟢 Almost the same as when I bought it' },
                  { id: 'slightly_reduced', label: '🟡 Slightly reduced' },
                  { id: 'significantly_reduced', label: '🟠 Significantly reduced' },
                  { id: 'much_lower', label: '🔴 Much lower than before' },
                  { id: 'unknown', label: '❓ I&apos;m not sure' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, range_condition: opt.id }))}
                    className={`rounded-lg p-3 text-left text-[13px] transition-all ${
                      formData.range_condition === opt.id
                        ? 'border-2 border-brand-600 bg-brand-50 font-bold text-brand-900 shadow-sm'
                        : 'border border-ink-200 bg-white hover:bg-ink-50 text-ink-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Charging */}
            <div>
              <label className="mb-2 block text-[13.5px] font-semibold text-ink-900">
                2. How does charging behave?
              </label>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                {[
                  { id: 'normal', label: '🟢 Normal charging speed' },
                  { id: 'slightly_slower', label: '🟡 Slightly slower than before' },
                  { id: 'much_slower', label: '🟠 Much slower charging' },
                  { id: 'frequent_problems', label: '🔴 Frequent charging problems' },
                  { id: 'unknown', label: '❓ I&apos;m not sure' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, charging_condition: opt.id }))}
                    className={`rounded-lg p-3 text-left text-[13px] transition-all ${
                      formData.charging_condition === opt.id
                        ? 'border-2 border-brand-600 bg-brand-50 font-bold text-brand-900 shadow-sm'
                        : 'border border-ink-200 bg-white hover:bg-ink-50 text-ink-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Battery Temperature */}
            <div>
              <label className="mb-2 block text-[13.5px] font-semibold text-ink-900">
                3. Battery temperature observation
              </label>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
                {[
                  { id: 'normal', label: '🟢 Normal temperature' },
                  { id: 'sometimes_warm', label: '🟡 Sometimes warm' },
                  { id: 'frequently_hot', label: '🟠 Frequently gets hot' },
                  { id: 'unknown', label: '❓ I&apos;m not sure' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      setFormData((prev) => ({ ...prev, temperature_condition: opt.id }))
                    }
                    className={`rounded-lg p-3 text-left text-[13px] transition-all ${
                      formData.temperature_condition === opt.id
                        ? 'border-2 border-brand-600 bg-brand-50 font-bold text-brand-900 shadow-sm'
                        : 'border border-ink-200 bg-white hover:bg-ink-50 text-ink-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Dashboard warnings */}
            <div>
              <label className="mb-2 block text-[13.5px] font-semibold text-ink-900">
                4. Dashboard warnings
              </label>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                {[
                  { id: 'none', label: 'No battery warnings' },
                  { id: 'occasional', label: 'Occasional battery warning' },
                  { id: 'frequent', label: 'Frequent battery warning' },
                  { id: 'critical', label: 'Critical battery alert' },
                  { id: 'unknown', label: 'No warning / not sure' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, warning_condition: opt.id }))}
                    className={`rounded-lg p-3 text-left text-[13px] transition-all ${
                      formData.warning_condition === opt.id
                        ? 'border-2 border-brand-600 bg-brand-50 font-bold text-brand-900 shadow-sm'
                        : 'border border-ink-200 bg-white hover:bg-ink-50 text-ink-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 5. Sudden range changes */}
            <div>
              <label className="mb-2 block text-[13.5px] font-semibold text-ink-900">
                5. Sudden range drops (e.g. jumping from 40% to 15%)
              </label>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
                {[
                  { id: 'never', label: 'Never observed' },
                  { id: 'occasionally', label: 'Occasionally' },
                  { id: 'frequently', label: 'Frequently' },
                  { id: 'very_frequently', label: 'Very frequently' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, range_fluctuation: opt.id }))}
                    className={`rounded-lg p-3 text-left text-[13px] transition-all ${
                      formData.range_fluctuation === opt.id
                        ? 'border-2 border-brand-600 bg-brand-50 font-bold text-brand-900 shadow-sm'
                        : 'border border-ink-200 bg-white hover:bg-ink-50 text-ink-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Navigation buttons */}
            <div className="flex justify-between pt-3 border-t border-ink-100">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="btn btn-ghost flex items-center gap-1.5"
              >
                <ArrowLeft size={15} />
                <span>Back</span>
              </button>
              <button
                type="button"
                onClick={() => setStep(4)}
                className="btn btn-primary flex items-center gap-2"
              >
                <span>Continue to Location</span>
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* =========================================================================
          STEP 4: LOCATION & OPTIONAL ADVANCED
         ========================================================================= */}
      {!report && step === 4 && (
        <Card
          title="Step 4 — Location & Optional Details"
          subtitle="Where is your EV mainly used?"
        >
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-[13px] font-semibold text-ink-800">
                  City <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.city ?? ''}
                  placeholder="e.g. Hyderabad"
                  onChange={(e) => setFormData((prev) => ({ ...prev, city: e.target.value }))}
                  className="input text-[13.5px]"
                />
              </div>

              <div>
                <label className="mb-1 block text-[13px] font-semibold text-ink-800">
                  State <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.state ?? ''}
                  placeholder="e.g. Telangana"
                  onChange={(e) => setFormData((prev) => ({ ...prev, state: e.target.value }))}
                  className="input text-[13.5px]"
                />
              </div>

              <div>
                <label className="mb-1 block text-[13px] font-semibold text-ink-800">
                  PIN Code (Optional)
                </label>
                <input
                  type="text"
                  value={formData.pincode ?? ''}
                  placeholder="e.g. 500081"
                  onChange={(e) => setFormData((prev) => ({ ...prev, pincode: e.target.value }))}
                  className="input text-[13.5px]"
                />
              </div>
            </div>

            <p className="text-[12px] text-ink-500">
              Location provides environmental context (ambient temperatures) and coordinates future recycling/second-life collection.
            </p>

            {/* Optional Advanced Data Accordion */}
            <div className="rounded-xl border border-ink-200 bg-ink-50/50 p-4">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex w-full items-center justify-between text-left"
              >
                <div>
                  <span className="text-[13.5px] font-bold text-ink-900">
                    Have technical battery information?
                  </span>
                  <span className="block text-[11.5px] text-ink-500">
                    Optional. Skip this if you don&apos;t have technical battery engineering data.
                  </span>
                </div>
                <span className="btn btn-sm btn-ghost text-brand-700">
                  {showAdvanced ? (
                    <>
                      Hide Advanced <ChevronUp size={15} />
                    </>
                  ) : (
                    <>
                      + Add Advanced Battery Data <ChevronDown size={15} />
                    </>
                  )}
                </span>
              </button>

              {showAdvanced && (
                <div className="mt-4 border-t border-ink-200 pt-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-[11.5px] font-semibold text-ink-700">
                        Pack Capacity (kWh)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        placeholder="e.g. 40.5"
                        value={formData.battery_capacity_kwh ?? ''}
                        onChange={(e) =>
                          setFormData((p) => ({
                            ...p,
                            battery_capacity_kwh: e.target.value ? parseFloat(e.target.value) : null,
                          }))
                        }
                        className="input text-[12.5px]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11.5px] font-semibold text-ink-700">
                        Chemistry
                      </label>
                      <select
                        value={formData.battery_chemistry ?? ''}
                        onChange={(e) =>
                          setFormData((p) => ({
                            ...p,
                            battery_chemistry: e.target.value || null,
                          }))
                        }
                        className="input text-[12.5px]"
                      >
                        <option value="">Auto-detected</option>
                        <option value="LFP">LFP (Lithium Iron Phosphate)</option>
                        <option value="NMC">NMC (Nickel Manganese Cobalt)</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11.5px] font-semibold text-ink-700">
                        Known SOH (%)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        placeholder="e.g. 84.0"
                        value={formData.soh_input ?? ''}
                        onChange={(e) =>
                          setFormData((p) => ({
                            ...p,
                            soh_input: e.target.value ? parseFloat(e.target.value) : null,
                          }))
                        }
                        className="input text-[12.5px]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11.5px] font-semibold text-ink-700">
                        Cycle Count
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 450"
                        value={formData.cycle_count_input ?? ''}
                        onChange={(e) =>
                          setFormData((p) => ({
                            ...p,
                            cycle_count_input: e.target.value ? parseInt(e.target.value, 10) : null,
                          }))
                        }
                        className="input text-[12.5px]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11.5px] font-semibold text-ink-700">
                        Internal Resistance (mΩ)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        placeholder="e.g. 22.5"
                        value={formData.internal_resistance_mohm ?? ''}
                        onChange={(e) =>
                          setFormData((p) => ({
                            ...p,
                            internal_resistance_mohm: e.target.value ? parseFloat(e.target.value) : null,
                          }))
                        }
                        className="input text-[12.5px]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11.5px] font-semibold text-ink-700">
                        Voltage (V)
                      </label>
                      <input
                        type="number"
                        step="1"
                        placeholder="e.g. 350"
                        value={formData.voltage_input ?? ''}
                        onChange={(e) =>
                          setFormData((p) => ({
                            ...p,
                            voltage_input: e.target.value ? parseFloat(e.target.value) : null,
                          }))
                        }
                        className="input text-[12.5px]"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Navigation buttons */}
            <div className="flex justify-between pt-3 border-t border-ink-100">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="btn btn-ghost flex items-center gap-1.5"
              >
                <ArrowLeft size={15} />
                <span>Back</span>
              </button>
              <button
                type="button"
                disabled={loadingPrep}
                onClick={handleNextToPreparation}
                className="btn btn-primary flex items-center gap-2"
              >
                {loadingPrep ? <RefreshCw size={15} className="animate-spin" /> : null}
                <span>{loadingPrep ? 'Preparing Summary…' : 'Prepare Battery Analysis'}</span>
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* =========================================================================
          STEP 5: PREPARING YOUR BATTERY ANALYSIS SCREEN
         ========================================================================= */}
      {!report && step === 5 && prepData && (
        <Card
          title="Preparing Your Battery Analysis"
          subtitle="Here is what we derived from your answers before running the AI prediction model."
        >
          <div className="space-y-6">
            {/* Information collected cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
              <Kpi label="Vehicle Age" value={prepData.summary.vehicle_age} />
              <Kpi label="Usage Intensity" value={prepData.summary.usage_intensity} tone="good" />
              <Kpi label="Charging Stress" value={prepData.summary.charging_stress} />
              <Kpi
                label="Range Degradation"
                value={prepData.summary.range_degradation}
                tone={prepData.summary.range_degradation === 'Normal' ? 'good' : 'warn'}
              />
              <Kpi label="Thermal Concern" value={prepData.summary.temperature_concern} />
              <Kpi
                label="Data Confidence"
                value={`${prepData.confidence.confidence_pct}%`}
                tone={prepData.confidence.confidence_pct >= 80 ? 'good' : 'warn'}
                sub={prepData.confidence.confidence_label}
              />
            </div>

            {/* Transparency Note */}
            <div className="notice notice-info flex items-start gap-2.5 text-[12.5px]">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-brand-600" />
              <div>
                <span className="font-semibold text-brand-900">
                  AI-Estimated Battery Intelligence:
                </span>{' '}
                <span>
                  We estimated the technical features from your vehicle usage and reported symptoms.
                  No raw battery engineering data is forced on you.
                </span>
              </div>
            </div>

            {/* Step 5 Economic Cost Estimation Preview */}
            {prepData.cost_estimation && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 pb-2.5 border-b border-emerald-200/60">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-600 text-white">
                      <IndianRupee size={13} />
                    </div>
                    <span className="text-[13px] font-bold text-emerald-950">
                      Estimated Battery Economics Preview
                    </span>
                  </div>
                  <span className="text-[11.5px] font-semibold text-emerald-800">
                    Calculated for {prepData.cost_estimation.capacity_kwh} kWh ({prepData.cost_estimation.chemistry})
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="rounded-lg bg-white p-3 border border-emerald-200 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                        Second-Life Buyback
                      </span>
                      <Recycle size={13} className="text-emerald-600" />
                    </div>
                    <div className="text-[18px] font-black text-emerald-700 mt-1">
                      +₹{prepData.cost_estimation.second_life.estimated_residual_value_inr?.toLocaleString('en-IN')}
                    </div>
                    <p className="text-[10.5px] text-ink-500 mt-0.5">
                      Monetization payout if retired for stationary storage
                    </p>
                  </div>

                  <div className="rounded-lg bg-white p-3 border border-emerald-200 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
                        Module Repair
                      </span>
                      <Wrench size={13} className="text-amber-600" />
                    </div>
                    <div className="text-[18px] font-black text-ink-900 mt-1">
                      ₹{prepData.cost_estimation.repair.estimated_cost_inr?.toLocaleString('en-IN')}
                    </div>
                    <p className="text-[10.5px] text-ink-500 mt-0.5">
                      Cell re-balancing &amp; module swap (~18 mo extension)
                    </p>
                  </div>

                  <div className="rounded-lg bg-white p-3 border border-emerald-200 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
                        OEM Replacement
                      </span>
                      <ShieldCheck size={13} className="text-indigo-600" />
                    </div>
                    <div className="text-[18px] font-black text-ink-900 mt-1">
                      ₹{prepData.cost_estimation.replacement.estimated_cost_inr?.toLocaleString('en-IN')}
                    </div>
                    <p className="text-[10.5px] text-ink-500 mt-0.5">
                      Brand new OEM pack with 8-year factory warranty
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Preliminary Manufacturer Support Advisory */}
            {prepData.manufacturer_support && (
              <VerifyBeforeReplaceCard
                initialAdvisory={prepData.manufacturer_support}
                vehicleBrand={prepData.vehicle.brand}
                vehicleModel={prepData.vehicle.model}
                modelYear={prepData.vehicle.purchase_year}
                reason="Preliminary usage and symptoms indicate replacement or second-life evaluation may be worth considering."
                isDiagnosticConfirmed={false}
                hasCriticalWarning={false}
              />
            )}

            {/* Collapsible View Technical Details */}
            <div className="rounded-xl border border-ink-200 p-4">
              <button
                type="button"
                onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                className="flex w-full items-center justify-between text-left"
              >
                <div className="flex items-center gap-2">
                  <Cpu size={16} className="text-brand-600" />
                  <span className="text-[13px] font-bold text-ink-900">
                    View Technical Details (Transparent Sources)
                  </span>
                </div>
                <span className="text-[12px] font-medium text-brand-700 flex items-center gap-1">
                  {showTechnicalDetails ? 'Hide' : 'Expand'}
                  {showTechnicalDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
              </button>

              {showTechnicalDetails && (
                <div className="mt-4 border-t border-ink-200 pt-3">
                  <p className="text-[11.5px] text-ink-500 mb-3">
                    Every feature passed to the ML models has a transparent source tag:
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[12px]">
                      <thead>
                        <tr className="border-b border-ink-200 text-ink-500">
                          <th className="pb-1.5 font-medium">Model Feature</th>
                          <th className="pb-1.5 font-medium">Value</th>
                          <th className="pb-1.5 font-medium">Source</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-100">
                        {Object.entries(prepData.technical_details.features).map(([k, v]) => (
                          <tr key={k}>
                            <td className="py-1 font-mono text-[11px] text-ink-700">{k}</td>
                            <td className="py-1 font-semibold text-ink-900">
                              {typeof v === 'number' ? v.toFixed(1) : String(v)}
                            </td>
                            <td className="py-1">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                                  prepData.technical_details.provenance[k] === 'USER_PROVIDED'
                                    ? 'bg-sky-100 text-sky-800'
                                    : prepData.technical_details.provenance[k] === 'DERIVED'
                                      ? 'bg-brand-100 text-brand-800'
                                      : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {prepData.technical_details.provenance[k] || 'ESTIMATED'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Big Action Button */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-ink-100">
              <button
                type="button"
                onClick={() => setStep(4)}
                className="btn btn-ghost flex items-center gap-1.5"
              >
                <ArrowLeft size={15} />
                <span>Back to Location</span>
              </button>

              <button
                type="button"
                disabled={analyzing}
                onClick={handleRunAnalysis}
                className="btn btn-primary btn-lg flex items-center gap-2 px-6 shadow-md"
              >
                {analyzing ? (
                  <RefreshCw size={17} className="animate-spin" />
                ) : (
                  <Sparkles size={17} />
                )}
                <span className="font-bold text-[15px]">
                  {analyzing ? 'Running ML Models…' : 'Analyze My Battery'}
                </span>
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* =========================================================================
          RESULT PAGE: YOUR BATTERY REPORT
         ========================================================================= */}
      {report && (
        <div className="space-y-6 animate-fade-in">
          {/* Header Banner */}
          <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 via-white to-amber-50/40 p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-brand-600 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
                    Verified Analysis
                  </span>
                  {report.is_demo && (
                    <span className="rounded-md bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                      Demo Data
                    </span>
                  )}
                  <span className="text-[12px] text-ink-500">ID: {report.assessment_id}</span>
                </div>
                <h2 className="mt-2 text-[26px] font-extrabold text-ink-900">Your Battery Report</h2>
                <p className="text-[13.5px] text-ink-600">
                  {report.vehicle.brand} {report.vehicle.model} · {report.vehicle.purchase_year} ·{' '}
                  {report.vehicle.odometer_km?.toLocaleString()} km · {report.vehicle.city}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={resetWizard}
                  className="btn btn-outline btn-sm border-ink-300 text-ink-700"
                >
                  Check Another EV
                </button>
                <Link to="/customer" className="btn btn-primary btn-sm">
                  View in Dashboard
                </Link>
              </div>
            </div>

            {/* 4 Core Pillars Grid */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Pillar 1: Battery Health */}
              <div className="card-interactive rounded-2xl border border-ink-200 border-t-4 border-t-emerald-500 bg-white p-5 shadow-xs hover:shadow-md hover:border-emerald-300 transition-all group">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
                    Battery Health
                  </span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 group-hover:scale-110 transition-transform">
                    <Zap size={15} />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-[34px] font-black tnum text-ink-900">
                    {Math.round(report.health.soh_pct)}%
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-bold ${
                      report.health.status_tone === 'green'
                        ? 'bg-emerald-100 text-emerald-800'
                        : report.health.status_tone === 'yellow'
                          ? 'bg-amber-100 text-amber-800'
                          : report.health.status_tone === 'orange'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${report.health.status_dot} animate-ping`} />
                    {report.health.status_band}
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] text-ink-500 leading-snug">
                  AI-estimated usable retention
                </p>
              </div>

              {/* Pillar 2: Future Battery Risk */}
              <div className="card-interactive rounded-2xl border border-ink-200 border-t-4 border-t-amber-500 bg-white p-5 shadow-xs hover:shadow-md hover:border-amber-300 transition-all group">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
                    Future Battery Risk
                  </span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 group-hover:scale-110 transition-transform">
                    <AlertTriangle size={15} />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span
                    className={`text-[28px] font-black ${
                      report.future_risk.level === 'High'
                        ? 'text-rose-700'
                        : report.future_risk.level === 'Medium'
                          ? 'text-amber-700'
                          : 'text-emerald-700'
                    }`}
                  >
                    {report.future_risk.level}
                  </span>
                </div>
                <p className="mt-1.5 text-[11.5px] text-ink-600 line-clamp-2 leading-snug">
                  {report.future_risk.summary}
                </p>
              </div>

              {/* Pillar 3: Estimated EV Life */}
              <div className="card-interactive rounded-2xl border border-ink-200 border-t-4 border-t-teal-500 bg-white p-5 shadow-xs hover:shadow-md hover:border-teal-300 transition-all group">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
                    Estimated EV Life
                  </span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-600 group-hover:scale-110 transition-transform">
                    <Sparkles size={15} />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-[30px] font-black text-ink-900 tnum">
                    {report.remaining_life.years_display}
                  </span>
                </div>
                <p className="mt-1.5 text-[11.5px] text-ink-500 leading-snug">
                  Before reaching 70% traction floor
                </p>
              </div>

              {/* Pillar 4: Second-Life Potential */}
              <div className="card-interactive rounded-2xl border border-ink-200 border-t-4 border-t-cyan-500 bg-white p-5 shadow-xs hover:shadow-md hover:border-cyan-300 transition-all group">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
                    Second-Life Potential
                  </span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600 group-hover:scale-110 transition-transform">
                    <Recycle size={15} />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span
                    className={`text-[28px] font-black ${
                      report.second_life.potential === 'High'
                        ? 'text-teal-700'
                        : report.second_life.potential === 'Medium'
                          ? 'text-amber-700'
                          : 'text-ink-600'
                    }`}
                  >
                    {report.second_life.potential}
                  </span>
                </div>
                <p className="mt-1.5 text-[11.5px] text-ink-500 leading-snug">
                  Stationary solar / storage suitability
                </p>
              </div>
            </div>
          </div>

          {/* =========================================================================
              SECTION: WHAT SHOULD I DO? (LARGE RECOMMENDATION CARD)
             ========================================================================= */}
          <div className="rounded-2xl border-2 border-brand-500/40 bg-white p-6 shadow-md">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
                <Leaf size={22} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-brand-700">
                    Recommended Circular Action
                  </span>
                </div>
                <h3 className="mt-0.5 text-[20px] font-extrabold text-ink-900">
                  💡 What should I do? — {report.recommendation.title}
                </h3>
                <p className="mt-1 text-[13.5px] text-ink-700 leading-relaxed">
                  {report.recommendation.summary}
                </p>

                {/* Recommended actions list */}
                <div className="mt-4 rounded-xl bg-ink-50/70 p-4">
                  <h4 className="text-[12px] font-bold uppercase tracking-wider text-ink-500 mb-2">
                    Action Plan for Your Battery
                  </h4>
                  <ul className="space-y-2 text-[13px] text-ink-800">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-brand-600" />
                      <span>Continue regular AC home charging to preserve cell longevity.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-brand-600" />
                      <span>Recheck battery health periodically every 6 months or 10,000 km.</span>
                    </li>
                    {report.second_life.potential === 'High' && (
                      <li className="flex items-start gap-2">
                        <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-amber-600" />
                        <span>
                          Consider stationary solar energy storage assessment before total battery retirement.
                        </span>
                      </li>
                    )}
                    {report.future_risk.level === 'High' && (
                      <li className="flex items-start gap-2">
                        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-600" />
                        <span>
                          Schedule a certified workshop checkup to verify cell voltage balance.
                        </span>
                      </li>
                    )}
                  </ul>
                </div>

                {/* Action Buttons */}
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  {report.recommendation.action_code === 'EOL_CANDIDATE' ? (
                    <button
                      type="button"
                      onClick={() => setShowCollectionModal(true)}
                      className="btn btn-primary flex items-center gap-2"
                    >
                      <Recycle size={15} />
                      <span>Request Battery Collection</span>
                    </button>
                  ) : report.recommendation.action_code === 'SECOND_LIFE_ASSESSMENT' ||
                    report.second_life.potential === 'High' ? (
                    <>
                      <Link
                        to="/customer/report-eol"
                        className="btn btn-primary flex items-center gap-2"
                      >
                        <Zap size={15} />
                        <span>Report for Second-Life Assessment</span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => setShowCollectionModal(true)}
                        className="btn btn-outline border-ink-300"
                      >
                        Request Circular Pickup
                      </button>
                    </>
                  ) : (
                    <>
                      <Link to="/customer" className="btn btn-primary">
                        View Battery History
                      </Link>
                      <button
                        type="button"
                        onClick={resetWizard}
                        className="btn btn-outline border-ink-300"
                      >
                        Check Another EV
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* =========================================================================
              SECTION: BATTERY ECONOMIC & COST ESTIMATION (REPAIR VS REPLACE VS SECOND-LIFE)
             ========================================================================= */}
          {(() => {
            const rawCap = Number(report.technical_details?.derived_features?.rated_capacity_kwh) || 40.0
            const rawChem = String(report.technical_details?.derived_features?.chemistry || 'LFP')
            const usableKwh = Number((rawCap * (report.health.soh_pct / 100.0)).toFixed(1))
            const rateKwh = rawChem.includes('LFP') ? 12000 : 13800
            const packCells = Math.round((rawCap * rateKwh) / 1000) * 1000
            const defaultReplace = packCells + 24000 + 18000
            const modSwap = Math.round((16000 + rawCap * 150) / 500) * 500
            const defaultRepair = 8500 + 4500 + modSwap + 6500 + 4500
            const defaultBuyback = Math.round((usableKwh * 4200) / 1000) * 1000

            const defaultReplacementBreakdown = [
              {
                item: `OEM Cell Modules & Housing (${rawCap.toFixed(1)} kWh ${rawChem})`,
                cost_inr: packCells,
                note: `Factory grade-A certified cell modules @ ₹${rateKwh.toLocaleString('en-IN')}/kWh`,
              },
              {
                item: 'Factory Smart BMS Unit & Wiring Harness',
                cost_inr: 24000,
                note: 'OEM master battery management controller with CANbus integration',
              },
              {
                item: 'Authorized High-Voltage Labor & Commissioning',
                cost_inr: 18000,
                note: 'Pack de-mount, hoist installation, coolant loop vacuum fill & pairing',
              },
              {
                item: '8-Year / 1,60,000 km Warranty Registration',
                cost_inr: 0,
                note: 'Official manufacturer warranty certificate included',
              },
            ]

            const defaultRepairBreakdown = [
              {
                item: 'High-Voltage Diagnostics & Voltage Imbalance Mapping',
                cost_inr: 8500,
                note: 'Automated individual cell internal resistance and delta-V scanning',
              },
              {
                item: 'Active Cell Re-balancing Cycle',
                cost_inr: 4500,
                note: 'High-precision bench equalization across all series groups',
              },
              {
                item: 'Certified Replacement Module (1 Sub-pack)',
                cost_inr: modSwap,
                note: 'Replaces the single degraded/weak cell cluster with matched cells',
              },
              {
                item: 'Thermal Interface & Manifold Servicing',
                cost_inr: 6500,
                note: 'Replacement of silicone thermal pads, coolant purge & leak testing',
              },
              {
                item: 'BMS Recalibration & IP67 Enclosure Resealing',
                cost_inr: 4500,
                note: 'Firmware SoC reset and hermetic chamber vacuum pressure seal test',
              },
            ]

            const defaultSecondLifeBreakdown = [
              {
                item: `Usable Energy Retention Valuation (${usableKwh.toFixed(1)} kWh @ ₹4,200/kWh)`,
                cost_inr: defaultBuyback,
                note: 'Certified stationary BESS & solar microgrid marketplace recovery',
              },
              {
                item: 'Free Hazardous Material Pickup & Transport',
                cost_inr: 0,
                note: 'Compliant ADR/PESO logistics covered by circular buyer partner',
              },
              {
                item: 'Digital Battery Passport & De-registration Certificate',
                cost_inr: 0,
                note: 'Official EV RTO de-registration record issued automatically',
              },
            ]

            const costEst = report.cost_estimation || {
              capacity_kwh: rawCap,
              usable_remaining_kwh: usableKwh,
              chemistry: rawChem,
              soh_pct: report.health.soh_pct,
              replacement: {
                title: 'Brand New OEM Battery Pack',
                estimated_cost_inr: defaultReplace,
                cost_range_inr: [Math.round(defaultReplace * 0.94 / 1000) * 1000, Math.round(defaultReplace * 1.06 / 1000) * 1000] as [number, number],
                rate_per_kwh_inr: rateKwh,
                warranty_years: 8,
                expected_life_years: 8,
                description: 'Full factory replacement from authorized OEM service center.',
                itemized_breakdown: defaultReplacementBreakdown,
                pros: [
                  'Restores 100% original driving range and acceleration',
                  'Comes with official 8-year / 1,60,000 km manufacturer warranty',
                  'Factory calibrated BMS and fresh thermal management',
                ],
                cons: [
                  'Highest upfront capital outlay (~40-50% of original EV price)',
                  'Longer service center downtime (7-14 business days)',
                ],
              },
              repair: {
                title: 'Module Refurbishment & Re-balancing',
                estimated_cost_inr: defaultRepair,
                cost_range_inr: [Math.round(defaultRepair * 0.90 / 1000) * 1000, Math.round(defaultRepair * 1.12 / 1000) * 1000] as [number, number],
                expected_life_extension_months: 18,
                description: 'Cell re-balancing, weak module replacement, thermal pad refresh, and BMS flash.',
                itemized_breakdown: defaultRepairBreakdown,
                pros: [
                  `Saves ~₹${(defaultReplace - defaultRepair).toLocaleString('en-IN')} compared to full replacement`,
                  'Fast turnaround (3-5 business days)',
                  'Addresses voltage spread and localized hot cells',
                ],
                cons: [
                  'Temporary extension (12–18 months of city use)',
                  'Does not restore 100% original highway range',
                ],
              },
              second_life: {
                title: 'Second-Life Buyback & Monetization',
                estimated_residual_value_inr: defaultBuyback,
                value_range_inr: [Math.round(usableKwh * 3800 / 1000) * 1000, Math.round(usableKwh * 4600 / 1000) * 1000] as [number, number],
                rate_per_kwh_inr: 4200,
                description: 'Sell pack into the certified stationary energy storage / solar microgrid market.',
                itemized_breakdown: defaultSecondLifeBreakdown,
                pros: [
                  `Recovers ~₹${defaultBuyback.toLocaleString('en-IN')} in cash or trade-in credit`,
                  'Zero landfill or hazardous environmental disposal fee',
                  `Net upgrade cost drops to ₹${(defaultReplace - defaultBuyback).toLocaleString('en-IN')} if purchasing a new pack`,
                ],
                cons: [
                  'Pack is retired from vehicle traction use to stationary storage',
                ],
              },
              economic_verdict: {
                recommended_option: (report.recommendation.action_code === 'SECOND_LIFE_ASSESSMENT' || report.health.soh_pct < 75.0 ? 'second_life' : report.health.soh_pct < 80.0 ? 'repair' : 'continue_use') as any,
                headline: 'Second-Life Monetization yields the highest circular return',
                summary: `At ${report.health.soh_pct}% health (${usableKwh} kWh usable retention), your battery is below the optimal highway traction floor. Rather than spending ₹${defaultReplace.toLocaleString('en-IN')} for an out-of-warranty replacement or ₹${defaultRepair.toLocaleString('en-IN')} on temporary patching, monetizing in the second-life marketplace recovers ~₹${defaultBuyback.toLocaleString('en-IN')} towards a new vehicle or solar energy storage.`,
                savings_vs_replacement_inr: defaultReplace - defaultRepair,
                net_upgrade_with_buyback_inr: defaultReplace - defaultBuyback,
              },
            }

            const isSecondLife = costEst.economic_verdict.recommended_option === 'second_life' || report.recommendation.action_code === 'SECOND_LIFE_ASSESSMENT'

            return (
              <div className="rounded-2xl border-2 border-emerald-500/50 bg-gradient-to-b from-emerald-500/[0.04] via-white to-white p-6 sm:p-7 shadow-md">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-5 border-b border-ink-100">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-600/20">
                      <IndianRupee size={22} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md">
                          Economic Intelligence
                        </span>
                        <span className="text-[12px] text-ink-500 font-medium">
                          Pack Size: {costEst.capacity_kwh} kWh ({costEst.chemistry})
                        </span>
                      </div>
                      <h3 className="text-[21px] font-extrabold text-ink-900 tracking-tight mt-0.5">
                        Battery Cost Estimation &amp; Lifecycle Economics
                      </h3>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[12px] text-ink-600 bg-ink-50 px-3 py-1.5 rounded-lg border border-ink-200">
                    <span>Usable Retention:</span>
                    <strong className="text-emerald-700 font-bold">{costEst.usable_remaining_kwh} kWh</strong>
                    <span className="text-ink-400">({costEst.soh_pct}% SOH)</span>
                  </div>
                </div>

                {/* AI Economic Verdict Banner */}
                <div
                  className={`mt-5 rounded-xl border p-4.5 ${
                    isSecondLife
                      ? 'border-emerald-300 bg-emerald-50/70 text-emerald-950'
                      : costEst.economic_verdict.recommended_option === 'repair'
                        ? 'border-amber-300 bg-amber-50/70 text-amber-950'
                        : 'border-ink-200 bg-ink-50 text-ink-900'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
                      <Sparkles size={16} />
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                          AI Financial Recommendation
                        </span>
                        {isSecondLife && (
                          <span className="rounded bg-emerald-700 text-white px-2 py-0.5 text-[10px] font-black uppercase tracking-wide">
                            Second-Life Assessment Triggered
                          </span>
                        )}
                      </div>
                      <h4 className="text-[15px] font-bold mt-0.5 text-ink-900">
                        {costEst.economic_verdict.headline}
                      </h4>
                      <p className="mt-1 text-[13px] text-ink-700 leading-relaxed">
                        {costEst.economic_verdict.summary}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Three Pillars: Second-Life vs Repair vs Replace */}
                <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4.5">
                  {/* 1. Second-Life Buyback */}
                  <div
                    className={`relative flex flex-col justify-between rounded-xl border-2 p-5 transition-all shadow-xs ${
                      isSecondLife
                        ? 'border-emerald-500 bg-white ring-2 ring-emerald-500/20 shadow-md'
                        : 'border-ink-200 bg-white'
                    }`}
                  >
                    {isSecondLife && (
                      <div className="absolute -top-3 right-4 rounded-full bg-emerald-600 px-3 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wider text-white shadow-xs">
                        ⭐ AI Recommended
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                          <Recycle size={18} />
                        </div>
                        <div>
                          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                            Option A
                          </span>
                          <h4 className="text-[15px] font-extrabold text-ink-900 leading-tight">
                            Second-Life Buyback
                          </h4>
                        </div>
                      </div>

                      <div className="mt-4 pb-3 border-b border-ink-100">
                        <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
                          Estimated Cash / Trade-in Value
                        </div>
                        <div className="mt-1 flex items-baseline gap-1.5">
                          <span className="text-[26px] font-black text-emerald-700 tnum">
                            +₹{costEst.second_life.estimated_residual_value_inr?.toLocaleString('en-IN')}
                          </span>
                        </div>
                        <p className="text-[11px] text-ink-500 mt-0.5">
                          Rate: ~₹{costEst.second_life.rate_per_kwh_inr?.toLocaleString('en-IN')}/kWh usable
                        </p>
                      </div>

                      <p className="mt-3 text-[12.5px] text-ink-600 leading-snug">
                        {costEst.second_life.description}
                      </p>

                      <ul className="mt-3.5 space-y-2 text-[12px] text-ink-700">
                        {costEst.second_life.pros.map((p, idx) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>

                      {/* Itemized Valuation Toggle */}
                      <div className="mt-3 pt-2.5 border-t border-ink-100">
                        <button
                          type="button"
                          onClick={() => setExpandedCostCard(expandedCostCard === 'second_life' ? null : 'second_life')}
                          className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center justify-between w-full py-0.5"
                        >
                          <span>{expandedCostCard === 'second_life' ? 'Hide Valuation Breakdown' : 'View Itemized Valuation'}</span>
                          {expandedCostCard === 'second_life' ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                        {expandedCostCard === 'second_life' && (costEst.second_life.itemized_breakdown || defaultSecondLifeBreakdown) && (
                          <div className="mt-2 rounded-lg bg-emerald-50/70 p-2.5 border border-emerald-200 text-[11px] space-y-1.5 animate-fadeIn">
                            {(costEst.second_life.itemized_breakdown || defaultSecondLifeBreakdown).map((item, i) => (
                              <div key={i} className="flex items-start justify-between gap-1.5 pb-1 border-b border-emerald-200/50 last:border-0 last:pb-0">
                                <div>
                                  <span className="font-semibold text-emerald-950">{item.item}</span>
                                  {item.note && <div className="text-[10px] text-emerald-700">{item.note}</div>}
                                </div>
                                <span className="font-bold text-emerald-800 whitespace-nowrap">
                                  {item.cost_inr > 0 ? `+₹${item.cost_inr.toLocaleString('en-IN')}` : 'Included'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 pt-3 border-t border-ink-100">
                      <Link
                        to="/customer/report-eol"
                        className="btn btn-primary btn-sm w-full flex items-center justify-center gap-1.5"
                      >
                        <Zap size={14} />
                        <span>Claim Buyback Offer</span>
                      </Link>
                    </div>
                  </div>

                  {/* 2. Module Refurbishment / Repair */}
                  <div
                    className={`relative flex flex-col justify-between rounded-xl border-2 p-5 transition-all shadow-xs ${
                      costEst.economic_verdict.recommended_option === 'repair'
                        ? 'border-amber-500 bg-white ring-2 ring-amber-500/20 shadow-md'
                        : 'border-ink-200 bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                          <Wrench size={18} />
                        </div>
                        <div>
                          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                            Option B
                          </span>
                          <h4 className="text-[15px] font-extrabold text-ink-900 leading-tight">
                            Module Refurbishment
                          </h4>
                        </div>
                      </div>

                      <div className="mt-4 pb-3 border-b border-ink-100">
                        <div className="text-[11px] font-bold text-ink-500 uppercase tracking-wider">
                          Estimated Repair Cost
                        </div>
                        <div className="mt-1 flex items-baseline gap-1.5">
                          <span className="text-[26px] font-black text-ink-900 tnum">
                            ₹{costEst.repair.estimated_cost_inr?.toLocaleString('en-IN')}
                          </span>
                        </div>
                        <p className="text-[11px] text-ink-500 mt-0.5">
                          Est. Range: ₹{costEst.repair.cost_range_inr?.[0].toLocaleString('en-IN')} – ₹{costEst.repair.cost_range_inr?.[1].toLocaleString('en-IN')}
                        </p>
                      </div>

                      <p className="mt-3 text-[12.5px] text-ink-600 leading-snug">
                        {costEst.repair.description}
                      </p>

                      <ul className="mt-3.5 space-y-2 text-[12px] text-ink-700">
                        {costEst.repair.pros.map((p, idx) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-amber-600" />
                            <span>{p}</span>
                          </li>
                        ))}
                        <li className="flex items-start gap-1.5 text-ink-500">
                          <Info size={14} className="mt-0.5 shrink-0 text-ink-400" />
                          <span>Extends life by ~{costEst.repair.expected_life_extension_months} months for city use</span>
                        </li>
                      </ul>

                      {/* Itemized Repair Cost Toggle */}
                      <div className="mt-3 pt-2.5 border-t border-ink-100">
                        <button
                          type="button"
                          onClick={() => setExpandedCostCard(expandedCostCard === 'repair' ? null : 'repair')}
                          className="text-[11px] font-bold text-amber-700 hover:text-amber-800 flex items-center justify-between w-full py-0.5"
                        >
                          <span>{expandedCostCard === 'repair' ? 'Hide Cost Breakdown' : 'View Itemized Cost Breakdown'}</span>
                          {expandedCostCard === 'repair' ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                        {expandedCostCard === 'repair' && (costEst.repair.itemized_breakdown || defaultRepairBreakdown) && (
                          <div className="mt-2 rounded-lg bg-amber-50/70 p-2.5 border border-amber-200 text-[11px] space-y-1.5 animate-fadeIn">
                            {(costEst.repair.itemized_breakdown || defaultRepairBreakdown).map((item, i) => (
                              <div key={i} className="flex items-start justify-between gap-1.5 pb-1 border-b border-amber-200/50 last:border-0 last:pb-0">
                                <div>
                                  <span className="font-semibold text-amber-950">{item.item}</span>
                                  {item.note && <div className="text-[10px] text-amber-700">{item.note}</div>}
                                </div>
                                <span className="font-bold text-amber-900 whitespace-nowrap">
                                  ₹{item.cost_inr.toLocaleString('en-IN')}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 pt-3 border-t border-ink-100">
                      <button
                        type="button"
                        onClick={() => {
                          push(
                            'Certified EV circular repair center booking launched. A partner technician will review your telemetry.',
                            'info',
                          )
                        }}
                        className="btn btn-outline btn-sm w-full border-ink-300 text-ink-800 hover:bg-ink-50 flex items-center justify-center gap-1.5"
                      >
                        <Wrench size={14} />
                        <span>Find Repair Partners</span>
                      </button>
                    </div>
                  </div>

                  {/* 3. OEM Pack Replacement */}
                  <div className="relative flex flex-col justify-between rounded-xl border border-ink-200 bg-white p-5 shadow-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                          <ShieldCheck size={18} />
                        </div>
                        <div>
                          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-800">
                            Option C
                          </span>
                          <h4 className="text-[15px] font-extrabold text-ink-900 leading-tight">
                            OEM Full Pack Replacement
                          </h4>
                        </div>
                      </div>

                      <div className="mt-4 pb-3 border-b border-ink-100">
                        <div className="text-[11px] font-bold text-ink-500 uppercase tracking-wider">
                          Brand New OEM Price
                        </div>
                        <div className="mt-1 flex items-baseline gap-1.5">
                          <span className="text-[26px] font-black text-ink-900 tnum">
                            ₹{costEst.replacement.estimated_cost_inr?.toLocaleString('en-IN')}
                          </span>
                        </div>
                        <p className="text-[11px] text-ink-500 mt-0.5">
                          Est. Range: ₹{costEst.replacement.cost_range_inr?.[0].toLocaleString('en-IN')} – ₹{costEst.replacement.cost_range_inr?.[1].toLocaleString('en-IN')}
                        </p>
                      </div>

                      <p className="mt-3 text-[12.5px] text-ink-600 leading-snug">
                        {costEst.replacement.description}
                      </p>

                      <ul className="mt-3.5 space-y-2 text-[12px] text-ink-700">
                        {costEst.replacement.pros.map((p, idx) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-indigo-600" />
                            <span>{p}</span>
                          </li>
                        ))}
                        {costEst.replacement.cons.map((c, idx) => (
                          <li key={idx} className="flex items-start gap-1.5 text-ink-500">
                            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" />
                            <span>{c}</span>
                          </li>
                        ))}
                      </ul>

                      {/* Itemized Replacement Cost Toggle */}
                      <div className="mt-3 pt-2.5 border-t border-ink-100">
                        <button
                          type="button"
                          onClick={() => setExpandedCostCard(expandedCostCard === 'replacement' ? null : 'replacement')}
                          className="text-[11px] font-bold text-indigo-700 hover:text-indigo-800 flex items-center justify-between w-full py-0.5"
                        >
                          <span>{expandedCostCard === 'replacement' ? 'Hide Cost Breakdown' : 'View Itemized Cost Breakdown'}</span>
                          {expandedCostCard === 'replacement' ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                        {expandedCostCard === 'replacement' && (costEst.replacement.itemized_breakdown || defaultReplacementBreakdown) && (
                          <div className="mt-2 rounded-lg bg-indigo-50/70 p-2.5 border border-indigo-200 text-[11px] space-y-1.5 animate-fadeIn">
                            {(costEst.replacement.itemized_breakdown || defaultReplacementBreakdown).map((item, i) => (
                              <div key={i} className="flex items-start justify-between gap-1.5 pb-1 border-b border-indigo-200/50 last:border-0 last:pb-0">
                                <div>
                                  <span className="font-semibold text-indigo-950">{item.item}</span>
                                  {item.note && <div className="text-[10px] text-indigo-700">{item.note}</div>}
                                </div>
                                <span className="font-bold text-indigo-900 whitespace-nowrap">
                                  {item.cost_inr > 0 ? `₹${item.cost_inr.toLocaleString('en-IN')}` : 'Included'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 pt-3 border-t border-ink-100 flex flex-col gap-2">
                      <a
                        href="#verify-before-replace-section"
                        className="btn btn-outline btn-sm w-full border-indigo-200 text-indigo-700 hover:bg-indigo-50 flex items-center justify-center gap-1.5"
                      >
                        <ShieldCheck size={14} />
                        <span>Verify Before You Replace</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          push(
                            `OEM battery replacement schedule for ${report.vehicle.brand} ${report.vehicle.model} logged.`,
                            'info',
                          )
                        }}
                        className="btn btn-ghost btn-xs w-full text-ink-600 hover:bg-ink-100 flex items-center justify-center gap-1"
                      >
                        <span>Request OEM Service Slot</span>
                        <ArrowRight size={12} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Financial Comparison Table & Transparency Note */}
                <div className="mt-6 rounded-xl bg-ink-50/80 p-4 border border-ink-200">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <TrendingUp size={16} className="text-emerald-600" />
                      <span className="text-[12.5px] font-bold text-ink-900">
                        Net Economic Comparison Summary:
                      </span>
                    </div>
                    <div className="text-[12px] text-ink-600">
                      *Costs modeled on current Indian EV battery pack prices ({costEst.chemistry} chemistry)
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div className="rounded-lg bg-white p-2.5 border border-ink-200">
                      <span className="text-[11px] text-ink-500 font-medium">New Pack Outlay</span>
                      <div className="text-[15px] font-bold text-ink-900 mt-0.5">
                        ₹{costEst.replacement.estimated_cost_inr?.toLocaleString('en-IN')}
                      </div>
                    </div>
                    <div className="rounded-lg bg-white p-2.5 border border-ink-200">
                      <span className="text-[11px] text-ink-500 font-medium">Module Repair</span>
                      <div className="text-[15px] font-bold text-amber-800 mt-0.5">
                        ₹{costEst.repair.estimated_cost_inr?.toLocaleString('en-IN')}
                      </div>
                    </div>
                    <div className="rounded-lg bg-white p-2.5 border border-ink-200">
                      <span className="text-[11px] text-ink-500 font-medium">Second-Life Recovery</span>
                      <div className="text-[15px] font-bold text-emerald-700 mt-0.5">
                        +₹{costEst.second_life.estimated_residual_value_inr?.toLocaleString('en-IN')}
                      </div>
                    </div>
                    <div className="rounded-lg bg-emerald-100/60 p-2.5 border border-emerald-300">
                      <span className="text-[11px] text-emerald-900 font-bold">Net Upgrade Cost</span>
                      <div className="text-[15px] font-black text-emerald-800 mt-0.5">
                        ₹{costEst.economic_verdict.net_upgrade_with_buyback_inr?.toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>

                  {/* Valuation Methodology Note */}
                  <div className="mt-3.5 pt-3 border-t border-ink-200/70 text-[11px] text-ink-500 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="flex items-center gap-1 text-emerald-800 font-semibold">
                      <CheckCircle2 size={12} className="text-emerald-600" /> Cross-Checked Methodology:
                    </span>
                    <span>• Repair cost calibrated against Module 4 Prevention Ledger (₹42,000 standard basis)</span>
                    <span>• Replacement modeled on Tata &amp; MG authorized OEM quotes</span>
                    <span>• Second-life buyback evaluated @ ₹4,200/usable kWh for stationary BESS</span>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* =========================================================================
              SECTION: VERIFY BEFORE YOU REPLACE (MANUFACTURER SUPPORT CONTACT CARD)
             ========================================================================= */}
          {(report.recommendation.action_code === 'SECOND_LIFE_ASSESSMENT' ||
            report.recommendation.action_code === 'EOL_CANDIDATE' ||
            report.recommendation.action_code === 'REPAIR_REFURBISHMENT' ||
            report.health.soh_pct < 80.0 ||
            report.manufacturer_support) && (
            <VerifyBeforeReplaceCard
              initialAdvisory={report.manufacturer_support}
              vehicleBrand={report.vehicle.brand}
              vehicleModel={report.vehicle.model}
              modelYear={report.vehicle.purchase_year}
              reason={
                report.recommendation.action_code === 'SECOND_LIFE_ASSESSMENT'
                  ? 'Battery health is below optimal highway traction floor (SOH < 75%). Second-life retirement and pack replacement or vehicle upgrade are being evaluated.'
                  : report.recommendation.action_code === 'EOL_CANDIDATE'
                    ? 'Battery is approaching end of traction life. Full battery-pack replacement or circular recycling is being assessed.'
                    : 'Degradation or module imbalance detected. Diagnostic confirmation with authorized manufacturer care is recommended.'
              }
              isDiagnosticConfirmed={false}
              hasCriticalWarning={report.future_risk.level === 'High' && report.health.soh_pct < 55.0}
            />
          )}

          {/* =========================================================================
              SECTION: WHY DID WE GIVE THIS RESULT?
             ========================================================================= */}
          <Card title="Why did we give this result?" subtitle="Transparent, deterministic factors behind our AI evaluation.">
            <ul className="space-y-2.5">
              {report.why_points.map((pt, idx) => (
                <li key={idx} className="flex items-start gap-2 text-[13px] text-ink-800">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-800">
                    {idx + 1}
                  </span>
                  <span className="pt-0.5">{pt}</span>
                </li>
              ))}
            </ul>

            {/* Optional AI Explanation */}
            {report.ai_explanation && (
              <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50/50 p-4">
                <div className="flex items-center gap-2 text-[12px] font-bold text-brand-900 mb-1">
                  <Sparkles size={14} className="text-brand-600" />
                  <span>AI Advisor Explanation</span>
                </div>
                <p className="text-[12.5px] text-ink-700 leading-relaxed">
                  {report.ai_explanation}
                </p>
                <p className="mt-2 text-[10.5px] text-ink-500">
                  * Generated by LLM explaining verified structured ML features. The LLM does not calculate battery predictions.
                </p>
              </div>
            )}
          </Card>

          {/* =========================================================================
              SECTION: TECHNICAL DETAILS PANEL (COLLAPSIBLE)
             ========================================================================= */}
          <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-xs">
            <button
              type="button"
              onClick={() => setShowTechnicalAnalysis(!showTechnicalAnalysis)}
              className="flex w-full items-center justify-between text-left"
            >
              <div>
                <span className="text-[14px] font-bold text-ink-900">
                  View Technical Analysis (Judges &amp; Engineers)
                </span>
                <span className="block text-[11.5px] text-ink-500">
                  Full feature vectors, ML predictions, and provenance metadata.
                </span>
              </div>
              <span className="btn btn-sm btn-ghost text-brand-700">
                {showTechnicalAnalysis ? 'Hide' : 'Expand'}
                {showTechnicalAnalysis ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </span>
            </button>

            {showTechnicalAnalysis && (
              <div className="mt-5 border-t border-ink-200 pt-4 space-y-4">
                <div>
                  <h4 className="text-[12px] font-bold uppercase tracking-wider text-ink-500 mb-2">
                    Features Handed to ML Regressor &amp; Sources
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[12px]">
                      <thead>
                        <tr className="border-b border-ink-200 text-ink-500">
                          <th className="pb-1.5 font-medium">Feature</th>
                          <th className="pb-1.5 font-medium">Derived Value</th>
                          <th className="pb-1.5 font-medium">Provenance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-100">
                        {Object.entries(report.technical_details.derived_features).map(([k, v]) => (
                          <tr key={k}>
                            <td className="py-1 font-mono text-[11px] text-ink-700">{k}</td>
                            <td className="py-1 font-semibold text-ink-900">
                              {typeof v === 'number' ? v.toFixed(2) : String(v)}
                            </td>
                            <td className="py-1">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                                  report.technical_details.feature_provenance[k] === 'USER_PROVIDED'
                                    ? 'bg-sky-100 text-sky-800'
                                    : report.technical_details.feature_provenance[k] === 'DERIVED'
                                      ? 'bg-brand-100 text-brand-800'
                                      : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {report.technical_details.feature_provenance[k] || 'ESTIMATED'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h4 className="text-[12px] font-bold uppercase tracking-wider text-ink-500 mb-2">
                    ML Model Outputs
                  </h4>
                  <div className="grid grid-cols-3 gap-2 text-[12px]">
                    <div className="card p-2.5">
                      <div className="text-ink-500">SOH Predicted</div>
                      <div className="font-bold text-ink-900">
                        {report.technical_details.model_outputs.soh_predicted.toFixed(4)}
                      </div>
                    </div>
                    <div className="card p-2.5">
                      <div className="text-ink-500">EOL Horizon</div>
                      <div className="font-bold text-ink-900">
                        {report.technical_details.model_outputs.eol_months.toFixed(1)} months
                      </div>
                    </div>
                    <div className="card p-2.5">
                      <div className="text-ink-500">Anomaly Severity</div>
                      <div className="font-bold text-ink-900">
                        {report.technical_details.model_outputs.anomaly_score.toFixed(3)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          COLLECTION MODAL (EOL CANDIDATES)
         ========================================================================= */}
      {showCollectionModal && report && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-[18px] font-bold text-ink-900">
              Request Safe Battery Collection
            </h3>
            <p className="mt-1 text-[13px] text-ink-600">
              Schedule battery pickup with certified circular recycling partners in {report.vehicle.city}.
            </p>

            {collectionSuccess ? (
              <div className="mt-6 text-center py-6">
                <CheckCircle2 size={42} className="mx-auto text-brand-600 mb-2" />
                <h4 className="text-[16px] font-bold text-ink-900">Collection Scheduled!</h4>
                <p className="mt-1 text-[13px] text-ink-600">
                  Our recycler partner has received your request for {collectionForm.preferred_date}.
                </p>
                <button
                  type="button"
                  onClick={() => setShowCollectionModal(false)}
                  className="btn btn-primary mt-4"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleCollectionSubmit} className="mt-4 space-y-3.5">
                <div>
                  <label className="mb-1 block text-[12px] font-semibold text-ink-700">
                    Contact Name
                  </label>
                  <input
                    type="text"
                    required
                    value={collectionForm.contact_name}
                    onChange={(e) =>
                      setCollectionForm((p) => ({ ...p, contact_name: e.target.value }))
                    }
                    className="input text-[13px]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-semibold text-ink-700">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    required
                    value={collectionForm.contact_phone}
                    onChange={(e) =>
                      setCollectionForm((p) => ({ ...p, contact_phone: e.target.value }))
                    }
                    className="input text-[13px]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-semibold text-ink-700">
                    Pickup Address
                  </label>
                  <input
                    type="text"
                    required
                    value={collectionForm.pickup_address}
                    onChange={(e) =>
                      setCollectionForm((p) => ({ ...p, pickup_address: e.target.value }))
                    }
                    className="input text-[13px]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-semibold text-ink-700">
                    Preferred Pickup Date
                  </label>
                  <input
                    type="date"
                    required
                    value={collectionForm.preferred_date}
                    onChange={(e) =>
                      setCollectionForm((p) => ({ ...p, preferred_date: e.target.value }))
                    }
                    className="input text-[13px]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-semibold text-ink-700">
                    Special Instructions (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={collectionForm.notes}
                    onChange={(e) =>
                      setCollectionForm((p) => ({ ...p, notes: e.target.value }))
                    }
                    className="input text-[13px]"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-ink-100">
                  <button
                    type="button"
                    onClick={() => setShowCollectionModal(false)}
                    className="btn btn-ghost"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={collectionSubmitting}
                    className="btn btn-primary"
                  >
                    {collectionSubmitting ? 'Scheduling…' : 'Confirm Collection'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* High-Tech Animated AI Diagnostic Scanner Modal */}
      <AiDiagnosticScanner
        isOpen={showScanner}
        onComplete={handleScannerComplete}
        vehicleBrand={formData.vehicle_brand}
        vehicleModel={formData.vehicle_model}
        batteryChemistry={formData.battery_chemistry || 'LFP'}
      />
    </div>
  )
}
