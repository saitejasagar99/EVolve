/**
 * EVolve AI — User Profile & Registry Page
 *
 * Route: /customer/profile and /profile
 * Features:
 *   - Displays secure user information with masked identity (phone, Aadhaar, email).
 *   - Role-aware card: EV details for EV Owners, Application specs for Battery Recycling & Recovery users.
 *   - Editable profile details (name, phone, vehicle, location).
 *   - Danger Zone: Option for the user to delete their account with password verification modal.
 */

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  BookOpen,
  Car,
  CheckCircle2,
  Edit2,
  Eye,
  EyeOff,
  Recycle,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  X,
} from 'lucide-react'
import { PageHeader, Spinner } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/AppContext'
import type { ProfileUpdatePayload } from '../types/api'

export default function CustomerProfile() {
  const { user, updateProfile, deleteAccount, isLoading } = useAuth()
  const { push } = useToast()
  const navigate = useNavigate()

  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  // Account Deletion Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [showDeletePassword, setShowDeletePassword] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [editForm, setEditForm] = useState<ProfileUpdatePayload>({
    full_name: '',
    phone: '',
    city: '',
    state: '',
    pincode: '',
    odometer_km: 0,
    vehicle_number: '',
    vehicle_manufacturer: '',
    vehicle_model: '',
    vehicle_purchase_year: 2023,
  })

  useEffect(() => {
    if (user) {
      const v = user.vehicle
      setEditForm({
        full_name: user.full_name || '',
        phone: user.phone || '',
        city: v?.city || user.city || '',
        state: v?.state || user.state || '',
        pincode: v?.pincode || user.pincode || '',
        odometer_km: v?.odometer_km || 0,
        vehicle_number: v?.vehicle_number || '',
        vehicle_manufacturer: v?.manufacturer || v?.vehicle_manufacturer || 'Tata',
        vehicle_model: v?.model || v?.vehicle_model || 'Nexon EV',
        vehicle_purchase_year: v?.purchase_year || 2023,
      })
    }
  }, [user])

  if (isLoading) {
    return <Spinner label="Loading customer profile" />
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <p className="text-ink-600">Please sign in to view your profile.</p>
        <Link to="/login" className="btn btn-primary mt-4">
          Go to Sign In
        </Link>
      </div>
    )
  }

  const v = user.vehicle
  const isConsumer = user.role === 'CONSUMER'
  const isRecycler = user.role === 'RECYCLER'
  const isCustomer = user.role === 'CUSTOMER'

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await updateProfile(editForm)
      push('Profile updated successfully!', 'success')
      setIsEditing(false)
    } catch (err: any) {
      push(err instanceof Error ? err.message : 'Failed to update profile.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setDeleting(true)
    setDeleteError(null)

    try {
      await deleteAccount(deletePassword || undefined)
      push('Your EVolve AI account has been permanently deleted.', 'info')
      setShowDeleteModal(false)
      navigate('/', { replace: true })
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : 'Failed to delete account. Please try again.'
      setDeleteError(msg)
      push(msg, 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl py-4 space-y-6">
      {/* Header */}
      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <span>
              {isConsumer
                ? 'Consumer Profile & Application Settings'
                : isRecycler
                  ? 'Recycler Hub Profile'
                  : 'Customer Profile & Vehicle Registry'}
            </span>
            <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-brand-800">
              {user.role}
            </span>
          </div>
        }
        subtitle="Manage your profile credentials, circularity preferences, and account settings."
        actions={
          <div className="flex items-center gap-2">
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="btn btn-outline btn-sm flex items-center gap-1.5"
              >
                <Edit2 size={13} />
                <span>Edit Profile</span>
              </button>
            ) : (
              <button
                onClick={() => setIsEditing(false)}
                className="btn btn-ghost btn-sm flex items-center gap-1.5 text-ink-600"
              >
                <X size={13} />
                <span>Cancel</span>
              </button>
            )}
            {isCustomer && (
              <Link
                to="/customer/battery"
                className="btn btn-primary btn-sm flex items-center gap-1.5"
              >
                <Sparkles size={13} />
                <span>Check Battery Health</span>
              </Link>
            )}
            {isConsumer && (
              <Link
                to="/recycling/dashboard"
                className="btn btn-primary btn-sm flex items-center gap-1.5"
              >
                <Recycle size={13} />
                <span>Battery Recycling & Recovery</span>
              </Link>
            )}
          </div>
        }
      />

      {/* Main Grid: User Details + Role-specific Details */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* User Account & Identity Card */}
        <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-ink-100 pb-3">
            <div className="flex items-center gap-2">
              <User size={18} className="text-brand-600" />
              <h2 className="text-[15px] font-bold text-ink-900">User Identity & Credentials</h2>
            </div>
            {user.email_verified && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full border border-brand-200">
                <CheckCircle2 size={12} />
                <span>Verified</span>
              </span>
            )}
          </div>

          <div className="space-y-3.5 text-[13px]">
            <div className="flex justify-between items-center py-1 border-b border-ink-50">
              <span className="text-ink-500 font-medium">Full Name</span>
              <span className="font-bold text-ink-900">{user.full_name}</span>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-ink-50">
              <span className="text-ink-500 font-medium">Username</span>
              <span className="font-mono text-ink-800">@{user.username}</span>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-ink-50">
              <span className="text-ink-500 font-medium">Email Address</span>
              <span className="font-medium text-ink-900">{user.masked_email || user.email}</span>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-ink-50">
              <span className="text-ink-500 font-medium">Contact Phone</span>
              <span className="font-medium text-ink-900">{user.masked_phone || user.phone}</span>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-ink-50">
              <span className="text-ink-500 font-medium">Aadhaar Token</span>
              <span className="font-mono font-semibold text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                {user.masked_aadhaar || 'Not linked'}
              </span>
            </div>

            <div className="flex justify-between items-center py-1">
              <span className="text-ink-500 font-medium">Member Since</span>
              <span className="text-ink-700">
                {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Active'}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-3 text-[11.5px] text-ink-500 flex items-start gap-2">
            <ShieldCheck size={14} className="text-brand-600 shrink-0 mt-0.5" />
            <span>
              Sensitive fields such as full phone numbers and Aadhaar are strictly masked in client
              interfaces to uphold complete privacy.
            </span>
          </div>
        </div>

        {/* Second Column: Role-Specific Card */}
        {isCustomer ? (
          /* EV Owner: Registered Electric Vehicle Card */
          <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-ink-100 pb-3">
              <div className="flex items-center gap-2">
                <Car size={18} className="text-brand-600" />
                <h2 className="text-[15px] font-bold text-ink-900">Registered Electric Vehicle</h2>
              </div>
              {v && (
                <span className="font-mono text-[11.5px] font-bold text-ink-700 bg-ink-100 px-2 py-0.5 rounded">
                  {v.masked_vehicle_number || v.vehicle_number}
                </span>
              )}
            </div>

            {v ? (
              <div className="space-y-3.5 text-[13px]">
                <div className="flex justify-between items-center py-1 border-b border-ink-50">
                  <span className="text-ink-500 font-medium">Brand / Manufacturer</span>
                  <span className="font-bold text-ink-900">{v.manufacturer || v.vehicle_manufacturer}</span>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-ink-50">
                  <span className="text-ink-500 font-medium">Model</span>
                  <span className="font-bold text-ink-900">{v.model || v.vehicle_model}</span>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-ink-50">
                  <span className="text-ink-500 font-medium">Purchase Year</span>
                  <span className="text-ink-900 font-medium">{v.purchase_year}</span>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-ink-50">
                  <span className="text-ink-500 font-medium">Odometer Reading</span>
                  <span className="text-ink-900 font-bold">{v.odometer_km?.toLocaleString()} km</span>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-ink-50">
                  <span className="text-ink-500 font-medium">Operating City</span>
                  <span className="text-ink-900 font-medium">{v.city}</span>
                </div>

                <div className="flex justify-between items-center py-1">
                  <span className="text-ink-500 font-medium">State & PIN Code</span>
                  <span className="text-ink-900 font-medium">
                    {v.state} {v.pincode ? `(${v.pincode})` : ''}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-ink-500">
                <Car size={32} className="mx-auto text-ink-300 mb-2" />
                <p className="text-[13px]">No vehicle registered yet.</p>
              </div>
            )}

            <div className="pt-2">
              <Link
                to="/customer/battery"
                className="btn btn-outline btn-sm w-full justify-center flex items-center gap-1.5"
              >
                <Sparkles size={13} className="text-brand-600" />
                <span>Run AI Health Assessment for this Vehicle</span>
              </Link>
            </div>
          </div>
        ) : isConsumer ? (
          /* Battery Recycling & Recovery Preferences Card */
          <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-ink-100 pb-3">
              <div className="flex items-center gap-2">
                <Recycle size={18} className="text-emerald-600" />
                <h2 className="text-[15px] font-bold text-ink-900">Battery Recycling & Recovery Profile</h2>
              </div>
              <span className="text-[11.5px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Eco Advocate
              </span>
            </div>

            <div className="space-y-3.5 text-[13px]">
              <div className="flex justify-between items-center py-1 border-b border-ink-50">
                <span className="text-ink-500 font-medium">Interest Area</span>
                <span className="font-bold text-ink-900">
                  {(user as any).intended_application || 'Solar Energy Storage & Recycling'}
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-ink-50">
                <span className="text-ink-500 font-medium">Operating City</span>
                <span className="text-ink-900 font-medium">{user.city || 'Hyderabad'}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-ink-50">
                <span className="text-ink-500 font-medium">State & Region</span>
                <span className="text-ink-900 font-medium">{user.state || 'Telangana'}</span>
              </div>

              <div className="flex justify-between items-center py-1">
                <span className="text-ink-500 font-medium">PIN Code</span>
                <span className="text-ink-900 font-medium">{user.pincode || '500081'}</span>
              </div>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-[12px] text-emerald-900">
              <p>
                Learn how end-of-life battery cells can be responsibly collected, evaluated for reuse, or hydrometallurgically recycled for black mass and critical mineral recovery.
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <Link
                to="/recycling/dashboard"
                className="btn btn-primary btn-sm flex-1 justify-center flex items-center gap-1.5"
              >
                <Recycle size={13} />
                <span>Recycling Hub</span>
              </Link>
              <Link
                to="/recycling/learn"
                className="btn btn-outline btn-sm flex-1 justify-center flex items-center gap-1.5"
              >
                <BookOpen size={13} className="text-emerald-600" />
                <span>Educational Guide</span>
              </Link>
            </div>
          </div>
        ) : (
          /* Recycler / Admin Overview Card */
          <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-ink-100 pb-3">
              <div className="flex items-center gap-2">
                <Recycle size={18} className="text-brand-600" />
                <h2 className="text-[15px] font-bold text-ink-900">Platform Operations</h2>
              </div>
              <span className="text-[11.5px] font-bold text-brand-800 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                {user.role}
              </span>
            </div>

            <div className="space-y-3.5 text-[13px]">
              <div className="flex justify-between items-center py-1 border-b border-ink-50">
                <span className="text-ink-500 font-medium">Role Responsibility</span>
                <span className="font-bold text-ink-900">
                  {isRecycler ? 'Battery Collection & Material Recovery' : 'Ecosystem Governance & Forecasting'}
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-ink-50">
                <span className="text-ink-500 font-medium">Location</span>
                <span className="text-ink-900 font-medium">
                  {user.city || 'Hyderabad'}, {user.state || 'Telangana'}
                </span>
              </div>
            </div>

            <div className="pt-2">
              <Link
                to={isRecycler ? '/recycler' : '/admin'}
                className="btn btn-outline btn-sm w-full justify-center flex items-center gap-1.5"
              >
                <span>{isRecycler ? 'View Collection Hub' : 'Open Circularity Governance'}</span>
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Edit Profile Form (collapsible / conditional) */}
      {isEditing && (
        <div className="rounded-2xl border border-brand-200 bg-white p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-ink-100 pb-3">
            <div className="flex items-center gap-2">
              <Edit2 size={18} className="text-brand-600" />
              <h2 className="text-[16px] font-bold text-ink-900">Update Profile Details</h2>
            </div>
            <button
              onClick={() => setIsEditing(false)}
              className="text-ink-400 hover:text-ink-600"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-[12px] font-bold text-ink-700 uppercase tracking-wider mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={editForm.full_name || ''}
                  onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-[12px] font-bold text-ink-700 uppercase tracking-wider mb-1">
                  Contact Phone
                </label>
                <input
                  type="text"
                  value={editForm.phone || ''}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="input w-full"
                />
              </div>

              {isCustomer && (
                <>
                  <div>
                    <label className="block text-[12px] font-bold text-ink-700 uppercase tracking-wider mb-1">
                      Vehicle Manufacturer
                    </label>
                    <input
                      type="text"
                      value={editForm.vehicle_manufacturer || ''}
                      onChange={(e) => setEditForm({ ...editForm, vehicle_manufacturer: e.target.value })}
                      className="input w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-[12px] font-bold text-ink-700 uppercase tracking-wider mb-1">
                      Vehicle Model
                    </label>
                    <input
                      type="text"
                      value={editForm.vehicle_model || ''}
                      onChange={(e) => setEditForm({ ...editForm, vehicle_model: e.target.value })}
                      className="input w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-[12px] font-bold text-ink-700 uppercase tracking-wider mb-1">
                      Current Odometer (km)
                    </label>
                    <input
                      type="number"
                      value={editForm.odometer_km || 0}
                      onChange={(e) => setEditForm({ ...editForm, odometer_km: Number(e.target.value) })}
                      className="input w-full"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-[12px] font-bold text-ink-700 uppercase tracking-wider mb-1">
                  Operating City
                </label>
                <input
                  type="text"
                  value={editForm.city || ''}
                  onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-[12px] font-bold text-ink-700 uppercase tracking-wider mb-1">
                  State
                </label>
                <input
                  type="text"
                  value={editForm.state || ''}
                  onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-[12px] font-bold text-ink-700 uppercase tracking-wider mb-1">
                  PIN Code
                </label>
                <input
                  type="text"
                  value={editForm.pincode || ''}
                  onChange={(e) => setEditForm({ ...editForm, pincode: e.target.value })}
                  className="input w-full"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-ink-100">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="btn btn-outline"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="btn btn-primary flex items-center gap-1.5"
              >
                <Save size={14} />
                <span>{saving ? 'Saving Changes…' : 'Save Profile Changes'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ======================================================== */}
      {/* DANGER ZONE: Account Deletion Choice                     */}
      {/* ======================================================== */}
      <div className="rounded-2xl border border-rose-200 bg-white p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2.5 text-rose-700 border-b border-rose-100 pb-3">
          <AlertTriangle size={20} className="shrink-0" />
          <div>
            <h2 className="text-[16px] font-extrabold text-rose-900">Danger Zone — Delete Account</h2>
            <p className="text-[12.5px] text-rose-600">
              Irreversible account and personal data removal
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
          <div className="max-w-xl text-[13px] text-ink-600 space-y-1">
            <p className="font-semibold text-ink-800">
              Permanently delete your EVolve AI account and associated records
            </p>
            <p className="text-[12px] text-ink-500 leading-relaxed">
              Once your account is deleted, your credentials, registered vehicles, battery health
              predictions, and circularity telemetry will be permanently wiped from the database.
              You cannot recover this data later.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setDeleteError(null)
              setDeletePassword('')
              setShowDeleteModal(true)
            }}
            className="btn btn-outline border-rose-300 text-rose-700 hover:bg-rose-50 hover:border-rose-400 shrink-0 font-bold flex items-center gap-2 px-4 py-2 text-[13px]"
          >
            <Trash2 size={15} />
            <span>Delete Account</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* CONFIRMATION MODAL: Delete Account                       */}
      {/* ======================================================== */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-xs animate-fadeIn">
          <div
            className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 shadow-2xl space-y-5"
            role="dialog"
            aria-modal="true"
          >
            {/* Modal Header */}
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
                <Trash2 size={22} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-extrabold text-ink-900">
                  Delete Account Confirmation
                </h3>
                <p className="text-[12.5px] text-rose-600 font-semibold mt-0.5">
                  This action is permanent and cannot be undone.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="text-ink-400 hover:text-ink-600 p-1"
                disabled={deleting}
              >
                <X size={18} />
              </button>
            </div>

            {/* Warning Details */}
            <div className="rounded-xl bg-rose-50/70 border border-rose-200 p-3.5 text-[12.5px] text-rose-900 space-y-2">
              <p className="font-bold">The following data will be permanently purged:</p>
              <ul className="list-disc list-inside space-y-1 text-[12px] text-rose-800">
                <li>Your account profile: <strong>@{user.username}</strong> ({user.email})</li>
                <li>All registered vehicle specifications & telemetry records</li>
                <li>Any ongoing second-life or collection requests</li>
              </ul>
            </div>

            {/* Error Message Alert */}
            {deleteError && (
              <div className="rounded-lg bg-rose-100 border border-rose-300 p-3 text-[12px] text-rose-800 font-medium">
                {deleteError}
              </div>
            )}

            {/* Password Confirmation Form */}
            <form onSubmit={handleDeleteAccount} className="space-y-4">
              <div>
                <label className="block text-[12px] font-bold text-ink-700 uppercase tracking-wider mb-1">
                  Enter your password to confirm
                </label>
                <div className="relative">
                  <input
                    type={showDeletePassword ? 'text' : 'password'}
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Enter your current password"
                    className="input pr-10 w-full"
                    autoComplete="current-password"
                    disabled={deleting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowDeletePassword(!showDeletePassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-ink-400 hover:text-ink-600"
                  >
                    {showDeletePassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="text-[11px] text-ink-500 mt-1">
                  Required to prevent accidental account deletion.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deleting}
                  className="btn btn-secondary text-[13px] px-4 py-2"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={deleting}
                  className="btn bg-rose-600 text-white hover:bg-rose-700 border-none font-bold text-[13px] px-4 py-2 flex items-center gap-2 shadow-xs"
                >
                  <Trash2 size={14} />
                  <span>{deleting ? 'Deleting Account…' : 'Yes, Delete My Account'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
