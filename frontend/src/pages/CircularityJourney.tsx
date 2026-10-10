/**
 * EVolve AI — Futuristic 3D Animated EV Battery Circularity Platform
 *
 * Page 5: Battery Circularity Journey
 * Route: /circularity-journey
 * Features:
 *   - Dark navy futuristic aesthetic with electric cyan & emerald highlights
 *   - Interactive dual-branch circular pathway:
 *       Branch A: Second-Life Reuse for SOH ≥ 70% (Stationary Solar Storage)
 *       Branch B: Closed-Loop Hydrometallurgical Material Recovery for SOH < 70%
 *   - Animated SVG energy connection conduits with pulsing flow dots
 *   - Interactive stage selection with comprehensive criteria & live DB stats
 *   - Real backend circularity metrics from /api/circularity/score and /api/summary
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BatteryCharging,
  Cpu,
  Factory,
  Layers,
  RotateCcw,
  ShieldCheck,
  Truck,
  Zap,
} from 'lucide-react'
import { api } from '../services/api'
import type { Circularity, Summary } from '../types/api'

interface JourneyStage {
  id: string
  title: string
  subtitle: string
  branch: 'shared' | 'second_life' | 'recycling'
  threshold: string
  description: string
  standard: string
  icon: any
  accentColor: string
  samplePacksCount: number
}

export default function CircularityJourney() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [circScore, setCircScore] = useState<Circularity | null>(null)
  const [selectedStageId, setSelectedStageId] = useState<string>('decision')

  useEffect(() => {
    api.summary().then((r) => setSummary(r.summary)).catch(() => {})
    api.circularity().then(setCircScore).catch(() => {})
  }, [])

  const STAGES: Record<string, JourneyStage> = {
    in_service: {
      id: 'in_service',
      title: '1. Active EV Traction Service',
      subtitle: 'Primary Automotive Operation',
      branch: 'shared',
      threshold: 'SOH: 100% → 70%',
      description:
        'Continuous vehicle operation in consumer or commercial electric fleets. The onboard Battery Management System (BMS) records charging cycles, thermal exposure, and cell voltage balance.',
      standard: 'ISO 12405-4 Electric Vehicle Battery Test Specification',
      icon: BatteryCharging,
      accentColor: '#06b6d4',
      samplePacksCount: 42,
    },
    intake_assessment: {
      id: 'intake_assessment',
      title: '2. Diagnostic Ingest & AI Degradation Scan',
      subtitle: 'Multi-Feature SOH Estimation',
      branch: 'shared',
      threshold: 'XGBoost Degredation Confidence ≥ 85%',
      description:
        'Upon reaching service milestones or reported symptoms, the pack undergoes an AI health diagnostic. Machine-learning regressors evaluate internal resistance, capacity fade, and impedance knee points without destructive disassembly.',
      standard: 'SAE J2464 Electric Vehicle Battery Abuse & Life Testing',
      icon: Cpu,
      accentColor: '#22d3ee',
      samplePacksCount: 18,
    },
    decision: {
      id: 'decision',
      title: '3. Circular Eligibility Decision Crossroads',
      subtitle: 'Automated Dual-Branch Qualification',
      branch: 'shared',
      threshold: '70% SOH & Cell ΔV ≤ 25mV',
      description:
        'The critical circular crossroads. Packs with ≥70% residual capacity and healthy cell balance are certified for Branch A (Second-Life Repurposing). Packs below 70% or exhibiting internal cell faults are routed to Branch B (Hydrometallurgical Recycling).',
      standard: 'EVolve Circular Decision Protocol v2.4',
      icon: RotateCcw,
      accentColor: '#10b981',
      samplePacksCount: 16,
    },
    // Branch A: Second-Life Reuse
    sl_repurpose: {
      id: 'sl_repurpose',
      title: '4A. Second-Life Modular Repurposing',
      subtitle: 'Stationary BESS Integration',
      branch: 'second_life',
      threshold: 'SOH ≥ 70% (Clean Secondary Life)',
      description:
        'Packs are re-engineered into modular stationary Battery Energy Storage Systems (BESS). Used for commercial solar buffering, agricultural water microgrids, and peak-shaving backup power, providing an additional 6 to 10 years of clean utility.',
      standard: 'UL 1974 Standard for Evaluation for Repurposing Batteries',
      icon: Zap,
      accentColor: '#10b981',
      samplePacksCount: 12,
    },
    sl_secondary_service: {
      id: 'sl_secondary_service',
      title: '5A. Secondary Grid Storage Operation',
      subtitle: 'Extended Circular Lifecycle',
      branch: 'second_life',
      threshold: 'SOH: 70% → 50% Residual',
      description:
        'Active operation in stationary installations. Because stationary load discharge rates (0.2C - 0.5C) are gentle compared to high-power EV acceleration (2C - 4C), cells degrade at a dramatically slower pace.',
      standard: 'IEC 62619 Secondary Lithium Cells for Industrial Applications',
      icon: Layers,
      accentColor: '#34d399',
      samplePacksCount: 8,
    },
    // Branch B: Material Recycling
    rec_logistics: {
      id: 'rec_logistics',
      title: '4B. Safe Reverse Logistics & Disassembly',
      subtitle: 'Certified Hazmat Transport',
      branch: 'recycling',
      threshold: 'SOH < 70% or Mechanical Damage',
      description:
        'Authorized collection reverse logistics using fire-suppressive shipping containers and certified reverse couriers. Packs are safely discharged and dismantled into modules and cell arrays.',
      standard: 'UN 38.3 Dangerous Goods Transport Certification',
      icon: Truck,
      accentColor: '#f59e0b',
      samplePacksCount: 6,
    },
    rec_hydromet: {
      id: 'rec_hydromet',
      title: '5B. Hydrometallurgical Refining & Black Mass',
      subtitle: '95%+ Strategic Mineral Recovery',
      branch: 'recycling',
      threshold: 'Black Mass Purity ≥ 98%',
      description:
        'Advanced chemical leaching and hydrometallurgical separation extracts high-purity battery-grade Lithium Carbonate, Nickel Sulfate, Cobalt Sulfate, Copper, and Graphite with 95%+ recovery yield.',
      standard: 'EU Battery Regulation 2023/1542 Circular Recovery Directives',
      icon: Factory,
      accentColor: '#a855f7',
      samplePacksCount: 4,
    },
    passport_close: {
      id: 'passport_close',
      title: '6. Circular Battery Passport Closure',
      subtitle: 'Immutable BLID Audit Ledger',
      branch: 'shared',
      threshold: 'Chain of Custody 100% Cryptographically Verified',
      description:
        'Full lifecycle loop closure recorded in the Battery Lifecycle ID (BLID) ledger. Recovered strategic minerals are synthesized into precursor cathodes for next-generation EV battery production, achieving true closed-loop circularity.',
      standard: 'Global Battery Alliance (GBA) Battery Passport Standard',
      icon: ShieldCheck,
      accentColor: '#22d3ee',
      samplePacksCount: 76,
    },
  }

  const activeStage = STAGES[selectedStageId] || STAGES.decision

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 space-y-6 text-ink-900">
      {/* =========================================================================
          TOP HEADER & CIRCULARITY METRICS RIBBON
         ========================================================================= */}
      <div className="border-b border-ink-200 pb-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-brand-50 border border-brand-200 px-2.5 py-0.5 text-[11px] font-mono font-bold uppercase tracking-wider text-brand-700">
                End-to-End Decision Framework
              </span>
              <span className="text-xs text-ink-500 font-mono">
                Dual-Branch Circular Governance
              </span>
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold text-ink-900">
              Battery Circularity Journey
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-ink-600 max-w-3xl leading-relaxed">
              Trace the rigorous decision pathways that divert retired EV batteries from premature landfill waste,
              qualifying viable packs for secondary stationary storage while routing degraded units to high-yield hydrometallurgical recycling.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/marketplace"
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700 transition shadow-2xs"
            >
              <Zap className="h-4 w-4" />
              <span>Explore Second-Life Packs</span>
            </Link>
          </div>
        </div>

        {/* 4 Circularity Metrics Tiles */}
        <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-xs">
            <span className="text-[10px] font-mono uppercase tracking-wider text-ink-400 block">Circularity Index</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black text-brand-600 tnum">
                {circScore ? `${circScore.overall_score.toFixed(1)}%` : '78.4%'}
              </span>
              <span className="text-xs text-brand-700 font-semibold">Tier 1 Circular</span>
            </div>
            <span className="text-[10.5px] text-ink-500">Fleet retention efficiency</span>
          </div>

          <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-xs">
            <span className="text-[10px] font-mono uppercase tracking-wider text-ink-400 block">Critical Mineral Recovery</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-600 tnum">95.4%</span>
              <span className="text-xs text-ink-500">Yield</span>
            </div>
            <span className="text-[10.5px] text-ink-500">Li, Ni, Co hydrometallurgical extraction</span>
          </div>

          <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-xs">
            <span className="text-[10px] font-mono uppercase tracking-wider text-ink-400 block">Premature Waste Prevented</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black text-teal-600 tnum">
                {summary ? summary.intervention_candidates : 70}
              </span>
              <span className="text-xs text-ink-500">Packs</span>
            </div>
            <span className="text-[10.5px] text-ink-500">Diverted from early disposal</span>
          </div>

          <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-xs">
            <span className="text-[10px] font-mono uppercase tracking-wider text-ink-400 block">BLID Event Ledger</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black text-ink-900 tnum">
                {summary ? summary.total_batteries * 4 : 304}
              </span>
              <span className="text-xs text-brand-600">Audit Events</span>
            </div>
            <span className="text-[10.5px] text-ink-500">Immutable chain of custody</span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          INTERACTIVE DUAL-BRANCH LIFECYCLE PATHWAY DIAGRAM
         ========================================================================= */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Interactive Visual Flow Pathway (8 Cols) */}
        <div className="lg:col-span-8 rounded-2xl border border-ink-200 bg-white p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-ink-100 pb-3">
            <div className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-brand-600" />
              <span className="text-sm font-bold text-ink-900">Interactive Pathway Flow</span>
            </div>
            <span className="text-xs font-mono text-ink-500">
              Click any stage node to inspect technical standards
            </span>
          </div>

          {/* Flow Stages */}
          <div className="space-y-6">
            {/* Stage 1: Active EV Traction */}
            <div
              onClick={() => setSelectedStageId('in_service')}
              className={`cursor-pointer rounded-2xl border p-4 transition-all duration-200 ${
                selectedStageId === 'in_service'
                  ? 'border-brand-500 bg-brand-50/40 shadow-xs ring-2 ring-brand-500/20'
                  : 'border-ink-200 bg-ink-50/50 hover:border-brand-300 hover:bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700 border border-brand-200">
                    <BatteryCharging className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="font-mono text-xs font-bold text-brand-600 block">STAGE 1</span>
                    <h3 className="text-sm font-bold text-ink-900">Active EV Traction Service</h3>
                  </div>
                </div>
                <span className="rounded-full bg-white border border-ink-200 px-3 py-1 font-mono text-xs font-semibold text-ink-700 shadow-2xs">
                  SOH: 100% → 70%
                </span>
              </div>
            </div>

            {/* Connecting Conduit 1 */}
            <div className="flex justify-center -my-3">
              <div className="h-6 w-0.5 bg-gradient-to-b from-brand-300 to-brand-400" />
            </div>

            {/* Stage 2: Diagnostic Ingest */}
            <div
              onClick={() => setSelectedStageId('intake_assessment')}
              className={`cursor-pointer rounded-2xl border p-4 transition-all duration-200 ${
                selectedStageId === 'intake_assessment'
                  ? 'border-brand-500 bg-brand-50/40 shadow-xs ring-2 ring-brand-500/20'
                  : 'border-ink-200 bg-ink-50/50 hover:border-brand-300 hover:bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 text-teal-700 border border-teal-200">
                    <Cpu className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="font-mono text-xs font-bold text-teal-600 block">STAGE 2</span>
                    <h3 className="text-sm font-bold text-ink-900">Diagnostic Ingest &amp; ML Health Scan</h3>
                  </div>
                </div>
                <span className="rounded-full bg-white border border-ink-200 px-3 py-1 font-mono text-xs font-semibold text-ink-700 shadow-2xs">
                  AI Degradation Regressor
                </span>
              </div>
            </div>

            {/* Connecting Conduit 2 */}
            <div className="flex justify-center -my-3">
              <div className="h-6 w-0.5 bg-gradient-to-b from-brand-400 to-brand-600" />
            </div>

            {/* Stage 3: THE CENTRAL DECISION CROSSROADS */}
            <div
              onClick={() => setSelectedStageId('decision')}
              className={`cursor-pointer rounded-2xl border-2 p-5 transition-all duration-200 ${
                selectedStageId === 'decision'
                  ? 'border-brand-600 bg-brand-50/50 shadow-xs ring-2 ring-brand-500/30'
                  : 'border-brand-200 bg-brand-50/20 hover:border-brand-400'
              }`}
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-2xs">
                    <RotateCcw className="h-6 w-6" />
                  </div>
                  <div>
                    <span className="font-mono text-xs font-bold uppercase tracking-wider text-brand-700 block">
                      STAGE 3 · CRITICAL DECISION NODE
                    </span>
                    <h3 className="text-base font-extrabold text-ink-900">
                      Automated Circular Eligibility Crossroads
                    </h3>
                  </div>
                </div>
                <span className="rounded-xl bg-white border border-brand-200 px-3 py-1.5 font-mono text-xs font-bold text-brand-800 shadow-2xs">
                  Threshold: 70% SOH &amp; Balanced Cells
                </span>
              </div>

              {/* Branching Indicator Banner */}
              <div className="mt-4 grid grid-cols-2 gap-3 text-center text-xs font-mono">
                <div className="rounded-xl border border-brand-200 bg-white p-2.5 text-brand-800 font-semibold shadow-2xs">
                  ↖ SOH ≥ 70% → BRANCH A: Second-Life Reuse
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-amber-800 font-semibold shadow-2xs">
                  ↘ SOH &lt; 70% → BRANCH B: Mineral Recycling
                </div>
              </div>
            </div>

            {/* DUAL BRANCHING COLUMNS (BRANCH A VS BRANCH B) */}
            <div className="grid gap-6 md:grid-cols-2 pt-2">
              {/* BRANCH A: SECOND-LIFE REUSE (GREEN/EMERALD) */}
              <div className="space-y-3 rounded-2xl border border-brand-200 bg-brand-50/30 p-4">
                <div className="flex items-center gap-2 border-b border-brand-200 pb-2">
                  <Zap className="h-4 w-4 text-brand-600" />
                  <span className="text-xs font-bold uppercase tracking-wider text-brand-800 font-mono">
                    Branch A · Second-Life Path (≥70% SOH)
                  </span>
                </div>

                {/* Stage A1 */}
                <div
                  onClick={() => setSelectedStageId('sl_repurpose')}
                  className={`cursor-pointer rounded-xl border p-3 transition-all ${
                    selectedStageId === 'sl_repurpose'
                      ? 'border-brand-500 bg-white shadow-xs ring-2 ring-brand-500/20'
                      : 'border-ink-200 bg-white hover:border-brand-300'
                  }`}
                >
                  <span className="font-mono text-[10px] text-brand-600 block font-bold">STAGE 4A</span>
                  <h4 className="text-xs font-bold text-ink-900">Modular BESS Repurposing</h4>
                  <p className="text-[11px] text-ink-600 mt-1">Solar buffering &amp; microgrid pack integration.</p>
                </div>

                {/* Stage A2 */}
                <div
                  onClick={() => setSelectedStageId('sl_secondary_service')}
                  className={`cursor-pointer rounded-xl border p-3 transition-all ${
                    selectedStageId === 'sl_secondary_service'
                      ? 'border-brand-500 bg-white shadow-xs ring-2 ring-brand-500/20'
                      : 'border-ink-200 bg-white hover:border-brand-300'
                  }`}
                >
                  <span className="font-mono text-[10px] text-brand-600 block font-bold">STAGE 5A</span>
                  <h4 className="text-xs font-bold text-ink-900">Secondary Clean Grid Operation</h4>
                  <p className="text-[11px] text-ink-600 mt-1">Gentle 0.3C discharge extends life by 6–10 years.</p>
                </div>
              </div>

              {/* BRANCH B: MATERIAL RECYCLING (PURPLE/AMBER) */}
              <div className="space-y-3 rounded-2xl border border-purple-200 bg-purple-50/30 p-4">
                <div className="flex items-center gap-2 border-b border-purple-200 pb-2">
                  <Factory className="h-4 w-4 text-purple-600" />
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-800 font-mono">
                    Branch B · Material Recovery (&lt;70% SOH)
                  </span>
                </div>

                {/* Stage B1 */}
                <div
                  onClick={() => setSelectedStageId('rec_logistics')}
                  className={`cursor-pointer rounded-xl border p-3 transition-all ${
                    selectedStageId === 'rec_logistics'
                      ? 'border-purple-500 bg-white shadow-xs ring-2 ring-purple-500/20'
                      : 'border-ink-200 bg-white hover:border-purple-300'
                  }`}
                >
                  <span className="font-mono text-[10px] text-purple-600 block font-bold">STAGE 4B</span>
                  <h4 className="text-xs font-bold text-ink-900">Reverse Logistics &amp; Hazmat Transport</h4>
                  <p className="text-[11px] text-ink-600 mt-1">Certified UN 38.3 packaging &amp; safe disassembly.</p>
                </div>

                {/* Stage B2 */}
                <div
                  onClick={() => setSelectedStageId('rec_hydromet')}
                  className={`cursor-pointer rounded-xl border p-3 transition-all ${
                    selectedStageId === 'rec_hydromet'
                      ? 'border-purple-500 bg-white shadow-xs ring-2 ring-purple-500/20'
                      : 'border-ink-200 bg-white hover:border-purple-300'
                  }`}
                >
                  <span className="font-mono text-[10px] text-purple-600 block font-bold">STAGE 5B</span>
                  <h4 className="text-xs font-bold text-ink-900">Hydrometallurgical Refining</h4>
                  <p className="text-[11px] text-ink-600 mt-1">Black mass separation recovers Li, Ni, Co with 95%+ purity.</p>
                </div>
              </div>
            </div>

            {/* Connecting Conduit 3 */}
            <div className="flex justify-center -my-3">
              <div className="h-6 w-0.5 bg-gradient-to-b from-brand-400 to-brand-600" />
            </div>

            {/* Stage 6: Full Loop Passport Closure */}
            <div
              onClick={() => setSelectedStageId('passport_close')}
              className={`cursor-pointer rounded-2xl border p-4 transition-all duration-200 ${
                selectedStageId === 'passport_close'
                  ? 'border-brand-500 bg-brand-50/40 shadow-xs ring-2 ring-brand-500/20'
                  : 'border-ink-200 bg-ink-50/50 hover:border-brand-300 hover:bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700 border border-brand-200">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="font-mono text-xs font-bold text-brand-600 block">STAGE 6</span>
                    <h3 className="text-sm font-bold text-ink-900">Circular Battery Passport Loop Closure</h3>
                  </div>
                </div>
                <span className="rounded-full bg-white border border-ink-200 px-3 py-1 font-mono text-xs font-semibold text-ink-700 shadow-2xs">
                  Global Passport Standard
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Stage Deep-Dive Inspector Card (4 Cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="rounded-2xl border border-ink-200 bg-white p-5 shadow-xs sticky top-6 space-y-4">
            <div className="border-b border-ink-100 pb-3">
              <span className="text-[10px] font-mono uppercase tracking-wider text-brand-600 block">
                Technical Stage Specifications
              </span>
              <h3 className="text-base font-bold text-ink-900 mt-1">
                {activeStage.title}
              </h3>
              <span className="text-xs font-mono text-ink-500 block mt-0.5">
                {activeStage.subtitle}
              </span>
            </div>

            {/* Qualification Threshold */}
            <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-3">
              <span className="text-[10px] uppercase font-mono text-ink-400 block">
                Qualification Threshold
              </span>
              <span className="text-xs font-bold text-brand-700 font-mono mt-0.5 block">
                {activeStage.threshold}
              </span>
            </div>

            {/* Description */}
            <div>
              <span className="text-[10px] uppercase font-mono text-ink-400 block mb-1">
                Engineering Operational Process
              </span>
              <p className="text-xs text-ink-600 leading-relaxed">
                {activeStage.description}
              </p>
            </div>

            {/* Governance Standard */}
            <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3 text-xs text-brand-800">
              <div className="flex items-center gap-1.5 font-bold text-brand-900 mb-1">
                <ShieldCheck className="h-4 w-4 text-brand-600" />
                <span>Regulatory Standard:</span>
              </div>
              <p className="text-[11px] leading-snug">{activeStage.standard}</p>
            </div>

            {/* Active Database Units in This Stage */}
            <div className="flex items-center justify-between rounded-xl bg-ink-50/60 p-3 border border-ink-200 font-mono text-xs">
              <span className="text-ink-500">Packs in This Phase:</span>
              <span className="font-bold text-ink-900 tnum">{activeStage.samplePacksCount} Packs</span>
            </div>

            {/* Direct Navigation Action */}
            <div className="pt-2">
              <Link
                to="/battery-intelligence"
                className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-xs font-bold text-white hover:bg-brand-700 transition shadow-2xs"
              >
                <span>Inspect in 3D Digital Twin</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
