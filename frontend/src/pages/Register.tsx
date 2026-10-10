/**
 * EVolve AI — User Registration Page
 *
 * Route: /register
 * Features:
 *   - 3-step registration wizard
 *   - Step 1: Personal Details & Password
 *   - Step 2: User Type Selection (🚗 EV Owner vs 🔋 Second-Life Battery Consumer)
 *   - Step 3: Role-conditional details (Vehicle details for EV Owner, Intended application for Consumer)
 *   - Visual selection cards with rich state styling & badges
 *   - Full Indian vehicle & mobile number formatting
 *   - Masked Aadhaar security guarantee
 */

import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  BatteryCharging,
  Car,
  Check,
  Eye,
  EyeOff,
  Info,
  Leaf,
  Lock,
  MapPin,
  ShieldCheck,
  Sun,
  User,
  Zap,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/AppContext'
import type { RegisterPayload } from '../types/api'

const POPULAR_MANUFACTURERS = ['Tata', 'MG', 'Mahindra', 'Hyundai', 'Kia', 'BYD', 'Other']

const POPULAR_MODELS: Record<string, string[]> = {
  Tata: ['Nexon EV', 'Nexon EV Long Range', 'Tiago EV', 'Punch EV', 'Tigor EV', 'Curvv EV'],
  MG: ['ZS EV', 'Windsor EV', 'Comet EV'],
  Mahindra: ['XUV400', 'XUV400 EL Pro'],
  Hyundai: ['Kona Electric', 'Ioniq 5', 'Creta EV'],
  Kia: ['EV6'],
  BYD: ['Atto 3', 'Seal', 'e6'],
  Other: ['Custom / Other Model'],
}

const PURCHASE_YEARS = [2026, 2025, 2024, 2023, 2022, 2021, 2020]

const BATTERY_APPLICATIONS = [
  'Solar Energy Storage',
  'Home Backup',
  'Commercial Energy Storage',
  'Telecom Backup',
  'Microgrid',
  'Other',
]

type Step = 1 | 2 | 3

export default function Register() {
  const { register } = useAuth()
  const { push } = useToast()
  const navigate = useNavigate()

  const [currentStep, setCurrentStep] = useState<Step>(1)
  const [selectedRole, setSelectedRole] = useState<'CUSTOMER' | 'CONSUMER'>('CUSTOMER')

  const [formData, setFormData] = useState<RegisterPayload>({
    full_name: '',
    username: '',
    email: '',
    phone: '',
    aadhaar_number: '',
    role: 'CUSTOMER',
    // Customer / Vehicle fields
    vehicle_number: '',
    vehicle_manufacturer: 'Tata',
    vehicle_model: 'Nexon EV',
    vehicle_purchase_year: 2023,
    odometer_km: 35000,
    // Consumer fields
    intended_battery_application: 'Solar Energy Storage',
    // Location
    city: 'Hyderabad',
    state: 'Telangana',
    pincode: '500081',
    // Security
    password: '',
    confirm_password: '',
  })

  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    if (type === 'number') {
      setFormData((prev) => ({ ...prev, [name]: Number(value) }))
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }))
    }
  }

  const handleManufacturerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const mfg = e.target.value
    const models = POPULAR_MODELS[mfg] || ['Standard EV']
    setFormData((prev) => ({
      ...prev,
      vehicle_manufacturer: mfg,
      vehicle_model: models[0] || '',
    }))
  }

  const handleRoleSelect = (role: 'CUSTOMER' | 'CONSUMER') => {
    setSelectedRole(role)
    setFormData((prev) => ({
      ...prev,
      role,
    }))
  }

  // Step 1 Validation
  const validateStep1 = (): boolean => {
    if (!formData.full_name.trim()) {
      push('Please enter your full name.', 'error')
      return false
    }
    if (!formData.username.trim() || formData.username.trim().length < 3) {
      push('Username must be at least 3 characters long.', 'error')
      return false
    }
    if (!formData.email.trim() || !formData.email.includes('@')) {
      push('Please enter a valid email address for OTP delivery.', 'error')
      return false
    }
    if (!formData.phone.trim() || formData.phone.trim().length < 10) {
      push('Please provide a valid Indian 10-digit mobile number.', 'error')
      return false
    }
    if (formData.password.length < 8) {
      push('Password must be at least 8 characters long.', 'error')
      return false
    }
    if (formData.password !== formData.confirm_password) {
      push('Passwords do not match. Please verify.', 'error')
      return false
    }
    return true
  }

  // Step 2 Validation
  const validateStep2 = (): boolean => {
    if (!selectedRole) {
      push('Please select how you will use EVolve AI.', 'error')
      return false
    }
    return true
  }

  // Step 3 Validation
  const validateStep3 = (): boolean => {
    if (!formData.city.trim() || !formData.state.trim()) {
      push('Please provide your operating city and state.', 'error')
      return false
    }

    if (selectedRole === 'CUSTOMER') {
      if (!formData.vehicle_number?.trim()) {
        push('Vehicle registration number is required for EV Owners (e.g. TS09AB1234).', 'error')
        return false
      }
    }

    return true
  }

  const goToNextStep = () => {
    if (currentStep === 1) {
      if (validateStep1()) setCurrentStep(2)
    } else if (currentStep === 2) {
      if (validateStep2()) setCurrentStep(3)
    }
  }

  const goToPrevStep = () => {
    if (currentStep === 3) setCurrentStep(2)
    else if (currentStep === 2) setCurrentStep(1)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateStep1() || !validateStep2() || !validateStep3()) {
      return
    }

    setSubmitting(true)

    // Prepare payload depending on role
    const payload: RegisterPayload = {
      ...formData,
      role: selectedRole,
      email: formData.email.trim().toLowerCase(),
      username: formData.username.trim().toLowerCase(),
    }

    // Strip vehicle info if registering as second-life consumer
    if (selectedRole === 'CONSUMER') {
      payload.vehicle_number = ''
      payload.vehicle_manufacturer = ''
      payload.vehicle_model = ''
      payload.vehicle_purchase_year = undefined
      payload.odometer_km = undefined
    }

    try {
      await register(payload)
      push('Account created! Please check your Gmail for your 6-digit OTP code.', 'success')
      navigate(`/verify-email?email=${encodeURIComponent(payload.email)}`)
    } catch (err: any) {
      push(err instanceof Error ? err.message : 'Registration failed. Please check your details.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const availableModels = POPULAR_MODELS[formData.vehicle_manufacturer || 'Tata'] || ['Custom Model']

  return (
    <div className="mx-auto max-w-2xl py-6 sm:py-10">
      {/* Brand Header */}
      <div className="text-center mb-8">
        <div className="mx-auto mb-3 flex h-13 w-13 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-md">
          <Leaf size={28} />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink-900">
          Create Your EVolve AI Account
        </h1>
        <p className="mt-2 text-[14px] text-ink-600">
          Create your account to monitor your EV battery and manage its circular lifecycle.
        </p>
      </div>

      {/* Stepper Progress Bar */}
      <div className="mb-8 rounded-2xl border border-ink-200 bg-white p-4 shadow-2xs">
        <div className="flex items-center justify-between">
          {/* Step 1 Pill */}
          <button
            type="button"
            onClick={() => setCurrentStep(1)}
            className="flex items-center gap-2.5 text-left focus:outline-hidden"
          >
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-bold transition-colors ${
                currentStep > 1
                  ? 'bg-brand-600 text-white'
                  : currentStep === 1
                    ? 'bg-brand-100 text-brand-700 ring-2 ring-brand-600'
                    : 'bg-ink-100 text-ink-500'
              }`}
            >
              {currentStep > 1 ? <Check size={16} /> : '1'}
            </div>
            <div className="hidden sm:block">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-500">Step 1</p>
              <p
                className={`text-[13px] font-semibold ${
                  currentStep === 1 ? 'text-brand-700 font-bold' : 'text-ink-800'
                }`}
              >
                Personal Details
              </p>
            </div>
          </button>

          <div className="h-0.5 flex-1 mx-3 bg-ink-200">
            <div
              className={`h-full bg-brand-600 transition-all duration-300 ${
                currentStep === 1 ? 'w-0' : currentStep === 2 ? 'w-1/2' : 'w-full'
              }`}
            />
          </div>

          {/* Step 2 Pill */}
          <button
            type="button"
            onClick={() => {
              if (validateStep1()) setCurrentStep(2)
            }}
            className="flex items-center gap-2.5 text-left focus:outline-hidden"
          >
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-bold transition-colors ${
                currentStep > 2
                  ? 'bg-brand-600 text-white'
                  : currentStep === 2
                    ? 'bg-brand-100 text-brand-700 ring-2 ring-brand-600'
                    : 'bg-ink-100 text-ink-500'
              }`}
            >
              {currentStep > 2 ? <Check size={16} /> : '2'}
            </div>
            <div className="hidden sm:block">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-500">Step 2</p>
              <p
                className={`text-[13px] font-semibold ${
                  currentStep === 2 ? 'text-brand-700 font-bold' : 'text-ink-800'
                }`}
              >
                User Type
              </p>
            </div>
          </button>

          <div className="h-0.5 flex-1 mx-3 bg-ink-200">
            <div
              className={`h-full bg-brand-600 transition-all duration-300 ${
                currentStep < 3 ? 'w-0' : 'w-full'
              }`}
            />
          </div>

          {/* Step 3 Pill */}
          <button
            type="button"
            onClick={() => {
              if (validateStep1() && validateStep2()) setCurrentStep(3)
            }}
            className="flex items-center gap-2.5 text-left focus:outline-hidden"
          >
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-bold transition-colors ${
                currentStep === 3
                  ? 'bg-brand-100 text-brand-700 ring-2 ring-brand-600'
                  : 'bg-ink-100 text-ink-500'
              }`}
            >
              3
            </div>
            <div className="hidden sm:block">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-500">Step 3</p>
              <p
                className={`text-[13px] font-semibold ${
                  currentStep === 3 ? 'text-brand-700 font-bold' : 'text-ink-800'
                }`}
              >
                {selectedRole === 'CUSTOMER' ? 'Vehicle Details' : 'Application'}
              </p>
            </div>
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-ink-200 bg-white p-6 sm:p-8 shadow-sm">
        <form onSubmit={handleSubmit}>
          {/* ======================================================== */}
          {/* STEP 1: Personal Details & Account Credentials           */}
          {/* ======================================================== */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="border-b border-ink-100 pb-3">
                <div className="flex items-center gap-2 text-brand-600 font-bold text-[14px]">
                  <User size={18} />
                  <span>Step 1 of 3 — Personal Details</span>
                </div>
                <h2 className="text-xl font-bold text-ink-900 mt-1">
                  Tell us about yourself
                </h2>
                <p className="text-[13px] text-ink-500 mt-0.5">
                  Your credentials will be used to log in and secure your battery profile.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-[12px] font-bold text-ink-700 uppercase tracking-wider mb-1">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    name="full_name"
                    value={formData.full_name}
                    onChange={handleChange}
                    placeholder="e.g. Sai Teja"
                    className="input w-full"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-ink-700 uppercase tracking-wider mb-1">
                    Username <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    name="username"
                    value={formData.username}
                    onChange={handleChange}
                    placeholder="e.g. sai_teja"
                    className="input w-full"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-ink-700 uppercase tracking-wider mb-1">
                    Email Address <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="e.g. saiteja@example.com"
                    className="input w-full"
                  />
                  <p className="text-[11px] text-ink-500 mt-1">
                    A 6-digit OTP verification code will be sent to this inbox.
                  </p>
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-ink-700 uppercase tracking-wider mb-1">
                    Phone Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="e.g. +91 9876543210"
                    className="input w-full"
                  />
                  <p className="text-[11px] text-ink-500 mt-1">Indian 10-digit mobile number.</p>
                </div>
              </div>

              {/* Aadhaar (Optional) */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[12px] font-bold text-ink-700 uppercase tracking-wider">
                    Aadhaar Number (12 Digits)
                  </label>
                  <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-600">
                    Optional
                  </span>
                </div>
                <input
                  type="text"
                  name="aadhaar_number"
                  value={formData.aadhaar_number}
                  onChange={handleChange}
                  placeholder="XXXX XXXX XXXX (e.g. 5678 1234 9876)"
                  maxLength={14}
                  className="input w-full font-mono text-[13px]"
                />
                <div className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-ink-50 p-2.5 text-[11.5px] text-ink-600">
                  <Info size={14} className="shrink-0 text-brand-600 mt-0.5" />
                  <span>
                    <strong>Strict Privacy Guarantee:</strong> Full Aadhaar numbers are never logged,
                    never displayed in dashboards, and stored only as a masked string (
                    <code className="text-brand-700 font-mono">XXXX-XXXX-1234</code>).
                  </span>
                </div>
              </div>

              {/* Password Section */}
              <div className="pt-2 border-t border-ink-100">
                <div className="flex items-center gap-2 mb-3">
                  <Lock size={16} className="text-brand-600" />
                  <h3 className="text-[14px] font-bold text-ink-900">Account Password</h3>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-[12px] font-bold text-ink-700 uppercase tracking-wider mb-1">
                      Password <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        name="password"
                        value={formData.password}
                        onChange={handleChange}
                        placeholder="Min 8 characters"
                        className="input pr-10 w-full"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-ink-400 hover:text-ink-600"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[12px] font-bold text-ink-700 uppercase tracking-wider mb-1">
                      Confirm Password <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      name="confirm_password"
                      value={formData.confirm_password}
                      onChange={handleChange}
                      placeholder="Repeat password"
                      className="input w-full"
                      autoComplete="new-password"
                    />
                  </div>
                </div>
                <p className="text-[11.5px] text-ink-500 mt-2">
                  Must be at least 8 characters long with uppercase and numeric characters.
                </p>
              </div>

              {/* Action Button */}
              <div className="pt-4 flex justify-end">
                <button
                  type="button"
                  onClick={goToNextStep}
                  className="btn btn-primary px-6 py-2.5 text-[14px] font-bold flex items-center gap-2"
                >
                  <span>Continue to Select User Type</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* STEP 2: Select User Type (EV Owner vs Consumer)         */}
          {/* ======================================================== */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="border-b border-ink-100 pb-3">
                <div className="flex items-center gap-2 text-brand-600 font-bold text-[14px]">
                  <Leaf size={18} />
                  <span>Step 2 of 3 — Select User Type</span>
                </div>
                <h2 className="text-xl font-bold text-ink-900 mt-1">
                  How will you use EVolve AI?
                </h2>
                <p className="text-[13px] text-ink-600 mt-0.5">
                  Select your primary role in the EV battery circular ecosystem. The user must select exactly one option before continuing.
                </p>
              </div>

              {/* Two Selectable Cards */}
              <div className="grid gap-4 sm:grid-cols-2 pt-2">
                {/* CARD 1: EV Owner */}
                <div
                  onClick={() => handleRoleSelect('CUSTOMER')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') handleRoleSelect('CUSTOMER')
                  }}
                  className={`group relative flex flex-col justify-between rounded-2xl border-2 p-5 sm:p-6 text-left transition-all cursor-pointer select-none ${
                    selectedRole === 'CUSTOMER'
                      ? 'border-brand-600 bg-brand-50/40 shadow-md ring-2 ring-brand-500/20'
                      : 'border-ink-200 bg-white hover:border-ink-300 hover:bg-ink-50/50 hover:shadow-xs'
                  }`}
                >
                  <div>
                    {/* Header: Icon & Selection indicator */}
                    <div className="flex items-start justify-between">
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-xl transition-colors ${
                          selectedRole === 'CUSTOMER'
                            ? 'bg-brand-600 text-white shadow-sm'
                            : 'bg-ink-100 text-ink-700 group-hover:bg-ink-200'
                        }`}
                      >
                        <Car size={26} />
                      </div>

                      <div
                        className={`flex h-6 w-6 items-center justify-center rounded-full border transition-all ${
                          selectedRole === 'CUSTOMER'
                            ? 'border-brand-600 bg-brand-600 text-white'
                            : 'border-ink-300 bg-white'
                        }`}
                      >
                        {selectedRole === 'CUSTOMER' && <Check size={14} strokeWidth={3} />}
                      </div>
                    </div>

                    {/* Card Title & Tagline */}
                    <div className="mt-4">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🚗</span>
                        <h3 className="text-lg font-extrabold text-ink-900">
                          EV Owner
                        </h3>
                      </div>
                      <p className="mt-1 text-[13px] font-semibold text-brand-700">
                        I own an EV / I want to monitor my EV battery
                      </p>
                      <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-600">
                        Check your battery health, predict battery degradation, understand future battery risk, and know whether your battery should be reused or recycled.
                      </p>
                    </div>
                  </div>

                  {/* Highlights Pill */}
                  <div className="mt-5 border-t border-ink-100 pt-3 flex flex-wrap gap-1.5">
                    <span className="rounded-md bg-white border border-ink-200 px-2 py-0.5 text-[10.5px] font-semibold text-ink-700">
                      State of Health (SOH)
                    </span>
                    <span className="rounded-md bg-white border border-ink-200 px-2 py-0.5 text-[10.5px] font-semibold text-ink-700">
                      Remaining Life Predictor
                    </span>
                    <span className="rounded-md bg-white border border-ink-200 px-2 py-0.5 text-[10.5px] font-semibold text-ink-700">
                      Second-Life Valuation
                    </span>
                  </div>
                </div>

                {/* CARD 2: Second-Life Battery Consumer */}
                <div
                  onClick={() => handleRoleSelect('CONSUMER')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') handleRoleSelect('CONSUMER')
                  }}
                  className={`group relative flex flex-col justify-between rounded-2xl border-2 p-5 sm:p-6 text-left transition-all cursor-pointer select-none ${
                    selectedRole === 'CONSUMER'
                      ? 'border-brand-600 bg-brand-50/40 shadow-md ring-2 ring-brand-500/20'
                      : 'border-ink-200 bg-white hover:border-ink-300 hover:bg-ink-50/50 hover:shadow-xs'
                  }`}
                >
                  <div>
                    {/* Header: Icon & Selection indicator */}
                    <div className="flex items-start justify-between">
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-xl transition-colors ${
                          selectedRole === 'CONSUMER'
                            ? 'bg-brand-600 text-white shadow-sm'
                            : 'bg-ink-100 text-ink-700 group-hover:bg-ink-200'
                        }`}
                      >
                        <BatteryCharging size={26} />
                      </div>

                      <div
                        className={`flex h-6 w-6 items-center justify-center rounded-full border transition-all ${
                          selectedRole === 'CONSUMER'
                            ? 'border-brand-600 bg-brand-600 text-white'
                            : 'border-ink-300 bg-white'
                        }`}
                      >
                        {selectedRole === 'CONSUMER' && <Check size={14} strokeWidth={3} />}
                      </div>
                    </div>

                    {/* Card Title & Tagline */}
                    <div className="mt-4">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🔋</span>
                        <h3 className="text-lg font-extrabold text-ink-900">
                          Battery Recycling &amp; Recovery
                        </h3>
                      </div>
                      <p className="mt-1 text-[13px] font-semibold text-brand-700">
                        I want to learn about recycling, reuse &amp; safe disposal
                      </p>
                      <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-600">
                        Learn how EV batteries can be evaluated, collected, recycled, and recovered to prevent battery waste and reclaim critical minerals.
                      </p>
                    </div>
                  </div>

                  {/* Highlights Pill */}
                  <div className="mt-5 border-t border-ink-100 pt-3 flex flex-wrap gap-1.5">
                    <span className="rounded-md bg-white border border-ink-200 px-2 py-0.5 text-[10.5px] font-semibold text-ink-700">
                      Safe Disposal
                    </span>
                    <span className="rounded-md bg-white border border-ink-200 px-2 py-0.5 text-[10.5px] font-semibold text-ink-700">
                      Material Recovery
                    </span>
                    <span className="rounded-md bg-white border border-ink-200 px-2 py-0.5 text-[10.5px] font-semibold text-ink-700">
                      Reuse Potential
                    </span>
                  </div>
                </div>
              </div>

              {/* Notice regarding Admin / Recycler accounts */}
              <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-3.5 text-[12px] text-ink-600 flex items-start gap-2">
                <Info size={16} className="shrink-0 text-ink-500 mt-0.5" />
                <p>
                  <strong>Looking for Recycler or Admin access?</strong> Authorized recycling facilities
                  and system administrators undergo specialized verification and are provisioned
                  directly by system administrators.
                </p>
              </div>

              {/* Navigation Buttons */}
              <div className="pt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={goToPrevStep}
                  className="btn btn-secondary px-5 py-2.5 text-[13.5px] flex items-center gap-2"
                >
                  <ArrowLeft size={16} />
                  <span>Back</span>
                </button>

                <button
                  type="button"
                  onClick={goToNextStep}
                  className="btn btn-primary px-6 py-2.5 text-[14px] font-bold flex items-center gap-2"
                >
                  <span>
                    {selectedRole === 'CUSTOMER'
                      ? 'Continue to Vehicle Details'
                      : 'Continue to Consumer Requirements'}
                  </span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* STEP 3: Conditional Details based on selected role       */}
          {/* ======================================================== */}
          {currentStep === 3 && (
            <div className="space-y-6">
              {/* Conditional Title depending on role */}
              <div className="border-b border-ink-100 pb-3">
                <div className="flex items-center gap-2 text-brand-600 font-bold text-[14px]">
                  {selectedRole === 'CUSTOMER' ? <Car size={18} /> : <Zap size={18} />}
                  <span>
                    Step 3 of 3 —{' '}
                    {selectedRole === 'CUSTOMER'
                      ? 'Vehicle & Location Details'
                      : 'Consumer Requirements & Location'}
                  </span>
                </div>
                <h2 className="text-xl font-bold text-ink-900 mt-1">
                  {selectedRole === 'CUSTOMER'
                    ? 'Enter your Electric Vehicle details'
                    : 'Specify your second-life battery preferences'}
                </h2>
                <p className="text-[13px] text-ink-500 mt-0.5">
                  {selectedRole === 'CUSTOMER'
                    ? 'These parameters initialize your digital twin and ML health predictions.'
                    : 'We will match you with decommissioned vehicle batteries suited to your capacity needs.'}
                </p>
              </div>

              {/* ================================================== */}
              {/* SUBSECTION A: EV Owner Vehicle Form                */}
              {/* ================================================== */}
              {selectedRole === 'CUSTOMER' && (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-[12px] font-bold text-ink-700 uppercase tracking-wider mb-1">
                        Vehicle Registration Number <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        name="vehicle_number"
                        value={formData.vehicle_number}
                        onChange={handleChange}
                        placeholder="e.g. TS09AB1234"
                        className="input w-full uppercase font-mono"
                      />
                      <p className="text-[11px] text-ink-500 mt-1">Standard Indian RTO registration format.</p>
                    </div>

                    <div>
                      <label className="block text-[12px] font-bold text-ink-700 uppercase tracking-wider mb-1">
                        EV Manufacturer / Brand <span className="text-rose-500">*</span>
                      </label>
                      <select
                        name="vehicle_manufacturer"
                        value={formData.vehicle_manufacturer}
                        onChange={handleManufacturerChange}
                        className="input select w-full"
                      >
                        {POPULAR_MANUFACTURERS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[12px] font-bold text-ink-700 uppercase tracking-wider mb-1">
                        EV Model <span className="text-rose-500">*</span>
                      </label>
                      <select
                        name="vehicle_model"
                        value={formData.vehicle_model}
                        onChange={handleChange}
                        className="input select w-full"
                      >
                        {availableModels.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[12px] font-bold text-ink-700 uppercase tracking-wider mb-1">
                        Purchase Year <span className="text-rose-500">*</span>
                      </label>
                      <select
                        name="vehicle_purchase_year"
                        value={formData.vehicle_purchase_year}
                        onChange={handleChange}
                        className="input select w-full"
                      >
                        {PURCHASE_YEARS.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[12px] font-bold text-ink-700 uppercase tracking-wider mb-1">
                        Current Odometer (km) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="number"
                        required
                        min={0}
                        max={500000}
                        step={500}
                        name="odometer_km"
                        value={formData.odometer_km}
                        onChange={handleChange}
                        className="input w-full"
                      />
                      <p className="text-[11px] text-ink-500 mt-1">
                        An approximate odometer reading helps estimate initial cycle wear and battery age.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ================================================== */}
              {/* SUBSECTION B: Battery Recycling & Recovery Profile */}
              {/* ================================================== */}
              {selectedRole === 'CONSUMER' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-[12.5px] text-ink-700 space-y-1.5">
                    <div className="flex items-center gap-2 font-bold text-emerald-900">
                      <Sun size={17} className="text-emerald-700" />
                      <span>Battery Recycling &amp; Recovery Profile</span>
                    </div>
                    <p>
                      As an eco-advocate, you don't need to register an EV. You will have direct access to our comprehensive battery recycling guidance, lifecycle assessments, and material recovery resources.
                    </p>
                  </div>

                  <div>
                    <label className="block text-[12px] font-bold text-ink-700 uppercase tracking-wider mb-1">
                      Primary Area of Interest <span className="text-rose-500">*</span>
                    </label>
                    <select
                      name="intended_battery_application"
                      value={formData.intended_battery_application}
                      onChange={handleChange}
                      className="input select w-full font-medium"
                    >
                      {BATTERY_APPLICATIONS.map((app) => (
                        <option key={app} value={app}>
                          {app}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-ink-500 mt-1">
                      Helps tailor lifecycle guidance and recycling recommendations to your interest.
                    </p>
                  </div>
                </div>
              )}

              {/* ================================================== */}
              {/* COMMON: Operating Location (City, State, Pincode)  */}
              {/* ================================================== */}
              <div className="pt-2 border-t border-ink-100">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin size={16} className="text-brand-600" />
                  <h3 className="text-[14px] font-bold text-ink-900">
                    {selectedRole === 'CUSTOMER' ? 'Operating Location' : 'Consumer Location'}
                  </h3>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-[12px] font-bold text-ink-700 uppercase tracking-wider mb-1">
                      City <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      placeholder="e.g. Hyderabad"
                      className="input w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-[12px] font-bold text-ink-700 uppercase tracking-wider mb-1">
                      State <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      name="state"
                      value={formData.state}
                      onChange={handleChange}
                      placeholder="e.g. Telangana"
                      className="input w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-[12px] font-bold text-ink-700 uppercase tracking-wider mb-1">
                      PIN Code
                    </label>
                    <input
                      type="text"
                      name="pincode"
                      value={formData.pincode}
                      onChange={handleChange}
                      placeholder="e.g. 500081"
                      className="input w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Data Privacy & Terms Notice */}
              <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4 text-[12px] text-ink-700 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-brand-900">
                  <ShieldCheck size={16} className="text-brand-700" />
                  <span>EVolve AI Circular Intelligence Promise</span>
                </div>
                <p>
                  By creating an account, your details are used exclusively to power circular
                  battery diagnostics, second-life assessment, and safe collection dispatch. Your
                  personal information is encrypted and protected under strict privacy safeguards.
                </p>
              </div>

              {/* Navigation Buttons */}
              <div className="pt-4 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={goToPrevStep}
                  disabled={submitting}
                  className="btn btn-secondary px-5 py-2.5 text-[13.5px] flex items-center gap-2"
                >
                  <ArrowLeft size={16} />
                  <span>Back</span>
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary flex-1 sm:flex-none px-6 py-2.5 text-[14px] font-bold flex items-center justify-center gap-2 shadow-xs"
                >
                  {submitting ? (
                    'Creating Account & Sending OTP…'
                  ) : (
                    <>
                      <span>Create Account & Send Verification Code</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </form>

        {/* Footer Link */}
        <div className="mt-6 text-center text-[13px] text-ink-600 border-t border-ink-100 pt-5">
          Already have an account?{' '}
          <Link to="/login" className="font-bold text-brand-700 hover:underline">
            Sign In Here
          </Link>
        </div>
      </div>
    </div>
  )
}
