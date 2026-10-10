/**
 * Recharts wrappers.
 *
 * Every chart takes backend data as props and renders nothing but what it is
 * given - no chart seeds a hardcoded series. When data is empty each component
 * shows an explicit empty state rather than an empty axis.
 */

import {
  Area,
  AreaChart,
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart as RLineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ReactNode } from 'react'
import { EmptyState } from './ui'

const GRID = '#e2e8f0'
const AXIS = '#94a3b8'
const FONT = { fontSize: 11, fill: AXIS }

const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  fontSize: 12,
  boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
  padding: '6px 10px',
}

export function EolForecastChart({
  data,
  thresholds,
}: {
  data: Array<{ label: string; expected_eol: number; cumulative_eol: number }>
  thresholds: { eol: number; critical: number }
}) {
  if (!data?.length) return <EmptyState message="No forecast available" />
  return (
    <ResponsiveContainer width="100%" height={230}>
      <RBarChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={FONT} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis tick={FONT} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <ReferenceLine
          y={0}
          stroke={GRID}
        />
        <Bar dataKey="expected_eol" name="Expected EOL (units)" radius={[3, 3, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.expected_eol >= thresholds.eol ? '#f43f5e' : '#10b981'} />
          ))}
        </Bar>
      </RBarChart>
    </ResponsiveContainer>
  )
}

export function CumulativeEolChart({
  data,
}: {
  data: Array<{ label: string; cumulative_eol: number }>
}) {
  if (!data?.length) return <EmptyState message="No forecast available" />
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 4, right: 6, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={FONT} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis tick={FONT} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Area
          type="monotone"
          dataKey="cumulative_eol"
          name="Cumulative EOL"
          stroke="#047857"
          strokeWidth={2}
          fill="url(#cumFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function PathwayDonut({
  data,
}: {
  data: Array<{ name: string; value: number; fill: string }>
}) {
  const total = data.reduce((a, d) => a + d.value, 0)
  if (!total) return <EmptyState message="No batteries to classify" />
  return (
    <div className="flex flex-wrap items-center gap-5">
      <ResponsiveContainer width="52%" height={190}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={52}
            outerRadius={80}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((d) => (
              <Cell key={d.name} fill={d.fill} />
            ))}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="flex-1 space-y-1.5">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2 text-[12.5px]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.fill }} />
            <span className="flex-1 text-ink-700">{d.name}</span>
            <span className="font-semibold tnum text-ink-900">{d.value}</span>
            <span className="w-10 text-right tnum text-ink-400">
              {((d.value / total) * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function DegradationLineChart({
  data,
  eolThreshold,
}: {
  data: Array<{ month_index: number; soh_pct: number | null }>
  eolThreshold: number
}) {
  const clean = data.filter((d) => d.soh_pct !== null)
  if (clean.length < 2)
    return <EmptyState message="Not enough history to plot a trend" hint="At least 2 readings are required." />
  return (
    <ResponsiveContainer width="100%" height={210}>
      <RLineChart data={clean} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="month_index" tick={FONT} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis
          tick={FONT}
          axisLine={false}
          tickLine={false}
          domain={['dataMin - 5', 'dataMax + 5']}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <ReferenceLine
          y={eolThreshold}
          stroke="#f43f5e"
          strokeDasharray="5 4"
          label={{ value: `EOL ${eolThreshold}%`, position: 'insideTopRight', fontSize: 10, fill: '#f43f5e' }}
        />
        <Line
          type="monotone"
          dataKey="soh_pct"
          name="SOH %"
          stroke="#059669"
          strokeWidth={2}
          dot={{ r: 2, fill: '#059669' }}
          activeDot={{ r: 4 }}
        />
      </RLineChart>
    </ResponsiveContainer>
  )
}

export function PriorityBarChart({
  data,
}: {
  data: Array<{ battery_id: string; priority_score: number; zone: string }>
}) {
  if (!data?.length) return <EmptyState message="No EOL candidates to prioritise" />
  const top = data.slice(0, 12)
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, top.length * 26)}>
      <RBarChart data={top} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" tick={FONT} axisLine={false} tickLine={false} domain={[0, 100]} />
        <YAxis
          type="category"
          dataKey="battery_id"
          tick={{ ...FONT, fontSize: 10.5 }}
          axisLine={false}
          tickLine={false}
          width={72}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(v: number, _n, p) => [`${v.toFixed(1)}`, `Priority (${p?.payload?.zone ?? ''})`]}
        />
        <Bar dataKey="priority_score" radius={[0, 3, 3, 0]}>
          {top.map((d) => (
            <Cell
              key={d.battery_id}
              fill={
                d.priority_score >= 70
                  ? '#e11d48'
                  : d.priority_score >= 50
                    ? '#f97316'
                    : d.priority_score >= 30
                      ? '#f59e0b'
                      : '#94a3b8'
              }
            />
          ))}
        </Bar>
      </RBarChart>
    </ResponsiveContainer>
  )
}

export function CapacityBarChart({
  data,
}: {
  data: Array<{ label: string; inflow: number; capacity: number }>
}) {
  if (!data?.length) return <EmptyState message="No capacity data" />
  return (
    <ResponsiveContainer width="100%" height={200}>
      <RBarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={FONT} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis tick={FONT} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="inflow" name="Predicted inflow / month" fill="#f43f5e" radius={[3, 3, 0, 0]} />
        <Bar dataKey="capacity" name="Available capacity / month" fill="#10b981" radius={[3, 3, 0, 0]} />
      </RBarChart>
    </ResponsiveContainer>
  )
}

export function ZoneBarChart({
  data,
}: {
  data: Array<{ zone: string; eol_next_3: number; eol_next_6: number; eol_next_12: number }>
}) {
  if (!data?.length) return <EmptyState message="No zone data" />
  return (
    <ResponsiveContainer width="100%" height={230}>
      <RBarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="zone"
          tick={{ ...FONT, fontSize: 10 }}
          axisLine={{ stroke: GRID }}
          tickLine={false}
          angle={-12}
          textAnchor="end"
          height={52}
          interval={0}
        />
        <YAxis tick={FONT} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="eol_next_3" name="≤3 months" stackId="a" fill="#e11d48" radius={[0, 0, 0, 0]} />
        <Bar dataKey="eol_next_6" name="4–6 months" stackId="a" fill="#f97316" />
        <Bar dataKey="eol_next_12" name="7–12 months" stackId="a" fill="#f59e0b" radius={[3, 3, 0, 0]} />
      </RBarChart>
    </ResponsiveContainer>
  )
}

export function ScenarioCompareChart({
  data,
  metric,
}: {
  data: Array<{ label: string; baseline: number; scenario: number }>
  metric: string
}) {
  if (!data?.length) return <EmptyState message="No scenario comparison" />
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 34)}>
      <RBarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" tick={FONT} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="label"
          tick={{ ...FONT, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={128}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [v.toFixed(1), '']} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="baseline" name={`Current ${metric}`} fill="#94a3b8" radius={[0, 3, 3, 0]} />
        <Bar dataKey="scenario" name={`Scenario ${metric}`} fill="#059669" radius={[0, 3, 3, 0]} />
      </RBarChart>
    </ResponsiveContainer>
  )
}

export function AvoidanceTrendChart({
  data,
}: {
  data: Array<{ label: string; retained: number; eol: number }>
}) {
  if (!data?.length) return <EmptyState message="No pathway data" />
  return (
    <ResponsiveContainer width="100%" height={210}>
      <RBarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={FONT} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis tick={FONT} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="retained" name="Retained from waste" stackId="p" fill="#10b981" />
        <Bar dataKey="eol" name="EOL candidate" stackId="p" fill="#f43f5e" radius={[3, 3, 0, 0]} />
      </RBarChart>
    </ResponsiveContainer>
  )
}

export function ChartFrame({
  title,
  children,
  aside,
}: {
  title: string
  children: ReactNode
  aside?: ReactNode
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-ink-800">{title}</h3>
        {aside}
      </div>
      {children}
    </div>
  )
}