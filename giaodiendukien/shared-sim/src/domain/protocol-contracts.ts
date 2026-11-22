import type {
  AiScanPreset,
  AiScanResult,
  AlertsSummary,
  AnalyticsSnapshot,
  AreaType,
  AuditLogFilter,
  CatalogBundle,
  Category,
  DuplicateCheckResult,
  FefoPriorityLevel,
  FefoRecommendationItem,
  Food,
  FoodFormInput,
  FoodLotView,
  FoodSearchFilter,
  InventoryTransaction,
  InventoryTransactionView,
  Recipe,
  RecipeMatchSuggestion,
  StorageLocation,
  SystemConfig,
  Unit,
} from './food-entities';

export type ProtocolErrorCode =
  | 'SERVER_STOPPED'
  | 'NETWORK_DROP'
  | 'TIMEOUT'
  | 'INVALID_PAIRING_PIN'
  | 'INVALID_ADDRESS'
  | 'DB_ERROR'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'DUPLICATE_FOOD_CODE'
  | 'DUPLICATE_FOOD_NAME'
  | 'ERR_INSUFFICIENT_STOCK'
  | 'CONFLICT_STALE_STOCK'
  | 'CONSTRAINT_IN_USE'
  | 'AI_UNREADABLE';

export interface ProtocolError {
  code: ProtocolErrorCode;
  message: string;
  sql_state?: string;
  field_errors?: Partial<Record<string, string>>;
  latest_quantity?: number;
  unit_name?: string;
  duplicate_match?: DuplicateCheckResult;
  referencing_count?: number;
}

export type ServerResponse<T> =
  | {
      ok: true;
      data: T;
      request_id: string;
      timestamp: string;
      latency_ms: number;
    }
  | {
      ok: false;
      error: ProtocolError;
      request_id: string;
      timestamp: string;
      latency_ms: number;
    };

export type FaultInjectionMode =
  | 'NONE'
  | 'TIMEOUT'
  | 'NETWORK_DROP'
  | 'DB_ERROR'
  | 'CONFLICT_STALE_STOCK';

export interface ConnectedClientSession {
  client_id: string;
  device_name: string;
  ip_address: string;
  connected_at: string;
  last_seen_at: string;
  status: 'Connected' | 'Disconnected';
}

export type PacketDirection =
  | 'CLIENT->SERVER'
  | 'SERVER->CLIENT'
  | 'SERVER->PUSH';

export interface PacketLogEntry {
  id: string;
  timestamp: string;
  direction: PacketDirection;
  device: string;
  action: string;
  status: 'OK' | 'ERROR' | 'PUSH';
  latency_ms: number;
  payload_summary: string;
}

export type ServerPushEventType =
  | 'INVENTORY_CHANGED'
  | 'ALERTS_UPDATED'
  | 'SETTINGS_UPDATED'
  | 'CATALOGS_UPDATED'
  | 'CLIENT_DISCONNECTED'
  | 'SERVER_STATUS_CHANGED'
  | 'SIMULATION_DATE_CHANGED';

export interface ServerPushEvent {
  type: ServerPushEventType;
  timestamp: string;
  source_device: string;
  summary: string;
  target_client_id?: string;
}

export interface ServerRuntimeConfig {
  server_running: boolean;
  db_healthy: boolean;
  simulated_latency_ms: number;
  force_next_error: FaultInjectionMode;
  minimized_to_tray: boolean;
}

export interface ServerStatusSnapshot {
  runtime: ServerRuntimeConfig;
  system_config: SystemConfig;
  effective_date: string;
  server_version: string;
  connected_clients: ConnectedClientSession[];
  packet_logs: PacketLogEntry[];
  alerts_summary: AlertsSummary;
}

// 10 Client-Server Message Groups + Catalog & Config Operations
export interface PingHandshakePayload {
  ip: string;
  port: number;
  pairing_pin: string;
  client_id: string;
  device_name: string;
  client_ip?: string;
}

export interface HandshakeResult {
  server_version: string;
  server_ip: string;
  server_port: number;
  effective_date: string;
  system_config: SystemConfig;
  catalogs: CatalogBundle;
  alerts_summary: AlertsSummary;
  client_session: ConnectedClientSession;
}

export interface FefoQueryPayload {
  area_type?: AreaType | 'all';
  location_id?: number | 'all';
  priority_level?: FefoPriorityLevel | 'all';
}

export interface FefoListResult {
  reference_date: string;
  items: FefoRecommendationItem[];
  counts_by_priority: {
    Cao: number;
    'Trung bình': number;
    Thấp: number;
  };
  expired_excluded_count: number;
}

export interface RecipesQueryPayload {
  focus_item_id?: number;
}

export interface SearchFoodItemsResult {
  items: FoodLotView[];
  total_count: number;
  reference_date: string;
}

export interface ItemDetailResult {
  item: FoodLotView;
  transactions: InventoryTransactionView[];
  matching_recipes: RecipeMatchSuggestion[];
}

export interface ScanFoodImagePayload {
  preset_id?: string;
  file_name?: string;
  simulated_blur?: boolean;
}

export interface CheckDuplicatePayload {
  food_code: string;
  food_name: string;
  exclude_food_id?: number;
}

export interface CreateFoodItemResult {
  food: Food;
  item: FoodLotView;
  transaction: InventoryTransaction;
  merged_existing_food: boolean;
}

export interface UseFoodPayload {
  item_id: number;
  quantity_used: number;
  reason: string;
  actor_device?: string;
  expected_current_quantity?: number;
}

export interface RestockFoodPayload {
  item_id: number;
  quantity_added: number;
  reason: string;
  actor_device?: string;
}

export interface AdjustFoodPayload {
  item_id: number;
  new_quantity: number;
  reason: string;
  actor_device?: string;
}

export interface MoveLocationPayload {
  item_id: number;
  new_location_id: number;
  reason?: string;
  actor_device?: string;
}

export interface StockMutationResult {
  item: FoodLotView;
  transaction: InventoryTransaction;
  alerts_summary: AlertsSummary;
}

export interface UpdateFoodItemPayload {
  item_id: number;
  input: FoodFormInput;
}

export interface CancelFoodItemPayload {
  item_id: number;
  reason: string;
  actor_device?: string;
}

export interface CookRecipePayload {
  recipe_id: number;
  actor_device?: string;
}

export interface CookRecipeResult {
  recipe_name: string;
  updated_items: FoodLotView[];
  deducted_count: number;
  skipped_missing: number;
}

export interface GetStatsPayload {
  range_days?: 7 | 30 | 'custom';
  start_date?: string;
  end_date?: string;
}

export interface GetAuditLogsResult {
  transactions: InventoryTransactionView[];
  summary: {
    total_count: number;
    restock_total: number;
    use_total: number;
    waste_total: number;
    adjust_count: number;
  };
}

export interface CatalogReferenceCounts {
  categories: Record<number, number>;
  units: Record<number, number>;
  locations: Record<number, number>;
}

export interface CatalogMetadataResult {
  foods: Food[];
  reference_counts: CatalogReferenceCounts;
}

export interface SaveCategoryPayload {
  category_id?: number;
  category_name: string;
  description: string | null;
}

export interface SaveUnitPayload {
  unit_id?: number;
  unit_name: string;
  description: string | null;
}

export interface SaveLocationPayload {
  location_id?: number;
  area_type: AreaType;
  location_name: string;
  description: string | null;
}

export interface SaveRecipePayload {
  recipe_id?: number;
  recipe_name: string;
  cook_time_minutes: number;
  servings: number;
  priority_hint: string;
  ingredients: Recipe['ingredients'];
  steps: string[];
}

export interface ShiftSimulatedDatePayload {
  delta_days?: number;
  target_date?: string | null;
  reset_to_default?: boolean;
}

export interface ProtocolRequestMap {
  PING_HANDSHAKE: { req: PingHandshakePayload; res: HandshakeResult };
  GET_FEFO_LIST: { req: FefoQueryPayload | undefined; res: FefoListResult };
  GET_RECIPES: { req: RecipesQueryPayload | undefined; res: RecipeMatchSuggestion[] };
  SEARCH_FOOD_ITEMS: { req: FoodSearchFilter | undefined; res: SearchFoodItemsResult };
  GET_ITEM_DETAIL: { req: { item_id: number }; res: ItemDetailResult };
  SCAN_FOOD_IMAGE: { req: ScanFoodImagePayload; res: AiScanResult };
  CHECK_FOOD_DUPLICATE: { req: CheckDuplicatePayload; res: DuplicateCheckResult };
  CREATE_FOOD_ITEM: { req: FoodFormInput; res: CreateFoodItemResult };
  USE_FOOD: { req: UseFoodPayload; res: StockMutationResult };
  RESTOCK_FOOD: { req: RestockFoodPayload; res: StockMutationResult };
  ADJUST_FOOD: { req: AdjustFoodPayload; res: StockMutationResult };
  MOVE_LOCATION: { req: MoveLocationPayload; res: StockMutationResult };
  UPDATE_FOOD_ITEM: { req: UpdateFoodItemPayload; res: StockMutationResult };
  CANCEL_FOOD_ITEM: { req: CancelFoodItemPayload; res: StockMutationResult };
  COOK_RECIPE: { req: CookRecipePayload; res: CookRecipeResult };
  GET_ALERTS: { req: { trigger_scan?: boolean } | undefined; res: AlertsSummary };
  GET_STATS: { req: GetStatsPayload | undefined; res: AnalyticsSnapshot };
  GET_AUDIT_LOGS: { req: AuditLogFilter | undefined; res: GetAuditLogsResult };
  GET_CATALOGS: { req: undefined; res: CatalogBundle };
  GET_CATALOG_METADATA: { req: Record<string, never> | undefined; res: CatalogMetadataResult };
  GET_AI_SCAN_PRESETS: { req: Record<string, never> | undefined; res: AiScanPreset[] };
  SAVE_CATEGORY: { req: SaveCategoryPayload; res: Category };
  DELETE_CATEGORY: { req: { category_id: number }; res: { deleted_id: number } };
  SAVE_UNIT: { req: SaveUnitPayload; res: Unit };
  DELETE_UNIT: { req: { unit_id: number }; res: { deleted_id: number } };
  SAVE_LOCATION: { req: SaveLocationPayload; res: StorageLocation };
  DELETE_LOCATION: { req: { location_id: number }; res: { deleted_id: number } };
  SAVE_RECIPE: { req: SaveRecipePayload; res: Recipe };
  DELETE_RECIPE: { req: { recipe_id: number }; res: { deleted_id: number } };
  UPDATE_SYSTEM_CONFIG: { req: Partial<SystemConfig>; res: SystemConfig };
  SHIFT_SIMULATED_DATE: { req: ShiftSimulatedDatePayload; res: SystemConfig };
}

export type ProtocolAction = keyof ProtocolRequestMap;

export interface WireRpcEnvelope<A extends ProtocolAction = ProtocolAction> {
  kind: 'RPC_REQUEST';
  request_id: string;
  action: A;
  payload: ProtocolRequestMap[A]['req'];
  client_id: string;
  device_name: string;
  sent_at: string;
}

export interface WireRpcReply<A extends ProtocolAction = ProtocolAction> {
  kind: 'RPC_RESPONSE';
  request_id: string;
  action: A;
  response: ServerResponse<ProtocolRequestMap[A]['res']>;
}

export interface WirePushMessage {
  kind: 'SERVER_PUSH';
  event: ServerPushEvent;
}
