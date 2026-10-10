/**
 * EVolve AI — Fleet Owner Onboarding (Welcome Page)
 *
 * Requirements:
 *   - Heading: "Welcome to Fleet Intelligence"
 *   - Description: "Upload your own electric vehicle battery dataset to analyse your fleet."
 *   - Clear explanation of supported file formats and required columns.
 *   - Privacy notice explaining how uploaded data is processed and stored.
 *   - Button: "Upload Fleet Dataset"
 *   - Secondary option: "Back to Individual Battery Prediction"
 *   - Does not preload or hardcode any sample fleet data.
 */

import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Lock,
  RotateCcw,
  Truck,
  UploadCloud,
} from 'lucide-react'

export default function FleetWelcome() {
  const schemaGuide = [
    {
      col: 'Vehicle Identifier',
      req: 'Required',
      desc: 'Unique VIN, vehicle ID, or registration number (e.g. EV-101, TS09AB1234).',
      example: 'EV-101',
    },
    {
      col: 'Vehicle Model',
      req: 'Optional',
      desc: 'Make and model to look up manufacturer battery specifications automatically.',
      example: 'Tata Nexon EV',
    },
    {
      col: 'Odometer (km)',
      req: 'Optional',
      desc: 'Cumulative kilometers driven for wear & cycle estimation.',
      example: '42,500',
    },
    {
      col: 'Months in Service',
      req: 'Optional',
      desc: 'Fleet operational age in months (or purchase year).',
      example: '24',
    },
    {
      col: 'Battery Telemetry',
      req: 'Optional',
      desc: 'SOH %, cell temperatures, voltage spread (mV), or DC internal resistance if available from BMS.',
      example: 'SOH: 88.5%, Temp: 34°C',
    },
  ]

  return (
    <div className="min-h-screen bg-cream text-ink-900 pb-20">
      {/* Hero Header */}
      <section className="relative overflow-hidden pt-10 pb-12 sm:pt-16 sm:pb-16 border-b border-ink-100 bg-white">
        <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[800px] -translate-x-1/2 rounded-full bg-gradient-to-b from-brand-500/10 via-emerald-500/5 to-transparent blur-3xl" />

        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3.5 py-1 text-xs font-semibold text-brand-700">
            <Truck className="h-4 w-4" />
            <span>Multi-Vehicle Battery Intelligence</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-ink-900">
            Welcome to{' '}
            <span className="bg-gradient-to-r from-brand-600 via-teal-600 to-emerald-600 bg-clip-text text-transparent">
              Fleet Intelligence
            </span>
          </h1>

          <p className="mx-auto max-w-2xl text-base sm:text-lg text-ink-600 leading-relaxed">
            Upload your own electric vehicle battery dataset to analyse your fleet. Identify packs requiring attention,
            forecast remaining useful life, and plan preventive second-life transitions with institutional transparency.
          </p>

          <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/fleet/upload"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3.5 text-sm font-bold text-white shadow-2xs hover:bg-brand-700 transition-all hover:scale-102"
            >
              <UploadCloud className="h-4 w-4" />
              <span>Upload Fleet Dataset</span>
              <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              to="/customer/battery"
              className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-5 py-3.5 text-sm font-semibold text-ink-700 hover:bg-ink-50 transition-all shadow-2xs"
            >
              <RotateCcw className="h-4 w-4 text-brand-600" />
              <span>Back to Individual Battery Prediction</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Main Content Details */}
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 mt-10 space-y-8">
        {/* Format & Column Requirements */}
        <div className="rounded-2xl border border-ink-100 bg-white p-6 sm:p-8 shadow-2xs">
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-xl bg-brand-50 p-2.5 text-brand-600 border border-brand-100">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink-900">Supported Dataset Format & Structure</h2>
              <p className="text-xs text-ink-500">How to format your vehicle records for automatic feature mapping</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-4">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-500">File Type</span>
              <p className="mt-1 text-sm font-bold text-ink-900">Standard CSV (.csv)</p>
              <p className="text-xs text-ink-500 mt-1">Comma-separated UTF-8 values up to 15 MB in size.</p>
            </div>
            <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-4">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-500">Minimum Requirement</span>
              <p className="mt-1 text-sm font-bold text-ink-900">Unique Identifier</p>
              <p className="text-xs text-ink-500 mt-1">Each row must represent a distinct vehicle or pack.</p>
            </div>
            <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-4">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-500">Flexible Inputs</span>
              <p className="mt-1 text-sm font-bold text-ink-900">Automated Estimation</p>
              <p className="text-xs text-ink-500 mt-1">Missing technical metrics are estimated using domain physics.</p>
            </div>
          </div>

          {/* Column Breakdown Table */}
          <div className="overflow-x-auto rounded-xl border border-ink-100">
            <table className="w-full text-left text-xs">
              <thead className="bg-ink-50 text-ink-600 border-b border-ink-100 font-semibold">
                <tr>
                  <th className="py-3 px-4">Feature / Column</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Example Values</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 text-ink-700">
                {schemaGuide.map((item, idx) => (
                  <tr key={idx} className="hover:bg-ink-50/40 transition">
                    <td className="py-3 px-4 font-semibold text-ink-900">{item.col}</td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold ${
                          item.req === 'Required'
                            ? 'bg-brand-100 text-brand-800 border border-brand-200'
                            : 'bg-ink-100 text-ink-600'
                        }`}
                      >
                        {item.req}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-ink-600">{item.desc}</td>
                    <td className="py-3 px-4 font-mono text-ink-800">{item.example}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Privacy & Security Notice */}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-emerald-600 p-2.5 text-white shadow-2xs shrink-0">
              <Lock className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-bold text-emerald-950">
                Privacy Notice: Private Fleet Processing & Storage
              </h3>
              <p className="text-xs sm:text-sm text-emerald-900 leading-relaxed">
                Your uploaded fleet data remains <strong>completely private</strong> and strictly isolated to your
                account. Datasets are processed locally using deterministic ML inference models and are never shared
                with outside parties or published to open circular marketplaces.
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 text-xs text-emerald-800">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Formula injection sanitization on all cells</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Zero preloaded demo records forced into your view</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Audit report download for uncorrected rows</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Permanent, single-click dataset deletion at any time</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* CTA Banner */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-900 to-ink-900 p-6 text-white shadow-2xs">
          <div>
            <h4 className="text-base font-bold">Have your vehicle CSV file ready?</h4>
            <p className="text-xs text-brand-200 mt-1">
              Upload your dataset to inspect column mappings and preview validation diagnostics before analysis.
            </p>
          </div>
          <Link
            to="/fleet/upload"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs sm:text-sm px-5 py-3 transition shadow-2xs whitespace-nowrap"
          >
            <UploadCloud className="h-4 w-4" />
            <span>Begin Upload & Validation</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
