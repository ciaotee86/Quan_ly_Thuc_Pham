import { listAiScanPresets, runSimulatedAiScan } from '../data/ai-scan-presets';
import { createInitialDatabaseState } from '../data/sql-seed-dataset';
import { formatIsoTimestampInTimezone } from '../domain/calendar-date';
import type {
  AiScanPreset,
  CatalogBundle,
  HouseholdDatabaseState,
  SystemConfig,
} from '../domain/food-entities';
import type {
  ConnectedClientSession,
  FaultInjectionMode,
  PacketDirection,
  PacketLogEntry,
  ProtocolAction,
  ProtocolError,
  ProtocolRequestMap,
  ServerPushEvent,
  ServerResponse,
  ServerRuntimeConfig,
  ServerStatusSnapshot,
  WirePushMessage,
  WireRpcEnvelope,
  WireRpcReply,
} from '../domain/protocol-contracts';
import { calculateAlertsSummary } from '../engine/alerts-calculator';
import { aggregateAnalytics } from '../engine/analytics-aggregator';
import {
  generateFefoRecommendations,
  resolveEffectiveDate,
  suggestRecipesForPantry,
} from '../engine/fefo-recommender';
import {
  adjustFood,
  cancelFoodItem,
  checkFoodDuplicate,
  cookRecipe,
  createFoodItem,
  deleteCategory,
  deleteLocation,
  deleteRecipe,
  deleteUnit,
  getAuditLogs,
  getCatalogMetadata,
  getItemDetail,
  moveFoodLocation,
  restockFood,
  saveCategory,
  saveLocation,
  saveRecipe,
  saveUnit,
  searchFoodItems,
  shiftSimulatedDate,
  updateFoodItem,
  updateSystemConfig,
  useFood,
} from '../engine/inventory-ledger';

export const BROADCAST_CHANNEL_NAME = 'food_mgmt_cs_v1';
const DB_STORAGE_KEY = 'food_mgmt_sim_db_v1';
const RUNTIME_STORAGE_KEY = 'food_mgmt_sim_runtime_v1';
const MAX_PACKET_LOGS = 150;
const SERVER_VERSION = '1.0.0-sim';

export interface SimulatedServerNodeOptions {
  persistToStorage?: boolean;
  enableBroadcastChannel?: boolean;
  storageKeyPrefix?: string;
}

interface PersistedRuntimePayload {
  runtime: ServerRuntimeConfig;
  connected_clients: ConnectedClientSession[];
  packet_logs: PacketLogEntry[];
}

function safeGetStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

function createInitialRuntimeState(): PersistedRuntimePayload {
  const initialDate = createInitialDatabaseState().system_config.simulated_date;
  return {
    runtime: {
      server_running: true,
      db_healthy: true,
      simulated_latency_ms: 40,
      force_next_error: 'NONE',
      minimized_to_tray: false,
    },
    connected_clients: [
      {
        client_id: 'mob-kitchen-01',
        device_name: 'Điện thoại Bếp (Demo)',
        ip_address: '192.168.1.24',
        connected_at: `${initialDate} 07:15:00`,
        last_seen_at: `${initialDate} 08:02:10`,
        status: 'Connected',
      },
    ],
    packet_logs: [
      {
        id: 'pkt-init-1',
        timestamp: `${initialDate} 07:15:00`,
        direction: 'CLIENT->SERVER',
        device: 'Điện thoại Bếp (Demo)',
        action: 'PING_HANDSHAKE',
        status: 'OK',
        latency_ms: 18,
        payload_summary: '192.168.1.10:8080 · Handshake ACK (v1.0.0-sim)',
      },
      {
        id: 'pkt-init-2',
        timestamp: `${initialDate} 07:15:01`,
        direction: 'SERVER->CLIENT',
        device: 'Điện thoại Bếp (Demo)',
        action: 'GET_FEFO_LIST',
        status: 'OK',
        latency_ms: 24,
        payload_summary: 'Trả 12 lô đủ điều kiện FEFO (loại 2 lô quá hạn)',
      },
      {
        id: 'pkt-init-3',
        timestamp: `${initialDate} 08:02:10`,
        direction: 'SERVER->PUSH',
        device: 'Broadcast All',
        action: 'ALERTS_UPDATED',
        status: 'PUSH',
        latency_ms: 5,
        payload_summary: 'Đồng bộ cảnh báo: 2 quá hạn, 1 cận hạn, 5 sắp hết',
      },
    ],
  };
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SimulatedServerNode {
  private db: HouseholdDatabaseState;
  private runtime: ServerRuntimeConfig;
  private connectedClients: ConnectedClientSession[];
  private packetLogs: PacketLogEntry[];
  private stickyFault = false;
  private seqCounter = 1;

  private readonly persistToStorage: boolean;
  private readonly dbStorageKey: string;
  private readonly runtimeStorageKey: string;

  private readonly statusListeners = new Set<(snapshot: ServerStatusSnapshot) => void>();
  private readonly pushListeners = new Set<(event: ServerPushEvent) => void>();
  private broadcastChannel: BroadcastChannel | null = null;

  constructor(options: SimulatedServerNodeOptions = {}) {
    this.persistToStorage = options.persistToStorage ?? true;
    const prefix = options.storageKeyPrefix ? `${options.storageKeyPrefix}_` : '';
    this.dbStorageKey = `${prefix}${DB_STORAGE_KEY}`;
    this.runtimeStorageKey = `${prefix}${RUNTIME_STORAGE_KEY}`;

    const loadedDb = this.loadDbFromStorage();
    this.db = loadedDb ?? createInitialDatabaseState();

    const loadedRuntime = this.loadRuntimeFromStorage();
    const initialRt = createInitialRuntimeState();
    this.runtime = loadedRuntime?.runtime ?? initialRt.runtime;
    this.connectedClients = loadedRuntime?.connected_clients ?? initialRt.connected_clients;
    this.packetLogs = loadedRuntime?.packet_logs ?? initialRt.packet_logs;

    if (options.enableBroadcastChannel && typeof BroadcastChannel !== 'undefined') {
      this.attachBroadcastChannel();
    }
  }

  private loadDbFromStorage(): HouseholdDatabaseState | null {
    if (!this.persistToStorage) return null;
    const storage = safeGetStorage();
    if (!storage) return null;
    try {
      const raw = storage.getItem(this.dbStorageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as HouseholdDatabaseState;
      if (!parsed || !Array.isArray(parsed.food_items) || !parsed.system_config) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private loadRuntimeFromStorage(): PersistedRuntimePayload | null {
    if (!this.persistToStorage) return null;
    const storage = safeGetStorage();
    if (!storage) return null;
    try {
      const raw = storage.getItem(this.runtimeStorageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PersistedRuntimePayload;
      if (!parsed || !parsed.runtime) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private persistState(): void {
    if (!this.persistToStorage) return;
    const storage = safeGetStorage();
    if (!storage) return;
    try {
      storage.setItem(this.dbStorageKey, JSON.stringify(this.db));
      const rtPayload: PersistedRuntimePayload = {
        runtime: this.runtime,
        connected_clients: this.connectedClients,
        packet_logs: this.packetLogs,
      };
      storage.setItem(this.runtimeStorageKey, JSON.stringify(rtPayload));
    } catch {
      // Ignore storage quota errors in prototype mode
    }
  }

  private attachBroadcastChannel(): void {
    if (this.broadcastChannel) return;
    this.broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    this.broadcastChannel.onmessage = (event: MessageEvent<WireRpcEnvelope | { kind: string }>) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.kind === 'RPC_REQUEST') {
        const env = data as WireRpcEnvelope;
        void this.handleClientAction(env.action, env.payload, {
          client_id: env.client_id,
          device_name: env.device_name,
        }).then((response) => {
          const reply: WireRpcReply = {
            kind: 'RPC_RESPONSE',
            request_id: env.request_id,
            action: env.action,
            response,
          };
          this.broadcastChannel?.postMessage(reply);
        });
      }
    };
  }

  public dispose(): void {
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }
    this.statusListeners.clear();
    this.pushListeners.clear();
  }

  public subscribeStatus(listener: (snapshot: ServerStatusSnapshot) => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  public subscribePush(listener: (event: ServerPushEvent) => void): () => void {
    this.pushListeners.add(listener);
    return () => {
      this.pushListeners.delete(listener);
    };
  }

  private notifyStatusSubscribers(): void {
    const snap = this.getStatusSnapshot();
    for (const listener of this.statusListeners) {
      listener(snap);
    }
  }

  private emitPushEvent(event: ServerPushEvent): void {
    for (const listener of this.pushListeners) {
      listener(event);
    }
    if (this.broadcastChannel) {
      const msg: WirePushMessage = { kind: 'SERVER_PUSH', event };
      this.broadcastChannel.postMessage(msg);
    }
  }

  private nowFormatted(): string {
    return formatIsoTimestampInTimezone(new Date(), this.db.system_config.timezone);
  }

  private appendPacketLog(entry: Omit<PacketLogEntry, 'id' | 'timestamp'>): void {
    const logEntry: PacketLogEntry = {
      id: `pkt-${Date.now()}-${this.seqCounter++}`,
      timestamp: this.nowFormatted(),
      ...entry,
    };
    this.packetLogs = [logEntry, ...this.packetLogs].slice(0, MAX_PACKET_LOGS);
  }

  public clearPacketLogs(): void {
    this.packetLogs = [];
    this.persistState();
    this.notifyStatusSubscribers();
  }

  public getStatusSnapshot(): ServerStatusSnapshot {
    return {
      runtime: { ...this.runtime },
      system_config: { ...this.db.system_config },
      effective_date: resolveEffectiveDate(this.db.system_config),
      server_version: SERVER_VERSION,
      connected_clients: this.connectedClients.map((c) => ({ ...c })),
      packet_logs: this.packetLogs.map((l) => ({ ...l })),
      alerts_summary: calculateAlertsSummary(this.db),
    };
  }

  /** @deprecated (test-only) Do not call from production client code; use protocol RPC actions instead. */
  public getDatabaseSnapshot(): HouseholdDatabaseState {
    return structuredClone(this.db);
  }

  public getCatalogsBundle(): CatalogBundle {
    return {
      categories: this.db.categories.map((c) => ({ ...c })),
      units: this.db.units.map((u) => ({ ...u })),
      storage_locations: this.db.storage_locations.map((l) => ({ ...l })),
      recipes: this.db.recipes.map((r) => ({
        ...r,
        ingredients: r.ingredients.map((i) => ({ ...i })),
        steps: [...r.steps],
      })),
    };
  }

  public getAiScanPresets(): AiScanPreset[] {
    return listAiScanPresets(resolveEffectiveDate(this.db.system_config));
  }

  // Runtime Server Simulation Controls
  public setServerRunning(running: boolean): void {
    this.runtime.server_running = running;
    this.appendPacketLog({
      direction: 'SERVER->PUSH',
      device: 'Desktop Server',
      action: running ? 'SERVER_STARTED' : 'SERVER_STOPPED',
      status: running ? 'OK' : 'ERROR',
      latency_ms: 0,
      payload_summary: running
        ? `Listener lắng nghe tại ${this.db.system_config.server_ip}:${this.db.system_config.server_port}`
        : 'Dịch vụ Server Listener đã tạm dừng — Mobile Client không thể ghi dữ liệu',
    });
    this.persistState();
    this.emitPushEvent({
      type: 'SERVER_STATUS_CHANGED',
      timestamp: this.nowFormatted(),
      source_device: 'Desktop Server',
      summary: running ? 'Desktop Server đã khởi động lại' : 'Desktop Server đã tạm dừng',
    });
    this.notifyStatusSubscribers();
  }

  public setDbHealthy(healthy: boolean): void {
    this.runtime.db_healthy = healthy;
    this.appendPacketLog({
      direction: 'SERVER->PUSH',
      device: 'SQLite Engine (Sim)',
      action: healthy ? 'DB_RECONNECTED' : 'DB_CONNECTION_LOST',
      status: healthy ? 'OK' : 'ERROR',
      latency_ms: 0,
      payload_summary: healthy
        ? 'Kết nối CSDL food_management hoạt động bình thường'
        : 'Mất kết nối CSDL SQLite giả lập — khóa mọi thao tác đọc/ghi kho',
    });
    this.persistState();
    this.notifyStatusSubscribers();
  }

  public setSimulatedLatencyMs(ms: number): void {
    const safeMs = Number.isFinite(ms) ? Math.min(5000, Math.max(0, Math.round(ms))) : 0;
    this.runtime.simulated_latency_ms = safeMs;
    this.persistState();
    this.notifyStatusSubscribers();
  }

  public setForceNextError(mode: FaultInjectionMode, sticky = false): void {
    this.runtime.force_next_error = mode;
    this.stickyFault = sticky;
    this.persistState();
    this.notifyStatusSubscribers();
  }

  public setMinimizedToTray(minimized: boolean): void {
    this.runtime.minimized_to_tray = minimized;
    this.persistState();
    this.notifyStatusSubscribers();
  }

  public disconnectClient(clientId: string): void {
    const target = this.connectedClients.find((c) => c.client_id === clientId);
    if (!target) return;
    target.status = 'Disconnected';
    target.last_seen_at = this.nowFormatted();
    this.appendPacketLog({
      direction: 'SERVER->PUSH',
      device: target.device_name,
      action: 'CLIENT_DISCONNECTED',
      status: 'PUSH',
      latency_ms: 0,
      payload_summary: `Quản trị viên đã ngắt kết nối phiên ${target.device_name} (${target.ip_address})`,
    });
    this.persistState();
    this.emitPushEvent({
      type: 'CLIENT_DISCONNECTED',
      timestamp: this.nowFormatted(),
      source_device: 'Desktop Server',
      summary: `Phiên ${target.device_name} đã bị ngắt kết nối từ Desktop Server`,
      target_client_id: clientId,
    });
    this.notifyStatusSubscribers();
  }

  public resetDatabaseToSeed(): void {
    this.db = createInitialDatabaseState();
    const initialRt = createInitialRuntimeState();
    this.runtime = initialRt.runtime;
    this.connectedClients = initialRt.connected_clients;
    this.packetLogs = initialRt.packet_logs;
    this.stickyFault = false;
    this.persistState();
    this.emitPushEvent({
      type: 'INVENTORY_CHANGED',
      timestamp: this.nowFormatted(),
      source_device: 'Desktop Server',
      summary: 'Khôi phục dữ liệu mẫu SQL ban đầu',
    });
    this.notifyStatusSubscribers();
  }

  public async executeDesktopAction<A extends ProtocolAction>(
    action: A,
    payload: ProtocolRequestMap[A]['req'],
  ): Promise<ServerResponse<ProtocolRequestMap[A]['res']>> {
    return this.dispatchInternal(action, payload, {
      source: 'desktop',
      client_id: 'desktop-admin',
      device_name: 'Desktop Server',
    });
  }

  public async handleClientAction<A extends ProtocolAction>(
    action: A,
    payload: ProtocolRequestMap[A]['req'],
    meta: { client_id: string; device_name: string } = {
      client_id: 'mobile-client',
      device_name: 'Mobile Client',
    },
  ): Promise<ServerResponse<ProtocolRequestMap[A]['res']>> {
    return this.dispatchInternal(action, payload, {
      source: 'client',
      client_id: meta.client_id,
      device_name: meta.device_name,
    });
  }

  private failResponse<T>(
    error: ProtocolError,
    requestId: string,
    latencyMs: number,
  ): ServerResponse<T> {
    return {
      ok: false,
      error,
      request_id: requestId,
      timestamp: this.nowFormatted(),
      latency_ms: latencyMs,
    };
  }

  private okResponse<T>(data: T, requestId: string, latencyMs: number): ServerResponse<T> {
    return {
      ok: true,
      data,
      request_id: requestId,
      timestamp: this.nowFormatted(),
      latency_ms: latencyMs,
    };
  }

  private async dispatchInternal<A extends ProtocolAction>(
    action: A,
    payload: ProtocolRequestMap[A]['req'],
    caller: { source: 'desktop' | 'client'; client_id: string; device_name: string },
  ): Promise<ServerResponse<ProtocolRequestMap[A]['res']>> {
    const requestId = `req-${Date.now()}-${this.seqCounter++}`;
    const startMs = Date.now();
    const configuredLatency = caller.source === 'client' ? this.runtime.simulated_latency_ms : 0;

    if (configuredLatency > 0) {
      await delay(configuredLatency);
    }

    // 1. Check Listener state for client calls
    if (caller.source === 'client' && !this.runtime.server_running) {
      const elapsed = Date.now() - startMs;
      const err: ProtocolError = {
        code: 'SERVER_STOPPED',
        message: 'Không thể kết nối tới Desktop Server. Dịch vụ Server Listener đang tạm dừng.',
      };
      this.appendPacketLog({
        direction: 'CLIENT->SERVER',
        device: caller.device_name,
        action,
        status: 'ERROR',
        latency_ms: elapsed,
        payload_summary: err.message,
      });
      this.notifyStatusSubscribers();
      return this.failResponse(err, requestId, elapsed);
    }

    // 2. Check fault injection for client calls
    if (caller.source === 'client' && this.runtime.force_next_error !== 'NONE') {
      const fault = this.runtime.force_next_error;
      const faultAppliesToAction = fault !== 'CONFLICT_STALE_STOCK' || action === 'USE_FOOD';
      if (faultAppliesToAction && !this.stickyFault) {
        this.runtime.force_next_error = 'NONE';
      }
      const elapsed = Date.now() - startMs;

      if (fault === 'TIMEOUT') {
        await delay(180);
        const timeoutErr: ProtocolError = {
          code: 'TIMEOUT',
          message: 'Hết thời gian chờ phản hồi từ Desktop Server (Request Timeout). Vui lòng thử lại.',
        };
        this.appendPacketLog({
          direction: 'CLIENT->SERVER',
          device: caller.device_name,
          action,
          status: 'ERROR',
          latency_ms: Date.now() - startMs,
          payload_summary: timeoutErr.message,
        });
        this.persistState();
        this.notifyStatusSubscribers();
        return this.failResponse(timeoutErr, requestId, Date.now() - startMs);
      }

      if (fault === 'NETWORK_DROP') {
        const dropErr: ProtocolError = {
          code: 'NETWORK_DROP',
          message: 'Mất kết nối mạng LAN tới Desktop Server giữa chừng.',
        };
        this.appendPacketLog({
          direction: 'CLIENT->SERVER',
          device: caller.device_name,
          action,
          status: 'ERROR',
          latency_ms: elapsed,
          payload_summary: dropErr.message,
        });
        this.persistState();
        this.notifyStatusSubscribers();
        return this.failResponse(dropErr, requestId, elapsed);
      }

      if (fault === 'DB_ERROR') {
        const dbErr: ProtocolError = {
          code: 'DB_ERROR',
          message: 'Lỗi kết nối CSDL SQLite giả lập trên Desktop Server.',
        };
        this.appendPacketLog({
          direction: 'CLIENT->SERVER',
          device: caller.device_name,
          action,
          status: 'ERROR',
          latency_ms: elapsed,
          payload_summary: dbErr.message,
        });
        this.persistState();
        this.notifyStatusSubscribers();
        return this.failResponse(dbErr, requestId, elapsed);
      }

      if (fault === 'CONFLICT_STALE_STOCK' && action === 'USE_FOOD') {
        const usePayload = payload as ProtocolRequestMap['USE_FOOD']['req'];
        const currentLot = this.db.food_items.find((i) => i.item_id === usePayload.item_id);
        const unitName = currentLot
          ? (this.db.units.find((u) => u.unit_id === currentLot.unit_id)?.unit_name ?? 'đơn vị')
          : 'đơn vị';
        const conflictErr: ProtocolError = {
          code: 'CONFLICT_STALE_STOCK',
          sql_state: '45000',
          message:
            'Xung đột tồn kho: Thiết bị khác vừa xuất dùng lô này trước khi yêu cầu của bạn tới Server.',
          latest_quantity: currentLot?.current_quantity ?? 0,
          unit_name: unitName,
        };
        this.appendPacketLog({
          direction: 'SERVER->CLIENT',
          device: caller.device_name,
          action,
          status: 'ERROR',
          latency_ms: elapsed,
          payload_summary: conflictErr.message,
        });
        this.persistState();
        this.notifyStatusSubscribers();
        return this.failResponse(conflictErr, requestId, elapsed);
      }
    }

    // 3. Check DB Health (allow config changes on desktop even when DB down so user can recover)
    const dbExemptActions: ProtocolAction[] = ['UPDATE_SYSTEM_CONFIG'];
    if (!this.runtime.db_healthy && !(caller.source === 'desktop' && dbExemptActions.includes(action))) {
      const elapsed = Date.now() - startMs;
      const err: ProtocolError = {
        code: 'DB_ERROR',
        message: 'Không thể truy vấn CSDL SQLite (food_management) giả lập. Kiểm tra kết nối DB trên Server.',
      };
      this.appendPacketLog({
        direction: 'CLIENT->SERVER',
        device: caller.device_name,
        action,
        status: 'ERROR',
        latency_ms: elapsed,
        payload_summary: err.message,
      });
      this.notifyStatusSubscribers();
      return this.failResponse(err, requestId, elapsed);
    }

    // Update client last_seen if tracked
    if (caller.source === 'client' && action !== 'PING_HANDSHAKE') {
      const session = this.connectedClients.find((c) => c.client_id === caller.client_id);
      if (session && session.status === 'Connected') {
        session.last_seen_at = this.nowFormatted();
      }
    }

    // 4. Execute requested domain action
    const result = this.executeActionSync(action, payload, caller.device_name);
    const elapsed = Math.max(1, Date.now() - startMs);
    const direction: PacketDirection = 'CLIENT->SERVER';

    if (!result.ok) {
      this.appendPacketLog({
        direction,
        device: caller.device_name,
        action,
        status: 'ERROR',
        latency_ms: elapsed,
        payload_summary: result.error.message,
      });
      this.notifyStatusSubscribers();
      return this.failResponse(result.error, requestId, elapsed);
    }

    this.appendPacketLog({
      direction,
      device: caller.device_name,
      action,
      status: 'OK',
      latency_ms: elapsed,
      payload_summary: result.summary,
    });

    if (result.mutated) {
      this.persistState();
      for (const push of result.pushEvents ?? []) {
        this.emitPushEvent(push);
      }
    } else if (action === 'PING_HANDSHAKE') {
      this.persistState();
    }

    this.notifyStatusSubscribers();
    return this.okResponse(result.data, requestId, elapsed);
  }

  private executeActionSync<A extends ProtocolAction>(
    action: A,
    rawPayload: ProtocolRequestMap[A]['req'],
    deviceName: string,
  ):
    | {
        ok: true;
        data: ProtocolRequestMap[A]['res'];
        summary: string;
        mutated: boolean;
        pushEvents?: ServerPushEvent[];
      }
    | { ok: false; error: ProtocolError } {
    const now = this.nowFormatted();
    const push = (type: ServerPushEvent['type'], summary: string): ServerPushEvent => ({
      type,
      timestamp: now,
      source_device: deviceName,
      summary,
    });

    switch (action) {
      case 'PING_HANDSHAKE': {
        const p = rawPayload as ProtocolRequestMap['PING_HANDSHAKE']['req'];
        const cleanIp = p.ip.trim();
        const cfgIp = this.db.system_config.server_ip.trim();
        const ipMatches =
          cleanIp === cfgIp || cleanIp === '127.0.0.1' || cleanIp.toLowerCase() === 'localhost';
        if (!ipMatches || Number(p.port) !== this.db.system_config.server_port) {
          return {
            ok: false,
            error: {
              code: 'INVALID_ADDRESS',
              message: `Không tìm thấy Desktop Server tại ${cleanIp}:${p.port} (Server đang lắng nghe tại ${cfgIp}:${this.db.system_config.server_port}).`,
            },
          };
        }
        if (p.pairing_pin.trim() !== this.db.system_config.pairing_pin.trim()) {
          return {
            ok: false,
            error: {
              code: 'INVALID_PAIRING_PIN',
              message: 'Mã ghép nối (Pairing PIN) không chính xác.',
              field_errors: { pairing_pin: 'Sai mã ghép nối.' },
            },
          };
        }

        let session = this.connectedClients.find((c) => c.client_id === p.client_id);
        if (!session) {
          session = {
            client_id: p.client_id,
            device_name: p.device_name.trim() || 'Mobile Client',
            ip_address: p.client_ip?.trim() || '192.168.1.35',
            connected_at: now,
            last_seen_at: now,
            status: 'Connected',
          };
          this.connectedClients.unshift(session);
        } else {
          session.device_name = p.device_name.trim() || session.device_name;
          session.last_seen_at = now;
          session.status = 'Connected';
        }

        const data: ProtocolRequestMap['PING_HANDSHAKE']['res'] = {
          server_version: SERVER_VERSION,
          server_ip: this.db.system_config.server_ip,
          server_port: this.db.system_config.server_port,
          effective_date: resolveEffectiveDate(this.db.system_config),
          system_config: { ...this.db.system_config },
          catalogs: this.getCatalogsBundle(),
          alerts_summary: calculateAlertsSummary(this.db),
          client_session: { ...session },
        };
        return {
          ok: true,
          data: data as ProtocolRequestMap[A]['res'],
          summary: `Handshake ACK cho ${session.device_name} (${session.ip_address})`,
          mutated: false,
        };
      }

      case 'GET_FEFO_LIST': {
        const p = rawPayload as ProtocolRequestMap['GET_FEFO_LIST']['req'];
        const data = generateFefoRecommendations(this.db, p);
        return {
          ok: true,
          data: data as ProtocolRequestMap[A]['res'],
          summary: `FEFO trả ${data.items.length} lô (loại ${data.expired_excluded_count} quá hạn)`,
          mutated: false,
        };
      }

      case 'GET_RECIPES': {
        const p = rawPayload as ProtocolRequestMap['GET_RECIPES']['req'];
        const data = suggestRecipesForPantry(this.db, p?.focus_item_id);
        return {
          ok: true,
          data: data as ProtocolRequestMap[A]['res'],
          summary: `Gợi ý ${data.length} công thức món ăn`,
          mutated: false,
        };
      }

      case 'SEARCH_FOOD_ITEMS': {
        const p = rawPayload as ProtocolRequestMap['SEARCH_FOOD_ITEMS']['req'];
        const data = searchFoodItems(this.db, p);
        return {
          ok: true,
          data: data as ProtocolRequestMap[A]['res'],
          summary: `Truy vấn kho: ${data.total_count} lô khớp bộ lọc`,
          mutated: false,
        };
      }

      case 'GET_ITEM_DETAIL': {
        const p = rawPayload as ProtocolRequestMap['GET_ITEM_DETAIL']['req'];
        const outcome = getItemDetail(this.db, p.item_id);
        if (!outcome.ok) return outcome;
        return {
          ok: true,
          data: outcome.data as ProtocolRequestMap[A]['res'],
          summary: `Đọc chi tiết lô #${p.item_id} (${outcome.data.item.food_name})`,
          mutated: false,
        };
      }

      case 'SCAN_FOOD_IMAGE': {
        const p = rawPayload as ProtocolRequestMap['SCAN_FOOD_IMAGE']['req'];
        const effectiveDate = resolveEffectiveDate(this.db.system_config);
        const result = runSimulatedAiScan(p, effectiveDate);
        if (!result.recognized) {
          return {
            ok: false,
            error: {
              code: 'AI_UNREADABLE',
              message: result.error_message ?? 'Không thể nhận diện hình ảnh. Vui lòng nhập tay.',
            },
          };
        }
        return {
          ok: true,
          data: result as ProtocolRequestMap[A]['res'],
          summary: `AI Vision nhận diện "${result.suggested_fields?.food_name}" (${Math.round(result.confidence * 100)}%)`,
          mutated: false,
        };
      }

      case 'CHECK_FOOD_DUPLICATE': {
        const p = rawPayload as ProtocolRequestMap['CHECK_FOOD_DUPLICATE']['req'];
        const data = checkFoodDuplicate(this.db, p);
        return {
          ok: true,
          data: data as ProtocolRequestMap[A]['res'],
          summary: `Kiểm tra trùng mã/tên (${data.has_code_conflict ? 'Trùng mã' : data.has_name_conflict ? 'Trùng tên' : 'Hợp lệ'})`,
          mutated: false,
        };
      }

      case 'CREATE_FOOD_ITEM': {
        const p = rawPayload as ProtocolRequestMap['CREATE_FOOD_ITEM']['req'];
        const outcome = createFoodItem(this.db, { ...p, actor_device: p.actor_device ?? deviceName });
        if (!outcome.ok) return outcome;
        return {
          ok: true,
          data: outcome.data as ProtocolRequestMap[A]['res'],
          summary: `Thêm lô ${outcome.data.item.item_code} · ${outcome.data.food.food_name} (${outcome.data.item.current_quantity} ${outcome.data.item.unit_name})`,
          mutated: true,
          pushEvents: [
            push('INVENTORY_CHANGED', `Đã thêm lô ${outcome.data.food.food_name}`),
            push('ALERTS_UPDATED', 'Cập nhật lại FEFO và Cảnh báo sau khi nhập lô mới'),
          ],
        };
      }

      case 'USE_FOOD': {
        const p = rawPayload as ProtocolRequestMap['USE_FOOD']['req'];
        const outcome = useFood(this.db, { ...p, actor_device: p.actor_device ?? deviceName });
        if (!outcome.ok) return outcome;
        const alerts = calculateAlertsSummary(this.db);
        const data: ProtocolRequestMap['USE_FOOD']['res'] = {
          item: outcome.data.item,
          transaction: outcome.data.transaction,
          alerts_summary: alerts,
        };
        return {
          ok: true,
          data: data as ProtocolRequestMap[A]['res'],
          summary: `sp_use_food: ${outcome.data.item.food_name} -${p.quantity_used} → còn ${outcome.data.item.current_quantity} ${outcome.data.item.unit_name}`,
          mutated: true,
          pushEvents: [
            push(
              'INVENTORY_CHANGED',
              `Đã xuất dùng ${p.quantity_used} ${outcome.data.item.unit_name} ${outcome.data.item.food_name}`,
            ),
            push('ALERTS_UPDATED', 'Cập nhật lại cảnh báo tồn kho & FEFO'),
          ],
        };
      }

      case 'RESTOCK_FOOD': {
        const p = rawPayload as ProtocolRequestMap['RESTOCK_FOOD']['req'];
        const outcome = restockFood(this.db, { ...p, actor_device: p.actor_device ?? deviceName });
        if (!outcome.ok) return outcome;
        const alerts = calculateAlertsSummary(this.db);
        const data: ProtocolRequestMap['RESTOCK_FOOD']['res'] = {
          item: outcome.data.item,
          transaction: outcome.data.transaction,
          alerts_summary: alerts,
        };
        return {
          ok: true,
          data: data as ProtocolRequestMap[A]['res'],
          summary: `Nhập thêm ${outcome.data.item.food_name} +${p.quantity_added} → tồn ${outcome.data.item.current_quantity} ${outcome.data.item.unit_name}`,
          mutated: true,
          pushEvents: [
            push('INVENTORY_CHANGED', `Đã nhập thêm ${outcome.data.item.food_name}`),
            push('ALERTS_UPDATED', 'Cập nhật danh sách cần mua bổ sung'),
          ],
        };
      }

      case 'ADJUST_FOOD': {
        const p = rawPayload as ProtocolRequestMap['ADJUST_FOOD']['req'];
        const outcome = adjustFood(this.db, { ...p, actor_device: p.actor_device ?? deviceName });
        if (!outcome.ok) return outcome;
        const alerts = calculateAlertsSummary(this.db);
        const data: ProtocolRequestMap['ADJUST_FOOD']['res'] = {
          item: outcome.data.item,
          transaction: outcome.data.transaction,
          alerts_summary: alerts,
        };
        return {
          ok: true,
          data: data as ProtocolRequestMap[A]['res'],
          summary: `Kiểm kê ${outcome.data.item.food_name} → ${outcome.data.item.current_quantity} ${outcome.data.item.unit_name}`,
          mutated: true,
          pushEvents: [
            push('INVENTORY_CHANGED', `Đã kiểm kê ${outcome.data.item.food_name}`),
            push('ALERTS_UPDATED', 'Cập nhật lại cảnh báo kho'),
          ],
        };
      }

      case 'MOVE_LOCATION': {
        const p = rawPayload as ProtocolRequestMap['MOVE_LOCATION']['req'];
        const outcome = moveFoodLocation(this.db, { ...p, actor_device: p.actor_device ?? deviceName });
        if (!outcome.ok) return outcome;
        const alerts = calculateAlertsSummary(this.db);
        const data: ProtocolRequestMap['MOVE_LOCATION']['res'] = {
          item: outcome.data.item,
          transaction: outcome.data.transaction,
          alerts_summary: alerts,
        };
        return {
          ok: true,
          data: data as ProtocolRequestMap[A]['res'],
          summary: `Đổi vị trí ${outcome.data.item.food_name} → ${outcome.data.item.location_name}`,
          mutated: true,
          pushEvents: [push('INVENTORY_CHANGED', `Đã chuyển vị trí ${outcome.data.item.food_name}`)],
        };
      }

      case 'UPDATE_FOOD_ITEM': {
        const p = rawPayload as ProtocolRequestMap['UPDATE_FOOD_ITEM']['req'];
        const outcome = updateFoodItem(this.db, p.item_id, {
          ...p.input,
          actor_device: p.input.actor_device ?? deviceName,
        });
        if (!outcome.ok) return outcome;
        const alerts = calculateAlertsSummary(this.db);
        const dummyTx = outcome.data.transaction ?? {
          transaction_id: 0,
          item_id: outcome.data.item.item_id,
          action_type: 'Điều chỉnh' as const,
          change_quantity: 0,
          remaining_quantity: outcome.data.item.current_quantity,
          reason: 'Cập nhật thông tin hồ sơ thực phẩm',
          transaction_date: now,
          actor_device: deviceName,
        };
        const data: ProtocolRequestMap['UPDATE_FOOD_ITEM']['res'] = {
          item: outcome.data.item,
          transaction: dummyTx,
          alerts_summary: alerts,
        };
        return {
          ok: true,
          data: data as ProtocolRequestMap[A]['res'],
          summary: `Cập nhật hồ sơ ${outcome.data.item.food_name} (HSD ${outcome.data.item.expiry_date})`,
          mutated: true,
          pushEvents: [
            push('INVENTORY_CHANGED', `Đã cập nhật thông tin ${outcome.data.item.food_name}`),
            push('ALERTS_UPDATED', 'Tính lại FEFO và Cảnh báo'),
          ],
        };
      }

      case 'CANCEL_FOOD_ITEM': {
        const p = rawPayload as ProtocolRequestMap['CANCEL_FOOD_ITEM']['req'];
        const outcome = cancelFoodItem(this.db, { ...p, actor_device: p.actor_device ?? deviceName });
        if (!outcome.ok) return outcome;
        const alerts = calculateAlertsSummary(this.db);
        const data: ProtocolRequestMap['CANCEL_FOOD_ITEM']['res'] = {
          item: outcome.data.item,
          transaction: outcome.data.transaction,
          alerts_summary: alerts,
        };
        return {
          ok: true,
          data: data as ProtocolRequestMap[A]['res'],
          summary: `Thanh lý (Đã hủy) ${outcome.data.item.food_name} — bảo toàn Audit Log`,
          mutated: true,
          pushEvents: [
            push('INVENTORY_CHANGED', `Đã thanh lý ${outcome.data.item.food_name}`),
            push('ALERTS_UPDATED', 'Cập nhật lại danh sách cảnh báo'),
          ],
        };
      }

      case 'COOK_RECIPE': {
        const p = rawPayload as ProtocolRequestMap['COOK_RECIPE']['req'];
        const outcome = cookRecipe(this.db, { ...p, actor_device: p.actor_device ?? deviceName });
        if (!outcome.ok) return outcome;
        const data: ProtocolRequestMap['COOK_RECIPE']['res'] = outcome.data;
        return {
          ok: true,
          data: data as ProtocolRequestMap[A]['res'],
          summary: `Nấu món ${outcome.data.recipe_name} — trừ kho ${outcome.data.deducted_count} lô nguyên liệu`,
          mutated: true,
          pushEvents: [
            push('INVENTORY_CHANGED', `Đã trừ kho nấu món ${outcome.data.recipe_name}`),
            push('ALERTS_UPDATED', 'Cập nhật lại danh sách cảnh báo'),
          ],
        };
      }

      case 'GET_ALERTS': {
        const data = calculateAlertsSummary(this.db);
        return {
          ok: true,
          data: data as ProtocolRequestMap[A]['res'],
          summary: `Quét cảnh báo: ${data.expired_items.length} hết hạn, ${data.expiring_soon_items.length} cận hạn, ${data.low_stock_items.length} tồn thấp`,
          mutated: false,
        };
      }

      case 'GET_STATS': {
        const p = rawPayload as ProtocolRequestMap['GET_STATS']['req'];
        const data = aggregateAnalytics(this.db, p);
        return {
          ok: true,
          data: data as ProtocolRequestMap[A]['res'],
          summary: `Thống kê ${data.range_days} ngày (${data.start_date} → ${data.end_date})`,
          mutated: false,
        };
      }

      case 'GET_AUDIT_LOGS': {
        const p = rawPayload as ProtocolRequestMap['GET_AUDIT_LOGS']['req'];
        const data = getAuditLogs(this.db, p);
        return {
          ok: true,
          data: data as ProtocolRequestMap[A]['res'],
          summary: `Đọc ${data.transactions.length} dòng nhật ký biến động`,
          mutated: false,
        };
      }

      case 'GET_CATALOGS': {
        const data = this.getCatalogsBundle();
        return {
          ok: true,
          data: data as ProtocolRequestMap[A]['res'],
          summary: `Đồng bộ danh mục (${data.categories.length} loại, ${data.units.length} đơn vị, ${data.storage_locations.length} vị trí, ${data.recipes.length} món)`,
          mutated: false,
        };
      }

      case 'GET_CATALOG_METADATA': {
        const data = getCatalogMetadata(this.db);
        return {
          ok: true,
          data: data as ProtocolRequestMap[A]['res'],
          summary: `Đồng bộ metadata danh mục (${data.foods.length} thực phẩm chuẩn)`,
          mutated: false,
        };
      }

      case 'GET_AI_SCAN_PRESETS': {
        const data = this.getAiScanPresets();
        return {
          ok: true,
          data: data as ProtocolRequestMap[A]['res'],
          summary: `Trả ${data.length} mẫu quét AI Vision`,
          mutated: false,
        };
      }

      case 'SAVE_CATEGORY': {
        const p = rawPayload as ProtocolRequestMap['SAVE_CATEGORY']['req'];
        const outcome = saveCategory(this.db, p);
        if (!outcome.ok) return outcome;
        return {
          ok: true,
          data: outcome.data as ProtocolRequestMap[A]['res'],
          summary: `Lưu loại thực phẩm "${outcome.data.category_name}"`,
          mutated: true,
          pushEvents: [push('CATALOGS_UPDATED', `Cập nhật loại "${outcome.data.category_name}"`)],
        };
      }

      case 'DELETE_CATEGORY': {
        const p = rawPayload as ProtocolRequestMap['DELETE_CATEGORY']['req'];
        const outcome = deleteCategory(this.db, p.category_id);
        if (!outcome.ok) return outcome;
        return {
          ok: true,
          data: outcome.data as ProtocolRequestMap[A]['res'],
          summary: `Xóa loại thực phẩm #${p.category_id}`,
          mutated: true,
          pushEvents: [push('CATALOGS_UPDATED', 'Đã xóa một loại thực phẩm')],
        };
      }

      case 'SAVE_UNIT': {
        const p = rawPayload as ProtocolRequestMap['SAVE_UNIT']['req'];
        const outcome = saveUnit(this.db, p);
        if (!outcome.ok) return outcome;
        return {
          ok: true,
          data: outcome.data as ProtocolRequestMap[A]['res'],
          summary: `Lưu đơn vị tính "${outcome.data.unit_name}"`,
          mutated: true,
          pushEvents: [push('CATALOGS_UPDATED', `Cập nhật đơn vị "${outcome.data.unit_name}"`)],
        };
      }

      case 'DELETE_UNIT': {
        const p = rawPayload as ProtocolRequestMap['DELETE_UNIT']['req'];
        const outcome = deleteUnit(this.db, p.unit_id);
        if (!outcome.ok) return outcome;
        return {
          ok: true,
          data: outcome.data as ProtocolRequestMap[A]['res'],
          summary: `Xóa đơn vị tính #${p.unit_id}`,
          mutated: true,
          pushEvents: [push('CATALOGS_UPDATED', 'Đã xóa một đơn vị tính')],
        };
      }

      case 'SAVE_LOCATION': {
        const p = rawPayload as ProtocolRequestMap['SAVE_LOCATION']['req'];
        const outcome = saveLocation(this.db, p);
        if (!outcome.ok) return outcome;
        return {
          ok: true,
          data: outcome.data as ProtocolRequestMap[A]['res'],
          summary: `Lưu vị trí "${outcome.data.area_type} · ${outcome.data.location_name}"`,
          mutated: true,
          pushEvents: [push('CATALOGS_UPDATED', `Cập nhật vị trí "${outcome.data.location_name}"`)],
        };
      }

      case 'DELETE_LOCATION': {
        const p = rawPayload as ProtocolRequestMap['DELETE_LOCATION']['req'];
        const outcome = deleteLocation(this.db, p.location_id);
        if (!outcome.ok) return outcome;
        return {
          ok: true,
          data: outcome.data as ProtocolRequestMap[A]['res'],
          summary: `Xóa vị trí #${p.location_id}`,
          mutated: true,
          pushEvents: [push('CATALOGS_UPDATED', 'Đã xóa một vị trí bảo quản')],
        };
      }

      case 'SAVE_RECIPE': {
        const p = rawPayload as ProtocolRequestMap['SAVE_RECIPE']['req'];
        const outcome = saveRecipe(this.db, p);
        if (!outcome.ok) return outcome;
        return {
          ok: true,
          data: outcome.data as ProtocolRequestMap[A]['res'],
          summary: `Lưu công thức món "${outcome.data.recipe_name}"`,
          mutated: true,
          pushEvents: [push('CATALOGS_UPDATED', `Cập nhật công thức "${outcome.data.recipe_name}"`)],
        };
      }

      case 'DELETE_RECIPE': {
        const p = rawPayload as ProtocolRequestMap['DELETE_RECIPE']['req'];
        const outcome = deleteRecipe(this.db, p.recipe_id);
        if (!outcome.ok) return outcome;
        return {
          ok: true,
          data: outcome.data as ProtocolRequestMap[A]['res'],
          summary: `Xóa công thức #${p.recipe_id}`,
          mutated: true,
          pushEvents: [push('CATALOGS_UPDATED', 'Đã xóa một công thức món ăn')],
        };
      }

      case 'UPDATE_SYSTEM_CONFIG': {
        const p = rawPayload as Partial<SystemConfig>;
        const outcome = updateSystemConfig(this.db, p);
        if (!outcome.ok) return outcome;
        return {
          ok: true,
          data: outcome.data as ProtocolRequestMap[A]['res'],
          summary: `Cập nhật cấu hình hệ thống (ngưỡng ${outcome.data.warning_days_threshold}d, ngày ${resolveEffectiveDate(outcome.data)})`,
          mutated: true,
          pushEvents: [
            push('SETTINGS_UPDATED', 'Đã cập nhật cấu hình ngưỡng cảnh báo & FEFO'),
            push('ALERTS_UPDATED', 'Tính lại cảnh báo theo cấu hình mới'),
          ],
        };
      }

      case 'SHIFT_SIMULATED_DATE': {
        const p = rawPayload as ProtocolRequestMap['SHIFT_SIMULATED_DATE']['req'];
        const outcome = shiftSimulatedDate(this.db, p);
        if (!outcome.ok) return outcome;
        const effDate = resolveEffectiveDate(outcome.data);
        return {
          ok: true,
          data: outcome.data as ProtocolRequestMap[A]['res'],
          summary: `Mô phỏng thời gian → Ngày hệ thống ${effDate}`,
          mutated: true,
          pushEvents: [
            push('SIMULATION_DATE_CHANGED', `Ngày hệ thống chuyển sang ${effDate}`),
            push('ALERTS_UPDATED', `Tính lại FEFO & Cảnh báo theo mốc ${effDate}`),
          ],
        };
      }
    }
  }
}

let sharedDesktopServerNode: SimulatedServerNode | null = null;

export function getSharedDesktopServerNode(): SimulatedServerNode {
  if (!sharedDesktopServerNode) {
    sharedDesktopServerNode = new SimulatedServerNode({
      persistToStorage: true,
      enableBroadcastChannel: true,
    });
  }
  return sharedDesktopServerNode;
}
