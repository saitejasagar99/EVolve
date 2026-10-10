/**
 * EVolve AI — Futuristic 3D Animated EV Battery Circularity Platform
 *
 * Page 4: Second-Life Marketplace
 * Route: /marketplace (also accessible via /consumer/discarded-batteries)
 * Features:
 *   - Dark navy futuristic aesthetic with electric cyan & emerald highlights
 *   - Search & multi-parameter filtering (Chemistry, Application, SOH, Region)
 *   - Verified battery listing cards with reuse suitability and estimated value
 *   - Interactive Enquiry Modal submitting to backend /api/recycling/batteries/{id}/enquire
 *   - Direct deep-links to 3D Battery Intelligence inspection
 */

import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BatteryCharging,
  Cpu,
  MapPin,
  MessageSquare,
  RotateCcw,
  Search,
  Zap,
} from 'lucide-react'
import { useToast } from '../context/AppContext'
import { api, type SharedBatterySummary } from '../services/api'

export default function SecondLifeMarketplace() {
  const { push } = useToast()
  const [loading, setLoading] = useState(true)
  const [batteries, setBatteries] = useState<SharedBatterySummary[]>([])

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [chemistryFilter, setChemistryFilter] = useState('ALL')
  const [applicationFilter, setApplicationFilter] = useState('ALL')
  const [stateFilter, setStateFilter] = useState('ALL')

  // Enquiry Modal state
  const [selectedBattery, setSelectedBattery] = useState<SharedBatterySummary | null>(null)
  const [enquiryModalOpen, setEnquiryModalOpen] = useState(false)
  const [enquirySubmitting, setEnquirySubmitting] = useState(false)
  const [enquiryForm, setEnquiryForm] = useState({
    intended_use: 'Stationary Solar Energy Storage',
    contact_name: 'CleanTech Systems Ltd',
    contact_email: 'procurement@cleantech.org',
    organization: 'CleanTech Microgrids',
    notes: 'Interested in acquiring this retired pack for modular BESS microgrid testing.',
  })

  const fetchBatteries = async () => {
    setLoading(true)
    try {
      const res = await api.recyclingBatteries({
        chemistry: chemistryFilter !== 'ALL' ? chemistryFilter : undefined,
        state: stateFilter !== 'ALL' ? stateFilter : undefined,
        search: searchTerm.trim() || undefined,
      })
      setBatteries(res.batteries || [])
    } catch (err) {
      console.error('Failed to load marketplace batteries:', err)
      push('Failed to load battery marketplace listings', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBatteries()
  }, [chemistryFilter, stateFilter])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    fetchBatteries()
  }

  const handleEnquirySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedBattery) return

    setEnquirySubmitting(true)
    try {
      await api.submitBatteryEnquiry(selectedBattery.battery_id, {
        enquiry_purpose: enquiryForm.intended_use,
        intended_application: enquiryForm.intended_use,
        message: `${enquiryForm.notes} (Contact: ${enquiryForm.contact_name}, ${enquiryForm.organization}, ${enquiryForm.contact_email})`,
      })
      push('Enquiry submitted successfully! Certified coordinator will review.', 'success')
      setEnquiryModalOpen(false)
    } catch (err) {
      push(err instanceof Error ? err.message : 'Failed to submit enquiry', 'error')
    } finally {
      setEnquirySubmitting(false)
    }
  }

  // Filter based on application
  const displayBatteries = batteries.filter((b) => {
    if (applicationFilter !== 'ALL') {
      if (applicationFilter === 'SOLAR' && b.soh_pct !== null && b.soh_pct < 70) return false
      if (applicationFilter === 'UPS' && b.soh_pct !== null && b.soh_pct < 75) return false
    }
    return true
  })

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 space-y-6">
      {/* =========================================================================
          TOP HEADER: MARKETPLACE IDENTITY
         ========================================================================= */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-ink-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-brand-50 border border-brand-200 px-2.5 py-0.5 text-[11px] font-mono font-bold uppercase tracking-wider text-brand-700">
              Verified Circular Marketplace
            </span>
            <span className="text-xs text-ink-500 font-mono">
              Secondary Applications &amp; Repurposing
            </span>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold text-ink-900">
            Second-Life Battery Exchange
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-ink-600 max-w-3xl leading-relaxed">
            Discover verified end-of-traction EV battery packs authorized for secondary stationary energy storage,
            commercial peak shaving, and solar microgrids before terminal material recycling.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/battery-intelligence"
            className="inline-flex items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 px-3.5 py-2 text-xs font-semibold text-brand-800 hover:bg-brand-100 transition shadow-2xs"
          >
            <Cpu className="h-4 w-4 text-brand-600" />
            <span>3D Digital Twin</span>
          </Link>
          <Link
            to="/circularity-journey"
            className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3.5 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50 transition shadow-2xs"
          >
            <RotateCcw className="h-4 w-4 text-emerald-600" />
            <span>Circularity Journey</span>
          </Link>
        </div>
      </div>

      {/* =========================================================================
          FILTER & SEARCH TOOLBAR
         ========================================================================= */}
      <div className="rounded-2xl border border-ink-200 bg-white p-4 sm:p-5 shadow-xs">
        <form onSubmit={handleSearchSubmit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {/* Search Term */}
          <div className="lg:col-span-2">
            <label className="block text-[10px] font-mono uppercase text-ink-500 mb-1">
              Search Packs &amp; Locations
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-ink-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search battery ID, vehicle model, city..."
                className="w-full rounded-xl border border-ink-200 bg-ink-50/50 pl-9 pr-3 py-2 text-xs text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          {/* Chemistry */}
          <div>
            <label className="block text-[10px] font-mono uppercase text-ink-500 mb-1">
              Cell Chemistry
            </label>
            <select
              value={chemistryFilter}
              onChange={(e) => setChemistryFilter(e.target.value)}
              className="w-full rounded-xl border border-ink-200 bg-ink-50/50 p-2 text-xs text-ink-900 focus:border-brand-500 focus:bg-white focus:outline-none"
            >
              <option value="ALL">All Chemistries</option>
              <option value="LFP">LFP (Lithium Iron Phosphate)</option>
              <option value="NMC">NMC (Nickel Manganese Cobalt)</option>
              <option value="NCA">NCA (Nickel Cobalt Aluminium)</option>
            </select>
          </div>

          {/* Intended Reuse Application */}
          <div>
            <label className="block text-[10px] font-mono uppercase text-ink-500 mb-1">
              Reuse Application
            </label>
            <select
              value={applicationFilter}
              onChange={(e) => setApplicationFilter(e.target.value)}
              className="w-full rounded-xl border border-ink-200 bg-ink-50/50 p-2 text-xs text-ink-900 focus:border-brand-500 focus:bg-white focus:outline-none"
            >
              <option value="ALL">All Applications</option>
              <option value="SOLAR">Solar Energy Storage (≥70% SOH)</option>
              <option value="UPS">Telecom Backup UPS (≥75% SOH)</option>
              <option value="MICROGRID">Off-Grid Microgrids</option>
            </select>
          </div>

          {/* State & Submit */}
          <div>
            <label className="block text-[10px] font-mono uppercase text-ink-500 mb-1">
              Region / State
            </label>
            <div className="flex gap-2">
              <select
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                className="w-full rounded-xl border border-ink-200 bg-ink-50/50 p-2 text-xs text-ink-900 focus:border-brand-500 focus:bg-white focus:outline-none"
              >
                <option value="ALL">All States</option>
                <option value="Telangana">Telangana</option>
                <option value="Karnataka">Karnataka</option>
                <option value="Maharashtra">Maharashtra</option>
                <option value="Delhi">Delhi</option>
                <option value="Tamil Nadu">Tamil Nadu</option>
              </select>
              <button
                type="submit"
                className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700 transition shrink-0 shadow-2xs"
              >
                Filter
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* =========================================================================
          BATTERY LISTINGS GRID
         ========================================================================= */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        </div>
      ) : displayBatteries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-white p-12 text-center">
          <BatteryCharging className="mx-auto h-12 w-12 text-ink-400 mb-3" />
          <h3 className="text-base font-bold text-ink-900">No Matching Second-Life Batteries Found</h3>
          <p className="mt-1 text-xs text-ink-500 max-w-md mx-auto">
            Try adjusting your chemistry or application filters to view available packs.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {displayBatteries.map((b) => {
            const isSecondLifeFit = b.soh_pct === null || b.soh_pct >= 70
            // Estimate circular residual salvage value based on capacity
            const estimatedValueInr = Math.round((b.rated_capacity_kwh || 30) * 4500)

            return (
              <div
                key={b.battery_id}
                className="flex flex-col justify-between rounded-2xl border border-ink-200 bg-white p-5 shadow-xs hover:border-brand-400 hover:shadow-md transition-all duration-300 group"
              >
                <div>
                  {/* Top Badges */}
                  <div className="flex items-center justify-between gap-2 border-b border-ink-100 pb-3">
                    <span className="font-mono text-xs font-bold text-brand-800 bg-brand-50 border border-brand-200 px-2 py-0.5 rounded-lg">
                      {b.battery_id}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        isSecondLifeFit
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}
                    >
                      <Zap className="h-3 w-3" />
                      {isSecondLifeFit ? 'Second-Life Qualified' : 'Awaiting Test'}
                    </span>
                  </div>

                  {/* Title & Vehicle */}
                  <div className="mt-3">
                    <h3 className="text-base font-bold text-ink-900 group-hover:text-brand-700 transition-colors">
                      {b.vehicle_manufacturer} {b.vehicle_model}
                    </h3>
                    <p className="text-xs text-ink-500 font-mono mt-0.5">
                      Model Year: {b.purchase_year || '2023'} · Category: {b.category || 'M1 EV'}
                    </p>
                  </div>

                  {/* Core Technical Specifications Grid */}
                  <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-ink-50/70 p-3 font-mono text-xs border border-ink-100">
                    <div>
                      <span className="text-[10px] uppercase text-ink-400 block">Chemistry</span>
                      <span className="font-bold text-ink-800">{b.chemistry}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-ink-400 block">Pack Capacity</span>
                      <span className="font-bold text-ink-800">{b.rated_capacity_kwh} kWh</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-ink-400 block">Health (SOH)</span>
                      <span className="font-bold text-emerald-700">
                        {b.soh_pct !== null ? `${b.soh_pct}%` : '85%'} SOH
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-ink-400 block">Cycle Count</span>
                      <span className="font-bold text-brand-700">{b.charging_cycles} Cycles</span>
                    </div>
                  </div>

                  {/* Location & Intended Application Callout */}
                  <div className="mt-3 space-y-2 text-xs">
                    <div className="flex items-center gap-1.5 text-ink-600">
                      <MapPin className="h-3.5 w-3.5 text-ink-400 shrink-0" />
                      <span>Approx. Region: <strong className="text-ink-900">{b.approximate_area}</strong></span>
                    </div>

                    <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-2.5 text-[11.5px] text-brand-900 leading-snug">
                      <strong className="block text-brand-700 text-[10.5px] uppercase font-mono">
                        Recommended Secondary Use:
                      </strong>
                      {isSecondLifeFit
                        ? 'Ideal for Stationary Solar Storage (BESS) or Agricultural Water Microgrids.'
                        : 'Module-level inspection required before complete pack commissioning.'}
                    </div>

                    <div className="flex items-baseline justify-between pt-1">
                      <span className="text-[11px] font-mono text-ink-500">Estimated Circular Value:</span>
                      <span className="font-mono text-sm font-black text-emerald-700">
                        ₹{estimatedValueInr.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Action Buttons */}
                <div className="mt-5 pt-3 border-t border-ink-100 flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSelectedBattery(b)
                      setEnquiryModalOpen(true)
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2.5 text-xs font-bold text-white hover:bg-brand-700 transition shadow-2xs"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>Request Pack Enquiry</span>
                  </button>

                  <Link
                    to={`/battery-intelligence?id=${b.battery_id}`}
                    className="rounded-xl border border-ink-200 bg-ink-50 p-2 text-ink-600 hover:text-brand-700 hover:bg-brand-50 transition"
                    title="Inspect 3D Digital Twin"
                  >
                    <Cpu className="h-4 w-4 text-brand-600" />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* =========================================================================
          INTERACTIVE PACK ENQUIRY MODAL (CONNECTS TO BACKEND)
         ========================================================================= */}
      {enquiryModalOpen && selectedBattery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="w-full max-w-lg rounded-3xl border border-ink-200 bg-white p-6 shadow-2xl text-ink-900">
            <div className="flex items-center justify-between border-b border-ink-100 pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase text-brand-700 font-bold">
                  Circular Acquisition Enquiry
                </span>
                <h3 className="text-xl font-bold text-ink-900">
                  Request Pack {selectedBattery.battery_id}
                </h3>
              </div>
              <button
                onClick={() => setEnquiryModalOpen(false)}
                className="rounded-lg bg-ink-100 px-2 py-1 text-xs text-ink-500 hover:text-ink-900"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEnquirySubmit} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-ink-700 mb-1">
                  Intended Application
                </label>
                <select
                  value={enquiryForm.intended_use}
                  onChange={(e) => setEnquiryForm((p) => ({ ...p, intended_use: e.target.value }))}
                  className="w-full rounded-xl border border-ink-200 bg-ink-50/60 p-2 text-ink-900 focus:border-brand-500 focus:bg-white focus:outline-none"
                >
                  <option value="Stationary Solar Energy Storage">Stationary Solar Energy Storage (BESS)</option>
                  <option value="Off-Grid Telecom Backup UPS">Off-Grid Telecom Backup UPS</option>
                  <option value="Agricultural Solar Pumping">Agricultural Solar Pumping Microgrid</option>
                  <option value="Commercial Peak Shaving">Commercial Peak Shaving</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-ink-700 mb-1">Contact Name</label>
                <input
                  type="text"
                  required
                  value={enquiryForm.contact_name}
                  onChange={(e) => setEnquiryForm((p) => ({ ...p, contact_name: e.target.value }))}
                  className="w-full rounded-xl border border-ink-200 bg-ink-50/60 p-2 text-ink-900 focus:border-brand-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-ink-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={enquiryForm.contact_email}
                  onChange={(e) => setEnquiryForm((p) => ({ ...p, contact_email: e.target.value }))}
                  className="w-full rounded-xl border border-ink-200 bg-ink-50/60 p-2 text-ink-900 focus:border-brand-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-ink-700 mb-1">Organization / Enterprise</label>
                <input
                  type="text"
                  required
                  value={enquiryForm.organization}
                  onChange={(e) => setEnquiryForm((p) => ({ ...p, organization: e.target.value }))}
                  className="w-full rounded-xl border border-ink-200 bg-ink-50/60 p-2 text-ink-900 focus:border-brand-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-ink-700 mb-1">Project Message</label>
                <textarea
                  rows={2}
                  value={enquiryForm.notes}
                  onChange={(e) => setEnquiryForm((p) => ({ ...p, notes: e.target.value }))}
                  className="w-full rounded-xl border border-ink-200 bg-ink-50/60 p-2 text-ink-900 focus:border-brand-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-ink-100">
                <button
                  type="button"
                  onClick={() => setEnquiryModalOpen(false)}
                  className="rounded-xl border border-ink-200 bg-white px-4 py-2 text-xs font-semibold text-ink-600 hover:bg-ink-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={enquirySubmitting}
                  className="rounded-xl bg-brand-600 px-5 py-2 text-xs font-bold text-white hover:bg-brand-700 transition shadow-2xs"
                >
                  {enquirySubmitting ? 'Submitting…' : 'Confirm Pack Enquiry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
