import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getSharedDesktopServerNode,
  type AiScanPreset,
  type AlertsSummary,
  type AnalyticsSnapshot,
  type AreaType,
  type AuditLogFilter,
  type CatalogBundle,
  type CatalogReferenceCounts,
  type Category,
  type FaultInjectionMode,
  type FefoListResult,
  type FefoPriorityLevel,
  type Food,
  type FoodFormInput,
  type FoodLotView,
  type FoodSearchFilter,
  type GetAuditLogsResult,
  type GetStatsPayload,
  type ItemDetailResult,
  type ProtocolAction,
  type ProtocolRequestMap,
  type Recipe,
  type RecipeMatchSuggestion,
  type SaveCategoryPayload,
  type SaveLocationPayload,
  type SaveRecipePayload,
  type SaveUnitPayload,
  type SearchFoodItemsResult,
  type ServerPushEvent,
  type ServerResponse,
  type ServerStatusSnapshot,
  type ShiftSimulatedDatePayload,
  type StorageLocation,
  type SystemConfig,
  type Unit,
} from '@food-mgmt/shared-sim';

export type DesktopScreenId =
  | 'DSK-01'
  | 'DSK-02'
  | 'DSK-03'
  | 'DSK-04'
  | 'DSK-05'
  | 'DSK-06'
  | 'DSK-07';

export type CatalogTabId = 'categories' | 'units' | 'locations' | 'recipes';
export type AlertsTabId = 'expiry' | 'stock';
export type SettingsTabId = 'business' | 'network';
export type InventoryActionMode = 'use' | 'restock' | 'adjust' | 'move';

export interface ToastItem {
  id: string;
  kind: 'success' | 'error' | 'warning' | 'info';
  title: string;
  detail?: string;
}

export type FoodFormModalState =
  | { open: false }
  | {
      open: true;
      mode: 'create' | 'edit';
      lot?: FoodLotView;
      openAiHelper?: boolean;
    };

export type InventoryActionModalState =
  | { open: false }
  | {
      open: true;
      lot: FoodLotView;
      initialMode: InventoryActionMode;
      defaultQuantity?: number;
      defaultReason?: string;
    };

export type RecipeDetailModalState =
  | { open: false }
  | {
      open: true;
      focusItemId?: number;
      initialRecipeId?: number;
    };

export type LiquidateModalState =
  | { open: false }
  | {
      open: true;
      lot: FoodLotView;
    };

export type CatalogFormModalState =
  | { open: false }
  | { open: true; entity: 'category'; record?: Category }
  | { open: true; entity: 'unit'; record?: Unit }
  | { open: true; entity: 'location'; record?: StorageLocation }
  | { open: true; entity: 'recipe'; record?: Recipe };

export type ReferenceCounts = CatalogReferenceCounts;

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

const DEFAULT_AUDIT_FILTER: AuditLogFilter = {
  keyword: '',
  action_type: 'all',
  actor_device: 'all',
  start_date: '',
  end_date: '',
};

const DEFAULT_FEFO_FILTER: {
  area_type: AreaType | 'all';
  location_id: number | 'all';
  priority_level: FefoPriorityLevel | 'all';
} = {
  area_type: 'all',
  location_id: 'all',
  priority_level: 'all',
};

export function useDesktopServer() {
  const node = useMemo(() => getSharedDesktopServerNode(), []);

  const [status, setStatus] = useState<ServerStatusSnapshot>(() => node.getStatusSnapshot());
  const [activeScreen, setActiveScreen] = useState<DesktopScreenId>('DSK-01');
  const [alertsTab, setAlertsTab] = useState<AlertsTabId>('expiry');
  const [catalogsTab, setCatalogsTab] = useState<CatalogTabId>('categories');
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>('business');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [statsQuery, setStatsQuery] = useState<GetStatsPayload>({ range_days: 7 });
  const [fefoFilter, setFefoFilter] = useState(DEFAULT_FEFO_FILTER);
  const [inventoryFilter, setInventoryFilter] = useState<FoodSearchFilter>(DEFAULT_INVENTORY_FILTER);
  const [auditFilter, setAuditFilter] = useState<AuditLogFilter>(DEFAULT_AUDIT_FILTER);

  const [catalogs, setCatalogs] = useState<CatalogBundle>(EMPTY_CATALOGS);
  const [allFoods, setAllFoods] = useState<Food[]>([]);
  const [allLots, setAllLots] = useState<FoodLotView[]>([]);
  const [referenceCounts, setReferenceCounts] = useState<ReferenceCounts>({
    categories: {},
    units: {},
    locations: {},
  });

  const [stats, setStats] = useState<AnalyticsSnapshot | null>(null);
  const [fefo, setFefo] = useState<FefoListResult | null>(null);
  const [recipes, setRecipes] = useState<RecipeMatchSuggestion[]>([]);
  const [inventory, setInventory] = useState<SearchFoodItemsResult | null>(null);
  const [auditLogs, setAuditLogs] = useState<GetAuditLogsResult | null>(null);
  const [alerts, setAlerts] = useState<AlertsSummary>(() => node.getStatusSnapshot().alerts_summary);
  const [aiPresets, setAiPresets] = useState<AiScanPreset[]>([]);

  const [isLoadingData, setIsLoadingData] = useState(true);
  const [dbErrorMessage, setDbErrorMessage] = useState<string | null>(null);

  const [drawerItemId, setDrawerItemId] = useState<number | null>(null);
  const [drawerDetail, setDrawerDetail] = useState<ItemDetailResult | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const [foodFormModal, setFoodFormModal] = useState<FoodFormModalState>({ open: false });
  const [actionModal, setActionModal] = useState<InventoryActionModalState>({ open: false });
  const [recipeModal, setRecipeModal] = useState<RecipeDetailModalState>({ open: false });
  const [liquidateModal, setLiquidateModal] = useState<LiquidateModalState>({ open: false });
  const [catalogModal, setCatalogModal] = useState<CatalogFormModalState>({ open: false });

  const [trayPopoverOpen, setTrayPopoverOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const [settingsDirty, setSettingsDirty] = useState(false);
  const [pendingLeaveTarget, setPendingLeaveTarget] = useState<DesktopScreenId | null>(null);
  const [serverFullyExited, setServerFullyExited] = useState(false);

  const toastCounterRef = useRef(1);
  const drawerItemIdRef = useRef<number | null>(null);
  drawerItemIdRef.current = drawerItemId;

  const statsQueryRef = useRef(statsQuery);
  statsQueryRef.current = statsQuery;
  const fefoFilterRef = useRef(fefoFilter);
  fefoFilterRef.current = fefoFilter;
  const inventoryFilterRef = useRef(inventoryFilter);
  inventoryFilterRef.current = inventoryFilter;
  const auditFilterRef = useRef(auditFilter);
  auditFilterRef.current = auditFilter;

  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  const refreshQueuedSkeletonRef = useRef(false);
  const suppressDesktopPushRef = useRef(false);
  const prevUrgentAlertCountRef = useRef<number | null>(
    node.getStatusSnapshot().alerts_summary.expired_items.length +
      node.getStatusSnapshot().alerts_summary.expiring_soon_items.length,
  );

  const statsDidMountRef = useRef(false);
  const fefoDidMountRef = useRef(false);
  const inventoryDidMountRef = useRef(false);
  const auditDidMountRef = useRef(false);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (kind: ToastItem['kind'], title: string, detail?: string) => {
      const id = `toast-${Date.now()}-${toastCounterRef.current++}`;
      setToasts((prev) => [{ id, kind, title, detail }, ...prev].slice(0, 4));
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4800);
    },
    [],
  );

  const applyStatusSnapshot = useCallback(
    (snap: ServerStatusSnapshot) => {
      setStatus(snap);
      setAlerts(snap.alerts_summary);

      const urgentCount =
        snap.alerts_summary.expired_items.length +
        snap.alerts_summary.expiring_soon_items.length +
        snap.alerts_summary.low_stock_items.length;
      const prevUrgent = prevUrgentAlertCountRef.current;
      prevUrgentAlertCountRef.current = urgentCount;

      if (
        prevUrgent !== null &&
        urgentCount > prevUrgent &&
        snap.system_config.enable_os_alert_notifications
      ) {
        pushToast(
          'warning',
          `Thông báo Khay hệ thống: ${urgentCount} cảnh báo hạn & tồn kho`,
          `${snap.alerts_summary.expired_items.length} quá hạn · ${snap.alerts_summary.expiring_soon_items.length} cận hạn · ${snap.alerts_summary.low_stock_items.length} dưới tồn tối thiểu.`,
        );
      }
    },
    [pushToast],
  );

  const refreshDrawerDetail = useCallback(
    async (itemId: number | null) => {
      if (itemId === null) {
        setDrawerDetail(null);
        return;
      }
      setDrawerLoading(true);
      const res = await node.executeDesktopAction('GET_ITEM_DETAIL', { item_id: itemId });
      setDrawerLoading(false);
      if (res.ok) {
        setDrawerDetail(res.data);
      } else {
        setDrawerDetail(null);
        if (res.error.code === 'NOT_FOUND') {
          setDrawerItemId(null);
        }
      }
    },
    [node],
  );

  const refreshAllViews = useCallback(
    async (showSkeleton = false) => {
      if (refreshInFlightRef.current) {
        refreshQueuedRef.current = true;
        refreshQueuedSkeletonRef.current = refreshQueuedSkeletonRef.current || showSkeleton;
        return;
      }

      refreshInFlightRef.current = true;
      try {
        if (showSkeleton) setIsLoadingData(true);
        const snap = node.getStatusSnapshot();
        applyStatusSnapshot(snap);

        const [
          catRes,
          catMetaRes,
          aiPresetsRes,
          statsRes,
          fefoRes,
          recRes,
          allLotsRes,
          invRes,
          alertRes,
          auditRes,
        ] = await Promise.all([
          node.executeDesktopAction('GET_CATALOGS', undefined),
          node.executeDesktopAction('GET_CATALOG_METADATA', undefined),
          node.executeDesktopAction('GET_AI_SCAN_PRESETS', {}),
          node.executeDesktopAction('GET_STATS', statsQueryRef.current),
          node.executeDesktopAction('GET_FEFO_LIST', fefoFilterRef.current),
          node.executeDesktopAction('GET_RECIPES', undefined),
          node.executeDesktopAction('SEARCH_FOOD_ITEMS', DEFAULT_INVENTORY_FILTER),
          node.executeDesktopAction('SEARCH_FOOD_ITEMS', inventoryFilterRef.current),
          node.executeDesktopAction('GET_ALERTS', { trigger_scan: false }),
          node.executeDesktopAction('GET_AUDIT_LOGS', auditFilterRef.current),
        ]);

        const firstError = [
          catRes,
          catMetaRes,
          aiPresetsRes,
          statsRes,
          fefoRes,
          recRes,
          allLotsRes,
          invRes,
          alertRes,
          auditRes,
        ].find((r) => !r.ok);

        if (firstError && !firstError.ok && firstError.error.code === 'DB_ERROR') {
          setDbErrorMessage(firstError.error.message);
        } else {
          setDbErrorMessage(null);
        }

        if (catRes.ok) setCatalogs(catRes.data);
        if (catMetaRes.ok) {
          setAllFoods(catMetaRes.data.foods);
          setReferenceCounts(catMetaRes.data.reference_counts);
        }
        if (aiPresetsRes.ok) setAiPresets(aiPresetsRes.data);
        if (statsRes.ok) setStats(statsRes.data);
        if (fefoRes.ok) setFefo(fefoRes.data);
        if (recRes.ok) setRecipes(recRes.data);
        if (allLotsRes.ok) setAllLots(allLotsRes.data.items);
        if (invRes.ok) setInventory(invRes.data);
        if (alertRes.ok) setAlerts(alertRes.data);
        if (auditRes.ok) setAuditLogs(auditRes.data);

        if (drawerItemIdRef.current !== null && (!firstError || firstError.ok)) {
          await refreshDrawerDetail(drawerItemIdRef.current);
        }

        setIsLoadingData(false);
      } finally {
        refreshInFlightRef.current = false;
        if (refreshQueuedRef.current) {
          const queuedSkeleton = refreshQueuedSkeletonRef.current;
          refreshQueuedRef.current = false;
          refreshQueuedSkeletonRef.current = false;
          void refreshAllViews(queuedSkeleton);
        }
      }
    },
    [node, applyStatusSnapshot, refreshDrawerDetail],
  );

  // Initial load & stable single-mount subscription to server status and cross-tab Mobile pushes
  useEffect(() => {
    void refreshAllViews(true);

    const unsubStatus = node.subscribeStatus((snap) => {
      applyStatusSnapshot(snap);
    });

    const unsubPush = node.subscribePush((event: ServerPushEvent) => {
      if (suppressDesktopPushRef.current && event.source_device === 'Desktop Server') {
        return;
      }
      if (event.source_device !== 'Desktop Server') {
        pushToast('info', `Đồng bộ từ ${event.source_device}`, event.summary);
      }
      void refreshAllViews(false);
    });

    return () => {
      unsubStatus();
      unsubPush();
    };
  }, [node, refreshAllViews, applyStatusSnapshot, pushToast]);

  // Reload ONLY the target screen's query when its filter changes (skip initial mount duplicate)
  useEffect(() => {
    if (!statsDidMountRef.current) {
      statsDidMountRef.current = true;
      return;
    }
    void (async () => {
      const res = await node.executeDesktopAction('GET_STATS', statsQuery);
      if (res.ok) setStats(res.data);
    })();
  }, [node, statsQuery]);

  useEffect(() => {
    if (!fefoDidMountRef.current) {
      fefoDidMountRef.current = true;
      return;
    }
    void (async () => {
      const res = await node.executeDesktopAction('GET_FEFO_LIST', fefoFilter);
      if (res.ok) setFefo(res.data);
    })();
  }, [node, fefoFilter]);

  useEffect(() => {
    if (!inventoryDidMountRef.current) {
      inventoryDidMountRef.current = true;
      return;
    }
    void (async () => {
      const res = await node.executeDesktopAction('SEARCH_FOOD_ITEMS', inventoryFilter);
      if (res.ok) setInventory(res.data);
    })();
  }, [node, inventoryFilter]);

  useEffect(() => {
    if (!auditDidMountRef.current) {
      auditDidMountRef.current = true;
      return;
    }
    void (async () => {
      const res = await node.executeDesktopAction('GET_AUDIT_LOGS', auditFilter);
      if (res.ok) setAuditLogs(res.data);
    })();
  }, [node, auditFilter]);

  useEffect(() => {
    void refreshDrawerDetail(drawerItemId);
  }, [drawerItemId, refreshDrawerDetail]);

  const navigateTo = useCallback(
    (target: DesktopScreenId, force = false) => {
      if (activeScreen === 'DSK-07' && settingsDirty && target !== 'DSK-07' && !force) {
        setPendingLeaveTarget(target);
        return;
      }
      setPendingLeaveTarget(null);
      if (force) setSettingsDirty(false);
      setActiveScreen(target);
      if (status.runtime.minimized_to_tray) {
        node.setMinimizedToTray(false);
      }
      setTrayPopoverOpen(false);
    },
    [activeScreen, settingsDirty, status.runtime.minimized_to_tray, node],
  );

  const openDrawer = useCallback((itemId: number) => {
    setDrawerItemId(itemId);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerItemId(null);
  }, []);

  const execDesktopAction = useCallback(
    async <A extends ProtocolAction>(
      action: A,
      payload: ProtocolRequestMap[A]['req'],
    ): Promise<ServerResponse<ProtocolRequestMap[A]['res']>> => {
      suppressDesktopPushRef.current = true;
      let res: ServerResponse<ProtocolRequestMap[A]['res']>;
      try {
        res = await node.executeDesktopAction(action, payload);
      } finally {
        suppressDesktopPushRef.current = false;
      }
      if (res.ok) {
        await refreshAllViews(false);
      } else if (res.error.code === 'DB_ERROR') {
        setDbErrorMessage(res.error.message);
      }
      return res;
    },
    [node, refreshAllViews],
  );

  // Specific domain actions
  const shiftDate = useCallback(
    async (payload: ShiftSimulatedDatePayload) => {
      const res = await execDesktopAction('SHIFT_SIMULATED_DATE', payload);
      if (res.ok) {
        const eff = res.data.use_simulated_date ? res.data.simulated_date : 'Ngày thực tế';
        pushToast('info', `Đã cập nhật mốc thời gian: ${eff}`, 'FEFO và Cảnh báo đã được tính lại.');
      } else {
        pushToast('error', 'Không thể đổi ngày mô phỏng', res.error.message);
      }
      return res;
    },
    [execDesktopAction, pushToast],
  );

  const triggerManualAlertScan = useCallback(async () => {
    const res = await node.executeDesktopAction('GET_ALERTS', { trigger_scan: true });
    if (res.ok) {
      setAlerts(res.data);
      pushToast(
        'info',
        'Đã hoàn tất quét cảnh báo (D4)',
        `${res.data.expired_items.length} quá hạn · ${res.data.expiring_soon_items.length} cận hạn · ${res.data.low_stock_items.length} tồn thấp.`,
      );
    } else {
      pushToast('error', 'Quét cảnh báo thất bại', res.error.message);
    }
    return res;
  }, [node, pushToast]);

  const toggleServerRunning = useCallback(() => {
    const next = !status.runtime.server_running;
    node.setServerRunning(next);
    setServerFullyExited(false);
    pushToast(
      next ? 'success' : 'warning',
      next ? 'Desktop Server Listener đã khởi động' : 'Desktop Server Listener đã tạm dừng',
      next
        ? `Đang lắng nghe tại ${status.system_config.server_ip}:${status.system_config.server_port}`
        : 'Mobile Client sẽ nhận lỗi không kết nối cho đến khi bật lại.',
    );
  }, [node, status.runtime.server_running, status.system_config, pushToast]);

  const toggleDbHealthy = useCallback(() => {
    const next = !status.runtime.db_healthy;
    node.setDbHealthy(next);
    void refreshAllViews(false);
    pushToast(
      next ? 'success' : 'error',
      next ? 'Đã khôi phục kết nối CSDL MySQL giả lập' : 'Đã ngắt kết nối CSDL MySQL giả lập',
      next ? 'Các thao tác kho đã hoạt động trở lại.' : 'Mọi thao tác kho bị khóa để bảo vệ toàn vẹn dữ liệu.',
    );
  }, [node, status.runtime.db_healthy, refreshAllViews, pushToast]);

  const setFaultMode = useCallback(
    (mode: FaultInjectionMode) => {
      node.setForceNextError(mode, false);
      pushToast(
        mode === 'NONE' ? 'info' : 'warning',
        mode === 'NONE' ? 'Đã tắt tiêm lỗi giả lập' : `Đã bật tiêm lỗi 1 lần: ${mode}`,
        mode === 'NONE' ? undefined : 'Yêu cầu Mobile Client tiếp theo sẽ kích hoạt lỗi này.',
      );
    },
    [node, pushToast],
  );

  const simulateClientPing = useCallback(async () => {
    const res = await node.handleClientAction(
      'PING_HANDSHAKE',
      {
        ip: status.system_config.server_ip,
        port: status.system_config.server_port,
        pairing_pin: status.system_config.pairing_pin,
        client_id: 'mob-kitchen-01',
        device_name: 'Điện thoại Bếp (Demo)',
        client_ip: '192.168.1.24',
      },
      { client_id: 'mob-kitchen-01', device_name: 'Điện thoại Bếp (Demo)' },
    );
    if (res.ok) {
      pushToast('success', 'Mobile Demo Ping ACK', `Kết nối thành công (${res.latency_ms}ms).`);
    } else {
      pushToast('error', `Mobile Demo Ping lỗi (${res.error.code})`, res.error.message);
    }
    return res;
  }, [node, status.system_config, pushToast]);

  const simulateClientUseTopFefo = useCallback(async () => {
    const fefoList = fefo?.items ?? [];
    const target = fefoList[0];
    if (!target) {
      pushToast('warning', 'Không có lô FEFO khả dụng', 'Chưa có lô hàng còn hạn để Mobile Demo xuất dùng.');
      return null;
    }
    const usedQty = Math.min(0.2, Math.max(0.1, Number((target.current_quantity * 0.25).toFixed(1))));
    const res = await node.handleClientAction(
      'USE_FOOD',
      {
        item_id: target.item_id,
        quantity_used: Math.min(usedQty, target.current_quantity),
        reason: 'Nấu ăn đồng bộ từ Mobile Demo',
        actor_device: 'Điện thoại Bếp (Demo)',
        expected_current_quantity: target.current_quantity,
      },
      { client_id: 'mob-kitchen-01', device_name: 'Điện thoại Bếp (Demo)' },
    );
    if (res.ok) {
      pushToast(
        'success',
        `Mobile Demo đã dùng ${target.food_name}`,
        `Còn lại ${res.data.item.current_quantity} ${res.data.item.unit_name}.`,
      );
    } else {
      pushToast('error', `Mobile Demo lỗi (${res.error.code})`, res.error.message);
    }
    return res;
  }, [node, fefo, pushToast]);

  const saveCategoryItem = useCallback(
    (payload: SaveCategoryPayload) => execDesktopAction('SAVE_CATEGORY', payload),
    [execDesktopAction],
  );
  const deleteCategoryItem = useCallback(
    (categoryId: number) => execDesktopAction('DELETE_CATEGORY', { category_id: categoryId }),
    [execDesktopAction],
  );
  const saveUnitItem = useCallback(
    (payload: SaveUnitPayload) => execDesktopAction('SAVE_UNIT', payload),
    [execDesktopAction],
  );
  const deleteUnitItem = useCallback(
    (unitId: number) => execDesktopAction('DELETE_UNIT', { unit_id: unitId }),
    [execDesktopAction],
  );
  const saveLocationItem = useCallback(
    (payload: SaveLocationPayload) => execDesktopAction('SAVE_LOCATION', payload),
    [execDesktopAction],
  );
  const deleteLocationItem = useCallback(
    (locationId: number) => execDesktopAction('DELETE_LOCATION', { location_id: locationId }),
    [execDesktopAction],
  );
  const saveRecipeItem = useCallback(
    (payload: SaveRecipePayload) => execDesktopAction('SAVE_RECIPE', payload),
    [execDesktopAction],
  );
  const deleteRecipeItem = useCallback(
    (recipeId: number) => execDesktopAction('DELETE_RECIPE', { recipe_id: recipeId }),
    [execDesktopAction],
  );

  const createFood = useCallback(
    (input: FoodFormInput) => execDesktopAction('CREATE_FOOD_ITEM', input),
    [execDesktopAction],
  );
  const updateFood = useCallback(
    (itemId: number, input: FoodFormInput) => execDesktopAction('UPDATE_FOOD_ITEM', { item_id: itemId, input }),
    [execDesktopAction],
  );
  const cookRecipe = useCallback(
    (recipeId: number) =>
      execDesktopAction('COOK_RECIPE', {
        recipe_id: recipeId,
        actor_device: 'Desktop Server',
      }),
    [execDesktopAction],
  );

  const saveSystemConfig = useCallback(
    (patch: Partial<SystemConfig>) => execDesktopAction('UPDATE_SYSTEM_CONFIG', patch),
    [execDesktopAction],
  );

  const resetDemoDatabase = useCallback(async () => {
    prevUrgentAlertCountRef.current = null;
    suppressDesktopPushRef.current = true;
    try {
      node.resetDatabaseToSeed();
    } finally {
      suppressDesktopPushRef.current = false;
    }
    setDrawerItemId(null);
    setSettingsDirty(false);
    setServerFullyExited(false);
    setInventoryFilter(DEFAULT_INVENTORY_FILTER);
    setAuditFilter(DEFAULT_AUDIT_FILTER);
    setFefoFilter(DEFAULT_FEFO_FILTER);
    await refreshAllViews(false);
    pushToast('success', 'Đã khôi phục dữ liệu mẫu SQL', 'Toàn bộ lô hàng, nhật ký và cấu hình đã quay về mặc định.');
  }, [node, refreshAllViews, pushToast]);

  const minimizeToTray = useCallback(() => {
    node.setMinimizedToTray(true);
    setTrayPopoverOpen(true);
  }, [node]);

  const restoreFromTray = useCallback(
    (screen?: DesktopScreenId) => {
      node.setMinimizedToTray(false);
      setServerFullyExited(false);
      setTrayPopoverOpen(false);
      if (screen) {
        setActiveScreen(screen);
      }
    },
    [node],
  );

  const exitServerCompletely = useCallback(() => {
    node.setServerRunning(false);
    node.setMinimizedToTray(true);
    setTrayPopoverOpen(false);
    setServerFullyExited(true);
    pushToast('warning', 'Đã dừng và thoát Desktop Server', 'Mọi phiên Mobile Client đã ngừng nhận phản hồi.');
  }, [node, pushToast]);

  const reopenAfterExit = useCallback(() => {
    setServerFullyExited(false);
    node.setMinimizedToTray(false);
    if (status.system_config.auto_start_listener) {
      node.setServerRunning(true);
    }
    setActiveScreen('DSK-01');
  }, [node, status.system_config.auto_start_listener]);

  return {
    node,
    status,
    activeScreen,
    navigateTo,
    alertsTab,
    setAlertsTab,
    catalogsTab,
    setCatalogsTab,
    settingsTab,
    setSettingsTab,
    sidebarCollapsed,
    setSidebarCollapsed,

    statsQuery,
    setStatsQuery,
    fefoFilter,
    setFefoFilter,
    inventoryFilter,
    setInventoryFilter,
    auditFilter,
    setAuditFilter,

    catalogs,
    allFoods,
    allLots,
    referenceCounts,
    stats,
    fefo,
    recipes,
    inventory,
    auditLogs,
    alerts,
    aiPresets,
    isLoadingData,
    dbErrorMessage,

    drawerItemId,
    drawerDetail,
    drawerLoading,
    openDrawer,
    closeDrawer,

    foodFormModal,
    setFoodFormModal,
    actionModal,
    setActionModal,
    recipeModal,
    setRecipeModal,
    liquidateModal,
    setLiquidateModal,
    catalogModal,
    setCatalogModal,

    trayPopoverOpen,
    setTrayPopoverOpen,
    qrModalOpen,
    setQrModalOpen,
    serverFullyExited,

    toasts,
    pushToast,
    dismissToast,

    settingsDirty,
    setSettingsDirty,
    pendingLeaveTarget,
    setPendingLeaveTarget,

    refreshAllViews,
    execDesktopAction,
    shiftDate,
    triggerManualAlertScan,
    toggleServerRunning,
    toggleDbHealthy,
    setFaultMode,
    simulateClientPing,
    simulateClientUseTopFefo,
    saveCategoryItem,
    deleteCategoryItem,
    saveUnitItem,
    deleteUnitItem,
    saveLocationItem,
    deleteLocationItem,
    saveRecipeItem,
    deleteRecipeItem,
    createFood,
    updateFood,
    cookRecipe,
    saveSystemConfig,
    resetDemoDatabase,
    minimizeToTray,
    restoreFromTray,
    exitServerCompletely,
    reopenAfterExit,
  };
}

export type DesktopServerController = ReturnType<typeof useDesktopServer>;
