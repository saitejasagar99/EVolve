import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  Box,
  ChevronDown,
  ChevronUp,
  Cpu,
  Flame,
  GitBranch,
  Layers,
  Minimize,
  Recycle,
  ShieldAlert,
  Sparkles,
  Thermometer,
  Wrench,
  Zap,
} from 'lucide-react'
import { api, type PartsGuideResponse } from '../services/api'

export default function ConsumerPartsGuide() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialChem = searchParams.get('chemistry') || 'ALL'

  const [selectedChemistry, setSelectedChemistry] = useState(initialChem)
  const [guideData, setGuideData] = useState<PartsGuideResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>('cells')

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        const res = await api.getPartsGuide(selectedChemistry)
        setGuideData(res)
      } catch (err: any) {
        console.error('Failed to load parts guide:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [selectedChemistry])

  const handleChemChange = (chem: string) => {
    setSelectedChemistry(chem)
    setSearchParams(chem !== 'ALL' ? { chemistry: chem } : {})
  }

  const getComponentIcon = (id: string) => {
    switch (id) {
      case 'cells': return <Layers className="h-5 w-5 text-brand-600" />
      case 'bms': return <Cpu className="h-5 w-5 text-sky-600" />
      case 'enclosure': return <Box className="h-5 w-5 text-ink-600" />
      case 'cooling': return <Thermometer className="h-5 w-5 text-teal-600" />
      case 'busbars': return <Zap className="h-5 w-5 text-amber-600" />
      case 'contactors': return <ShieldAlert className="h-5 w-5 text-rose-600" />
      case 'tim': return <Minimize className="h-5 w-5 text-purple-600" />
      case 'sense_harness': return <GitBranch className="h-5 w-5 text-indigo-600" />
      case 'insulation': return <Flame className="h-5 w-5 text-orange-600" />
      default: return <Wrench className="h-5 w-5 text-ink-600" />
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-600">
          <BookOpen className="h-4 w-4" />
          <span>Battery Engineering & Materials</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900">
          Battery Parts & Materials Guide
        </h1>
        <p className="mt-1 text-sm text-ink-600 max-w-3xl">
          An interactive technical reference detailing the 9 core high-voltage sub-systems of electric vehicle battery packs, their raw material composition, second-life repurposing potential, hydrometallurgical recycling pathways, and safety precautions.
        </p>
      </div>

      {/* Chemistry Selector Tabs */}
      <div className="mb-6 rounded-2xl border border-ink-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-ink-500">
              Select Chemistry Focus
            </h2>
            <p className="text-xs text-ink-600">
              Filter component characteristics and mineral recovery dynamics by battery chemistry.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {['ALL', 'LFP', 'NMC', 'NCA'].map((chem) => (
              <button
                key={chem}
                onClick={() => handleChemChange(chem)}
                className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
                  selectedChemistry === chem
                    ? 'bg-brand-500 text-white shadow-sm'
                    : 'border border-ink-200 bg-white text-ink-700 hover:bg-ink-50'
                }`}
              >
                {chem === 'ALL' ? 'All Chemistries' : chem}
              </button>
            ))}
          </div>
        </div>

        {/* Selected Chemistry Summary Card */}
        {guideData && guideData.chemistry_summaries && (
          <div className="mt-4 pt-4 border-t border-ink-100 grid gap-3 sm:grid-cols-2">
            {selectedChemistry === 'ALL' || selectedChemistry === 'LFP' ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-xs">
                <span className="font-bold text-emerald-950 flex items-center gap-1.5">
                  <Zap className="h-4 w-4 text-emerald-600" />
                  LFP (Lithium Iron Phosphate) Profile
                </span>
                <p className="mt-1 text-emerald-900">
                  Thermal Runaway Threshold: <span className="font-semibold">&gt; 270°C</span> (Highly Stable) • Cycle Life: <span className="font-semibold">3,000–6,000+ cycles</span>
                </p>
                <p className="mt-1 text-emerald-800">
                  Cobalt- & nickel-free. Prime candidate for residential and microgrid stationary second-life storage. Recycling prioritizes lithium carbonate recovery.
                </p>
              </div>
            ) : null}

            {selectedChemistry === 'ALL' || selectedChemistry === 'NMC' ? (
              <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-4 text-xs">
                <span className="font-bold text-purple-950 flex items-center gap-1.5">
                  <Recycle className="h-4 w-4 text-purple-600" />
                  NMC (Nickel Manganese Cobalt) Profile
                </span>
                <p className="mt-1 text-purple-900">
                  Thermal Runaway Threshold: <span className="font-semibold">~150°C–210°C</span> • Energy Density: <span className="font-semibold">220–300 Wh/kg</span>
                </p>
                <p className="mt-1 text-purple-800">
                  High economic recycling value. Closed-loop hydrometallurgical refining yields battery-grade Nickel, Cobalt, and Lithium sulfates with &gt;95% efficiency.
                </p>
              </div>
            ) : null}

            {selectedChemistry === 'NCA' ? (
              <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4 text-xs sm:col-span-2">
                <span className="font-bold text-sky-950 flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-sky-600" />
                  NCA (Nickel Cobalt Aluminum Oxide) Profile
                </span>
                <p className="mt-1 text-sky-900">
                  High specific energy traction chemistry with mandatory closed-loop critical mineral recovery.
                </p>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Safety Warning Advisory */}
      <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50/80 p-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 shrink-0 text-rose-600 mt-0.5" />
          <div className="text-xs leading-relaxed text-rose-800">
            <span className="font-bold text-rose-900">High-Voltage Hazardous Materials Notice: </span>
            {guideData?.safety_advisory ||
              'EV battery packs operate at lethal voltages up to 800V DC. Never attempt to dismantle packs or harvest cells without certified high-voltage safety credentials and explosion-proof equipment.'}
          </div>
        </div>
      </div>

      {/* 9 Components Accordion / Expandable Cards */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-4">
          {guideData?.components.map((comp: any, idx: number) => {
            const isExpanded = expandedId === comp.id
            return (
              <div
                key={comp.id}
                className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm transition hover:border-brand-300"
              >
                {/* Accordion Header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : comp.id)}
                  className="flex w-full items-center justify-between p-5 text-left transition hover:bg-ink-50/50"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-50 border border-ink-100">
                      {getComponentIcon(comp.id)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-2xs font-bold uppercase tracking-wider text-ink-400">
                          Component {idx + 1} • {comp.category}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-ink-900">{comp.name}</h3>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="hidden sm:inline-block rounded-full bg-brand-50 px-3 py-1 text-2xs font-semibold text-brand-700 border border-brand-100">
                      {comp.hydrometallurgical_recovery_rate}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="h-5 w-5 text-ink-400" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-ink-400" />
                    )}
                  </div>
                </button>

                {/* Expanded Technical Details */}
                {isExpanded && (
                  <div className="border-t border-ink-100 p-5 bg-ink-50/30 space-y-4 text-xs">
                    {/* Primary Function */}
                    <div>
                      <h4 className="font-bold text-ink-800 uppercase text-2xs tracking-wider">Pack Engineering Function</h4>
                      <p className="mt-1 text-ink-700 leading-relaxed">{comp.pack_function}</p>
                    </div>

                    {/* Materials & Critical Minerals Grid */}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-ink-100 bg-white p-3.5">
                        <h4 className="font-bold text-ink-800 uppercase text-2xs tracking-wider">Primary Engineered Materials</h4>
                        <ul className="mt-1.5 space-y-1 text-ink-600 list-disc list-inside">
                          {comp.primary_materials.map((m: string, i: number) => (
                            <li key={i}>{m}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-xl border border-ink-100 bg-white p-3.5">
                        <h4 className="font-bold text-ink-800 uppercase text-2xs tracking-wider">Critical Mineral Elements</h4>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {comp.critical_minerals.map((min: string, i: number) => (
                            <span key={i} className="rounded-md bg-ink-100 px-2 py-0.5 text-2xs font-medium text-ink-700">
                              {min}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Circular Pathways Comparison: Second-Life vs Recycling */}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5">
                        <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                          <Zap className="h-4 w-4 text-emerald-600" />
                          Second-Life Pathway ({comp.second_life_suitability})
                        </span>
                        <p className="mt-1.5 text-emerald-800 leading-relaxed">
                          {comp.second_life_pathway}
                        </p>
                      </div>

                      <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-3.5">
                        <span className="font-bold text-purple-900 flex items-center gap-1.5">
                          <Recycle className="h-4 w-4 text-purple-600" />
                          Closed-Loop Recycling Pathway
                        </span>
                        <p className="mt-1.5 text-purple-800 leading-relaxed">
                          {comp.recycling_pathway}
                        </p>
                      </div>
                    </div>

                    {/* Active Chemistry Specific Nuance */}
                    {comp.active_chemistry_note && (
                      <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3.5">
                        <span className="font-bold text-brand-900 flex items-center gap-1.5">
                          <Sparkles className="h-4 w-4 text-brand-600" />
                          Chemistry Considerations ({selectedChemistry})
                        </span>
                        <p className="mt-1 text-brand-800 leading-relaxed">
                          {comp.active_chemistry_note}
                        </p>
                      </div>
                    )}

                    {/* Handling & Safety Hazards */}
                    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5">
                      <span className="font-bold text-amber-900 flex items-center gap-1.5">
                        <ShieldAlert className="h-4 w-4 text-amber-600" />
                        Disassembly Hazards & Safety Protocol
                      </span>
                      <p className="mt-1 text-amber-800 leading-relaxed">
                        {comp.handling_and_hazards}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Bottom Navigation */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-ink-200 pt-6">
        <Link
          to="/consumer/discarded-batteries"
          className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-xs font-semibold text-ink-700 hover:bg-ink-50 transition"
        >
          Explore Discarded Batteries
        </Link>
        <Link
          to="/consumer/reuse-vs-recycling"
          className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-600 transition"
        >
          Reuse vs Recycling Decision Guide
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}
