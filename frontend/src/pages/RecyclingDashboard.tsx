/**
 * EVolve AI — Battery Recycling & Recovery Dashboard
 *
 * Route: /recycling/dashboard (and /consumer/dashboard)
 * Authoritative circular portal connecting EV Owners, diagnostic labs, and recyclers.
 *
 * Sections:
 *   1. Header with primary action & quick links
 *   2. 4 Educational Foundation Cards (Recycling, Second-Life, Material Recovery, Collection)
 *   3. Shared Battery Records & Circular Pipeline (4 Filter Tabs, Live Records from DB, Detail Modal)
 *   4. "What Happens to a Used EV Battery?" (5-stage visual lifecycle)
 *   5. "What Should I Do With My Battery?" (Interactive condition diagnosis tool)
 *   6. "Where Can I Take My Used EV Battery?" (Authorized channels & responsible guidance)
 *   7. Connected Battery Profile (for authenticated EV owners)
 */

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  BatteryCharging,
  BookOpen,
  Boxes,
  Building2,
  CheckCircle2,
  Clock,
  Compass,
  FileText,
  HelpCircle,
  Info,
  Layers,
  Leaf,
  Recycle,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Truck,
  Wrench,
  X,
  Zap,
} from 'lucide-react'
import { Spinner } from '../components/ui'
import { useToast } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { api } from '../services/api'
import type {
  SharedBatteryDetailResponse,
  SharedBatterySummary,
} from '../types/api'
import {
  buildDefaultComponents,
  getPathwayStatusBadge,
} from '../utils/consumerComponents'

type BatteryCondition =
  | 'NORMAL'
  | 'REDUCED_RANGE'
  | 'DAMAGED'
  | 'HAZARDOUS'
  | 'REMOVED'
  | 'NOT_SURE'

interface ConditionOption {
  id: BatteryCondition
  label: string
  subtext: string
  tone: 'good' | 'warn' | 'bad' | 'neutral'
  guidance: string
  actionRecommendation: string
  actionLink?: string
}

const CONDITION_OPTIONS: ConditionOption[] = [
  {
    id: 'NORMAL',
    label: 'Working normally',
    subtext: 'Vehicle operates with expected daily range, no warning lights or charging issues.',
    tone: 'good',
    guidance:
      "Continue following the vehicle manufacturer's maintenance recommendations. Recycling may not be necessary at this stage.",
    actionRecommendation:
      'Regular charging between 20% and 80% helps maximize remaining battery life before any recycling or second-life assessment is needed.',
  },
  {
    id: 'REDUCED_RANGE',
    label: 'Reduced driving range or noticeable performance decline',
    subtext: 'Battery discharges faster than before, or rapid acceleration triggers mild power cuts.',
    tone: 'warn',
    guidance:
      'Arrange a professional battery assessment. Reduced range alone does not prove that the battery needs recycling.',
    actionRecommendation:
      'A qualified diagnostic technician can determine whether cell rebalancing, a software BMS update, or module repair can restore performance without retiring the pack.',
    actionLink: '/customer/battery',
  },
  {
    id: 'DAMAGED',
    label: 'Damaged or involved in an accident',
    subtext: 'Physical impact to underbody casing, road debris collision, or vehicle collision.',
    tone: 'bad',
    guidance:
      'Contact the vehicle manufacturer, service centre, or a qualified battery professional for guidance. Do not attempt to remove or dismantle the battery yourself.',
    actionRecommendation:
      'Damaged high-voltage enclosures pose severe electric shock and thermal runaway hazards. Keep the vehicle parked outdoors away from flammable structures until evaluated.',
  },
  {
    id: 'HAZARDOUS',
    label: 'Swollen, leaking, overheating, or showing other warning signs',
    subtext: 'Hissing sounds, pungent odor, unusual heat, dashboard thermal alerts, or smoke.',
    tone: 'bad',
    guidance:
      'Treat this as a potential safety hazard. Keep away, avoid handling or charging the battery, and contact qualified emergency or battery-safety professionals. If there is smoke, fire, or immediate danger, contact local emergency services.',
    actionRecommendation:
      'Under no circumstances attempt to transport or open the battery enclosure. Keep a safety perimeter clear.',
  },
  {
    id: 'REMOVED',
    label: 'Battery removed from a vehicle',
    subtext: 'A loose pack or battery module that has been uninstalled or stored separately.',
    tone: 'warn',
    guidance:
      'Do not store, dismantle, or discard it casually. Contact an appropriate authorized battery collection or recycling service.',
    actionRecommendation:
      'Loose packs retain high voltage and require proper terminal insulation and specialized certified reverse logistics.',
  },
  {
    id: 'NOT_SURE',
    label: 'Not sure',
    subtext: 'Uncertain about battery age, history, or operational status.',
    tone: 'neutral',
    guidance:
      'Start with an assessment by the vehicle manufacturer or a qualified battery service provider.',
    actionRecommendation:
      'You can use our guided EV Battery Assessment Wizard to inspect your battery specifications before booking a technician.',
    actionLink: '/customer/battery',
  },
]

type SharedStatusTab =
  | 'ALL'
  | 'PENDING_ASSESSMENT'
  | 'APPROVED_FOR_SECOND_LIFE'
  | 'APPROVED_FOR_RECYCLING'
  | 'COLLECTION_TRACKING'

export default function RecyclingDashboard() {
  const { user, isAuthenticated } = useAuth()
  const { push } = useToast()

  // Educational Condition state
  const [selectedCondition, setSelectedCondition] = useState<BatteryCondition>('NORMAL')
  const guideRef = useRef<HTMLDivElement>(null)
  const sharedRecordsRef = useRef<HTMLDivElement>(null)

  // Shared Batteries State
  const [batteries, setBatteries] = useState<SharedBatterySummary[]>([])
  const [counts, setCounts] = useState({
    all: 0,
    awaiting_assessment: 0,
    second_life: 0,
    recycling: 0,
    tracking: 0,
  })
  const [statusTab, setStatusTab] = useState<SharedStatusTab>('ALL')
  const [chemistryFilter, setChemistryFilter] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [loadingBatteries, setLoadingBatteries] = useState(true)

  // Detail Modal State
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [selectedDetail, setSelectedDetail] = useState<SharedBatteryDetailResponse | null>(null)

  // Staff Action Controls State
  const [actionTab, setActionTab] = useState<'ASSESSMENT' | 'COLLECTION' | 'STATUS'>('ASSESSMENT')
  const [assessmentOutcome, setAssessmentOutcome] = useState<
    'APPROVED_FOR_SECOND_LIFE' | 'APPROVED_FOR_RECYCLING' | 'CONTINUE_USE'
  >('APPROVED_FOR_SECOND_LIFE')
  const [testedSohInput, setTestedSohInput] = useState('')
  const [assessmentNotes, setAssessmentNotes] = useState('')

  const [collectionAction, setCollectionAction] = useState<
    'CONFIRM_PICKUP' | 'MARK_COLLECTED' | 'DELIVERED_TO_FACILITY'
  >('CONFIRM_PICKUP')
  const [collectionNotes, setCollectionNotes] = useState('')

  const [statusChoice, setStatusChoice] = useState<'PROCESSING' | 'RECOVERY_COMPLETED'>('PROCESSING')
  const [recoveryPctInput, setRecoveryPctInput] = useState('95.0')
  const [statusNotes, setStatusNotes] = useState('')
  const [submittingAction, setSubmittingAction] = useState(false)

  const activeCondition =
    CONDITION_OPTIONS.find((c) => c.id === selectedCondition) || CONDITION_OPTIONS[0]

  const isStaffUser = user && (user.role === 'RECYCLER' || user.role === 'ADMIN')

  useEffect(() => {
    fetchSharedBatteries()
  }, [statusTab, chemistryFilter])

  const fetchSharedBatteries = async () => {
    setLoadingBatteries(true)
    try {
      const res = await api.recyclingBatteries({
        status: statusTab === 'ALL' ? undefined : statusTab,
        chemistry: chemistryFilter === 'ALL' ? undefined : chemistryFilter,
        search: searchQuery.trim() || undefined,
      })
      setBatteries(res.batteries)
      if (res.counts) setCounts(res.counts)
    } catch (e) {
      push(e instanceof Error ? e.message : 'Failed to load shared battery records', 'error')
    } finally {
      setLoadingBatteries(false)
    }
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    fetchSharedBatteries()
  }

  const openBatteryDetail = async (batteryId: string) => {
    setDetailModalOpen(true)
    setLoadingDetail(true)
    try {
      const res = await api.recyclingBattery(batteryId)
      setSelectedDetail(res)
      if (res.battery.soh_pct) {
        setTestedSohInput(String(res.battery.soh_pct))
      }
    } catch (e) {
      push(e instanceof Error ? e.message : 'Failed to load battery details', 'error')
      setDetailModalOpen(false)
    } finally {
      setLoadingDetail(false)
    }
  }

  // Submit Assessment Action (Staff)
  const handleSubmitAssessment = async () => {
    if (!selectedDetail) return
    setSubmittingAction(true)
    try {
      const parsedSoh = testedSohInput ? parseFloat(testedSohInput) / 100.0 : undefined
      const res = await api.recyclingSubmitAssessment(selectedDetail.battery.battery_id, {
        outcome: assessmentOutcome,
        notes: assessmentNotes,
        tested_soh: parsedSoh,
      })
      push(res.message, 'success')
      // Refresh detail & list
      await openBatteryDetail(selectedDetail.battery.battery_id)
      fetchSharedBatteries()
    } catch (e) {
      push(e instanceof Error ? e.message : 'Failed to record assessment', 'error')
    } finally {
      setSubmittingAction(false)
    }
  }

  // Update Collection Action (Staff)
  const handleUpdateCollection = async () => {
    if (!selectedDetail) return
    setSubmittingAction(true)
    try {
      const res = await api.recyclingUpdateCollection(selectedDetail.battery.battery_id, {
        action: collectionAction,
        notes: collectionNotes,
      })
      push(res.message, 'success')
      await openBatteryDetail(selectedDetail.battery.battery_id)
      fetchSharedBatteries()
    } catch (e) {
      push(e instanceof Error ? e.message : 'Failed to update collection tracking', 'error')
    } finally {
      setSubmittingAction(false)
    }
  }

  // Update Processing Status (Staff)
  const handleUpdateProcessingStatus = async () => {
    if (!selectedDetail) return
    setSubmittingAction(true)
    try {
      const parsedRecovery = recoveryPctInput ? parseFloat(recoveryPctInput) : undefined
      const res = await api.recyclingUpdateStatus(selectedDetail.battery.battery_id, {
        status: statusChoice,
        material_recovered_pct: parsedRecovery,
        notes: statusNotes,
      })
      push(res.message, 'success')
      await openBatteryDetail(selectedDetail.battery.battery_id)
      fetchSharedBatteries()
    } catch (e) {
      push(e instanceof Error ? e.message : 'Failed to update recovery status', 'error')
    } finally {
      setSubmittingAction(false)
    }
  }

  const scrollToGuide = () => {
    guideRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const scrollToSharedRecords = () => {
    sharedRecordsRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING_ASSESSMENT':
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-sky-300 bg-sky-100 px-2.5 py-0.5 text-[11px] font-bold text-sky-800">
            <RefreshCw size={11} className="text-sky-600" />
            <span>Awaiting Assessment</span>
          </span>
        )
      case 'APPROVED_FOR_SECOND_LIFE':
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
            <Zap size={11} className="text-emerald-600" />
            <span>Approved for Second-Life</span>
          </span>
        )
      case 'APPROVED_FOR_RECYCLING':
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-800">
            <ShieldCheck size={11} className="text-rose-600" />
            <span>Approved for Recycling</span>
          </span>
        )
      case 'COLLECTION_REQUESTED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
            <Truck size={11} className="text-amber-600" />
            <span>Collection Scheduled</span>
          </span>
        )
      case 'COLLECTED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-purple-300 bg-purple-100 px-2.5 py-0.5 text-[11px] font-bold text-purple-800">
            <Truck size={11} className="text-purple-600" />
            <span>In-Transit / Depot</span>
          </span>
        )
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-indigo-300 bg-indigo-100 px-2.5 py-0.5 text-[11px] font-bold text-indigo-800">
            <Wrench size={11} className="text-indigo-600" />
            <span>Hydrometallurgical Processing</span>
          </span>
        )
      case 'RECOVERY_COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-teal-300 bg-teal-100 px-2.5 py-0.5 text-[11px] font-bold text-teal-800">
            <CheckCircle2 size={11} className="text-teal-600" />
            <span>Recovery Completed</span>
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center rounded-full border border-ink-200 bg-ink-100 px-2.5 py-0.5 text-[11px] font-bold text-ink-700">
            {status}
          </span>
        )
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-10 py-3">
      {/* =========================================================================
          1. HEADER & HERO
         ========================================================================= */}
      <div className="relative overflow-hidden rounded-3xl border border-teal-200/80 bg-gradient-to-b from-teal-50/70 via-white to-white p-6 sm:p-10 shadow-xs">
        <div className="max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-teal-300 bg-white px-3 py-1 text-[11px] font-bold text-teal-800 shadow-2xs">
            <Recycle size={13} className="text-teal-600" />
            <span>Responsible Circular Ecosystem</span>
          </div>

          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-ink-900">
            Battery Recycling &amp; Recovery
          </h1>

          <p className="text-[14px] sm:text-[15px] leading-relaxed text-ink-600">
            Understand how EV batteries can be safely collected, evaluated, recovered, and recycled
            to reduce battery waste and recover valuable materials.
          </p>

          <div className="pt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={scrollToSharedRecords}
              className="btn bg-teal-700 text-white hover:bg-teal-800 px-5 py-2.5 text-[13.5px] font-bold flex items-center gap-2 shadow-xs"
            >
              <Layers size={16} />
              <span>View Shared Battery Records</span>
              <ArrowRight size={14} />
            </button>

            <Link
              to="/recycling/learn"
              className="btn btn-outline border-teal-300 text-teal-900 hover:bg-teal-50 px-4 py-2.5 text-[13.5px] font-semibold flex items-center gap-2"
            >
              <BookOpen size={16} />
              <span>Learn How Recycling Works</span>
            </Link>

            <button
              type="button"
              onClick={scrollToGuide}
              className="btn btn-outline border-ink-300 text-ink-700 hover:bg-ink-50 px-4 py-2.5 text-[13.5px] font-semibold flex items-center gap-2"
            >
              <Compass size={16} />
              <span>Check Battery Next Step</span>
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          2. FOUR TOP EDUCATIONAL CATEGORY CARDS
         ========================================================================= */}
      <div>
        <div className="mb-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-teal-800">
            Core Foundations
          </span>
          <h2 className="text-xl font-bold text-ink-900">
            Four Pillars of Responsible Battery Circularity
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Battery Recycling */}
          <div className="card-interactive rounded-2xl border border-ink-200 bg-white p-5 shadow-2xs hover:border-teal-400 hover:shadow-[0_8px_25px_-5px_rgba(20,184,166,0.25)] transition-all flex flex-col justify-between group">
            <div className="space-y-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                <Recycle size={22} />
              </div>
              <h3 className="text-[16px] font-bold text-ink-900">1. Battery Recycling</h3>
              <p className="text-[12.5px] leading-relaxed text-ink-600">
                Learn when an EV battery may require recycling, understand end-of-life criteria,
                and discover how certified hydrometallurgical facilities operate.
              </p>
            </div>
            <div className="pt-4 border-t border-ink-100 mt-4">
              <Link
                to="/recycling/learn#when"
                className="text-[12px] font-bold text-teal-700 hover:text-teal-900 flex items-center gap-1.5"
              >
                <span>Learn when to recycle</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>

          {/* Card 2: Second-Life Potential */}
          <div className="card-interactive rounded-2xl border border-ink-200 bg-white p-5 shadow-2xs hover:border-amber-400 hover:shadow-[0_8px_25px_-5px_rgba(245,158,11,0.25)] transition-all flex flex-col justify-between group">
            <div className="space-y-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                <Zap size={22} />
              </div>
              <h3 className="text-[16px] font-bold text-ink-900">2. Second-Life Potential</h3>
              <p className="text-[12.5px] leading-relaxed text-ink-600">
                Understand when a retired vehicle battery might be safely repurposed for stationary
                solar storage, microgrids, or home backup before ultimate material recycling.
              </p>
            </div>
            <div className="pt-4 border-t border-ink-100 mt-4">
              <Link
                to="/recycling/learn#reuse"
                className="text-[12px] font-bold text-amber-800 hover:text-amber-950 flex items-center gap-1.5"
              >
                <span>Understand reuse potential</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>

          {/* Card 3: Material Recovery */}
          <div className="card-interactive rounded-2xl border border-ink-200 bg-white p-5 shadow-2xs hover:border-sky-400 hover:shadow-[0_8px_25px_-5px_rgba(56,189,248,0.25)] transition-all flex flex-col justify-between group">
            <div className="space-y-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-50 text-sky-700 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                <Layers size={22} />
              </div>
              <h3 className="text-[16px] font-bold text-ink-900">3. Material Recovery</h3>
              <p className="text-[12.5px] leading-relaxed text-ink-600">
                Learn which strategic materials—including Lithium, Nickel, Cobalt, Copper,
                Aluminium, and Graphite—can potentially be recovered from decommissioned cells.
              </p>
            </div>
            <div className="pt-4 border-t border-ink-100 mt-4">
              <Link
                to="/recycling/learn#materials"
                className="text-[12px] font-bold text-sky-700 hover:text-sky-900 flex items-center gap-1.5"
              >
                <span>View recoverable materials</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>

          {/* Card 4: Responsible Collection */}
          <div className="card-interactive rounded-2xl border border-ink-200 bg-white p-5 shadow-2xs hover:border-purple-400 hover:shadow-[0_8px_25px_-5px_rgba(168,85,247,0.25)] transition-all flex flex-col justify-between group">
            <div className="space-y-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-50 text-purple-700 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                <Truck size={22} />
              </div>
              <h3 className="text-[16px] font-bold text-ink-900">4. Responsible Collection</h3>
              <p className="text-[12.5px] leading-relaxed text-ink-600">
                Understand how to arrange safe reverse logistics, transport, and hazardous
                material handling through authorized manufacturer channels and registered recyclers.
              </p>
            </div>
            <div className="pt-4 border-t border-ink-100 mt-4">
              <button
                type="button"
                onClick={scrollToGuide}
                className="text-[12px] font-bold text-purple-700 hover:text-purple-900 flex items-center gap-1.5"
              >
                <span>Explore collection channels</span>
                <ArrowRight size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          3. SHARED BATTERY RECORDS & CIRCULAR PIPELINE (MAJOR INTEGRATION)
         ========================================================================= */}
      <div ref={sharedRecordsRef} className="rounded-3xl border border-ink-200 bg-white p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-100 pb-5">
          <div>
            <div className="flex items-center gap-2 text-teal-800 text-[11px] font-bold uppercase tracking-wider">
              <Layers size={14} />
              <span>Unified Database · Authoritative Records</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-ink-900 mt-1">
              Shared Battery Records &amp; Circular Pipeline
            </h2>
            <p className="text-[13px] text-ink-600 mt-0.5 max-w-2xl">
              Registry of retired and second-life eligible EV batteries. Shows synthetic demo fleet packs (to demonstrate circular tracking) alongside real packs consented by registered EV owners. Personal identity is strictly protected.
            </p>
          </div>

          {isStaffUser && (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-teal-300 bg-teal-50 px-3 py-1 text-[11px] font-bold text-teal-800">
              <ShieldCheck size={13} className="text-teal-700" />
              <span>Operational Role: {user?.role}</span>
            </div>
          )}
        </div>

        {/* Consumer Component Discovery Spotlight Banner */}
        <div className="rounded-2xl border-2 border-emerald-300 bg-gradient-to-r from-emerald-50/90 via-teal-50/70 to-white p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-emerald-800 text-[11px] font-bold uppercase tracking-wider">
              <Sparkles size={13} className="text-emerald-600" />
              <span>Consumer Component Discovery &amp; Reuse Ideas</span>
            </div>
            <h3 className="text-[15.5px] font-extrabold text-ink-900">
              Each Battery Contains 9 Identified Reusable &amp; Recyclable Sub-Components
            </h3>
            <p className="text-[12.5px] text-ink-600 max-w-3xl">
              Inspect cells, modules, BMS controllers, cooling assemblies, busbars, and enclosures. Discover how each part maps to viable second-life applications (BESS, Home Solar, Telecom 48V, EV Spares, DC Robotics).
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/consumer/discarded-batteries"
              className="btn btn-primary btn-sm flex items-center gap-1.5 text-[12px] font-bold shadow-xs"
            >
              <Boxes size={14} />
              <span>Dedicated Catalog</span>
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>

        {/* 4 Category Tabs with Real Counts */}
        <div className="flex flex-wrap gap-2 border-b border-ink-100 pb-3">
          <button
            onClick={() => setStatusTab('ALL')}
            className={`rounded-xl px-3.5 py-2 text-[12.5px] font-bold transition-all flex items-center gap-2 ${
              statusTab === 'ALL'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'bg-ink-50 text-ink-700 hover:bg-ink-100'
            }`}
          >
            <span>All Shared Records</span>
            <span
              className={`rounded-full px-2 py-0.2 text-[11px] font-semibold ${
                statusTab === 'ALL' ? 'bg-teal-800 text-white' : 'bg-ink-200 text-ink-800'
              }`}
            >
              {counts.all}
            </span>
          </button>

          <button
            onClick={() => setStatusTab('PENDING_ASSESSMENT')}
            className={`rounded-xl px-3.5 py-2 text-[12.5px] font-bold transition-all flex items-center gap-2 ${
              statusTab === 'PENDING_ASSESSMENT'
                ? 'bg-sky-700 text-white shadow-xs'
                : 'bg-ink-50 text-ink-700 hover:bg-ink-100'
            }`}
          >
            <span>A. Awaiting Assessment</span>
            <span
              className={`rounded-full px-2 py-0.2 text-[11px] font-semibold ${
                statusTab === 'PENDING_ASSESSMENT' ? 'bg-sky-800 text-white' : 'bg-ink-200 text-ink-800'
              }`}
            >
              {counts.awaiting_assessment}
            </span>
          </button>

          <button
            onClick={() => setStatusTab('APPROVED_FOR_SECOND_LIFE')}
            className={`rounded-xl px-3.5 py-2 text-[12.5px] font-bold transition-all flex items-center gap-2 ${
              statusTab === 'APPROVED_FOR_SECOND_LIFE'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-ink-50 text-ink-700 hover:bg-ink-100'
            }`}
          >
            <span>B. Approved for Second-Life</span>
            <span
              className={`rounded-full px-2 py-0.2 text-[11px] font-semibold ${
                statusTab === 'APPROVED_FOR_SECOND_LIFE'
                  ? 'bg-emerald-800 text-white'
                  : 'bg-ink-200 text-ink-800'
              }`}
            >
              {counts.second_life}
            </span>
          </button>

          <button
            onClick={() => setStatusTab('APPROVED_FOR_RECYCLING')}
            className={`rounded-xl px-3.5 py-2 text-[12.5px] font-bold transition-all flex items-center gap-2 ${
              statusTab === 'APPROVED_FOR_RECYCLING'
                ? 'bg-rose-700 text-white shadow-xs'
                : 'bg-ink-50 text-ink-700 hover:bg-ink-100'
            }`}
          >
            <span>C. Approved for Recycling</span>
            <span
              className={`rounded-full px-2 py-0.2 text-[11px] font-semibold ${
                statusTab === 'APPROVED_FOR_RECYCLING' ? 'bg-rose-800 text-white' : 'bg-ink-200 text-ink-800'
              }`}
            >
              {counts.recycling}
            </span>
          </button>

          <button
            onClick={() => setStatusTab('COLLECTION_TRACKING')}
            className={`rounded-xl px-3.5 py-2 text-[12.5px] font-bold transition-all flex items-center gap-2 ${
              statusTab === 'COLLECTION_TRACKING'
                ? 'bg-purple-700 text-white shadow-xs'
                : 'bg-ink-50 text-ink-700 hover:bg-ink-100'
            }`}
          >
            <span>D. Collection &amp; Tracking</span>
            <span
              className={`rounded-full px-2 py-0.2 text-[11px] font-semibold ${
                statusTab === 'COLLECTION_TRACKING' ? 'bg-purple-800 text-white' : 'bg-ink-200 text-ink-800'
              }`}
            >
              {counts.tracking}
            </span>
          </button>
        </div>

        {/* Filter Bar: Chemistry & Search */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-ink-50/60 p-3 rounded-2xl border border-ink-100">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-ink-600">
            <span>Filter Chemistry:</span>
            <select
              value={chemistryFilter}
              onChange={(e) => setChemistryFilter(e.target.value)}
              className="rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-[12px] font-bold text-ink-800 focus:outline-none"
            >
              <option value="ALL">All Chemistries</option>
              <option value="LFP">LFP (Lithium Iron Phosphate)</option>
              <option value="NMC">NMC (Nickel Manganese Cobalt)</option>
              <option value="NCA">NCA (Nickel Cobalt Aluminium)</option>
            </select>
          </div>

          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-ink-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search battery ID or location..."
                className="w-56 sm:w-64 rounded-xl border border-ink-200 bg-white pl-8 pr-3 py-1.5 text-[12.5px] focus:border-teal-500 focus:outline-none"
              />
            </div>
            <button type="submit" className="btn btn-outline btn-sm text-[12px]">
              Search
            </button>
          </form>
        </div>

        {/* Live Shared Batteries Grid */}
        {loadingBatteries ? (
          <div className="py-12">
            <Spinner label="Loading shared battery pipeline..." />
          </div>
        ) : batteries.length === 0 ? (
          <div className="text-center py-12 rounded-2xl border border-dashed border-ink-200 bg-ink-50/40">
            <Recycle size={32} className="mx-auto text-ink-400 mb-2" />
            <h3 className="text-[15px] font-bold text-ink-800">No Shared Records in This Category</h3>
            <p className="text-[12.5px] text-ink-500 max-w-md mx-auto mt-1">
              No batteries currently match the selected filter. As EV owners grant sharing consent or
              diagnostic assessments occur, records appear automatically.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {batteries.map((b) => (
              <div
                key={b.battery_id}
                className="card-interactive rounded-2xl border border-ink-200 bg-white p-5 shadow-2xs hover:border-teal-400 hover:shadow-md transition-all flex flex-col justify-between space-y-4 group"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-[11px] font-bold text-teal-900 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                        {b.battery_id}
                      </span>
                      {b.is_demo ? (
                        <span className="rounded bg-amber-100 text-amber-900 border border-amber-200 px-1.5 py-0.2 text-[9.5px] font-bold uppercase tracking-wider">
                          Demo Fleet
                        </span>
                      ) : (
                        <span className="rounded bg-emerald-100 text-emerald-900 border border-emerald-200 px-1.5 py-0.2 text-[9.5px] font-bold uppercase tracking-wider">
                          EV Owner
                        </span>
                      )}
                    </div>
                    {getStatusBadge(b.sharing_status)}
                  </div>

                  <div>
                    <h4 className="text-[16px] font-extrabold text-ink-900 leading-tight">
                      {b.vehicle_manufacturer} {b.vehicle_model}
                    </h4>
                    <p className="text-[12px] text-ink-500 mt-0.5">
                      Approx. Region: {b.approximate_area}
                      {b.purchase_year ? ` · ${b.purchase_year}` : ''}
                    </p>
                  </div>

                  {/* Technical Spec Chips */}
                  <div className="grid grid-cols-2 gap-2 text-[12px] bg-ink-50/70 p-3 rounded-xl border border-ink-100">
                    <div>
                      <span className="text-ink-500 block text-[10.5px] uppercase">Pack &amp; Chemistry</span>
                      <span className="font-bold text-ink-900">
                        {b.chemistry} · {b.rated_capacity_kwh} kWh
                      </span>
                    </div>

                    <div>
                      <span className="text-ink-500 block text-[10.5px] uppercase">Nominal Voltage</span>
                      <span className="font-bold text-ink-900">
                        {b.voltage_v ? `${b.voltage_v} V DC` : '350.0 V DC'}
                      </span>
                    </div>

                    <div>
                      <span className="text-ink-500 block text-[10.5px] uppercase">Second-Life</span>
                      <span className="font-bold text-ink-800">
                        {b.second_life_suitability || 'Not evaluated'}
                      </span>
                    </div>

                    <div>
                      <span className="text-ink-500 block text-[10.5px] uppercase">Cycle Count</span>
                      <span className="font-bold text-ink-800">{b.charging_cycles} cycles</span>
                    </div>
                  </div>

                  {/* Identified Components Chip */}
                  <div className="flex items-center gap-2 text-[12px] text-emerald-950 bg-emerald-50/90 border border-emerald-200 rounded-xl px-3 py-2">
                    <Boxes size={15} className="text-emerald-700 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-extrabold text-[12px] leading-tight flex items-center justify-between">
                        <span>9 Components Identified</span>
                        <span className="text-[10px] text-emerald-800 font-bold uppercase bg-emerald-100/90 px-1.5 py-0.5 rounded">
                          Reuse Mapped
                        </span>
                      </div>
                      <div className="text-[10.5px] text-emerald-800 truncate mt-0.5">
                        Cells · Modules · BMS · Enclosure · Busbars
                      </div>
                    </div>
                  </div>

                  {/* Recommended Next Step Callout */}
                  <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-2.5 text-[11.5px] text-teal-900 flex items-start gap-2">
                    <Info size={14} className="shrink-0 text-teal-700 mt-0.5" />
                    <p className="leading-snug">{b.recommended_next_step}</p>
                  </div>
                </div>

                <div className="pt-3 border-t border-ink-100 space-y-2">
                  <Link
                    to={`/consumer/discarded-batteries/${b.battery_id}`}
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        localStorage.setItem('last_viewed_battery_id', b.battery_id)
                      }
                    }}
                    className="w-full btn btn-primary btn-sm text-[12.5px] font-bold flex items-center justify-center gap-2 shadow-xs hover:shadow-md transition-all"
                  >
                    <Sparkles size={14} className="text-amber-300" />
                    <span>Explore Components &amp; Reuse Ideas</span>
                    <ArrowRight size={13} />
                  </Link>

                  <button
                    onClick={() => openBatteryDetail(b.battery_id)}
                    className="w-full btn btn-ghost btn-xs text-[11.5px] font-semibold text-ink-600 hover:text-ink-900 hover:bg-ink-100/70 flex items-center justify-center gap-1.5"
                  >
                    <FileText size={12} />
                    <span>Quick Spec &amp; Timeline Modal</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* =========================================================================
          4. "WHAT HAPPENS TO A USED EV BATTERY?" (5-Stage Visual Lifecycle)
         ========================================================================= */}
      <div className="rounded-3xl border border-ink-200 bg-white p-6 sm:p-8 shadow-xs space-y-6">
        <div className="border-b border-ink-100 pb-4">
          <div className="flex items-center gap-2 text-teal-800 text-[11px] font-bold uppercase tracking-wider">
            <Sparkles size={14} />
            <span>Closed-Loop Circularity Flow</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-ink-900 mt-1">
            What Happens to a Used EV Battery?
          </h2>
          <p className="text-[13px] text-ink-600 mt-0.5">
            Degraded batteries should not be discarded casually or sent straight to scrap without
            thorough screening. Assessment always comes first.
          </p>
        </div>

        {/* Responsive 5-Stage Visual Flow */}
        <div className="grid gap-4 md:grid-cols-5 relative">
          {/* Stage 1 */}
          <div className="rounded-2xl border border-ink-200 bg-ink-50/50 p-4 space-y-2 relative">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800 bg-teal-100 px-2 py-0.5 rounded-full">
                Stage 1
              </span>
              <Wrench size={16} className="text-teal-700" />
            </div>
            <h3 className="text-[14px] font-bold text-ink-900 pt-1">Battery Assessment</h3>
            <p className="text-[12px] leading-relaxed text-ink-600">
              The battery&apos;s condition, remaining capacity, cell balance, physical damage, and
              safety risks are assessed by qualified personnel.
            </p>
          </div>

          {/* Stage 2 */}
          <div className="rounded-2xl border border-ink-200 bg-ink-50/50 p-4 space-y-2 relative">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                Stage 2
              </span>
              <Zap size={16} className="text-amber-700" />
            </div>
            <h3 className="text-[14px] font-bold text-ink-900 pt-1">Reuse Suitability</h3>
            <p className="text-[12px] leading-relaxed text-ink-600">
              If the battery is safe and structurally sound, it may be evaluated for a second-life
              application, subject to testing and safety requirements.
            </p>
          </div>

          {/* Stage 3 */}
          <div className="rounded-2xl border border-ink-200 bg-ink-50/50 p-4 space-y-2 relative">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800 bg-rose-100 px-2 py-0.5 rounded-full">
                Stage 3
              </span>
              <Truck size={16} className="text-rose-700" />
            </div>
            <h3 className="text-[14px] font-bold text-ink-900 pt-1">Safe Collection</h3>
            <p className="text-[12px] leading-relaxed text-ink-600">
              Batteries requiring recycling are collected and transported through appropriate authorized
              channels, adhering to high-voltage safety rules.
            </p>
          </div>

          {/* Stage 4 */}
          <div className="rounded-2xl border border-ink-200 bg-ink-50/50 p-4 space-y-2 relative">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-800 bg-purple-100 px-2 py-0.5 rounded-full">
                Stage 4
              </span>
              <Recycle size={16} className="text-purple-700" />
            </div>
            <h3 className="text-[14px] font-bold text-ink-900 pt-1">Recycling &amp; Recovery</h3>
            <p className="text-[12px] leading-relaxed text-ink-600">
              Specialized facilities shred, separate, and refine battery materials. Methods and yields
              depend on chemistry and technical setup.
            </p>
          </div>

          {/* Stage 5 */}
          <div className="rounded-2xl border border-ink-200 bg-ink-50/50 p-4 space-y-2 relative">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                Stage 5
              </span>
              <Leaf size={16} className="text-emerald-700" />
            </div>
            <h3 className="text-[14px] font-bold text-ink-900 pt-1">Material Management</h3>
            <p className="text-[12px] leading-relaxed text-ink-600">
              Recovered materials return to manufacturing supply chains where suitable. Non-recoverable
              waste is treated in accordance with regulations.
            </p>
          </div>
        </div>
      </div>

      {/* =========================================================================
          5. "WHAT SHOULD I DO WITH MY BATTERY?" (Interactive Condition Tool)
         ========================================================================= */}
      <div ref={guideRef} className="rounded-3xl border border-ink-200 bg-white p-6 sm:p-8 shadow-xs space-y-6">
        <div className="border-b border-ink-100 pb-4">
          <div className="flex items-center gap-2 text-teal-800 text-[11px] font-bold uppercase tracking-wider">
            <Compass size={14} />
            <span>Interactive Decision Helper</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-ink-900 mt-1">
            What Should I Do With My Battery?
          </h2>
          <p className="text-[13px] text-ink-600 mt-0.5">
            Select the current state of your battery below to see cautious, practical guidance on
            recommended next steps.
          </p>
        </div>

        {/* Question & Options */}
        <div className="space-y-4">
          <label className="block text-[13px] font-bold text-ink-800 uppercase tracking-wider">
            What is the current condition of your battery?
          </label>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CONDITION_OPTIONS.map((opt) => {
              const isSelected = selectedCondition === opt.id
              return (
                <div
                  key={opt.id}
                  onClick={() => setSelectedCondition(opt.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setSelectedCondition(opt.id)
                  }}
                  className={`rounded-2xl border-2 p-4 text-left transition-all cursor-pointer select-none flex flex-col justify-between ${
                    isSelected
                      ? 'border-teal-600 bg-teal-50/50 shadow-sm ring-2 ring-teal-500/20'
                      : 'border-ink-200 bg-white hover:border-ink-300 hover:bg-ink-50/30'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-[13.5px] text-ink-900 leading-snug">
                        {opt.label}
                      </span>
                      {opt.tone === 'bad' ? (
                        <ShieldAlert size={16} className="text-rose-600 shrink-0 mt-0.5" />
                      ) : opt.tone === 'warn' ? (
                        <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                      ) : opt.tone === 'good' ? (
                        <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <HelpCircle size={16} className="text-ink-400 shrink-0 mt-0.5" />
                      )}
                    </div>
                    <p className="mt-1.5 text-[11.5px] text-ink-500 leading-relaxed">
                      {opt.subtext}
                    </p>
                  </div>

                  <div className="mt-3 pt-2 border-t border-ink-100 flex items-center justify-between text-[11px] font-semibold text-ink-600">
                    <span>{isSelected ? 'Selected' : 'Click to select'}</span>
                    <span className="text-teal-700">→</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Selected Guidance Box */}
        <div className="rounded-2xl border-2 border-teal-300 bg-gradient-to-r from-teal-50/80 to-white p-5 space-y-3 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-teal-200 px-2.5 py-0.5 text-[10.5px] font-bold text-teal-900 uppercase">
              Selected Diagnosis
            </span>
            <h3 className="text-[15px] font-extrabold text-teal-950">
              Recommended Guidance for: {activeCondition.label}
            </h3>
          </div>

          <div className="rounded-xl bg-white/90 border border-ink-100 p-4 text-[13.5px] font-semibold text-ink-900 shadow-2xs">
            &ldquo;{activeCondition.guidance}&rdquo;
          </div>

          <p className="text-[12.5px] leading-relaxed text-ink-700">
            {activeCondition.actionRecommendation}
          </p>

          {activeCondition.actionLink && (
            <div className="pt-2">
              <Link
                to={activeCondition.actionLink}
                className="btn btn-primary btn-sm inline-flex items-center gap-2 text-[12.5px]"
              >
                <span>Run Guided Battery Assessment</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          )}
        </div>

        {/* Mandatory Cautious Disclaimer Note */}
        <div className="rounded-xl border border-ink-200 bg-ink-50/70 p-3.5 text-[11.5px] text-ink-600 flex items-start gap-2">
          <HelpCircle size={15} className="shrink-0 text-ink-500 mt-0.5" />
          <p>
            <strong>General Information Notice:</strong> This tool provides general educational
            guidance only, not a certified safety diagnosis or formal warranty appraisal.
            High-voltage automotive systems require professional handling by certified technicians.
          </p>
        </div>
      </div>

      {/* =========================================================================
          6. "WHERE CAN I TAKE MY USED EV BATTERY?" (Authorized Channels)
         ========================================================================= */}
      <div className="rounded-3xl border border-ink-200 bg-white p-6 sm:p-8 shadow-xs space-y-6">
        <div className="border-b border-ink-100 pb-4">
          <div className="flex items-center gap-2 text-teal-800 text-[11px] font-bold uppercase tracking-wider">
            <Building2 size={14} />
            <span>Authorized Channels</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-ink-900 mt-1">
            Where Can I Take My Used EV Battery?
          </h2>
          <p className="text-[13px] text-ink-600 mt-0.5">
            Never abandon or deliver an EV battery to an unauthorized scrap merchant. Always utilize
            one of the four verified channels below.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Channel 1 */}
          <div className="rounded-2xl border border-ink-200 bg-ink-50/40 p-4 space-y-2">
            <div className="flex items-center gap-2 text-teal-800 font-bold text-[13.5px]">
              <Building2 size={16} />
              <h4>1. Vehicle Manufacturer Service Centre</h4>
            </div>
            <p className="text-[12px] leading-relaxed text-ink-600">
              The primary and safest route. EV manufacturers in India and worldwide have mandatory
              Extended Producer Responsibility (EPR) mandates to take back and safely decommission
              original traction packs.
            </p>
          </div>

          {/* Channel 2 */}
          <div className="rounded-2xl border border-ink-200 bg-ink-50/40 p-4 space-y-2">
            <div className="flex items-center gap-2 text-teal-800 font-bold text-[13.5px]">
              <Truck size={16} />
              <h4>2. Authorized Battery Collection Service</h4>
            </div>
            <p className="text-[12px] leading-relaxed text-ink-600">
              Specialized reverse logistics partners equipped with fire-rated containers, terminal
              insulation, and ADR-compliant hazardous transport certifications.
            </p>
          </div>

          {/* Channel 3 */}
          <div className="rounded-2xl border border-ink-200 bg-ink-50/40 p-4 space-y-2">
            <div className="flex items-center gap-2 text-teal-800 font-bold text-[13.5px]">
              <Recycle size={16} />
              <h4>3. Registered Battery Recycler</h4>
            </div>
            <p className="text-[12px] leading-relaxed text-ink-600">
              Facilities registered with the Central Pollution Control Board (CPCB) or State PCB
              operating under the Battery Waste Management Rules 2022 to recover black mass and refined minerals.
            </p>
          </div>

          {/* Channel 4 */}
          <div className="rounded-2xl border border-ink-200 bg-ink-50/40 p-4 space-y-2">
            <div className="flex items-center gap-2 text-teal-800 font-bold text-[13.5px]">
              <ShieldCheck size={16} />
              <h4>4. Local Waste-Management Authority</h4>
            </div>
            <p className="text-[12px] leading-relaxed text-ink-600">
              Municipal e-waste and hazardous materials departments that facilitate scheduled
              collection drives or direct owners to authorized regional intake depots.
            </p>
          </div>
        </div>

        {/* Directory Notice */}
        <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-4 flex items-start gap-3 text-[12px] text-teal-900">
          <Info size={18} className="shrink-0 text-teal-700 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Locating Certified Recycling Facilities</p>
            <p className="leading-relaxed text-teal-800">
              To find an authorized provider in your area, contact your vehicle manufacturer&apos;s
              authorized service network or consult the official register of certified recyclers
              maintained by your state or national environmental authority (such as the CPCB
              register under India&apos;s Battery Waste Management Rules 2022).
            </p>
          </div>
        </div>
      </div>

      {/* =========================================================================
          7. CONNECTED WORKFLOW (If Authenticated User Has a Registered EV)
         ========================================================================= */}
      {isAuthenticated && user?.vehicle && (
        <div className="rounded-3xl border border-brand-200 bg-gradient-to-r from-brand-50/60 to-white p-6 sm:p-8 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-brand-800 uppercase tracking-wider">
              <BatteryCharging size={14} className="text-brand-600" />
              <span>Your Registered EV Profile</span>
            </div>
            <h3 className="text-lg font-bold text-ink-900">
              {user.vehicle.manufacturer} {user.vehicle.model} ({user.vehicle.vehicle_number})
            </h3>
            <p className="text-[12.5px] text-ink-600">
              Purchase Year: {user.vehicle.purchase_year} · Odometer:{' '}
              {user.vehicle.odometer_km?.toLocaleString()} km · Location: {user.vehicle.city},{' '}
              {user.vehicle.state}
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <Link to="/customer/dashboard" className="btn btn-outline btn-sm">
              My EV Dashboard
            </Link>
            <Link to="/customer/battery" className="btn btn-primary btn-sm flex items-center gap-1.5">
              <Sparkles size={14} />
              <span>Battery Assessment Wizard</span>
            </Link>
          </div>
        </div>
      )}

      {/* =========================================================================
          DETAIL MODAL / DRAWER (SPECIFICATIONS, AUDIT TIMELINE, STAFF ACTIONS)
         ========================================================================= */}
      {detailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6 overflow-y-auto">
          <div className="w-full max-w-3xl rounded-3xl bg-white p-6 sm:p-8 shadow-2xl space-y-6 my-auto max-h-[92vh] overflow-y-auto">
            {loadingDetail || !selectedDetail ? (
              <div className="py-16">
                <Spinner label="Loading battery specification &amp; lifecycle trail..." />
              </div>
            ) : (
              <>
                {/* Modal Header */}
                <div className="flex items-start justify-between gap-4 border-b border-ink-100 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[12px] font-bold text-teal-900 bg-teal-50 px-2.5 py-0.5 rounded border border-teal-200">
                        {selectedDetail.battery.battery_id}
                      </span>
                      {getStatusBadge(selectedDetail.battery.sharing_status)}
                    </div>
                    <h3 className="text-xl sm:text-2xl font-extrabold text-ink-900 mt-2">
                      {selectedDetail.battery.vehicle_manufacturer} {selectedDetail.battery.vehicle_model}
                    </h3>
                    <p className="text-[12.5px] text-ink-500">
                      Category: {selectedDetail.battery.category} · Approximate Area:{' '}
                      {selectedDetail.battery.approximate_area}
                    </p>
                  </div>

                  <button
                    onClick={() => setDetailModalOpen(false)}
                    className="rounded-full p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Top Action Banner: Direct link to full component breakdown */}
                <div className="rounded-2xl border-2 border-emerald-300 bg-gradient-to-r from-emerald-50 to-teal-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                  <div>
                    <div className="flex items-center gap-1.5 text-emerald-800 text-[11px] font-bold uppercase tracking-wider">
                      <Sparkles size={13} className="text-emerald-600" />
                      <span>Dedicated Component Exploration &amp; Product Ideas</span>
                    </div>
                    <h4 className="text-[14.5px] font-extrabold text-ink-900 mt-0.5">
                      9 Identified Sub-Components &amp; Practical Product Ideas Available
                    </h4>
                    <p className="text-[12px] text-ink-600">
                      Explore reuse suitability, testing steps, and new product applications for this pack.
                    </p>
                  </div>
                  <Link
                    to={`/consumer/discarded-batteries/${selectedDetail.battery.battery_id}`}
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        localStorage.setItem('last_viewed_battery_id', selectedDetail.battery.battery_id)
                      }
                      setDetailModalOpen(false)
                    }}
                    className="btn btn-primary btn-sm flex items-center justify-center gap-2 shrink-0 text-[12.5px] font-bold shadow-xs"
                  >
                    <Boxes size={14} />
                    <span>Open Full Component Breakdown</span>
                    <ArrowRight size={13} />
                  </Link>
                </div>

                {/* Technical Specifications Grid */}
                <div>
                  <h4 className="text-[13px] font-bold uppercase tracking-wider text-ink-500 mb-2">
                    Verified Technical Specifications
                  </h4>
                  <div className="grid gap-3 sm:grid-cols-3 bg-ink-50/60 p-4 rounded-2xl border border-ink-100 text-[12.5px]">
                    <div>
                      <span className="text-ink-500 block text-[11px]">Chemistry</span>
                      <span className="font-bold text-ink-900">{selectedDetail.battery.chemistry}</span>
                    </div>

                    <div>
                      <span className="text-ink-500 block text-[11px]">Rated Capacity</span>
                      <span className="font-bold text-ink-900">{selectedDetail.battery.rated_capacity_kwh} kWh</span>
                    </div>

                    <div>
                      <span className="text-ink-500 block text-[11px]">Estimated Usable Capacity</span>
                      <span className="font-bold text-ink-900">
                        {selectedDetail.battery.usable_capacity_kwh
                          ? `${selectedDetail.battery.usable_capacity_kwh} kWh`
                          : 'Under Diagnostic Evaluation'}
                      </span>
                    </div>

                    <div>
                      <span className="text-ink-500 block text-[11px]">Nominal Pack Voltage</span>
                      <span className="font-bold text-ink-900">
                        {selectedDetail.battery.voltage_v
                          ? `${selectedDetail.battery.voltage_v} V DC`
                          : '350.0 V DC'}
                      </span>
                    </div>

                    <div>
                      <span className="text-ink-500 block text-[11px]">Equivalent Full Cycles</span>
                      <span className="font-bold text-ink-900">
                        {selectedDetail.battery.charging_cycles} cycles
                      </span>
                    </div>

                    <div>
                      <span className="text-ink-500 block text-[11px]">Reported Operating State</span>
                      <span className="font-bold text-ink-900">
                        {selectedDetail.battery.reported_condition}
                      </span>
                    </div>

                    <div>
                      <span className="text-ink-500 block text-[11px]">Second-Life Evaluation</span>
                      <span className="font-bold text-ink-900">
                        {selectedDetail.battery.second_life_suitability || 'Not Evaluated'}
                      </span>
                    </div>

                    <div>
                      <span className="text-ink-500 block text-[11px]">Recycling Status</span>
                      <span className="font-bold text-ink-900">
                        {selectedDetail.battery.recycling_status}
                      </span>
                    </div>

                    <div>
                      <span className="text-ink-500 block text-[11px]">Collection Status</span>
                      <span className="font-bold text-ink-900">
                        {selectedDetail.battery.collection_status}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Prominent Mandatory Decision-Support Disclaimer */}
                <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-[12px] text-amber-900 flex items-start gap-2.5">
                  <AlertCircle size={18} className="shrink-0 text-amber-600 mt-0.5" />
                  <div>
                    <p className="font-bold">Decision-Support &amp; Safety Disclaimer</p>
                    <p className="mt-0.5 leading-relaxed text-amber-800">
                      Assessment results represent decision-support guidance only and do not replace
                      certified safety inspection, high-voltage handling protocols, or vehicle
                      manufacturer warranty conditions.
                    </p>
                  </div>
                </div>

                {/* 9 Identified Sub-Components Section */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[13px] font-bold uppercase tracking-wider text-ink-500 flex items-center gap-1.5">
                      <Boxes size={15} className="text-emerald-600" />
                      <span>Identified Battery Sub-Components &amp; Pathway Guidance</span>
                    </h4>
                    <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                      9 Sub-Systems Catalogued
                    </span>
                  </div>

                  <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                    {(selectedDetail.components && selectedDetail.components.length > 0
                      ? selectedDetail.components
                      : buildDefaultComponents(selectedDetail.battery, selectedDetail.disposal_info)
                    ).map((c) => {
                      const badge = getPathwayStatusBadge(c.suggested_pathway)
                      return (
                        <div
                          key={c.id}
                          className="rounded-xl border border-ink-200 bg-ink-50/40 p-3.5 space-y-2 hover:bg-white transition-colors"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="font-extrabold text-[13.5px] text-ink-900 leading-snug">
                                {c.name}
                              </div>
                              <div className="text-[11px] text-ink-500 font-medium">
                                Type: {c.component_type} · Function: {c.pack_function}
                              </div>
                            </div>
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${badge.badgeClass}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${badge.dotClass}`} />
                              <span>{badge.label}</span>
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11.5px] bg-white p-2.5 rounded-lg border border-ink-100">
                            <div>
                              <span className="text-ink-400 block text-[10px] uppercase font-bold">Recorded Condition</span>
                              <span className="font-semibold text-ink-800">{c.recorded_condition}</span>
                            </div>
                            <div>
                              <span className="text-ink-400 block text-[10px] uppercase font-bold">Potential Applications</span>
                              <span className="font-semibold text-ink-800 truncate block">
                                {c.potential_applications?.slice(0, 2).join(' · ') || 'Energy Storage'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Practical Product Ideas Spotlight */}
                <div className="rounded-2xl border border-sky-200 bg-sky-50/50 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles size={15} className="text-sky-700" />
                      <h4 className="text-[13px] font-bold uppercase tracking-wider text-sky-950">
                        Component Reuse &amp; New Product Ideas
                      </h4>
                    </div>
                    <span className="text-[11px] text-sky-800 font-bold">6 Practical Use Cases</span>
                  </div>
                  <p className="text-[12px] text-sky-900 leading-relaxed">
                    Components from this pack can be repurposed for <strong>Commercial BESS</strong>, <strong>Residential Solar Storage (5–15 kWh)</strong>, <strong>Telecom Tower 48V UPS</strong>, <strong>Compatible EV Spares</strong>, <strong>DC Robotics &amp; Tools</strong>, or <strong>Closed-Loop Mineral Refining</strong>.
                  </p>
                </div>

                {/* Immutable Chronological Lifecycle Events Audit Trail */}
                <div>
                  <h4 className="text-[13px] font-bold uppercase tracking-wider text-ink-500 mb-3 flex items-center gap-1.5">
                    <Clock size={15} className="text-teal-600" />
                    <span>Chronological Lifecycle Trail (Recorded Events)</span>
                  </h4>

                  {selectedDetail.timeline.length === 0 ? (
                    <p className="text-[12.5px] text-ink-500 italic p-3 bg-ink-50/50 rounded-xl">
                      No lifecycle events recorded for this pack yet.
                    </p>
                  ) : (
                    <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                      {selectedDetail.timeline.map((ev, i) => (
                        <div
                          key={ev.id || i}
                          className="rounded-xl border border-ink-100 bg-ink-50/40 p-3 text-[12px] flex flex-wrap items-center justify-between gap-2"
                        >
                          <div>
                            <div className="font-bold text-ink-900">{ev.event}</div>
                            <div className="text-[11px] text-ink-500">
                              Actor: {ev.actor} · Handler: {ev.handler} · Location: {ev.location}
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="rounded bg-teal-100 px-2 py-0.5 text-[10.5px] font-bold text-teal-800">
                              {ev.status}
                            </span>
                            <div className="text-[10px] text-ink-400 mt-0.5">
                              {new Date(ev.occurred_at).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Authorized Operational Actions (RECYCLER / ADMIN only) */}
                {selectedDetail.is_ops_authorized && (
                  <div className="rounded-2xl border-2 border-teal-400 bg-teal-50/40 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Wrench size={16} className="text-teal-700" />
                        <h4 className="text-[14px] font-bold text-teal-950 uppercase tracking-wider">
                          Authorized Circular Operations (Recycler / Admin)
                        </h4>
                      </div>

                      <div className="flex gap-1">
                        <button
                          onClick={() => setActionTab('ASSESSMENT')}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                            actionTab === 'ASSESSMENT' ? 'bg-teal-700 text-white' : 'bg-white text-ink-700'
                          }`}
                        >
                          Diagnostic Test
                        </button>
                        <button
                          onClick={() => setActionTab('COLLECTION')}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                            actionTab === 'COLLECTION' ? 'bg-teal-700 text-white' : 'bg-white text-ink-700'
                          }`}
                        >
                          Collection
                        </button>
                        <button
                          onClick={() => setActionTab('STATUS')}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                            actionTab === 'STATUS' ? 'bg-teal-700 text-white' : 'bg-white text-ink-700'
                          }`}
                        >
                          Recovery &amp; Mineral
                        </button>
                      </div>
                    </div>

                    {/* Action Tab 1: Diagnostic Assessment */}
                    {actionTab === 'ASSESSMENT' && (
                      <div className="space-y-3 bg-white p-4 rounded-xl border border-teal-200">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="block text-[11.5px] font-bold text-ink-700 mb-1">
                              Diagnostic Outcome
                            </label>
                            <select
                              value={assessmentOutcome}
                              onChange={(e) => setAssessmentOutcome(e.target.value as any)}
                              className="w-full rounded-xl border border-ink-200 p-2 text-[12.5px] font-semibold"
                            >
                              <option value="APPROVED_FOR_SECOND_LIFE">
                                APPROVED_FOR_SECOND_LIFE (Stationary Storage)
                              </option>
                              <option value="APPROVED_FOR_RECYCLING">
                                APPROVED_FOR_RECYCLING (Direct Recovery)
                              </option>
                              <option value="CONTINUE_USE">
                                CONTINUE_USE (Suitable for Vehicle)
                              </option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11.5px] font-bold text-ink-700 mb-1">
                              Tested SOH % (0 - 100)
                            </label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={testedSohInput}
                              onChange={(e) => setTestedSohInput(e.target.value)}
                              placeholder="E.g. 74.5"
                              className="w-full rounded-xl border border-ink-200 p-2 text-[12.5px]"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11.5px] font-bold text-ink-700 mb-1">
                            Diagnostic Notes
                          </label>
                          <textarea
                            value={assessmentNotes}
                            onChange={(e) => setAssessmentNotes(e.target.value)}
                            placeholder="Impedance spectroscopy observations, cell-level balance findings..."
                            rows={2}
                            className="w-full rounded-xl border border-ink-200 p-2 text-[12.5px]"
                          />
                        </div>

                        <button
                          onClick={handleSubmitAssessment}
                          disabled={submittingAction}
                          className="btn btn-primary btn-sm flex items-center gap-1.5"
                        >
                          {submittingAction && <RefreshCw size={13} className="animate-spin" />}
                          <span>Record Diagnostic Assessment</span>
                        </button>
                      </div>
                    )}

                    {/* Action Tab 2: Collection */}
                    {actionTab === 'COLLECTION' && (
                      <div className="space-y-3 bg-white p-4 rounded-xl border border-teal-200">
                        <div>
                          <label className="block text-[11.5px] font-bold text-ink-700 mb-1">
                            Collection Action
                          </label>
                          <select
                            value={collectionAction}
                            onChange={(e) => setCollectionAction(e.target.value as any)}
                            className="w-full rounded-xl border border-ink-200 p-2 text-[12.5px] font-semibold"
                          >
                            <option value="CONFIRM_PICKUP">CONFIRM_PICKUP (Transporter Scheduled)</option>
                            <option value="MARK_COLLECTED">MARK_COLLECTED (Pack Picked Up)</option>
                            <option value="DELIVERED_TO_FACILITY">
                              DELIVERED_TO_FACILITY (Received at Depot)
                            </option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11.5px] font-bold text-ink-700 mb-1">
                            Logistics Notes
                          </label>
                          <textarea
                            value={collectionNotes}
                            onChange={(e) => setCollectionNotes(e.target.value)}
                            placeholder="Carrier vehicle ID, fire-safe container serial number..."
                            rows={2}
                            className="w-full rounded-xl border border-ink-200 p-2 text-[12.5px]"
                          />
                        </div>

                        <button
                          onClick={handleUpdateCollection}
                          disabled={submittingAction}
                          className="btn btn-primary btn-sm flex items-center gap-1.5"
                        >
                          {submittingAction && <RefreshCw size={13} className="animate-spin" />}
                          <span>Update Collection Status</span>
                        </button>
                      </div>
                    )}

                    {/* Action Tab 3: Recovery */}
                    {actionTab === 'STATUS' && (
                      <div className="space-y-3 bg-white p-4 rounded-xl border border-teal-200">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="block text-[11.5px] font-bold text-ink-700 mb-1">
                              Processing Status
                            </label>
                            <select
                              value={statusChoice}
                              onChange={(e) => setStatusChoice(e.target.value as any)}
                              className="w-full rounded-xl border border-ink-200 p-2 text-[12.5px] font-semibold"
                            >
                              <option value="PROCESSING">PROCESSING (Disassembly &amp; Black Mass)</option>
                              <option value="RECOVERY_COMPLETED">
                                RECOVERY_COMPLETED (Mineral Extraction Verified)
                              </option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11.5px] font-bold text-ink-700 mb-1">
                              Critical Mineral Recovery %
                            </label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={recoveryPctInput}
                              onChange={(e) => setRecoveryPctInput(e.target.value)}
                              placeholder="E.g. 95.5"
                              className="w-full rounded-xl border border-ink-200 p-2 text-[12.5px]"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11.5px] font-bold text-ink-700 mb-1">
                            Facility Process Notes
                          </label>
                          <textarea
                            value={statusNotes}
                            onChange={(e) => setStatusNotes(e.target.value)}
                            placeholder="Hydrometallurgical acid leach batch verification, nickel/lithium yields..."
                            rows={2}
                            className="w-full rounded-xl border border-ink-200 p-2 text-[12.5px]"
                          />
                        </div>

                        <button
                          onClick={handleUpdateProcessingStatus}
                          disabled={submittingAction}
                          className="btn btn-primary btn-sm flex items-center gap-1.5"
                        >
                          {submittingAction && <RefreshCw size={13} className="animate-spin" />}
                          <span>Record Mineral Recovery Status</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-ink-100">
                  <Link
                    to={`/consumer/discarded-batteries/${selectedDetail.battery.battery_id}`}
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        localStorage.setItem('last_viewed_battery_id', selectedDetail.battery.battery_id)
                      }
                      setDetailModalOpen(false)
                    }}
                    className="btn btn-primary btn-sm flex items-center gap-2 font-bold"
                  >
                    <Sparkles size={14} className="text-amber-300" />
                    <span>Open Full Interactive Component &amp; Reuse Page</span>
                    <ArrowRight size={13} />
                  </Link>

                  <button onClick={() => setDetailModalOpen(false)} className="btn btn-outline btn-sm">
                    Close Details
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
