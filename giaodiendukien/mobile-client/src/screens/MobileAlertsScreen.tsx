import { useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  ChefHat,
  PackagePlus,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import type { AlertsSummary, ExpiryAlertItem, StockAlertItem } from '@food-mgmt/shared-sim';
import {
  formatDaysRemainingLabel,
  formatIsoDateShort,
} from '../domain/food-lot-presentation';

interface MobileAlertsScreenProps {
  alerts: AlertsSummary | null;
  isLoading: boolean;
  isOfflineReadOnly: boolean;
  onOpenItemDetail: (itemId: number) => void;
  onDisposeExpired: (item: ExpiryAlertItem) => void;
  onUseExpiringSoon: (item: ExpiryAlertItem) => void;
  onOpenRecipes: (itemId: number) => void;
  onRestockItem: (item: StockAlertItem) => void;
  onCreateNewBatch: (item: StockAlertItem) => void;
}

export function MobileAlertsScreen({
  alerts,
  isLoading,
  isOfflineReadOnly,
  onOpenItemDetail,
  onDisposeExpired,
  onUseExpiringSoon,
  onOpenRecipes,
  onRestockItem,
  onCreateNewBatch,
}: MobileAlertsScreenProps) {
  const [activeSegment, setActiveSegment] = useState<'expiry' | 'stock'>('expiry');

  const expiredItems = alerts?.expired_items ?? [];
  const expiringSoonItems = alerts?.expiring_soon_items ?? [];
  const lowStockItems = alerts?.low_stock_items ?? [];
  const expiryCount = expiredItems.length + expiringSoonItems.length;
  const stockCount = lowStockItems.length;

  return (
    <main className="mob-main-scroll" data-testid="mob-screen-MOB-05">
      {/* 2-Segment Control */}
      <div className="mob-segmented" role="tablist" aria-label="Phân nhóm cảnh báo">
        <button
          type="button"
          role="tab"
          aria-selected={activeSegment === 'expiry'}
          className="mob-segment-btn"
          data-testid="mob-alerts-seg-expiry"
          onClick={() => setActiveSegment('expiry')}
        >
          <AlertTriangle size={16} aria-hidden="true" />
          <span>Hết & Cận hạn ({expiryCount})</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSegment === 'stock'}
          className="mob-segment-btn"
          data-testid="mob-alerts-seg-stock"
          onClick={() => setActiveSegment('stock')}
        >
          <ShoppingCart size={16} aria-hidden="true" />
          <span>Cần mua ({stockCount})</span>
        </button>
      </div>

      {isLoading && !alerts ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
          {[1, 2, 3].map((k) => (
            <div key={k} className="mob-skeleton" style={{ height: 110 }} />
          ))}
        </div>
      ) : activeSegment === 'expiry' ? (
        expiryCount === 0 ? (
          <div className="mob-empty-box" data-testid="mob-alerts-all-clear">
            <CheckCircle2 size={32} style={{ color: 'var(--status-fresh-base)' }} aria-hidden="true" />
            <h2 className="t-card-title">Không có đồ hết hạn hay cận hạn</h2>
            <p className="t-meta" style={{ margin: 0 }}>
              Tất cả lô thực phẩm đang dùng đều còn hạn an toàn.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
            {/* Group 1: Expired Items */}
            {expiredItems.length > 0 && (
              <section aria-label="Thực phẩm đã hết hạn">
                <div className="mob-section-head" style={{ marginBottom: 'var(--sp-2)' }}>
                  <h2
                    className="mob-section-label"
                    style={{
                      color: 'var(--status-expired-ink)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <AlertOctagon size={18} aria-hidden="true" />
                    <span>Đã hết hạn ({expiredItems.length})</span>
                  </h2>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                  {expiredItems.map((item) => (
                    <article
                      key={item.item_id}
                      className="mob-food-card"
                      style={{ borderLeft: '4px solid var(--status-expired-base)' }}
                      data-testid={`mob-alert-expired-${item.item_id}`}
                    >
                      <button
                        type="button"
                        className="mob-food-card-main"
                        onClick={() => onOpenItemDetail(item.item_id)}
                      >
                        <div className="mob-food-card-body">
                          <div className="mob-food-card-top">
                            <h3 className="mob-food-card-title">{item.food_name}</h3>
                            <span className="badge badge-expired mono-num">
                              {formatDaysRemainingLabel(item.days_remaining)}
                            </span>
                          </div>
                          <div className="mob-food-meta-row">
                            <span className="mono-num">{item.item_code}</span>
                            <span>·</span>
                            <span>
                              {item.area_type} · {item.location_name}
                            </span>
                          </div>
                          <div className="mob-food-meta-row">
                            <strong className="mono-num" style={{ color: 'var(--text-primary)' }}>
                              {item.current_quantity} {item.unit_name}
                            </strong>
                            <span>·</span>
                            <span className="mono-num">
                              HSD {formatIsoDateShort(item.expiry_date)}
                            </span>
                          </div>
                        </div>
                      </button>

                      <div className="mob-food-card-actions">
                        <span className="t-micro" style={{ color: 'var(--status-expired-ink)' }}>
                          Không dùng chế biến
                        </span>
                        <button
                          type="button"
                          className="btn btn-danger"
                          style={{ minHeight: 40, padding: '0 12px', fontSize: 13 }}
                          disabled={isOfflineReadOnly}
                          data-testid={`mob-alert-dispose-${item.item_id}`}
                          onClick={() => onDisposeExpired(item)}
                        >
                          <Trash2 size={15} aria-hidden="true" />
                          <span>Vứt hủy</span>
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {/* Group 2: Expiring Soon Items */}
            {expiringSoonItems.length > 0 && (
              <section aria-label="Thực phẩm sắp hết hạn">
                <div className="mob-section-head" style={{ marginBottom: 'var(--sp-2)' }}>
                  <h2
                    className="mob-section-label"
                    style={{
                      color: 'var(--status-urgent-ink)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <AlertTriangle size={18} aria-hidden="true" />
                    <span>Sắp hết hạn ({expiringSoonItems.length})</span>
                  </h2>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                  {expiringSoonItems.map((item) => (
                    <article
                      key={item.item_id}
                      className="mob-food-card"
                      style={{ borderLeft: '4px solid var(--status-urgent-base)' }}
                      data-testid={`mob-alert-expiring-${item.item_id}`}
                    >
                      <button
                        type="button"
                        className="mob-food-card-main"
                        onClick={() => onOpenItemDetail(item.item_id)}
                      >
                        <div className="mob-food-card-body">
                          <div className="mob-food-card-top">
                            <h3 className="mob-food-card-title">{item.food_name}</h3>
                            <span className="badge badge-urgent mono-num">
                              <span aria-hidden="true">⏳</span>
                              <span>{formatDaysRemainingLabel(item.days_remaining)}</span>
                            </span>
                          </div>
                          <div className="mob-food-meta-row">
                            <span className="mono-num">{item.item_code}</span>
                            <span>·</span>
                            <span>
                              {item.area_type} · {item.location_name}
                            </span>
                          </div>
                          <div className="mob-food-meta-row">
                            <strong className="mono-num" style={{ color: 'var(--text-primary)' }}>
                              {item.current_quantity} {item.unit_name}
                            </strong>
                            <span>·</span>
                            <span className="mono-num">
                              HSD {formatIsoDateShort(item.expiry_date)}
                            </span>
                          </div>
                        </div>
                      </button>

                      <div className="mob-food-card-actions">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ minHeight: 40, padding: '0 10px', fontSize: 13 }}
                          onClick={() => onOpenRecipes(item.item_id)}
                        >
                          <ChefHat size={15} aria-hidden="true" />
                          <span>Món gợi ý</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ minHeight: 40, padding: '0 14px', fontSize: 13 }}
                          disabled={isOfflineReadOnly}
                          data-testid={`mob-alert-use-${item.item_id}`}
                          onClick={() => onUseExpiringSoon(item)}
                        >
                          Dùng ngay
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </div>
        )
      ) : stockCount === 0 ? (
        <div className="mob-empty-box" data-testid="mob-alerts-stock-clear">
          <CheckCircle2 size={32} style={{ color: 'var(--status-fresh-base)' }} aria-hidden="true" />
          <h2 className="t-card-title">Danh sách cần mua đang trống</h2>
          <p className="t-meta" style={{ margin: 0 }}>
            Tất cả mặt hàng thiết yếu đều đang cao hơn ngưỡng tồn tối thiểu.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
          {lowStockItems.map((item) => (
            <article
              key={item.item_id}
              className="mob-food-card"
              style={{ borderLeft: '4px solid var(--status-lowstock-base)' }}
              data-testid={`mob-alert-lowstock-${item.item_id}`}
            >
              <button
                type="button"
                className="mob-food-card-main"
                onClick={() => onOpenItemDetail(item.item_id)}
              >
                <div className="mob-food-card-body">
                  <div className="mob-food-card-top">
                    <h3 className="mob-food-card-title">{item.food_name}</h3>
                    <span
                      className={`badge ${
                        item.status === 'Đã hết' ? 'badge-empty' : 'badge-lowstock'
                      }`}
                    >
                      {item.status === 'Đã hết' ? 'Đã hết' : 'Cạn kho · Dưới min'}
                    </span>
                  </div>
                  <div className="mob-food-meta-row">
                    <span>
                      Còn{' '}
                      <strong className="mono-num" style={{ color: 'var(--text-primary)' }}>
                        {item.current_quantity}
                      </strong>{' '}
                      / Ngưỡng min{' '}
                      <strong className="mono-num">
                        {item.min_threshold} {item.unit_name}
                      </strong>
                    </span>
                  </div>
                  <div className="mob-food-meta-row">
                    <span style={{ color: 'var(--accent-hover)', fontWeight: 600 }}>
                      Gợi ý mua thêm: +{item.suggested_buy_quantity} {item.unit_name}
                    </span>
                  </div>
                </div>
              </button>

              <div className="mob-food-card-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ minHeight: 40, padding: '0 10px', fontSize: 13 }}
                  disabled={isOfflineReadOnly}
                  onClick={() => onCreateNewBatch(item)}
                >
                  <PackagePlus size={15} aria-hidden="true" />
                  <span>Tạo lô mới</span>
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ minHeight: 40, padding: '0 14px', fontSize: 13 }}
                  disabled={isOfflineReadOnly}
                  data-testid={`mob-alert-restock-${item.item_id}`}
                  onClick={() => onRestockItem(item)}
                >
                  Đã mua — Nhập thêm
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
