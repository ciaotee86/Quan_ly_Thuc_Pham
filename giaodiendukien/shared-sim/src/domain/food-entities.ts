// Verbatim SQL Enums from food_management.sql
export type FoodItemStatus = 'Đang sử dụng' | 'Đã hết' | 'Đã hủy';
export type TransactionActionType = 'Nhập thêm' | 'Sử dụng' | 'Điều chỉnh' | 'Vứt hủy';
export type AreaType = 'Trong tủ lạnh' | 'Ngoài tủ lạnh';

// FEFO & Filter Classifications
export type FefoPriorityLevel = 'Cao' | 'Trung bình' | 'Thấp';
export type ExpiryConditionFilter = 'all' | 'expired' | 'expiring_soon' | 'fresh';
export type StockConditionFilter = 'all' | 'Đang sử dụng' | 'Sắp hết' | 'Đã hết' | 'Đã hủy';

export type AlertTypeLabel =
  | 'CẢNH BÁO: ĐÃ HẾT HẠN'
  | 'CẢNH BÁO: SẮP HẾT HẠN'
  | 'CẢNH BÁO: SẮP HẾT TỒN KHO';

export interface Category {
  category_id: number;
  category_name: string;
  description: string | null;
}

export interface Unit {
  unit_id: number;
  unit_name: string;
  description: string | null;
}

export interface StorageLocation {
  location_id: number;
  area_type: AreaType;
  location_name: string;
  description: string | null;
}

export interface Food {
  food_id: number;
  food_code: string;
  food_name: string;
  category_id: number;
  default_unit_id: number;
  min_quantity: number;
  brand: string | null;
  image_url: string | null;
  description: string | null;
  created_at: string;
}

export interface FoodItem {
  item_id: number;
  food_id: number;
  item_code: string;
  location_id: number;
  unit_id: number;
  initial_quantity: number;
  current_quantity: number;
  min_threshold: number;
  import_date: string;
  expiry_date: string;
  status: FoodItemStatus;
  note: string | null;
  updated_at: string;
}

export interface InventoryTransaction {
  transaction_id: number;
  item_id: number;
  action_type: TransactionActionType;
  change_quantity: number;
  remaining_quantity: number;
  reason: string | null;
  transaction_date: string;
  actor_device: string;
}

export interface SystemSetting {
  setting_id: number;
  setting_key: string;
  setting_value: string;
  description: string | null;
}

export interface SystemConfig {
  timezone: string;
  warning_days_threshold: number;
  min_quantity_default: number;
  fefo_high_days: number;
  fefo_medium_days: number;
  simulated_date: string;
  use_simulated_date: boolean;
  server_ip: string;
  server_port: number;
  pairing_pin: string;
  auto_start_listener: boolean;
  minimize_to_tray_on_close: boolean;
  enable_os_alert_notifications: boolean;
}

export interface RecipeIngredient {
  ingredient_id: number;
  food_id?: number | null;
  ingredient_name: string;
  quantity: number;
  unit_name: string;
  is_essential: boolean;
}

export interface Recipe {
  recipe_id: number;
  recipe_name: string;
  cook_time_minutes: number;
  servings: number;
  priority_hint: string;
  ingredients: RecipeIngredient[];
  steps: string[];
}

// Joined & Enriched Views
export interface FoodLotView {
  item_id: number;
  food_id: number;
  food_code: string;
  item_code: string;
  food_name: string;
  category_id: number;
  category_name: string;
  brand: string | null;
  image_url: string | null;
  description: string | null;
  area_type: AreaType;
  location_id: number;
  location_name: string;
  unit_id: number;
  unit_name: string;
  initial_quantity: number;
  current_quantity: number;
  min_threshold: number;
  import_date: string;
  expiry_date: string;
  status: FoodItemStatus;
  note: string | null;
  updated_at: string;
  days_remaining: number;
  is_expired: boolean;
  is_expiring_soon: boolean;
  is_low_stock: boolean;
  fefo_priority: FefoPriorityLevel | null;
}

export interface InventoryTransactionView extends InventoryTransaction {
  food_id: number;
  food_code: string;
  item_code: string;
  food_name: string;
  unit_name: string;
  previous_quantity: number;
}

export interface FefoRecommendationItem {
  rank: number;
  item_id: number;
  food_id: number;
  food_code: string;
  item_code: string;
  food_name: string;
  category_id: number;
  category_name: string;
  area_type: AreaType;
  location_id: number;
  location_name: string;
  current_quantity: number;
  min_threshold: number;
  unit_id: number;
  unit_name: string;
  import_date: string;
  expiry_date: string;
  days_remaining: number;
  priority_level: FefoPriorityLevel;
  priority_reason: string;
  suggested_action: string;
  fifo_tie_group_size: number;
  fifo_tie_position: number;
  matching_recipe_ids: number[];
  image_url: string | null;
}

export type IngredientAvailabilityStatus = 'Có sẵn - Ưu tiên cao' | 'Có sẵn' | 'Thiếu';

export interface RecipeIngredientAvailability {
  ingredient_id: number;
  food_id: number | null;
  ingredient_name: string;
  required_quantity: number;
  unit_name: string;
  is_essential: boolean;
  availability: IngredientAvailabilityStatus;
  matched_item_id: number | null;
  matched_food_name: string | null;
  available_quantity: number;
  available_unit_name?: string | null;
  deduct_quantity_in_lot_unit?: number;
  unit_compatible?: boolean;
  matched_days_remaining: number | null;
  matched_expiry_date: string | null;
  matched_priority: FefoPriorityLevel | null;
}

export interface RecipeMatchSuggestion {
  recipe: Recipe;
  match_score: number;
  matched_fefo_count: number;
  matched_high_priority_count: number;
  ready_count: number;
  missing_count: number;
  ingredient_statuses: RecipeIngredientAvailability[];
}

export interface ExpiryAlertItem {
  item_id: number;
  food_id: number;
  food_code: string;
  item_code: string;
  food_name: string;
  category_name: string;
  area_type: AreaType;
  location_name: string;
  current_quantity: number;
  min_threshold: number;
  unit_name: string;
  expiry_date: string;
  days_remaining: number;
  alert_type: 'CẢNH BÁO: ĐÃ HẾT HẠN' | 'CẢNH BÁO: SẮP HẾT HẠN';
  is_expired: boolean;
}

export interface StockAlertItem {
  item_id: number;
  food_id: number;
  food_code: string;
  item_code: string;
  food_name: string;
  category_name: string;
  area_type: AreaType;
  location_name: string;
  current_quantity: number;
  min_threshold: number;
  suggested_buy_quantity: number;
  unit_name: string;
  status: FoodItemStatus;
  expiry_date: string;
  alert_type: 'CẢNH BÁO: SẮP HẾT TỒN KHO';
}

export interface AlertsSummary {
  expired_items: ExpiryAlertItem[];
  expiring_soon_items: ExpiryAlertItem[];
  low_stock_items: StockAlertItem[];
  total_expiry_alerts: number;
  total_stock_alerts: number;
  unique_alert_item_count: number;
  total_alert_badge_count: number;
  reference_date: string;
  scanned_at: string;
}

// 12-Field Form Input (IN01 - IN12)
export interface FoodFormInput {
  food_code: string; // IN01
  food_name: string; // IN02
  category_id: number; // IN03
  brand: string; // IN04
  description: string; // IN05
  image_url: string | null; // Optional companion image
  location_id: number; // IN06 (paired with 2-level area_type)
  unit_id: number; // IN07
  quantity: number; // IN08 (initial_quantity on create, current_quantity on edit)
  min_threshold: number; // IN09
  import_date: string; // IN10
  expiry_date: string; // IN11
  note: string; // IN12
  merge_into_food_id?: number;
  force_create_separate_food?: boolean;
  adjustment_reason?: string;
  actor_device?: string;
}

export interface DuplicateCheckResult {
  has_code_conflict: boolean;
  code_conflict_food: Food | null;
  has_name_conflict: boolean;
  name_conflict_food: Food | null;
  existing_active_lots: FoodLotView[];
}

// 5-Criteria Search & Filter (IN15)
export interface FoodSearchFilter {
  keyword?: string;
  category_id?: number | 'all';
  area_type?: AreaType | 'all';
  location_id?: number | 'all';
  stock_status?: StockConditionFilter;
  expiry_status?: ExpiryConditionFilter;
  sort_by?: 'expiry_date' | 'import_date' | 'food_name' | 'current_quantity' | 'updated_at';
  sort_dir?: 'asc' | 'desc';
}

export interface AuditLogFilter {
  keyword?: string;
  action_type?: TransactionActionType | 'all';
  start_date?: string;
  end_date?: string;
  item_id?: number;
  actor_device?: string | 'all';
}

// Analytics Models (DSK-01 & MOB-07)
export interface AnalyticsKpiSummary {
  active_lot_count: number;
  total_managed_lot_count: number;
  total_active_quantity_sum: number;
  urgent_expiring_count: number;
  expired_count: number;
  low_stock_count: number;
  used_transactions_in_range: number;
  wasted_transactions_in_range: number;
  consumption_efficiency_pct: number;
}

export interface DailyConsumptionPoint {
  date: string;
  label: string;
  used_quantity: number;
  restocked_quantity: number;
  wasted_quantity: number;
  transaction_count: number;
}

export interface AreaDistributionItem {
  area_type: AreaType;
  lot_count: number;
  percentage: number;
  expiring_or_expired_count: number;
  low_stock_count: number;
}

export interface LocationDistributionItem {
  location_id: number;
  area_type: AreaType;
  location_name: string;
  lot_count: number;
  expiring_or_expired_count: number;
}

export interface CategoryDistributionItem {
  category_id: number;
  category_name: string;
  lot_count: number;
  percentage: number;
}

export interface AnalyticsSnapshot {
  range_days: number;
  start_date: string;
  end_date: string;
  reference_date: string;
  kpi: AnalyticsKpiSummary;
  daily_trend: DailyConsumptionPoint[];
  area_distribution: AreaDistributionItem[];
  location_distribution: LocationDistributionItem[];
  category_distribution: CategoryDistributionItem[];
}

// AI Vision Scan Models
export interface AiScanSuggestedFields {
  food_name: string;
  category_id: number;
  brand: string;
  unit_id: number;
  suggested_quantity: number;
  suggested_shelf_life_days: number;
  expiry_date: string;
  description: string;
  suggested_location_id: number;
}

export interface AiScanPreset {
  preset_id: string;
  label: string;
  description: string;
  source_type: 'label' | 'receipt' | 'blurry';
  preview_badge: string;
  recognized: boolean;
  confidence: number;
  raw_ocr_lines: string[];
  suggested_fields?: AiScanSuggestedFields;
  error_message?: string;
}

export interface AiScanResult {
  recognized: boolean;
  confidence: number;
  source_label: string;
  raw_ocr_lines: string[];
  suggested_fields?: AiScanSuggestedFields;
  error_message?: string;
}

export interface CatalogBundle {
  categories: Category[];
  units: Unit[];
  storage_locations: StorageLocation[];
  recipes: Recipe[];
}

export interface HouseholdDatabaseState {
  categories: Category[];
  units: Unit[];
  storage_locations: StorageLocation[];
  foods: Food[];
  food_items: FoodItem[];
  inventory_transactions: InventoryTransaction[];
  system_settings: SystemSetting[];
  system_config: SystemConfig;
  recipes: Recipe[];
  next_ids: {
    category: number;
    unit: number;
    location: number;
    food: number;
    item: number;
    transaction: number;
    recipe: number;
  };
}
