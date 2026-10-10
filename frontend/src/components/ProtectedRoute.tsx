import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Card, Spinner } from './ui'
import { ShieldAlert, ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

type RoleType = 'CUSTOMER' | 'CONSUMER' | 'RECYCLER' | 'ADMIN'

interface ProtectedRouteProps {
  children: React.ReactNode
  requireRole?: RoleType | RoleType[]
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requireRole }) => {
  const { user, isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <Spinner label="Verifying authentication session" />
  }

  if (!isAuthenticated) {
    const redirectUrl = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?redirect=${redirectUrl}`} replace />
  }

  // If a specific role is required, check authorization (ADMIN is always allowed)
  if (requireRole && user) {
    const allowed = Array.isArray(requireRole) ? requireRole : [requireRole]
    if (!allowed.includes(user.role as RoleType) && user.role !== 'ADMIN') {
      const roleDashboardMap: Record<string, string> = {
        CUSTOMER: '/customer/dashboard',
        CONSUMER: '/recycling/dashboard',
        RECYCLER: '/recycler',
        ADMIN: '/admin',
      }
      const myDashboard = roleDashboardMap[user.role] || '/'

      return (
        <div className="mx-auto max-w-lg py-12">
          <Card>
            <div className="text-center py-6">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
                <ShieldAlert size={24} />
              </div>
              <h2 className="text-[18px] font-bold text-ink-900">Access Restricted</h2>
              <p className="mt-2 text-[13px] text-ink-600">
                This section is reserved for <strong>{allowed.join(' or ')}</strong> accounts. You are currently
                signed in as <span className="font-semibold text-brand-700">{user.role}</span> (
                {user.email}).
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <Link to={myDashboard} className="btn btn-primary btn-sm flex items-center gap-1.5">
                  <ArrowLeft size={14} />
                  <span>Go to My Dashboard</span>
                </Link>
              </div>
            </div>
          </Card>
        </div>
      )
    }
  }

  return <>{children}</>
}

export default ProtectedRoute
