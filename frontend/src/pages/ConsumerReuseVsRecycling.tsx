import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Box,
  CheckCircle2,
  Cpu,
  Layers,
  Recycle,
  ShieldAlert,
  Sparkles,
  Thermometer,
  Zap,
} from 'lucide-react'
import { getPathwayStatusBadge, type PathwayGuidanceStatus } from '../utils/consumerComponents'

type ComponentKind = 'cells' | 'bms' | 'cooling' | 'busbars' | 'enclosure' | 'contactors'
type ConditionState = 'INTACT' | 'REFURBISHABLE' | 'DAMAGED' | 'UNASSESSED'
type TargetApplication = 'BESS' | 'SOLAR' | 'TELECOM' | 'EV_SPARES' | 'RECYCLING'

interface EvaluationResult {
  status: PathwayGuidanceStatus
  title: string
  reason: string
  requiredTesting: string[]
  recommendedAction: string
}

export default function ConsumerReuseVsRecycling() {
  // Interactive Evaluation State
  const [componentKind, setComponentKind] = useState<ComponentKind>('cells')
  const [conditionState, setConditionState] = useState<ConditionState>('INTACT')
  const [targetApp, setTargetApp] = useState<TargetApplication>('SOLAR')

  const evaluatePathway = (): EvaluationResult => {
    if (conditionState === 'DAMAGED') {
      return {
        status: 'Recycling or material recovery recommended',
        title: 'Closed-Loop Material Recovery Recommended',
        reason:
          'Documented mechanical rupture, deformation, or thermal event compromises high-voltage insulation and internal integrity. Re-energization presents fire or short-circuit hazards. Direct hydrometallurgical recycling recovers strategic metals with >95% purity.',
        requiredTesting: [
          'Safety containment & thermal isolation verification',
          'Depleted voltage discharge check before mechanical shredding',
        ],
        recommendedAction: 'Route component to certified hydrometallurgical recycling facility.',
      }
    }

    if (conditionState === 'UNASSESSED') {
      return {
        status: 'Insufficient information to determine a suitable pathway',
        title: 'Diagnostic Intake Testing Required',
        reason:
          'Without documented physical intake and bench qualification data, high-voltage component safety cannot be verified. Premature integration into secondary power systems is not permitted.',
        requiredTesting: [
          'Visual inspection for casing micro-punctures and seal degradation',
          'High-voltage DC isolation resistance testing (> 100 MΩ)',
          'Bench open-circuit voltage (OCV) stability check',
        ],
        recommendedAction: 'Schedule laboratory intake assessment with certified circular testing partner.',
      }
    }

    if (conditionState === 'REFURBISHABLE') {
      return {
        status: 'Repair or refurbishment may be required',
        title: 'Refurbishment & Reconfiguration Required',
        reason:
          'The component retains functional viability but exhibits firmware lockout (BMS immobilizer), contactor oxidation, or inter-cell tab wear requiring re-soldering, contact resurfacing, or protocol gateway integration.',
        requiredTesting: [
          'CANbus communication protocol handshake and DTC scan',
          'Micro-ohmmeter contact resistance check (< 50 µΩ)',
          'Weld tab ultrasonic bond verification',
        ],
        recommendedAction: 'Engage a certified battery refurbisher to update firmware or replace worn interconnects.',
      }
    }

    // conditionState === 'INTACT'
    if (targetApp === 'RECYCLING') {
      return {
        status: 'Recycling or material recovery recommended',
        title: 'Voluntary Closed-Loop Mineral Refining',
        reason:
          'While mechanically intact, direct material recovery yields battery-grade Lithium, Cobalt, and Nickel for domestic battery manufacturing supply chains.',
        requiredTesting: ['Pre-shred chemical analysis'],
        recommendedAction: 'Transfer to partner hydrometallurgical refinery.',
      }
    }

    if (componentKind === 'cells' || componentKind === 'busbars' || componentKind === 'contactors') {
      return {
        status: 'Potentially reusable pending assessment',
        title: 'Prime Candidate for Second-Life Energy Systems',
        reason:
          'The sub-system exhibits intact physical seals and nominal operational history. Stationary energy storage operates at gentle <0.5C discharge rates, enabling 5–10 years of reliable secondary service while avoiding 80% of embodied manufacturing carbon.',
        requiredTesting: [
          'Electrochemical Impedance Spectroscopy (EIS)',
          'Module delta-V voltage spread balance verification (< 25 mV)',
          'Capacity retention C/3 discharge cycle benchmark',
        ],
        recommendedAction: 'Proceed with bench balancing before wiring into secondary battery storage bank.',
      }
    }

    return {
      status: 'Suitable for a specified application following assessment',
      title: 'Suitable for Specified Secondary Application',
      reason:
        'Mechanically sound enclosures, cooling plates, or wiring harnesses can be directly integrated into stationary battery racks or compatible equipment without modifying electrochemical cells.',
      requiredTesting: [
        'Liquid cooling plate pressure decay leak check (2.0 bar pneumatic)',
        'Enclosure perimeter gasket IP67 hermeticity vacuum test',
      ],
      recommendedAction: 'Qualified for integration into stationary storage enclosures or solar balance-of-system hardware.',
    }
  }

  const result = evaluatePathway()
  const badgeInfo = getPathwayStatusBadge(result.status)

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 space-y-6">
      {/* Top Header */}
      <div>
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-600">
          <Recycle className="h-4 w-4" />
          <span>Circular Engineering Framework</span>
        </div>
        <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-ink-900">
          Component Reuse vs. Recycling Decision Guide
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-ink-600 max-w-3xl leading-relaxed">
          Evaluate when high-voltage EV battery sub-assemblies can be repurposed into secondary stationary products versus when they must enter closed-loop hydrometallurgical recycling.
        </p>
      </div>

      {/* Interactive Pathway Evaluator Widget */}
      <div className="rounded-3xl border-2 border-brand-200 bg-white p-6 sm:p-8 shadow-sm space-y-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-700">
            <Sparkles className="h-4 w-4 text-brand-600" />
            <span>Interactive Circular Pathway Evaluator</span>
          </div>
          <h2 className="mt-1 text-lg sm:text-xl font-bold text-ink-900">
            Determine Component Pathway Guidance Status
          </h2>
          <p className="text-xs text-ink-600">
            Select a battery sub-system, its documented physical condition, and your intended application to identify the recommended circular engineering route.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Controls */}
          <div className="space-y-4">
            {/* 1. Component Category */}
            <div>
              <label className="block text-xs font-bold text-ink-800">
                1. Select Battery Sub-system
              </label>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { id: 'cells', label: 'Cells & Modules', icon: <Layers className="h-3.5 w-3.5" /> },
                  { id: 'bms', label: 'BMS Controller', icon: <Cpu className="h-3.5 w-3.5" /> },
                  { id: 'cooling', label: 'Cooling Plates', icon: <Thermometer className="h-3.5 w-3.5" /> },
                  { id: 'busbars', label: 'Busbars & Relays', icon: <Zap className="h-3.5 w-3.5" /> },
                  { id: 'enclosure', label: 'Pack Housing', icon: <Box className="h-3.5 w-3.5" /> },
                  { id: 'contactors', label: 'Safety Disconnects', icon: <ShieldAlert className="h-3.5 w-3.5" /> },
                ].map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setComponentKind(c.id as ComponentKind)}
                    className={`flex items-center gap-1.5 rounded-xl p-2.5 text-xs font-semibold transition border text-left ${
                      componentKind === c.id
                        ? 'border-brand-500 bg-brand-50 text-brand-900 shadow-2xs'
                        : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'
                    }`}
                  >
                    {c.icon}
                    <span className="truncate">{c.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Recorded Physical Condition */}
            <div>
              <label className="block text-xs font-bold text-ink-800">
                2. Recorded Physical &amp; Operational Condition
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {[
                  { id: 'INTACT', label: 'Intact & Undamaged', sub: 'No leaks, casing sound' },
                  { id: 'REFURBISHABLE', label: 'Minor Fault / Firmware Lock', sub: 'Needs re-flashing or cleaning' },
                  { id: 'DAMAGED', label: 'Punctured / Swollen / Faulty', sub: 'Mechanical or thermal breach' },
                  { id: 'UNASSESSED', label: 'Unassessed / Unknown', sub: 'Awaiting lab inspection' },
                ].map((cond) => (
                  <button
                    key={cond.id}
                    type="button"
                    onClick={() => setConditionState(cond.id as ConditionState)}
                    className={`rounded-xl p-2.5 text-xs font-semibold transition border text-left ${
                      conditionState === cond.id
                        ? 'border-brand-500 bg-brand-50 text-brand-900 shadow-2xs'
                        : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'
                    }`}
                  >
                    <span className="block font-bold">{cond.label}</span>
                    <span className="block text-2xs text-ink-500 font-normal">{cond.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Intended Application */}
            <div>
              <label className="block text-xs font-bold text-ink-800">
                3. Intended Target Application
              </label>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { id: 'SOLAR', label: 'Home Solar (48V)' },
                  { id: 'BESS', label: 'Commercial BESS' },
                  { id: 'TELECOM', label: 'Telecom UPS Backup' },
                  { id: 'EV_SPARES', label: 'EV Spare Donor' },
                  { id: 'RECYCLING', label: 'Mineral Refining' },
                ].map((app) => (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => setTargetApp(app.id as TargetApplication)}
                    className={`rounded-xl p-2 text-xs font-semibold transition border text-center ${
                      targetApp === app.id
                        ? 'border-brand-500 bg-brand-50 text-brand-900 shadow-2xs'
                        : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'
                    }`}
                  >
                    {app.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Dynamic Decision Result Card */}
          <div className="flex flex-col justify-between rounded-2xl border border-ink-200 bg-ink-50/60 p-5 space-y-4">
            <div className="space-y-3">
              <div>
                <span className="text-2xs font-bold uppercase tracking-wider text-ink-500">
                  Calculated Pathway Guidance Status
                </span>
                <div className="mt-1">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border ${badgeInfo.badgeClass}`}>
                    <span className={`h-2 w-2 rounded-full ${badgeInfo.dotClass}`} />
                    {badgeInfo.label}
                  </span>
                </div>
              </div>

              <div>
                <h3 className="text-base font-bold text-ink-900">{result.title}</h3>
                <p className="mt-1 text-xs text-ink-700 leading-relaxed">{result.reason}</p>
              </div>

              <div className="rounded-xl bg-white p-3 border border-ink-100 text-2xs space-y-1.5">
                <span className="font-bold text-ink-900 block">Required Laboratory Testing:</span>
                <ul className="space-y-1 list-disc list-inside text-ink-700">
                  {result.requiredTesting.map((test, i) => (
                    <li key={i}>{test}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl bg-brand-50/70 p-3 border border-brand-100 text-2xs text-brand-900">
                <span className="font-bold">Recommended Engineering Action: </span>
                {result.recommendedAction}
              </div>
            </div>

            <div className="pt-3 border-t border-ink-200">
              <Link
                to="/consumer/discarded-batteries"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink-900 py-2.5 text-xs font-bold text-white hover:bg-ink-800 transition"
              >
                <span>Browse Matching Batteries in Catalog</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Side-by-Side Deep Architectural Comparison */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Pathway 1: Component Reuse & Second-Life Repurposing */}
        <div className="flex flex-col justify-between rounded-3xl border border-emerald-200 bg-white p-6 sm:p-7 shadow-sm space-y-5">
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 text-emerald-700">
              <Zap className="h-6 w-6" />
              <h2 className="text-lg font-bold text-ink-900">Component Reuse &amp; Second-Life Repurposing</h2>
            </div>
            <p className="text-xs text-ink-600 leading-relaxed">
              Stationary storage does not experience high road vibration, extreme vehicle accelerations, or tight spatial limits. Intact components safely extend their service life by 5 to 10 additional years.
            </p>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                Technical Suitability Criteria:
              </h3>
              <ul className="mt-2 space-y-1.5 text-xs text-ink-700">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                  <span>Enclosure maintains IP67 hermetic seal without impact puncture or weld tearing.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                  <span>Cell strings exhibit tight cell-to-cell delta-V balance (&lt; 25 mV under load).</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                  <span>Liquid cooling plates pass 2.0 bar pneumatic pressure decay leak verification.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                  <span>High-voltage copper busbars show no terminal galling, oxidation, or overheating burns.</span>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                Primary Second-Life Systems:
              </h3>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-emerald-50/70 p-3 text-emerald-900 border border-emerald-100">
                  <span className="font-bold block">Solar Home Backup</span>
                  <span className="text-2xs opacity-80">48V modular bank storing rooftop solar energy.</span>
                </div>
                <div className="rounded-xl bg-emerald-50/70 p-3 text-emerald-900 border border-emerald-100">
                  <span className="font-bold block">Commercial BESS</span>
                  <span className="text-2xs opacity-80">Peak-shaving buffer for light industrial facilities.</span>
                </div>
                <div className="rounded-xl bg-emerald-50/70 p-3 text-emerald-900 border border-emerald-100">
                  <span className="font-bold block">Telecom Tower Backup</span>
                  <span className="text-2xs opacity-80">Reliable DC power replacing legacy VRLA lead-acid.</span>
                </div>
                <div className="rounded-xl bg-emerald-50/70 p-3 text-emerald-900 border border-emerald-100">
                  <span className="font-bold block">Low-Voltage Tools</span>
                  <span className="text-2xs opacity-80">12V–24V portable packs for robotics &amp; field equipment.</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-ink-100">
            <Link
              to="/consumer/discarded-batteries?status=APPROVED_FOR_SECOND_LIFE"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 transition"
            >
              Browse Second-Life Eligible Packs
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Pathway 2: Closed-Loop Hydrometallurgical Recycling */}
        <div className="flex flex-col justify-between rounded-3xl border border-purple-200 bg-white p-6 sm:p-7 shadow-sm space-y-5">
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 text-purple-700">
              <Recycle className="h-6 w-6" />
              <h2 className="text-lg font-bold text-ink-900">Hydrometallurgical Mineral Recovery</h2>
            </div>
            <p className="text-xs text-ink-600 leading-relaxed">
              When sub-assemblies experience physical rupture, severe deformation, or uncorrectable electrical defects, closed-loop hydrometallurgical refining recovers critical minerals with &gt;95% purity.
            </p>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-purple-800">
                When Recycling Is Mandatory:
              </h3>
              <ul className="mt-2 space-y-1.5 text-xs text-ink-700">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-purple-600 mt-0.5" />
                  <span>Physical collision impact, pack breach, or cell pouch swelling detected.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-purple-600 mt-0.5" />
                  <span>Internal insulation breakdown or dielectric barrier mechanical rupture.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-purple-600 mt-0.5" />
                  <span>Non-reusable structural housing fragments, sheared busbars, and harness clippings.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-purple-600 mt-0.5" />
                  <span>High-cobalt NMC / NCA chemistries reaching end of life where mineral yield is optimal.</span>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-purple-800">
                Critical Material Yields:
              </h3>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-purple-50/70 p-3 text-purple-900 border border-purple-100">
                  <span className="font-bold block">&gt; 95% Lithium Yield</span>
                  <span className="text-2xs opacity-80">Precipitated as battery-grade Li2CO3 crystals.</span>
                </div>
                <div className="rounded-xl bg-purple-50/70 p-3 text-purple-900 border border-purple-100">
                  <span className="font-bold block">98% Nickel &amp; Cobalt</span>
                  <span className="text-2xs opacity-80">Purified into chemical precursor sulfates.</span>
                </div>
                <div className="rounded-xl bg-purple-50/70 p-3 text-purple-900 border border-purple-100">
                  <span className="font-bold block">70% CO2 Reduction</span>
                  <span className="text-2xs opacity-80">Versus mining virgin ore from rock deposits.</span>
                </div>
                <div className="rounded-xl bg-purple-50/70 p-3 text-purple-900 border border-purple-100">
                  <span className="font-bold block">Zero Landfill Waste</span>
                  <span className="text-2xs opacity-80">Complete recovery of pure Copper &amp; Aluminum.</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-ink-100">
            <Link
              to="/consumer/discarded-batteries?status=APPROVED_FOR_RECYCLING"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 py-2.5 text-xs font-bold text-white hover:bg-purple-700 transition"
            >
              Browse Recycling Candidates
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Safety Mandatory Disclaimer */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
          <div className="text-xs leading-relaxed text-amber-950">
            <span className="font-bold">Certified Qualification Protocol: </span>
            The guidance provided above represents engineering decision-support rules. Any high-voltage battery disassembly, sub-module isolation, and commissioning must strictly be conducted by qualified technicians adhering to certified electrical isolation (NFPA 70E / OSHA) and local hazardous material handling standards.
          </div>
        </div>
      </div>
    </div>
  )
}
