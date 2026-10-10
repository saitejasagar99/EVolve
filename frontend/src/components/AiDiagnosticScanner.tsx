import React, { useEffect, useState } from 'react'
import { Activity, Cpu, CheckCircle2, ShieldCheck, Zap } from 'lucide-react'

interface AiDiagnosticScannerProps {
  isOpen: boolean
  onComplete: () => void
  vehicleBrand?: string
  vehicleModel?: string
  batteryChemistry?: string | null
}

const SCAN_STEPS = [
  {
    step: 1,
    title: 'Acquiring Telemetry & Usage Profile',
    desc: 'Normalizing odometer intervals, ambient temperature logs, and daily discharge DoD...',
    tag: 'TELEMETRY_INGEST',
  },
  {
    step: 2,
    title: 'Executing XGBoost Health Regressors',
    desc: 'Mapping internal resistance vs. synthetic degradation curves across 12,000+ cycle benchmarks...',
    tag: 'ML_INFERENCE',
  },
  {
    step: 3,
    title: 'Assessing Second-Life Repurposing Viability',
    desc: 'Simulating stationary BESS (Battery Energy Storage System) solar load cycles...',
    tag: 'CIRCULAR_EVAL',
  },
  {
    step: 4,
    title: 'Generating Verified Circular Passport',
    desc: 'Synthesizing actionable maintenance advisory and authorized collection routing...',
    tag: 'PASSPORT_GEN',
  },
]

export const AiDiagnosticScanner: React.FC<AiDiagnosticScannerProps> = ({
  isOpen,
  onComplete,
  vehicleBrand = 'Tata',
  vehicleModel = 'Nexon EV',
  batteryChemistry = 'LFP',
}) => {
  const [progress, setProgress] = useState(0)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [activeCellIndex, setActiveCellIndex] = useState(0)

  useEffect(() => {
    if (!isOpen) {
      setProgress(0)
      setCurrentStepIndex(0)
      setActiveCellIndex(0)
      return
    }

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval)
          setTimeout(() => {
            onComplete()
          }, 450)
          return 100
        }
        const next = prev + 2
        // Update steps based on progress
        if (next >= 75) setCurrentStepIndex(3)
        else if (next >= 50) setCurrentStepIndex(2)
        else if (next >= 25) setCurrentStepIndex(1)
        else setCurrentStepIndex(0)

        // Rotate active cell
        setActiveCellIndex(Math.floor((next / 100) * 8))
        return next
      })
    }, 45)

    return () => clearInterval(interval)
  }, [isOpen, onComplete])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/80 backdrop-blur-md p-4 animate-fade-in">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-teal-500/30 bg-gradient-to-b from-slate-900 via-slate-900 to-ink-950 p-6 sm:p-8 text-white shadow-2xl">
        {/* Glowing cyber grid background */}
        <div className="absolute inset-0 bg-[radial-gradient(#0d9488_1px,transparent_1px)] [background-size:20px_20px] opacity-15" />

        {/* Ambient Top Glow */}
        <div className="absolute -top-24 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full bg-teal-500/20 blur-3xl" />

        {/* Header Badge */}
        <div className="relative z-10 flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/20 text-teal-400 border border-teal-500/40">
              <Cpu className="h-4 w-4 animate-spin text-teal-300" style={{ animationDuration: '6s' }} />
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-teal-500" />
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-teal-400">
                  EVolve AI Neural Core
                </span>
                <span className="rounded bg-teal-900/60 border border-teal-500/30 px-1.5 py-0.2 text-[9px] font-mono text-teal-300">
                  v2.4 QUANT
                </span>
              </div>
              <h2 className="text-base font-bold text-slate-100">
                Deep Battery Diagnostic Scanner
              </h2>
            </div>
          </div>

          <div className="text-right">
            <span className="font-mono text-2xl font-black text-teal-400 tnum">
              {progress}%
            </span>
            <span className="block font-mono text-[10px] text-slate-400 uppercase tracking-wider">
              Scan Progress
            </span>
          </div>
        </div>

        {/* Animated Laser Battery Cell Blueprint */}
        <div className="relative z-10 my-6 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
            <span className="flex items-center gap-1.5 text-teal-300">
              <Zap className="h-3.5 w-3.5 text-teal-400" />
              Target: {vehicleBrand} {vehicleModel} ({batteryChemistry || 'LFP'})
            </span>
            <span className="text-slate-400">
              Cell Matrix: 8 Modules Monitored
            </span>
          </div>

          {/* Hologram Pack Grid with Laser Sweep */}
          <div className="relative overflow-hidden rounded-xl border border-teal-500/30 bg-slate-900/80 p-4">
            {/* The Scanning Laser Beam */}
            <div
              className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_#22d3ee] transition-all duration-75 pointer-events-none"
              style={{ top: `${progress}%` }}
            />

            {/* Simulated 8-cell battery architecture */}
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((cellIdx) => {
                const isPassed = (progress / 100) * 8 > cellIdx
                const isCurrent = activeCellIndex === cellIdx
                return (
                  <div
                    key={cellIdx}
                    className={`relative rounded-lg p-2.5 text-center transition-all duration-200 border ${
                      isCurrent
                        ? 'border-cyan-400 bg-cyan-950/70 shadow-[0_0_12px_rgba(34,211,238,0.4)] scale-105'
                        : isPassed
                          ? 'border-teal-500/50 bg-teal-950/40 text-teal-300'
                          : 'border-slate-800 bg-slate-950/50 text-slate-600'
                    }`}
                  >
                    <div className="text-[9px] font-mono uppercase text-slate-400">MOD {cellIdx + 1}</div>
                    <div className="mt-1 flex justify-center">
                      <div
                        className={`h-6 w-3 rounded-xs border transition-all ${
                          isPassed || isCurrent
                            ? 'bg-gradient-to-t from-teal-500 to-cyan-300 border-cyan-400'
                            : 'bg-slate-800 border-slate-700'
                        }`}
                      />
                    </div>
                    <div className="mt-1 text-[9px] font-mono">
                      {isCurrent ? (
                        <span className="text-cyan-300 animate-pulse">SCAN</span>
                      ) : isPassed ? (
                        <span className="text-teal-400">OK</span>
                      ) : (
                        <span>IDLE</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-3 relative h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-gradient-to-r from-teal-500 via-cyan-400 to-emerald-400 transition-all duration-75 ease-out shadow-[0_0_10px_rgba(45,212,191,0.5)]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Real-time Diagnostics Steps */}
        <div className="relative z-10 space-y-2">
          {SCAN_STEPS.map((s, idx) => {
            const isCompleted = currentStepIndex > idx || progress === 100
            const isCurrent = currentStepIndex === idx && progress < 100

            return (
              <div
                key={s.step}
                className={`flex items-start gap-3 rounded-xl p-2.5 transition-all text-xs ${
                  isCurrent
                    ? 'border border-cyan-500/40 bg-cyan-950/30 text-cyan-100 shadow-sm'
                    : isCompleted
                      ? 'border border-teal-500/20 bg-teal-950/20 text-slate-300'
                      : 'border border-transparent text-slate-500 opacity-60'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {isCompleted ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : isCurrent ? (
                    <Activity className="h-4 w-4 text-cyan-400 animate-pulse" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border border-slate-700" />
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className={`font-semibold ${isCurrent ? 'text-cyan-200' : isCompleted ? 'text-slate-200' : 'text-slate-500'}`}>
                      {s.title}
                    </span>
                    <span className="font-mono text-[9.5px] uppercase tracking-wider text-slate-400">
                      [{s.tag}]
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-400 leading-snug">
                    {s.desc}
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Bottom Status bar */}
        <div className="relative z-10 mt-5 flex items-center justify-between border-t border-slate-800 pt-3 text-[11px] font-mono text-slate-400">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-teal-400" />
            ISO 12405 / SAE J2464 Safety Compliant
          </span>
          <span className="animate-pulse text-cyan-400 font-semibold">
            {progress < 100 ? 'Synthesizing Neural Passport...' : 'Analysis Complete! Launching Report...'}
          </span>
        </div>
      </div>
    </div>
  )
}
