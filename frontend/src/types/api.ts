/** Backend response contracts. Field names must match the FastAPI payloads exactly. */

export interface Provenance {
  simulated: boolean
  sources?: string[]
  row_count: number
  label: string
  notice: string
}

export interface HealthInfo {
  status: string
  models_trained: boolean
  genai_key_configured: boolean
  genai_mode: string
  batteries: number
  provenance: Provenance
}

export interface Meta {
  app: string
  positioning: string
  workflow: string[]
  thresholds: {
    eol_soh_pct: number
    traction_use_floor_soh_pct: number
    second_life_floor_soh_pct: number
    forecast_horizon_months: number
    anomaly_review_threshold: number
  }
  upload_required_columns: string[]
  cost_basis_inr: Record<string, number>
  pathway_labels: Record<string, string>
  lifecycle_sequence: string[]
  capacity: {
    default_trip_capacity_units: number
    default_trips_per_month: number
    handler_capacity_units: number
  }
  disclaimer: string
  responsibility_statement: string
}

export interface Summary {
  total_batteries: number
  potential_eol_3_months: number
  potential_eol_6_months: number
  potential_eol_12_months: number
  intervention_candidates: number
  collection_pending: number
  second_life_candidates: number
  recycling_processing_load: number
  circularity_score: number
  pathway_counts: Record<string, number>
  lifecycle_counts: Record<string, number>
  eol_candidates: number
  anomaly_candidates: number
  capacity_status: string
  blind_spot_findings: number
  affected_by_blind_spots: number
  mean_data_confidence: number
}

export interface BatteryRow {
  battery_id: string
  battery_uid: string
  vehicle_id: string
  vehicle_model: string
  chemistry: string
  rated_capacity_kwh: number
  rated_range_km?: number
  zone: string
  latitude: number
  longitude: number
  fleet_priority: string
  soh_pct: number
  soh_low_pct: number
  soh_high_pct: number
  soh_measured_pct: number
  eol_in_months: number | null
  eol_range: { low: number; high: number } | null
  eol_threshold_soh_pct: number
  eol_estimate_note: string
  already_below_eol_threshold: boolean
  anomaly_score: number
  anomaly_status: string
  anomaly_wording: string
  data_confidence: number
  confidence_band: string
  data_quality_issues: string[]
  forecast_possible: boolean
  trend: {
    trend_direction: string
    monthly_degradation_pct: number | null
    degradation_per_month: number | null
    note: string
    points: number
  }
  temperature: {
    current_c: number
    peak_c: number
    history_mean_c: number | null
    history_max_c: number | null
    readings_with_temperature: number
  }
  charging_cycles: number
  fast_charge_ratio: number
  battery_age_months: number
  months_in_service: number
  daily_km: number
  lifecycle_status: string
  collection_status: string
  second_life_status: string
  recycling_status: string
  last_inspection_on: string | null
  rating_label: string
  data_source: string
  simulation_notice: string
  pathway?: string
  pathway_label?: string
  rules_fired?: string[]
  potential_avoided_units?: number
  distance_travelled_km?: number
}

export interface RuleFired {
  rule: string
  statement: string
  evidence: Record<string, unknown>
}

export interface PreventionDecision {
  battery_id: string
  vehicle_id: string
  zone: string
  pathway: string
  pathway_label: string
  rules_fired: RuleFired[]
  rule_count: number
  soh_pct: number
  eol_in_months: number | null
  data_confidence: number
  confidence_band: string
  anomaly_score: number
  potential_avoided_units: number
  potential_avoided_waste_kg: number
  estimated_intervention_cost_inr: number
  actionable: boolean
  requires_technical_assessment: boolean
  wording: string
  decision_basis: string
}

export interface Forecast {
  generated_from: string
  method: string
  label: string
  totals: {
    batteries_analysed: number
    in_service: number
    already_eol_or_beyond: number
    excluded_insufficient_history: number
    excluded_note: string
  }
  horizons: Record<
    string,
    {
      horizon_months: number
      predicted_eol_count: number
      battery_ids: string[]
      high_confidence_count: number
      moderate_or_low_confidence_count: number
      mean_confidence: number | null
    }
  >
  headline: {
    potential_eol_3_months: number
    potential_eol_6_months: number
    potential_eol_12_months: number
  }
  monthly_forecast: Array<{
    month: number
    label: string
    expected_eol: number
    cumulative_eol: number
  }>
  peak_month: { month: number; label: string; expected_eol: number } | null
  by_zone: Array<{
    zone: string
    eol_next_3: number
    eol_next_6: number
    eol_next_12: number
    total_in_service: number
  }>
  by_chemistry: Record<string, number>
  high_risk_zone: { zone: string; eol_next_12: number } | null
  disclaimer: string
}

export interface WasteLedger {
  label: string
  method: string
  counts: {
    continue_use: number
    repair_refurbishment: number
    second_life_assessment: number
    eol_candidate: number
  }
  total_batteries: number
  retained_batteries: number
  potential_intervention_candidates: number
  potential_eol_candidates: number
  potential_eol_waste_avoided_units: number
  potential_eol_waste_avoided_kg: number
  estimated_intervention_cost_inr: number
  estimated_purchase_value_avoided_inr: number
  net_estimated_benefit_inr: number
  prevention_ratio_pct: number
  cost_basis_inr: Record<string, number>
  disclaimer: string
}

export interface PriorityItem {
  battery_id: string
  vehicle_id: string
  zone: string
  latitude: number
  longitude: number
  priority_score: number
  priority_band: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  factors: Array<{ name: string; weight: number; raw_value: number; points: number }>
  reconciliation: { sum_of_factor_points: number; priority_score: number; consistent: boolean }
  collection_deadline: string
  days_to_deadline: number
  soh_pct: number
  eol_in_months: number | null
  anomaly_score: number
  chemistry: string
  rated_capacity_kwh: number
  wording: string
}

export interface CollectionQueue {
  total: number
  by_band: Record<string, number>
  queue: PriorityItem[]
  weights: Record<string, number>
  method: string
  label: string
}

export interface Batch {
  batch_code: string
  zone: string
  priority_band: string
  batteries: string[]
  battery_count: number
  total_units: number
  estimated_distance_km: number
  estimated_cost_inr: number
  solo_visit_cost_inr: number
  distance_saved_vs_solo_km: number
  priority_score: number
  status: string
}

export interface CollectionBatchPlan {
  batches: Batch[]
  total_batches: number
  scheduled_batches: number
  total_units: number
  total_estimated_cost_inr: number
  total_distance_km: number
  distance_saved_vs_solo_km: number
  cost_saved_vs_solo_inr: number
  trips_available: number
  trip_capacity_units: number
  unscheduled: Array<{ battery_id: string; priority_score: number; reason: string }>
  unscheduled_count: number
  method: string
  cost_basis_inr: Record<string, number>
}

export interface CapacityPlan {
  status: string
  recommendation: string
  demand: {
    eol_candidates_total: number
    forecast_12_month_units: number
    mean_monthly_units: number
    peak_monthly_units: number
    peak_month: { month: number; label: string; expected_eol: number } | null
  }
  supply: {
    processing_capacity_units_per_month: number
    refurbishment_capacity_units_per_month: number
    collection_capacity_units_per_month: number
    collection_trips_per_month: number
    trip_capacity_units: number
  }
  gap: {
    processing_gap_units: number
    collection_gap_units: number
    processing_utilisation_pct: number | null
  }
  handlers: Array<{
    handler_id: string
    name: string
    kind: string
    zone: string
    monthly_capacity_units: number
    certification_status: string
  }>
  unverified_handler_count: number
  unverified_handler_note: string
  method: string
  label: string
}

export interface Circularity {
  overall_score: number
  scale: string
  grade: string
  components: Array<{
    name: string
    label: string
    weight: number
    raw_pct: number
    raw_pct_exact: number
    points: number
    explainer: string
  }>
  weights: Record<string, number>
  reconciliation: { sum_of_component_points: number; overall_score: number; consistent: boolean }
  strongest_component: { name: string; pct: number }
  weakest_component: { name: string; pct: number }
  counts: Record<string, number>
  method: string
  disclaimer: string
}

export interface BlindSpots {
  total_findings: number
  affected_batteries: number
  by_category: Record<string, number>
  findings: Record<
    string,
    Array<{
      battery_id: string
      battery_lifecycle_id: string
      issue: string
      severity: string
      action: string
    }>
  >
  headline: string
  method: string
  why_it_matters: string
}

export interface TraceabilitySummary {
  lifecycle_counts: Record<string, number>
  circularity: Circularity
  blind_spots: {
    total_findings: number
    affected_batteries: number
    by_category: Record<string, number>
  }
  events: number
}

export interface ActionPlan {
  generated_from: string
  note: string
  horizons: Array<{
    horizon: string
    count: number
    items: Array<{
      action: string
      batteries: string[]
      rationale: string
      priority: string
    }>
  }>
  totals: Record<string, number>
}

export interface SimulateParams {
  fleet_scale?: number
  repair_capacity?: number
  second_life_capacity?: number
  recycling_capacity?: number
  collection_capacity?: number
  collection_trips?: number
  trip_capacity_units?: number
  intervention_rate?: number
}

export interface Delta {
  baseline: number
  scenario: number
  change: number
  change_pct: number | null
}

export interface ScenarioRun {
  params: SimulateParams
  results: Record<string, number>
  baseline: Record<string, number>
  delta: Record<string, Delta>
  monthly_forecast: Array<{
    month: number
    label: string
    expected_eol: number
    cumulative_eol: number
  }>
  by_zone: Array<{
    zone: string
    eol_next_3: number
    eol_next_6: number
    eol_next_12: number
    total_in_service: number
  }>
  pathway_counts: WasteLedger['counts']
  batches: Batch[]
  capacity: {
    processing_capacity_units_per_month: number
    collection_capacity_units_per_month: number
    collection_trips_per_month: number
    peak_monthly_inflow: number
    processing_gap_units: number
    status: string
  }
  method: string
  limitations: string[]
}

export interface DigitalTwinBaseline {
  results: Record<string, number>
  monthly_forecast: ScenarioRun['monthly_forecast']
  pathway_counts: WasteLedger['counts']
  scenarios: Array<{ id: string; label: string; question: string; params: SimulateParams }>
}

export interface Explanation {
  battery_id: string
  explanation: string
  source: 'genai' | 'local-fallback'
  genai_key_configured: boolean
  fallback_reason: string | null
  grounded_in: string
  facts_used: Record<string, unknown>
  note: string
  disclaimer: string
}

export interface Metrics {
  status?: string
  generated_at_utc?: string
  dataset: {
    n_batteries: number
    provenance: string
    notice: string
    random_seed: number
    n_features: number
  }
  soh: Record<string, number | string | unknown[]>
  eol: Record<string, number | string | unknown[]>
  anomaly: {
    model: string
    method: string
    precision: number
    recall: number
    f1: number
    n_positive_cases: number
    n_samples: number
    true_anomaly_rate_pct: number
    small_sample_warning: string
    confusion_matrix: Record<string, number>
  }
  baseline_note: string
  honesty: { headline: string; why_soh_r2_is_so_high: string; what_would_change_this: string }
  limitations: string[]
  robustness_under_bms_noise?: Robustness
  not_hardcoded_check?: VerifyResult
}

export interface VerifyResult {
  base_soh: number
  soh_after_plus400_efc: number
  soh_change_from_extra_cycling: number
  base_eol_months: number
  eol_after_plus400_efc: number
  eol_change_from_extra_cycling: number
  soh_change_from_plus15C: number
  directionally_correct: boolean
  verdict: string
}

export interface Robustness {
  note: string
  holdout_rows: number
  noise_spec_relative_sd: Record<string, number>
  soh: { clean_mae: number; noisy_mae: number; clean_r2: number; noisy_r2: number }
  eol_months: { clean_mae: number; noisy_mae: number; clean_r2: number; noisy_r2: number }
}
export interface DataQuality {
  batteries: number
  mean_confidence: number
  by_band: Record<string, number>
  low_confidence_count: number
  forecast_blocked_count: number
}

export interface LifecycleEvent {
  occurred_at: string
  event: string
  location: string
  handler: string
  status: string
  evidence_ref: string
  actor: string
}

export interface Lifecycle {
  battery_id: string
  battery_lifecycle_id: string
  current_status: string
  collection_status: string
  second_life_status: string
  recycling_status: string
  events: LifecycleEvent[]
  event_count: number
  expected_sequence: string[]
  degradation_series: Array<{
    month_index: number
    recorded_at: string
    soh_pct: number | null
    temperature_c: number | null
    charging_cycles: number | null
    distance_km: number | null
  }>
  recycling: {
    route: string
    received_at: string | null
    processed_at: string | null
    material_recovered_pct: number | null
  } | null
  evidence_note: string
}

export interface CustomerBatteryInput {
  vehicle_brand: string
  vehicle_model: string
  purchase_year: number
  odometer_km?: number | null
  daily_driving?: string
  charging_frequency?: string
  charging_method?: string
  driving_pattern?: string
  range_condition?: string
  charging_condition?: string
  temperature_condition?: string
  warning_condition?: string
  range_fluctuation?: string
  city?: string
  state?: string
  pincode?: string | null
  battery_capacity_kwh?: number | null
  battery_chemistry?: string | null
  soh_input?: number | null
  cycle_count_input?: number | null
  voltage_input?: number | null
  current_input?: number | null
  temperature_input?: number | null
  internal_resistance_mohm?: number | null
  dod_input?: number | null
  is_demo?: boolean
}

export interface CustomerPreparation {
  draft_id: string
  vehicle: {
    brand: string
    model: string
    purchase_year: number
    odometer_km?: number
    city?: string
    state?: string
  }
  summary: {
    vehicle_age: string
    usage_intensity: string
    charging_stress: string
    range_degradation: string
    temperature_concern: string
  }
  confidence: {
    confidence_pct: number
    confidence_band: string
    confidence_label: string
    confidence_description: string
    breakdown?: Record<string, number>
  }
  cost_estimation?: BatteryCostEstimation
  manufacturer_support?: ManufacturerAdvisory
  technical_details: {
    features: Record<string, number | string>
    provenance: Record<string, string>
  }
  is_demo?: boolean
}

export interface ManufacturerSupportContact {
  manufacturer_id: string | null
  manufacturer_name: string
  country_code: string
  country_name: string
  support_phone: string | null
  support_phone_raw: string | null
  support_phone_normalized: string | null
  call_link: string | null
  can_call: boolean
  phone_fallback_message: string | null
  support_url: string | null
  service_locator_url: string | null
  support_hours: string | null
  source_url: string | null
  source_label: string
  verified_at: string | null
  verification_status: 'VERIFIED' | 'LOCATOR_ONLY' | 'UNVERIFIED' | 'OUTDATED' | 'UNKNOWN'
}

export interface ManufacturerDirectoryItem {
  manufacturer_id: string
  manufacturer_name: string
  country_code: string
  country_name: string
  verification_status: string
  has_verified_phone: boolean
  service_locator_available: boolean
}

export interface ManufacturerAdvisory {
  heading: string
  advisory_tier: 'PRELIMINARY_PREDICTION' | 'DIAGNOSTIC_CONFIRMED' | 'CRITICAL_SAFETY_WARNING'
  tier_label: string
  tier_badge: string
  advisory_message: string
  evidence_status: string
  evidence_statement: string
  is_preliminary: boolean
  is_diagnostic_confirmed: boolean
  has_critical_warning: boolean
  vehicle_info: {
    brand: string | null
    model: string | null
    country_code: string
    country_known: boolean
    manufacturer_identified: boolean
  }
  contact: ManufacturerSupportContact
  questions_to_ask: string[]
  warranty_disclaimer: string
  available_manufacturers?: ManufacturerDirectoryItem[] | null
}

export interface CostBreakdownItem {
  item: string
  cost_inr: number
  note?: string
}

export interface BatteryCostOption {
  title: string
  estimated_cost_inr?: number
  estimated_residual_value_inr?: number
  cost_range_inr?: [number, number]
  value_range_inr?: [number, number]
  rate_per_kwh_inr?: number
  expected_life_extension_months?: number
  expected_life_years?: number
  warranty_years?: number
  description: string
  pros: string[]
  cons: string[]
  itemized_breakdown?: CostBreakdownItem[]
}

export interface BatteryCostEstimation {
  capacity_kwh: number
  usable_remaining_kwh: number
  chemistry: string
  soh_pct: number
  replacement: BatteryCostOption
  repair: BatteryCostOption
  second_life: BatteryCostOption
  economic_verdict: {
    recommended_option: 'second_life' | 'repair' | 'replacement' | 'continue_use' | 'recycling'
    headline: string
    summary: string
    savings_vs_replacement_inr: number
    net_upgrade_with_buyback_inr: number
  }
}

export interface CustomerReport {
  assessment_id: string
  battery_id: string
  battery_uid: string
  created_at: string
  is_demo: boolean
  vehicle: {
    brand: string
    model: string
    purchase_year: number
    odometer_km: number
    city: string
    state: string
  }
  health: {
    soh_pct: number
    status_band: string
    status_tone: string
    status_dot: string
    display_title: string
    disclaimer: string
  }
  future_risk: {
    level: string
    tone: 'good' | 'warn' | 'bad'
    summary: string
  }
  remaining_life: {
    years_display: string
    months_estimated: number
    note: string
  }
  second_life: {
    potential: string
    description: string
    status: string
  }
  recommendation: {
    action_code: string
    title: string
    summary: string
    collection_status: string
    second_life_status: string
  }
  why_points: string[]
  ai_explanation?: string | null
  confidence: {
    confidence_pct: number
    confidence_band: string
    label: string
    notice: string
  }
  cost_estimation?: BatteryCostEstimation
  manufacturer_support?: ManufacturerAdvisory
  technical_details: {
    derived_features: Record<string, number | string>
    feature_provenance: Record<string, string>
    model_outputs: {
      soh_predicted: number
      eol_months: number
      anomaly_score: number
    }
  }
}

export interface CustomerAssessmentSummary {
  assessment_id: string
  battery_id: string
  created_at: string
  vehicle: string
  purchase_year: number
  odometer_km: number
  soh_pct: number
  health_band: string
  future_risk: string
  estimated_years: number
  second_life_potential: string
  recommended_action: string
  recommendation_title: string
  collection_status: string
  second_life_status: string
  is_demo: boolean
}

export interface SecondLifeListing {
  listing_id: string
  battery_id: string
  battery_uid: string
  vehicle_model: string
  chemistry: string
  rated_capacity_kwh: number
  usable_capacity_kwh: number
  health_soh_pct: number
  cycles_completed: number
  condition: string
  ideal_applications: string[]
  estimated_price_inr: number
  location: string
  status: string
  source: string
}

export interface DemoVehiclePreset {
  id: string
  name: string
  description: string
  data: CustomerBatteryInput
}

export interface RecyclerQueueItem {
  task_id: number
  battery_id: string
  battery_uid: string
  vehicle_model: string
  location: string
  chemistry: string
  soh_pct: number
  priority_score: number
  priority_band: string
  status: string
  collection_status: string
  recycling_status: string
  lifecycle_status: string
  notes: string
}

export interface RecyclerDashboardData {
  kpis: {
    collection_required: number
    high_priority: number
    eol_candidates: number
    awaiting_recycling: number
    total_recycled: number
  }
  queue: RecyclerQueueItem[]
  handlers: Array<{
    id: number
    handler_id: string
    name: string
    kind: string
    city: string
    zone: string
    monthly_capacity_units: number
    certification_status: string
  }>
}

export interface ConsumerMatchResult {
  listing_id: string
  battery_id: string
  battery_uid: string
  vehicle_model: string
  chemistry: string
  rated_capacity_kwh: number
  usable_capacity_kwh: number
  health_soh_pct: number
  cycles_completed: number
  estimated_price_inr: number
  location: string
  match_score_pct: number
  match_reason: string
  status: string
}

export interface UserVehicle {
  id?: number
  vehicle_number: string
  masked_vehicle_number?: string
  manufacturer: string
  model: string
  vehicle_manufacturer?: string
  vehicle_model?: string
  purchase_year: number
  odometer_km: number
  city: string
  state: string
  pincode?: string | null
}

export interface UserProfile {
  id: number
  full_name: string
  username: string
  email: string
  masked_email: string
  phone: string
  masked_phone: string
  masked_aadhaar: string
  role: 'CUSTOMER' | 'CONSUMER' | 'RECYCLER' | 'ADMIN'
  email_verified: boolean
  created_at: string
  city?: string | null
  state?: string | null
  pincode?: string | null
  intended_application?: string | null
  vehicle?: UserVehicle | null
}

export interface AuthResponse {
  status: string
  message: string
  access_token?: string
  token_type?: string
  user?: UserProfile
  email?: string
  masked_email?: string
  dev_otp?: string
  notice?: string
  cooldown_seconds?: number
  email_delivered?: boolean
  delivery_status?: string
  delivery_message?: string
}

export interface RegisterPayload {
  full_name: string
  username: string
  email: string
  phone: string
  role?: 'CUSTOMER' | 'CONSUMER'
  aadhaar_number?: string
  vehicle_number?: string
  vehicle_manufacturer?: string
  vehicle_model?: string
  vehicle_purchase_year?: number
  odometer_km?: number
  city: string
  state: string
  pincode?: string
  intended_battery_application?: string
  password: string
  confirm_password: string
}

export interface ProfileUpdatePayload {
  full_name?: string
  phone?: string
  city?: string
  state?: string
  pincode?: string
  odometer_km?: number
  vehicle_number?: string
  vehicle_manufacturer?: string
  vehicle_model?: string
  vehicle_purchase_year?: number
}

export interface CustomerBatteryRecord {
  id: number
  battery_id: string
  battery_uid: string
  user_id: number | null
  vehicle_manufacturer: string
  vehicle_model: string
  purchase_year: number
  odometer_km: number
  chemistry: string
  rated_capacity_kwh: number
  current_soh: number | null
  soh_pct: number | null
  health_band: string
  charging_cycles: number
  future_risk: string | null
  estimated_remaining_years: number | null
  second_life_suitability: string
  second_life_status: string
  recycling_status: string
  collection_status: string
  lifecycle_status: string
  sharing_status: string
  sharing_consent: boolean
  reported_condition: string
  city: string
  state: string
  needs_assessment: boolean
  is_assessed?: boolean
  is_second_life_appropriate: boolean
  is_recycling_recommended: boolean
  is_demo: boolean
  created_at: string | null
  updated_at: string | null
}

export interface SharedBatterySummary {
  battery_id: string
  battery_uid: string
  category: string
  chemistry: string
  rated_capacity_kwh: number
  usable_capacity_kwh: number | null
  current_soh: number | null
  soh_pct: number | null
  charging_cycles: number
  vehicle_model: string
  vehicle_manufacturer: string
  purchase_year: number | null
  reported_condition: string
  approximate_area: string
  city: string
  state: string
  sharing_status: string
  lifecycle_status: string
  second_life_status: string
  second_life_suitability: string
  recycling_status: string
  collection_status: string
  estimated_remaining_years: number | null
  future_risk: string
  recommended_next_step: string
  pathway_badge?: string
  eol_reason?: string | null
  eol_reported_at?: string | null
  is_professionally_assessed?: boolean
  enquiries_count?: number
  voltage_v?: number
  current_a?: number
  manufactured_on?: string | null
  installed_on?: string | null
  odometer_km?: number | null
  warranty_years?: number | null
  dc_resistance_mohm?: number | null
  cell_voltage_spread_mv?: number | null
  is_demo: boolean
  created_at: string | null
  updated_at: string | null
}

export interface IdentifiedSubComponent {
  id: string
  name: string
  component_type: string
  pack_function: string
  specifications: Record<string, string>
  recorded_condition: string
  known_faults: string
  potential_applications: string[]
  testing_required: string[]
  suggested_pathway:
    | 'Potentially reusable pending assessment'
    | 'Suitable for a specified application following assessment'
    | 'Repair or refurbishment may be required'
    | 'Recycling or material recovery recommended'
    | 'Insufficient information to determine a suitable pathway'
    | string
  pathway_reason: string
}

export interface SharedBatteriesResponse {
  count: number
  counts: {
    all: number
    awaiting_assessment: number
    second_life: number
    recycling: number
    tracking: number
  }
  batteries: SharedBatterySummary[]
}

export interface LifecycleTimelineEvent {
  id?: number
  occurred_at: string
  year: number
  event: string
  location: string
  handler: string
  status: string
  actor: string
  evidence_ref?: string
}

export interface SharedBatteryDetailResponse {
  battery: SharedBatterySummary
  disposal_info?: {
    reporting_reason?: string
    current_condition?: string
    professionally_assessed?: boolean
    assessment_notes?: string | null
    reported_at?: string | null
    collection_city?: string
    collection_state?: string
  }
  timeline: LifecycleTimelineEvent[]
  components?: IdentifiedSubComponent[]
  is_owner: boolean
  is_ops_authorized: boolean
}

export interface RecyclingAssessmentPayload {
  outcome: 'APPROVED_FOR_SECOND_LIFE' | 'APPROVED_FOR_RECYCLING' | 'CONTINUE_USE'
  notes?: string
  tested_soh?: number
}

export interface RecyclingCollectionPayload {
  action: 'CONFIRM_PICKUP' | 'MARK_COLLECTED' | 'DELIVERED_TO_FACILITY'
  notes?: string
}

export interface RecyclingStatusUpdatePayload {
  status: 'PROCESSING' | 'RECOVERY_COMPLETED'
  material_recovered_pct?: number
  notes?: string
}

// ---------------------------------------------------------------------------
// Customer End-of-Life Reporting & Consumer Discovery Interfaces
// ---------------------------------------------------------------------------

export interface BatteryDisposalReportPayload {
  reporting_reason: string
  current_condition: string
  professionally_assessed: boolean
  assessment_notes?: string
  collection_city: string
  collection_state: string
  collection_pincode?: string
  sharing_consent: boolean
  supporting_details?: string
}

export interface BatteryDisposalReportResponse {
  status: string
  report_id: string
  battery_id: string
  message: string
  next_steps: string[]
  disclaimer: string
}

export interface DiscardedBatteryItem {
  report_id: string
  battery_id: string
  battery_uid: string
  vehicle_model: string
  vehicle_manufacturer: string
  purchase_year: number
  reported_at: string
  reporting_reason: string
  current_condition: string
  professionally_assessed: boolean
  assessment_notes?: string | null
  collection_city: string
  collection_state: string
  sharing_consent: boolean
  sharing_status: string
  lifecycle_status: string
  collection_status: string
  second_life_suitability: string
  soh_pct: number | null
  enquiries_count: number
}

export interface CustomerDiscardedBatteriesResponse {
  count: number
  discarded_batteries: DiscardedBatteryItem[]
}

export interface BatteryEnquiryPayload {
  enquiry_purpose: string
  intended_application?: string
  message?: string
}

export interface ConsumerEnquiryItem {
  enquiry_id: string
  battery_id: string
  battery_summary?: {
    vehicle_model: string
    vehicle_manufacturer: string
    chemistry: string
    rated_capacity_kwh: number
    approximate_area: string
    sharing_status: string
    soh_pct: number | null
  }
  enquiry_purpose: string
  intended_application?: string
  message?: string
  status: string
  response_notes?: string | null
  created_at: string
}

export interface BatteryComponentItem {
  id: string
  name: string
  category: string
  icon: string
  primary_materials: string[]
  critical_minerals: string[]
  pack_function: string
  second_life_suitability: string
  second_life_pathway: string
  recycling_pathway: string
  hydrometallurgical_recovery_rate: string
  handling_and_hazards: string
  active_chemistry_note: string
}

export interface ChemistrySummary {
  full_name: string
  thermal_runaway_threshold: string
  cycle_life_range: string
  critical_minerals: string[]
  cobalt_nickel_free: boolean
  circular_priority: string
}

export interface PartsGuideResponse {
  title: string
  subtitle: string
  active_chemistry: string
  available_chemistries: string[]
  chemistry_summaries: Record<string, ChemistrySummary>
  component_count: number
  components: BatteryComponentItem[]
  safety_advisory: string
}


// ---------------------------------------------------------------------------
// Fleet Intelligence & Multi-Vehicle Battery Intelligence
// ---------------------------------------------------------------------------

export interface FleetUploadResponse {
  upload_id: string
  filename: string
  file_size: number
  total_rows: number
  detected_columns: string[]
  auto_mapping: Record<string, string>
  preview_rows: Record<string, any>[]
  message: string
}

export interface ValidationErrorItem {
  row_number: number
  vehicle_id: string
  column: string
  issue: string
  severity: 'CRITICAL' | 'ERROR' | 'WARNING'
}

export interface FleetValidationReport {
  upload_id: string
  status: 'PASSED' | 'WARNINGS' | 'ERRORS'
  can_proceed: boolean
  total_rows: number
  valid_rows: number
  error_rows: number
  missing_values_by_column: Record<string, number>
  duplicate_identifiers: string[]
  unrecognized_columns: string[]
  row_errors: ValidationErrorItem[]
  total_diagnostic_issues: number
  valid_row_indices: number[]
  error_row_indices: number[]
}

export interface FleetPreviewResponse {
  upload_id: string
  filename: string
  total_rows: number
  page: number
  page_size: number
  total_pages: number
  headers: string[]
  column_mapping: Record<string, string>
  rows: Record<string, any>[]
}

export interface FleetVehicleRecordItem {
  id: number
  vehicle_id: string
  battery_id?: string | null
  model_name?: string | null
  soh_pct: number
  soh_health_band: 'Good' | 'Attention' | 'Critical' | 'Error'
  eol_months: number
  anomaly_score: number
  future_risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN'
  pathway: string
  pathway_label: string
  priority_category: 'Critical' | 'Attention' | 'Normal'
  recommended_action: string
  recommendation_title: string
  alert_reasons: string[]
  status: 'SUCCESS' | 'FAILED'
  error_message?: string | null
}

export interface FleetAnalysisSummary {
  analysis_id: string
  upload_id: string
  filename: string
  total_vehicles: number
  valid_records: number
  analysed_count: number
  failed_count: number
  requiring_attention: number
  critical_count: number
  attention_count: number
  normal_count: number
  avg_soh_pct: number
  avg_eol_months: number
  soh_distribution: {
    '<70%': number
    '70-79%': number
    '80-89%': number
    '90-100%': number
  }
  pathway_distribution: Record<string, number>
  risk_distribution: Record<string, number>
  created_at: string
}

export interface FleetRecordsResponse {
  analysis_id: string
  total: number
  page: number
  page_size: number
  total_pages: number
  records: FleetVehicleRecordItem[]
}

export interface VehicleComparisonItem {
  vehicle_id: string
  battery_id?: string | null
  model_name?: string | null
  soh_pct: number
  eol_months: number
  anomaly_score: number
  priority_category: string
  pathway_label: string
  future_risk: string
  recommended_action: string
  features: Record<string, any>
  alert_reasons: string[]
}

export interface FleetHistoryItem {
  analysis_id: string
  upload_id: string
  filename: string
  total_vehicles: number
  analysed_count: number
  attention_count: number
  avg_soh_pct: number
  avg_eol_months: number
  status: string
  created_at: string
}

