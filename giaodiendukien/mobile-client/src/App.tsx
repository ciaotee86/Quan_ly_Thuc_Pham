import { useEffect, useMemo, useState } from 'react';
import { useMobileClient } from './state/useMobileClient';
import { filterCachedFoodLots } from './domain/food-lot-presentation';
import { MobileShell } from './components/MobileShell';
import { StockActionSheet } from './components/StockActionSheet';
import { FilterBottomSheet } from './components/FilterBottomSheet';
import { MoveLocationSheet } from './components/MoveLocationSheet';
import { AiScanSheet } from './components/AiScanSheet';
import { LiquidateDialog } from './components/LiquidateDialog';
import { ConnectServerScreen } from './screens/ConnectServerScreen';
import { HomeFefoScreen } from './screens/HomeFefoScreen';
import { MobileInventoryScreen } from './screens/MobileInventoryScreen';
import { FoodDetailScreen } from './screens/FoodDetailScreen';
import { RecipesMenuScreen } from './screens/RecipesMenuScreen';
import { MobileAlertsScreen } from './screens/MobileAlertsScreen';
import { FoodFormScreen } from './screens/FoodFormScreen';
import { MobileStatsSettingsScreen } from './screens/MobileStatsSettingsScreen';

export function App() {
  const client = useMobileClient();
  const [fabMenuOpen, setFabMenuOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (client.liquidateTarget) {
        client.setLiquidateTarget(null);
        return;
      }
      if (client.aiScanState.open) {
        client.setAiScanState((prev) => ({ ...prev, open: false }));
        return;
      }
      if (client.moveSheetTarget) {
        client.setMoveSheetTarget(null);
        return;
      }
      if (client.filterSheetOpen) {
        client.setFilterSheetOpen(false);
        return;
      }
      if (client.stockSheetTarget) {
        client.setStockSheetTarget(null);
        return;
      }
      if (client.currentScreen === 'MOB-00' && qrModalOpen) {
        setQrModalOpen(false);
        return;
      }
      if (fabMenuOpen) {
        setFabMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    client.aiScanState.open,
    client.currentScreen,
    client.filterSheetOpen,
    client.liquidateTarget,
    client.moveSheetTarget,
    client.setAiScanState,
    client.setFilterSheetOpen,
    client.setLiquidateTarget,
    client.setMoveSheetTarget,
    client.setStockSheetTarget,
    client.stockSheetTarget,
    fabMenuOpen,
    qrModalOpen,
  ]);

  const masterLots =
    client.allInventoryItems.length > 0
      ? client.allInventoryItems
      : client.snapshot.cache.inventory_items;

  const aiPresets = useMemo(() => client.getAiPresets(), [client.getAiPresets]);
  const existingFoodCodes = useMemo(
    () => masterLots.map((lot) => lot.food_code),
    [masterLots],
  );
  const visibleInventoryItems = useMemo(() => {
    if (!client.isOfflineReadOnly) {
      return client.inventoryItems;
    }
    return filterCachedFoodLots(
      masterLots,
      client.inventoryFilter,
      client.systemConfig.warning_days_threshold,
    );
  }, [
    client.inventoryFilter,
    client.inventoryItems,
    client.isOfflineReadOnly,
    client.systemConfig.warning_days_threshold,
    masterLots,
  ]);

  const alertBadgeCount = client.alerts?.total_alert_badge_count ?? 0;

  return (
    <MobileShell
      currentScreen={client.currentScreen}
      hasEnteredShell={client.hasEnteredShell}
      canNavigateBack={client.canNavigateBack}
      connectionState={client.snapshot.connection_state}
      simulatedOffline={client.snapshot.simulated_network_offline}
      effectiveDate={client.effectiveDate}
      lastSyncedAt={client.snapshot.cache.last_synced_at}
      lastErrorMessage={client.snapshot.last_error_message}
      isSyncing={client.isSyncing}
      alertBadgeCount={alertBadgeCount}
      toastMessage={client.toastMessage}
      fabMenuOpen={fabMenuOpen}
      onFabMenuOpenChange={setFabMenuOpen}
      onDismissToast={client.dismissToast}
      onBack={client.navigateBack}
      onSync={() => {
        void client.refreshAllData({ silent: false, source: 'manual' });
      }}
      onRetryConnection={() => {
        void client.retryConnection();
      }}
      onOpenConnectScreen={client.openConnectScreen}
      onSelectTab={client.navigateToTab}
      onOpenManualAdd={() => client.openFoodFormCreate()}
      onOpenAiScan={() => client.setAiScanState({ open: true, origin: 'fab' })}
    >
      {client.currentScreen === 'MOB-00' && (
        <ConnectServerScreen
          snapshot={client.snapshot}
          hasEnteredShell={client.hasEnteredShell}
          qrModalOpen={qrModalOpen}
          onQrModalOpenChange={setQrModalOpen}
          onConnect={client.connectToServer}
          onEnterOfflineMode={client.enterOfflineMode}
          onBackToApp={client.navigateBack}
        />
      )}

      {client.currentScreen === 'MOB-01' && (
        <HomeFefoScreen
          items={client.visibleFefoItems}
          countsByPriority={client.fefoCountsByPriority}
          expiredExcludedCount={client.fefoResult?.expired_excluded_count ?? 0}
          selectedArea={client.fefoAreaFilter}
          selectedPriority={client.fefoPriorityFilter}
          alerts={client.alerts}
          recipes={client.recipes}
          warningDaysThreshold={client.systemConfig.warning_days_threshold}
          isLoading={client.isInitialLoading}
          isSyncing={client.isSyncing}
          isOfflineReadOnly={client.isOfflineReadOnly}
          onRefresh={() => {
            void client.refreshAllData({ silent: false, source: 'manual' });
          }}
          onChangeFilter={(area, priority) => {
            void client.applyFefoFilter(area, priority);
          }}
          onOpenAlerts={() => client.navigateToTab('MOB-05')}
          onOpenItemDetail={client.openItemDetail}
          onQuickUseOne={async (item) => {
            const res = await client.submitUseFood(
              item.item_id,
              1,
              'Dùng nhanh 1 chạm theo FEFO',
              item.current_quantity,
            );
            if (!res.ok) {
              client.showToast(res.error.message);
            }
          }}
          onQuickUse={(item) => {
            const matchedLot = masterLots.find((lot) => lot.item_id === item.item_id);
            client.setStockSheetTarget({
              item: {
                item_id: item.item_id,
                food_name: item.food_name,
                current_quantity: item.current_quantity,
                unit_name: item.unit_name,
                expiry_date: item.expiry_date,
                min_threshold: item.min_threshold,
                status: matchedLot?.status ?? 'Đang sử dụng',
              },
              initialMode: 'use',
              defaultReason: 'Ưu tiên dùng theo FEFO',
            });
          }}
          onOpenRecipes={(focusItemId) => {
            void client.openRecipesScreen(focusItemId);
          }}
          onOpenCreateFood={() => client.openFoodFormCreate()}
        />
      )}

      {client.currentScreen === 'MOB-02' && (
        <MobileInventoryScreen
          items={visibleInventoryItems}
          filter={client.inventoryFilter}
          activeFilterCount={client.activeFilterCount}
          catalogs={client.catalogs}
          warningDaysThreshold={client.systemConfig.warning_days_threshold}
          isLoading={client.isInitialLoading}
          errorMessage={client.inventoryError}
          isOfflineReadOnly={client.isOfflineReadOnly}
          onUpdateFilter={(nextFilter) => {
            void client.applyInventoryFilter(nextFilter);
          }}
          onOpenFilterSheet={() => client.setFilterSheetOpen(true)}
          onRetryLoad={() => {
            void client.refreshAllData({ silent: false, source: 'manual' });
          }}
          onOpenItemDetail={client.openItemDetail}
          onQuickStockAction={(lot, mode) => {
            client.setStockSheetTarget({
              item: {
                item_id: lot.item_id,
                food_name: lot.food_name,
                current_quantity: lot.current_quantity,
                unit_name: lot.unit_name,
                expiry_date: lot.expiry_date,
                min_threshold: lot.min_threshold,
                status: lot.status,
              },
              initialMode: mode,
            });
          }}
          onOpenCreateFood={() => client.openFoodFormCreate()}
        />
      )}

      {client.currentScreen === 'MOB-03' && (
        <FoodDetailScreen
          detail={client.selectedItemDetail}
          errorMessage={client.itemDetailError}
          warningDaysThreshold={client.systemConfig.warning_days_threshold}
          isOfflineReadOnly={client.isOfflineReadOnly}
          onBack={client.navigateBack}
          onOpenStockSheet={(lot, mode) => {
            client.setStockSheetTarget({
              item: {
                item_id: lot.item_id,
                food_name: lot.food_name,
                current_quantity: lot.current_quantity,
                unit_name: lot.unit_name,
                expiry_date: lot.expiry_date,
                min_threshold: lot.min_threshold,
                status: lot.status,
              },
              initialMode: mode,
            });
          }}
          onOpenMoveSheet={(lot) => {
            client.setMoveSheetTarget({
              item_id: lot.item_id,
              food_name: lot.food_name,
              area_type: lot.area_type,
              location_id: lot.location_id,
              location_name: lot.location_name,
              status: lot.status,
            });
          }}
          onOpenEditForm={client.openFoodFormEdit}
          onOpenLiquidateDialog={(lot) => {
            client.setLiquidateTarget({
              item_id: lot.item_id,
              food_name: lot.food_name,
              current_quantity: lot.current_quantity,
              unit_name: lot.unit_name,
              expiry_date: lot.expiry_date,
              defaultReason: lot.is_expired ? 'Hết hạn sử dụng' : 'Hư hỏng / ôi thiu',
            });
          }}
          onOpenRecipes={(itemId) => {
            void client.openRecipesScreen(itemId);
          }}
          onCreateNewBatch={(lot) => {
            client.openFoodFormCreate({
              mergeIntoFoodId: lot.food_id,
              mergeTargetName: lot.food_name,
              prefillCode: lot.food_code,
              prefillCategoryId: lot.category_id,
              prefillUnitId: lot.unit_id,
              prefillBrand: lot.brand ?? '',
              prefillDescription: lot.description ?? '',
              prefillMinThreshold: lot.min_threshold,
            });
          }}
        />
      )}

      {client.currentScreen === 'MOB-04' && (
        <RecipesMenuScreen
          recipes={client.recipes}
          focusItemId={client.recipesFocusItemId}
          isOfflineReadOnly={client.isOfflineReadOnly}
          onClearFocus={() => {
            void client.openRecipesScreen(undefined);
          }}
          onQuickUseIngredient={(
            itemId,
            foodName,
            availableQty,
            requiredQty,
            unitName,
            expiryDate,
            recipeName,
          ) => {
            const matchedLot = masterLots.find((lot) => lot.item_id === itemId);
            client.setStockSheetTarget({
              item: {
                item_id: itemId,
                food_name: foodName,
                current_quantity: availableQty,
                unit_name: unitName,
                expiry_date: expiryDate,
                min_threshold: matchedLot?.min_threshold ?? 0,
                status: matchedLot?.status ?? 'Đang sử dụng',
              },
              initialMode: 'use',
              initialQuantity: Math.min(availableQty, requiredQty),
              defaultReason: `Nấu món ${recipeName}`,
            });
          }}
          onCookRecipe={client.submitCookRecipe}
        />
      )}

      {client.currentScreen === 'MOB-05' && (
        <MobileAlertsScreen
          alerts={client.alerts}
          isLoading={client.isInitialLoading}
          isOfflineReadOnly={client.isOfflineReadOnly}
          onOpenItemDetail={client.openItemDetail}
          onDisposeExpired={(item) => {
            client.setLiquidateTarget({
              item_id: item.item_id,
              food_name: item.food_name,
              current_quantity: item.current_quantity,
              unit_name: item.unit_name,
              expiry_date: item.expiry_date,
              defaultReason: 'Hết hạn sử dụng',
            });
          }}
          onUseExpiringSoon={(item) => {
            const matchedLot = masterLots.find((lot) => lot.item_id === item.item_id);
            client.setStockSheetTarget({
              item: {
                item_id: item.item_id,
                food_name: item.food_name,
                current_quantity: item.current_quantity,
                unit_name: item.unit_name,
                expiry_date: item.expiry_date,
                min_threshold: item.min_threshold,
                status: matchedLot?.status ?? 'Đang sử dụng',
              },
              initialMode: 'use',
              defaultReason: 'Ưu tiên dùng đồ sắp hết hạn',
            });
          }}
          onOpenRecipes={(itemId) => {
            void client.openRecipesScreen(itemId);
          }}
          onRestockItem={(item) => {
            client.setStockSheetTarget({
              item: {
                item_id: item.item_id,
                food_name: item.food_name,
                current_quantity: item.current_quantity,
                unit_name: item.unit_name,
                expiry_date: item.expiry_date,
                min_threshold: item.min_threshold,
                status: item.status,
              },
              initialMode: 'restock',
              initialQuantity: item.suggested_buy_quantity,
              defaultReason: 'Mua bổ sung theo cảnh báo tồn kho',
            });
          }}
          onCreateNewBatch={(item) => {
            const matchedLot = masterLots.find((lot) => lot.food_id === item.food_id);
            const matchedCategory = client.catalogs.categories.find(
              (c) => c.category_name === item.category_name,
            );
            const matchedUnit = client.catalogs.units.find((u) => u.unit_name === item.unit_name);
            client.openFoodFormCreate({
              mergeIntoFoodId: item.food_id,
              mergeTargetName: item.food_name,
              prefillCode: item.food_code,
              prefillCategoryId: matchedLot?.category_id ?? matchedCategory?.category_id,
              prefillUnitId: matchedLot?.unit_id ?? matchedUnit?.unit_id,
              prefillBrand: matchedLot?.brand ?? '',
              prefillDescription: matchedLot?.description ?? '',
              prefillMinThreshold: item.min_threshold,
            });
          }}
        />
      )}

      {client.currentScreen === 'MOB-06' &&
        (client.foodFormDraft ? (
          <FoodFormScreen
            draft={client.foodFormDraft}
            catalogs={client.catalogs}
            existingFoodCodes={existingFoodCodes}
            isOfflineReadOnly={client.isOfflineReadOnly}
            onUpdateValues={client.updateFoodFormValues}
            onOpenAiScan={() => client.setAiScanState({ open: true, origin: 'form' })}
            onSubmit={client.submitFoodForm}
            onCancel={client.cancelFoodForm}
          />
        ) : (
          <main className="mob-main-scroll-no-nav" data-testid="mob-screen-MOB-06">
            <div className="mob-empty-box">
              <p className="t-meta" style={{ margin: 0 }}>
                Chưa có phiên nhập liệu nào đang mở.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => client.openFoodFormCreate()}
              >
                Tạo lô thực phẩm mới
              </button>
              <button type="button" className="btn btn-ghost" onClick={client.navigateBack}>
                Quay lại
              </button>
            </div>
          </main>
        ))}

      {client.currentScreen === 'MOB-07' && (
        <MobileStatsSettingsScreen
          snapshot={client.snapshot}
          systemConfig={client.systemConfig}
          effectiveDate={client.effectiveDate}
          catalogs={client.catalogs}
          statsRange={client.statsRange}
          stats={client.stats}
          auditActionFilter={client.auditActionFilter}
          auditLogs={client.auditLogs}
          isLoadingStats={client.isInitialLoading}
          isSyncing={client.isSyncing}
          isOfflineReadOnly={client.isOfflineReadOnly}
          onChangeStatsRange={(range) => {
            void client.changeStatsRange(range);
          }}
          onChangeAuditFilter={(action) => {
            void client.changeAuditFilter(action);
          }}
          onOpenItemDetail={client.openItemDetail}
          onSyncNow={() => {
            void client.refreshAllData({ silent: false, source: 'manual' });
          }}
          onOpenConnectScreen={client.openConnectScreen}
          onDisconnect={client.disconnectFromServer}
          onToggleSimulatedOffline={client.toggleSimulatedOffline}
          onSetFaultOverride={client.setClientFaultOverride}
        />
      )}

      {/* Bottom Sheets & Confirmation Dialog (MOB-S01 .. MOB-S05) */}
      <StockActionSheet
        target={client.stockSheetTarget}
        isOfflineReadOnly={client.isOfflineReadOnly}
        onClose={() => client.setStockSheetTarget(null)}
        onUseFood={client.submitUseFood}
        onRestockFood={client.submitRestockFood}
        onAdjustFood={client.submitAdjustFood}
      />

      <FilterBottomSheet
        open={client.filterSheetOpen}
        initialFilter={client.inventoryFilter}
        catalogs={client.catalogs}
        onClose={() => client.setFilterSheetOpen(false)}
        onApply={(nextFilter) => {
          void client.applyInventoryFilter(nextFilter);
        }}
      />

      <MoveLocationSheet
        target={client.moveSheetTarget}
        locations={client.catalogs.storage_locations}
        isOfflineReadOnly={client.isOfflineReadOnly}
        onClose={() => client.setMoveSheetTarget(null)}
        onSubmit={client.submitMoveLocation}
      />

      <AiScanSheet
        open={client.aiScanState.open}
        presets={aiPresets}
        catalogs={client.catalogs}
        isOfflineReadOnly={client.isOfflineReadOnly}
        onClose={() =>
          client.setAiScanState((prev) => ({
            ...prev,
            open: false,
          }))
        }
        onScan={client.runAiScan}
        onApplyResult={client.applyAiScanToForm}
        onFallbackManual={client.openManualFormAfterAiFailure}
      />

      <LiquidateDialog
        target={client.liquidateTarget}
        isOfflineReadOnly={client.isOfflineReadOnly}
        onClose={() => client.setLiquidateTarget(null)}
        onConfirm={client.submitCancelFoodItem}
      />
    </MobileShell>
  );
}

export default App;
