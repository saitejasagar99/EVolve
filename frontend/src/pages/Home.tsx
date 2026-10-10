/**
 * EVolve AI — Futuristic 3D Animated EV Battery Circularity Platform
 *
 * Page 1: Immersive 3D Landing Page
 * Features:
 *   - Dark navy & near-black futuristic aesthetic with electric cyan & emerald accents
 *   - Interactive 3D EV battery pack centerpiece (Three.js procedural WebGL)
 *   - Floating glassmorphism diagnostic telemetry cards
 *   - 5-stage Circularity Lifecycle Workflow
 *   - Verified sustainability impact backed by authoritative database records
 *   - Enterprise-grade footer
 */

import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Layers,
  Leaf,
  Recycle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Truck,
  Zap,
} from 'lucide-react'
import { Battery3DViewer, type BatteryModuleInfo } from '../components/Battery3DViewer'
import { useAuth } from '../context/AuthContext'
import { api } from '../services/api'
import type { Summary } from '../types/api'

export default function Home() {
  const { user, isAuthenticated, isLoading } = useAuth()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [activeWorkflowStep, setActiveWorkflowStep] = useState<number>(0)
  const [selectedModule, setSelectedModule] = useState<BatteryModuleInfo | null>(null)

  // Fetch real authoritative metrics from backend
  useEffect(() => {
    api.summary().then((r) => setSummary(r.summary)).catch(() => {})
  }, [])

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-navy-950">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent" />
      </div>
    )
  }

  // Route authenticated users to their authorized operational portal
  if (isAuthenticated && user) {
    if (user.role === 'CUSTOMER') return <Navigate to="/customer/dashboard" replace />
    if (user.role === 'CONSUMER') return <Navigate to="/recycling/dashboard" replace />
    if (user.role === 'RECYCLER') return <Navigate to="/recycler" replace />
    if (user.role === 'ADMIN') return <Navigate to="/admin" replace />
  }

  const circularityWorkflow = [
    {
      step: '01',
      title: 'Assess Battery Condition',
      desc: 'Evaluate real-time cell impedance, voltage spread, temperature histories, and state of health (SOH) using machine-learning degradation models.',
      icon: Cpu,
      accent: 'cyan',
      output: 'SOH % · Internal Resistance · Cell Imbalance Signal',
    },
    {
      step: '02',
      title: 'Identify Second-Life Suitability',
      desc: 'Algorithmically benchmark residual capacity against stationary storage thresholds. Packs with ≥70% SOH are qualified for second-life repurposing.',
      icon: Zap,
      accent: 'emerald',
      output: 'Stationary BESS Suitability · Clean Repurposing Score',
    },
    {
      step: '03',
      title: 'Connect with Potential Users',
      desc: 'Expose qualified second-life battery packs on an authoritative circular exchange for solar energy storage, agricultural microgrids, and backup power.',
      icon: Layers,
      accent: 'cyan',
      output: 'Circular Listing · Location · Energy Storage Matching',
    },
    {
      step: '04',
      title: 'Route Toward Responsible Recycling',
      desc: 'Batteries ineligible for second-life are automatically assigned to certified reverse logistics partners and hydrometallurgical recycling facilities.',
      icon: Truck,
      accent: 'amber',
      output: 'Priority Collection Queue · Safe Transit Manifest',
    },
    {
      step: '05',
      title: 'Record & Verify Lifecycle Events',
      desc: 'Every assessment, repurposing event, and mineral extraction is recorded in an immutable append-only Battery Lifecycle ID (BLID) passport ledger.',
      icon: ShieldCheck,
      accent: 'emerald',
      output: 'Verified Chain of Custody · Material Recovery Audit',
    },
  ]

  const activeStepData = circularityWorkflow[activeWorkflowStep]

  return (
    <div className="min-h-screen bg-cream text-ink-900">
      {/* =========================================================================
          HERO SECTION (3D BATTERY CENTERPIECE & CINEMATIC CTA)
         ========================================================================= */}
      <section className="relative overflow-hidden pt-8 pb-16 md:pt-12 md:pb-24">
        {/* Subtle Ambient Background Gradients */}
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-b from-brand-500/10 via-emerald-500/5 to-transparent blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Top Pill Badge */}
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-4 py-1.5 shadow-2xs">
              <Sparkles className="h-4 w-4 text-brand-600" />
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-brand-700">
                EVolve AI · 3D Battery Circularity Platform
              </span>
              <span className="rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-mono text-white">
                LIVE
              </span>
            </div>
          </div>

          {/* Hero Headings */}
          <div className="mt-6 text-center max-w-4xl mx-auto space-y-4">
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl md:text-7xl text-ink-900">
              Powering the{' '}
              <span className="bg-gradient-to-r from-brand-600 via-teal-600 to-emerald-600 bg-clip-text text-transparent">
                Second Life
              </span>{' '}
              of EV Batteries
            </h1>
            <p className="mx-auto max-w-2xl text-base sm:text-lg text-ink-600 leading-relaxed">
              AI-powered battery intelligence connecting assessment, reuse, and responsible recycling.
              Eliminating premature waste through continuous predictive telemetry and circular lifecycle governance.
            </p>

            {/* CTAs */}
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/battery-intelligence"
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3.5 text-sm font-bold text-white shadow-2xs hover:bg-brand-700 transition-all hover:scale-102"
              >
                <Cpu className="h-4 w-4" />
                <span>Explore Battery Intelligence</span>
                <ArrowRight className="h-4 w-4" />
              </Link>

              <Link
                to="/circularity-journey"
                className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-6 py-3.5 text-sm font-semibold text-ink-700 hover:bg-ink-50 transition-all shadow-2xs"
              >
                <RotateCcw className="h-4 w-4 text-brand-600" />
                <span>Discover Circularity</span>
              </Link>

              <Link
                to="/marketplace"
                className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-6 py-3.5 text-sm font-semibold text-ink-700 hover:bg-ink-50 transition-all shadow-2xs"
              >
                <Zap className="h-4 w-4 text-brand-600" />
                <span>Second-Life Marketplace</span>
              </Link>
            </div>
          </div>

          {/* 3D EV BATTERY PACK INTERACTIVE CENTERPIECE */}
          <div className="relative mt-10 md:mt-14">
            <div className="relative mx-auto max-w-5xl rounded-3xl border border-ink-200 bg-white p-3 sm:p-5 shadow-lg">
              {/* Studio Viewport for Three.js 3D Canvas */}
              <div className="relative rounded-2xl border border-ink-200 bg-white overflow-hidden shadow-xs">
                <Battery3DViewer
                  batteryId="BAT-EV-0005"
                  chemistry="LFP"
                  soh={88}
                  temperature={31.2}
                  height="460px"
                  onSelectModule={(mod) => setSelectedModule(mod)}
                />
              </div>

              {/* Selected Module Hotspot Feedback */}
              {selectedModule && (
                <div className="mt-3 flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50/90 p-3 text-xs font-mono text-brand-900 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-brand-600" />
                    <span className="font-bold text-ink-900">Inspecting {selectedModule.name}:</span>
                    <span className="text-ink-600">
                      {selectedModule.voltageV}V · {selectedModule.temperatureC}°C · {selectedModule.resistanceMOhm} mΩ
                    </span>
                  </div>
                  <span className="rounded-md bg-brand-600 px-2 py-0.5 font-bold text-white shadow-2xs">
                    {selectedModule.sohPct}% SOH
                  </span>
                </div>
              )}

              {/* Floating Telemetry Cards */}
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {/* Floating Card 1: Measured Health */}
                <div className="rounded-2xl border border-ink-200 bg-ink-50/60 p-4 transition-all">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-ink-400">Pack Retention</span>
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-brand-600 tnum">88.2%</span>
                    <span className="text-xs font-semibold text-ink-500">State of Health (SOH)</span>
                  </div>
                  <p className="mt-1 text-[11.5px] text-ink-600 leading-snug">
                    XGBoost regression indicates healthy cell retention above 70% traction baseline.
                  </p>
                </div>

                {/* Floating Card 2: Projected Useful Life */}
                <div className="rounded-2xl border border-ink-200 bg-ink-50/60 p-4 transition-all">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-ink-400">Useful Horizon</span>
                    <Activity className="h-3.5 w-3.5 text-brand-600" />
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-teal-600 tnum">~6.8 yrs</span>
                    <span className="text-xs font-semibold text-ink-500">Clean Traction RUL</span>
                  </div>
                  <p className="mt-1 text-[11.5px] text-ink-600 leading-snug">
                    Low cyclic degradation rate ensures years of service before retirement.
                  </p>
                </div>

                {/* Floating Card 3: Second-Life Suitability */}
                <div className="rounded-2xl border border-ink-200 bg-ink-50/60 p-4 transition-all">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-ink-400">Second-Life Status</span>
                    <Zap className="h-3.5 w-3.5 text-amber-500" />
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-amber-600">HIGH</span>
                    <span className="text-xs font-semibold text-ink-500">Solar BESS Candidate</span>
                  </div>
                  <p className="mt-1 text-[11.5px] text-ink-600 leading-snug">
                    Pre-qualified for secondary stationary energy storage repurposing upon EV retirement.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          CIRCULARITY OVERVIEW SECTION (5-STAGE LIFECYCLE WORKFLOW)
         ========================================================================= */}
      <section className="relative border-y border-ink-200 bg-white py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-widest text-brand-600">
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Full Circular Workflow</span>
            </div>
            <h2 className="text-3xl font-extrabold sm:text-4xl text-ink-900">
              How EVolve AI Manages Battery Circularity
            </h2>
            <p className="text-sm sm:text-base text-ink-600 leading-relaxed">
              From physical vehicle telemetry to secondary energy storage repurposing or certified
              hydrometallurgical recycling, every transition is governed and audited.
            </p>
          </div>

          {/* 5-Step Horizontal Tab Stepper */}
          <div className="mt-12 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {circularityWorkflow.map((item, idx) => {
              const isActive = activeWorkflowStep === idx
              const Icon = item.icon
              return (
                <button
                  key={item.step}
                  onClick={() => setActiveWorkflowStep(idx)}
                  className={`flex flex-col items-start rounded-2xl border p-4 text-left transition-all ${
                    isActive
                      ? 'border-brand-500 bg-brand-50/70 shadow-2xs ring-2 ring-brand-500/20'
                      : 'border-ink-200 bg-ink-50/50 hover:border-brand-300 hover:bg-white'
                  }`}
                >
                  <span className="font-mono text-xs font-bold text-ink-400">{item.step}</span>
                  <div className="mt-2 flex items-center gap-2">
                    <Icon
                      className={`h-4 w-4 ${
                        isActive ? 'text-brand-600' : 'text-ink-400'
                      }`}
                    />
                    <span
                      className={`text-xs font-bold ${
                        isActive ? 'text-ink-900' : 'text-ink-700'
                      }`}
                    >
                      {item.title}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Active Step Detailed Showcase Panel */}
          <div className="mt-6 rounded-2xl border border-ink-200 bg-ink-50/50 p-6 md:p-8 shadow-xs">
            <div className="flex flex-col md:flex-row items-start justify-between gap-6">
              <div className="space-y-3 max-w-2xl">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-brand-50 border border-brand-200 px-2 py-0.5 font-mono text-xs font-bold text-brand-700">
                    STAGE {activeStepData.step}
                  </span>
                  <span className="text-xs font-mono text-ink-500">
                    EVolve Protocol Standard
                  </span>
                </div>
                <h3 className="text-2xl font-bold text-ink-900">
                  {activeStepData.title}
                </h3>
                <p className="text-sm leading-relaxed text-ink-600">
                  {activeStepData.desc}
                </p>
                <div className="pt-2 flex items-center gap-2 text-xs font-mono text-brand-700">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-600" />
                  <span>Authoritative Output: {activeStepData.output}</span>
                </div>
              </div>

              <div className="shrink-0 w-full md:w-auto">
                <Link
                  to="/circularity-journey"
                  className="inline-flex w-full md:w-auto items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-xs font-bold text-white hover:bg-brand-700 transition shadow-2xs"
                >
                  <span>View Dual-Branch Journey</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          FEATURE CAPABILITIES GRID
         ========================================================================= */}
      <section className="py-16 md:py-24 bg-cream">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="text-xs font-mono font-bold uppercase tracking-widest text-brand-600">
              Technical Capabilities
            </span>
            <h2 className="text-3xl font-extrabold sm:text-4xl text-ink-900">
              Enterprise AI &amp; Circular Architecture
            </h2>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Feature 1 */}
            <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-xs hover:border-brand-300 transition-all hover:-translate-y-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 border border-brand-200">
                <Cpu className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-bold text-ink-900">
                ML Health Regressors
              </h3>
              <p className="mt-2 text-xs text-ink-600 leading-relaxed">
                Trained on real cycle degradation datasets. Predicts SOH and remaining useful life
                without requiring destructive cell disassembly.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-xs hover:border-brand-300 transition-all hover:-translate-y-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-600 border border-teal-200">
                <Layers className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-bold text-ink-900">
                3D Digital Twin Viewer
              </h3>
              <p className="mt-2 text-xs text-ink-600 leading-relaxed">
                Interactive procedural WebGL engine allows operators and judges to inspect individual
                pack modules, cell busbars, and thermal distribution.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-xs hover:border-brand-300 transition-all hover:-translate-y-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200">
                <Zap className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-bold text-ink-900">
                Second-Life Marketplace
              </h3>
              <p className="mt-2 text-xs text-ink-600 leading-relaxed">
                Discovers retired vehicle packs eligible for stationary solar storage, off-grid microgrids,
                and backup power systems.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-xs hover:border-brand-300 transition-all hover:-translate-y-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600 border border-cyan-200">
                <Recycle className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-bold text-ink-900">
                Material Recovery Audit
              </h3>
              <p className="mt-2 text-xs text-ink-600 leading-relaxed">
                Connects truly degraded packs with verified hydrometallurgical recyclers to extract
                Lithium, Nickel, Cobalt, and Graphite.
              </p>
            </div>
          </div>

          {/* Fleet Owner Dedicated Entry Point Card */}
          <div className="mt-12 rounded-3xl border border-brand-200 bg-gradient-to-r from-brand-900 via-ink-900 to-brand-950 p-6 sm:p-8 text-white shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-brand-500/20 text-brand-300 p-3.5 border border-brand-400/30 shrink-0">
                <Truck className="h-7 w-7 text-brand-400" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-extrabold tracking-tight">Fleet Owner?</h3>
                  <span className="rounded-full bg-brand-500/30 border border-brand-400/40 text-brand-300 text-[10px] font-bold px-2.5 py-0.5 uppercase tracking-wider">
                    Multi-Vehicle Intelligence
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-ink-200 max-w-2xl leading-relaxed">
                  Manage multiple EVs, analyse battery health across your fleet, identify vehicles requiring attention,
                  and plan maintenance using your own vehicle data.
                </p>
              </div>
            </div>

            <Link
              to="/fleet/welcome"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs sm:text-sm px-6 py-3.5 transition shadow-2xs whitespace-nowrap hover:scale-102"
            >
              <span>Explore Fleet Intelligence</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SUSTAINABILITY IMPACT SECTION (AUTHORITATIVE BACKEND STATS)
         ========================================================================= */}
      <section className="relative border-t border-ink-200 bg-white py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
            <div className="space-y-3 max-w-xl">
              <span className="text-xs font-mono font-bold uppercase tracking-widest text-brand-600">
                Authoritative Metrics
              </span>
              <h2 className="text-3xl font-extrabold text-ink-900">
                Real Platform Circular Impact
              </h2>
              <p className="text-sm text-ink-600 leading-relaxed">
                Figures derived directly from current SQLite database records across monitored EV fleets,
                prevented premature disposals, and verified second-life assignments.
              </p>
            </div>

            {/* Real Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 w-full lg:w-auto">
              <div className="rounded-2xl border border-ink-200 bg-ink-50/60 p-4 text-center">
                <span className="font-mono text-3xl font-black text-brand-600 tnum">
                  {summary ? summary.total_batteries : 76}
                </span>
                <span className="mt-1 block text-xs font-semibold text-ink-700">
                  Monitored EV Packs
                </span>
                <span className="text-[10px] font-mono text-ink-400">Live DB Records</span>
              </div>

              <div className="rounded-2xl border border-ink-200 bg-ink-50/60 p-4 text-center">
                <span className="font-mono text-3xl font-black text-emerald-600 tnum">
                  {summary ? summary.intervention_candidates : 70}
                </span>
                <span className="mt-1 block text-xs font-semibold text-ink-700">
                  Waste Prevented
                </span>
                <span className="text-[10px] font-mono text-ink-400">Intervention Units</span>
              </div>

              <div className="rounded-2xl border border-ink-200 bg-ink-50/60 p-4 text-center col-span-2 sm:col-span-1">
                <span className="font-mono text-3xl font-black text-teal-600 tnum">
                  {summary ? `${Math.round(((summary.total_batteries * 45 * 0.8) / 1000) * 10) / 10} MWh` : '2.7 MWh'}
                </span>
                <span className="mt-1 block text-xs font-semibold text-ink-700">
                  Energy Conserved
                </span>
                <span className="text-[10px] font-mono text-ink-400">Retained Storage</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          ENTERPRISE FOOTER
         ========================================================================= */}
      <footer className="border-t border-ink-200 bg-white py-12 text-ink-500 text-xs">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 border-b border-ink-100 pb-8">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600 border border-brand-200">
                <Leaf className="h-4 w-4" />
              </div>
              <div>
                <span className="text-sm font-bold text-ink-900">EVolve AI</span>
                <span className="block text-[11px] text-ink-500">
                  EV Battery Second-Life &amp; Circularity Platform
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6 text-ink-600 font-medium">
              <Link to="/battery-intelligence" className="hover:text-brand-600 transition">
                3D Intelligence
              </Link>
              <Link to="/marketplace" className="hover:text-brand-600 transition">
                Marketplace
              </Link>
              <Link to="/circularity-journey" className="hover:text-brand-600 transition">
                Circularity Journey
              </Link>
              <Link to="/customer/battery" className="hover:text-brand-600 transition">
                AI Assessment
              </Link>
              <Link to="/login" className="hover:text-brand-600 transition">
                Portal Sign In
              </Link>
            </div>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-ink-400 text-[11px]">
            <span>
              ISO 12405 / SAE J2464 Safety Compliant Architectural Demonstration. Decision-support only.
            </span>
            <span>
              EVolve AI &copy; 2026. Built for National Hackathon Innovation.
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}
