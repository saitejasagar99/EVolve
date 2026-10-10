/**
 * EVolve AI — EV Owner (Customer) Dashboard
 *
 * Route: /customer or /customer/dashboard
 *
 * Key Connected Sections:
 *   1. "My Battery" — Authoritative canonical battery record, SOH, chemistry, capacity,
 *      second-life suitability, recycling recommendation, and live sharing status.
 *   2. "Battery Lifecycle & Sharing" — Plain-language privacy controls, instant sharing consent
 *      toggle (approve/revoke), and direct actions (Request Assessment, Request Collection).
 *   3. "My Battery Journey" — Authentic 6-step lifecycle stepper
 *      (Submitted -> Assessed -> Reuse / Recycling -> Collection -> Processing -> Recovery)
 *      with verified chronological audit events.
 */

import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  BatteryCharging,
  CheckCircle2,
  Clock,
  ExternalLink,
  Info,
  Layers,
  Lock,
  PlusCircle,
  Recycle,
  RefreshCw,
  Share2,
  ShieldCheck,
  Truck,
  Wrench,
  Zap,
} from 'lucide-react'
import { Card, Spinner } from '../components/ui'
import { AnimatedBatteryGauge } from '../components/AnimatedBatteryGauge'
import { VerifyBeforeReplaceCard } from '../components/VerifyBeforeReplaceCard'
import { useToast } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { api } from '../services/api'
import type {
  CustomerAssessmentSummary,
  CustomerBatteryRecord,
  LifecycleTimelineEvent,
} from '../types/api'

export default function CustomerDashboard() {
  const location = useLocation()
  const { push } = useToast()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  // Battery records
  const [batteries, setBatteries] = useState<CustomerBatteryRecord[]>([])
  const [selectedBattery, setSelectedBattery] = useState<CustomerBatteryRecord | null>(null)
  const [timeline, setTimeline] = useState<LifecycleTimelineEvent[]>([])
  const [assessments, setAssessments] = useState<CustomerAssessmentSummary[]>([])

  // Modal dialog states
  const [showAssessmentModal, setShowAssessmentModal] = useState(false)
  const [showCollectionModal, setShowCollectionModal] = useState(false)
  const [modalNotes, setModalNotes] = useState('')

  useEffect(() => {
    loadAllData()
  }, [])

  useEffect(() => {
    if (!loading) {
      if (location.pathname.includes('lifecycle')) {
        const el = document.getElementById('lifecycle-section')
        if (el) el.scrollIntoView({ behavior: 'smooth' })
      } else if (location.pathname.includes('collection-status')) {
        const el = document.getElementById('collection-section')
        if (el) el.scrollIntoView({ behavior: 'smooth' })
      }
    }
  }, [location.pathname, loading])

  const loadAllData = async () => {
    setLoading(true)
    try {
      // 1. Fetch customer's canonical battery records from shared database
      const [batRes, assessRes] = await Promise.all([
        api.customerBatteries().catch(() => ({ count: 0, primary_battery_id: null, batteries: [] })),
        api.customerAssessments().catch(() => ({ count: 0, assessments: [] })),
      ])

      setBatteries(batRes.batteries)
      setAssessments(assessRes.assessments)

      if (batRes.batteries.length > 0) {
        const primaryId = batRes.primary_battery_id || batRes.batteries[0].battery_id
        await loadBatteryDetail(primaryId, batRes.batteries)
      } else {
        setSelectedBattery(null)
        setTimeline([])
      }
    } catch (e) {
      push(e instanceof Error ? e.message : 'Failed to load battery information', 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadBatteryDetail = async (batteryId: string, currentList?: CustomerBatteryRecord[]) => {
    try {
      const res = await api.customerBattery(batteryId)
      setSelectedBattery(res.battery)
      setTimeline(res.timeline || [])

      // Update in batteries list if present
      const list = currentList || batteries
      setBatteries(list.map((b) => (b.battery_id === batteryId ? res.battery : b)))
    } catch {
      // Fallback to local item if detail fails
      const found = (currentList || batteries).find((b) => b.battery_id === batteryId)
      if (found) setSelectedBattery(found)
    }
  }

  // Toggle Sharing Consent
  const handleToggleConsent = async () => {
    if (!selectedBattery) return
    const nextConsent = !selectedBattery.sharing_consent
    setActionLoading(true)
    try {
      const res = await api.customerSharingConsent(selectedBattery.battery_id, nextConsent)
      push(res.message, 'success')
      await loadBatteryDetail(selectedBattery.battery_id)
    } catch (e) {
      push(e instanceof Error ? e.message : 'Failed to update sharing consent', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // Request Assessment
  const handleRequestAssessment = async () => {
    if (!selectedBattery) return
    setActionLoading(true)
    try {
      const res = await api.customerRequestAssessment(selectedBattery.battery_id, modalNotes)
      push(res.message, 'success')
      setShowAssessmentModal(false)
      setModalNotes('')
      await loadBatteryDetail(selectedBattery.battery_id)
    } catch (e) {
      push(e instanceof Error ? e.message : 'Failed to submit assessment request', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // Request Collection
  const handleRequestCollection = async () => {
    if (!selectedBattery) return
    setActionLoading(true)
    try {
      const res = await api.customerRequestCollection(selectedBattery.battery_id, modalNotes)
      push(res.message, 'success')
      setShowCollectionModal(false)
      setModalNotes('')
      await loadBatteryDetail(selectedBattery.battery_id)
    } catch (e) {
      push(e instanceof Error ? e.message : 'Failed to submit collection request', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) return <Spinner label="Loading EV Battery Records..." />

  const bat = selectedBattery
  const matchedAssessment = assessments.find((a) => a.battery_id === bat?.battery_id) || assessments[0]
  const isAssessed = Boolean(
    bat &&
    (bat.is_assessed ?? (bat.soh_pct !== null && matchedAssessment !== undefined))
  )

  // Sharing Status Badge Helper
  const getSharingBadge = (status: string, consent: boolean) => {
    if (!consent || status === 'PRIVATE') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">
          <Lock size={12} className="text-slate-500" />
          <span>Private Record</span>
        </span>
      )
    }
    if (status === 'PENDING_ASSESSMENT') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-sky-300 bg-sky-100 px-2.5 py-0.5 text-[11px] font-bold text-sky-800">
          <RefreshCw size={12} className="text-sky-600 animate-spin" />
          <span>Pending Diagnostic Assessment</span>
        </span>
      )
    }
    if (status === 'APPROVED_FOR_SECOND_LIFE') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
          <Zap size={12} className="text-emerald-600" />
          <span>Approved for Second-Life</span>
        </span>
      )
    }
    if (status === 'APPROVED_FOR_RECYCLING') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-800">
          <ShieldCheck size={12} className="text-rose-600" />
          <span>Approved for Recycling</span>
        </span>
      )
    }
    if (status === 'COLLECTION_REQUESTED') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
          <Truck size={12} className="text-amber-600" />
          <span>Collection Scheduled</span>
        </span>
      )
    }
    if (status === 'COLLECTED') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-purple-300 bg-purple-100 px-2.5 py-0.5 text-[11px] font-bold text-purple-800">
          <Truck size={12} className="text-purple-600" />
          <span>Battery In-Transit</span>
        </span>
      )
    }
    if (status === 'PROCESSING') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-indigo-300 bg-indigo-100 px-2.5 py-0.5 text-[11px] font-bold text-indigo-800">
          <Wrench size={12} className="text-indigo-600" />
          <span>Dismantling &amp; Recovery</span>
        </span>
      )
    }
    if (status === 'RECOVERY_COMPLETED') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-teal-300 bg-teal-100 px-2.5 py-0.5 text-[11px] font-bold text-teal-800">
          <CheckCircle2 size={12} className="text-teal-600" />
          <span>Recovery Completed</span>
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-ink-100 px-2.5 py-0.5 text-[11px] font-bold text-ink-700">
        <span>{status}</span>
      </span>
    )
  }

  // Calculate Stepper State from real lifecycle status
  const getStepperIndex = (status: string, assessed: boolean) => {
    if (!assessed) return 1 // Registered, awaiting assessment check
    switch (status) {
      case 'PRIVATE':
      case 'PENDING_ASSESSMENT':
      case 'APPROVED_FOR_SECOND_LIFE':
      case 'APPROVED_FOR_RECYCLING':
        return 2 // Evaluated
      case 'COLLECTION_REQUESTED':
      case 'COLLECTED':
        return 3 // Collection
      case 'PROCESSING':
        return 4 // Processing
      case 'RECOVERY_COMPLETED':
        return 5 // Recovery
      default:
        return 2
    }
  }

  const currentStep = bat ? getStepperIndex(bat.sharing_status, isAssessed) : 0

  const STEPS = [
    {
      num: 1,
      name: 'Submitted',
      desc: 'Vehicle & battery specs registered in EVolve AI',
    },
    {
      num: 2,
      name: 'Assessed',
      desc: 'SOH & degradation evaluated by diagnostic models',
    },
    {
      num: 3,
      name: 'Evaluation',
      desc: 'Determined suitable for second-life or recycling',
    },
    {
      num: 4,
      name: 'Collection',
      desc: 'Pickup & transport by registered logistics provider',
    },
    {
      num: 5,
      name: 'Processing',
      desc: 'Safe disassembly & hydrometallurgical extraction',
    },
    {
      num: 6,
      name: 'Recovery',
      desc: 'Critical minerals returned to closed-loop supply',
    },
  ]

  return (
    <div className="mx-auto max-w-5xl py-2 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-brand-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-brand-800">
              EV Owner Dashboard
            </span>
            {user?.vehicle && (
              <span className="rounded-md bg-ink-100 px-2 py-0.5 text-[11px] font-bold text-ink-700">
                🚗 {user.vehicle.manufacturer || user.vehicle.vehicle_manufacturer}{' '}
                {user.vehicle.model || user.vehicle.vehicle_model} (
                {user.vehicle.masked_vehicle_number})
              </span>
            )}
          </div>
          <h1 className="mt-1 text-[24px] font-bold text-ink-900">
            {user ? `Welcome, ${user.full_name}` : 'My EV Battery Health'}
          </h1>
          <p className="text-[13px] text-ink-600">
            Authoritative battery health monitoring, circular lifecycle management, and privacy-controlled sharing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link to="/customer/discarded-batteries" className="btn btn-outline btn-sm flex items-center gap-1.5 text-ink-700">
            <Layers size={13} className="text-brand-600" />
            <span>My Discarded Batteries</span>
          </Link>
          <Link to="/customer/report-eol" className="btn btn-outline btn-sm flex items-center gap-1.5 text-rose-700 border-rose-200 hover:bg-rose-50">
            <Recycle size={13} className="text-rose-600" />
            <span>Report EOL Battery</span>
          </Link>
          <Link to="/customer/battery" className="btn btn-primary btn-sm flex items-center gap-1.5">
            <PlusCircle size={14} />
            <span>Check Battery Health</span>
          </Link>
        </div>
      </div>

      {/* Fleet Owner Dedicated Entry Point Card */}
      <div className="rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-50 via-emerald-50/50 to-white p-5 sm:p-6 shadow-2xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="rounded-xl bg-brand-600 text-white p-2.5 shadow-2xs shrink-0 mt-0.5">
            <Truck size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-ink-900">Fleet Owner?</h2>
              <span className="rounded-full bg-brand-200 text-brand-800 text-[10px] font-bold px-2 py-0.5 uppercase tracking-wide">
                Multi-EV
              </span>
            </div>
            <p className="text-xs sm:text-sm text-ink-600 mt-1 max-w-2xl leading-relaxed">
              Manage multiple EVs, analyse battery health across your fleet, identify vehicles requiring attention, and plan maintenance using your own vehicle data.
            </p>
          </div>
        </div>
        <Link
          to="/fleet/welcome"
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs sm:text-sm px-5 py-2.5 shadow-2xs transition shrink-0 whitespace-nowrap"
        >
          <span>Explore Fleet Intelligence</span>
          <ArrowRight size={14} />
        </Link>
      </div>

      {/* When no battery records exist yet */}
      {!bat && (
        <Card>
          <div className="text-center py-12">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 mb-3">
              <BatteryCharging size={28} />
            </div>
            <h3 className="text-[17px] font-bold text-ink-900">No EV Battery Health Records Yet</h3>
            <p className="mt-1 max-w-md mx-auto text-[13px] text-ink-600">
              Complete your first guided EV battery check. Enter your vehicle details once to receive
              authoritative SOH analytics and manage your battery lifecycle.
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <Link to="/customer/battery" className="btn btn-primary">
                Check My Battery Now
              </Link>
            </div>
          </div>
        </Card>
      )}

      {/* Main Connected Dashboard */}
      {bat && (
        <>
          {/* Multi-vehicle tab selector if user has more than 1 battery */}
          {batteries.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-[12px]">
              <span className="font-semibold text-ink-500">Your Registered Batteries:</span>
              {batteries.map((b) => (
                <button
                  key={b.battery_id}
                  onClick={() => loadBatteryDetail(b.battery_id)}
                  className={`rounded-lg px-3 py-1.5 transition-all ${
                    bat.battery_id === b.battery_id
                      ? 'bg-brand-600 font-bold text-white shadow-xs'
                      : 'bg-white border border-ink-200 text-ink-700 hover:bg-ink-50'
                  }`}
                >
                  {b.vehicle_manufacturer} {b.vehicle_model} ({b.battery_id})
                </button>
              ))}
            </div>
          )}

          {/* =========================================================================
              CARD 1: "MY BATTERY" (Canonical Authoritative Record)
             ========================================================================= */}
          <div className="rounded-2xl border border-brand-200 bg-white p-6 shadow-sm space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-100 pb-5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-900 font-mono">
                    ID: {bat.battery_id}
                  </span>
                  {getSharingBadge(bat.sharing_status, bat.sharing_consent)}
                  {!isAssessed && (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                      ASSESSMENT PENDING
                    </span>
                  )}
                  {bat.is_demo && (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                      DEMO RECORD
                    </span>
                  )}
                </div>

                <h2 className="mt-2 text-[22px] font-extrabold text-ink-900">
                  {bat.vehicle_manufacturer} {bat.vehicle_model}
                </h2>
                <p className="text-[12.5px] text-ink-500">
                  Purchase Year: {bat.purchase_year} · Odometer:{' '}
                  {bat.odometer_km ? `${bat.odometer_km.toLocaleString()} km` : 'Not recorded'} · Location:{' '}
                  {bat.city}, {bat.state}
                </p>
              </div>

              {isAssessed && matchedAssessment ? (
                <Link
                  to={`/customer/battery?report=${matchedAssessment.assessment_id}`}
                  className="btn btn-primary btn-sm flex items-center gap-1.5 shrink-0"
                >
                  <span>View Full Assessment Report</span>
                  <ExternalLink size={13} />
                </Link>
              ) : (
                <Link
                  to="/customer/battery"
                  className="btn btn-primary btn-sm flex items-center gap-1.5 shrink-0"
                >
                  <PlusCircle size={14} />
                  <span>Check Battery Health</span>
                </Link>
              )}
            </div>

            {/* If NOT ASSESSED: Display helpful guidance and action card instead of fake metrics */}
            {!isAssessed ? (
              <div className="rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50/40 p-6 text-center space-y-5">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
                  <BatteryCharging size={30} />
                </div>
                <div className="max-w-xl mx-auto space-y-1.5">
                  <span className="inline-block rounded-full bg-amber-100 px-3 py-0.5 text-[11px] font-bold text-amber-900 uppercase tracking-wide">
                    Diagnostic Check Required
                  </span>
                  <h3 className="text-[19px] font-bold text-ink-900">
                    Battery Health Not Yet Assessed
                  </h3>
                  <p className="text-[13px] text-ink-600 leading-relaxed">
                    Your vehicle details are registered, but you have not entered your driving and charging details yet.
                    Complete a quick 2-minute diagnostic check to evaluate your battery&apos;s <strong>State of Health (SOH)</strong>,
                    degradation rate, and second-life or recycling eligibility.
                  </p>
                </div>

                {/* What the check measures */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto text-left pt-2">
                  <div className="rounded-xl border border-brand-200 bg-white p-3.5 shadow-2xs">
                    <div className="flex items-center gap-2 text-brand-700 font-bold text-[13px]">
                      <Zap size={16} />
                      <span>State of Health (SOH)</span>
                    </div>
                    <p className="mt-1 text-[11.5px] text-ink-500">
                      Machine-learning estimation of actual remaining battery capacity.
                    </p>
                  </div>
                  <div className="rounded-xl border border-brand-200 bg-white p-3.5 shadow-2xs">
                    <div className="flex items-center gap-2 text-amber-700 font-bold text-[13px]">
                      <ShieldCheck size={16} />
                      <span>Degradation &amp; Risk</span>
                    </div>
                    <p className="mt-1 text-[11.5px] text-ink-500">
                      Remaining useful life years and future degradation risk forecast.
                    </p>
                  </div>
                  <div className="rounded-xl border border-brand-200 bg-white p-3.5 shadow-2xs">
                    <div className="flex items-center gap-2 text-teal-700 font-bold text-[13px]">
                      <Recycle size={16} />
                      <span>Reuse vs Recycling</span>
                    </div>
                    <p className="mt-1 text-[11.5px] text-ink-500">
                      Suitability for stationary energy storage or mineral recovery.
                    </p>
                  </div>
                </div>

                <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                  <Link
                    to="/customer/battery"
                    className="btn btn-primary px-6 py-2.5 text-[14px] font-bold shadow-sm flex items-center gap-2"
                  >
                    <PlusCircle size={16} />
                    <span>Check My Battery Health Now</span>
                  </Link>
                </div>
              </div>
            ) : (
              /* Authoritative Spec & Animated Health Metric Grid (When assessed) */
              <div className="space-y-4">
                {/* 1. Interactive Animated Battery Gauge Component */}
                <AnimatedBatteryGauge
                  soh={bat.soh_pct}
                  healthBand={bat.health_band || 'Good'}
                  capacityKwh={bat.rated_capacity_kwh}
                  chemistry={bat.chemistry || 'LFP'}
                  remainingYears={bat.estimated_remaining_years}
                  cycles={bat.charging_cycles}
                  status={bat.collection_status || 'In Active Service'}
                />

                {/* 2. Interactive Circularity Health & Logistics Indicators */}
                <div className="grid gap-3.5 sm:grid-cols-3">
                  {/* Second-Life Suitability */}
                  <div className="card-interactive rounded-xl border border-ink-200 bg-white p-4 shadow-2xs relative overflow-hidden">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
                        Second-Life Potential
                      </span>
                      <Zap size={15} className="text-amber-500" />
                    </div>
                    <div className="mt-2">
                      <span
                        className={`text-[19px] font-black block truncate ${
                          bat.second_life_suitability === 'High' || bat.is_second_life_appropriate
                            ? 'text-emerald-700'
                            : 'text-ink-800'
                        }`}
                      >
                        {bat.second_life_suitability || (bat.is_second_life_appropriate ? 'High' : 'Normal')}
                      </span>
                      <span className="text-[11px] text-ink-500 font-medium mt-0.5 block">
                        {bat.second_life_status === 'ASSESSED_SUITABLE'
                          ? 'Assessed for Clean Energy Storage'
                          : 'Evaluated for Microgrid & Solar'}
                      </span>
                    </div>
                  </div>

                  {/* Recycling Recommendation */}
                  <div className="card-interactive rounded-xl border border-ink-200 bg-white p-4 shadow-2xs relative overflow-hidden">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
                        Circularity Status
                      </span>
                      <Recycle size={15} className="text-teal-600" />
                    </div>
                    <div className="mt-2">
                      <span
                        className={`text-[19px] font-black block truncate ${
                          bat.is_recycling_recommended || bat.recycling_status === 'APPROVED'
                            ? 'text-rose-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {bat.recycling_status === 'APPROVED'
                          ? 'Approved for Recycling'
                          : bat.is_recycling_recommended
                            ? 'Recommended for Recycling'
                            : 'Active First-Life Service'}
                      </span>
                      <span className="text-[11px] text-ink-500 font-medium mt-0.5 block">
                        {bat.future_risk ? `${bat.future_risk} Degradation Risk` : 'Thermal Safety Stable'}
                      </span>
                    </div>
                  </div>

                  {/* Collection Status */}
                  <div className="card-interactive rounded-xl border border-brand-200 bg-brand-50/40 p-4 shadow-2xs relative overflow-hidden">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-brand-800">
                        Collection Pipeline
                      </span>
                      <Truck size={15} className="text-brand-600" />
                    </div>
                    <div className="mt-2">
                      <span className="text-[19px] font-black text-brand-900 block truncate">
                        {bat.collection_status === 'REQUIRED'
                          ? 'Collection Required'
                          : bat.collection_status === 'SCHEDULED'
                            ? 'Pickup Scheduled'
                            : bat.collection_status === 'COLLECTED'
                              ? 'Collected'
                              : 'Not Required (In Service)'}
                      </span>
                      <span className="text-[11px] text-brand-700 font-medium mt-0.5 block">
                        {bat.estimated_remaining_years ? `~${bat.estimated_remaining_years} years useful life` : 'Optimal health condition'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Verify Before You Replace Card for replacement / second-life evaluated batteries */}
          {selectedBattery &&
            (selectedBattery.second_life_suitability === 'High' ||
              selectedBattery.is_second_life_appropriate ||
              selectedBattery.is_recycling_recommended ||
              selectedBattery.lifecycle_status === 'EOL_CANDIDATE' ||
              selectedBattery.lifecycle_status === 'SECOND_LIFE_CANDIDATE' ||
              (selectedBattery.current_soh != null && selectedBattery.current_soh < 0.8)) && (
              <VerifyBeforeReplaceCard
                vehicleBrand={selectedBattery.vehicle_manufacturer || 'Tata'}
                vehicleModel={selectedBattery.vehicle_model || 'Nexon EV'}
                modelYear={selectedBattery.purchase_year}
                reason={
                  selectedBattery.lifecycle_status === 'EOL_CANDIDATE'
                    ? 'Battery is marked for End-of-Life evaluation. Verify with official customer care before purchasing replacement.'
                    : 'Battery is assessed for second-life retirement from vehicle traction use.'
                }
                isDiagnosticConfirmed={selectedBattery.second_life_status === 'ASSESSED_SUITABLE'}
                hasCriticalWarning={selectedBattery.future_risk === 'HIGH' && (selectedBattery.current_soh ?? 1) < 0.55}
              />
            )}

          {/* =========================================================================
              CARD 2: "BATTERY LIFECYCLE & SHARING" (Privacy, Consent & Actions)
             ========================================================================= */}
          <div id="collection-section" className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-4">
              <div>
                <h3 className="text-[17px] font-bold text-ink-900 flex items-center gap-2">
                  <Share2 size={18} className="text-teal-600" />
                  <span>Battery Lifecycle &amp; Sharing Controls</span>
                </h3>
                <p className="text-[12.5px] text-ink-500 mt-0.5">
                  Decide how and when your battery data participates in the certified circular ecosystem.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleToggleConsent}
                  disabled={actionLoading || !isAssessed}
                  title={!isAssessed ? 'Complete battery health check before enabling circular sharing' : undefined}
                  className={`btn btn-sm flex items-center gap-1.5 transition-all ${
                    !isAssessed
                      ? 'bg-slate-100 border border-slate-300 text-slate-400 cursor-not-allowed'
                      : bat.sharing_consent
                        ? 'bg-rose-50 border border-rose-300 text-rose-800 hover:bg-rose-100'
                        : 'bg-teal-600 text-white hover:bg-teal-700 shadow-xs'
                  }`}
                >
                  {!isAssessed ? (
                    <>
                      <Lock size={13} />
                      <span>Sharing Locked (Assessment Required)</span>
                    </>
                  ) : bat.sharing_consent ? (
                    <>
                      <Lock size={13} />
                      <span>Withdraw Sharing Consent</span>
                    </>
                  ) : (
                    <>
                      <Share2 size={13} />
                      <span>Grant Sharing Consent</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Plain Language Status Explanation Banner */}
            <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 text-[13px] text-teal-900 space-y-2">
              <div className="flex items-start gap-2.5">
                <Info size={18} className="shrink-0 text-teal-700 mt-0.5" />
                <div>
                  <p className="font-semibold text-teal-950">
                    {!isAssessed
                      ? 'Initial Diagnostic Assessment Required Before Circular Sharing'
                      : bat.sharing_consent
                        ? 'Current State: Shared with Certified Diagnostic & Recycling Partners'
                        : 'Current State: Private Record — Only Visible to You'}
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-teal-800">
                    {!isAssessed
                      ? 'Before this battery can be evaluated for second-life repurposing or registered with recycling handlers, an initial battery health check is required to determine its true State of Health, cycle wear, and safety condition.'
                      : bat.sharing_consent
                        ? 'You have consented to share anonymized battery health parameters (ID, capacity, SOH, chemistry, city/state) with certified second-life repurposers and CPCB-registered recycling facilities. Your personal identity (full name, phone, license plate) is strictly protected and never displayed.'
                        : 'This battery record is currently marked PRIVATE. No external circular partner, laboratory, or collection transporter can view these parameters until you grant consent.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Direct Operational Action Buttons */}
            <div className="pt-2 flex flex-wrap items-center justify-between gap-3 bg-ink-50/70 p-4 rounded-xl border border-ink-100">
              <div className="text-[12.5px] text-ink-700">
                <span className="font-semibold text-ink-900">Recommended Next Steps: </span>
                {!isAssessed ? (
                  <span>Complete your first battery check to evaluate health and unlock circular options.</span>
                ) : bat.sharing_status === 'APPROVED_FOR_RECYCLING' || bat.is_recycling_recommended ? (
                  <span>Your battery is ready for authorized hazardous battery collection.</span>
                ) : bat.sharing_status === 'APPROVED_FOR_SECOND_LIFE' ? (
                  <span>Your battery is approved for stationary storage repurposing evaluation.</span>
                ) : bat.sharing_status === 'PENDING_ASSESSMENT' ? (
                  <span>Awaiting authorized diagnostic assessment from testing facility.</span>
                ) : (
                  <span>Request a diagnostic assessment to formalize second-life or recycling options.</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {!isAssessed ? (
                  <Link
                    to="/customer/battery"
                    className="btn btn-primary btn-sm flex items-center gap-1.5"
                  >
                    <PlusCircle size={13} />
                    <span>Start Battery Health Check</span>
                  </Link>
                ) : (
                  <>
                    {/* Request Assessment Button */}
                    {bat.sharing_status === 'PRIVATE' || bat.sharing_status === 'PENDING_ASSESSMENT' ? (
                      <button
                        onClick={() => setShowAssessmentModal(true)}
                        disabled={actionLoading || bat.sharing_status === 'PENDING_ASSESSMENT'}
                        className="btn btn-outline btn-sm flex items-center gap-1.5"
                      >
                        <Wrench size={13} />
                        <span>
                          {bat.sharing_status === 'PENDING_ASSESSMENT'
                            ? 'Assessment Requested'
                            : 'Request Diagnostic Assessment'}
                        </span>
                      </button>
                    ) : null}

                    {/* Request Collection Button */}
                    <button
                      onClick={() => setShowCollectionModal(true)}
                      disabled={actionLoading || bat.collection_status === 'SCHEDULED' || bat.collection_status === 'COLLECTED'}
                      className="btn btn-primary btn-sm flex items-center gap-1.5"
                    >
                      <Truck size={13} />
                      <span>
                        {bat.collection_status === 'SCHEDULED'
                          ? 'Collection Scheduled'
                          : bat.collection_status === 'COLLECTED'
                            ? 'Battery Collected'
                            : 'Request Authorized Collection'}
                      </span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* =========================================================================
              CARD 3: "MY BATTERY JOURNEY" (Authentic Lifecycle Stepper)
             ========================================================================= */}
          <div id="lifecycle-section">
            <Card
              title="My Battery Journey"
              subtitle="Authentic step-by-step circular progression backed by real recorded database events."
            >
            <div className="space-y-8">
              {/* Visual 6-Step Stepper Bar with Animated Flow Track */}
              <div className="space-y-3">
                {/* Progress bar line */}
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-ink-100">
                  <div
                    className="h-full bg-gradient-to-r from-brand-500 via-teal-500 to-emerald-400 transition-all duration-1000 ease-out shadow-xs"
                    style={{ width: `${Math.min(Math.max(((currentStep + 1) / STEPS.length) * 100, 16), 100)}%` }}
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-6 gap-3 pt-1">
                  {STEPS.map((step, idx) => {
                    const isCompleted = currentStep > idx
                    const isCurrent = currentStep === idx
                    return (
                      <div
                        key={step.num}
                        className={`card-interactive rounded-xl border p-3.5 transition-all relative overflow-hidden ${
                          isCurrent
                            ? 'border-brand-500 bg-gradient-to-br from-brand-50/90 to-teal-50/70 shadow-sm animate-pulseGlow ring-2 ring-brand-400/30'
                            : isCompleted
                              ? 'border-emerald-300/80 bg-emerald-50/40 text-emerald-950'
                              : 'border-ink-200 bg-ink-50/40 text-ink-400 opacity-65'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black transition-transform ${
                              isCurrent
                                ? 'bg-brand-600 text-white shadow-2xs scale-110'
                                : isCompleted
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-ink-200 text-ink-600'
                            }`}
                          >
                            {isCompleted ? '✓' : step.num}
                          </span>
                          {isCurrent && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-brand-200/90 px-2 py-0.5 text-[9.5px] font-black text-brand-900 uppercase tracking-wide">
                              <span className="h-1.5 w-1.5 rounded-full bg-brand-700 animate-ping" />
                              Active
                            </span>
                          )}
                          {isCompleted && (
                            <span className="text-[10px] font-bold text-emerald-700">Done</span>
                          )}
                        </div>

                        <div className="mt-2.5">
                          <h4 className="text-[13px] font-black text-ink-900 leading-tight">
                            {step.name}
                          </h4>
                          <p className="mt-1 text-[11px] text-ink-500 leading-snug">
                            {step.desc}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Verified Chronological Audit Trail from Database */}
              <div className="border-t border-ink-100 pt-5">
                <h4 className="text-[13.5px] font-bold text-ink-900 mb-3 flex items-center gap-1.5">
                  <Clock size={15} className="text-brand-600" />
                  <span>Recorded Event History (Database Timeline)</span>
                </h4>

                {timeline.length === 0 ? (
                  <p className="text-[12.5px] text-ink-500 italic">
                    No lifecycle events recorded yet for this battery.
                  </p>
                ) : (
                  <div className="space-y-3 relative pl-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-ink-200">
                    {timeline.map((ev, i) => (
                      <div key={ev.id || i} className="relative pb-1">
                        <span className="absolute -left-6 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 ring-4 ring-white shadow-2xs">
                          <span className="h-1.5 w-1.5 rounded-full bg-white animate-ping" />
                        </span>
                        <div className="card-interactive rounded-xl border border-ink-200 bg-white p-3.5 shadow-2xs space-y-1">
                          <div className="flex flex-wrap items-center justify-between text-[12.5px] gap-2">
                            <span className="font-bold text-ink-900">{ev.event}</span>
                            <span className="text-[11px] text-ink-500">
                              {new Date(ev.occurred_at).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          </div>

                          <div className="text-[12px] text-ink-600 flex flex-wrap gap-x-4">
                            <span>Handler: {ev.handler}</span>
                            <span>Location: {ev.location}</span>
                            <span>Actor: {ev.actor}</span>
                          </div>

                          {ev.status && (
                            <div className="mt-1 text-[11.5px] font-medium text-brand-800">
                              Status: {ev.status}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      </>
    )}

      {/* =========================================================================
          MODALS / DIALOGS FOR CUSTOMER ACTIONS
         ========================================================================= */}

      {/* Assessment Request Modal */}
      {showAssessmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                <Wrench size={20} />
              </div>
              <div>
                <h3 className="text-[16px] font-bold text-ink-900">
                  Request Diagnostic Assessment
                </h3>
                <p className="text-[12.5px] text-ink-600">
                  Submit this battery ({bat?.battery_id}) for certified laboratory health evaluation.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-bold text-ink-700 mb-1">
                Diagnostic Notes / Observed Symptoms (Optional)
              </label>
              <textarea
                value={modalNotes}
                onChange={(e) => setModalNotes(e.target.value)}
                placeholder="E.g., range dropped by 25% over winter, vehicle display shows BMS warning..."
                rows={3}
                className="w-full rounded-xl border border-ink-200 p-3 text-[13px] focus:border-brand-500 focus:outline-none"
              />
            </div>

            <div className="rounded-xl border border-ink-200 bg-ink-50/70 p-3 text-[11.5px] text-ink-600 flex items-start gap-2">
              <AlertCircle size={15} className="shrink-0 text-ink-500 mt-0.5" />
              <p>
                Submitting this request automatically grants sharing consent so certified diagnostic
                partners can review your anonymized technical pack specifications.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAssessmentModal(false)}
                disabled={actionLoading}
                className="btn btn-outline btn-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleRequestAssessment}
                disabled={actionLoading}
                className="btn btn-primary btn-sm flex items-center gap-1.5"
              >
                {actionLoading && <RefreshCw size={13} className="animate-spin" />}
                <span>Confirm Assessment Request</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collection Request Modal */}
      {showCollectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
                <Truck size={20} />
              </div>
              <div>
                <h3 className="text-[16px] font-bold text-ink-900">
                  Request Authorized Collection
                </h3>
                <p className="text-[12.5px] text-ink-600">
                  Schedule safe reverse-logistics collection for battery {bat?.battery_id}.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-bold text-ink-700 mb-1">
                Pickup Notes &amp; Address Confirmation (Optional)
              </label>
              <textarea
                value={modalNotes}
                onChange={(e) => setModalNotes(e.target.value)}
                placeholder={`Preferred contact time, vehicle location (${bat?.city || 'City'}, ${bat?.state || 'State'})...`}
                rows={3}
                className="w-full rounded-xl border border-ink-200 p-3 text-[13px] focus:border-brand-500 focus:outline-none"
              />
            </div>

            <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-3 text-[11.5px] text-teal-800 flex items-start gap-2">
              <ShieldCheck size={15} className="shrink-0 text-teal-600 mt-0.5" />
              <p>
                Collection is handled only by CPCB-registered hazardous battery transporters with
                ADR-certified containers. Never deliver loose battery packs to unauthorized scrap merchants.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCollectionModal(false)}
                disabled={actionLoading}
                className="btn btn-outline btn-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleRequestCollection}
                disabled={actionLoading}
                className="btn btn-primary btn-sm flex items-center gap-1.5"
              >
                {actionLoading && <RefreshCw size={13} className="animate-spin" />}
                <span>Submit Collection Request</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
