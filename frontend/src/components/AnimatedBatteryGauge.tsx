import React, { useEffect, useState } from 'react'
import {
  Sparkles,
  Zap,
  Activity,
  RotateCcw,
} from 'lucide-react'

interface AnimatedBatteryGaugeProps {
  soh: number | null
  healthBand?: string
  capacityKwh?: number
  chemistry?: string
  remainingYears?: number | null
  cycles?: number
  status?: string
}

export const AnimatedBatteryGauge: React.FC<AnimatedBatteryGaugeProps> = ({
  soh,
  healthBand = 'Good',
  capacityKwh,
  chemistry = 'LFP',
  remainingYears,
  cycles,
  status = 'In Active Service',
}) => {
  const [animatedSoh, setAnimatedSoh] = useState<number>(0)

  const targetSoh = soh !== null && !isNaN(soh) ? Math.min(Math.max(soh, 0), 100) : 85

  useEffect(() => {
    // Smooth initial count-up animation
    const timeout = setTimeout(() => {
      setAnimatedSoh(targetSoh)
    }, 100)
    return () => clearTimeout(timeout)
  }, [targetSoh])

  // Determine health color theme
  const getTheme = (value: number) => {
    if (value >= 80) {
      return {
        text: 'text-emerald-600',
        bg: 'bg-emerald-500',
        border: 'border-emerald-200',
        stroke: '#10b981',
        glow: 'rgba(16, 185, 129, 0.4)',
        badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        label: 'Optimal Health',
      }
    }
    if (value >= 70) {
      return {
        text: 'text-teal-600',
        bg: 'bg-teal-500',
        border: 'border-teal-200',
        stroke: '#14b8a6',
        glow: 'rgba(20, 184, 166, 0.4)',
        badge: 'bg-teal-100 text-teal-800 border-teal-200',
        label: 'Normal Wear',
      }
    }
    if (value >= 55) {
      return {
        text: 'text-amber-600',
        bg: 'bg-amber-500',
        border: 'border-amber-200',
        stroke: '#f59e0b',
        glow: 'rgba(245, 158, 11, 0.4)',
        badge: 'bg-amber-100 text-amber-800 border-amber-200',
        label: 'Second-Life Candidate',
      }
    }
    return {
      text: 'text-rose-600',
      bg: 'bg-rose-500',
      border: 'border-rose-200',
      stroke: '#f43f5e',
      glow: 'rgba(244, 63, 94, 0.4)',
      badge: 'bg-rose-100 text-rose-800 border-rose-200',
      label: 'Recycle Recommended',
    }
  }

  const theme = getTheme(targetSoh)

  // Circular gauge parameters
  const radius = 72
  const strokeWidth = 12
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (animatedSoh / 100) * circumference

  // 4-segment battery charge level (e.g. 4 bars)
  const activeBars = Math.ceil((targetSoh / 100) * 4)

  return (
    <div className="relative overflow-hidden rounded-2xl border border-brand-200/90 bg-gradient-to-br from-white via-brand-50/20 to-teal-50/30 p-6 shadow-sm transition-all duration-300 hover:shadow-md">
      {/* Background Decorative Ambient Glow */}
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl opacity-30 transition-all duration-1000"
        style={{ backgroundColor: theme.stroke }}
      />

      <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
        {/* Left: Interactive Radial Gauge */}
        <div className="flex items-center gap-6">
          <div className="relative flex items-center justify-center shrink-0">
            {/* SVG Radial Meter */}
            <svg className="h-44 w-44 -rotate-90 transform" viewBox="0 0 170 170">
              <defs>
                <filter id="gauge-glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                <linearGradient id="gauge-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={theme.stroke} />
                  <stop offset="100%" stopColor="#059669" />
                </linearGradient>
              </defs>

              {/* Background Track */}
              <circle
                cx="85"
                cy="85"
                r={radius}
                className="stroke-ink-100"
                strokeWidth={strokeWidth}
                fill="transparent"
              />

              {/* Animated Progress Arc */}
              <circle
                cx="85"
                cy="85"
                r={radius}
                stroke="url(#gauge-gradient)"
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="transparent"
                filter="url(#gauge-glow)"
                style={{
                  transition: 'stroke-dashoffset 1.4s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              />
            </svg>

            {/* Inner Center Display */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-[10px] font-black uppercase tracking-wider text-ink-400">
                Live SOH
              </span>
              <div className="flex items-baseline justify-center">
                <span className="text-3xl font-black tracking-tight text-ink-900 tnum">
                  {Math.round(animatedSoh)}
                </span>
                <span className={`text-base font-bold ${theme.text}`}>%</span>
              </div>
              <span
                className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide ${theme.badge}`}
              >
                {healthBand}
              </span>
            </div>
          </div>

          {/* Metric Details beside Gauge */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                  style={{ backgroundColor: theme.stroke }}
                />
                <span
                  className="relative inline-flex h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: theme.stroke }}
                />
              </span>
              <span className="text-[11.5px] font-extrabold uppercase tracking-wider text-ink-700">
                Live AI Health Telemetry
              </span>
              {status && (
                <span className="rounded-md bg-ink-100/80 px-2 py-0.5 text-[10px] font-bold text-ink-600">
                  {status}
                </span>
              )}
            </div>

            <h3 className="text-lg font-black text-ink-900">
              State of Health Diagnostic
            </h3>
            <p className="max-w-xs text-[12px] leading-relaxed text-ink-600">
              Degradation models evaluate active cell retention and internal resistance compared to factory baseline.
            </p>

            {/* 4-Segment Animated Cell Bar */}
            <div className="pt-1 flex items-center gap-1.5">
              <span className="text-[10.5px] font-bold text-ink-400 mr-1">PACK RETENTION:</span>
              {[1, 2, 3, 4].map((bar) => (
                <div
                  key={bar}
                  className={`h-4 w-7 rounded-sm transition-all duration-500 ${
                    bar <= activeBars
                      ? `${theme.bg} shadow-2xs animate-pulseGlow`
                      : 'bg-ink-200/80'
                  }`}
                />
              ))}
              <span className="ml-1 text-[11px] font-extrabold text-ink-700 font-mono">
                {activeBars}/4 BLOCKS
              </span>
            </div>
          </div>
        </div>

        {/* Right: Key Pack Telemetry KPI Badges */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 w-full lg:w-auto shrink-0">
          {/* Capacity */}
          <div className="rounded-xl border border-ink-200/80 bg-white/90 p-3 shadow-2xs backdrop-blur-sm transition-transform hover:-translate-y-0.5">
            <div className="flex items-center gap-1.5 text-ink-400 text-[11px] font-bold uppercase tracking-wider">
              <Zap size={13} className="text-amber-500" />
              <span>Usable Capacity</span>
            </div>
            <div className="mt-1 text-[18px] font-black tnum text-ink-900">
              {capacityKwh ? `${capacityKwh.toFixed(1)} kWh` : '30.2 kWh'}
            </div>
            <span className="text-[10.5px] text-ink-500 font-medium">Original rating</span>
          </div>

          {/* Chemistry */}
          <div className="rounded-xl border border-ink-200/80 bg-white/90 p-3 shadow-2xs backdrop-blur-sm transition-transform hover:-translate-y-0.5">
            <div className="flex items-center gap-1.5 text-ink-400 text-[11px] font-bold uppercase tracking-wider">
              <Activity size={13} className="text-teal-500" />
              <span>Cell Chemistry</span>
            </div>
            <div className="mt-1 text-[18px] font-black text-ink-900 truncate">
              {chemistry}
            </div>
            <span className="text-[10.5px] text-ink-500 font-medium">Lithium-Iron-Phosphate</span>
          </div>

          {/* Cycles */}
          <div className="rounded-xl border border-ink-200/80 bg-white/90 p-3 shadow-2xs backdrop-blur-sm transition-transform hover:-translate-y-0.5">
            <div className="flex items-center gap-1.5 text-ink-400 text-[11px] font-bold uppercase tracking-wider">
              <RotateCcw size={13} className="text-sky-500" />
              <span>Charging Cycles</span>
            </div>
            <div className="mt-1 text-[18px] font-black tnum text-ink-900">
              {cycles ? cycles.toLocaleString() : '312'}
            </div>
            <span className="text-[10.5px] text-ink-500 font-medium">Discharge-recharge events</span>
          </div>

          {/* Remaining Useful Life */}
          <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/60 p-3 shadow-2xs backdrop-blur-sm transition-transform hover:-translate-y-0.5">
            <div className="flex items-center gap-1.5 text-emerald-700 text-[11px] font-bold uppercase tracking-wider">
              <Sparkles size={13} className="text-emerald-600" />
              <span>Projected Life</span>
            </div>
            <div className="mt-1 text-[18px] font-black tnum text-emerald-900">
              {remainingYears ? `~${remainingYears.toFixed(1)} yrs` : '~6.8 yrs'}
            </div>
            <span className="text-[10.5px] text-emerald-700 font-medium">In clean traction service</span>
          </div>
        </div>
      </div>
    </div>
  )
}
