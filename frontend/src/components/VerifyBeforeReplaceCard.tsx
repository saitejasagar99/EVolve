/**
 * EVolve AI — Verify Before You Replace Card
 *
 * Dedicated vehicle manufacturer support & diagnostic verification card.
 * Displayed whenever battery replacement, module replacement, or second-life
 * retirement is evaluated.
 *
 * Core Principles:
 *  1. Non-Alarmist & Truthful: Replacement is an exploratory evaluation, not yet proven fact.
 *  2. Official Sources Only: No guessed or AI-hallucinated phone numbers.
 *  3. Separation of Concerns: Clear visual distinction between AI statistical prediction,
 *     preliminary cost estimate, and physical diagnostic scan confirmation.
 *  4. Actionable Checklist: 8 canonical questions to ask the manufacturer.
 *  5. Safety Override: Serious safety warnings prioritize stop-use and roadside assistance.
 */

import React, { useState, useEffect } from 'react'
import {
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  ExternalLink,
  FileCheck,
  Globe,
  HelpCircle,
  Info,
  MapPin,
  PhoneCall,
  PhoneOff,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { api } from '../services/api'
import type {
  ManufacturerAdvisory,
  ManufacturerDirectoryItem,
  ManufacturerSupportContact,
} from '../types/api'

interface VerifyBeforeReplaceCardProps {
  initialAdvisory?: ManufacturerAdvisory
  vehicleBrand?: string
  vehicleModel?: string
  modelYear?: number
  reason?: string
  isDiagnosticConfirmed?: boolean
  hasCriticalWarning?: boolean
  className?: string
}

const DEFAULT_QUESTIONS = [
  'Has a diagnostic test confirmed that the battery pack needs replacement?',
  'Can the problem be repaired, or is a module-level repair or replacement supported for this vehicle?',
  'What fault codes or test results justify full-pack replacement?',
  'Is the battery covered by the manufacturer\'s battery warranty?',
  'Is there a software update, service bulletin, recall, or warranty procedure relevant to this issue?',
  'What is the cost of diagnosis, repair, module replacement, and full-pack replacement, where applicable?',
  'Is the proposed replacement pack compatible with this exact vehicle variant?',
  'Can the authorized service centre provide a written diagnostic report and estimate?',
]

export const VerifyBeforeReplaceCard: React.FC<VerifyBeforeReplaceCardProps> = ({
  initialAdvisory,
  vehicleBrand,
  vehicleModel,
  modelYear,
  reason,
  isDiagnosticConfirmed = false,
  hasCriticalWarning = false,
  className = '',
}) => {
  const [advisory, setAdvisory] = useState<ManufacturerAdvisory | null>(
    initialAdvisory || null,
  )
  const [loading, setLoading] = useState(false)
  const [diagnosticConfirmed, setDiagnosticConfirmed] = useState(
    isDiagnosticConfirmed || initialAdvisory?.is_diagnostic_confirmed || false,
  )
  const [criticalWarning] = useState(
    hasCriticalWarning || initialAdvisory?.has_critical_warning || false,
  )

  // Selector state for unknown / changing manufacturer or country
  const [selectedBrand, setSelectedBrand] = useState(
    vehicleBrand || initialAdvisory?.vehicle_info?.brand || 'Tata',
  )
  const [selectedCountry, setSelectedCountry] = useState(
    initialAdvisory?.vehicle_info?.country_code || 'IN',
  )
  const [showSelector, setShowSelector] = useState(false)
  const [directory, setDirectory] = useState<ManufacturerDirectoryItem[]>([])

  // Checklist state
  const [checkedQuestions, setCheckedQuestions] = useState<Record<number, boolean>>({})
  const [copiedChecklist, setCopiedChecklist] = useState(false)
  const [showChecklist, setShowChecklist] = useState(true)

  // Load advisory if not passed or when brand/country changes
  useEffect(() => {
    if (!advisory || selectedBrand !== advisory.vehicle_info.brand) {
      fetchAdvisory(selectedBrand, selectedCountry, diagnosticConfirmed, criticalWarning)
    }
  }, [selectedBrand, selectedCountry, diagnosticConfirmed, criticalWarning])

  // Fetch directory list for manual selection
  useEffect(() => {
    api
      .manufacturerDirectory()
      .then((res) => setDirectory(res.manufacturers))
      .catch(() => setDirectory([]))
  }, [])

  const fetchAdvisory = async (
    brand: string,
    country: string,
    isDiag: boolean,
    isCrit: boolean,
  ) => {
    setLoading(true)
    try {
      const res = await api.manufacturerSupport({
        brand,
        country,
        model: vehicleModel,
        diagnostic_confirmed: isDiag,
        critical_warning: isCrit,
      })
      setAdvisory(res)
    } catch (err) {
      console.warn('Failed to fetch manufacturer support advisory:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleQuestion = (idx: number) => {
    setCheckedQuestions((prev) => ({ ...prev, [idx]: !prev[idx] }))
  }

  const copyQuestionsToClipboard = () => {
    const questions = advisory?.questions_to_ask || DEFAULT_QUESTIONS
    const text = [
      `EVolve AI — Questions to Ask Vehicle Manufacturer Before Replacing Battery`,
      `Vehicle: ${selectedBrand} ${vehicleModel || ''} (${selectedCountry})`,
      `----------------------------------------------------------------------`,
      ...questions.map((q, i) => `${i + 1}. [${checkedQuestions[i] ? 'X' : ' '}] ${q}`),
      `----------------------------------------------------------------------`,
      `Note: Do not claim that a recall, warranty entitlement, or repair option exists unless verified for this vehicle variant.`,
    ].join('\n')

    navigator.clipboard.writeText(text).then(() => {
      setCopiedChecklist(true)
      setTimeout(() => setCopiedChecklist(false), 2500)
    })
  }

  const contact: ManufacturerSupportContact | undefined = advisory?.contact
  const isPreliminary = advisory?.is_preliminary ?? !diagnosticConfirmed
  const isCritical = advisory?.has_critical_warning ?? criticalWarning
  const questions = advisory?.questions_to_ask || DEFAULT_QUESTIONS

  return (
    <div
      id="verify-before-replace-section"
      className={`rounded-2xl border-2 transition-all shadow-md overflow-hidden ${
        isCritical
          ? 'border-rose-500 bg-gradient-to-b from-rose-500/[0.06] via-white to-white'
          : diagnosticConfirmed
            ? 'border-indigo-500 bg-gradient-to-b from-indigo-500/[0.04] via-white to-white'
            : 'border-amber-400 bg-gradient-to-b from-amber-400/[0.06] via-white to-white'
      } ${className}`}
    >
      {/* Top Advisory Banner */}
      <div
        className={`px-6 py-4.5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          isCritical
            ? 'bg-rose-50/80 border-rose-200 text-rose-950'
            : diagnosticConfirmed
              ? 'bg-indigo-50/80 border-indigo-200 text-indigo-950'
              : 'bg-amber-50/80 border-amber-200 text-amber-950'
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm ${
              isCritical
                ? 'bg-rose-600'
                : diagnosticConfirmed
                  ? 'bg-indigo-600'
                  : 'bg-amber-600'
            }`}
          >
            {isCritical ? (
              <ShieldAlert size={20} />
            ) : diagnosticConfirmed ? (
              <FileCheck size={20} />
            ) : (
              <ShieldCheck size={20} />
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                  isCritical
                    ? 'bg-rose-200 text-rose-900'
                    : diagnosticConfirmed
                      ? 'bg-indigo-200 text-indigo-900'
                      : 'bg-amber-200 text-amber-900'
                }`}
              >
                {isCritical
                  ? 'Critical Safety Guidance'
                  : diagnosticConfirmed
                    ? 'Confirmed Diagnostic Evaluation'
                    : 'Pre-Replacement Guidance'}
              </span>
              <span className="text-[12px] font-semibold text-ink-600">
                {selectedBrand} {vehicleModel || ''} {modelYear ? `(${modelYear})` : ''}
              </span>
            </div>
            <h3 className="text-[20px] font-extrabold tracking-tight mt-0.5 text-ink-900">
              {advisory?.heading || 'Verify Before You Replace'}
            </h3>
          </div>
        </div>

        {/* Change Manufacturer / Country Toggle Button */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setShowSelector(!showSelector)}
            className="btn btn-outline btn-xs flex items-center gap-1.5 border-ink-300 text-ink-700 bg-white hover:bg-ink-50 shadow-xs"
          >
            <Building2 size={12} />
            <span>
              {showSelector ? 'Hide Selector' : 'Change Manufacturer / Country'}
            </span>
          </button>
        </div>
      </div>

      {/* Manual Manufacturer / Country Selector Panel */}
      {showSelector && (
        <div className="bg-ink-50 p-4 border-b border-ink-200 animate-fadeIn">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1 w-full">
              <label className="block text-[11.5px] font-bold text-ink-700 uppercase tracking-wider mb-1">
                Vehicle Brand / Manufacturer
              </label>
              <select
                value={selectedBrand}
                onChange={(e) => setSelectedBrand(e.target.value)}
                className="select select-sm w-full bg-white border-ink-300 rounded-lg text-[13px]"
              >
                {directory.length > 0 ? (
                  directory.map((m) => (
                    <option key={m.manufacturer_id} value={m.manufacturer_name}>
                      {m.manufacturer_name} ({m.country_code})
                    </option>
                  ))
                ) : (
                  <>
                    <option value="Tata">Tata Motors Electric</option>
                    <option value="MG">MG Motor India</option>
                    <option value="Mahindra">Mahindra Electric</option>
                    <option value="Hyundai">Hyundai Motor India</option>
                    <option value="BYD">BYD Auto India</option>
                    <option value="Ola Electric">Ola Electric</option>
                    <option value="Ather Energy">Ather Energy</option>
                    <option value="Kia">Kia India</option>
                    <option value="Tesla">Tesla (US)</option>
                  </>
                )}
              </select>
            </div>

            <div className="w-full sm:w-44">
              <label className="block text-[11.5px] font-bold text-ink-700 uppercase tracking-wider mb-1">
                Market / Country
              </label>
              <select
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                className="select select-sm w-full bg-white border-ink-300 rounded-lg text-[13px]"
              >
                <option value="IN">India (IN)</option>
                <option value="US">United States (US)</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => {
                fetchAdvisory(selectedBrand, selectedCountry, diagnosticConfirmed, criticalWarning)
                setShowSelector(false)
              }}
              className="btn btn-primary btn-sm flex items-center gap-1.5 shrink-0"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span>Apply Verified Support</span>
            </button>
          </div>
          <p className="mt-2 text-[11px] text-ink-500">
            * Phone numbers and dealer locators are grounded in official manufacturer portals for each specific market.
          </p>
        </div>
      )}

      {/* Main Body */}
      <div className="p-6 sm:p-7 space-y-6">
        {/* Advisory Message Callout */}
        <div
          className={`rounded-xl border p-4.5 ${
            isCritical
              ? 'border-rose-300 bg-rose-50/70 text-rose-950'
              : diagnosticConfirmed
                ? 'border-indigo-300 bg-indigo-50/70 text-indigo-950'
                : 'border-amber-300 bg-amber-50/70 text-amber-950'
          }`}
        >
          <div className="flex items-start gap-3">
            <Info
              size={18}
              className={`mt-0.5 shrink-0 ${
                isCritical
                  ? 'text-rose-600'
                  : diagnosticConfirmed
                    ? 'text-indigo-600'
                    : 'text-amber-700'
              }`}
            />
            <div className="text-[13.5px] leading-relaxed">
              <p className="font-semibold">
                {advisory?.advisory_message ||
                  "EVolve AI has identified that replacement may be worth considering based on the available battery data. Before spending money, contact your vehicle manufacturer's official customer-care team or an authorized service centre to confirm the diagnosis and determine the appropriate repair."}
              </p>
              {reason && (
                <p className="mt-1.5 text-[12.5px] opacity-90">
                  <strong>EVolve AI Evaluation Reason:</strong> {reason}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Diagnostic vs Prediction Distinction Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-ink-50 border border-ink-200">
          <div className="flex items-center gap-2.5">
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-black uppercase px-2.5 py-1 rounded-md ${
                isCritical
                  ? 'bg-rose-100 text-rose-800 border border-rose-300'
                  : isPreliminary
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-indigo-100 text-indigo-800 border border-indigo-300'
              }`}
            >
              {isCritical ? (
                <>
                  <ShieldAlert size={12} /> Critical Safety Symptom
                </>
              ) : isPreliminary ? (
                <>
                  <Sparkles size={12} /> Preliminary AI Prediction
                </>
              ) : (
                <>
                  <CheckCircle2 size={12} /> Diagnostic Scan Confirmed
                </>
              )}
            </span>
            <span className="text-[12.5px] text-ink-700 font-medium">
              {advisory?.evidence_statement ||
                'Replacement is not yet confirmed. Contact the manufacturer or an authorized service centre for diagnosis.'}
            </span>
          </div>

          {/* Toggle between preliminary and diagnostic confirmed */}
          {!isCritical && (
            <label className="flex items-center gap-2 text-[12px] text-ink-600 cursor-pointer self-start sm:self-auto select-none">
              <input
                type="checkbox"
                checked={diagnosticConfirmed}
                onChange={(e) => setDiagnosticConfirmed(e.target.checked)}
                className="checkbox checkbox-xs rounded border-ink-400"
              />
              <span>I have an authorized service centre diagnostic scan</span>
            </label>
          )}
        </div>

        {/* Official Manufacturer Support Contact Card */}
        <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-ink-100">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-700 bg-brand-50 px-2 py-0.5 rounded">
                Official Manufacturer Support
              </span>
              <h4 className="text-[18px] font-extrabold text-ink-900 mt-1">
                {contact?.manufacturer_name || selectedBrand}
              </h4>
              <p className="text-[12px] text-ink-500 flex items-center gap-1.5 mt-0.5">
                <MapPin size={13} className="text-ink-400" />
                <span>Market: {contact?.country_name || selectedCountry}</span>
                {contact?.support_hours && (
                  <>
                    <span className="text-ink-300">•</span>
                    <Clock size={13} className="text-ink-400" />
                    <span>{contact.support_hours}</span>
                  </>
                )}
              </p>
            </div>

            {/* Verification Badge */}
            <div className="flex flex-col items-start md:items-end gap-1">
              {contact?.verification_status === 'VERIFIED' ? (
                <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-800 border border-emerald-200">
                  <CheckCircle2 size={13} className="text-emerald-600" />
                  <span>Verified Official Contact</span>
                </div>
              ) : contact?.verification_status === 'LOCATOR_ONLY' ? (
                <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-800 border border-amber-200">
                  <Info size={13} className="text-amber-600" />
                  <span>Online Locator Only</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-3 py-1 text-[11px] font-bold text-ink-700 border border-ink-200">
                  <PhoneOff size={13} className="text-ink-500" />
                  <span>Phone Verification Pending</span>
                </div>
              )}
              {contact?.verified_at && (
                <span className="text-[10.5px] text-ink-500 flex items-center gap-1">
                  <Calendar size={11} />
                  <span>
                    Last verified: {new Date(contact.verified_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                </span>
              )}
            </div>
          </div>

          {/* Action Row */}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {/* 1. Phone Call Action */}
            <div className="rounded-xl border border-ink-200 p-4 bg-ink-50/50 flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-500 block mb-1">
                  Official Customer Care
                </span>
                {contact?.can_call && contact.support_phone ? (
                  <div className="text-[19px] font-black text-ink-900 tnum">
                    {contact.support_phone}
                  </div>
                ) : (
                  <p className="text-[12px] text-ink-600 leading-snug">
                    {contact?.phone_fallback_message ||
                      'Official phone number unavailable. Visit the manufacturer\'s official website to find customer support.'}
                  </p>
                )}
              </div>

              <div className="mt-3.5">
                {contact?.can_call && contact.call_link ? (
                  <a
                    href={contact.call_link}
                    className="btn btn-primary btn-sm w-full flex items-center justify-center gap-2 shadow-xs"
                  >
                    <PhoneCall size={14} />
                    <span>Call Customer Care</span>
                  </a>
                ) : (
                  <button
                    disabled
                    className="btn btn-ghost btn-sm w-full border border-ink-200 text-ink-400 bg-ink-100/60 cursor-not-allowed flex items-center justify-center gap-1.5"
                  >
                    <PhoneOff size={13} />
                    <span>Call Unavailable</span>
                  </button>
                )}
              </div>
            </div>

            {/* 2. Official Website Action */}
            <div className="rounded-xl border border-ink-200 p-4 bg-ink-50/50 flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-500 block mb-1">
                  Official Support Webpage
                </span>
                <p className="text-[12.5px] text-ink-700 leading-snug">
                  Official warranty policies, service booking, and certified diagnostic scheduling.
                </p>
              </div>

              <div className="mt-3.5">
                {contact?.support_url ? (
                  <a
                    href={contact.support_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline btn-sm w-full flex items-center justify-center gap-2 border-ink-300 text-ink-800 hover:bg-ink-100"
                  >
                    <Globe size={14} className="text-brand-600" />
                    <span>Visit Support Website</span>
                    <ExternalLink size={12} className="opacity-70" />
                  </a>
                ) : (
                  <button
                    disabled
                    className="btn btn-ghost btn-sm w-full border border-ink-200 text-ink-400 cursor-not-allowed"
                  >
                    Portal Unavailable
                  </button>
                )}
              </div>
            </div>

            {/* 3. Authorized Service Centre Locator Action */}
            <div className="rounded-xl border border-ink-200 p-4 bg-ink-50/50 flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-500 block mb-1">
                  Authorized Service Locator
                </span>
                <p className="text-[12.5px] text-ink-700 leading-snug">
                  Locate certified EV workshop technicians equipped with official high-voltage diagnostic tools.
                </p>
              </div>

              <div className="mt-3.5">
                {contact?.service_locator_url ? (
                  <a
                    href={contact.service_locator_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline btn-sm w-full flex items-center justify-center gap-2 border-ink-300 text-ink-800 hover:bg-ink-100"
                  >
                    <MapPin size={14} className="text-emerald-600" />
                    <span>Find Service Centre</span>
                    <ExternalLink size={12} className="opacity-70" />
                  </a>
                ) : (
                  <button
                    disabled
                    className="btn btn-ghost btn-sm w-full border border-ink-200 text-ink-400 cursor-not-allowed"
                  >
                    Locator Unavailable
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Traceability & Source Footer */}
          <div className="mt-4 pt-3 border-t border-ink-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-500">
            <span className="flex items-center gap-1.5 text-ink-600 font-medium">
              <ShieldCheck size={13} className="text-emerald-600" />
              <span>{contact?.source_label || 'Contact information sourced from official manufacturer website'}</span>
            </span>
            {contact?.source_url && (
              <a
                href={contact.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-700 hover:underline flex items-center gap-1 font-semibold"
              >
                <span>View Source Citation</span>
                <ExternalLink size={11} />
              </a>
            )}
          </div>
        </div>

        {/* Section 5: Questions to Ask Before Replacing Your Battery */}
        <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3.5 border-b border-ink-100">
            <div className="flex items-center gap-2">
              <HelpCircle size={18} className="text-brand-600" />
              <div>
                <h4 className="text-[15px] font-bold text-ink-900">
                  Questions to Ask Before Replacing Your Battery
                </h4>
                <p className="text-[11.5px] text-ink-500">
                  Review or check off these 8 diagnostic questions when speaking to customer care or your service advisor.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={copyQuestionsToClipboard}
                className="btn btn-outline btn-xs flex items-center gap-1.5 border-ink-300 text-ink-700 hover:bg-ink-50"
              >
                {copiedChecklist ? (
                  <>
                    <CheckCircle2 size={12} className="text-emerald-600" />
                    <span className="text-emerald-700 font-bold">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy size={12} />
                    <span>Copy Checklist</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowChecklist(!showChecklist)}
                className="btn btn-ghost btn-xs text-ink-500"
              >
                {showChecklist ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>
          </div>

          {showChecklist && (
            <div className="mt-4 space-y-2.5">
              {questions.map((q, idx) => {
                const isChecked = !!checkedQuestions[idx]
                return (
                  <label
                    key={idx}
                    className={`flex items-start gap-3 p-2.5 rounded-lg border transition-all cursor-pointer ${
                      isChecked
                        ? 'border-emerald-300 bg-emerald-50/50 text-emerald-950'
                        : 'border-ink-100 bg-white hover:bg-ink-50/70 text-ink-800'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleQuestion(idx)}
                      className="checkbox checkbox-xs rounded border-ink-400 mt-0.5 shrink-0"
                    />
                    <div className="text-[12.5px] leading-snug flex-1">
                      <span className="font-bold text-ink-500 mr-2">{idx + 1}.</span>
                      <span className={isChecked ? 'line-through text-ink-500 font-normal' : 'font-medium'}>
                        {q}
                      </span>
                    </div>
                  </label>
                )
              })}

              {/* Warranty / Recall Disclaimer */}
              <div className="mt-3.5 pt-3 border-t border-ink-100 rounded-lg bg-ink-50 p-3 text-[11.5px] text-ink-600 flex items-start gap-2">
                <Info size={14} className="mt-0.5 shrink-0 text-ink-500" />
                <p>
                  <strong>Disclaimer:</strong> {advisory?.warranty_disclaimer || 'Do not claim that a recall, warranty entitlement, or repair option exists unless verified for that particular vehicle and market by an authorized technician.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
