import { useRef, useState } from 'react';
import {
  AlertTriangle,
  ChefHat,
  Clock,
  Flame,
  Plus,
  RefreshCw,
  Utensils,
} from 'lucide-react';
import type {
  AlertsSummary,
  AreaType,
  FefoPriorityLevel,
  FefoRecommendationItem,
  RecipeMatchSuggestion,
} from '@food-mgmt/shared-sim';
import {
  formatDaysRemainingLabel,
  formatIsoDateShort,
  getFefoBadgeClass,
} from '../domain/food-lot-presentation';
import { FoodCategoryIcon } from '../components/FoodCategoryIcon';

interface HomeFefoScreenProps {
  items: FefoRecommendationItem[];
  countsByPriority: { Cao: number; 'Trung bình': number; Thấp: number };
  expiredExcludedCount: number;
  selectedArea: AreaType | 'all';
  selectedPriority: FefoPriorityLevel | 'all';
  alerts: AlertsSummary | null;
  recipes: RecipeMatchSuggestion[];
  warningDaysThreshold: number;
  isLoading: boolean;
  isSyncing: boolean;
  isOfflineReadOnly: boolean;
  onRefresh: () => void;
  onChangeFilter: (area: AreaType | 'all', priority: FefoPriorityLevel | 'all') => void;
  onOpenAlerts: () => void;
  onOpenItemDetail: (itemId: number) => void;
  onQuickUseOne: (item: FefoRecommendationItem) => Promise<void>;
  onQuickUse: (item: FefoRecommendationItem) => void;
  onOpenRecipes: (focusItemId?: number) => void;
  onOpenCreateFood: () => void;
}

export function HomeFefoScreen({
  items,
  countsByPriority,
  expiredExcludedCount,
  selectedArea,
  selectedPriority,
  alerts,
  recipes,
  warningDaysThreshold,
  isLoading,
  isSyncing,
  isOfflineReadOnly,
  onRefresh,
  onChangeFilter,
  onOpenAlerts,
  onOpenItemDetail,
  onQuickUseOne,
  onQuickUse,
  onOpenRecipes,
  onOpenCreateFood,
}: HomeFefoScreenProps) {
  const touchStartYRef = useRef<number | null>(null);
  const [quickUsingId, setQuickUsingId] = useState<number | null>(null);

  const expiredCount = alerts?.expired_items.length ?? 0;
  const expiringSoonCount = alerts?.expiring_soon_items.length ?? 0;
  const hasUrgentBanner = expiredCount > 0 || expiringSoonCount > 0;

  const fridgeCount = items.filter((i) => i.area_type === 'Trong tủ lạnh').length;
  const outsideCount = items.filter((i) => i.area_type === 'Ngoài tủ lạnh').length;

  const togglePriority = (priority: FefoPriorityLevel) => {
    onChangeFilter(selectedArea, selectedPriority === priority ? 'all' : priority);
  };

  return (
    <main
      className="mob-main-scroll"
      data-testid="mob-screen-MOB-01"
      onTouchStart={(e) => {
        if (window.scrollY <= 0 && e.touches.length === 1) {
          touchStartYRef.current = e.touches[0].clientY;
        }
      }}
      onTouchEnd={(e) => {
        if (touchStartYRef.current !== null && e.changedTouches.length === 1) {
          const delta = e.changedTouches[0].clientY - touchStartYRef.current;
          if (delta > 72 && !isSyncing) {
            onRefresh();
          }
        }
        touchStartYRef.current = null;
      }}
    >
      {/* Urgent Expiry Alert Summary Banner */}
      {hasUrgentBanner && (
        <button
          type="button"
          className={`mob-banner-alert ${
            expiredCount > 0 ? 'mob-banner-alert-danger' : 'mob-banner-alert-warning'
          }`}
          data-testid="mob-home-alert-banner"
          onClick={onOpenAlerts}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertTriangle size={20} style={{ flexShrink: 0 }} aria-hidden="true" />
            <div>
              <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>
                {expiredCount > 0
                  ? `${expiredCount} món đã hết hạn cần vứt hủy`
                  : `${expiringSoonCount} món sắp hết hạn (<= ${warningDaysThreshold} ngày)`}
              </div>
              <div className="t-micro" style={{ color: 'inherit', marginTop: 2 }}>
                {expiredCount > 0 && expiringSoonCount > 0
                  ? `Kèm ${expiringSoonCount} món cận hạn — chạm để xử lý ngay`
                  : 'Chạm để mở Trung tâm Cảnh báo MOB-05'}
              </div>
            </div>
          </div>
          <span className="badge badge-expired mono-num">
            {expiredCount + expiringSoonCount}
          </span>
        </button>
      )}

      {/* Priority Counter Strip (Cao / Trung bình / Thấp) */}
      <section aria-label="Phân loại mức ưu tiên FEFO">
        <div className="mob-kpi-grid-3">
          {(
            [
              { level: 'Cao', count: countsByPriority.Cao, badge: 'badge-expired' },
              {
                level: 'Trung bình',
                count: countsByPriority['Trung bình'],
                badge: 'badge-urgent',
              },
              { level: 'Thấp', count: countsByPriority.Thấp, badge: 'badge-fresh' },
            ] as const
          ).map((entry) => {
            const active = selectedPriority === entry.level;
            return (
              <button
                key={entry.level}
                type="button"
                className={`mob-kpi-chip-card ${active ? 'mob-kpi-chip-card-active' : ''}`}
                data-testid={`mob-home-priority-${entry.level}`}
                onClick={() => togglePriority(entry.level)}
              >
                <span className={`badge ${entry.badge}`} style={{ padding: '2px 8px' }}>
                  {entry.level}
                </span>
                <span className="kpi-num" style={{ fontSize: 'var(--text-xl)', marginTop: 4 }}>
                  {entry.count}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Area Filter Chips & Pull-to-refresh shortcut */}
      <div className="mob-section-head">
        <div className="mob-chip-scroll" style={{ flex: 1 }}>
          {(['all', 'Trong tủ lạnh', 'Ngoài tủ lạnh'] as const).map((area) => (
            <button
              key={area}
              type="button"
              className={`mob-chip ${selectedArea === area ? 'mob-chip-active' : ''}`}
              data-testid={`mob-home-area-${area}`}
              onClick={() => onChangeFilter(area, selectedPriority)}
            >
              {area === 'all'
                ? 'Tất cả khu vực'
                : area === 'Trong tủ lạnh'
                  ? `Trong tủ (${fridgeCount})`
                  : `Ngoài tủ (${outsideCount})`}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="mob-icon-btn"
          aria-label="Kéo hoặc chạm để làm mới FEFO"
          disabled={isSyncing || isOfflineReadOnly}
          onClick={onRefresh}
          title="Làm mới danh sách FEFO"
        >
          <RefreshCw
            size={16}
            className={isSyncing ? 'mob-spin-icon' : undefined}
            aria-hidden="true"
          />
        </button>
      </div>

      {/* Horizontal Recipe Suggestions Carousel */}
      {recipes.length > 0 && (
        <section aria-label="Món ăn gợi ý hôm nay" data-testid="mob-home-recipes-carousel">
          <div className="mob-section-head" style={{ marginBottom: 'var(--sp-2)' }}>
            <h2 className="mob-section-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ChefHat size={18} style={{ color: 'var(--accent)' }} aria-hidden="true" />
              <span>Món ăn gợi ý hôm nay</span>
            </h2>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ minHeight: 36, padding: '0 8px', fontSize: 13, color: 'var(--accent-hover)' }}
              onClick={() => onOpenRecipes(undefined)}
            >
              Xem tất cả ({recipes.length})
            </button>
          </div>

          <div className="mob-hscroll">
            {recipes.slice(0, 5).map((suggestion) => (
              <button
                key={suggestion.recipe.recipe_id}
                type="button"
                className="mob-recipe-mini-card"
                data-testid={`mob-home-recipe-${suggestion.recipe.recipe_id}`}
                onClick={() => onOpenRecipes(undefined)}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                    <span className="badge badge-urgent">
                      <Flame size={12} aria-hidden="true" />
                      {suggestion.matched_high_priority_count > 0
                        ? `Giải cứu ${suggestion.matched_high_priority_count} món gấp`
                        : `Khớp ${suggestion.ready_count} nguyên liệu`}
                    </span>
                  </div>
                  <h3 className="t-card-title" style={{ marginTop: 8 }}>
                    {suggestion.recipe.recipe_name}
                  </h3>
                  <p className="t-meta" style={{ margin: '4px 0 0', fontSize: 12 }}>
                    {suggestion.recipe.priority_hint}
                  </p>
                </div>

                <div className="mob-food-meta-row" style={{ fontSize: 12 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={13} aria-hidden="true" />
                    {suggestion.recipe.cook_time_minutes} phút
                  </span>
                  <span>·</span>
                  <span>
                    Đủ {suggestion.ready_count}/
                    {suggestion.ready_count + suggestion.missing_count} nguyên liệu
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* FEFO Ordered Priority List */}
      <section aria-label="Thực phẩm ưu tiên dùng trước FEFO" data-testid="mob-home-fefo-list">
        <div className="mob-section-head" style={{ marginBottom: 'var(--sp-2)' }}>
          <h2 className="mob-section-label">Ưu tiên dùng trước (FEFO + FIFO)</h2>
          <span className="t-micro mono-num">{items.length} lô</span>
        </div>

        {expiredExcludedCount > 0 && (
          <p className="t-micro" style={{ margin: '0 0 var(--sp-2)' }}>
            Đã loại {expiredExcludedCount} lô đã quá hạn khỏi đề xuất ăn — xem tại tab Cảnh báo.
          </p>
        )}

        {isLoading && items.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            {[1, 2, 3].map((k) => (
              <div key={k} className="mob-skeleton" style={{ height: 112 }} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="mob-empty-box" data-testid="mob-home-empty">
            <Utensils size={28} style={{ color: 'var(--accent)' }} aria-hidden="true" />
            <h3 className="t-card-title">
              {selectedArea !== 'all' || selectedPriority !== 'all'
                ? 'Không có lô thực phẩm khớp bộ lọc nhanh'
                : 'Tủ lạnh chưa có thực phẩm khả dụng'}
            </h3>
            <p className="t-meta" style={{ margin: 0 }}>
              {selectedArea !== 'all' || selectedPriority !== 'all'
                ? 'Thử đặt lại bộ lọc mức ưu tiên hoặc khu vực.'
                : 'Thêm thực phẩm mới hoặc quét hóa đơn để nhận đề xuất FEFO.'}
            </p>
            {selectedArea !== 'all' || selectedPriority !== 'all' ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onChangeFilter('all', 'all')}
              >
                Hiện tất cả FEFO
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                disabled={isOfflineReadOnly}
                onClick={onOpenCreateFood}
              >
                <Plus size={18} aria-hidden="true" />
                <span>Thêm thực phẩm đầu tiên</span>
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            {items.map((item) => (
              <article
                key={item.item_id}
                className="mob-food-card"
                data-testid={`mob-fefo-card-${item.item_id}`}
              >
                <button
                  type="button"
                  className="mob-food-card-main"
                  onClick={() => onOpenItemDetail(item.item_id)}
                >
                  <div className="mob-food-thumb">
                    <FoodCategoryIcon categoryId={item.category_id} categoryName={item.category_name} />
                  </div>
                  <div className="mob-food-card-body">
                    <div className="mob-food-card-top">
                      <h3 className="mob-food-card-title">
                        <span className="mono-num" style={{ color: 'var(--text-muted)', marginRight: 6 }}>
                          #{item.rank}
                        </span>
                        {item.food_name}
                      </h3>
                      <span className={`badge ${getFefoBadgeClass(item.priority_level)}`}>
                        {item.priority_level}
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
                      <strong style={{ color: 'var(--text-primary)' }} className="mono-num">
                        {item.current_quantity} {item.unit_name}
                      </strong>
                      <span>·</span>
                      <span className="mono-num">
                        HSD {formatIsoDateShort(item.expiry_date)} (
                        {formatDaysRemainingLabel(item.days_remaining)})
                      </span>
                      {item.fifo_tie_group_size > 1 && (
                        <span className="badge badge-info mono-num">
                          FIFO #{item.fifo_tie_position}/{item.fifo_tie_group_size}
                        </span>
                      )}
                    </div>

                    <p className="t-micro" style={{ margin: '2px 0 0', color: 'var(--text-secondary)' }}>
                      {item.priority_reason}
                    </p>
                  </div>
                </button>

                <div className="mob-food-card-actions">
                  {item.matching_recipe_ids.length > 0 ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ minHeight: 44, padding: '0 10px', fontSize: 13 }}
                      onClick={() => onOpenRecipes(item.item_id)}
                    >
                      <ChefHat size={15} aria-hidden="true" />
                      <span>Gợi ý {item.matching_recipe_ids.length} món</span>
                    </button>
                  ) : (
                    <span className="t-micro">{item.suggested_action}</span>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ minHeight: 44, padding: '0 10px', fontSize: 13 }}
                      disabled={isOfflineReadOnly}
                      data-testid={`mob-fefo-use-${item.item_id}`}
                      onClick={() => onQuickUse(item)}
                      title="Mở bảng chọn số lượng tùy chỉnh"
                    >
                      Tùy chỉnh
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ minHeight: 44, padding: '0 12px', fontSize: 13 }}
                      disabled={
                        isOfflineReadOnly ||
                        quickUsingId === item.item_id ||
                        item.current_quantity < 1
                      }
                      data-testid={`mob-fefo-quick-use-${item.item_id}`}
                      onClick={() => {
                        setQuickUsingId(item.item_id);
                        void onQuickUseOne(item).finally(() => {
                          setQuickUsingId((prev) => (prev === item.item_id ? null : prev));
                        });
                      }}
                    >
                      {quickUsingId === item.item_id ? 'Đang trừ…' : '-1 nhanh'}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
