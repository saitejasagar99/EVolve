/**
 * EVolve AI — User Login Page
 *
 * Route: /login
 * Page title: Welcome Back to EVolve AI
 * Subtitle: Sign in to continue managing your EV battery lifecycle.
 */

import React, { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  BatteryCharging,
  Eye,
  EyeOff,
  Gauge,
  Leaf,
  Lock,
  Mail,
  Recycle,
  Zap,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/AppContext'

export default function Login() {
  const { login, quickDemoLogin, isAuthenticated, user } = useAuth()
  const { push } = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const redirectParam = searchParams.get('redirect')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [demoLoading, setDemoLoading] = useState<string | null>(null)

  // Redirect if already authenticated
  React.useEffect(() => {
    if (isAuthenticated && user) {
      if (redirectParam) {
        navigate(decodeURIComponent(redirectParam), { replace: true })
      } else {
        const dest =
          user.role === 'CUSTOMER'
            ? '/customer/dashboard'
            : user.role === 'CONSUMER'
              ? '/recycling/dashboard'
              : user.role === 'RECYCLER'
                ? '/recycler/dashboard'
                : '/admin/dashboard'
        navigate(dest, { replace: true })
      }
    }
  }, [isAuthenticated, user, redirectParam, navigate])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) {
      push('Please enter both email and password.', 'error')
      return
    }

    setSubmitting(true)
    try {
      const res = await login(email.trim(), password)
      push(`Welcome back, ${res.user?.full_name || 'User'}!`, 'success')

      if (redirectParam) {
        navigate(decodeURIComponent(redirectParam), { replace: true })
      } else {
        const role = res.user?.role
        const dest =
          role === 'CUSTOMER'
            ? '/customer/dashboard'
            : role === 'CONSUMER'
              ? '/recycling/dashboard'
              : role === 'RECYCLER'
                ? '/recycler/dashboard'
                : '/admin/dashboard'
        navigate(dest, { replace: true })
      }
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes('not verified') || msg.toLowerCase().includes('verification')) {
        push('Please verify your email address to continue.', 'info')
        navigate(`/verify-email?email=${encodeURIComponent(email.trim())}`)
      } else {
        push(msg || 'Invalid email or password.', 'error')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleQuickDemo = async (role: 'CUSTOMER' | 'CONSUMER' | 'RECYCLER' | 'ADMIN') => {
    setDemoLoading(role)
    try {
      await quickDemoLogin(role)
      push(`Signed in as demo ${role.toLowerCase()}.`, 'success')
      const dest =
        role === 'CUSTOMER'
          ? '/customer'
          : role === 'CONSUMER'
            ? '/consumer'
            : role === 'RECYCLER'
              ? '/recycler'
              : '/admin'
      navigate(redirectParam ? decodeURIComponent(redirectParam) : dest, { replace: true })
    } catch (err: any) {
      push(err instanceof Error ? err.message : 'Demo sign-in failed.', 'error')
    } finally {
      setDemoLoading(null)
    }
  }

  return (
    <div className="mx-auto max-w-md py-6 sm:py-10">
      {/* Brand Header */}
      <div className="text-center mb-8">
        <div className="mx-auto mb-3 flex h-13 w-13 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-md">
          <Leaf size={28} />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink-900">
          Welcome Back to EVolve AI
        </h1>
        <p className="mt-2 text-[13.5px] text-ink-600">
          Sign in to continue managing your EV battery lifecycle.
        </p>
      </div>

      {/* Main Login Card */}
      <div className="rounded-2xl border border-ink-200 bg-white p-6 sm:p-8 shadow-sm">
        <form onSubmit={handleLogin} className="space-y-5">
          {/* Email Field */}
          <div>
            <label className="block text-[12.5px] font-bold text-ink-700 uppercase tracking-wider mb-1.5">
              Email Address
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
                placeholder="Enter your email address"
                className="input pl-10 w-full"
                autoComplete="email"
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[12.5px] font-bold text-ink-700 uppercase tracking-wider">
                Password
              </label>
              <Link
                to="/forgot-password"
                className="text-[12px] font-semibold text-brand-700 hover:text-brand-800 hover:underline"
              >
                Forgot Password?
              </Link>
            </div>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-ink-400">
                <Lock size={16} />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="input pl-10 pr-10 w-full"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-ink-400 hover:text-ink-600"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary w-full py-2.5 text-[14px] font-bold justify-center shadow-xs"
          >
            {submitting ? 'Signing In…' : 'Login'}
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-6 text-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-ink-200" />
          </div>
          <span className="relative bg-white px-3 text-[11.5px] font-bold uppercase tracking-wider text-ink-400">
            Or Quick 1-Click Demo Access
          </span>
        </div>

        {/* Quick Demo Login Grid for Hackathon Evaluation */}
        <div className="grid grid-cols-2 gap-2 text-left">
          <button
            type="button"
            onClick={() => handleQuickDemo('CUSTOMER')}
            disabled={demoLoading !== null}
            className="flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50/60 p-2.5 text-[12px] font-bold text-brand-900 transition-all hover:bg-brand-100 hover:shadow-2xs"
          >
            <BatteryCharging size={16} className="text-brand-600 shrink-0" />
            <div className="truncate">
              <div>EV Owner</div>
              <div className="text-[10px] text-ink-500 font-normal">Customer Portal</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleQuickDemo('CONSUMER')}
            disabled={demoLoading !== null}
            className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-2.5 text-[12px] font-bold text-amber-900 transition-all hover:bg-amber-100 hover:shadow-2xs"
          >
            <Zap size={16} className="text-amber-600 shrink-0" />
            <div className="truncate">
              <div>2nd-Life Buyer</div>
              <div className="text-[10px] text-ink-500 font-normal">Marketplace</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleQuickDemo('RECYCLER')}
            disabled={demoLoading !== null}
            className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/60 p-2.5 text-[12px] font-bold text-rose-900 transition-all hover:bg-rose-100 hover:shadow-2xs"
          >
            <Recycle size={16} className="text-rose-600 shrink-0" />
            <div className="truncate">
              <div>Recycler</div>
              <div className="text-[10px] text-ink-500 font-normal">Collection Queue</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleQuickDemo('ADMIN')}
            disabled={demoLoading !== null}
            className="flex items-center gap-2 rounded-xl border border-ink-200 bg-ink-50 p-2.5 text-[12px] font-bold text-ink-900 transition-all hover:bg-ink-100 hover:shadow-2xs"
          >
            <Gauge size={16} className="text-ink-700 shrink-0" />
            <div className="truncate">
              <div>Administrator</div>
              <div className="text-[10px] text-ink-500 font-normal">Circularity Fleet</div>
            </div>
          </button>
        </div>

        {/* Footer Link to Register */}
        <div className="mt-6 text-center text-[13px] text-ink-600 border-t border-ink-100 pt-5">
          Don't have an account yet?{' '}
          <Link to="/register" className="font-bold text-brand-700 hover:underline">
            Create an Account
          </Link>
        </div>
      </div>
    </div>
  )
}
