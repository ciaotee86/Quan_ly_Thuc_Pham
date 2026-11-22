import { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { AuditLogFilter, FoodSearchFilter } from '@food-mgmt/shared-sim';
import { useDesktopServer } from './state/useDesktopServer';
import { WindowShell } from './components/WindowShell';
import { FoodDetailDrawer } from './components/FoodDetailDrawer';
import { FoodFormModal } from './components/FoodFormModal';
import { InventoryActionModal } from './components/InventoryActionModal';
import { RecipeDetailModal } from './components/RecipeDetailModal';
import { LiquidateConfirmModal } from './components/LiquidateConfirmModal';
import { CatalogFormModal } from './components/CatalogFormModal';
import { SystemTrayPopover } from './components/SystemTrayPopover';
import { ToastBanner } from './components/ToastBanner';
import { DashboardServerScreen } from './screens/DashboardServerScreen';
import { FefoRecipesScreen } from './screens/FefoRecipesScreen';
import { InventoryScreen } from './screens/InventoryScreen';
import { AlertsCenterScreen } from './screens/AlertsCenterScreen';
import { AuditLogScreen } from './screens/AuditLogScreen';
import { CatalogsScreen } from './screens/CatalogsScreen';
import { SettingsScreen } from './screens/SettingsScreen';

const EMPTY_INVENTORY_FILTER: FoodSearchFilter = {
  keyword: '',
  category_id: 'all',
  area_type: 'all',
  location_id: 'all',
  stock_status: 'all',
  expiry_status: 'all',
  sort_by: 'expiry_date',
  sort_dir: 'asc',
};

const EMPTY_AUDIT_FILTER: AuditLogFilter = {
  keyword: '',
  action_type: 'all',
  actor_device: 'all',
  start_date: '',
  end_date: '',
};

export function App() {
  const ctrl = useDesktopServer();
  const allLots = ctrl.allLots;

  // Global Desktop Keyboard Shortcuts (34-desktop-app-design)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditingText =
        target !== null &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (event.key === 'Escape') {
        if (ctrl.pendingLeaveTarget) {
          ctrl.setPendingLeaveTarget(null);
          return;
        }
        if (ctrl.foodFormModal.open) {
          ctrl.setFoodFormModal({ open: false });
          return;
        }
        if (ctrl.actionModal.open) {
          ctrl.setActionModal({ open: false });
          return;
        }
        if (ctrl.recipeModal.open) {
          ctrl.setRecipeModal({ open: false });
          return;
        }
        if (ctrl.liquidateModal.open) {
          ctrl.setLiquidateModal({ open: false });
          return;
        }
        if (ctrl.catalogModal.open) {
          ctrl.setCatalogModal({ open: false });
          return;
        }
        if (ctrl.trayPopoverOpen) {
          ctrl.setTrayPopoverOpen(false);
          return;
        }
        if (ctrl.drawerItemId !== null) {
          ctrl.closeDrawer();
        }
        return;
      }

      if (event.key === 'F5' && !isEditingText) {
        event.preventDefault();
        void ctrl.refreshAllViews(true);
        return;
      }

      if (!(event.ctrlKey || event.metaKey)) return;

      const keyLower = event.key.toLowerCase();
      if (keyLower === 'n') {
        event.preventDefault();
        ctrl.setFoodFormModal({ open: true, mode: 'create' });
      } else if (keyLower === 'f') {
        event.preventDefault();
        ctrl.navigateTo('DSK-03');
        window.setTimeout(() => {
          const searchEl = document.querySelector<HTMLInputElement>(
            '[data-testid="dsk-inv-search"]',
          );
          searchEl?.focus();
          searchEl?.select();
        }, 40);
      } else if (keyLower === ',') {
        event.preventDefault();
        ctrl.navigateTo('DSK-07');
      } else if (keyLower === 'b' && !isEditingText) {
        event.preventDefault();
        ctrl.setSidebarCollapsed((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [ctrl]);

  const isMinimizedOrExited = ctrl.status.runtime.minimized_to_tray || ctrl.serverFullyExited;

  const trayElement = (
    <SystemTrayPopover
      open={ctrl.trayPopoverOpen}
      minimizedToTray={ctrl.status.runtime.minimized_to_tray}
      serverFullyExited={ctrl.serverFullyExited}
      status={ctrl.status}
      onClosePopover={() => ctrl.setTrayPopoverOpen(false)}
      onRestoreWindow={(screen) => ctrl.restoreFromTray(screen)}
      onToggleServer={ctrl.toggleServerRunning}
      onExitServer={ctrl.exitServerCompletely}
      onReopenAfterExit={ctrl.reopenAfterExit}
      onSimulateMobileUse={() => {
        void ctrl.simulateClientUseTopFefo();
      }}
    />
  );

  if (isMinimizedOrExited) {
    return (
      <>
        {trayElement}
        <ToastBanner toasts={ctrl.toasts} onDismiss={ctrl.dismissToast} />
      </>
    );
  }

  return (
    <>
      <WindowShell
        status={ctrl.status}
        activeScreen={ctrl.activeScreen}
        sidebarCollapsed={ctrl.sidebarCollapsed}
        trayPopoverOpen={ctrl.trayPopoverOpen}
        dbErrorMessage={ctrl.dbErrorMessage}
        onToggleSidebar={() => ctrl.setSidebarCollapsed((prev) => !prev)}
        onNavigate={(screen) => ctrl.navigateTo(screen)}
        onShiftDate={(deltaDays, targetDate, reset) => {
          void ctrl.shiftDate({
            delta_days: deltaDays,
            target_date: targetDate,
            reset_to_default: reset,
          });
        }}
        onMinimizeToTray={ctrl.minimizeToTray}
        onToggleTrayPopover={() => ctrl.setTrayPopoverOpen((prev) => !prev)}
        onRecoverDb={ctrl.toggleDbHealthy}
        drawer={
          <FoodDetailDrawer
            open={ctrl.drawerItemId !== null}
            loading={ctrl.drawerLoading}
            detail={ctrl.drawerDetail}
            warningDaysThreshold={ctrl.status.system_config.warning_days_threshold}
            dbHealthy={ctrl.status.runtime.db_healthy}
            onClose={ctrl.closeDrawer}
            onUseFood={() => {
              if (!ctrl.drawerDetail) return;
              ctrl.setActionModal({
                open: true,
                lot: ctrl.drawerDetail.item,
                initialMode: 'use',
              });
            }}
            onRestockOrAdjust={() => {
              if (!ctrl.drawerDetail) return;
              ctrl.setActionModal({
                open: true,
                lot: ctrl.drawerDetail.item,
                initialMode: 'restock',
              });
            }}
            onEdit={() => {
              if (!ctrl.drawerDetail) return;
              ctrl.setFoodFormModal({
                open: true,
                mode: 'edit',
                lot: ctrl.drawerDetail.item,
              });
            }}
            onLiquidate={() => {
              if (!ctrl.drawerDetail) return;
              ctrl.setLiquidateModal({
                open: true,
                lot: ctrl.drawerDetail.item,
              });
            }}
            onOpenFullAuditLog={(itemCode) => {
              ctrl.setAuditFilter({
                ...EMPTY_AUDIT_FILTER,
                keyword: itemCode,
              });
              ctrl.closeDrawer();
              ctrl.navigateTo('DSK-05');
            }}
          />
        }
      >
        {ctrl.activeScreen === 'DSK-01' ? (
          <DashboardServerScreen
            status={ctrl.status}
            stats={ctrl.stats}
            statsQuery={ctrl.statsQuery}
            fefo={ctrl.fefo}
            alerts={ctrl.alerts}
            allLots={allLots}
            isLoading={ctrl.isLoadingData}
            qrModalOpen={ctrl.qrModalOpen}
            onToggleQrModal={() => ctrl.setQrModalOpen((prev) => !prev)}
            onChangeStatsQuery={ctrl.setStatsQuery}
            onNavigate={(screen) => ctrl.navigateTo(screen)}
            onNavigateAlerts={(tab) => {
              ctrl.setAlertsTab(tab);
              ctrl.navigateTo('DSK-04');
            }}
            onOpenAddFood={() => ctrl.setFoodFormModal({ open: true, mode: 'create' })}
            onOpenUseFood={(lot) =>
              ctrl.setActionModal({ open: true, lot, initialMode: 'use' })
            }
            onOpenDrawer={ctrl.openDrawer}
            onToggleServerRunning={ctrl.toggleServerRunning}
            onToggleDbHealthy={ctrl.toggleDbHealthy}
            onSetFaultMode={ctrl.setFaultMode}
            onClearPacketLogs={() => {
              ctrl.node.clearPacketLogs();
              ctrl.pushToast('info', 'Đã xóa Packet Trace Console');
            }}
            onKickClient={(clientId) => {
              ctrl.node.disconnectClient(clientId);
              ctrl.pushToast('warning', 'Đã ngắt kết nối phiên Mobile Client');
            }}
            onSimulatePing={() => {
              void ctrl.simulateClientPing();
            }}
            onSimulateUse={() => {
              void ctrl.simulateClientUseTopFefo();
            }}
          />
        ) : null}

        {ctrl.activeScreen === 'DSK-02' ? (
          <FefoRecipesScreen
            fefo={ctrl.fefo}
            recipes={ctrl.recipes}
            catalogs={ctrl.catalogs}
            systemConfig={ctrl.status.system_config}
            allLots={allLots}
            dbHealthy={ctrl.status.runtime.db_healthy}
            filter={ctrl.fefoFilter}
            onChangeFilter={ctrl.setFefoFilter}
            onOpenUseModal={(lot) =>
              ctrl.setActionModal({ open: true, lot, initialMode: 'use' })
            }
            onOpenRecipeModal={(focusItemId, initialRecipeId) =>
              ctrl.setRecipeModal({
                open: true,
                focusItemId,
                initialRecipeId,
              })
            }
            onOpenDrawer={ctrl.openDrawer}
            onGoToAlerts={() => {
              ctrl.setAlertsTab('expiry');
              ctrl.navigateTo('DSK-04');
            }}
          />
        ) : null}

        {ctrl.activeScreen === 'DSK-03' ? (
          <InventoryScreen
            inventory={ctrl.inventory}
            totalWarehouseCount={allLots.length}
            catalogs={ctrl.catalogs}
            systemConfig={ctrl.status.system_config}
            filter={ctrl.inventoryFilter}
            selectedItemId={ctrl.drawerItemId}
            isLoading={ctrl.isLoadingData}
            dbError={ctrl.dbErrorMessage}
            dbHealthy={ctrl.status.runtime.db_healthy}
            onChangeFilter={ctrl.setInventoryFilter}
            onResetFilters={() => ctrl.setInventoryFilter(EMPTY_INVENTORY_FILTER)}
            onRefresh={() => {
              void ctrl.refreshAllViews(true);
            }}
            onOpenAddFood={(openAiHelper) =>
              ctrl.setFoodFormModal({ open: true, mode: 'create', openAiHelper })
            }
            onOpenEditFood={(lot) =>
              ctrl.setFoodFormModal({ open: true, mode: 'edit', lot })
            }
            onOpenActionModal={(lot, mode) =>
              ctrl.setActionModal({ open: true, lot, initialMode: mode })
            }
            onOpenLiquidate={(lot) => ctrl.setLiquidateModal({ open: true, lot })}
            onSelectRow={ctrl.openDrawer}
          />
        ) : null}

        {ctrl.activeScreen === 'DSK-04' ? (
          <AlertsCenterScreen
            alerts={ctrl.alerts}
            activeTab={ctrl.alertsTab}
            allLots={allLots}
            dbHealthy={ctrl.status.runtime.db_healthy}
            onChangeTab={ctrl.setAlertsTab}
            onManualScan={ctrl.triggerManualAlertScan}
            onOpenUseModal={(lot) =>
              ctrl.setActionModal({ open: true, lot, initialMode: 'use' })
            }
            onOpenRestockModal={(lot, suggestedQty) =>
              ctrl.setActionModal({
                open: true,
                lot,
                initialMode: 'restock',
                defaultQuantity: suggestedQty,
                defaultReason: 'Mua bù tồn kho tối thiểu',
              })
            }
            onOpenCreateLot={() => ctrl.setFoodFormModal({ open: true, mode: 'create' })}
            onOpenLiquidateModal={(lot) => ctrl.setLiquidateModal({ open: true, lot })}
            onOpenRecipeModal={(itemId) =>
              ctrl.setRecipeModal({ open: true, focusItemId: itemId })
            }
            onOpenDrawer={ctrl.openDrawer}
            onNotify={(kind, title, detail) => ctrl.pushToast(kind, title, detail)}
          />
        ) : null}

        {ctrl.activeScreen === 'DSK-05' ? (
          <AuditLogScreen
            auditLogs={ctrl.auditLogs}
            filter={ctrl.auditFilter}
            selectedItemId={ctrl.drawerItemId}
            onChangeFilter={ctrl.setAuditFilter}
            onResetFilters={() => ctrl.setAuditFilter(EMPTY_AUDIT_FILTER)}
            onSelectTransactionItem={ctrl.openDrawer}
          />
        ) : null}

        {ctrl.activeScreen === 'DSK-06' ? (
          <CatalogsScreen
            activeTab={ctrl.catalogsTab}
            catalogs={ctrl.catalogs}
            referenceCounts={ctrl.referenceCounts}
            dbHealthy={ctrl.status.runtime.db_healthy}
            onChangeTab={ctrl.setCatalogsTab}
            onOpenModal={(state) => ctrl.setCatalogModal(state)}
            onDeleteCategory={ctrl.deleteCategoryItem}
            onDeleteUnit={ctrl.deleteUnitItem}
            onDeleteLocation={ctrl.deleteLocationItem}
            onDeleteRecipe={ctrl.deleteRecipeItem}
            onNotify={(kind, title, detail) => ctrl.pushToast(kind, title, detail)}
          />
        ) : null}

        {ctrl.activeScreen === 'DSK-07' ? (
          <SettingsScreen
            activeTab={ctrl.settingsTab}
            status={ctrl.status}
            isDirty={ctrl.settingsDirty}
            onChangeTab={ctrl.setSettingsTab}
            onDirtyChange={ctrl.setSettingsDirty}
            onSaveConfig={ctrl.saveSystemConfig}
            onToggleServerRunning={ctrl.toggleServerRunning}
            onToggleDbHealthy={ctrl.toggleDbHealthy}
            onSetFaultMode={ctrl.setFaultMode}
            onResetDemoData={ctrl.resetDemoDatabase}
            onNotify={(kind, title, detail) => ctrl.pushToast(kind, title, detail)}
          />
        ) : null}
      </WindowShell>

      {/* Modals DSK-M01..DSK-M05 */}
      <FoodFormModal
        open={ctrl.foodFormModal.open}
        mode={ctrl.foodFormModal.open ? ctrl.foodFormModal.mode : 'create'}
        lot={ctrl.foodFormModal.open ? ctrl.foodFormModal.lot : undefined}
        initialOpenAi={ctrl.foodFormModal.open ? ctrl.foodFormModal.openAiHelper : false}
        catalogs={ctrl.catalogs}
        allFoods={ctrl.allFoods}
        systemConfig={ctrl.status.system_config}
        effectiveDate={ctrl.status.effective_date}
        aiPresets={ctrl.aiPresets}
        node={ctrl.node}
        onClose={() => ctrl.setFoodFormModal({ open: false })}
        onSubmitCreate={ctrl.createFood}
        onSubmitUpdate={ctrl.updateFood}
        onSuccess={(message, itemId) => {
          ctrl.setFoodFormModal({ open: false });
          ctrl.pushToast('success', message);
          ctrl.openDrawer(itemId);
        }}
      />

      <InventoryActionModal
        open={ctrl.actionModal.open}
        lot={ctrl.actionModal.open ? ctrl.actionModal.lot : null}
        initialMode={ctrl.actionModal.open ? ctrl.actionModal.initialMode : 'use'}
        defaultQuantity={ctrl.actionModal.open ? ctrl.actionModal.defaultQuantity : undefined}
        defaultReason={ctrl.actionModal.open ? ctrl.actionModal.defaultReason : undefined}
        catalogs={ctrl.catalogs}
        onClose={() => ctrl.setActionModal({ open: false })}
        onExecAction={ctrl.execDesktopAction}
        onSuccess={(message) => {
          ctrl.setActionModal({ open: false });
          ctrl.pushToast('success', message);
        }}
      />

      <RecipeDetailModal
        open={ctrl.recipeModal.open}
        focusItemId={ctrl.recipeModal.open ? ctrl.recipeModal.focusItemId : undefined}
        initialRecipeId={ctrl.recipeModal.open ? ctrl.recipeModal.initialRecipeId : undefined}
        recipes={ctrl.recipes}
        allLots={allLots}
        onClose={() => ctrl.setRecipeModal({ open: false })}
        onCookRecipe={ctrl.cookRecipe}
        onOpenUseLotModal={(lot, suggestedQty, reason) => {
          ctrl.setRecipeModal({ open: false });
          ctrl.setActionModal({
            open: true,
            lot,
            initialMode: 'use',
            defaultQuantity: suggestedQty,
            defaultReason: reason,
          });
        }}
        onOpenCatalogRecipes={() => {
          ctrl.setRecipeModal({ open: false });
          ctrl.setCatalogsTab('recipes');
          ctrl.navigateTo('DSK-06');
        }}
        onSuccess={(message) => {
          ctrl.setRecipeModal({ open: false });
          ctrl.pushToast('success', message);
        }}
      />

      <LiquidateConfirmModal
        open={ctrl.liquidateModal.open}
        lot={ctrl.liquidateModal.open ? ctrl.liquidateModal.lot : null}
        onClose={() => ctrl.setLiquidateModal({ open: false })}
        onExecAction={ctrl.execDesktopAction}
        onSuccess={(message) => {
          ctrl.setLiquidateModal({ open: false });
          ctrl.pushToast('warning', message);
        }}
      />

      <CatalogFormModal
        modalState={ctrl.catalogModal}
        catalogs={ctrl.catalogs}
        allFoods={ctrl.allFoods}
        onClose={() => ctrl.setCatalogModal({ open: false })}
        onSaveCategory={ctrl.saveCategoryItem}
        onSaveUnit={ctrl.saveUnitItem}
        onSaveLocation={ctrl.saveLocationItem}
        onSaveRecipe={ctrl.saveRecipeItem}
        onSuccess={(message) => {
          ctrl.setCatalogModal({ open: false });
          ctrl.pushToast('success', message);
        }}
      />

      {/* Unsaved Settings Guard Dialog */}
      {ctrl.pendingLeaveTarget ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) ctrl.setPendingLeaveTarget(null);
          }}
        >
          <section
            className="modal-dialog modal-sm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="dsk-unsaved-title"
            data-testid="dsk-unsaved-settings-dialog"
          >
            <header className="modal-header">
              <div className="inline-icon-text">
                <AlertTriangle size={16} className="text-warn-strong" />
                <h2 id="dsk-unsaved-title" className="t-panel-title">
                  Cài đặt chưa được lưu
                </h2>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => ctrl.setPendingLeaveTarget(null)}
                aria-label="Đóng"
              >
                <X size={15} />
              </button>
            </header>
            <div className="modal-body">
              <p className="t-body">
                Bạn đã chỉnh sửa tham số trong Cài đặt hệ thống (DSK-07) nhưng chưa bấm Lưu.
                Nếu rời trang ngay, các thay đổi tạm thời sẽ bị bỏ qua.
              </p>
            </div>
            <footer className="modal-footer modal-footer-win">
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  const target = ctrl.pendingLeaveTarget;
                  if (target) ctrl.navigateTo(target, true);
                }}
                data-testid="dsk-leave-discard-btn"
              >
                Bỏ thay đổi & Rời trang
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => ctrl.setPendingLeaveTarget(null)}
                data-testid="dsk-leave-stay-btn"
              >
                Ở lại trang
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {/* DSK-M06 System Tray Floating Popover */}
      {trayElement}

      {/* Toast Notification Stack */}
      <ToastBanner toasts={ctrl.toasts} onDismiss={ctrl.dismissToast} />
    </>
  );
}

export default App;
