/**
 * EVolve AI — Fleet Upload & Analysis History
 *
 * Implements:
 *   - Overview of past private fleet uploads and batch runs
 *   - Display dates, file names, vehicle counts, average SOH, and attention flags
 *   - Quick navigation into any historical Fleet Dashboard
 *   - Secure deletion of previous uploads and their associated analyses
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Calendar,
  FileSpreadsheet,
  History,
  Loader2,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import { api } from '../services/api'
import type { FleetHistoryItem } from '../types/api'

export default function FleetHistory() {
  const [history, setHistory] = useState<FleetHistoryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [deletingUploadId, setDeletingUploadId] = useState<string | null>(null)

  const fetchHistory = async () => {
    setIsLoading(true)
    try {
      const items = await api.getFleetHistory()
      setHistory(items || [])
    } catch (err: any) {
      console.error('Failed to load fleet history:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchHistory()
  }, [])

  const handleDelete = async (uploadId: string) => {
    if (!confirm('Are you sure you want to permanently delete this fleet dataset and all its predictions?')) {
      return
    }
    setDeletingUploadId(uploadId)
    try {
      await api.deleteFleetUpload(uploadId)
      await fetchHistory()
    } catch (err: any) {
      alert(err.message || 'Failed to delete dataset.')
    } finally {
      setDeletingUploadId(null)
    }
  }

  return (
    <div className="min-h-screen bg-cream text-ink-900 pb-24">
      {/* Top Header */}
      <div className="border-b border-ink-100 bg-white py-6">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-brand-600 mb-1">
                <Link to="/fleet/welcome" className="hover:underline flex items-center gap-1">
                  <ArrowLeft className="h-3.5 w-3.5" /> Fleet Intelligence
                </Link>
                <span>/</span>
                <span>Upload History</span>
              </div>
              <h1 className="text-2xl font-extrabold text-ink-900">Fleet Analysis History</h1>
              <p className="text-xs text-ink-500 mt-0.5">
                Past batch degradation analyses and multi-vehicle dataset runs
              </p>
            </div>

            <Link
              to="/fleet/upload"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-700 px-4 py-2.5 text-xs font-bold text-white shadow-2xs transition"
            >
              <UploadCloud className="h-4 w-4" />
              <span>Upload New Dataset</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 mt-8">
        {isLoading ? (
          <div className="py-20 text-center text-ink-400">
            <Loader2 className="h-7 w-7 animate-spin mx-auto text-brand-600 mb-2" />
            <span className="text-xs font-semibold">Loading analysis history...</span>
          </div>
        ) : history.length === 0 ? (
          <div className="rounded-3xl border border-ink-100 bg-white p-12 text-center max-w-md mx-auto space-y-4 shadow-2xs">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 border border-brand-100">
              <History className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-ink-900">No Past Analyses Found</h3>
              <p className="text-xs text-ink-500 mt-1">
                You haven&apos;t uploaded any fleet datasets yet. Upload a CSV file to begin multi-vehicle analysis.
              </p>
            </div>
            <Link
              to="/fleet/upload"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-brand-700 transition"
            >
              <UploadCloud className="h-4 w-4" />
              <span>Upload Fleet Dataset</span>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {history.map((item) => (
              <div
                key={item.analysis_id}
                className="rounded-2xl border border-ink-100 bg-white p-5 shadow-2xs hover:border-brand-300 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5">
                    <span className="rounded-lg bg-brand-50 p-2 text-brand-600 border border-brand-100">
                      <FileSpreadsheet className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-ink-900">{item.filename}</h3>
                      <div className="flex items-center gap-3 text-[11px] text-ink-500 font-mono mt-0.5">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {item.created_at ? new Date(item.created_at).toLocaleDateString() : 'N/A'}
                        </span>
                        <span>·</span>
                        <span>{item.total_vehicles} Vehicles</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Metrics Breakdown */}
                <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
                  <div className="rounded-lg bg-ink-50 px-3 py-1.5 text-center">
                    <span className="text-[10px] text-ink-400 block font-sans">Avg SOH</span>
                    <span className="font-bold text-ink-900">{item.avg_soh_pct}%</span>
                  </div>
                  <div className="rounded-lg bg-ink-50 px-3 py-1.5 text-center">
                    <span className="text-[10px] text-ink-400 block font-sans">Avg RUL</span>
                    <span className="font-bold text-ink-900">{item.avg_eol_months} mo</span>
                  </div>
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-center">
                    <span className="text-[10px] text-amber-700 block font-sans">Attention</span>
                    <span className="font-bold text-amber-900">{item.attention_count}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Link
                    to={`/fleet/dashboard/${item.analysis_id}`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 px-4 py-2 text-xs font-bold text-white shadow-2xs transition"
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                    <span>Open Dashboard</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>

                  <button
                    type="button"
                    disabled={deletingUploadId === item.upload_id}
                    onClick={() => handleDelete(item.upload_id)}
                    className="rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 p-2 text-rose-700 transition disabled:opacity-50"
                    title="Delete dataset"
                  >
                    {deletingUploadId === item.upload_id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
