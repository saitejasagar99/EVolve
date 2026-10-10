/**
 * EVolve AI — Battery Recycling Educational Guide
 *
 * Route: /recycling/learn
 *
 * Comprehensive public educational resource on:
 *   1. Why EV Battery Recycling Matters
 *   2. What Materials Can Be Recovered (Lithium, Nickel, Cobalt, etc.)
 *   3. When Does a Battery Need Recycling?
 *   4. Can a Used Battery Be Reused? (Reuse vs. Recycling)
 *   5. Safe Handling & Critical Emergency Procedures
 */

import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Compass,
  Flame,
  Globe,
  Layers,
  Leaf,
  Recycle,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react'

export default function RecyclingLearn() {
  return (
    <div className="mx-auto max-w-4xl space-y-10 py-4">
      {/* Top Breadcrumb & Navigation */}
      <div className="flex items-center justify-between border-b border-ink-100 pb-3">
        <Link
          to="/recycling/dashboard"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-teal-800 hover:text-teal-950"
        >
          <ArrowLeft size={15} />
          <span>Back to Recycling Dashboard</span>
        </Link>
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-400">
          Educational Guide · EVolve AI
        </span>
      </div>

      {/* Main Header */}
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-teal-300 bg-teal-50 px-3 py-1 text-[11px] font-bold text-teal-800">
          <BookOpen size={13} className="text-teal-600" />
          <span>Battery Knowledge Base</span>
        </div>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-ink-900 tracking-tight">
          Understanding EV Battery Recycling &amp; Recovery
        </h1>
        <p className="text-[14px] sm:text-[15px] leading-relaxed text-ink-600">
          A transparent guide to how traction batteries are evaluated, why closed-loop recycling
          is crucial for clean mobility, and what safety practices protect owners and handlers.
        </p>
      </div>

      {/* =========================================================================
          SECTION 1: WHY EV BATTERY RECYCLING MATTERS
         ========================================================================= */}
      <section id="why" className="rounded-3xl border border-ink-200 bg-white p-6 sm:p-8 shadow-xs space-y-5">
        <div className="flex items-center gap-2.5 text-teal-800 border-b border-ink-100 pb-3">
          <Globe size={22} className="text-teal-600 shrink-0" />
          <h2 className="text-xl font-bold text-ink-900">1. Why EV Battery Recycling Matters</h2>
        </div>

        <div className="space-y-4 text-[13.5px] leading-relaxed text-ink-700">
          <p>
            Electric vehicles dramatically reduce tailpipe emissions during their driving life.
            However, their large lithium-ion traction battery packs require significant quantities
            of refined minerals. When these batteries reach the end of their automotive usefulness,
            recycling them is essential for four key reasons:
          </p>

          <div className="grid gap-3 sm:grid-cols-2 pt-2">
            <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-4 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-teal-900 text-[14px]">
                <Leaf size={16} className="text-teal-700" />
                <span>Waste &amp; Landfill Prevention</span>
              </div>
              <p className="text-[12.5px] text-teal-950">
                Prevents hazardous heavy metals, electrolyte solvents, and fluorinated binders from
                ending up in municipal landfills or informal scrap yards where they could contaminate
                soil and groundwater.
              </p>
            </div>

            <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-4 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-teal-900 text-[14px]">
                <Layers size={16} className="text-teal-700" />
                <span>Critical Resource Recovery</span>
              </div>
              <p className="text-[12.5px] text-teal-950">
                Recovers strategic elements like Lithium, Cobalt, and Nickel that can be reintroduced
                directly into domestic cell manufacturing, strengthening national supply resilience.
              </p>
            </div>

            <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-4 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-teal-900 text-[14px]">
                <Sparkles size={16} className="text-teal-700" />
                <span>Lower Mining Footprint</span>
              </div>
              <p className="text-[12.5px] text-teal-950">
                Refining battery-grade minerals from recycled &ldquo;black mass&rdquo; consumes up
                to 70% less energy and significantly less water compared to extracting raw ores
                from virgin open-pit mines.
              </p>
            </div>

            <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-4 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-teal-900 text-[14px]">
                <ShieldCheck size={16} className="text-teal-700" />
                <span>Regulatory Compliance (EPR)</span>
              </div>
              <p className="text-[12.5px] text-teal-950">
                Fulfills government mandates (such as India&apos;s Battery Waste Management Rules 2022),
                ensuring traceable end-of-life handling and Extended Producer Responsibility.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 2: WHAT CAN BE RECOVERED?
         ========================================================================= */}
      <section id="materials" className="rounded-3xl border border-ink-200 bg-white p-6 sm:p-8 shadow-xs space-y-5">
        <div className="flex items-center gap-2.5 text-sky-800 border-b border-ink-100 pb-3">
          <Layers size={22} className="text-sky-600 shrink-0" />
          <h2 className="text-xl font-bold text-ink-900">2. What Can Be Recovered?</h2>
        </div>

        <div className="space-y-4 text-[13.5px] leading-relaxed text-ink-700">
          <p>
            Modern EV lithium-ion batteries are complex electrochemical assemblies. Specialized
            metallurgical facilities can recover multiple components, typically achieving high yields
            when modern hydrometallurgical recycling routes are used:
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-ink-200 bg-ink-50/50 p-3.5 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Cathode / Active</span>
              <h4 className="font-bold text-ink-900 text-[14px]">Lithium (Li)</h4>
              <p className="text-[11.5px] text-ink-600">
                Recovered as battery-grade lithium carbonate or lithium hydroxide.
              </p>
            </div>

            <div className="rounded-xl border border-ink-200 bg-ink-50/50 p-3.5 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-700">Cathode (NMC / NCA)</span>
              <h4 className="font-bold text-ink-900 text-[14px]">Nickel &amp; Cobalt</h4>
              <p className="text-[11.5px] text-ink-600">
                High-value metals recovered with high purity from nickel-rich chemistries.
              </p>
            </div>

            <div className="rounded-xl border border-ink-200 bg-ink-50/50 p-3.5 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Current Collectors</span>
              <h4 className="font-bold text-ink-900 text-[14px]">Copper &amp; Aluminium</h4>
              <p className="text-[11.5px] text-ink-600">
                Foil substrates easily separated through mechanical shredding and screening.
              </p>
            </div>

            <div className="rounded-xl border border-ink-200 bg-ink-50/50 p-3.5 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">Structural</span>
              <h4 className="font-bold text-ink-900 text-[14px]">Steel &amp; Enclosures</h4>
              <p className="text-[11.5px] text-ink-600">
                External battery pack casing and tray materials recycled in secondary metals streams.
              </p>
            </div>

            <div className="rounded-xl border border-ink-200 bg-ink-50/50 p-3.5 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">Anode Active Material</span>
              <h4 className="font-bold text-ink-900 text-[14px]">Graphite (C)</h4>
              <p className="text-[11.5px] text-ink-600">
                Emerging purification processes recover graphite for industrial and anode re-use.
              </p>
            </div>

            <div className="rounded-xl border border-ink-200 bg-ink-50/50 p-3.5 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700">Intermediary</span>
              <h4 className="font-bold text-ink-900 text-[14px]">Black Mass</h4>
              <p className="text-[11.5px] text-ink-600">
                The refined powder containing mixed cathode and anode materials prior to hydrometallurgical separation.
              </p>
            </div>
          </div>

          {/* Important Technical Caveat */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-[12.5px] text-amber-950 space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-amber-900">
              <AlertTriangle size={16} className="text-amber-700" />
              <span>Important Chemistry &amp; Facility Caveat</span>
            </div>
            <p className="leading-relaxed">
              Not every battery contains all of these materials, and not every recycling facility
              recovers all of them. For instance, Lithium Iron Phosphate (LFP) batteries contain
              zero cobalt and zero nickel. Additionally, older pyrometallurgical (smelting) methods
              burn off graphite and electrolyte while recovering mainly nickel and cobalt into an alloy,
              whereas newer hydrometallurgical (chemical leaching) methods achieve high recovery of lithium.
            </p>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 3: WHEN DOES A BATTERY NEED RECYCLING?
         ========================================================================= */}
      <section id="when" className="rounded-3xl border border-ink-200 bg-white p-6 sm:p-8 shadow-xs space-y-5">
        <div className="flex items-center gap-2.5 text-purple-800 border-b border-ink-100 pb-3">
          <Recycle size={22} className="text-purple-600 shrink-0" />
          <h2 className="text-xl font-bold text-ink-900">3. When Does a Battery Need Recycling?</h2>
        </div>

        <div className="space-y-4 text-[13.5px] leading-relaxed text-ink-700">
          <p>
            A battery is not automatically ready for recycling simply because driving range has
            decreased slightly. Recycling is typically the appropriate destination when:
          </p>

          <ul className="space-y-2.5 text-[13px]">
            <li className="flex items-start gap-2.5">
              <CheckCircle2 size={16} className="text-purple-700 shrink-0 mt-0.5" />
              <span>
                <strong>End of Useful Service Life:</strong> The battery State of Health (SOH) has
                fallen significantly (often below 65-70%) and internal cell resistance has risen
                to levels where it can no longer power either vehicular or stationary applications.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 size={16} className="text-purple-700 shrink-0 mt-0.5" />
              <span>
                <strong>Physical or Mechanical Damage:</strong> The battery casing, internal seals,
                or modules have been punctured, bent, flooded, or structurally compromised during
                an accident.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 size={16} className="text-purple-700 shrink-0 mt-0.5" />
              <span>
                <strong>Failed Safety or Insulation Assessment:</strong> The battery exhibits severe
                cell voltage deviation, micro short-circuits, insulation leakage, or excessive gas generation.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 size={16} className="text-purple-700 shrink-0 mt-0.5" />
              <span>
                <strong>Unsuitability for Safe Reuse:</strong> The modules cannot be rebalanced or
                reconditioned economically for stationary second-life energy storage.
              </span>
            </li>
          </ul>

          {/* Do Not Diagnose Warning */}
          <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-[12.5px] text-rose-950 flex items-start gap-3">
            <ShieldAlert size={20} className="text-rose-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-rose-900">Professional Assessment Required</p>
              <p className="leading-relaxed">
                Do not attempt to open, test, or diagnose high-voltage battery enclosures yourself.
                Traction batteries operate at hazardous potentials (typically 300V to 800V DC).
                Condition evaluations must be performed by certified technicians with insulated tools
                and appropriate safety gear.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 4: CAN A USED BATTERY BE REUSED? (REUSE VS RECYCLING)
         ========================================================================= */}
      <section id="reuse" className="rounded-3xl border border-ink-200 bg-white p-6 sm:p-8 shadow-xs space-y-5">
        <div className="flex items-center gap-2.5 text-amber-800 border-b border-ink-100 pb-3">
          <Zap size={22} className="text-amber-600 shrink-0" />
          <h2 className="text-xl font-bold text-ink-900">4. Can a Used Battery Be Reused?</h2>
        </div>

        <div className="space-y-4 text-[13.5px] leading-relaxed text-ink-700">
          <p>
            Yes—often, but only under strict technical conditions. There is a critical difference
            between <strong>Second-Life Reuse</strong> and <strong>Recycling</strong>:
          </p>

          <div className="grid gap-4 sm:grid-cols-2 pt-1">
            <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                Step Prior to Recycling
              </span>
              <h3 className="font-bold text-[15px] text-ink-900">Second-Life Reuse</h3>
              <p className="text-[12.5px] text-ink-600 leading-relaxed">
                A battery retired from an EV with 70% to 80% remaining capacity may still have 5 to 8
                years of useful service in stationary applications (such as residential solar backup,
                agricultural pumps, and microgrids) where weight and extreme fast-charging are not required.
              </p>
              <p className="text-[11.5px] font-medium text-amber-900">
                Requires: Non-destructive testing, cell grading, and BMS reconfiguration.
              </p>
            </div>

            <div className="rounded-2xl border border-teal-200 bg-teal-50/40 p-5 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800 bg-teal-100 px-2 py-0.5 rounded-full">
                Final Closed-Loop Destination
              </span>
              <h3 className="font-bold text-[15px] text-ink-900">Material Recycling</h3>
              <p className="text-[12.5px] text-ink-600 leading-relaxed">
                When a battery has degraded beyond safe second-life thresholds (or has reached the end
                of its second life), it is physically dismantled and chemically processed to break it down
                into its constituent raw mineral elements.
              </p>
              <p className="text-[11.5px] font-medium text-teal-900">
                Requires: Certified recycling facilities with environmental permits.
              </p>
            </div>
          </div>

          <p className="text-[12.5px] text-ink-500 italic">
            Note: Damaged, swollen, water-damaged, or thermally compromised batteries are NEVER candidates
            for second-life reuse; they must be directed straight to certified recycling and safe neutralization.
          </p>
        </div>
      </section>

      {/* =========================================================================
          SECTION 5: SAFE HANDLING & EMERGENCY PROCEDURES
         ========================================================================= */}
      <section id="safety" className="rounded-3xl border border-rose-200 bg-white p-6 sm:p-8 shadow-xs space-y-5">
        <div className="flex items-center gap-2.5 text-rose-800 border-b border-rose-100 pb-3">
          <Flame size={22} className="text-rose-600 shrink-0" />
          <h2 className="text-xl font-bold text-ink-900">5. Safe Handling &amp; Emergency Guidance</h2>
        </div>

        <div className="space-y-4 text-[13.5px] leading-relaxed text-ink-700">
          <p>
            Lithium-ion vehicle batteries contain high energy density and flammable electrolyte solvents.
            Observing the following safety rules protects you, your vehicle, and your property:
          </p>

          <div className="space-y-2.5">
            <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3.5 flex items-start gap-3">
              <AlertTriangle size={18} className="text-rose-700 shrink-0 mt-0.5" />
              <div className="text-[12.5px] text-rose-950">
                <strong>Never Dispose in Ordinary Waste:</strong> EV batteries must never be thrown into
                household garbage, metal scrap piles, or burned. Doing so creates acute environmental
                contamination and poses severe risks of garbage truck and landfill fires.
              </div>
            </div>

            <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3.5 flex items-start gap-3">
              <AlertTriangle size={18} className="text-rose-700 shrink-0 mt-0.5" />
              <div className="text-[12.5px] text-rose-950">
                <strong>Do Not Puncture or Dismantle:</strong> Mechanical puncture of lithium-ion cells
                can cause immediate internal short-circuits, resulting in thermal runaway and intense fires.
              </div>
            </div>

            <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3.5 flex items-start gap-3">
              <AlertTriangle size={18} className="text-rose-700 shrink-0 mt-0.5" />
              <div className="text-[12.5px] text-rose-950">
                <strong>Emergency Protocol for Suspicious Batteries:</strong> If you observe swelling,
                hissing, pungent sweet chemical odor, smoke, or excessive heat:
                <ul className="list-disc list-inside mt-1.5 space-y-0.5">
                  <li>Immediately keep people and pets at a safe distance outdoors.</li>
                  <li>Do NOT attempt to charge or jump-start the vehicle.</li>
                  <li>Do NOT attempt to extinguish a high-voltage battery fire with small handheld extinguishers.</li>
                  <li>Call emergency services (112 / Fire Department) and inform them it is an EV traction battery incident.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom Navigation CTAs */}
      <div className="rounded-3xl border border-teal-200 bg-gradient-to-r from-teal-50 via-white to-white p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="space-y-1 text-center sm:text-left">
          <h3 className="text-lg font-bold text-ink-900">Ready to check your battery?</h3>
          <p className="text-[13px] text-ink-600">
            Use the condition decision helper or diagnostic wizard to identify appropriate next steps.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/recycling/dashboard"
            className="btn bg-teal-700 text-white hover:bg-teal-800 px-5 py-2.5 text-[13px] font-bold flex items-center gap-2"
          >
            <Compass size={15} />
            <span>Open Condition Guide</span>
          </Link>
          <Link to="/customer/battery" className="btn btn-outline text-[13px] font-semibold">
            <span>EV Owner Health Wizard</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
