import { DEFAULT_TIMEZONE, formatIsoTimestampInTimezone } from '../domain/calendar-date';
import type {
  AiScanPreset,
  AlertsSummary,
  AnalyticsSnapshot,
  CatalogBundle,
  FefoRecommendationItem,
  FoodLotView,
  InventoryTransactionView,
  RecipeMatchSuggestion,
  SystemConfig,
} from '../domain/food-entities';
import type {
  FaultInjectionMode,
  HandshakeResult,
  PacketLogEntry,
  PingHandshakePayload,
  ProtocolAction,
  ProtocolRequestMap,
  ServerPushEvent,
  ServerResponse,
  WirePushMessage,
  WireRpcEnvelope,
  WireRpcReply,
} from '../domain/protocol-contracts';
import { BROADCAST_CHANNEL_NAME, SimulatedServerNode } from './simulated-server-node';

export type ClientConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'OFFLINE_CACHED';

export interface SavedServerEndpoint {
  ip: string;
  port: number;
  pairing_pin: string;
  label: string;
  last_connected_at?: string;
}

export interface ClientCachedReadSnapshot {
  last_synced_at: string | null;
  effective_date: string | null;
  system_config: SystemConfig | null;
  catalogs: CatalogBundle | null;
  ai_scan_presets: AiScanPreset[];
  fefo_items: FefoRecommendationItem[];
  inventory_items: FoodLotView[];
  recipes: RecipeMatchSuggestion[];
  alerts: AlertsSummary | null;
  stats: AnalyticsSnapshot | null;
  audit_logs: InventoryTransactionView[];
}

export interface ClientTransportSnapshot {
  client_id: string;
  device_name: string;
  connection_state: ClientConnectionState;
  active_endpoint: SavedServerEndpoint;
  recent_endpoints: SavedServerEndpoint[];
  simulated_network_offline: boolean;
  client_fault_override: FaultInjectionMode;
  simulated_latency_ms: number;
  last_error_message: string | null;
  last_latency_ms: number | null;
  cache: ClientCachedReadSnapshot;
  packet_logs: PacketLogEntry[];
}

export interface SimulatedClientTransportOptions {
  clientId?: string;
  deviceName?: string;
  localServer?: SimulatedServerNode;
  enableBroadcastChannel?: boolean;
  persistToStorage?: boolean;
  storageKeyPrefix?: string;
  broadcastTimeoutMs?: number;
}

const CLIENT_CONN_KEY = 'food_mgmt_mobile_conn_v1';
const CLIENT_CACHE_KEY = 'food_mgmt_mobile_cache_v1';

const WRITE_ACTIONS = new Set<ProtocolAction>([
  'CREATE_FOOD_ITEM',
  'USE_FOOD',
  'RESTOCK_FOOD',
  'ADJUST_FOOD',
  'MOVE_LOCATION',
  'UPDATE_FOOD_ITEM',
  'CANCEL_FOOD_ITEM',
  'COOK_RECIPE',
  'SAVE_CATEGORY',
  'DELETE_CATEGORY',
  'SAVE_UNIT',
  'DELETE_UNIT',
  'SAVE_LOCATION',
  'DELETE_LOCATION',
  'SAVE_RECIPE',
  'DELETE_RECIPE',
  'UPDATE_SYSTEM_CONFIG',
  'SHIFT_SIMULATED_DATE',
]);

function safeStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

export class SimulatedClientTransport {
  private readonly clientId: string;
  private deviceName: string;
  private readonly localServer: SimulatedServerNode;
  private readonly persistToStorage: boolean;
  private readonly connStorageKey: string;
  private readonly cacheStorageKey: string;
  private readonly broadcastTimeoutMs: number;

  private connectionState: ClientConnectionState = 'DISCONNECTED';
  private activeEndpoint: SavedServerEndpoint = {
    ip: '192.168.1.10',
    port: 8080,
    pairing_pin: '4829',
    label: 'Máy chủ Gia đình (LAN)',
  };
  private recentEndpoints: SavedServerEndpoint[] = [
    {
      ip: '192.168.1.10',
      port: 8080,
      pairing_pin: '4829',
      label: 'Máy chủ Gia đình (LAN)',
    },
  ];

  private simulatedNetworkOffline = false;
  private manuallyDisconnected = false;
  private clientFaultOverride: FaultInjectionMode = 'NONE';
  private simulatedLatencyMs = 40;
  private lastErrorMessage: string | null = null;
  private lastLatencyMs: number | null = null;
  private cache: ClientCachedReadSnapshot = {
    last_synced_at: null,
    effective_date: null,
    system_config: null,
    catalogs: null,
    ai_scan_presets: [],
    fefo_items: [],
    inventory_items: [],
    recipes: [],
    alerts: null,
    stats: null,
    audit_logs: [],
  };
  private packetLogs: PacketLogEntry[] = [];
  private seqCounter = 1;

  private broadcastChannel: BroadcastChannel | null = null;
  private readonly pendingBroadcastRpc = new Map<
    string,
    { resolve: (reply: WireRpcReply) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private readonly snapshotListeners = new Set<(snapshot: ClientTransportSnapshot) => void>();
  private readonly pushListeners = new Set<(event: ServerPushEvent) => void>();
  private unsubscribeLocalPush: (() => void) | null = null;

  constructor(options: SimulatedClientTransportOptions = {}) {
    this.clientId = options.clientId ?? 'mob-client-active';
    this.deviceName = options.deviceName ?? 'Điện thoại Gia đình';
    this.persistToStorage = options.persistToStorage ?? true;
    const prefix = options.storageKeyPrefix ? `${options.storageKeyPrefix}_` : '';
    this.connStorageKey = `${prefix}${CLIENT_CONN_KEY}`;
    this.cacheStorageKey = `${prefix}${CLIENT_CACHE_KEY}`;
    this.broadcastTimeoutMs = options.broadcastTimeoutMs ?? 120;

    this.localServer =
      options.localServer ??
      new SimulatedServerNode({
        persistToStorage: this.persistToStorage,
        enableBroadcastChannel: false,
        storageKeyPrefix: options.storageKeyPrefix,
      });

    this.loadPersistedState();

    this.unsubscribeLocalPush = this.localServer.subscribePush((event) => {
      this.handleIncomingPush(event);
    });

    if (options.enableBroadcastChannel && typeof BroadcastChannel !== 'undefined') {
      this.attachBroadcastChannel();
    }
  }

  private loadPersistedState(): void {
    if (!this.persistToStorage) return;
    const storage = safeStorage();
    if (!storage) return;

    try {
      const connRaw = storage.getItem(this.connStorageKey);
      if (connRaw) {
        const parsed = JSON.parse(connRaw) as {
          activeEndpoint?: SavedServerEndpoint;
          recentEndpoints?: SavedServerEndpoint[];
          deviceName?: string;
        };
        if (parsed.activeEndpoint) this.activeEndpoint = parsed.activeEndpoint;
        if (Array.isArray(parsed.recentEndpoints) && parsed.recentEndpoints.length > 0) {
          this.recentEndpoints = parsed.recentEndpoints;
        }
        if (parsed.deviceName) this.deviceName = parsed.deviceName;
      }

      const cacheRaw = storage.getItem(this.cacheStorageKey);
      if (cacheRaw) {
        const parsedCache = JSON.parse(cacheRaw) as Partial<ClientCachedReadSnapshot>;
        if (parsedCache && typeof parsedCache === 'object') {
          this.cache = {
            ...this.cache,
            ...parsedCache,
            ai_scan_presets: Array.isArray(parsedCache.ai_scan_presets)
              ? parsedCache.ai_scan_presets
              : [],
            fefo_items: Array.isArray(parsedCache.fefo_items) ? parsedCache.fefo_items : [],
            inventory_items: Array.isArray(parsedCache.inventory_items)
              ? parsedCache.inventory_items
              : [],
            recipes: Array.isArray(parsedCache.recipes) ? parsedCache.recipes : [],
            audit_logs: Array.isArray(parsedCache.audit_logs) ? parsedCache.audit_logs : [],
          };
        }
      }
    } catch {
      // Ignore corrupt localStorage entries cleanly
    }
  }

  private persistConn(): void {
    if (!this.persistToStorage) return;
    const storage = safeStorage();
    if (!storage) return;
    try {
      storage.setItem(
        this.connStorageKey,
        JSON.stringify({
          activeEndpoint: this.activeEndpoint,
          recentEndpoints: this.recentEndpoints,
          deviceName: this.deviceName,
        }),
      );
    } catch {
      // Ignore storage quota
    }
  }

  private persistCache(): void {
    if (!this.persistToStorage) return;
    const storage = safeStorage();
    if (!storage) return;
    try {
      storage.setItem(this.cacheStorageKey, JSON.stringify(this.cache));
    } catch {
      // Ignore storage quota
    }
  }

  private attachBroadcastChannel(): void {
    if (this.broadcastChannel) return;
    this.broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    this.broadcastChannel.onmessage = (event: MessageEvent<WireRpcReply | WirePushMessage>) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.kind === 'RPC_RESPONSE') {
        const pending = this.pendingBroadcastRpc.get(data.request_id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingBroadcastRpc.delete(data.request_id);
          pending.resolve(data);
        }
      } else if (data.kind === 'SERVER_PUSH') {
        this.handleIncomingPush(data.event);
      }
    };
  }

  private handleIncomingPush(event: ServerPushEvent): void {
    if (event.type === 'CLIENT_DISCONNECTED' && event.target_client_id === this.clientId) {
      this.manuallyDisconnected = true;
      this.connectionState = this.cache.last_synced_at ? 'OFFLINE_CACHED' : 'DISCONNECTED';
      this.lastErrorMessage = event.summary;
      this.notifySnapshot();
    } else if (event.type === 'SERVER_STATUS_CHANGED' && event.summary.includes('tạm dừng')) {
      if (this.connectionState === 'CONNECTED') {
        this.connectionState = 'OFFLINE_CACHED';
        this.lastErrorMessage = 'Desktop Server vừa tạm dừng dịch vụ lắng nghe.';
        this.notifySnapshot();
      }
    }

    for (const listener of this.pushListeners) {
      listener(event);
    }
  }

  public dispose(): void {
    if (this.unsubscribeLocalPush) {
      this.unsubscribeLocalPush();
      this.unsubscribeLocalPush = null;
    }
    for (const pending of this.pendingBroadcastRpc.values()) {
      clearTimeout(pending.timer);
    }
    this.pendingBroadcastRpc.clear();
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }
    this.snapshotListeners.clear();
    this.pushListeners.clear();
  }

  public subscribe(listener: (snapshot: ClientTransportSnapshot) => void): () => void {
    this.snapshotListeners.add(listener);
    return () => {
      this.snapshotListeners.delete(listener);
    };
  }

  public subscribePush(listener: (event: ServerPushEvent) => void): () => void {
    this.pushListeners.add(listener);
    return () => {
      this.pushListeners.delete(listener);
    };
  }

  private notifySnapshot(): void {
    const snap = this.getSnapshot();
    for (const listener of this.snapshotListeners) {
      listener(snap);
    }
  }

  public getSnapshot(): ClientTransportSnapshot {
    return {
      client_id: this.clientId,
      device_name: this.deviceName,
      connection_state: this.connectionState,
      active_endpoint: { ...this.activeEndpoint },
      recent_endpoints: this.recentEndpoints.map((e) => ({ ...e })),
      simulated_network_offline: this.simulatedNetworkOffline,
      client_fault_override: this.clientFaultOverride,
      simulated_latency_ms: this.simulatedLatencyMs,
      last_error_message: this.lastErrorMessage,
      last_latency_ms: this.lastLatencyMs,
      cache: {
        ...this.cache,
        ai_scan_presets: [...this.cache.ai_scan_presets],
        fefo_items: [...this.cache.fefo_items],
        inventory_items: [...this.cache.inventory_items],
        recipes: [...this.cache.recipes],
        audit_logs: [...this.cache.audit_logs],
      },
      packet_logs: [...this.packetLogs],
    };
  }

  /** @deprecated (test-only) Do not call from production client code; use transport.request(...) instead. */
  public getLocalServerNode(): SimulatedServerNode {
    return this.localServer;
  }

  public setSimulatedNetworkOffline(offline: boolean): void {
    this.simulatedNetworkOffline = offline;
    if (offline && this.connectionState === 'CONNECTED') {
      this.connectionState = 'OFFLINE_CACHED';
      this.lastErrorMessage = 'Đang mô phỏng mất kết nối Wi-Fi / LAN (Chế độ Offline Chỉ xem).';
    }
    this.notifySnapshot();
  }

  public setClientFaultOverride(mode: FaultInjectionMode): void {
    this.clientFaultOverride = mode;
    this.notifySnapshot();
  }

  public setSimulatedLatencyMs(ms: number): void {
    this.simulatedLatencyMs = Math.max(0, Math.min(5000, Math.round(ms)));
    this.localServer.setSimulatedLatencyMs(this.simulatedLatencyMs);
    this.notifySnapshot();
  }

  public disconnect(): void {
    this.manuallyDisconnected = true;
    this.connectionState = this.cache.last_synced_at ? 'OFFLINE_CACHED' : 'DISCONNECTED';
    this.lastErrorMessage = 'Đã ngắt kết nối khỏi máy chủ.';
    this.notifySnapshot();
  }

  public async connect(
    endpoint: Partial<SavedServerEndpoint> & { device_name?: string },
  ): Promise<ServerResponse<HandshakeResult>> {
    this.manuallyDisconnected = false;
    const nextEndpoint: SavedServerEndpoint = {
      ip: endpoint.ip?.trim() || this.activeEndpoint.ip,
      port: Number(endpoint.port ?? this.activeEndpoint.port),
      pairing_pin: endpoint.pairing_pin?.trim() ?? this.activeEndpoint.pairing_pin,
      label: endpoint.label?.trim() || `Desktop Server (${endpoint.ip?.trim() || this.activeEndpoint.ip})`,
      last_connected_at: new Date().toISOString(),
    };
    if (endpoint.device_name?.trim()) {
      this.deviceName = endpoint.device_name.trim();
    }

    this.activeEndpoint = nextEndpoint;
    this.connectionState = 'CONNECTING';
    this.lastErrorMessage = null;
    this.notifySnapshot();

    const payload: PingHandshakePayload = {
      ip: nextEndpoint.ip,
      port: nextEndpoint.port,
      pairing_pin: nextEndpoint.pairing_pin,
      client_id: this.clientId,
      device_name: this.deviceName,
    };

    const res = await this.sendRaw('PING_HANDSHAKE', payload);
    if (res.ok) {
      this.connectionState = 'CONNECTED';
      this.lastErrorMessage = null;
      this.lastLatencyMs = res.latency_ms;
      this.cache.system_config = res.data.system_config;
      this.cache.catalogs = res.data.catalogs;
      this.cache.alerts = res.data.alerts_summary;
      this.cache.effective_date = res.data.effective_date;
      this.cache.last_synced_at = res.timestamp;

      this.recentEndpoints = [
        nextEndpoint,
        ...this.recentEndpoints.filter(
          (e) => !(e.ip === nextEndpoint.ip && e.port === nextEndpoint.port),
        ),
      ].slice(0, 5);
      this.persistConn();
      this.persistCache();
    } else {
      this.connectionState = this.cache.last_synced_at ? 'OFFLINE_CACHED' : 'DISCONNECTED';
      this.lastErrorMessage = res.error.message;
      this.lastLatencyMs = res.latency_ms;
    }

    this.notifySnapshot();
    return res;
  }

  public async request<A extends ProtocolAction>(
    action: A,
    payload: ProtocolRequestMap[A]['req'],
  ): Promise<ServerResponse<ProtocolRequestMap[A]['res']>> {
    if (this.connectionState === 'DISCONNECTED' && action !== 'PING_HANDSHAKE') {
      return {
        ok: false,
        error: {
          code: 'SERVER_STOPPED',
          message: 'Mobile Client chưa kết nối tới Desktop Server. Vui lòng kết nối tại MOB-00.',
        },
        request_id: `req-local-${this.seqCounter++}`,
        timestamp: new Date().toISOString(),
        latency_ms: 0,
      };
    }

    if (this.manuallyDisconnected && WRITE_ACTIONS.has(action)) {
      return {
        ok: false,
        error: {
          code: 'SERVER_STOPPED',
          message:
            'Phiên kết nối đã bị ngắt. Vui lòng kết nối lại với Desktop Server trước khi thực hiện thao tác ghi.',
        },
        request_id: `req-offline-${this.seqCounter++}`,
        timestamp: new Date().toISOString(),
        latency_ms: 0,
      };
    }

    const res = await this.sendRaw(action, payload);
    this.lastLatencyMs = res.latency_ms;

    if (res.ok) {
      if (this.connectionState === 'OFFLINE_CACHED') {
        this.connectionState = 'CONNECTED';
      }
      this.lastErrorMessage = null;
      this.updateCacheFromResponse(action, payload, res.data, res.timestamp);
    } else {
      if (
        res.error.code === 'SERVER_STOPPED' ||
        res.error.code === 'NETWORK_DROP' ||
        res.error.code === 'TIMEOUT'
      ) {
        this.connectionState = this.cache.last_synced_at ? 'OFFLINE_CACHED' : 'DISCONNECTED';
      }
      this.lastErrorMessage = res.error.message;
    }

    this.notifySnapshot();
    return res;
  }

  private updateCacheFromResponse<A extends ProtocolAction>(
    action: A,
    payload: ProtocolRequestMap[A]['req'],
    data: ProtocolRequestMap[A]['res'],
    timestamp: string,
  ): void {
    this.cache.last_synced_at = timestamp;
    switch (action) {
      case 'GET_FEFO_LIST': {
        const req = payload as ProtocolRequestMap['GET_FEFO_LIST']['req'];
        const isUnfiltered =
          !req ||
          ((!req.area_type || req.area_type === 'all') &&
            (!req.location_id || req.location_id === 'all') &&
            (!req.priority_level || req.priority_level === 'all'));
        if (isUnfiltered) {
          const res = data as ProtocolRequestMap['GET_FEFO_LIST']['res'];
          this.cache.fefo_items = res.items;
          this.cache.effective_date = res.reference_date;
        }
        break;
      }
      case 'GET_RECIPES': {
        const req = payload as ProtocolRequestMap['GET_RECIPES']['req'];
        if (!req || req.focus_item_id === undefined) {
          this.cache.recipes = data as ProtocolRequestMap['GET_RECIPES']['res'];
        }
        break;
      }
      case 'SEARCH_FOOD_ITEMS': {
        const req = payload as ProtocolRequestMap['SEARCH_FOOD_ITEMS']['req'];
        const isUnfiltered =
          !req ||
          (!req.keyword?.trim() &&
            (!req.category_id || req.category_id === 'all') &&
            (!req.area_type || req.area_type === 'all') &&
            (!req.location_id || req.location_id === 'all') &&
            (!req.stock_status || req.stock_status === 'all') &&
            (!req.expiry_status || req.expiry_status === 'all'));
        if (isUnfiltered) {
          const res = data as ProtocolRequestMap['SEARCH_FOOD_ITEMS']['res'];
          this.cache.inventory_items = res.items;
          this.cache.effective_date = res.reference_date;
        }
        break;
      }
      case 'GET_ALERTS': {
        this.cache.alerts = data as ProtocolRequestMap['GET_ALERTS']['res'];
        break;
      }
      case 'GET_STATS': {
        this.cache.stats = data as ProtocolRequestMap['GET_STATS']['res'];
        break;
      }
      case 'GET_AUDIT_LOGS': {
        const res = data as ProtocolRequestMap['GET_AUDIT_LOGS']['res'];
        this.cache.audit_logs = res.transactions;
        break;
      }
      case 'GET_CATALOGS': {
        this.cache.catalogs = data as ProtocolRequestMap['GET_CATALOGS']['res'];
        break;
      }
      case 'GET_AI_SCAN_PRESETS': {
        this.cache.ai_scan_presets = data as ProtocolRequestMap['GET_AI_SCAN_PRESETS']['res'];
        break;
      }
      case 'UPDATE_SYSTEM_CONFIG':
      case 'SHIFT_SIMULATED_DATE': {
        this.cache.system_config = data as SystemConfig;
        break;
      }
      default:
        break;
    }
    this.persistCache();
  }

  private recordClientPacket(
    action: ProtocolAction,
    status: 'OK' | 'ERROR',
    latencyMs: number,
    summary: string,
  ): void {
    const entry: PacketLogEntry = {
      id: `cpkt-${Date.now()}-${this.seqCounter++}`,
      timestamp: formatIsoTimestampInTimezone(
        new Date(),
        this.cache.system_config?.timezone ?? DEFAULT_TIMEZONE,
      ),
      direction: status === 'OK' ? 'SERVER->CLIENT' : 'CLIENT->SERVER',
      device: this.deviceName,
      action,
      status,
      latency_ms: latencyMs,
      payload_summary: summary,
    };
    this.packetLogs = [entry, ...this.packetLogs].slice(0, 60);
  }

  private async sendRaw<A extends ProtocolAction>(
    action: A,
    payload: ProtocolRequestMap[A]['req'],
  ): Promise<ServerResponse<ProtocolRequestMap[A]['res']>> {
    const reqId = `req-${Date.now()}-${this.seqCounter++}`;

    // Client-side network drop simulation
    if (this.simulatedNetworkOffline) {
      const errRes: ServerResponse<ProtocolRequestMap[A]['res']> = {
        ok: false,
        error: {
          code: 'NETWORK_DROP',
          message:
            'Mất kết nối mạng LAN tới Desktop Server. Vui lòng kiểm tra Wi-Fi và thử lại.',
        },
        request_id: reqId,
        timestamp: new Date().toISOString(),
        latency_ms: 0,
      };
      this.recordClientPacket(action, 'ERROR', 0, errRes.error.message);
      return errRes;
    }

    // Client-side one-shot fault simulation (useful for standalone Mobile testing)
    if (this.clientFaultOverride !== 'NONE') {
      const mode = this.clientFaultOverride;
      const faultAppliesToAction = mode !== 'CONFLICT_STALE_STOCK' || action === 'USE_FOOD';
      if (faultAppliesToAction) {
        this.clientFaultOverride = 'NONE';
      }
      if (mode === 'TIMEOUT') {
        const errRes: ServerResponse<ProtocolRequestMap[A]['res']> = {
          ok: false,
          error: {
            code: 'TIMEOUT',
            message: 'Hết thời gian chờ phản hồi từ Desktop Server (Timeout giả lập).',
          },
          request_id: reqId,
          timestamp: new Date().toISOString(),
          latency_ms: 350,
        };
        this.recordClientPacket(action, 'ERROR', 350, errRes.error.message);
        return errRes;
      }
      if (mode === 'NETWORK_DROP') {
        const errRes: ServerResponse<ProtocolRequestMap[A]['res']> = {
          ok: false,
          error: {
            code: 'NETWORK_DROP',
            message: 'Mất kết nối Wi-Fi / LAN đột ngột khi gửi yêu cầu.',
          },
          request_id: reqId,
          timestamp: new Date().toISOString(),
          latency_ms: 15,
        };
        this.recordClientPacket(action, 'ERROR', 15, errRes.error.message);
        return errRes;
      }
      if (mode === 'DB_ERROR') {
        const errRes: ServerResponse<ProtocolRequestMap[A]['res']> = {
          ok: false,
          error: {
            code: 'DB_ERROR',
            message: 'Lỗi kết nối CSDL SQLite giả lập trên Desktop Server.',
          },
          request_id: reqId,
          timestamp: new Date().toISOString(),
          latency_ms: 25,
        };
        this.recordClientPacket(action, 'ERROR', 25, errRes.error.message);
        return errRes;
      }
      if (mode === 'CONFLICT_STALE_STOCK' && action === 'USE_FOOD') {
        if (this.broadcastChannel) {
          const usePayload = payload as ProtocolRequestMap['USE_FOOD']['req'];
          const peekReply = await this.tryBroadcastRpc(
            `req-peek-${Date.now()}-${this.seqCounter++}`,
            'GET_ITEM_DETAIL',
            { item_id: usePayload.item_id },
          );
          if (peekReply) {
            const detailRes = peekReply.response as ServerResponse<
              ProtocolRequestMap['GET_ITEM_DETAIL']['res']
            >;
            const currentLot = detailRes.ok ? detailRes.data.item : undefined;
            const errRes: ServerResponse<ProtocolRequestMap[A]['res']> = {
              ok: false,
              error: {
                code: 'CONFLICT_STALE_STOCK',
                sql_state: '45000',
                message:
                  'Xung đột tồn kho: Thiết bị khác vừa xuất dùng lô này trước khi yêu cầu của bạn tới Server.',
                latest_quantity: currentLot?.current_quantity ?? 0,
                unit_name: currentLot?.unit_name ?? 'đơn vị',
              },
              request_id: reqId,
              timestamp: new Date().toISOString(),
              latency_ms: peekReply.response.latency_ms,
            };
            this.recordClientPacket(action, 'ERROR', errRes.latency_ms, errRes.error.message);
            return errRes;
          }
        }
        this.localServer.setForceNextError('CONFLICT_STALE_STOCK', false);
      }
    }

    // Attempt same-origin BroadcastChannel RPC first if enabled
    if (this.broadcastChannel) {
      const remoteReply = await this.tryBroadcastRpc(reqId, action, payload);
      if (remoteReply) {
        const typedRes = remoteReply.response as ServerResponse<ProtocolRequestMap[A]['res']>;
        this.recordClientPacket(
          action,
          typedRes.ok ? 'OK' : 'ERROR',
          typedRes.latency_ms,
          typedRes.ok ? 'BroadcastChannel ACK' : typedRes.error.message,
        );
        return typedRes;
      }
    }

    // Standalone in-process LocalServer fallback
    const localRes = await this.localServer.handleClientAction(action, payload, {
      client_id: this.clientId,
      device_name: this.deviceName,
    });

    this.recordClientPacket(
      action,
      localRes.ok ? 'OK' : 'ERROR',
      localRes.latency_ms,
      localRes.ok ? 'LocalServer ACK' : localRes.error.message,
    );
    return localRes;
  }

  private tryBroadcastRpc<A extends ProtocolAction>(
    requestId: string,
    action: A,
    payload: ProtocolRequestMap[A]['req'],
  ): Promise<WireRpcReply<A> | null> {
    const channel = this.broadcastChannel;
    if (!channel) return Promise.resolve(null);

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingBroadcastRpc.delete(requestId);
        resolve(null);
      }, this.broadcastTimeoutMs);

      this.pendingBroadcastRpc.set(requestId, {
        resolve: (reply) => resolve(reply as WireRpcReply<A>),
        timer,
      });

      const envelope: WireRpcEnvelope<A> = {
        kind: 'RPC_REQUEST',
        request_id: requestId,
        action,
        payload,
        client_id: this.clientId,
        device_name: this.deviceName,
        sent_at: new Date().toISOString(),
      };
      channel.postMessage(envelope);
    });
  }
}

let sharedMobileTransport: SimulatedClientTransport | null = null;

export function getSharedMobileClientTransport(): SimulatedClientTransport {
  if (!sharedMobileTransport) {
    sharedMobileTransport = new SimulatedClientTransport({
      persistToStorage: true,
      enableBroadcastChannel: true,
    });
  }
  return sharedMobileTransport;
}
