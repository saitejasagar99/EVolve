/**
 * EVolve AI — Email OTP Verification Page
 *
 * Route: /verify-email
 * Page title: Verify Your Email Address
 * Subtitle: Enter the 6-digit OTP code sent to your registered email.
 */

import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  KeyRound,
  Mail,
  RotateCw,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/AppContext'
import { api } from '../services/api'

export default function VerifyEmail() {
  const { verifyEmail } = useAuth()
  const { push } = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const emailParam = searchParams.get('email') || ''

  const [email, setEmail] = useState(emailParam)
  const [otpCode, setOtpCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const [countdown, setCountdown] = useState(45)
  const [smtpNotice, setSmtpNotice] = useState<string | null>(null)

  // Resend cooldown timer
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [countdown])

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      push('Please provide your email address.', 'error')
      return
    }

    const cleanOtp = otpCode.trim()
    if (cleanOtp.length !== 6) {
      push('Please enter the complete 6-digit OTP code received in your email.', 'error')
      return
    }

    setSubmitting(true)
    try {
      const res = await verifyEmail(email.trim(), cleanOtp)
      push('Email verified successfully! Welcome to EVolve AI.', 'success')

      const role = res.user?.role
      if (role === 'CUSTOMER') {
        navigate('/customer/dashboard', { replace: true })
      } else if (role === 'CONSUMER') {
        navigate('/recycling/dashboard', { replace: true })
      } else if (role === 'RECYCLER') {
        navigate('/recycler/dashboard', { replace: true })
      } else {
        navigate('/admin/dashboard', { replace: true })
      }
    } catch (err: any) {
      push(err instanceof Error ? err.message : 'Invalid or expired OTP code.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleResend = async () => {
    if (countdown > 0 || resending) return

    setResending(true)
    try {
      const res = await api.resendOtp({ email: email.trim(), purpose: 'VERIFY_EMAIL' })
      if (res.email_delivered) {
        setSmtpNotice(null)
        push('A fresh verification OTP has been sent to your Gmail inbox.', 'success')
      } else {
        const msg = res.delivery_message || 'Gmail SMTP is not configured in backend/.env.'
        setSmtpNotice(msg)
        push('Code generated. Note: Gmail SMTP is not configured.', 'info')
      }
      setCountdown(res.cooldown_seconds || 45)
    } catch (err: any) {
      push(err instanceof Error ? err.message : 'Could not resend OTP.', 'error')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="mx-auto max-w-md py-8 sm:py-12">
      {/* Brand Header */}
      <div className="text-center mb-8">
        <div className="mx-auto mb-3 flex h-13 w-13 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-md">
          <Mail size={26} />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink-900">
          Verify Your Email
        </h1>
        <p className="mt-2 text-[13.5px] text-ink-600">
          We have sent a 6-digit verification code to confirm your EV account.
        </p>
      </div>

      <div className="rounded-2xl border border-ink-200 bg-white p-6 sm:p-8 shadow-sm space-y-6">
        {/* Email Display */}
        <div>
          <label className="block text-[12px] font-bold text-ink-700 uppercase tracking-wider mb-1.5">
            Registered Email Address
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your registered email"
            className="input w-full"
            required
          />
        </div>

        {/* Email delivery guidance banner */}
        <div className="rounded-xl border border-brand-200 bg-brand-50/70 p-3.5 text-[12.5px] text-brand-900 flex items-start gap-2.5">
          <Mail size={18} className="text-brand-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold">Check your Gmail inbox</div>
            <p className="mt-0.5 text-[12px] text-ink-600">
              We have sent a 6-digit verification code to{' '}
              <strong>{email || 'your registered email'}</strong>. Please check your inbox (and spam
              or promotions folder), then enter the code below.
            </p>
          </div>
        </div>

        {smtpNotice && (
          <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-3 text-[12px] text-amber-900 flex items-start gap-2">
            <span className="font-bold shrink-0">⚠️ SMTP Notice:</span>
            <span>{smtpNotice}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleVerify} className="space-y-6">
          <div>
            <label className="block text-[12px] font-bold text-ink-700 uppercase tracking-wider mb-1.5">
              6-Digit Verification Code (OTP)
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-ink-400">
                <KeyRound size={17} />
              </div>
              <input
                type="text"
                maxLength={6}
                required
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="input pl-10 w-full font-mono text-[20px] tracking-widest text-center font-bold"
                autoComplete="one-time-code"
                autoFocus
              />
            </div>
            <p className="mt-1.5 text-[11.5px] text-ink-500 text-center">
              The OTP code expires in 5 minutes.
            </p>
          </div>

          <button
            type="submit"
            disabled={submitting || otpCode.trim().length !== 6}
            className="btn btn-primary w-full py-2.5 text-[14px] font-bold justify-center shadow-xs"
          >
            {submitting ? 'Verifying…' : 'Verify & Continue'}
          </button>
        </form>

        {/* Resend Section */}
        <div className="flex items-center justify-between border-t border-ink-100 pt-4 text-[12.5px]">
          <span className="text-ink-600">Didn't receive the code?</span>
          <button
            type="button"
            onClick={handleResend}
            disabled={countdown > 0 || resending}
            className={`font-bold transition-colors flex items-center gap-1 ${
              countdown > 0
                ? 'text-ink-400 cursor-not-allowed'
                : 'text-brand-700 hover:text-brand-800 underline'
            }`}
          >
            <RotateCw size={12} className={resending ? 'animate-spin' : ''} />
            {countdown > 0 ? `Resend in ${countdown}s` : 'Resend Code'}
          </button>
        </div>

        <div className="text-center text-[12.5px] text-ink-500 pt-2">
          Already verified?{' '}
          <Link to="/login" className="font-bold text-brand-700 hover:underline">
            Sign In Here
          </Link>
        </div>
      </div>
    </div>
  )
}
