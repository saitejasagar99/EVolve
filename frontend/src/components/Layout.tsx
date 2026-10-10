/**
 * EVolve AI — Clean Role-Aware Layout Shell
 *
 * Implements Section 28:
 *   Only shows navigation directly relevant to the selected role:
 *   - EV Owner
 *   - Battery Recycling & Recovery
 *   - Recycler
 *   - Admin / Fleet
 */

import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  AlertTriangle,
  BarChart3,
  BatteryCharging,
  Boxes,
  Cpu,
  Factory,
  FileText,
  Gauge,
  History,
  Home,
  Layers,
  Leaf,
  Menu,
  MessageSquare,
  Recycle,
  RotateCcw,
  Route,
  Search,
  ShoppingBag,
  Sparkles,
  TrendingDown,
  Truck,
  UploadCloud,
  LogIn,
  LogOut,
  UserPlus,
  X,
  Zap,
} from 'lucide-react'
import { useApp, useToast } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { api } from '../services/api'

export default function Layout() {
  const location = useLocation()
  const { health, reload } = useApp()
  const { push } = useToast()
  const { user, isAuthenticated, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [loadingDemo, setLoadingDemo] = useState(false)

  const loadDemo = async () => {
    setLoadingDemo(true)
    try {
      const r = await api.loadDemo(75)
      push(`Loaded ${r.batteries} synthetic batteries.`, 'success')
      reload()
    } catch (e) {
      push(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setLoadingDemo(false)
    }
  }

  const pathname = location.pathname

  // Determine active role from user role (strict boundary), fallback to route for guests or admin
  const userRole = user?.role
  let isFleet = pathname.startsWith('/fleet')
  let isCustomer = false
  let isRecycling = false
  let isRecycler = false
  let isAdmin = false

  if (isFleet) {
    // Dedicated fleet navigation
  } else if (userRole === 'CUSTOMER') {
    isCustomer = true
  } else if (userRole === 'CONSUMER') {
    isRecycling = true
  } else if (userRole === 'RECYCLER') {
    isRecycler = true
  } else if (userRole === 'ADMIN') {
    // Admin has multi-role governance access
    if (pathname.startsWith('/customer')) isCustomer = true
    else if (pathname.startsWith('/recycler')) isRecycler = true
    else if (pathname.startsWith('/recycling') || pathname.startsWith('/consumer')) isRecycling = true
    else isAdmin = true
  } else {
    // Unauthenticated demo exploration
    if (pathname.startsWith('/customer')) isCustomer = true
    else if (pathname.startsWith('/recycler')) isRecycler = true
    else if (pathname.startsWith('/recycling') || pathname.startsWith('/consumer')) isRecycling = true
    else if (pathname.startsWith('/admin') || pathname.startsWith('/batteries')) isAdmin = true
  }

  // Dynamic Navigation Items based on Connected Customer & Consumer Specification
  let roleTitle = 'EVolve AI Circularity'
  let roleBadge = 'Multi-Role Platform'
  let navItems: Array<{ to: string; label: string; icon: any; end?: boolean }> = []

  if (isFleet) {
    roleTitle = 'Fleet Intelligence'
    roleBadge = '🚛 Fleet Owner'
    navItems = [
      { to: '/fleet/welcome', label: 'Fleet Onboarding', icon: Sparkles },
      { to: '/fleet/upload', label: 'Upload Dataset', icon: UploadCloud },
      { to: '/fleet/dashboard', label: 'Fleet Dashboard', icon: BarChart3 },
      { to: '/fleet/history', label: 'Upload History', icon: History },
      { to: '/battery-intelligence', label: '3D Battery Intelligence', icon: Cpu },
      { to: '/', label: 'Home', icon: Home, end: true },
    ]
  } else if (isCustomer) {
    roleTitle = 'EV Owner Portal'
    roleBadge = '🚗 EV Owner'
    navItems = [
      { to: '/customer/dashboard', label: 'Dashboard', icon: Home, end: true },
      { to: '/customer/my-battery', label: 'My Battery', icon: BatteryCharging },
      { to: '/customer/battery-health', label: 'Battery Health', icon: Sparkles },
      { to: '/battery-intelligence', label: '3D Pack Telemetry', icon: Cpu },
      { to: '/circularity-journey', label: 'Circularity Journey', icon: Route },
      { to: '/customer/report-eol', label: 'Report End-of-Life Battery', icon: AlertTriangle },
      { to: '/customer/discarded-batteries', label: 'My Discarded Batteries', icon: Layers },
      { to: '/customer/lifecycle', label: 'Battery Lifecycle', icon: RotateCcw },
      { to: '/customer/collection-status', label: 'Collection Status', icon: Truck },
    ]
  } else if (isRecycling) {
    roleTitle = 'Consumer Circular Hub'
    roleBadge = '🔋 Consumer'
    const lastBatteryId = typeof window !== 'undefined' ? localStorage.getItem('last_viewed_battery_id') : null
    const batteryDetailsLink = pathname.startsWith('/consumer/discarded-batteries/')
      ? pathname
      : lastBatteryId
        ? `/consumer/discarded-batteries/${lastBatteryId}`
        : '/consumer/discarded-batteries/BAT-0072'

    navItems = [
      { to: '/consumer/discarded-batteries', label: 'Discover Discarded Batteries', icon: Search, end: true },
      { to: batteryDetailsLink, label: 'Battery Details & Components', icon: FileText },
      { to: '/consumer/parts-guide', label: 'Parts and Materials Guide', icon: Boxes },
      { to: '/consumer/reuse-vs-recycling', label: 'Reuse vs Recycling', icon: Zap },
      { to: '/consumer/enquiries', label: 'My Enquiries', icon: MessageSquare },
      { to: '/consumer/lifecycle-tracking', label: 'Lifecycle Tracking', icon: RotateCcw },
      { to: '/recycling/dashboard', label: 'Recycling Overview & Pipeline', icon: Recycle, end: true },
      { to: '/marketplace', label: 'Second-Life Marketplace', icon: ShoppingBag },
      { to: '/battery-intelligence', label: '3D Battery Intelligence', icon: Cpu },
      { to: '/circularity-journey', label: 'Circularity Journey', icon: Route },
    ]
  } else if (isRecycler) {
    roleTitle = 'Recycler Hub'
    roleBadge = '♻️ Recycler'
    navItems = [
      { to: '/', label: 'Home', icon: Home, end: true },
      { to: '/battery-intelligence', label: '3D Battery Intelligence', icon: Cpu },
      { to: '/circularity-journey', label: 'Circularity Pathways', icon: Route },
      { to: '/recycler?tab=queue', label: 'Collection Queue', icon: Route },
      { to: '/recycler?tab=planning', label: 'Collection Planning', icon: Boxes },
      { to: '/recycler?tab=recycling', label: 'Recycling Status', icon: Factory },
      { to: '/admin', label: 'Admin Overview', icon: Gauge },
    ]
  } else if (isAdmin) {
    roleTitle = 'Admin & Fleet Governance'
    roleBadge = '🏢 Admin'
    navItems = [
      { to: '/', label: 'Home', icon: Home, end: true },
      { to: '/battery-intelligence', label: '3D Battery Intelligence', icon: Cpu },
      { to: '/circularity-journey', label: 'Circularity Journey', icon: Route },
      { to: '/marketplace', label: 'Second-Life Marketplace', icon: ShoppingBag },
      { to: '/admin?tab=overview', label: 'Battery Overview', icon: BatteryCharging },
      { to: '/admin?tab=forecast', label: 'Waste Prediction', icon: TrendingDown },
      { to: '/admin?tab=prevention', label: 'Waste Prevention', icon: Leaf },
      { to: '/admin?tab=secondlife', label: 'Second-Life Candidates', icon: Zap },
      { to: '/admin?tab=circularity', label: 'Circularity & Passport', icon: Recycle },
      { to: '/customer/battery', label: 'EV Owner Wizard', icon: Sparkles },
      { to: '/recycler', label: 'Recycler Operations', icon: Truck },
    ]
  } else {
    // Default Home navigation
    roleTitle = 'EVolve AI Navigation'
    roleBadge = '🌐 Ecosystem'
    navItems = [
      { to: '/', label: 'Home', icon: Home, end: true },
      { to: '/fleet/welcome', label: '🚛 Fleet Owner Intelligence', icon: Truck },
      { to: '/battery-intelligence', label: '⚡ 3D Battery Intelligence', icon: Cpu },
      { to: '/circularity-journey', label: '🔄 Circularity Journey', icon: Route },
      { to: '/marketplace', label: '🛍️ Second-Life Marketplace', icon: ShoppingBag },
      { to: '/customer/dashboard', label: '🚗 EV Owner: Dashboard', icon: BatteryCharging },
      { to: '/recycling/dashboard', label: '🔋 Battery Recycling & Recovery', icon: Recycle },
      { to: '/recycler', label: '♻️ Recycler: Collection Queue', icon: Truck },
      { to: '/admin', label: '🏢 Admin: Circular Governance', icon: Gauge },
    ]
  }

  const simulated = health?.provenance?.simulated ?? true

  return (
    <div className="flex min-h-screen bg-cream">
      {/* ---------------- sidebar ---------------- */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 shrink-0 border-r border-ink-200 bg-white
                    transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex items-center justify-between border-b border-ink-200 px-4 py-4">
            <Link
              to={
                user?.role === 'CUSTOMER'
                  ? '/customer/dashboard'
                  : user?.role === 'CONSUMER'
                    ? '/consumer/discarded-batteries'
                    : user?.role === 'RECYCLER'
                      ? '/recycler'
                      : user?.role === 'ADMIN'
                        ? '/admin'
                        : '/'
              }
              className="flex items-center gap-2.5 min-w-0 hover:opacity-90 transition-opacity"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-2xs shrink-0">
                <Leaf size={18} />
              </div>
              <div className="min-w-0">
                <div className="text-[16px] font-black leading-tight text-ink-900">EVolve AI</div>
                <div className="truncate text-[10px] font-bold uppercase tracking-wider text-brand-700">
                  Circular Battery Intelligence
                </div>
              </div>
            </Link>
            <button
              className="btn btn-ghost btn-sm ml-auto lg:hidden"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
            >
              <X size={16} />
            </button>
          </div>

          {/* Active Role Indicator in Sidebar */}
          <div className="border-b border-ink-100 bg-ink-50/60 px-4 py-2.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400 block">
              Active Context
            </span>
            <span className="text-[12.5px] font-extrabold text-ink-800">
              {roleBadge} · {roleTitle}
            </span>
          </div>

          {/* Clean Navigation (Section 28) */}
          <nav className="scroll-thin flex-1 overflow-y-auto px-3 py-3">
            <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-400">
              Navigation
            </div>
            <ul className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition-all duration-200 ${
                          isActive
                            ? 'bg-gradient-to-r from-brand-600 to-teal-600 text-white shadow-sm font-bold scale-[1.01]'
                            : 'text-ink-600 hover:bg-brand-50/70 hover:text-brand-900'
                        }`
                      }
                    >
                      <Icon size={16} className="shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </nav>

          {/* User Account / Sign In Widget */}
          <div className="border-t border-ink-200 p-3 bg-ink-50/50">
            {isAuthenticated && user ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <NavLink
                    to="/customer/profile"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white font-bold text-[11px] shrink-0">
                      {user.full_name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-bold text-ink-900 leading-tight">
                        {user.full_name}
                      </div>
                      <div className="text-[10px] text-brand-700 font-semibold truncate">
                        {user.role}{' '}
                        {user.vehicle ? `· ${user.vehicle.model || user.vehicle.vehicle_model}` : ''}
                      </div>
                    </div>
                  </NavLink>
                  <button
                    onClick={() => {
                      logout()
                      push('Signed out successfully.', 'info')
                    }}
                    title="Sign Out"
                    className="btn btn-ghost btn-xs text-ink-400 hover:text-rose-600"
                  >
                    <LogOut size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <NavLink
                  to="/login"
                  onClick={() => setOpen(false)}
                  className="btn btn-outline btn-xs flex-1 text-center justify-center font-bold"
                >
                  <LogIn size={12} />
                  <span>Sign In</span>
                </NavLink>
                <NavLink
                  to="/register"
                  onClick={() => setOpen(false)}
                  className="btn btn-primary btn-xs flex-1 text-center justify-center font-bold"
                >
                  <UserPlus size={12} />
                  <span>Register</span>
                </NavLink>
              </div>
            )}
          </div>

          {/* Bottom Demo Fleet Reset - Only visible for Admin or Guest exploring demo */}
          {(!user || user.role === 'ADMIN') && (
            <div className="border-t border-ink-200 p-3 space-y-2">
              <button
                onClick={loadDemo}
                disabled={loadingDemo}
                className="btn btn-outline btn-sm w-full text-[11.5px] font-bold justify-center"
              >
                <RotateCcw size={13} className={loadingDemo ? 'animate-spin' : ''} />
                <span>{loadingDemo ? 'Reloading Fleet…' : 'Reset Demo Fleet (75 Packs)'}</span>
              </button>
              <div className="text-[10px] text-ink-400 text-center">
                Predict · Prevent · Reuse · Collect · Recycle
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ---------------- main area ---------------- */}
      <div className="flex flex-1 flex-col lg:pl-64">
        {/* Top Header with Quick Role Switcher Pills */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-ink-200 bg-white/95 px-4 py-2.5 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button
              className="btn btn-ghost btn-sm lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={18} />
            </button>

            {/* Role Header Context or Admin/Guest Switcher */}
            {userRole === 'CUSTOMER' ? (
              <div className="hidden sm:flex items-center gap-2 text-[12px] font-bold text-ink-700">
                <span className="rounded-lg bg-brand-50 border border-brand-200 px-2.5 py-1 text-brand-800 flex items-center gap-1.5">
                  <span>🚗</span>
                  <span>EV Owner Portal</span>
                </span>
                {user?.vehicle?.model || user?.vehicle?.vehicle_model ? (
                  <>
                    <span className="text-ink-400 text-[11px]">·</span>
                    <span className="text-ink-500 font-medium text-[11.5px]">
                      {user.vehicle.manufacturer ? `${user.vehicle.manufacturer} ` : ''}
                      {user.vehicle.model || user.vehicle.vehicle_model}
                    </span>
                  </>
                ) : null}
              </div>
            ) : userRole === 'CONSUMER' ? (
              <div className="hidden sm:flex items-center gap-2 text-[12px] font-bold text-ink-700">
                <span className="rounded-lg bg-teal-50 border border-teal-200 px-2.5 py-1 text-teal-800 flex items-center gap-1.5">
                  <span>🔋</span>
                  <span>Consumer Circular Hub</span>
                </span>
                <span className="text-ink-400 text-[11px]">·</span>
                <span className="text-ink-500 font-medium text-[11.5px]">
                  Component Exploration &amp; Second-Life Reuse
                </span>
              </div>
            ) : userRole === 'RECYCLER' ? (
              <div className="hidden sm:flex items-center gap-2 text-[12px] font-bold text-ink-700">
                <span className="rounded-lg bg-rose-50 border border-rose-200 px-2.5 py-1 text-rose-800 flex items-center gap-1.5">
                  <span>♻️</span>
                  <span>Recycler Operations Hub</span>
                </span>
              </div>
            ) : (
              /* Admin or Guest Visitor: Quick Switcher */
              <div className="hidden sm:flex items-center gap-1.5 overflow-x-auto text-[11.5px] font-bold">
                <span className="text-ink-400 text-[11px] uppercase mr-1">Switch:</span>
                <NavLink
                  to="/"
                  end
                  className={({ isActive }) =>
                    `rounded-lg px-2.5 py-1 transition-all ${
                      isActive ? 'bg-ink-900 text-white' : 'bg-ink-50 text-ink-600 hover:bg-ink-100'
                    }`
                  }
                >
                  🏠 Home
                </NavLink>
                <NavLink
                  to="/battery-intelligence"
                  className={({ isActive }) =>
                    `rounded-lg px-2.5 py-1 transition-all ${
                      isActive ? 'bg-cyan-600 text-white' : 'bg-cyan-50 text-cyan-800 hover:bg-cyan-100'
                    }`
                  }
                >
                  ⚡ 3D Pack
                </NavLink>
                <NavLink
                  to="/circularity-journey"
                  className={({ isActive }) =>
                    `rounded-lg px-2.5 py-1 transition-all ${
                      isActive ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    }`
                  }
                >
                  🔄 Circularity
                </NavLink>
                <NavLink
                  to="/marketplace"
                  className={({ isActive }) =>
                    `rounded-lg px-2.5 py-1 transition-all ${
                      isActive ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100'
                    }`
                  }
                >
                  🛍️ Marketplace
                </NavLink>
                <NavLink
                  to="/customer"
                  className={({ isActive }) =>
                    `rounded-lg px-2.5 py-1 transition-all ${
                      isActive || isCustomer ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-800 hover:bg-brand-100'
                    }`
                  }
                >
                  🚗 EV Owner
                </NavLink>
                <NavLink
                  to="/recycling/dashboard"
                  className={({ isActive }) =>
                    `rounded-lg px-2.5 py-1 transition-all ${
                      isActive || isRecycling ? 'bg-teal-700 text-white' : 'bg-teal-50 text-teal-800 hover:bg-teal-100'
                    }`
                  }
                >
                  🔋 Consumer
                </NavLink>
                <NavLink
                  to="/recycler"
                  className={({ isActive }) =>
                    `rounded-lg px-2.5 py-1 transition-all ${
                      isActive || isRecycler ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
                    }`
                  }
                >
                  ♻️ Recycler
                </NavLink>
                <NavLink
                  to="/admin"
                  className={({ isActive }) =>
                    `rounded-lg px-2.5 py-1 transition-all ${
                      isActive || isAdmin ? 'bg-slate-800 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'
                    }`
                  }
                >
                  🏢 Admin
                </NavLink>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {(!user || user.role === 'ADMIN') && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-bold ${
                  simulated
                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                }`}
              >
                {simulated ? 'SYNTHETIC DEMO DATA' : 'OPERATOR DATA'}
              </span>
            )}

            {/* Auth Actions in Header */}
            {isAuthenticated && user ? (
              <div className="flex items-center gap-1.5 ml-1 border-l border-ink-200 pl-2.5">
                <NavLink
                  to="/customer/profile"
                  className="flex items-center gap-1.5 rounded-lg border border-ink-200 bg-ink-50 px-2 py-1 text-[11.5px] font-semibold text-ink-800 hover:bg-ink-100 transition-colors"
                >
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
                    {user.full_name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <span className="max-w-[90px] truncate hidden md:inline">{user.full_name}</span>
                  <span className="rounded bg-brand-100 px-1 text-[9.5px] font-bold text-brand-800">
                    {user.role}
                  </span>
                </NavLink>
                <button
                  onClick={() => {
                    logout()
                    push('Signed out successfully.', 'info')
                  }}
                  title="Sign Out"
                  className="btn btn-ghost btn-xs text-ink-500 hover:text-rose-600"
                >
                  <LogOut size={15} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 ml-1 border-l border-ink-200 pl-2.5">
                <NavLink to="/login" className="btn btn-ghost btn-xs text-[11.5px] font-bold">
                  Sign In
                </NavLink>
                <NavLink to="/register" className="btn btn-primary btn-xs text-[11.5px] font-bold">
                  Register
                </NavLink>
              </div>
            )}
          </div>
        </header>

        {/* Content View */}
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}