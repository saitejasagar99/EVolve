/**
 * EVolve AI — Clean Route Architecture with Role-Based Authentication
 *
 * Implements:
 *   Landing Page (Home)
 *   Auth Flow: Login, Register, Verify Email OTP, Forgot Password
 *   EV Owner: My Battery, Health Assessment Wizard, My EV Profile
 *   Battery Recycling & Recovery: Circular Education & Lifecycle Guidance
 *   Recycler: Collection Queue, Planning, Recycling Capacity
 *   Admin & Fleet: Full Circularity Governance
 */

import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppProvider, ToastProvider } from './context/AppContext'
import { AuthProvider } from './context/AuthContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'

import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import VerifyEmail from './pages/VerifyEmail'
import ForgotPassword from './pages/ForgotPassword'
import CustomerProfile from './pages/CustomerProfile'
import CustomerDashboard from './pages/CustomerDashboard'
import CustomerBatteryWizard from './pages/CustomerBatteryWizard'
import CustomerReportEol from './pages/CustomerReportEol'
import CustomerDiscardedBatteries from './pages/CustomerDiscardedBatteries'
import RecyclingDashboard from './pages/RecyclingDashboard'
import RecyclingLearn from './pages/RecyclingLearn'
import ConsumerDiscardedBatteries from './pages/ConsumerDiscardedBatteries'
import ConsumerBatteryDetail from './pages/ConsumerBatteryDetail'
import ConsumerPartsGuide from './pages/ConsumerPartsGuide'
import ConsumerReuseVsRecycling from './pages/ConsumerReuseVsRecycling'
import ConsumerEnquiries from './pages/ConsumerEnquiries'
import RecyclerDashboard from './pages/RecyclerDashboard'
import AdminDashboard from './pages/AdminDashboard'
import { BatteryDetail } from './pages/Fleet'
import BatteryIntelligence from './pages/BatteryIntelligence'
import SecondLifeMarketplace from './pages/SecondLifeMarketplace'
import CircularityJourney from './pages/CircularityJourney'
import FleetWelcome from './pages/FleetWelcome'
import FleetUpload from './pages/FleetUpload'
import FleetDashboard from './pages/FleetDashboard'
import FleetHistory from './pages/FleetHistory'

export default function App() {
  return (
    <AppProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                {/* Public Home & Landing */}
                <Route index element={<Home />} />

                {/* 3D Animated & Circularity Showcases */}
                <Route path="battery-intelligence" element={<BatteryIntelligence />} />
                <Route path="marketplace" element={<SecondLifeMarketplace />} />
                <Route path="circularity-journey" element={<CircularityJourney />} />
                <Route path="assessment" element={<Navigate to="/customer/battery" replace />} />

                {/* Authentication Routes */}
                <Route path="login" element={<Login />} />
                <Route path="register" element={<Register />} />
                <Route path="verify-email" element={<VerifyEmail />} />
                <Route path="forgot-password" element={<ForgotPassword />} />

                {/* EV Owner Portal (Protected) */}
                <Route
                  path="customer"
                  element={
                    <ProtectedRoute requireRole="CUSTOMER">
                      <CustomerDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="customer/dashboard"
                  element={
                    <ProtectedRoute requireRole="CUSTOMER">
                      <CustomerDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="customer/my-battery"
                  element={
                    <ProtectedRoute requireRole="CUSTOMER">
                      <CustomerDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="customer/battery"
                  element={
                    <ProtectedRoute requireRole="CUSTOMER">
                      <CustomerBatteryWizard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="customer/battery-health"
                  element={
                    <ProtectedRoute requireRole="CUSTOMER">
                      <CustomerBatteryWizard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="customer/report-eol"
                  element={
                    <ProtectedRoute requireRole="CUSTOMER">
                      <CustomerReportEol />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="customer/discarded-batteries"
                  element={
                    <ProtectedRoute requireRole="CUSTOMER">
                      <CustomerDiscardedBatteries />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="customer/lifecycle"
                  element={
                    <ProtectedRoute requireRole="CUSTOMER">
                      <CustomerDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="customer/collection-status"
                  element={
                    <ProtectedRoute requireRole="CUSTOMER">
                      <CustomerDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="customer/profile"
                  element={
                    <ProtectedRoute>
                      <CustomerProfile />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="profile"
                  element={
                    <ProtectedRoute>
                      <CustomerProfile />
                    </ProtectedRoute>
                  }
                />

                {/* Battery Recycling & Recovery Portal */}
                <Route
                  path="recycling"
                  element={<Navigate to="/recycling/dashboard" replace />}
                />
                <Route
                  path="recycling/dashboard"
                  element={
                    <ProtectedRoute requireRole={['CONSUMER', 'RECYCLER', 'ADMIN']}>
                      <RecyclingDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="recycling/learn"
                  element={
                    <ProtectedRoute requireRole={['CONSUMER', 'RECYCLER', 'ADMIN']}>
                      <RecyclingLearn />
                    </ProtectedRoute>
                  }
                />

                {/* Consumer Circular Discovery & Parts Guide Routes */}
                <Route
                  path="consumer"
                  element={
                    <ProtectedRoute requireRole={['CONSUMER', 'RECYCLER', 'ADMIN']}>
                      <ConsumerDiscardedBatteries />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="consumer/overview"
                  element={
                    <ProtectedRoute requireRole={['CONSUMER', 'RECYCLER', 'ADMIN']}>
                      <RecyclingDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="consumer/dashboard"
                  element={
                    <ProtectedRoute requireRole={['CONSUMER', 'RECYCLER', 'ADMIN']}>
                      <ConsumerDiscardedBatteries />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="consumer/discarded-batteries"
                  element={
                    <ProtectedRoute requireRole={['CONSUMER', 'RECYCLER', 'ADMIN']}>
                      <ConsumerDiscardedBatteries />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="consumer/discarded-batteries/:batteryId"
                  element={
                    <ProtectedRoute requireRole={['CONSUMER', 'RECYCLER', 'ADMIN']}>
                      <ConsumerBatteryDetail />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="consumer/parts-guide"
                  element={
                    <ProtectedRoute requireRole={['CONSUMER', 'RECYCLER', 'ADMIN']}>
                      <ConsumerPartsGuide />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="consumer/reuse-vs-recycling"
                  element={
                    <ProtectedRoute requireRole={['CONSUMER', 'RECYCLER', 'ADMIN']}>
                      <ConsumerReuseVsRecycling />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="consumer/enquiries"
                  element={
                    <ProtectedRoute requireRole={['CONSUMER', 'RECYCLER', 'ADMIN']}>
                      <ConsumerEnquiries />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="consumer/lifecycle-tracking"
                  element={
                    <ProtectedRoute requireRole={['CONSUMER', 'RECYCLER', 'ADMIN']}>
                      <ConsumerDiscardedBatteries />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="consumer/marketplace"
                  element={<Navigate to="/consumer/discarded-batteries" replace />}
                />

                {/* Recycler Portal (Protected) */}
                <Route
                  path="recycler"
                  element={
                    <ProtectedRoute requireRole="RECYCLER">
                      <RecyclerDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="recycler/dashboard"
                  element={
                    <ProtectedRoute requireRole="RECYCLER">
                      <RecyclerDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="collection"
                  element={
                    <ProtectedRoute requireRole="RECYCLER">
                      <RecyclerDashboard tab="queue" />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="optimizer"
                  element={
                    <ProtectedRoute requireRole="RECYCLER">
                      <RecyclerDashboard tab="planning" />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="capacity"
                  element={
                    <ProtectedRoute requireRole="RECYCLER">
                      <RecyclerDashboard tab="recycling" />
                    </ProtectedRoute>
                  }
                />

                {/* Admin & Fleet Portal (Protected) */}
                <Route
                  path="admin"
                  element={
                    <ProtectedRoute requireRole="ADMIN">
                      <AdminDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="admin/dashboard"
                  element={
                    <ProtectedRoute requireRole="ADMIN">
                      <AdminDashboard />
                    </ProtectedRoute>
                  }
                />
                {/* Fleet Owner & Multi-Vehicle Battery Intelligence */}
                <Route path="fleet/welcome" element={<FleetWelcome />} />
                <Route path="fleet/upload" element={<FleetUpload />} />
                <Route path="fleet/dashboard" element={<FleetDashboard />} />
                <Route path="fleet/dashboard/:analysisId" element={<FleetDashboard />} />
                <Route path="fleet/history" element={<FleetHistory />} />
                <Route path="fleet" element={<FleetDashboard />} />
                <Route
                  path="admin/fleet"
                  element={
                    <ProtectedRoute requireRole="ADMIN">
                      <AdminDashboard tab="overview" />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="batteries"
                  element={
                    <ProtectedRoute requireRole="ADMIN">
                      <AdminDashboard tab="overview" />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="batteries/:id"
                  element={
                    <ProtectedRoute requireRole="ADMIN">
                      <BatteryDetail />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="forecast"
                  element={
                    <ProtectedRoute requireRole="ADMIN">
                      <AdminDashboard tab="forecast" />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="prevention"
                  element={
                    <ProtectedRoute requireRole="ADMIN">
                      <AdminDashboard tab="prevention" />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="circularity"
                  element={
                    <ProtectedRoute requireRole="ADMIN">
                      <AdminDashboard tab="circularity" />
                    </ProtectedRoute>
                  }
                />

                {/* Catch-all */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </AppProvider>
  )
}
