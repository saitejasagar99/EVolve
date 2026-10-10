/**
 * EVolve AI — Forgot & Reset Password Page
 *
 * Route: /forgot-password
 * Step 1: Request OTP code to registered email
 * Step 2: Enter OTP code and set new password
 */

import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Eye,
  EyeOff,
  KeyRound,
  Mail,
} from 'lucide-react'
import { useToast } from '../context/AppContext'
import { api } from '../services/api'

export default function ForgotPassword() {
  const { push } = useToast()
  const navigate = useNavigate()

  const [step, setStep] = useState<1 | 2>(1)
  const [email, setEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  // Step 1: Request Password Reset OTP
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      push('Please enter your email address.', 'error')
      return
    }

    setLoading(true)
    try {
      await api.forgotPassword({ email: email.trim() })
      push('Reset instructions sent! Please check your Gmail inbox.', 'info')
      setStep(2)
    } catch (err: any) {
      push(err instanceof Error ? err.message : 'Could not process password reset.', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Step 2: Verify OTP and Reset Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!otpCode.trim() || otpCode.trim().length !== 6) {
      push('Please provide the valid 6-digit OTP code.', 'error')
      return
    }

    if (newPassword.length < 8) {
      push('New password must be at least 8 characters long.', 'error')
      return
    }

    if (newPassword !== confirmPassword) {
      push('Passwords do not match.', 'error')
      return
    }

    setLoading(true)
    try {
      await api.resetPassword({
        email: email.trim(),
        otp_code: otpCode.trim(),
        new_password: newPassword,
        confirm_password: confirmPassword,
      })
      push('Password reset successfully! Please sign in with your new password.', 'success')
      navigate('/login', { replace: true })
    } catch (err: any) {
      push(err instanceof Error ? err.message : 'Password reset failed. Invalid or expired OTP.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-md py-8 sm:py-12">
      {/* Brand Header */}
      <div className="text-center mb-8">
        <div className="mx-auto mb-3 flex h-13 w-13 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-md">
          <KeyRound size={26} />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink-900">
          Reset Your Password
        </h1>
        <p className="mt-2 text-[13.5px] text-ink-600">
          {step === 1
            ? 'Enter your account email to receive a password recovery OTP code.'
            : 'Enter the recovery OTP and create a new secure password.'}
        </p>
      </div>

      <div className="rounded-2xl border border-ink-200 bg-white p-6 sm:p-8 shadow-sm">
        {step === 1 ? (
          <form onSubmit={handleRequestOtp} className="space-y-5">
            <div>
              <label className="block text-[12px] font-bold text-ink-700 uppercase tracking-wider mb-1.5">
                Registered Email Address
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-ink-400">
                  <Mail size={16} />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="input pl-10 w-full"
                  autoComplete="email"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full py-2.5 text-[14px] font-bold justify-center shadow-xs"
            >
              {loading ? 'Sending OTP…' : 'Send Recovery OTP Code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-5">
            <div className="rounded-xl border border-brand-200 bg-brand-50/70 p-3 text-[12px] text-brand-900 flex items-start gap-2">
              <Mail size={15} className="text-brand-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Check your Gmail inbox</span>
                <p className="text-[11.5px] text-ink-600 mt-0.5">
                  Enter the 6-digit recovery OTP code sent to <strong>{email}</strong>.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-bold text-ink-700 uppercase tracking-wider mb-1.5">
                6-Digit Recovery OTP
              </label>
              <input
                type="text"
                maxLength={6}
                required
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="input w-full font-mono text-[18px] tracking-widest text-center font-bold"
                autoComplete="one-time-code"
              />
            </div>

            <div>
              <label className="block text-[12px] font-bold text-ink-700 uppercase tracking-wider mb-1.5">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 characters, 1 uppercase, 1 digit"
                  className="input pr-10 w-full"
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
              <label className="block text-[12px] font-bold text-ink-700 uppercase tracking-wider mb-1.5">
                Confirm New Password
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                className="input w-full"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="btn btn-outline flex-1 py-2 text-[13px]"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary flex-2 py-2.5 text-[14px] font-bold justify-center"
              >
                {loading ? 'Updating…' : 'Update Password'}
              </button>
            </div>
          </form>
        )}

        <div className="mt-6 text-center text-[13px] text-ink-600 border-t border-ink-100 pt-5">
          Remember your password?{' '}
          <Link to="/login" className="font-bold text-brand-700 hover:underline">
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  )
}
