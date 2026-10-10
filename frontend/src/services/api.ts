/**
 * Typed API client.
 *
 * Every backend field the UI depends on is declared in `types/api.ts` and
 * asserted against a live payload by the contract test, so a backend rename
 * breaks the build rather than rendering `undefined` in a chart.
 */

import type {
  ActionPlan,
  BatteryRow,
  BlindSpots,
  CapacityPlan,
  Circularity,
  CollectionBatchPlan,
  CollectionQueue,
  DataQuality,
  DigitalTwinBaseline,
  Explanation,
  Forecast,
  HealthInfo,
  Lifecycle,
  Meta,
  Metrics,
  PreventionDecision,
  Robustness,
  ScenarioRun,
  SimulateParams,
  Summary,
  TraceabilitySummary,
  VerifyResult,
  WasteLedger,
  CustomerBatteryInput,
  CustomerPreparation,
  CustomerReport,
  CustomerAssessmentSummary,
  ManufacturerAdvisory,
  ManufacturerDirectoryItem,
  SecondLifeListing,
  DemoVehiclePreset,
  RecyclerDashboardData,
  RecyclerQueueItem,
  ConsumerMatchResult,
  UserProfile,
  UserVehicle,
  AuthResponse,
  RegisterPayload,
  ProfileUpdatePayload,
  CustomerBatteryRecord,
  SharedBatterySummary,
  SharedBatteriesResponse,
  LifecycleTimelineEvent,
  SharedBatteryDetailResponse,
  RecyclingAssessmentPayload,
  RecyclingCollectionPayload,
  RecyclingStatusUpdatePayload,
  BatteryDisposalReportPayload,
  BatteryDisposalReportResponse,
  DiscardedBatteryItem,
  CustomerDiscardedBatteriesResponse,
  BatteryEnquiryPayload,
  ConsumerEnquiryItem,
  BatteryComponentItem,
  IdentifiedSubComponent,
  PartsGuideResponse,
  FleetUploadResponse,
  FleetValidationReport,
  FleetPreviewResponse,
  FleetVehicleRecordItem,
  FleetAnalysisSummary,
  FleetRecordsResponse,
  VehicleComparisonItem,
  FleetHistoryItem,
} from '../types/api'

// Re-exported so pages import types and the client from one place.
export type {
  ActionPlan,
  BlindSpots,
  CapacityPlan,
  Circularity,
  CollectionBatchPlan,
  CollectionQueue,
  DataQuality,
  DigitalTwinBaseline,
  Explanation,
  Forecast,
  HealthInfo,
  Lifecycle,
  Meta,
  Metrics,
  PreventionDecision,
  Robustness,
  ScenarioRun,
  SimulateParams,
  Summary,
  TraceabilitySummary,
  VerifyResult,
  WasteLedger,
  CustomerBatteryInput,
  CustomerPreparation,
  CustomerReport,
  CustomerAssessmentSummary,
  SecondLifeListing,
  DemoVehiclePreset,
  RecyclerDashboardData,
  RecyclerQueueItem,
  ConsumerMatchResult,
  UserProfile,
  UserVehicle,
  AuthResponse,
  RegisterPayload,
  ProfileUpdatePayload,
  CustomerBatteryRecord,
  SharedBatterySummary,
  SharedBatteriesResponse,
  LifecycleTimelineEvent,
  SharedBatteryDetailResponse,
  RecyclingAssessmentPayload,
  RecyclingCollectionPayload,
  RecyclingStatusUpdatePayload,
  BatteryDisposalReportPayload,
  BatteryDisposalReportResponse,
  DiscardedBatteryItem,
  CustomerDiscardedBatteriesResponse,
  BatteryEnquiryPayload,
  ConsumerEnquiryItem,
  BatteryComponentItem,
  IdentifiedSubComponent,
  PartsGuideResponse,
  FleetUploadResponse,
  FleetValidationReport,
  FleetPreviewResponse,
  FleetVehicleRecordItem,
  FleetAnalysisSummary,
  FleetRecordsResponse,
  VehicleComparisonItem,
  FleetHistoryItem,
}


const BASE = ''

let authToken: string | null = typeof window !== 'undefined' ? localStorage.getItem('evolve_auth_token') : null

export function setAuthToken(token: string | null) {
  authToken = token
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem('evolve_auth_token', token)
    } else {
      localStorage.removeItem('evolve_auth_token')
    }
  }
}

export function getAuthToken(): string | null {
  if (authToken) return authToken
  if (typeof window !== 'undefined') {
    authToken = localStorage.getItem('evolve_auth_token')
  }
  return authToken
}

export class ApiError extends Error {
  status: number
  detail: unknown
  constructor(message: string, status: number, detail: unknown) {
    super(message)
    this.status = status
    this.detail = detail
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    const headers: Record<string, string> = {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(init?.headers as Record<string, string> || {}),
    }
    const token = getAuthToken()
    if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`
    }

    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers,
    })
  } catch {
    throw new ApiError(
      'Cannot reach the backend. Start it with: python -m uvicorn app.main:app --port 8000',
      0,
      null,
    )
  }

  const text = await res.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }

  if (!res.ok) {
    const detail =
      body && typeof body === 'object' && 'detail' in body
        ? (body as { detail: unknown }).detail
        : res.statusText
    throw new ApiError(humanise(detail), res.status, detail)
  }
  return body as T
}

/** Turn a FastAPI error payload into something an operator can read. */
function humanise(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        const x = d as { loc?: string[]; msg?: string }
        const field = x.loc?.filter((l) => l !== 'body').join('.')
        return field ? `${field}: ${x.msg}` : (x.msg ?? 'invalid value')
      })
      .join('; ')
  }
  if (detail && typeof detail === 'object') {
    const d = detail as Record<string, unknown>
    if (typeof d.error === 'string') {
      const extra = (d.missing as string[]) ?? []
      return extra.length
        ? `${d.error}: ${extra.join(', ')}`
        : String(d.error)
    }
  }
  return 'Request failed'
}

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const p = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') p.append(k, String(v))
  })
  const s = p.toString()
  return s ? `?${s}` : ''
}

export interface FleetFilters {
  pathway?: string
  lifecycle_status?: string
  zone?: string
  min_soh?: number | string
  max_soh?: number | string
  max_eol?: number | string
  anomaly_only?: boolean
  confidence_band?: string
  search?: string
  sort_by?: string
  order?: string
}

export interface FleetResponse {
  count: number
  total_in_dataset: number
  batteries: BatteryRow[]
  provenance: { label: string; simulated: boolean; notice: string; row_count: number }
}

export interface BatchParams {
  trip_capacity_units?: number
  trips_per_month?: number
  max_trips?: number
}

export const api = {
  health: () => request<HealthInfo>('/api/health'),
  meta: () => request<Meta>('/api/meta'),

  loadDemo: (count = 75) =>
    request<{ status: string; batteries: number; notice: string; simulated: boolean }>(
      '/api/demo/load',
      { method: 'POST', body: JSON.stringify({ count, reset: true }) },
    ),

  summary: () =>
    request<{ summary: Summary; data_quality: DataQuality; provenance: unknown }>(
      '/api/fleet/summary',
    ),

  fleet: (f: FleetFilters = {}) =>
    request<FleetResponse>(`/api/fleet/vehicles${qs(f as Record<string, string>)}`),

  batteries: (f: FleetFilters = {}) =>
    request<{ count: number; batteries: BatteryRow[] }>(
      `/api/batteries${qs(f as Record<string, string>)}`,
    ),

  battery: (id: string) =>
    request<{ battery: BatteryRow; pathway: PreventionDecision; lifecycle: Lifecycle }>(
      `/api/batteries/${encodeURIComponent(id)}`,
    ),

  vehicle: (id: string) => request<unknown>(`/api/vehicles/${encodeURIComponent(id)}`),

  forecast: () => request<Forecast>('/api/waste/forecast'),
  avoidance: () => request<WasteLedger>('/api/waste/avoidance'),

  preventionFleet: () =>
    request<{
      fleet: Array<{
        battery_id: string
        vehicle_id: string
        zone: string
        soh_pct: number
        pathway: string
        pathway_label: string
        wording: string
        rules_fired: string[]
        potential_avoided_units: number
        requires_technical_assessment: boolean
      }>
      ledger: WasteLedger
      prevention_principle: string
    }>('/api/waste/prevention', { method: 'POST', body: JSON.stringify({}) }),

  recordIntervention: (id: string, pathway: string, decidedBy: string) =>
    request<{ status: string }>(`/api/waste/intervention/${encodeURIComponent(id)}`, {
      method: 'POST',
      body: JSON.stringify({ pathway, decided_by: decidedBy }),
    }),

  queue: () => request<CollectionQueue>('/api/collection/prioritize'),

  batches: (p: BatchParams = {}) =>
    request<CollectionBatchPlan>('/api/collection/batch', {
      method: 'POST',
      body: JSON.stringify(p),
    }),

  capacity: () => request<CapacityPlan>('/api/collection/capacity'),

  circularity: () => request<Circularity>('/api/circularity/score'),

  blindSpots: () => request<BlindSpots>('/api/traceability/blind-spots'),

  traceability: () => request<TraceabilitySummary>('/api/traceability/summary'),

  actionPlan: () => request<ActionPlan>('/api/action-plan'),

  twinBaseline: () => request<DigitalTwinBaseline>('/api/digital-twin/baseline'),

  runScenario: (p: SimulateParams) =>
    request<ScenarioRun>('/api/simulator/run', {
      method: 'POST',
      body: JSON.stringify(p),
    }),

  scenarios: () =>
    request<{
      scenarios: Array<{
        id: string
        label: string
        question: string
        params: SimulateParams
      }>
    }>('/api/simulator/scenarios'),

  explain: (batteryId: string, allowExternal = false) =>
    request<Explanation>('/api/reports/explain', {
      method: 'POST',
      body: JSON.stringify({ battery_id: batteryId, allow_external: allowExternal }),
    }),

  metrics: () => request<Metrics>('/api/ml/metrics'),
  verify: () => request<VerifyResult>('/api/ml/verify'),
  robustness: () => request<Robustness>('/api/ml/robustness'),
  retrain: () => request<{ status: string }>('/api/ml/train', { method: 'POST' }),

  upload: async (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`${BASE}/api/data/upload`, { method: 'POST', body: fd })
    const text = await res.text()
    let body: unknown = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = text
    }
    if (!res.ok) {
      const detail =
        body && typeof body === 'object' && 'detail' in body
          ? (body as { detail: unknown }).detail
          : res.statusText
      throw new ApiError(humanise(detail), res.status, detail)
    }
    return body as {
      rows_imported: number
      provenance: { label: string; simulated: boolean; notice: string }
      warning: string
      history_note: string
    }
  },

  // --- Customer EV Battery Intelligence endpoints ---
  customerInput: (payload: CustomerBatteryInput) =>
    request<CustomerPreparation>('/api/customer/battery-input', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  customerAnalyze: (id: string, payload?: CustomerBatteryInput) =>
    request<CustomerReport>(`/api/customer/analyze/${encodeURIComponent(id)}`, {
      method: 'POST',
      body: payload ? JSON.stringify(payload) : undefined,
    }),

  customerReport: (id: string) =>
    request<CustomerReport>(`/api/customer/battery/${encodeURIComponent(id)}/report`),

  customerAssessments: () =>
    request<{ count: number; assessments: CustomerAssessmentSummary[] }>(
      '/api/customer/assessments',
    ),

  manufacturerSupport: (params: {
    brand?: string
    country?: string
    model?: string
    diagnostic_confirmed?: boolean
    critical_warning?: boolean
  }) => {
    const q = new URLSearchParams()
    if (params.brand) q.set('brand', params.brand)
    if (params.country) q.set('country', params.country)
    if (params.model) q.set('model', params.model)
    if (params.diagnostic_confirmed) q.set('diagnostic_confirmed', 'true')
    if (params.critical_warning) q.set('critical_warning', 'true')
    return request<ManufacturerAdvisory>(`/api/manufacturers/support?${q.toString()}`)
  },

  manufacturerDirectory: (country?: string) => {
    const q = country ? `?country=${encodeURIComponent(country)}` : ''
    return request<{
      count: number
      country?: string
      manufacturers: ManufacturerDirectoryItem[]
    }>(`/api/manufacturers/directory${q}`)
  },

  customerHistory: (id: string) =>
    request<{ battery_id: string; timeline: Array<{ occurred_at: string; year: number; event: string; location: string; status: string; actor: string }> }>(
      `/api/customer/battery/${encodeURIComponent(id)}/history`,
    ),

  customerCollectionRequest: (payload: {
    battery_id: string
    contact_name: string
    contact_phone: string
    pickup_address: string
    city: string
    state: string
    preferred_date: string
    notes?: string
  }) =>
    request<{ status: string; message: string; scheduled_date: string }>(
      '/api/customer/collection-request',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  customerSecondLifeRequest: (payload: {
    battery_id: string
    contact_name: string
    contact_phone: string
    listing_intent?: string
    notes?: string
  }) =>
    request<{ status: string; message: string }>(
      '/api/customer/second-life-request',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  customerDemoVehicles: () =>
    request<{ count: number; presets: DemoVehiclePreset[] }>('/api/customer/demo-vehicles'),

  secondLifeMarketplace: () =>
    request<{ count: number; marketplace_notice: string; listings: SecondLifeListing[] }>(
      '/api/consumer/second-life-marketplace',
    ),

  consumerMatch: (payload: {
    application: string
    required_capacity_kwh: number
    min_soh_pct: number
    chemistry_preference: string
    budget_max_inr?: number
  }) =>
    request<{
      application: string
      required_capacity_kwh: number
      count: number
      matches: ConsumerMatchResult[]
    }>('/api/consumer/match', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  consumerRequisition: (payload: {
    battery_id: string
    buyer_name: string
    contact_phone: string
    application: string
    shipping_address?: string
    notes?: string
  }) =>
    request<{ status: string; battery_id: string; message: string }>(
      '/api/consumer/request',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  recyclerDashboard: () =>
    request<RecyclerDashboardData>('/api/recycler/dashboard'),

  recyclerUpdateStatus: (payload: {
    battery_id: string
    status: string
    notes?: string
    handler?: string
  }) =>
    request<{ status: string; battery_id: string; new_status: string; message: string }>(
      '/api/recycler/update-status',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  // --- Authentication & Profile Endpoints ---
  register: (payload: RegisterPayload) =>
    request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  verifyEmail: (payload: { email: string; otp_code: string }) =>
    request<AuthResponse>('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (payload: { email: string; password: string }) =>
    request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  resendOtp: (payload: { email: string; purpose?: string }) =>
    request<AuthResponse>('/api/auth/resend-otp', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  forgotPassword: (payload: { email: string }) =>
    request<AuthResponse>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  resetPassword: (payload: {
    email: string
    otp_code: string
    new_password: string
    confirm_password: string
  }) =>
    request<{ status: string; message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getMe: () =>
    request<UserProfile>('/api/auth/me'),

  getCustomerProfile: () =>
    request<UserProfile>('/api/customer/profile'),

  updateCustomerProfile: (payload: ProfileUpdatePayload) =>
    request<{ status: string; message: string; user: UserProfile }>('/api/customer/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteAccount: (payload?: { password?: string; confirmation?: string }) =>
    request<{ status: string; message: string }>('/api/auth/me', {
      method: 'DELETE',
      body: payload ? JSON.stringify(payload) : undefined,
    }),

  getAdminOverview: () =>
    request<{ status: string; admin_user: string; role: string; message: string }>('/api/admin/overview'),

  // --- Shared Battery & Recycling Endpoints ---
  customerBatteries: () =>
    request<{ count: number; primary_battery_id: string | null; batteries: CustomerBatteryRecord[] }>(
      '/api/customer/batteries',
    ),

  customerBattery: (battery_id: string) =>
    request<{ battery: CustomerBatteryRecord; timeline: LifecycleTimelineEvent[] }>(
      `/api/customer/batteries/${battery_id}`,
    ),

  customerCreateBattery: (payload: {
    vehicle_manufacturer?: string
    vehicle_model?: string
    purchase_year?: number
    odometer_km?: number
    chemistry?: string
    rated_capacity_kwh?: number
    city?: string
    state?: string
    sharing_consent?: boolean
  }) =>
    request<{ status: string; message: string; battery: CustomerBatteryRecord }>(
      '/api/customer/batteries',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  customerUpdateBattery: (
    battery_id: string,
    payload: {
      vehicle_manufacturer?: string
      vehicle_model?: string
      purchase_year?: number
      odometer_km?: number
      chemistry?: string
      rated_capacity_kwh?: number
      reported_condition?: string
      city?: string
      state?: string
      sharing_consent?: boolean
    },
  ) =>
    request<{ status: string; message: string; battery: CustomerBatteryRecord }>(
      `/api/customer/batteries/${battery_id}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    ),

  customerSharingConsent: (battery_id: string, consent: boolean) =>
    request<{ status: string; battery_id: string; sharing_consent: boolean; sharing_status: string; message: string }>(
      `/api/customer/batteries/${battery_id}/sharing-consent`,
      {
        method: 'POST',
        body: JSON.stringify({ consent }),
      },
    ),

  customerRequestAssessment: (battery_id: string, notes?: string) =>
    request<{ status: string; battery_id: string; sharing_status: string; message: string }>(
      `/api/customer/batteries/${battery_id}/request-assessment`,
      {
        method: 'POST',
        body: JSON.stringify({ notes }),
      },
    ),

  customerRequestCollection: (
    battery_id: string,
    payload?:
      | string
      | {
          notes?: string
          contact_name?: string
          contact_phone?: string
          pickup_address?: string
          city?: string
          state?: string
          preferred_date?: string
        },
  ) => {
    const body = typeof payload === 'string' ? { notes: payload } : payload || {}
    return request<{ status: string; battery_id: string; sharing_status: string; message: string }>(
      `/api/customer/batteries/${battery_id}/request-collection`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    )
  },

  getCustomerBattery: (battery_id: string) =>
    request<{ battery: CustomerBatteryRecord; timeline: LifecycleTimelineEvent[] }>(
      `/api/customer/batteries/${battery_id}`,
    ),

  recyclingBatteries: (params?: {
    status?: string
    chemistry?: string
    state?: string
    min_capacity?: number
    max_capacity?: number
    search?: string
  }) =>
    request<SharedBatteriesResponse>(`/api/recycling/batteries${params ? qs(params) : ''}`),

  recyclingBattery: (battery_id: string) =>
    request<SharedBatteryDetailResponse>(`/api/recycling/batteries/${battery_id}`),

  recyclingLifecycle: (battery_id: string) =>
    request<{ battery_id: string; battery_uid: string; event_count: number; timeline: LifecycleTimelineEvent[] }>(
      `/api/recycling/batteries/${battery_id}/lifecycle`,
    ),

  recyclingSubmitAssessment: (battery_id: string, payload: RecyclingAssessmentPayload) =>
    request<{ status: string; battery_id: string; sharing_status: string; outcome: string; message: string }>(
      `/api/recycling/batteries/${battery_id}/assessment`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  recyclingUpdateCollection: (battery_id: string, payload: RecyclingCollectionPayload) =>
    request<{ status: string; battery_id: string; sharing_status: string; action: string; message: string }>(
      `/api/recycling/batteries/${battery_id}/collection`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  recyclingUpdateStatus: (battery_id: string, payload: RecyclingStatusUpdatePayload) =>
    request<{ status: string; battery_id: string; sharing_status: string; message: string }>(
      `/api/recycling/batteries/${battery_id}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
    ),

  reportBatteryEol: (batteryId: string, payload: BatteryDisposalReportPayload) =>
    request<BatteryDisposalReportResponse>(
      `/api/customer/batteries/${batteryId}/report-eol`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  getCustomerDiscardedBatteries: () =>
    request<CustomerDiscardedBatteriesResponse>('/api/customer/discarded-batteries'),

  getCustomerBatteryEnquiries: (batteryId: string) =>
    request<{ battery_id: string; enquiries_count: number; enquiries: any[] }>(
      `/api/customer/batteries/${batteryId}/enquiries`,
    ),

  submitBatteryEnquiry: (batteryId: string, payload: BatteryEnquiryPayload) =>
    request<{ status: string; enquiry_id: string; battery_id: string; message: string; notice: string }>(
      `/api/recycling/batteries/${batteryId}/enquire`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  getConsumerEnquiries: () =>
    request<{ count: number; enquiries: ConsumerEnquiryItem[] }>('/api/recycling/my-enquiries'),

  getPartsGuide: (chemistry?: string) =>
    request<PartsGuideResponse>(
      `/api/recycling/parts-guide${chemistry && chemistry !== 'ALL' ? `?chemistry=${encodeURIComponent(chemistry)}` : ''}`,
    ),

  // --- Fleet Owner & Multi-Vehicle Intelligence endpoints ---
  uploadFleetCsv: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return request<FleetUploadResponse>('/api/fleet/upload', {
      method: 'POST',
      body: formData,
    })
  },

  validateFleetUpload: (uploadId: string) =>
    request<FleetValidationReport>(`/api/fleet/uploads/${encodeURIComponent(uploadId)}/validate`, {
      method: 'POST',
    }),

  getFleetUploadPreview: (uploadId: string, page = 1, pageSize = 15) =>
    request<FleetPreviewResponse>(
      `/api/fleet/uploads/${encodeURIComponent(uploadId)}/preview?page=${page}&page_size=${pageSize}`,
    ),

  saveFleetColumnMapping: (uploadId: string, mapping: Record<string, string>) =>
    request<{ upload_id: string; mapped_columns: Record<string, string>; message: string }>(
      `/api/fleet/uploads/${encodeURIComponent(uploadId)}/map-columns`,
      {
        method: 'POST',
        body: JSON.stringify({ mapping }),
      },
    ),

  runFleetAnalysis: (uploadId: string, excludeErrorRows = true) =>
    request<FleetAnalysisSummary>('/api/fleet/analyses', {
      method: 'POST',
      body: JSON.stringify({ upload_id: uploadId, exclude_error_rows: excludeErrorRows }),
    }),

  getFleetAnalysis: (analysisId: string) =>
    request<FleetAnalysisSummary>(`/api/fleet/analyses/${encodeURIComponent(analysisId)}`),

  getFleetRecords: (
    analysisId: string,
    params: {
      search?: string
      priority?: string
      health_band?: string
      pathway?: string
      sort_by?: string
      sort_dir?: string
      page?: number
      page_size?: number
    } = {},
  ) => {
    const searchParams = new URLSearchParams()
    if (params.search) searchParams.set('search', params.search)
    if (params.priority) searchParams.set('priority', params.priority)
    if (params.health_band) searchParams.set('health_band', params.health_band)
    if (params.pathway) searchParams.set('pathway', params.pathway)
    if (params.sort_by) searchParams.set('sort_by', params.sort_by)
    if (params.sort_dir) searchParams.set('sort_dir', params.sort_dir)
    if (params.page) searchParams.set('page', params.page.toString())
    if (params.page_size) searchParams.set('page_size', params.page_size.toString())
    const qStr = searchParams.toString()
    return request<FleetRecordsResponse>(
      `/api/fleet/analyses/${encodeURIComponent(analysisId)}/records${qStr ? `?${qStr}` : ''}`,
    )
  },

  compareFleetVehicles: (analysisId: string, vehicleIds: string[]) =>
    request<{ analysis_id: string; vehicles: VehicleComparisonItem[] }>(
      `/api/fleet/analyses/${encodeURIComponent(analysisId)}/comparison?vehicle_ids=${encodeURIComponent(vehicleIds.join(','))}`,
    ),

  exportFleetCsvUrl: (analysisId: string) =>
    `${BASE}/api/fleet/analyses/${encodeURIComponent(analysisId)}/export`,

  getFleetErrorReportUrl: (uploadId: string) =>
    `${BASE}/api/fleet/uploads/${encodeURIComponent(uploadId)}/error-report`,

  getFleetHistory: () =>
    request<FleetHistoryItem[]>('/api/fleet/history'),

  deleteFleetUpload: (uploadId: string) =>
    request<{ message: string; upload_id: string }>(`/api/fleet/uploads/${encodeURIComponent(uploadId)}`, {
      method: 'DELETE',
    }),

  exportUrl: (f: FleetFilters = {}) =>
    `${BASE}/api/reports/fleet.csv${qs(f as Record<string, string>)}`,
  templateUrl: `${BASE}/api/demo/template.csv`,
}


export type Pathway =
  | 'CONTINUE_USE'
  | 'REPAIR_REFURBISHMENT'
  | 'SECOND_LIFE_ASSESSMENT'
  | 'EOL_CANDIDATE'

export const PATHWAY_META: Record<Pathway, { label: string; short: string; tone: string; dot: string }> = {
  CONTINUE_USE: {
    label: 'Continue use',
    short: 'Continue',
    tone: 'bg-brand-100 text-brand-800 border-brand-300',
    dot: 'bg-brand-500',
  },
  REPAIR_REFURBISHMENT: {
    label: 'Repair / refurbishment assessment',
    short: 'Repair',
    tone: 'bg-sky-100 text-sky-800 border-sky-300',
    dot: 'bg-sky-500',
  },
  SECOND_LIFE_ASSESSMENT: {
    label: 'Second-life assessment',
    short: 'Second-life',
    tone: 'bg-amber-100 text-amber-800 border-amber-300',
    dot: 'bg-amber-500',
  },
  EOL_CANDIDATE: {
    label: 'EOL candidate',
    short: 'EOL',
    tone: 'bg-rose-100 text-rose-800 border-rose-300',
    dot: 'bg-rose-500',
  },
}