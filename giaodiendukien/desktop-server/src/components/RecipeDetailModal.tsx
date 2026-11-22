import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChefHat,
  Clock,
  Users,
  Utensils,
  X,
} from 'lucide-react';
import {
  normalizeVietnameseSearchText,
  type CookRecipeResult,
  type FoodLotView,
  type RecipeMatchSuggestion,
  type ServerResponse,
} from '@food-mgmt/shared-sim';
import { formatDaysRemainingLabel, formatQuantity } from '../domain/pantry-formatters';

interface RecipeDetailModalProps {
  open: boolean;
  focusItemId?: number;
  initialRecipeId?: number;
  recipes: RecipeMatchSuggestion[];
  allLots: FoodLotView[];
  onClose: () => void;
  onCookRecipe: (recipeId: number) => Promise<ServerResponse<CookRecipeResult>>;
  onOpenUseLotModal: (lot: FoodLotView, suggestedQty: number, reason: string) => void;
  onOpenCatalogRecipes: () => void;
  onSuccess: (message: string) => void;
}

export function RecipeDetailModal({
  open,
  focusItemId,
  initialRecipeId,
  recipes,
  allLots,
  onClose,
  onCookRecipe,
  onOpenUseLotModal,
  onOpenCatalogRecipes,
  onSuccess,
}: RecipeDetailModalProps) {
  const filteredRecipes = useMemo(() => {
    if (focusItemId === undefined) return recipes;
    const focusLot = allLots.find((l) => l.item_id === focusItemId);
    if (!focusLot) return recipes;
    const focusName = normalizeVietnameseSearchText(focusLot.food_name);
    const matched = recipes.filter((s) =>
      s.ingredient_statuses.some((ing) => {
        if (ing.matched_item_id === focusItemId) return true;
        const ingName = normalizeVietnameseSearchText(ing.ingredient_name);
        return (
          Boolean(ingName) &&
          Boolean(focusName) &&
          (focusName.includes(ingName) || ingName.includes(focusName))
        );
      }),
    );
    return matched.length > 0 ? matched : recipes;
  }, [recipes, focusItemId, allLots]);

  const [selectedRecipeId, setSelectedRecipeId] = useState<number | null>(null);
  const [cookingBusy, setCookingBusy] = useState(false);
  const [cookError, setCookError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCookError(null);
    if (initialRecipeId && filteredRecipes.some((r) => r.recipe.recipe_id === initialRecipeId)) {
      setSelectedRecipeId(initialRecipeId);
    } else {
      setSelectedRecipeId(filteredRecipes[0]?.recipe.recipe_id ?? null);
    }
  }, [open, initialRecipeId, filteredRecipes]);

  if (!open) return null;

  const selected =
    filteredRecipes.find((r) => r.recipe.recipe_id === selectedRecipeId) ?? filteredRecipes[0] ?? null;

  const readyIngredients = selected
    ? selected.ingredient_statuses.filter(
        (ing) => ing.matched_item_id !== null && ing.available_quantity > 0,
      )
    : [];

  const handleCookDeductAll = async () => {
    if (!selected || readyIngredients.length === 0) return;
    setCookingBusy(true);
    setCookError(null);

    const res = await onCookRecipe(selected.recipe.recipe_id);
    setCookingBusy(false);

    if (!res.ok) {
      setCookError(res.error.message);
      return;
    }

    const skippedText =
      res.data.skipped_missing > 0
        ? ` (bỏ qua ${res.data.skipped_missing} nguyên liệu chưa có sẵn trong kho)`
        : '';
    onSuccess(
      `Đã nấu "${res.data.recipe_name}" và xuất trừ nguyên tử ${res.data.deducted_count} nguyên liệu${skippedText}.`,
    );
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal-dialog modal-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dsk-m03-title"
        data-testid="dsk-modal-DSK-M03"
      >
        <div className="modal-header">
          <div>
            <span className="t-micro">DSK-M03 · GỢI Ý MÓN ĂN & CÔNG THỨC NẤU (FR-10)</span>
            <h2 id="dsk-m03-title" className="t-panel-title">
              Chi tiết Món ăn Gợi ý theo Nguyên liệu FEFO
            </h2>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            aria-label="Đóng công thức nấu"
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body recipe-modal-split">
          {filteredRecipes.length === 0 ? (
            <div className="empty-well" style={{ width: '100%' }}>
              <ChefHat size={24} />
              <p>Chưa có công thức phù hợp với nguyên liệu hiện có trong kho.</p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenCatalogRecipes}>
                Mở Kho Công thức (DSK-06)
              </button>
            </div>
          ) : (
            <>
              {/* Left list of matching recipes */}
              <div className="recipe-list-pane" data-testid="dsk-m03-recipe-list">
                {filteredRecipes.map((item) => {
                  const isSelected = selected?.recipe.recipe_id === item.recipe.recipe_id;
                  return (
                    <button
                      key={item.recipe.recipe_id}
                      type="button"
                      className={`recipe-list-item ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => {
                        setSelectedRecipeId(item.recipe.recipe_id);
                        setCookError(null);
                      }}
                    >
                      <div className="recipe-item-name">{item.recipe.recipe_name}</div>
                      <div className="recipe-item-meta">
                        <span className="badge badge-fresh">
                          Đủ {item.ready_count}/{item.ingredient_statuses.length}
                        </span>
                        {item.matched_high_priority_count > 0 ? (
                          <span className="badge badge-expired">
                            {item.matched_high_priority_count} gấp
                          </span>
                        ) : null}
                        {item.missing_count > 0 ? (
                          <span className="badge badge-urgent">Thiếu {item.missing_count}</span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Right details of selected recipe */}
              {selected ? (
                <div className="recipe-detail-pane">
                  <div className="recipe-detail-header">
                    <h3 className="t-panel-title">{selected.recipe.recipe_name}</h3>
                    <div className="recipe-meta-pills">
                      <span className="inline-icon-text t-meta">
                        <Clock size={13} />
                        <span>{selected.recipe.cook_time_minutes} phút</span>
                      </span>
                      <span className="inline-icon-text t-meta">
                        <Users size={13} />
                        <span>{selected.recipe.servings} khẩu phần</span>
                      </span>
                    </div>
                    {selected.recipe.priority_hint ? (
                      <div className="inline-alert inline-alert-info" style={{ marginTop: 8 }}>
                        <ChefHat size={15} />
                        <span>{selected.recipe.priority_hint}</span>
                      </div>
                    ) : null}
                  </div>

                  {cookError ? (
                    <div className="inline-alert inline-alert-danger" role="alert">
                      <AlertCircle size={15} />
                      <span>{cookError}</span>
                    </div>
                  ) : null}

                  <div className="recipe-section">
                    <h4 className="drawer-section-heading">
                      <Utensils size={14} />
                      <span>Đối chiếu Nguyên liệu trong tủ</span>
                    </h4>
                    <table className="table-dense">
                      <thead>
                        <tr>
                          <th>Nguyên liệu</th>
                          <th className="num-col">Cần dùng</th>
                          <th>Trạng thái kho</th>
                          <th className="num-col">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.ingredient_statuses.map((ing) => {
                          const matchedLot =
                            ing.matched_item_id !== null
                              ? allLots.find((l) => l.item_id === ing.matched_item_id)
                              : undefined;
                          return (
                            <tr key={ing.ingredient_id}>
                              <td>
                                <strong>{ing.ingredient_name}</strong>
                                {ing.matched_days_remaining !== null ? (
                                  <div className="t-micro">
                                    HSD: <span className="mono-num">{ing.matched_expiry_date}</span> (
                                    {formatDaysRemainingLabel(ing.matched_days_remaining)})
                                  </div>
                                ) : null}
                              </td>
                              <td className="num-col mono-num">
                                {formatQuantity(ing.required_quantity)} {ing.unit_name}
                              </td>
                              <td>
                                <span
                                  className={
                                    ing.availability === 'Có sẵn - Ưu tiên cao'
                                      ? 'badge badge-expired'
                                      : ing.availability === 'Có sẵn'
                                        ? 'badge badge-fresh'
                                        : 'badge badge-empty'
                                  }
                                >
                                  {ing.availability}
                                </span>
                                {ing.available_quantity > 0 ? (
                                  <div className="t-micro mono-num">
                                    Tồn: {formatQuantity(ing.available_quantity)}{' '}
                                    {ing.available_unit_name ?? ing.unit_name}
                                  </div>
                                ) : null}
                                {ing.unit_compatible === false && ing.available_unit_name ? (
                                  <div className="t-micro text-warn-strong">
                                    Khác đơn vị ({ing.available_unit_name} ↔ {ing.unit_name})
                                  </div>
                                ) : null}
                              </td>
                              <td className="num-col">
                                {matchedLot ? (
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() =>
                                      onOpenUseLotModal(
                                        matchedLot,
                                        Math.min(
                                          ing.unit_compatible
                                            ? (ing.deduct_quantity_in_lot_unit ?? ing.required_quantity)
                                            : 1,
                                          matchedLot.current_quantity,
                                        ),
                                        `Nấu món: ${selected.recipe.recipe_name}`,
                                      )
                                    }
                                  >
                                    Xuất lô
                                  </button>
                                ) : (
                                  <span className="t-micro">Chưa có</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="recipe-section">
                    <h4 className="drawer-section-heading">
                      <BookOpen size={14} />
                      <span>Hướng dẫn chế biến</span>
                    </h4>
                    <ol className="recipe-steps-list">
                      {selected.recipe.steps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="modal-footer modal-footer-win">
          {selected && readyIngredients.length > 0 ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={cookingBusy}
              onClick={() => void handleCookDeductAll()}
              data-testid="dsk-m03-cook-btn"
            >
              {cookingBusy ? (
                <>
                  <span className="btn-spinner" aria-hidden="true" />
                  <span>Đang trừ kho…</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  <span>Nấu món này (Xuất trừ {readyIngredients.length} nguyên liệu)</span>
                </>
              )}
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            data-testid="dsk-m03-close"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
