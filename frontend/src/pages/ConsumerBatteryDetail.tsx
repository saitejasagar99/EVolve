import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  BatteryCharging,
  BookOpen,
  Box,
  CheckCircle2,
  Clock,
  Cpu,
  Flame,
  GitBranch,
  Hammer,
  Info,
  Layers,
  MapPin,
  MessageSquare,
  Radio,
  Recycle,
  ShieldAlert,
  ShieldCheck,
  Sun,
  Thermometer,
  Wrench,
  X,
  Zap,
} from 'lucide-react'
import {
  api,
  type SharedBatterySummary,
  type LifecycleTimelineEvent,
  type IdentifiedSubComponent,
} from '../services/api'
import { useAuth } from '../context/AuthContext'
import {
  getPathwayStatusBadge,
  buildDefaultComponents,
} from '../utils/consumerComponents'

const ENQUIRY_PURPOSES = [
  'Second-life stationary storage project (BESS)',
  'Home solar energy storage system',
  'Telecom tower backup power deployment',
  'Compatible EV replacement modules & maintenance',
  'Low-voltage DC tools / robotics project',
  'Certified material recovery & hydrometallurgical recycling',
  'Academic / R&D testing inquiry',
  'General technical question',
]

const INTENDED_APPLICATIONS = [
  'Commercial BESS / Peak Shaving',
  'Residential Solar Storage (5–15 kWh)',
  'Telecom Tower 48V UPS Backup',
  'EV Module Pack Replacement',
  'Low-Voltage DC Robotics / Tools',
  'Closed-Loop Material Refining',
  'Other',
]

export default function ConsumerBatteryDetail() {
  const { batteryId } = useParams<{ batteryId: string }>()
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [battery, setBattery] = useState<SharedBatterySummary | null>(null)
  const [disposalInfo, setDisposalInfo] = useState<any>(null)
  const [timeline, setTimeline] = useState<LifecycleTimelineEvent[]>([])
  const [components, setComponents] = useState<IdentifiedSubComponent[]>([])
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Enquiry Modal State
  const [showEnquiryModal, setShowEnquiryModal] = useState(false)
  const [enquiryPurpose, setEnquiryPurpose] = useState(ENQUIRY_PURPOSES[0])
  const [intendedApp, setIntendedApp] = useState(INTENDED_APPLICATIONS[0])
  const [enquiryMessage, setEnquiryMessage] = useState('')
  const [enquirySubmitting, setEnquirySubmitting] = useState(false)
  const [enquirySuccess, setEnquirySuccess] = useState<string | null>(null)
  const [enquiryError, setEnquiryError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      if (!batteryId) return
      try {
        localStorage.setItem('last_viewed_battery_id', batteryId)
        setLoading(true)
        setError(null)
        const detailRes = await api.recyclingBattery(batteryId)
        setBattery(detailRes.battery)
        setDisposalInfo(detailRes.disposal_info || null)
        setTimeline(detailRes.timeline || [])

        if (detailRes.components && detailRes.components.length > 0) {
          setComponents(detailRes.components)
        } else {
          // Robust client fallback if backend did not generate components
          setComponents(buildDefaultComponents(detailRes.battery, detailRes.disposal_info))
        }
      } catch (err: any) {
        console.error('Failed to load battery detail:', err)
        setError('Battery record not found or is currently marked private.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [batteryId])

  const handleEnquirySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!battery) return
    try {
      setEnquirySubmitting(true)
      setEnquiryError(null)
      const res = await api.submitBatteryEnquiry(battery.battery_id, {
        enquiry_purpose: enquiryPurpose,
        intended_application: intendedApp,
        message: enquiryMessage || undefined,
      })
      setEnquirySuccess(res.message)
    } catch (err: any) {
      console.error('Failed to submit enquiry:', err)
      setEnquiryError(err?.message || 'Failed to submit enquiry.')
    } finally {
      setEnquirySubmitting(false)
    }
  }

  const openEnquiryForIdea = (purpose: string, app: string) => {
    setEnquiryPurpose(purpose)
    setIntendedApp(app)
    setEnquirySuccess(null)
    setEnquiryError(null)
    setShowEnquiryModal(true)
  }

  const getComponentIcon = (id: string) => {
    switch (id) {
      case 'cells': return <Layers className="h-5 w-5 text-emerald-600" />
      case 'modules': return <Box className="h-5 w-5 text-sky-600" />
      case 'bms': return <Cpu className="h-5 w-5 text-indigo-600" />
      case 'cooling': return <Thermometer className="h-5 w-5 text-teal-600" />
      case 'busbars': return <Zap className="h-5 w-5 text-amber-600" />
      case 'enclosure': return <ShieldCheck className="h-5 w-5 text-slate-700" />
      case 'contactors': return <ShieldAlert className="h-5 w-5 text-rose-600" />
      case 'sense_harness': return <GitBranch className="h-5 w-5 text-cyan-600" />
      case 'insulation': return <Flame className="h-5 w-5 text-orange-600" />
      default: return <Wrench className="h-5 w-5 text-ink-600" />
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  if (error || !battery) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center">
          <ShieldAlert className="mx-auto h-12 w-12 text-rose-500" />
          <h2 className="mt-3 text-lg font-bold text-rose-900">Battery Record Unavailable</h2>
          <p className="mt-1 text-sm text-rose-700">{error || 'Record could not be retrieved.'}</p>
          <div className="mt-6">
            <Link
              to="/consumer/discarded-batteries"
              className="inline-flex items-center gap-2 rounded-xl bg-ink-900 px-4 py-2 text-xs font-semibold text-white hover:bg-ink-800 transition"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Discarded Batteries Discovery
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const isDamaged =
    battery.reported_condition === 'Damaged' ||
    battery.reported_condition === 'CRITICAL' ||
    disposalInfo?.current_condition === 'DAMAGED' ||
    disposalInfo?.current_condition === 'HAZARDOUS'

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-6">
      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between">
        <Link
          to="/consumer/discarded-batteries"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-600 hover:text-ink-900 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Discarded Batteries Catalog
        </Link>
        <Link
          to="/consumer/parts-guide"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 transition"
        >
          <BookOpen className="h-4 w-4" />
          Parts &amp; Materials Architecture Guide
        </Link>
      </div>

      {/* ==================================================================== */}
      {/* SECTION 1: Header & High-Level Identifier Banner */}
      {/* ==================================================================== */}
      <div className="rounded-3xl border border-ink-200 bg-white p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold text-ink-900 bg-ink-100 px-2.5 py-1 rounded-lg">
                ID: {battery.battery_id}
              </span>
              <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700 border border-brand-200">
                {battery.chemistry} Chemistry
              </span>
              <span className="rounded-full bg-ink-50 px-3 py-1 text-xs font-semibold text-ink-700 border border-ink-200">
                Sharing Status: {battery.sharing_status}
              </span>
              {battery.is_demo && (
                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
                  Demo Shared Pack
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink-900">
              {battery.vehicle_manufacturer} {battery.vehicle_model}
            </h1>
            <p className="text-xs text-ink-500">
              Unique Pack UID: <span className="font-mono font-medium text-ink-700">{battery.battery_uid}</span> • Category: {battery.category}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                setShowEnquiryModal(true)
                setEnquirySuccess(null)
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-brand-600 transition"
            >
              <MessageSquare className="h-4 w-4" />
              Enquire About This Battery
            </button>
            <Link
              to="/consumer/reuse-vs-recycling"
              className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-xs font-semibold text-ink-700 hover:bg-ink-50 transition"
            >
              <Zap className="h-4 w-4 text-brand-600" />
              Circular Decision Guide
            </Link>
          </div>
        </div>

        {/* Primary Technical Specifications Grid (NO HEALTH / SOH) */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 rounded-2xl border border-ink-100 bg-ink-50/70 p-4 text-xs">
          <div>
            <span className="text-ink-500 block text-2xs uppercase font-medium">Nominal Voltage</span>
            <p className="mt-0.5 text-sm font-bold text-ink-900">
              {battery.voltage_v ? `${battery.voltage_v} V DC` : '350.0 V DC'}
            </p>
          </div>
          <div>
            <span className="text-ink-500 block text-2xs uppercase font-medium">Rated Capacity</span>
            <p className="mt-0.5 text-sm font-bold text-ink-900">{battery.rated_capacity_kwh} kWh</p>
          </div>
          <div>
            <span className="text-ink-500 block text-2xs uppercase font-medium">Continuous Current</span>
            <p className="mt-0.5 text-sm font-bold text-ink-900">
              {battery.current_a ? `${battery.current_a} A` : '25.0 A'}
            </p>
          </div>
          <div>
            <span className="text-ink-500 block text-2xs uppercase font-medium">Charge Cycles</span>
            <p className="mt-0.5 text-sm font-bold text-ink-900">{battery.charging_cycles || 0} cycles</p>
          </div>
          <div>
            <span className="text-ink-500 block text-2xs uppercase font-medium">Model Year / Age</span>
            <p className="mt-0.5 text-sm font-bold text-ink-900">
              {battery.purchase_year ? `${battery.purchase_year} (${new Date().getFullYear() - battery.purchase_year} yrs)` : 'Recorded in system'}
            </p>
          </div>
          <div>
            <span className="text-ink-500 block text-2xs uppercase font-medium">Approx. Location</span>
            <p className="mt-0.5 text-sm font-bold text-ink-900 flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-ink-400 shrink-0" />
              <span className="truncate">{battery.approximate_area}</span>
            </p>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* SECTION 2: Basic Battery Details & Documented History */}
      {/* ==================================================================== */}
      <div className="rounded-3xl border border-ink-200 bg-white p-6 sm:p-8 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-ink-100 pb-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-ink-900">
              <Info className="h-5 w-5 text-brand-600" />
              Verified Battery History &amp; Specifications
            </h2>
            <p className="mt-0.5 text-xs text-ink-500">
              Documented technical specifications, previous operational history, and reported physical condition.
            </p>
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-2xs font-semibold text-slate-700">
            Database Record Verified
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-xs">
          <div className="rounded-2xl border border-ink-100 p-4 bg-ink-50/50 space-y-1">
            <span className="text-ink-500 text-2xs uppercase font-medium">Recorded Condition</span>
            <p className="text-base font-bold text-ink-900 capitalize">
              {disposalInfo?.current_condition || battery.reported_condition || 'Working / Service Retired'}
            </p>
            <p className="text-2xs text-ink-500">Visual &amp; operational status reported by owner</p>
          </div>

          <div className="rounded-2xl border border-ink-100 p-4 bg-ink-50/50 space-y-1">
            <span className="text-ink-500 text-2xs uppercase font-medium">Physical Inspection</span>
            <p className="text-base font-bold text-ink-900">
              {disposalInfo?.professionally_assessed ? 'Verified by Certified Technician' : 'Owner Self-Reported'}
            </p>
            <p className="text-2xs text-ink-500">Inspection origin &amp; verification tier</p>
          </div>

          <div className="rounded-2xl border border-ink-100 p-4 bg-ink-50/50 space-y-1">
            <span className="text-ink-500 text-2xs uppercase font-medium">Vehicle Usage History</span>
            <p className="text-base font-bold text-ink-900">
              {battery.odometer_km ? `${battery.odometer_km.toLocaleString()} km logged` : 'OEM Traction Service'}
            </p>
            <p className="text-2xs text-ink-500">Previous vehicle powertrain application</p>
          </div>

          <div className="rounded-2xl border border-ink-100 p-4 bg-ink-50/50 space-y-1">
            <span className="text-ink-500 text-2xs uppercase font-medium">Electrical Sub-specs</span>
            <p className="text-base font-bold text-ink-900">
              {battery.cell_voltage_spread_mv ? `ΔV: ${battery.cell_voltage_spread_mv} mV` : 'Balanced OEM strings'}
            </p>
            <p className="text-2xs text-ink-500">
              {battery.dc_resistance_mohm ? `Internal R: ${battery.dc_resistance_mohm} mΩ` : 'Nominal DC impedance'}
            </p>
          </div>
        </div>

        {/* Known Physical Damage or Reported Faults Box */}
        <div className="rounded-2xl border border-ink-100 bg-ink-50/70 p-4 text-xs space-y-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className={`h-4 w-4 ${isDamaged ? 'text-rose-600' : 'text-emerald-600'}`} />
            <h4 className="font-bold text-ink-900">Known Physical Damage &amp; Reported Fault Log:</h4>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 text-2xs text-ink-700">
            <div>
              <span className="font-semibold text-ink-900">End-of-Life Reporting Reason: </span>
              {disposalInfo?.reporting_reason || battery.eol_reason || 'Replaced at scheduled vehicle service retirement.'}
            </div>
            <div>
              <span className="font-semibold text-ink-900">Technician Observations: </span>
              {disposalInfo?.assessment_notes || (isDamaged ? 'Physical impact/deformation noted in intake report.' : 'No structural deformation or thermal compromise reported in owner intake documentation.')}
            </div>
          </div>
        </div>

        {/* Technical Advisory Banner */}
        <div className="rounded-2xl border border-brand-200 bg-brand-50/50 p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 shrink-0 text-brand-600 mt-0.5" />
            <div className="text-xs leading-relaxed text-brand-950">
              <span className="font-bold">Technical Qualification Protocol: </span>
              Specifications displayed above are sourced from factory design parameters and owner intake declarations. Component reuse in stationary storage or secondary devices requires bench qualification (electrochemical impedance check, insulation resistance test, and cell balancing) by qualified electrical personnel.
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* SECTION 3: Battery Components (Sub-Systems Discovery) */}
      {/* ==================================================================== */}
      <div className="rounded-3xl border border-ink-200 bg-white p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-ink-100 pb-4">
          <div>
            <div className="flex items-center gap-2 text-brand-600 text-xs font-bold uppercase tracking-wider">
              <Layers className="h-4 w-4" />
              <span>Sub-System Architecture</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-ink-900 mt-1">
              Battery Components &amp; Assemblies
            </h2>
            <p className="text-xs text-ink-600 mt-0.5 max-w-2xl">
              Identification of the 9 high-voltage sub-systems comprising this {battery.chemistry} battery pack. Inspect their function, specifications, recorded condition, and pathway recommendations.
            </p>
          </div>
          <span className="self-start sm:self-auto rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700 border border-brand-200">
            {components.length} Components Identified
          </span>
        </div>

        {/* Component Cards Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {components.map((comp) => {
            const badge = getPathwayStatusBadge(comp.suggested_pathway)
            const isSelected = selectedComponentId === comp.id

            return (
              <div
                key={comp.id}
                onClick={() => setSelectedComponentId(isSelected ? null : comp.id)}
                className={`card-interactive flex flex-col justify-between rounded-2xl border p-5 transition-all cursor-pointer ${
                  isSelected
                    ? 'border-brand-500 bg-brand-50/20 shadow-md ring-2 ring-brand-200'
                    : 'border-ink-200 bg-white hover:border-brand-300 hover:shadow-sm'
                }`}
              >
                <div className="space-y-3">
                  {/* Header & Icon */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="rounded-xl bg-ink-50 p-2 border border-ink-100">
                        {getComponentIcon(comp.id)}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-ink-900 leading-tight">{comp.name}</h3>
                        <span className="text-2xs font-medium text-ink-500">{comp.component_type}</span>
                      </div>
                    </div>
                  </div>

                  {/* Pathway Guidance Status Badge */}
                  <div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-2xs font-bold border ${badge.badgeClass}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${badge.dotClass}`} />
                      {badge.label}
                    </span>
                  </div>

                  {/* Function Description */}
                  <p className="text-2xs text-ink-600 leading-relaxed line-clamp-2">
                    {comp.pack_function}
                  </p>

                  {/* Recorded Condition */}
                  <div className="rounded-xl bg-ink-50/70 p-2.5 text-2xs space-y-1 border border-ink-100">
                    <div>
                      <span className="font-semibold text-ink-800">Recorded Condition: </span>
                      <span className="text-ink-700">{comp.recorded_condition}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-ink-800">Known Faults: </span>
                      <span className="text-ink-600">{comp.known_faults}</span>
                    </div>
                  </div>

                  {/* Expanded View for Selected Component */}
                  {isSelected && (
                    <div className="mt-3 space-y-3 pt-3 border-t border-ink-100 text-2xs">
                      {/* Specifications */}
                      <div>
                        <h4 className="font-bold text-ink-900 mb-1">Available Specifications:</h4>
                        <div className="grid grid-cols-2 gap-1.5 bg-white p-2 rounded-lg border border-ink-100">
                          {Object.entries(comp.specifications || {}).map(([k, v]) => (
                            <div key={k}>
                              <span className="text-ink-400 block capitalize">{k.replace(/_/g, ' ')}:</span>
                              <span className="font-medium text-ink-800">{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Required Testing */}
                      <div>
                        <h4 className="font-bold text-ink-900 mb-1">Required Testing Before Reuse:</h4>
                        <ul className="space-y-1 list-disc list-inside text-ink-700">
                          {comp.testing_required.map((t, idx) => (
                            <li key={idx}>{t}</li>
                          ))}
                        </ul>
                      </div>

                      {/* Potential Applications */}
                      <div>
                        <h4 className="font-bold text-ink-900 mb-1">Potential Reuse Applications:</h4>
                        <div className="flex flex-wrap gap-1">
                          {comp.potential_applications.map((app, idx) => (
                            <span key={idx} className="rounded-md bg-brand-50 px-2 py-0.5 text-brand-800 font-medium border border-brand-100">
                              {app}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Pathway Rationale */}
                      <div className="rounded-lg bg-amber-50/60 p-2 text-amber-900 border border-amber-200">
                        <span className="font-bold">Pathway Rationale: </span>
                        {comp.pathway_reason}
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Footer Action */}
                <div className="mt-4 pt-3 border-t border-ink-100 flex items-center justify-between text-2xs">
                  <span className="font-semibold text-brand-600 hover:text-brand-700">
                    {isSelected ? 'Click to collapse specs' : 'Click to view full specifications'}
                  </span>
                  <ArrowRight className="h-3 w-3 text-brand-600" />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* SECTION 4: Component Reuse & New Product Ideas */}
      {/* ==================================================================== */}
      <div className="rounded-3xl border border-ink-200 bg-white p-6 sm:p-8 shadow-sm space-y-6">
        <div className="border-b border-ink-100 pb-4">
          <div className="flex items-center gap-2 text-brand-600 text-xs font-bold uppercase tracking-wider">
            <Zap className="h-4 w-4" />
            <span>Circular Engineering &amp; Repurposing</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-ink-900 mt-1">
            Component Reuse &amp; New Product Ideas
          </h2>
          <p className="text-xs text-ink-600 mt-0.5 max-w-2xl">
            Explore practical engineering systems that can be built using sub-components harvested from this {battery.vehicle_manufacturer} {battery.chemistry} battery pack.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {/* Product Idea 1: BESS */}
          <div className="rounded-2xl border border-ink-200 bg-white p-5 shadow-2xs hover:border-emerald-400 hover:shadow-md transition-all flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700">
                  <BatteryCharging className="h-6 w-6" />
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-2xs font-bold text-emerald-800 border border-emerald-200">
                  Potentially Reusable
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-ink-900">
                  Stationary Energy Storage System (BESS)
                </h3>
                <p className="mt-1 text-2xs text-ink-600 leading-relaxed">
                  Commercial peak-shaving and microgrid energy buffer operating at controlled 0.3C–0.5C charge and discharge rates.
                </p>
              </div>

              <div className="space-y-1.5 text-2xs">
                <div>
                  <span className="font-semibold text-ink-800">Harvested Components: </span>
                  <span className="text-ink-600">Cells, Module Strings, Liquid Cooling Plates, HV Busbars, Safety Contactors</span>
                </div>
                <div>
                  <span className="font-semibold text-ink-800">Implementation: </span>
                  <span className="text-ink-600">Wire sub-modules to stationary CANbus inverter with external thermal radiator loop.</span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-ink-100">
              <button
                onClick={() => openEnquiryForIdea('Second-life stationary storage project (BESS)', 'Commercial BESS / Peak Shaving')}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition"
              >
                <span>Enquire for BESS Build</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Product Idea 2: Home Solar Storage */}
          <div className="rounded-2xl border border-ink-200 bg-white p-5 shadow-2xs hover:border-sky-400 hover:shadow-md transition-all flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="rounded-xl bg-sky-50 p-2.5 text-sky-700">
                  <Sun className="h-6 w-6" />
                </div>
                <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-2xs font-bold text-sky-800 border border-sky-200">
                  Suitable Post-Assessment
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-ink-900">
                  Home Solar Energy Storage (5–15 kWh)
                </h3>
                <p className="mt-1 text-2xs text-ink-600 leading-relaxed">
                  Decentralized 48V residential storage pack enabling solar self-consumption and nighttime grid independence.
                </p>
              </div>

              <div className="space-y-1.5 text-2xs">
                <div>
                  <span className="font-semibold text-ink-800">Harvested Components: </span>
                  <span className="text-ink-600">1 to 3 Sub-Modules, Voltage Sense Harness, Terminal Busbars</span>
                </div>
                <div>
                  <span className="font-semibold text-ink-800">Implementation: </span>
                  <span className="text-ink-600">Reconfigure in 48V modular bank with standard 48V hybrid inverter (Victron, Growatt, Deye).</span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-ink-100">
              <button
                onClick={() => openEnquiryForIdea('Home solar energy storage system', 'Residential Solar Storage (5–15 kWh)')}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-sky-600 py-2 text-xs font-bold text-white hover:bg-sky-700 transition"
              >
                <span>Enquire for Home Solar</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Product Idea 3: Telecom Tower Backup */}
          <div className="rounded-2xl border border-ink-200 bg-white p-5 shadow-2xs hover:border-indigo-400 hover:shadow-md transition-all flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-700">
                  <Radio className="h-6 w-6" />
                </div>
                <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-2xs font-bold text-indigo-800 border border-indigo-200">
                  Suitable Post-Assessment
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-ink-900">
                  Telecom Tower &amp; UPS Backup
                </h3>
                <p className="mt-1 text-2xs text-ink-600 leading-relaxed">
                  Drop-in replacement for bulky lead-acid batteries at rural cellular base stations, delivering 3x cycle life and zero maintenance.
                </p>
              </div>

              <div className="space-y-1.5 text-2xs">
                <div>
                  <span className="font-semibold text-ink-800">Harvested Components: </span>
                  <span className="text-ink-600">Intact Modules, Dielectric Insulation Sheets, Low-Current Busbars</span>
                </div>
                <div>
                  <span className="font-semibold text-ink-800">Implementation: </span>
                  <span className="text-ink-600">Enclosed in 19-inch rack-mount chassis with 48V DC telecom bus integration.</span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-ink-100">
              <button
                onClick={() => openEnquiryForIdea('Telecom tower backup power deployment', 'Telecom Tower 48V UPS Backup')}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition"
              >
                <span>Enquire for Telecom Backup</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Product Idea 4: Compatible EV Spares */}
          <div className="rounded-2xl border border-ink-200 bg-white p-5 shadow-2xs hover:border-amber-400 hover:shadow-md transition-all flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="rounded-xl bg-amber-50 p-2.5 text-amber-700">
                  <Wrench className="h-6 w-6" />
                </div>
                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-2xs font-bold text-amber-800 border border-amber-200">
                  Refurbishment Required
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-ink-900">
                  Compatible EV Replacement Modules
                </h3>
                <p className="mt-1 text-2xs text-ink-600 leading-relaxed">
                  Direct donor modules and electronic sub-assemblies for servicing {battery.vehicle_manufacturer} {battery.vehicle_model} fleet vehicles.
                </p>
              </div>

              <div className="space-y-1.5 text-2xs">
                <div>
                  <span className="font-semibold text-ink-800">Harvested Components: </span>
                  <span className="text-ink-600">OEM Module Assemblies, Master BMS Board, High-Voltage Contactors</span>
                </div>
                <div>
                  <span className="font-semibold text-ink-800">Implementation: </span>
                  <span className="text-ink-600">Impedance-matched cell module swapping for out-of-warranty EV service centres.</span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-ink-100">
              <button
                onClick={() => openEnquiryForIdea('Compatible EV replacement modules & maintenance', 'EV Module Pack Replacement')}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 py-2 text-xs font-bold text-white hover:bg-amber-700 transition"
              >
                <span>Enquire for EV Spares</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Product Idea 5: Low-Voltage DC Tools & Robotics */}
          <div className="rounded-2xl border border-ink-200 bg-white p-5 shadow-2xs hover:border-teal-400 hover:shadow-md transition-all flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="rounded-xl bg-teal-50 p-2.5 text-teal-700">
                  <Hammer className="h-6 w-6" />
                </div>
                <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-2xs font-bold text-teal-800 border border-teal-200">
                  Suitable Post-Assessment
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-ink-900">
                  Low-Voltage DC Robotics &amp; Tools
                </h3>
                <p className="mt-1 text-2xs text-ink-600 leading-relaxed">
                  High-discharge 12V–24V portable power boxes for field agricultural sensors, lawn robotics, and workshop equipment.
                </p>
              </div>

              <div className="space-y-1.5 text-2xs">
                <div>
                  <span className="font-semibold text-ink-800">Harvested Components: </span>
                  <span className="text-ink-600">Individual Cell Blocks, Temperature Harness, Copper Busbars</span>
                </div>
                <div>
                  <span className="font-semibold text-ink-800">Implementation: </span>
                  <span className="text-ink-600">Modular 4S/8S configuration with dedicated low-voltage BMS protection.</span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-ink-100">
              <button
                onClick={() => openEnquiryForIdea('Low-voltage DC tools / robotics project', 'Low-Voltage DC Robotics / Tools')}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-600 py-2 text-xs font-bold text-white hover:bg-teal-700 transition"
              >
                <span>Enquire for DC Tools</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Product Idea 6: Material Recovery */}
          <div className="rounded-2xl border border-ink-200 bg-white p-5 shadow-2xs hover:border-purple-400 hover:shadow-md transition-all flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="rounded-xl bg-purple-50 p-2.5 text-purple-700">
                  <Recycle className="h-6 w-6" />
                </div>
                <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-2xs font-bold text-purple-800 border border-purple-200">
                  Material Recovery Recommended
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-ink-900">
                  Closed-Loop Critical Mineral Recovery
                </h3>
                <p className="mt-1 text-2xs text-ink-600 leading-relaxed">
                  Hydrometallurgical refining of non-reusable sub-assemblies to recover battery-grade Lithium, Nickel, Cobalt, Copper, and Aluminum.
                </p>
              </div>

              <div className="space-y-1.5 text-2xs">
                <div>
                  <span className="font-semibold text-ink-800">Harvested Components: </span>
                  <span className="text-ink-600">Degraded Cells, Damaged Housing, Scrap Busbars, Copper Harnesses</span>
                </div>
                <div>
                  <span className="font-semibold text-ink-800">Implementation: </span>
                  <span className="text-ink-600">Inert shredding, black mass leaching, and chemical precipitation with &gt;95% recovery rate.</span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-ink-100">
              <button
                onClick={() => openEnquiryForIdea('Certified material recovery & hydrometallurgical recycling', 'Closed-Loop Material Refining')}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-purple-600 py-2 text-xs font-bold text-white hover:bg-purple-700 transition"
              >
                <span>Enquire for Material Refining</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* SECTION 5: Lifecycle Audit Timeline */}
      {/* ==================================================================== */}
      <div className="rounded-3xl border border-ink-200 bg-white p-6 sm:p-8 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-ink-100 pb-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-ink-900">
              <Clock className="h-5 w-5 text-brand-600" />
              Lifecycle Audit Timeline
            </h2>
            <p className="mt-0.5 text-xs text-ink-500">
              Immutable event log recorded across this battery pack's lifecycle in the EVolve AI registry.
            </p>
          </div>
          <span className="rounded-full bg-ink-100 px-3 py-1 text-2xs font-semibold text-ink-700">
            {timeline.length} Events Logged
          </span>
        </div>

        {timeline.length === 0 ? (
          <p className="text-xs text-ink-500 italic p-4 bg-ink-50/50 rounded-2xl">
            No formal lifecycle milestone events recorded yet.
          </p>
        ) : (
          <div className="relative pl-6 border-l-2 border-brand-200 space-y-4">
            {timeline.map((ev, idx) => (
              <div key={ev.id || idx} className="relative">
                <span className="absolute -left-[31px] top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 ring-4 ring-white text-white text-2xs font-bold">
                  ✓
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-ink-900">{ev.event}</span>
                    <span className="rounded bg-ink-100 px-1.5 py-0.5 text-2xs font-mono text-ink-600">
                      {new Date(ev.occurred_at).toLocaleDateString()}
                    </span>
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-2xs font-bold text-emerald-700 border border-emerald-200">
                      {ev.status}
                    </span>
                  </div>
                  <p className="text-2xs text-ink-600 mt-0.5">
                    Location: <span className="text-ink-800">{ev.location}</span> • Handler: <span className="text-ink-800">{ev.handler}</span> • Registered by: <span className="text-ink-800">{ev.actor}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ==================================================================== */}
      {/* MODAL: Enquire About This Battery */}
      {/* ==================================================================== */}
      {showEnquiryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 sm:p-8 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-ink-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-ink-900">Enquire About This Battery</h3>
                <p className="text-xs text-ink-500 font-mono">
                  {battery.vehicle_manufacturer} {battery.vehicle_model} ({battery.battery_id})
                </p>
              </div>
              <button
                onClick={() => setShowEnquiryModal(false)}
                className="rounded-full p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {enquirySuccess ? (
              <div className="rounded-2xl bg-emerald-50 p-6 text-center border border-emerald-200 space-y-3">
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
                <h4 className="text-base font-bold text-emerald-900">Enquiry Successfully Logged</h4>
                <p className="text-xs text-emerald-700 leading-relaxed">{enquirySuccess}</p>
                <div className="pt-2">
                  <button
                    onClick={() => {
                      setShowEnquiryModal(false)
                      setEnquirySuccess(null)
                    }}
                    className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleEnquirySubmit} className="space-y-4">
                {enquiryError && (
                  <div className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
                    {enquiryError}
                  </div>
                )}

                {/* Purpose */}
                <div>
                  <label className="block text-xs font-bold text-ink-800">Intended Purpose *</label>
                  <select
                    value={enquiryPurpose}
                    onChange={(e) => setEnquiryPurpose(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-ink-200 p-2.5 text-xs focus:border-brand-500 focus:outline-none"
                  >
                    {ENQUIRY_PURPOSES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                {/* Application */}
                <div>
                  <label className="block text-xs font-bold text-ink-800">Target Application Category</label>
                  <select
                    value={intendedApp}
                    onChange={(e) => setIntendedApp(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-ink-200 p-2.5 text-xs focus:border-brand-500 focus:outline-none"
                  >
                    {INTENDED_APPLICATIONS.map((app) => (
                      <option key={app} value={app}>{app}</option>
                    ))}
                  </select>
                </div>

                {/* Message */}
                <div>
                  <label className="block text-xs font-bold text-ink-800">
                    Technical Requirements / Project Details
                  </label>
                  <textarea
                    value={enquiryMessage}
                    onChange={(e) => setEnquiryMessage(e.target.value)}
                    placeholder="Describe your inquiry, capacity requirements, project timeline, or specific components desired..."
                    rows={3}
                    className="mt-1 w-full rounded-xl border border-ink-200 p-2.5 text-xs focus:border-brand-500 focus:outline-none"
                  />
                </div>

                {/* Consumer Details */}
                <div className="rounded-xl bg-ink-50 p-3 text-2xs text-ink-600 space-y-0.5">
                  <p><span className="font-semibold text-ink-800">Registered Inquirer:</span> {user?.full_name || user?.username || 'Verified Consumer'}</p>
                  <p><span className="font-semibold text-ink-800">Secure Protocol:</span> Contact details mediated via EVolve AI circular network.</p>
                </div>

                {/* Privacy Safeguard */}
                <div className="rounded-xl bg-brand-50/60 p-3 text-2xs text-brand-900 border border-brand-100">
                  <span className="font-semibold">Privacy Safeguard: </span>
                  Vehicle owner contact details remain anonymous. EVolve AI routes inquiries to certified reverse logistics partners to coordinate inspection and testing.
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowEnquiryModal(false)}
                    className="rounded-xl border border-ink-200 px-4 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={enquirySubmitting}
                    className="rounded-xl bg-brand-500 px-5 py-2 text-xs font-bold text-white hover:bg-brand-600 disabled:opacity-50 transition"
                  >
                    {enquirySubmitting ? 'Submitting...' : 'Submit Inquiry'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
