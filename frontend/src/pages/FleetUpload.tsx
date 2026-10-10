/**
 * EVolve AI — Fleet Private Dataset Upload, Validation & Review
 *
 * Implements:
 *   - Drag-and-drop & file picker for CSV files
 *   - File metadata summary (name, size, type, status)
 *   - Backend validation trigger & detailed validation report
 *   - Downloadable error report (.csv)
 *   - Paginated preview of the real uploaded records
 *   - Interactive column mapping interface (required vs optional vs unmapped)
 *   - Explicit confirmation step before running multi-vehicle prediction
 *   - Seamless redirect to Fleet Dashboard on completion
 */

import { useState, useRef, ChangeEvent, DragEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Download,
  FileSpreadsheet,
  Info,
  Loader2,
  Sparkles,
  Trash2,
  UploadCloud,
  XCircle,
} from 'lucide-react'
import { api } from '../services/api'
import type {
  FleetUploadResponse,
  FleetValidationReport,
  FleetPreviewResponse,
} from '../types/api'

const CANONICAL_FIELD_INFO: Record<string, { label: string; required: boolean; desc: string }> = {
  vehicle_id: { label: 'Vehicle Identifier', required: true, desc: 'Unique VIN, vehicle ID, or registration number' },
  battery_id: { label: 'Battery Identifier', required: false, desc: 'Unique pack serial number if tracked' },
  model_name: { label: 'Vehicle Model', required: false, desc: 'Manufacturer make and model' },
  odometer_km: { label: 'Odometer (km)', required: false, desc: 'Total kilometers driven' },
  months_in_service: { label: 'Months in Service', required: false, desc: 'Operational age in months' },
  daily_km: { label: 'Daily Driving (km)', required: false, desc: 'Average daily distance' },
  equivalent_full_cycles: { label: 'Equivalent Cycles', required: false, desc: 'BMS full cycle count' },
  soh_pct: { label: 'State of Health (SOH %)', required: false, desc: 'Direct measured SOH % from BMS' },
  avg_cell_temp_c: { label: 'Avg Cell Temp (°C)', required: false, desc: 'Mean battery temperature' },
  peak_cell_temp_c: { label: 'Peak Cell Temp (°C)', required: false, desc: 'Maximum battery temperature' },
  cell_voltage_spread_mv: { label: 'Voltage Spread (mV)', required: false, desc: 'Max cell delta millivolts' },
  dc_resistance_mohm: { label: 'DC Resistance (mΩ)', required: false, desc: 'Internal pack impedance' },
  fast_charge_ratio: { label: 'Fast Charge Ratio', required: false, desc: 'Proportion of DC fast charging (0-1)' },
  depth_of_discharge: { label: 'Depth of Discharge', required: false, desc: 'Average discharge depth (0-1)' },
  city: { label: 'Operating City', required: false, desc: 'Regional thermal context lookup' },
}

export default function FleetUpload() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Upload state
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadData, setUploadData] = useState<FleetUploadResponse | null>(null)

  // Validation state
  const [isValidating, setIsValidating] = useState(false)
  const [validationReport, setValidationReport] = useState<FleetValidationReport | null>(null)

  // Preview state
  const [previewData, setPreviewData] = useState<FleetPreviewResponse | null>(null)
  const [previewPage, setPreviewPage] = useState(1)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)

  // Column mapping state
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [isSavingMapping, setIsSavingMapping] = useState(false)

  // Confirmation & Analysis execution state
  const [excludeErrorRows, setExcludeErrorRows] = useState(true)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  // Step flow: 1 (Upload) -> 2 (Validation & Preview) -> 3 (Column Mapping) -> 4 (Confirmation)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1)

  // Handle Drag & Drop
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0])
    }
  }

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelected(e.target.files[0])
    }
  }

  const handleFileSelected = (selectedFile: File) => {
    setUploadError(null)
    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      setUploadError('Invalid file format. Please choose a comma-separated CSV file (.csv).')
      return
    }
    if (selectedFile.size > 15 * 1024 * 1024) {
      setUploadError('File exceeds 15 MB limit. Please select a smaller dataset.')
      return
    }
    setFile(selectedFile)
    setUploadData(null)
    setValidationReport(null)
    setPreviewData(null)
    setCurrentStep(1)
  }

  const handleRemoveFile = () => {
    setFile(null)
    setUploadData(null)
    setValidationReport(null)
    setPreviewData(null)
    setColumnMapping({})
    setUploadError(null)
    setCurrentStep(1)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Upload to backend
  const handleUploadAndValidate = async () => {
    if (!file) return
    setIsUploading(true)
    setUploadError(null)
    try {
      const upRes = await api.uploadFleetCsv(file)
      setUploadData(upRes)
      setColumnMapping(upRes.auto_mapping || {})

      // Automatically run validation
      setIsValidating(true)
      const valRes = await api.validateFleetUpload(upRes.upload_id)
      setValidationReport(valRes)
      setIsValidating(false)

      // Load preview
      await loadPreview(upRes.upload_id, 1)

      setCurrentStep(2)
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload or parse CSV file.')
    } finally {
      setIsUploading(false)
      setIsValidating(false)
    }
  }

  const loadPreview = async (uploadId: string, page: number) => {
    setIsLoadingPreview(true)
    try {
      const prev = await api.getFleetUploadPreview(uploadId, page, 10)
      setPreviewData(prev)
      setPreviewPage(page)
    } catch (err: any) {
      console.error('Failed to load preview:', err)
    } finally {
      setIsLoadingPreview(false)
    }
  }

  // Column mapping changes
  const handleMappingChange = (canonKey: string, csvHeader: string) => {
    setColumnMapping((prev) => ({
      ...prev,
      [canonKey]: csvHeader,
    }))
  }

  const handleSaveMappingAndReview = async () => {
    if (!uploadData) return
    if (!columnMapping.vehicle_id) {
      alert('Please assign a column for Vehicle Identifier.')
      return
    }
    setIsSavingMapping(true)
    try {
      await api.saveFleetColumnMapping(uploadData.upload_id, columnMapping)
      // Re-run validation with updated mapping to ensure consistency
      const valRes = await api.validateFleetUpload(uploadData.upload_id)
      setValidationReport(valRes)
      setCurrentStep(4)
    } catch (err: any) {
      alert(err.message || 'Failed to save column mapping.')
    } finally {
      setIsSavingMapping(false)
    }
  }

  // Run Batch Analysis
  const handleExecuteAnalysis = async () => {
    if (!uploadData) return
    setIsAnalyzing(true)
    setAnalysisError(null)
    try {
      const summary = await api.runFleetAnalysis(uploadData.upload_id, excludeErrorRows)
      // Navigate to Fleet Dashboard with new analysis ID
      navigate(`/fleet/dashboard/${summary.analysis_id}`)
    } catch (err: any) {
      setAnalysisError(err.message || 'Batch prediction failed. Please inspect telemetry data.')
      setIsAnalyzing(false)
    }
  }

  return (
    <div className="min-h-screen bg-cream text-ink-900 pb-24">
      {/* Top Header */}
      <div className="border-b border-ink-100 bg-white py-6">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-brand-600 mb-1">
                <Link to="/fleet/welcome" className="hover:underline flex items-center gap-1">
                  <ArrowLeft className="h-3.5 w-3.5" /> Fleet Intelligence
                </Link>
                <span>/</span>
                <span>Dataset Upload & Review</span>
              </div>
              <h1 className="text-2xl font-extrabold text-ink-900">Upload Private Fleet Dataset</h1>
              <p className="text-xs text-ink-500 mt-0.5">
                Multi-vehicle telemetry ingestion, schema validation, and batch degradation modeling
              </p>
            </div>

            {/* Stepper indicator */}
            <div className="flex items-center gap-2 bg-ink-50 rounded-xl p-1.5 border border-ink-100 text-xs font-semibold">
              <span
                className={`px-3 py-1 rounded-lg transition ${
                  currentStep === 1 ? 'bg-brand-600 text-white shadow-2xs' : 'text-ink-600'
                }`}
              >
                1. Upload
              </span>
              <span
                className={`px-3 py-1 rounded-lg transition ${
                  currentStep === 2 ? 'bg-brand-600 text-white shadow-2xs' : 'text-ink-600'
                }`}
              >
                2. Validation
              </span>
              <span
                className={`px-3 py-1 rounded-lg transition ${
                  currentStep === 3 ? 'bg-brand-600 text-white shadow-2xs' : 'text-ink-600'
                }`}
              >
                3. Mapping
              </span>
              <span
                className={`px-3 py-1 rounded-lg transition ${
                  currentStep === 4 ? 'bg-brand-600 text-white shadow-2xs' : 'text-ink-600'
                }`}
              >
                4. Confirm
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 mt-8 space-y-8">
        {/* =========================================================================
            STEP 1: FILE SELECTION & UPLOAD AREA
           ========================================================================= */}
        {currentStep === 1 && (
          <div className="space-y-6">
            {/* Requirements Card */}
            <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-2xs">
              <h2 className="text-sm font-bold uppercase tracking-wider text-ink-700 mb-3 flex items-center gap-2">
                <Info className="h-4 w-4 text-brand-600" />
                Upload Guidelines & Mandatory Prerequisites
              </h2>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-ink-600">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
                  <span>The file must contain records for multiple vehicles in CSV (.csv) format.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
                  <span>Each vehicle must possess a unique vehicle or battery identifier column.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
                  <span>Strict schema validation executes on server before any model prediction runs.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
                  <span>Predictions never run automatically upon selection; you review mappings first.</span>
                </li>
              </ul>
            </div>

            {/* Drag & Drop Box */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !file && fileInputRef.current?.click()}
              className={`relative rounded-3xl border-2 border-dashed p-10 text-center transition-all ${
                isDragging
                  ? 'border-brand-500 bg-brand-50/60 scale-[1.01]'
                  : file
                  ? 'border-brand-300 bg-white'
                  : 'border-ink-200 bg-white/80 hover:border-brand-400 hover:bg-white cursor-pointer shadow-2xs'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileInputChange}
                className="hidden"
              />

              {!file ? (
                <div className="space-y-4">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 border border-brand-100 shadow-2xs">
                    <UploadCloud className="h-8 w-8" />
                  </div>
                  <div>
                    <p className="text-base font-bold text-ink-900">
                      Drag & drop your fleet CSV file here, or{' '}
                      <span className="text-brand-600 underline underline-offset-2">browse files</span>
                    </p>
                    <p className="text-xs text-ink-500 mt-1">
                      Supports comma-separated vehicle telemetry datasets up to 15 MB
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200">
                    <FileSpreadsheet className="h-7 w-7" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-ink-900">{file.name}</h3>
                    <div className="flex items-center justify-center gap-3 text-xs text-ink-500 mt-1 font-mono">
                      <span>{(file.size / 1024).toFixed(1)} KB</span>
                      <span>·</span>
                      <span>text/csv</span>
                      <span>·</span>
                      <span className="text-brand-600 font-semibold font-sans">Ready to Validate</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleUploadAndValidate()
                      }}
                      disabled={isUploading}
                      className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-bold text-white shadow-2xs hover:bg-brand-700 transition disabled:opacity-50"
                    >
                      {isUploading || isValidating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Validating Dataset...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Validate Dataset</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemoveFile()
                      }}
                      disabled={isUploading}
                      className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>Remove File</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {uploadError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                <span>{uploadError}</span>
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            STEP 2: VALIDATION REPORT & PAGINATED PREVIEW
           ========================================================================= */}
        {currentStep === 2 && validationReport && uploadData && (
          <div className="space-y-6">
            {/* Validation Overview Card */}
            <div className="rounded-2xl border border-ink-100 bg-white p-6 sm:p-8 shadow-2xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-ink-100 pb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                        validationReport.status === 'PASSED'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : validationReport.status === 'WARNINGS'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-rose-100 text-rose-800 border border-rose-200'
                      }`}
                    >
                      {validationReport.status === 'PASSED' ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : validationReport.status === 'WARNINGS' ? (
                        <AlertTriangle className="h-3.5 w-3.5" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5" />
                      )}
                      Validation Status: {validationReport.status}
                    </span>
                    <span className="text-xs text-ink-500 font-mono">{uploadData.filename}</span>
                  </div>
                  <h2 className="text-xl font-extrabold text-ink-900 mt-2">Dataset Validation Summary</h2>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={api.getFleetErrorReportUrl(uploadData.upload_id)}
                    download
                    className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3.5 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50 transition shadow-2xs"
                  >
                    <Download className="h-3.5 w-3.5 text-brand-600" />
                    <span>Download Error Report (CSV)</span>
                  </a>
                </div>
              </div>

              {/* KPI Counters */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-4 text-center">
                  <span className="text-xs text-ink-500 font-semibold uppercase tracking-wider">Total Rows</span>
                  <p className="text-2xl font-black text-ink-900 mt-1">{validationReport.total_rows}</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-center">
                  <span className="text-xs text-emerald-700 font-semibold uppercase tracking-wider">Valid Rows</span>
                  <p className="text-2xl font-black text-emerald-700 mt-1">{validationReport.valid_rows}</p>
                </div>
                <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 text-center">
                  <span className="text-xs text-rose-700 font-semibold uppercase tracking-wider">Rows with Errors</span>
                  <p className="text-2xl font-black text-rose-700 mt-1">{validationReport.error_rows}</p>
                </div>
                <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-4 text-center">
                  <span className="text-xs text-ink-500 font-semibold uppercase tracking-wider">Duplicate IDs</span>
                  <p className="text-2xl font-black text-ink-900 mt-1">
                    {validationReport.duplicate_identifiers.length}
                  </p>
                </div>
              </div>

              {/* Diagnostic Issues List if any */}
              {validationReport.row_errors.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      Detailed Diagnostic Findings ({validationReport.total_diagnostic_issues} issue(s) detected)
                    </span>
                    <span className="text-[11px] text-amber-700">Displaying top findings</span>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                    {validationReport.row_errors.slice(0, 8).map((err, i) => (
                      <div
                        key={i}
                        className="rounded-lg bg-white p-2.5 text-xs border border-amber-200/80 flex items-start justify-between gap-2"
                      >
                        <div>
                          <span className="font-semibold text-ink-900">
                            Row {err.row_number} (Vehicle: {err.vehicle_id})
                          </span>
                          <span className="text-ink-500"> — {err.issue}</span>
                        </div>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            err.severity === 'ERROR' || err.severity === 'CRITICAL'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {err.severity}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unrecognized Columns Note */}
              {validationReport.unrecognized_columns.length > 0 && (
                <div className="text-xs text-ink-500 flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 text-brand-600" />
                  <span>
                    Unmapped / Auxiliary columns in CSV:{' '}
                    <strong>{validationReport.unrecognized_columns.join(', ')}</strong> (will be preserved in records).
                  </span>
                </div>
              )}
            </div>

            {/* Real Data Preview with Pagination */}
            {previewData && (
              <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-ink-900">Uploaded Data Preview</h3>
                    <p className="text-xs text-ink-500">
                      Page {previewData.page} of {previewData.total_pages} · {previewData.total_rows} total rows
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={previewPage <= 1 || isLoadingPreview}
                      onClick={() => loadPreview(uploadData.upload_id, previewPage - 1)}
                      className="rounded-lg border border-ink-200 p-1.5 text-ink-600 hover:bg-ink-50 disabled:opacity-40 transition"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={previewPage >= previewData.total_pages || isLoadingPreview}
                      onClick={() => loadPreview(uploadData.upload_id, previewPage + 1)}
                      className="rounded-lg border border-ink-200 p-1.5 text-ink-600 hover:bg-ink-50 disabled:opacity-40 transition"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-ink-100">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-ink-50 text-ink-600 border-b border-ink-100 font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">#</th>
                        {previewData.headers.map((h, i) => (
                          <th key={i} className="py-2.5 px-3 whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100 text-ink-700">
                      {previewData.rows.map((row, rIdx) => {
                        const rowNum = (previewData.page - 1) * previewData.page_size + rIdx + 1
                        return (
                          <tr key={rIdx} className="hover:bg-ink-50/50 transition">
                            <td className="py-2.5 px-3 font-mono text-ink-400">{rowNum}</td>
                            {previewData.headers.map((h, cIdx) => (
                              <td key={cIdx} className="py-2.5 px-3 whitespace-nowrap font-mono text-[11px]">
                                {row[h] || <span className="text-ink-300 italic">—</span>}
                              </td>
                            ))}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Stepper Navigation */}
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={handleRemoveFile}
                className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-xs font-semibold text-ink-700 hover:bg-ink-50 transition"
              >
                <Trash2 className="h-4 w-4 text-rose-500" />
                <span>Cancel & Select Another File</span>
              </button>

              <button
                type="button"
                disabled={!validationReport.can_proceed}
                onClick={() => setCurrentStep(3)}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-2.5 text-xs font-bold text-white shadow-2xs hover:bg-brand-700 transition disabled:opacity-40"
              >
                <span>Continue to Column Mapping</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* =========================================================================
            STEP 3: INTERACTIVE COLUMN MAPPING INTERFACE
           ========================================================================= */}
        {currentStep === 3 && uploadData && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-ink-100 bg-white p-6 sm:p-8 shadow-2xs space-y-6">
              <div>
                <h2 className="text-xl font-extrabold text-ink-900">Map CSV Columns to Model Features</h2>
                <p className="text-xs text-ink-500 mt-1">
                  Confirm or refine how your uploaded CSV header names map to the EVolve AI degradation model inputs.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(CANONICAL_FIELD_INFO).map(([canonKey, info]) => {
                  const currentMapped = columnMapping[canonKey] || ''
                  return (
                    <div
                      key={canonKey}
                      className="rounded-xl border border-ink-100 p-4 bg-ink-50/30 flex flex-col justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-ink-900">{info.label}</span>
                          <span
                            className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${
                              info.required
                                ? 'bg-brand-100 text-brand-800 border border-brand-200'
                                : 'bg-ink-100 text-ink-600'
                            }`}
                          >
                            {info.required ? 'Required' : 'Optional'}
                          </span>
                        </div>
                        <p className="text-[11px] text-ink-500 mt-0.5">{info.desc}</p>
                      </div>

                      <select
                        value={currentMapped}
                        onChange={(e) => handleMappingChange(canonKey, e.target.value)}
                        className={`w-full rounded-lg border px-3 py-2 text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 ${
                          info.required && !currentMapped
                            ? 'border-rose-300 text-rose-700 bg-rose-50/30'
                            : currentMapped
                            ? 'border-brand-300 text-brand-900 font-semibold'
                            : 'border-ink-200 text-ink-600'
                        }`}
                      >
                        <option value="">(Not Mapped / Use physics default)</option>
                        {uploadData.detected_columns.map((col, idx) => (
                          <option key={idx} value={col}>
                            {col}
                          </option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-ink-100">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-xs font-semibold text-ink-700 hover:bg-ink-50 transition"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to Validation Report</span>
                </button>

                <button
                  type="button"
                  disabled={isSavingMapping || !columnMapping.vehicle_id}
                  onClick={handleSaveMappingAndReview}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-2.5 text-xs font-bold text-white shadow-2xs hover:bg-brand-700 transition disabled:opacity-40"
                >
                  {isSavingMapping ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Saving Mappings...</span>
                    </>
                  ) : (
                    <>
                      <span>Review & Confirmation</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            STEP 4: EXPLICIT CONFIRMATION STEP
           ========================================================================= */}
        {currentStep === 4 && uploadData && validationReport && (
          <div className="space-y-6">
            <div className="rounded-3xl border border-brand-200 bg-white p-8 sm:p-10 shadow-2xs space-y-6">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-brand-50 p-3 text-brand-600 border border-brand-200 shadow-2xs shrink-0">
                  <Sparkles className="h-7 w-7" />
                </div>
                <div>
                  <h2 className="text-2xl font-extrabold text-ink-900">Ready to analyse your fleet?</h2>
                  <p className="text-sm text-ink-600 mt-1">
                    Multi-vehicle degradation modeling, end-of-life horizons, and circular pathway assignments will be
                    computed using the official EVolve AI neural and gradient-boosted models.
                  </p>
                </div>
              </div>

              {/* Execution Summary Spec */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-2xl bg-ink-50/60 p-5 border border-ink-100">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-ink-500">Total Vehicles</span>
                  <p className="text-xl font-black text-ink-900 mt-1">{uploadData.total_rows} vehicles</p>
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-ink-500">Eligible Records</span>
                  <p className="text-xl font-black text-emerald-700 mt-1">
                    {excludeErrorRows ? validationReport.valid_rows : uploadData.total_rows} records
                  </p>
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-ink-500">Mapped Features</span>
                  <p className="text-xl font-black text-brand-700 mt-1">
                    {Object.keys(columnMapping).filter((k) => columnMapping[k]).length} features mapped
                  </p>
                </div>
              </div>

              {/* Exclude error rows toggle if errors present */}
              {validationReport.error_rows > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 flex items-center justify-between gap-4">
                  <div className="text-xs text-amber-900">
                    <p className="font-bold">
                      {validationReport.error_rows} row(s) contain validation errors (duplicates or missing IDs).
                    </p>
                    <p className="text-amber-700 mt-0.5">
                      Check below to exclude these corrupted rows and analyze all remaining healthy records.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={excludeErrorRows}
                      onChange={(e) => setExcludeErrorRows(e.target.checked)}
                      className="rounded border-ink-300 text-brand-600 focus:ring-brand-500 h-4 w-4"
                    />
                    <span className="text-xs font-semibold text-ink-800">Exclude error rows</span>
                  </label>
                </div>
              )}

              {/* Processing Notice */}
              <div className="rounded-xl border border-ink-200 bg-white p-4 text-xs text-ink-600 leading-relaxed space-y-1">
                <p className="font-bold text-ink-800">Deterministic Model Execution Notice:</p>
                <p>
                  This execution will run SOH regression, isolation forest anomaly severity, remaining useful life
                  projection, and second-life pathway routing for each eligible vehicle.
                </p>
              </div>

              {analysisError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                  <span>{analysisError}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-ink-100">
                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  disabled={isAnalyzing}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-4 py-3 text-xs font-semibold text-ink-700 hover:bg-ink-50 transition w-full sm:w-auto justify-center"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Adjust Column Mapping</span>
                </button>

                <button
                  type="button"
                  onClick={handleExecuteAnalysis}
                  disabled={isAnalyzing}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-8 py-3.5 text-sm font-bold text-white shadow-2xs hover:bg-brand-700 transition hover:scale-102 w-full sm:w-auto justify-center disabled:opacity-50"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Analyzing Fleet Batteries...</span>
                    </>
                  ) : (
                    <>
                      <Cpu className="h-5 w-5" />
                      <span>Run Fleet Analysis</span>
                      <ArrowRight className="h-5 w-5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
