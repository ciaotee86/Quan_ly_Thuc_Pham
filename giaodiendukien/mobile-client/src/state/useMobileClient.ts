import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_SIMULATED_DATE,
  DEFAULT_SYSTEM_CONFIG,
  filterFoodLotViews,
  getSharedMobileClientTransport,
  shiftIsoDate,
  type AiScanPreset,
  type AiScanResult,
  type AlertsSummary,
  type AnalyticsSnapshot,
  type AreaType,
  type CatalogBundle,
  type ClientTransportSnapshot,
  type CookRecipeResult,
  type CreateFoodItemResult,
  type FaultInjectionMode,
  type FefoListResult,
  type FefoPriorityLevel,
  type FoodFormInput,
  type FoodLotView,
  type FoodSearchFilter,
  type GetAuditLogsResult,
  type HandshakeResult,
  type InventoryTransactionView,
  type ItemDetailResult,
  type RecipeMatchSuggestion,
  type SavedServerEndpoint,
  type ServerPushEvent,
  type ServerResponse,
  type StockMutationResult,
  type SystemConfig,
  type TransactionActionType,
} from '@food-mgmt/shared-sim';
import {
  buildNextFoodCodeSuggestion,
  type MobileScreenId,
} from '../domain/food-lot-presentation';

export interface FoodFormValues {
  food_code: string;
  food_name: string;
  category_id: number;
  brand: string;
  description: string;
  image_url: string;
  area_type: AreaType;
  location_id: number;
  unit_id: number;
  quantity: string;
  min_threshold: string;
  import_date: string;
  expiry_date: string;
  note: string;
}

export interface FoodFormDraftState {
  sessionId: number;
  mode: 'create' | 'edit';
  editItemId?: number;
  editFoodId?: number;
  mergeIntoFoodId?: number;
  mergeTargetName?: string;
  aiSourceLabel: string | null;
  aiFilledFields: string[];
  values: FoodFormValues;
}

export interface StockActionTarget {
  item: {
    item_id: number;
    food_name: string;
    current_quantity: number;
    unit_name: string;
    expiry_date: string;
    min_threshold: number;
    status: FoodLotView['status'];
  };
  initialMode: 'use' | 'restock' | 'adjust';
  initialQuantity?: number;
  defaultReason?: string;
}

export interface LiquidateTarget {
  item_id: number;
  food_name: string;
  current_quantity: number;
  unit_name: string;
  expiry_date: string;
  defaultReason?: string;
}

export interface MoveLocationTarget {
  item_id: number;
  food_name: string;
  area_type: AreaType;
  location_id: number;
  location_name: string;
  status: FoodLotView['status'];
}

export type AiScanOrigin = 'fab' | 'form';

const EMPTY_CATALOGS: CatalogBundle = {
  categories: [],
  units: [],
  storage_locations: [],
  recipes: [],
};

const DEFAULT_INVENTORY_FILTER: FoodSearchFilter = {
  keyword: '',
  category_id: 'all',
  area_type: 'all',
  location_id: 'all',
  stock_status: 'all',
  expiry_status: 'all',
  sort_by: 'expiry_date',
  sort_dir: 'asc',
};

function createBlankDraft(
  catalogs: CatalogBundle,
  effectiveDate: string,
  systemConfig: SystemConfig,
  existingCodes: string[],
  options?: {
    mergeIntoFoodId?: number;
    mergeTargetName?: string;
    prefillCode?: string;
    prefillCategoryId?: number;
    prefillUnitId?: number;
    prefillBrand?: string;
    prefillDescription?: string;
    prefillMinThreshold?: number;
  },
): FoodFormDraftState {
  const defaultLoc =
    catalogs.storage_locations.find((l) => l.area_type === 'Trong tủ lạnh') ??
    catalogs.storage_locations[0];
  const defaultCategory = catalogs.categories[0];
  const defaultUnit = catalogs.units[0];

  return {
    sessionId: Date.now(),
    mode: 'create',
    mergeIntoFoodId: options?.mergeIntoFoodId,
    mergeTargetName: options?.mergeTargetName,
    aiSourceLabel: null,
    aiFilledFields: [],
    values: {
      food_code: options?.prefillCode ?? buildNextFoodCodeSuggestion(existingCodes),
      food_name: options?.mergeTargetName ?? '',
      category_id: options?.prefillCategoryId ?? defaultCategory?.category_id ?? 1,
      brand: options?.prefillBrand ?? '',
      description: options?.prefillDescription ?? '',
      image_url: '',
      area_type: defaultLoc?.area_type ?? 'Trong tủ lạnh',
      location_id: defaultLoc?.location_id ?? 1,
      unit_id: options?.prefillUnitId ?? defaultUnit?.unit_id ?? 1,
      quantity: '1',
      min_threshold: String(options?.prefillMinThreshold ?? systemConfig.min_quantity_default ?? 1),
      import_date: effectiveDate,
      expiry_date: shiftIsoDate(effectiveDate, 5),
      note: '',
    },
  };
}

interface RefreshAllDataOptions {
  silent?: boolean;
  overrideInventoryFilter?: FoodSearchFilter;
  overrideStatsRange?: 7 | 30;
  overrideAuditFilter?: TransactionActionType | 'all';
  overrideFefoArea?: AreaType | 'all';
  overrideFefoPriority?: FefoPriorityLevel | 'all';
  overrideFocusItemId?: number;
  refreshHandshake?: boolean;
  source?: 'manual' | 'push' | 'mutation' | 'init';
}

function isUnfilteredFoodSearch(filter: FoodSearchFilter): boolean {
  return (
    !filter.keyword?.trim() &&
    (!filter.category_id || filter.category_id === 'all') &&
    (!filter.area_type || filter.area_type === 'all') &&
    (!filter.location_id || filter.location_id === 'all') &&
    (!filter.stock_status || filter.stock_status === 'all') &&
    (!filter.expiry_status || filter.expiry_status === 'all')
  );
}

function buildAuditLogsResult(
  transactions: InventoryTransactionView[],
  actionType: TransactionActionType | 'all',
): GetAuditLogsResult {
  const filtered =
    actionType === 'all'
      ? [...transactions]
      : transactions.filter((row) => row.action_type === actionType);

  filtered.sort((a, b) => {
    const dateCmp = b.transaction_date.localeCompare(a.transaction_date);
    if (dateCmp !== 0) return dateCmp;
    return b.transaction_id - a.transaction_id;
  });

  let restockTotal = 0;
  let useTotal = 0;
  let wasteTotal = 0;
  let adjustCount = 0;

  for (const row of filtered) {
    const qty = Math.abs(row.change_quantity);
    if (row.action_type === 'Nhập thêm') {
      restockTotal = Math.round((restockTotal + qty) * 100) / 100;
    } else if (row.action_type === 'Sử dụng') {
      useTotal = Math.round((useTotal + qty) * 100) / 100;
    } else if (row.action_type === 'Vứt hủy') {
      wasteTotal = Math.round((wasteTotal + qty) * 100) / 100;
    } else if (row.action_type === 'Điều chỉnh') {
      adjustCount += 1;
    }
  }

  return {
    transactions: filtered,
    summary: {
      total_count: filtered.length,
      restock_total: restockTotal,
      use_total: useTotal,
      waste_total: wasteTotal,
      adjust_count: adjustCount,
    },
  };
}

export function useMobileClient() {
  const transport = useMemo(() => getSharedMobileClientTransport(), []);
  const [snapshot, setSnapshot] = useState<ClientTransportSnapshot>(() => transport.getSnapshot());
  const [hasEnteredShell, setHasEnteredShell] = useState<boolean>(
    () => transport.getSnapshot().connection_state === 'CONNECTED',
  );
  const [screenStack, setScreenStack] = useState<MobileScreenId[]>(() =>
    transport.getSnapshot().connection_state === 'CONNECTED' ? ['MOB-01'] : ['MOB-00'],
  );

  // Screen-scoped navigation parameters
  const [detailItemId, setDetailItemId] = useState<number | null>(null);
  const [recipesFocusItemId, setRecipesFocusItemId] = useState<number | undefined>(undefined);

  // Domain datasets synced from server or cache
  const [fefoResult, setFefoResult] = useState<FefoListResult | null>(null);
  const [fefoAreaFilter, setFefoAreaFilter] = useState<AreaType | 'all'>('all');
  const [fefoPriorityFilter, setFefoPriorityFilter] = useState<FefoPriorityLevel | 'all'>('all');

  const [allInventoryItems, setAllInventoryItems] = useState<FoodLotView[]>(
    () => transport.getSnapshot().cache.inventory_items,
  );
  const [inventoryItems, setInventoryItems] = useState<FoodLotView[]>(
    () => transport.getSnapshot().cache.inventory_items,
  );
  const [inventoryFilter, setInventoryFilter] = useState<FoodSearchFilter>(DEFAULT_INVENTORY_FILTER);
  const [recipes, setRecipes] = useState<RecipeMatchSuggestion[]>(
    () => transport.getSnapshot().cache.recipes,
  );
  const [alerts, setAlerts] = useState<AlertsSummary | null>(
    () => transport.getSnapshot().cache.alerts,
  );
  const [aiPresets, setAiPresets] = useState<AiScanPreset[]>(
    () => transport.getSnapshot().cache.ai_scan_presets ?? [],
  );
  const [statsRange, setStatsRange] = useState<7 | 30>(7);
  const [stats, setStats] = useState<AnalyticsSnapshot | null>(
    () => transport.getSnapshot().cache.stats,
  );
  const [auditActionFilter, setAuditActionFilter] = useState<TransactionActionType | 'all'>('all');
  const [allAuditTransactions, setAllAuditTransactions] = useState<InventoryTransactionView[]>(
    () => transport.getSnapshot().cache.audit_logs,
  );
  const [serverAuditLogs, setServerAuditLogs] = useState<GetAuditLogsResult | null>(() => {
    const cached = transport.getSnapshot().cache.audit_logs;
    return cached.length > 0 ? buildAuditLogsResult(cached, 'all') : null;
  });
  const [selectedItemDetail, setSelectedItemDetail] = useState<ItemDetailResult | null>(null);
  const [itemDetailError, setItemDetailError] = useState<string | null>(null);

  // Loading & error UI indicators
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Active modals & bottom sheets
  const [stockSheetTarget, setStockSheetTarget] = useState<StockActionTarget | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [moveSheetTarget, setMoveSheetTarget] = useState<MoveLocationTarget | null>(null);
  const [aiScanState, setAiScanState] = useState<{ open: boolean; origin: AiScanOrigin }>({
    open: false,
    origin: 'fab',
  });
  const [liquidateTarget, setLiquidateTarget] = useState<LiquidateTarget | null>(null);

  // Preserved form draft for MOB-06 (never lost on network drop/timeout)
  const [foodFormDraft, setFoodFormDraft] = useState<FoodFormDraftState | null>(null);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshPromiseRef = useRef<Promise<boolean> | null>(null);
  const refreshDirtyRef = useRef(false);
  const refreshPendingOptionsRef = useRef<RefreshAllDataOptions | null>(null);
  const batchDispatchedRef = useRef(false);
  const pushEpochRef = useRef(0);
  const lastDispatchedPushEpochRef = useRef(0);
  const mutationSeqRef = useRef(0);
  const currentScreen = screenStack[screenStack.length - 1] ?? 'MOB-00';

  const latestStateRef = useRef({
    inventoryFilter,
    statsRange,
    auditActionFilter,
    fefoAreaFilter,
    fefoPriorityFilter,
    recipesFocusItemId,
    detailItemId,
    currentScreen,
  });
  latestStateRef.current = {
    inventoryFilter,
    statsRange,
    auditActionFilter,
    fefoAreaFilter,
    fefoPriorityFilter,
    recipesFocusItemId,
    detailItemId,
    currentScreen,
  };

  const systemConfig: SystemConfig = snapshot.cache.system_config ?? DEFAULT_SYSTEM_CONFIG;
  const effectiveDate =
    snapshot.cache.effective_date ?? systemConfig.simulated_date ?? DEFAULT_SIMULATED_DATE;
  const catalogs: CatalogBundle = snapshot.cache.catalogs ?? EMPTY_CATALOGS;

  const isConnected =
    snapshot.connection_state === 'CONNECTED' && !snapshot.simulated_network_offline;
  const isOfflineReadOnly = !isConnected;

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3400);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastMessage(null);
  }, []);

  // Subscribe to transport snapshots
  useEffect(() => {
    const unsubscribe = transport.subscribe((nextSnap) => {
      setSnapshot(nextSnap);
    });
    return () => {
      unsubscribe();
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, [transport]);

  const loadItemDetail = useCallback(
    async (itemId: number) => {
      setItemDetailError(null);
      const res = await transport.request('GET_ITEM_DETAIL', { item_id: itemId });
      if (res.ok) {
        setSelectedItemDetail(res.data);
        setItemDetailError(null);
      } else {
        // Fallback to cached lot if offline
        const cachedLot = transport
          .getSnapshot()
          .cache.inventory_items.find((lot) => lot.item_id === itemId);
        if (cachedLot && res.error.code !== 'NOT_FOUND') {
          setSelectedItemDetail({
            item: cachedLot,
            transactions: [],
            matching_recipes: [],
          });
          setItemDetailError(null);
        } else {
          setSelectedItemDetail(null);
          setItemDetailError(res.error.message);
        }
      }
    },
    [transport],
  );

  const refreshAllData = useCallback(
    async (options?: RefreshAllDataOptions): Promise<boolean> => {
      const initialSnap = transport.getSnapshot();
      if (initialSnap.connection_state !== 'CONNECTED' || initialSnap.simulated_network_offline) {
        if (!options?.silent) {
          showToast('Đang mất kết nối — vui lòng kiểm tra hoặc kết nối lại tại MOB-00.');
        }
        return false;
      }

      const mergeOptions = (incoming?: RefreshAllDataOptions) => {
        if (!incoming) return;
        const prev = refreshPendingOptionsRef.current ?? {};
        refreshPendingOptionsRef.current = {
          silent:
            incoming.silent === false || prev.silent === false
              ? false
              : incoming.silent ?? prev.silent,
          refreshHandshake: Boolean(incoming.refreshHandshake || prev.refreshHandshake),
          overrideInventoryFilter: incoming.overrideInventoryFilter ?? prev.overrideInventoryFilter,
          overrideStatsRange: incoming.overrideStatsRange ?? prev.overrideStatsRange,
          overrideAuditFilter: incoming.overrideAuditFilter ?? prev.overrideAuditFilter,
          overrideFefoArea: incoming.overrideFefoArea ?? prev.overrideFefoArea,
          overrideFefoPriority: incoming.overrideFefoPriority ?? prev.overrideFefoPriority,
          overrideFocusItemId: incoming.overrideFocusItemId ?? prev.overrideFocusItemId,
          source: incoming.source ?? prev.source,
        };
      };

      mergeOptions(options);

      if (refreshPromiseRef.current) {
        if (batchDispatchedRef.current) {
          refreshDirtyRef.current = true;
        }
        return refreshPromiseRef.current;
      }

      const runPromise = (async (): Promise<boolean> => {
        let lastOk = false;
        try {
          do {
            refreshDirtyRef.current = false;
            batchDispatchedRef.current = false;

            // Yield a microtask so synchronous same-turn push bursts coalesce into one 7-RPC batch
            await Promise.resolve();

            const snap = transport.getSnapshot();
            if (snap.connection_state !== 'CONNECTED' || snap.simulated_network_offline) {
              return false;
            }

            const runOpts = refreshPendingOptionsRef.current ?? {};
            refreshPendingOptionsRef.current = null;

            if (!runOpts.silent) {
              setIsSyncing(true);
            }
            setInventoryError(null);

            batchDispatchedRef.current = true;
            lastDispatchedPushEpochRef.current = pushEpochRef.current;

            if (runOpts.refreshHandshake) {
              await transport.connect({
                ip: snap.active_endpoint.ip,
                port: snap.active_endpoint.port,
                pairing_pin: snap.active_endpoint.pairing_pin,
              });
            }

            const latest = latestStateRef.current;
            const activeInvFilter = runOpts.overrideInventoryFilter ?? latest.inventoryFilter;
            const activeStatsRange = runOpts.overrideStatsRange ?? latest.statsRange;
            const activeAuditFilter = runOpts.overrideAuditFilter ?? latest.auditActionFilter;
            const activeFefoArea = runOpts.overrideFefoArea ?? latest.fefoAreaFilter;
            const activeFefoPriority = runOpts.overrideFefoPriority ?? latest.fefoPriorityFilter;
            const activeFocusItem = runOpts.overrideFocusItemId ?? latest.recipesFocusItemId;

            const [
              fefoRes,
              invRes,
              recipesRes,
              alertsRes,
              statsRes,
              logsRes,
              catalogsRes,
              aiPresetsRes,
            ] = await Promise.all([
              transport.request('GET_FEFO_LIST', {
                area_type: activeFefoArea,
                priority_level: activeFefoPriority,
              }),
              transport.request('SEARCH_FOOD_ITEMS', undefined),
              transport.request(
                'GET_RECIPES',
                activeFocusItem !== undefined ? { focus_item_id: activeFocusItem } : undefined,
              ),
              transport.request('GET_ALERTS', { trigger_scan: true }),
              transport.request('GET_STATS', { range_days: activeStatsRange }),
              transport.request('GET_AUDIT_LOGS', { action_type: 'all' }),
              transport.request('GET_CATALOGS', undefined),
              transport.request('GET_AI_SCAN_PRESETS', {}),
            ]);

            const postSnap = transport.getSnapshot();
            const warningDays =
              postSnap.cache.system_config?.warning_days_threshold ??
              DEFAULT_SYSTEM_CONFIG.warning_days_threshold;

            if (fefoRes.ok) {
              setFefoResult(fefoRes.data);
            }
            if (invRes.ok) {
              setAllInventoryItems(invRes.data.items);
              setInventoryItems(
                filterFoodLotViews(invRes.data.items, activeInvFilter, warningDays),
              );
              setInventoryError(null);
            } else {
              setInventoryError(invRes.error.message);
            }
            if (recipesRes.ok) {
              setRecipes(recipesRes.data);
            }
            if (alertsRes.ok) {
              setAlerts(alertsRes.data);
            }
            if (statsRes.ok) {
              setStats(statsRes.data);
            }
            if (logsRes.ok) {
              setAllAuditTransactions(logsRes.data.transactions);
              setServerAuditLogs(
                activeAuditFilter === 'all'
                  ? logsRes.data
                  : buildAuditLogsResult(logsRes.data.transactions, activeAuditFilter),
              );
            }
            if (catalogsRes.ok) {
              // Cache updated internally by transport
            }
            if (aiPresetsRes.ok) {
              setAiPresets(aiPresetsRes.data);
            }

            if (latest.detailItemId !== null && latest.currentScreen === 'MOB-03') {
              await loadItemDetail(latest.detailItemId);
            }

            lastOk = fefoRes.ok || invRes.ok;
          } while (refreshDirtyRef.current);

          return lastOk;
        } finally {
          batchDispatchedRef.current = false;
          refreshDirtyRef.current = false;
          refreshPendingOptionsRef.current = null;
          refreshPromiseRef.current = null;
          setIsSyncing(false);
          setIsInitialLoading(false);
        }
      })();

      refreshPromiseRef.current = runPromise;
      return runPromise;
    },
    [loadItemDetail, showToast, transport],
  );

  const refreshAfterMutation = useCallback(
    async (pushBefore: number) => {
      if (pushEpochRef.current > pushBefore) {
        if (refreshPromiseRef.current) {
          await refreshPromiseRef.current;
          return;
        }
        if (lastDispatchedPushEpochRef.current > pushBefore) {
          return;
        }
      }
      mutationSeqRef.current += 1;
      await refreshAllData({ silent: true, source: 'mutation' });
    },
    [refreshAllData],
  );

  // Subscribe to Server Push events (INVENTORY_CHANGED, ALERTS_UPDATED, SETTINGS_UPDATED, etc.)
  useEffect(() => {
    const unsubscribePush = transport.subscribePush((event: ServerPushEvent) => {
      pushEpochRef.current += 1;
      if (
        event.type === 'INVENTORY_CHANGED' ||
        event.type === 'ALERTS_UPDATED' ||
        event.type === 'CATALOGS_UPDATED'
      ) {
        void refreshAllData({ silent: true, source: 'push' });
      } else if (event.type === 'SETTINGS_UPDATED' || event.type === 'SIMULATION_DATE_CHANGED') {
        void refreshAllData({ silent: true, refreshHandshake: false, source: 'push' });
        showToast(event.summary);
      } else if (event.type === 'CLIENT_DISCONNECTED' || event.type === 'SERVER_STATUS_CHANGED') {
        showToast(event.summary);
      }
    });
    return unsubscribePush;
  }, [refreshAllData, showToast, transport]);

  // Initial fetch if mounted already connected
  useEffect(() => {
    if (transport.getSnapshot().connection_state === 'CONNECTED') {
      setIsInitialLoading(true);
      void refreshAllData({ silent: true, source: 'init' });
    }
    // Run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Navigation helpers
  const navigateToTab = useCallback((tab: 'MOB-01' | 'MOB-02' | 'MOB-05' | 'MOB-07') => {
    setScreenStack([tab]);
  }, []);

  const navigateBack = useCallback(() => {
    setScreenStack((prev) => {
      if (prev.length <= 1) return prev;
      return prev.slice(0, -1);
    });
  }, []);

  const openItemDetail = useCallback(
    (itemId: number) => {
      setDetailItemId(itemId);
      setSelectedItemDetail(null);
      setItemDetailError(null);
      setScreenStack((prev) => [...prev, 'MOB-03']);
      void loadItemDetail(itemId);
    },
    [loadItemDetail],
  );

  const openRecipesScreen = useCallback(
    async (focusItemId?: number) => {
      setRecipesFocusItemId(focusItemId);
      setScreenStack((prev) => [...prev, 'MOB-04']);
      const snap = transport.getSnapshot();
      if (snap.connection_state === 'CONNECTED' && !snap.simulated_network_offline) {
        const res = await transport.request(
          'GET_RECIPES',
          focusItemId !== undefined ? { focus_item_id: focusItemId } : undefined,
        );
        if (res.ok) {
          setRecipes(res.data);
        }
      }
    },
    [transport],
  );

  const openConnectScreen = useCallback(() => {
    setScreenStack((prev) => [...prev, 'MOB-00']);
  }, []);

  // Connection & Network actions
  const connectToServer = useCallback(
    async (
      params: Partial<SavedServerEndpoint> & { device_name?: string },
    ): Promise<ServerResponse<HandshakeResult>> => {
      const res = await transport.connect(params);
      if (res.ok) {
        setHasEnteredShell(true);
        setScreenStack(['MOB-01']);
        setIsInitialLoading(true);
        await refreshAllData({ silent: true, source: 'init' });
        showToast(`Đã kết nối tới ${res.data.server_ip}:${res.data.server_port} (${res.latency_ms}ms)`);
      }
      return res;
    },
    [refreshAllData, showToast, transport],
  );

  const retryConnection = useCallback(async () => {
    const snap = transport.getSnapshot();
    const res = await transport.connect({
      ip: snap.active_endpoint.ip,
      port: snap.active_endpoint.port,
      pairing_pin: snap.active_endpoint.pairing_pin,
    });
    if (res.ok) {
      await refreshAllData({ silent: false, source: 'manual' });
      showToast('Đã khôi phục kết nối tới Desktop Server.');
    } else {
      showToast(res.error.message);
    }
    return res;
  }, [refreshAllData, showToast, transport]);

  const enterOfflineMode = useCallback(() => {
    setHasEnteredShell(true);
    const snap = transport.getSnapshot();
    if (snap.cache.fefo_items.length > 0 && !fefoResult) {
      setFefoResult({
        reference_date: snap.cache.effective_date ?? effectiveDate,
        items: snap.cache.fefo_items,
        counts_by_priority: {
          Cao: snap.cache.fefo_items.filter((i) => i.priority_level === 'Cao').length,
          'Trung bình': snap.cache.fefo_items.filter((i) => i.priority_level === 'Trung bình').length,
          Thấp: snap.cache.fefo_items.filter((i) => i.priority_level === 'Thấp').length,
        },
        expired_excluded_count: snap.cache.alerts?.expired_items.length ?? 0,
      });
    }
    if (snap.cache.inventory_items.length > 0) {
      setAllInventoryItems((prev) => (prev.length > 0 ? prev : snap.cache.inventory_items));
      setInventoryItems((prev) => (prev.length > 0 ? prev : snap.cache.inventory_items));
    }
    if (snap.cache.audit_logs.length > 0) {
      setAllAuditTransactions((prev) => (prev.length > 0 ? prev : snap.cache.audit_logs));
      setServerAuditLogs(
        (prev) => prev ?? buildAuditLogsResult(snap.cache.audit_logs, auditActionFilter),
      );
    }
    if (snap.cache.ai_scan_presets?.length) {
      setAiPresets((prev) => (prev.length > 0 ? prev : snap.cache.ai_scan_presets));
    }
    setScreenStack(['MOB-01']);
  }, [auditActionFilter, effectiveDate, fefoResult, transport]);

  const disconnectFromServer = useCallback(() => {
    transport.disconnect();
    showToast('Đã ngắt kết nối khỏi Desktop Server.');
  }, [showToast, transport]);

  const toggleSimulatedOffline = useCallback(
    (offline: boolean) => {
      transport.setSimulatedNetworkOffline(offline);
      if (offline) {
        showToast('Đã bật mô phỏng mất Wi-Fi / Offline Chỉ xem.');
      } else {
        showToast('Đã khôi phục mạng LAN mô phỏng — bấm Thử lại hoặc Đồng bộ để kết nối lại.');
      }
    },
    [showToast, transport],
  );

  const setClientFaultOverride = useCallback(
    (mode: FaultInjectionMode) => {
      transport.setClientFaultOverride(mode);
      if (mode === 'NONE') {
        showToast('Đã xóa giả lập lỗi kế tiếp.');
      } else {
        showToast(`Đã cài giả lập lỗi "${mode}" cho yêu cầu tiếp theo.`);
      }
    },
    [showToast, transport],
  );

  // Filter updates
  const applyFefoFilter = useCallback(
    async (area: AreaType | 'all', priority: FefoPriorityLevel | 'all') => {
      setFefoAreaFilter(area);
      setFefoPriorityFilter(priority);
      const snap = transport.getSnapshot();
      if (snap.connection_state === 'CONNECTED' && !snap.simulated_network_offline) {
        const res = await transport.request('GET_FEFO_LIST', {
          area_type: area,
          priority_level: priority,
        });
        if (res.ok) {
          setFefoResult(res.data);
        }
      }
    },
    [transport],
  );

  const applyInventoryFilter = useCallback(
    async (nextFilter: FoodSearchFilter) => {
      setInventoryFilter(nextFilter);
      const snap = transport.getSnapshot();
      if (snap.connection_state === 'CONNECTED' && !snap.simulated_network_offline) {
        const res = await transport.request('SEARCH_FOOD_ITEMS', nextFilter);
        if (res.ok) {
          setInventoryItems(res.data.items);
          if (isUnfilteredFoodSearch(nextFilter)) {
            setAllInventoryItems(res.data.items);
          }
          setInventoryError(null);
        } else {
          setInventoryError(res.error.message);
        }
      }
    },
    [transport],
  );

  const changeStatsRange = useCallback(
    async (range: 7 | 30) => {
      setStatsRange(range);
      const snap = transport.getSnapshot();
      if (snap.connection_state === 'CONNECTED' && !snap.simulated_network_offline) {
        const res = await transport.request('GET_STATS', { range_days: range });
        if (res.ok) {
          setStats(res.data);
        }
      }
    },
    [transport],
  );

  const changeAuditFilter = useCallback(
    async (actionType: TransactionActionType | 'all') => {
      setAuditActionFilter(actionType);
      const snap = transport.getSnapshot();
      if (snap.connection_state === 'CONNECTED' && !snap.simulated_network_offline) {
        const res = await transport.request('GET_AUDIT_LOGS', { action_type: 'all' });
        if (res.ok) {
          setAllAuditTransactions(res.data.transactions);
          setServerAuditLogs(buildAuditLogsResult(res.data.transactions, actionType));
        }
      } else if (snap.cache.audit_logs.length > 0 || allAuditTransactions.length > 0) {
        const source =
          snap.cache.audit_logs.length > 0 ? snap.cache.audit_logs : allAuditTransactions;
        setServerAuditLogs(buildAuditLogsResult(source, actionType));
      }
    },
    [allAuditTransactions, transport],
  );

  // Stock mutations (MOB-S01, MOB-S03, MOB-S05, MOB-04)
  const submitUseFood = useCallback(
    async (
      itemId: number,
      quantityUsed: number,
      reason: string,
      expectedQty?: number,
    ): Promise<ServerResponse<StockMutationResult>> => {
      const pushBefore = pushEpochRef.current;
      const res = await transport.request('USE_FOOD', {
        item_id: itemId,
        quantity_used: quantityUsed,
        reason,
        actor_device: snapshot.device_name,
        expected_current_quantity: expectedQty,
      });
      if (res.ok) {
        setAlerts(res.data.alerts_summary);
        await refreshAfterMutation(pushBefore);
        showToast(
          `Đã xuất dùng ${quantityUsed} ${res.data.item.unit_name} ${res.data.item.food_name}`,
        );
      } else if (
        res.error.code === 'CONFLICT_STALE_STOCK' ||
        res.error.latest_quantity !== undefined
      ) {
        // Sync latest server quantity honestly without optimistic lies
        await refreshAfterMutation(pushBefore);
      }
      return res;
    },
    [refreshAfterMutation, showToast, snapshot.device_name, transport],
  );

  const submitRestockFood = useCallback(
    async (
      itemId: number,
      quantityAdded: number,
      reason: string,
    ): Promise<ServerResponse<StockMutationResult>> => {
      const pushBefore = pushEpochRef.current;
      const res = await transport.request('RESTOCK_FOOD', {
        item_id: itemId,
        quantity_added: quantityAdded,
        reason,
        actor_device: snapshot.device_name,
      });
      if (res.ok) {
        setAlerts(res.data.alerts_summary);
        await refreshAfterMutation(pushBefore);
        showToast(
          `Đã nhập thêm +${quantityAdded} ${res.data.item.unit_name} ${res.data.item.food_name}`,
        );
      }
      return res;
    },
    [refreshAfterMutation, showToast, snapshot.device_name, transport],
  );

  const submitAdjustFood = useCallback(
    async (
      itemId: number,
      newQuantity: number,
      reason: string,
    ): Promise<ServerResponse<StockMutationResult>> => {
      const pushBefore = pushEpochRef.current;
      const res = await transport.request('ADJUST_FOOD', {
        item_id: itemId,
        new_quantity: newQuantity,
        reason,
        actor_device: snapshot.device_name,
      });
      if (res.ok) {
        setAlerts(res.data.alerts_summary);
        await refreshAfterMutation(pushBefore);
        showToast(
          `Đã kiểm kê ${res.data.item.food_name}: còn ${newQuantity} ${res.data.item.unit_name}`,
        );
      }
      return res;
    },
    [refreshAfterMutation, showToast, snapshot.device_name, transport],
  );

  const submitMoveLocation = useCallback(
    async (
      itemId: number,
      newLocationId: number,
      reason?: string,
    ): Promise<ServerResponse<StockMutationResult>> => {
      const pushBefore = pushEpochRef.current;
      const res = await transport.request('MOVE_LOCATION', {
        item_id: itemId,
        new_location_id: newLocationId,
        reason,
        actor_device: snapshot.device_name,
      });
      if (res.ok) {
        setAlerts(res.data.alerts_summary);
        await refreshAfterMutation(pushBefore);
        showToast(`Đã chuyển ${res.data.item.food_name} tới ${res.data.item.location_name}`);
      }
      return res;
    },
    [refreshAfterMutation, showToast, snapshot.device_name, transport],
  );

  const submitCancelFoodItem = useCallback(
    async (itemId: number, reason: string): Promise<ServerResponse<StockMutationResult>> => {
      const pushBefore = pushEpochRef.current;
      const res = await transport.request('CANCEL_FOOD_ITEM', {
        item_id: itemId,
        reason,
        actor_device: snapshot.device_name,
      });
      if (res.ok) {
        setAlerts(res.data.alerts_summary);
        await refreshAfterMutation(pushBefore);
        showToast(`Đã thanh lý "${res.data.item.food_name}" (trạng thái Đã hủy)`);
      }
      return res;
    },
    [refreshAfterMutation, showToast, snapshot.device_name, transport],
  );

  const submitCookRecipe = useCallback(
    async (recipeId: number): Promise<ServerResponse<CookRecipeResult>> => {
      const pushBefore = pushEpochRef.current;
      const res = await transport.request('COOK_RECIPE', {
        recipe_id: recipeId,
        actor_device: snapshot.device_name,
      });
      if (res.ok) {
        await refreshAfterMutation(pushBefore);
        const { recipe_name, deducted_count, skipped_missing } = res.data;
        showToast(
          skipped_missing > 0
            ? `Đã nấu "${recipe_name}" — trừ ${deducted_count} nguyên liệu sẵn có (${skipped_missing} món thiếu chưa trừ).`
            : `Đã nấu "${recipe_name}" — đã trừ đủ ${deducted_count} nguyên liệu trong kho.`,
        );
      } else if (
        res.error.code === 'CONFLICT_STALE_STOCK' ||
        res.error.latest_quantity !== undefined
      ) {
        await refreshAfterMutation(pushBefore);
      }
      return res;
    },
    [refreshAfterMutation, showToast, snapshot.device_name, transport],
  );

  // AI Scan (MOB-S04) & Food Form (MOB-06)
  const getAiPresets = useCallback((): AiScanPreset[] => {
    return aiPresets;
  }, [aiPresets]);

  const runAiScan = useCallback(
    async (payload: { preset_id?: string; file_name?: string; simulated_blur?: boolean }) => {
      return transport.request('SCAN_FOOD_IMAGE', payload);
    },
    [transport],
  );

  const openFoodFormCreate = useCallback(
    (options?: {
      mergeIntoFoodId?: number;
      mergeTargetName?: string;
      prefillCode?: string;
      prefillCategoryId?: number;
      prefillUnitId?: number;
      prefillBrand?: string;
      prefillDescription?: string;
      prefillMinThreshold?: number;
    }) => {
      const masterLots =
        allInventoryItems.length > 0 ? allInventoryItems : snapshot.cache.inventory_items;
      const existingCodes = masterLots.map((i) => i.food_code);
      setFoodFormDraft(
        createBlankDraft(catalogs, effectiveDate, systemConfig, existingCodes, options),
      );
      setScreenStack((prev) =>
        prev[prev.length - 1] === 'MOB-06' ? prev : [...prev, 'MOB-06'],
      );
    },
    [allInventoryItems, catalogs, effectiveDate, snapshot.cache.inventory_items, systemConfig],
  );

  const openFoodFormEdit = useCallback((lot: FoodLotView) => {
    setFoodFormDraft({
      sessionId: Date.now(),
      mode: 'edit',
      editItemId: lot.item_id,
      editFoodId: lot.food_id,
      aiSourceLabel: null,
      aiFilledFields: [],
      values: {
        food_code: lot.food_code,
        food_name: lot.food_name,
        category_id: lot.category_id,
        brand: lot.brand ?? '',
        description: lot.description ?? '',
        image_url: lot.image_url ?? '',
        area_type: lot.area_type,
        location_id: lot.location_id,
        unit_id: lot.unit_id,
        quantity: String(lot.current_quantity),
        min_threshold: String(lot.min_threshold),
        import_date: lot.import_date,
        expiry_date: lot.expiry_date,
        note: lot.note ?? '',
      },
    });
    setScreenStack((prev) => [...prev, 'MOB-06']);
  }, []);

  const updateFoodFormValues = useCallback((patch: Partial<FoodFormValues>) => {
    setFoodFormDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        values: { ...prev.values, ...patch },
      };
    });
  }, []);

  const applyAiScanToForm = useCallback(
    (aiResult: AiScanResult) => {
      const fields = aiResult.suggested_fields;
      const masterLots =
        allInventoryItems.length > 0 ? allInventoryItems : snapshot.cache.inventory_items;
      const existingCodes = masterLots.map((i) => i.food_code);

      setFoodFormDraft((prev) => {
        const base =
          prev && prev.mode === 'create'
            ? prev
            : createBlankDraft(catalogs, effectiveDate, systemConfig, existingCodes);

        if (!fields) {
          return base;
        }

        const loc = catalogs.storage_locations.find(
          (l) => l.location_id === fields.suggested_location_id,
        );

        return {
          ...base,
          aiSourceLabel: aiResult.source_label,
          aiFilledFields: [
            'food_name',
            'category_id',
            'brand',
            'unit_id',
            'quantity',
            'expiry_date',
            'description',
            'location_id',
          ],
          values: {
            ...base.values,
            food_name: fields.food_name,
            category_id: fields.category_id,
            brand: fields.brand,
            unit_id: fields.unit_id,
            quantity: String(fields.suggested_quantity),
            expiry_date: fields.expiry_date,
            description: fields.description,
            area_type: loc?.area_type ?? base.values.area_type,
            location_id: loc?.location_id ?? base.values.location_id,
          },
        };
      });

      setAiScanState({ open: false, origin: 'form' });
      setScreenStack((prev) =>
        prev[prev.length - 1] === 'MOB-06' ? prev : [...prev, 'MOB-06'],
      );
      showToast('Đã điền dữ liệu từ AI Scan — hãy kiểm tra lại trước khi lưu.');
    },
    [
      allInventoryItems,
      catalogs,
      effectiveDate,
      showToast,
      snapshot.cache.inventory_items,
      systemConfig,
    ],
  );

  const openManualFormAfterAiFailure = useCallback(() => {
    const masterLots =
      allInventoryItems.length > 0 ? allInventoryItems : snapshot.cache.inventory_items;
    const existingCodes = masterLots.map((i) => i.food_code);
    setFoodFormDraft((prev) =>
      prev && prev.mode === 'create'
        ? prev
        : createBlankDraft(catalogs, effectiveDate, systemConfig, existingCodes),
    );
    setAiScanState({ open: false, origin: 'form' });
    setScreenStack((prev) =>
      prev[prev.length - 1] === 'MOB-06' ? prev : [...prev, 'MOB-06'],
    );
  }, [allInventoryItems, catalogs, effectiveDate, snapshot.cache.inventory_items, systemConfig]);

  const submitFoodForm = useCallback(
    async (options?: {
      merge_into_food_id?: number;
      force_create_separate_food?: boolean;
    }): Promise<ServerResponse<CreateFoodItemResult | StockMutationResult>> => {
      if (!foodFormDraft) {
        return {
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'Không có dữ liệu biểu mẫu.' },
          request_id: 'local-empty-form',
          timestamp: new Date().toISOString(),
          latency_ms: 0,
        };
      }

      const v = foodFormDraft.values;
      const input: FoodFormInput = {
        food_code: v.food_code.trim(),
        food_name: v.food_name.trim(),
        category_id: Number(v.category_id),
        brand: v.brand.trim(),
        description: v.description.trim(),
        image_url: v.image_url.trim() || null,
        location_id: Number(v.location_id),
        unit_id: Number(v.unit_id),
        quantity: Number(v.quantity),
        min_threshold: Number(v.min_threshold),
        import_date: v.import_date,
        expiry_date: v.expiry_date,
        note: v.note.trim(),
        merge_into_food_id: options?.merge_into_food_id ?? foodFormDraft.mergeIntoFoodId,
        force_create_separate_food: options?.force_create_separate_food,
        actor_device: snapshot.device_name,
      };

      const pushBefore = pushEpochRef.current;

      if (foodFormDraft.mode === 'edit' && foodFormDraft.editItemId !== undefined) {
        const res = await transport.request('UPDATE_FOOD_ITEM', {
          item_id: foodFormDraft.editItemId,
          input,
        });
        if (res.ok) {
          setAlerts(res.data.alerts_summary);
          await refreshAfterMutation(pushBefore);
          setFoodFormDraft(null);
          navigateBack();
          showToast(`Đã cập nhật hồ sơ "${res.data.item.food_name}"`);
        }
        return res;
      }

      const res = await transport.request('CREATE_FOOD_ITEM', input);
      if (res.ok) {
        await refreshAfterMutation(pushBefore);
        setFoodFormDraft(null);
        navigateBack();
        showToast(
          res.data.merged_existing_food
            ? `Đã thêm lô mới ${res.data.item.item_code} cho "${res.data.food.food_name}"`
            : `Đã lưu "${res.data.food.food_name}" (${res.data.item.item_code}) vào kho`,
        );
      }
      return res;
    },
    [
      foodFormDraft,
      navigateBack,
      refreshAfterMutation,
      showToast,
      snapshot.device_name,
      transport,
    ],
  );

  const cancelFoodForm = useCallback(() => {
    setFoodFormDraft(null);
    navigateBack();
  }, [navigateBack]);

  // Derived filtered views when offline so user can still filter cached lists read-only
  const visibleFefoItems = useMemo(() => {
    const source = fefoResult?.items ?? snapshot.cache.fefo_items;
    return source.filter((item) => {
      if (fefoAreaFilter !== 'all' && item.area_type !== fefoAreaFilter) return false;
      if (fefoPriorityFilter !== 'all' && item.priority_level !== fefoPriorityFilter) return false;
      return true;
    });
  }, [fefoAreaFilter, fefoPriorityFilter, fefoResult?.items, snapshot.cache.fefo_items]);

  const fefoCountsByPriority = useMemo(() => {
    if (fefoResult) return fefoResult.counts_by_priority;
    const cached = snapshot.cache.fefo_items;
    return {
      Cao: cached.filter((i) => i.priority_level === 'Cao').length,
      'Trung bình': cached.filter((i) => i.priority_level === 'Trung bình').length,
      Thấp: cached.filter((i) => i.priority_level === 'Thấp').length,
    };
  }, [fefoResult, snapshot.cache.fefo_items]);

  const auditLogs = useMemo<GetAuditLogsResult | null>(() => {
    if (!isOfflineReadOnly && serverAuditLogs) {
      return serverAuditLogs;
    }
    const sourceLogs =
      snapshot.cache.audit_logs.length > 0 ? snapshot.cache.audit_logs : allAuditTransactions;
    if (sourceLogs.length > 0) {
      return buildAuditLogsResult(sourceLogs, auditActionFilter);
    }
    return serverAuditLogs;
  }, [
    allAuditTransactions,
    auditActionFilter,
    isOfflineReadOnly,
    serverAuditLogs,
    snapshot.cache.audit_logs,
  ]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (inventoryFilter.category_id && inventoryFilter.category_id !== 'all') count += 1;
    if (inventoryFilter.area_type && inventoryFilter.area_type !== 'all') count += 1;
    if (inventoryFilter.location_id && inventoryFilter.location_id !== 'all') count += 1;
    if (inventoryFilter.stock_status && inventoryFilter.stock_status !== 'all') count += 1;
    if (inventoryFilter.expiry_status && inventoryFilter.expiry_status !== 'all') count += 1;
    return count;
  }, [inventoryFilter]);

  return {
    snapshot,
    hasEnteredShell,
    currentScreen,
    canNavigateBack: screenStack.length > 1,
    systemConfig,
    effectiveDate,
    catalogs,
    isConnected,
    isOfflineReadOnly,
    isInitialLoading,
    isSyncing,
    toastMessage,
    dismissToast,
    showToast,

    // Screen data
    fefoResult,
    visibleFefoItems,
    fefoCountsByPriority,
    fefoAreaFilter,
    fefoPriorityFilter,
    allInventoryItems,
    inventoryItems,
    inventoryFilter,
    inventoryError,
    activeFilterCount,
    recipes,
    recipesFocusItemId,
    alerts,
    statsRange,
    stats,
    auditActionFilter,
    auditLogs,
    detailItemId,
    selectedItemDetail,
    itemDetailError,
    foodFormDraft,

    // Modals & sheets
    stockSheetTarget,
    setStockSheetTarget,
    filterSheetOpen,
    setFilterSheetOpen,
    moveSheetTarget,
    setMoveSheetTarget,
    aiScanState,
    setAiScanState,
    liquidateTarget,
    setLiquidateTarget,

    // Actions
    navigateToTab,
    navigateBack,
    openItemDetail,
    openRecipesScreen,
    openConnectScreen,
    connectToServer,
    retryConnection,
    enterOfflineMode,
    disconnectFromServer,
    toggleSimulatedOffline,
    setClientFaultOverride,
    refreshAllData,
    applyFefoFilter,
    applyInventoryFilter,
    changeStatsRange,
    changeAuditFilter,
    loadItemDetail,
    submitUseFood,
    submitRestockFood,
    submitAdjustFood,
    submitMoveLocation,
    submitCancelFoodItem,
    submitCookRecipe,
    getAiPresets,
    runAiScan,
    openFoodFormCreate,
    openFoodFormEdit,
    updateFoodFormValues,
    applyAiScanToForm,
    openManualFormAfterAiFailure,
    submitFoodForm,
    cancelFoodForm,
  };
}
