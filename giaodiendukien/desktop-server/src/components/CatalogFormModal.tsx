import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, Plus, Trash2, X } from 'lucide-react';
import type {
  AreaType,
  CatalogBundle,
  Category,
  Food,
  Recipe,
  RecipeIngredient,
  SaveCategoryPayload,
  SaveLocationPayload,
  SaveRecipePayload,
  SaveUnitPayload,
  ServerResponse,
  StorageLocation,
  Unit,
} from '@food-mgmt/shared-sim';
import type { CatalogFormModalState } from '../state/useDesktopServer';

interface CatalogFormModalProps {
  modalState: CatalogFormModalState;
  catalogs: CatalogBundle;
  allFoods: Food[];
  onClose: () => void;
  onSaveCategory: (payload: SaveCategoryPayload) => Promise<ServerResponse<Category>>;
  onSaveUnit: (payload: SaveUnitPayload) => Promise<ServerResponse<Unit>>;
  onSaveLocation: (payload: SaveLocationPayload) => Promise<ServerResponse<StorageLocation>>;
  onSaveRecipe: (payload: SaveRecipePayload) => Promise<ServerResponse<Recipe>>;
  onSuccess: (message: string) => void;
}

export function CatalogFormModal({
  modalState,
  catalogs,
  allFoods,
  onClose,
  onSaveCategory,
  onSaveUnit,
  onSaveLocation,
  onSaveRecipe,
  onSuccess,
}: CatalogFormModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [areaType, setAreaType] = useState<AreaType>('Trong tủ lạnh');

  // Recipe-specific fields
  const [cookTime, setCookTime] = useState('20');
  const [servings, setServings] = useState('2');
  const [priorityHint, setPriorityHint] = useState('');
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [stepsText, setStepsText] = useState('');

  const [fieldErrors, setFieldErrors] = useState<Partial<Record<string, string>>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!modalState.open) return;
    setFieldErrors({});
    setErrorMsg(null);

    if (modalState.entity === 'category') {
      setName(modalState.record?.category_name ?? '');
      setDescription(modalState.record?.description ?? '');
    } else if (modalState.entity === 'unit') {
      setName(modalState.record?.unit_name ?? '');
      setDescription(modalState.record?.description ?? '');
    } else if (modalState.entity === 'location') {
      setAreaType(modalState.record?.area_type ?? 'Trong tủ lạnh');
      setName(modalState.record?.location_name ?? '');
      setDescription(modalState.record?.description ?? '');
    } else if (modalState.entity === 'recipe') {
      const r = modalState.record;
      setName(r?.recipe_name ?? '');
      setCookTime(String(r?.cook_time_minutes ?? 20));
      setServings(String(r?.servings ?? 2));
      setPriorityHint(r?.priority_hint ?? '');
      setIngredients(
        r?.ingredients?.length
          ? r.ingredients.map((i) => ({ ...i, food_id: null }))
          : [
              {
                ingredient_id: 1,
                food_id: null,
                ingredient_name: allFoods[0]?.food_name ?? '',
                quantity: 0.3,
                unit_name:
                  catalogs.units.find((u) => u.unit_id === allFoods[0]?.default_unit_id)?.unit_name ?? 'kg',
                is_essential: true,
              },
            ],
      );
      setStepsText(r?.steps?.join('\n') ?? '');
    }
  }, [modalState, allFoods, catalogs.units]);

  if (!modalState.open) return null;

  const isEdit = Boolean(modalState.record);
  const titleMap = {
    category: isEdit ? 'Chỉnh sửa Loại thực phẩm' : 'Thêm Loại thực phẩm mới',
    unit: isEdit ? 'Chỉnh sửa Đơn vị tính' : 'Thêm Đơn vị tính mới',
    location: isEdit ? 'Chỉnh sửa Vị trí bảo quản' : 'Thêm Vị trí bảo quản mới',
    recipe: isEdit ? 'Chỉnh sửa Công thức món ăn' : 'Thêm Công thức món ăn mới',
  };

  const handleAddIngredientRow = () => {
    const nextId =
      ingredients.reduce((max, item) => Math.max(max, item.ingredient_id), 0) + 1;
    setIngredients((prev) => [
      ...prev,
      {
        ingredient_id: nextId,
        food_id: null,
        ingredient_name: '',
        quantity: 1,
        unit_name: catalogs.units[0]?.unit_name ?? 'kg',
        is_essential: true,
      },
    ]);
  };

  const handleUpdateIngredient = (
    idx: number,
    patch: Partial<RecipeIngredient>,
  ) => {
    setIngredients((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)),
    );
  };

  const handlePickFoodForIngredient = (idx: number, foodIdVal: string) => {
    if (!foodIdVal) {
      return;
    }
    const fid = Number(foodIdVal);
    const food = allFoods.find((f) => f.food_id === fid);
    if (!food) return;
    const unitName =
      catalogs.units.find((u) => u.unit_id === food.default_unit_id)?.unit_name ?? 'đơn vị';
    handleUpdateIngredient(idx, {
      food_id: null,
      ingredient_name: food.food_name,
      unit_name: unitName,
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    setErrorMsg(null);

    if (modalState.entity === 'category') {
      const res = await onSaveCategory({
        category_id: modalState.record?.category_id,
        category_name: name,
        description: description || null,
      });
      setSubmitting(false);
      if (res.ok) {
        onSuccess(`Đã lưu loại thực phẩm "${res.data.category_name}"`);
      } else {
        setErrorMsg(res.error.message);
        if (res.error.field_errors) setFieldErrors(res.error.field_errors);
      }
      return;
    }

    if (modalState.entity === 'unit') {
      const res = await onSaveUnit({
        unit_id: modalState.record?.unit_id,
        unit_name: name,
        description: description || null,
      });
      setSubmitting(false);
      if (res.ok) {
        onSuccess(`Đã lưu đơn vị tính "${res.data.unit_name}"`);
      } else {
        setErrorMsg(res.error.message);
        if (res.error.field_errors) setFieldErrors(res.error.field_errors);
      }
      return;
    }

    if (modalState.entity === 'location') {
      const res = await onSaveLocation({
        location_id: modalState.record?.location_id,
        area_type: areaType,
        location_name: name,
        description: description || null,
      });
      setSubmitting(false);
      if (res.ok) {
        onSuccess(`Đã lưu vị trí "${res.data.area_type} · ${res.data.location_name}"`);
      } else {
        setErrorMsg(res.error.message);
        if (res.error.field_errors) setFieldErrors(res.error.field_errors);
      }
      return;
    }

    const cleanedIngredients = ingredients
      .filter((i) => i.ingredient_name.trim().length > 0)
      .map((i) => ({ ...i, food_id: null }));
    const steps = stepsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const res = await onSaveRecipe({
      recipe_id: modalState.record?.recipe_id,
      recipe_name: name,
      cook_time_minutes: Number(cookTime) || 20,
      servings: Number(servings) || 2,
      priority_hint: priorityHint,
      ingredients: cleanedIngredients,
      steps,
    });
    setSubmitting(false);
    if (res.ok) {
      onSuccess(`Đã lưu công thức "${res.data.recipe_name}"`);
    } else {
      setErrorMsg(res.error.message);
      if (res.error.field_errors) setFieldErrors(res.error.field_errors);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className={`modal-dialog ${modalState.entity === 'recipe' ? 'modal-lg' : 'modal-sm'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dsk-m05-title"
        data-testid="dsk-modal-DSK-M05"
      >
        <div className="modal-header">
          <div>
            <span className="t-micro">DSK-M05 · QUẢN TRỊ DANH MỤC NỀN TẢNG</span>
            <h2 id="dsk-m05-title" className="t-panel-title">
              {titleMap[modalState.entity]}
            </h2>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            aria-label="Đóng biểu mẫu danh mục"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)}>
          <div className="modal-body modal-body-scroll">
            {errorMsg ? (
              <div className="inline-alert inline-alert-danger" role="alert">
                <AlertCircle size={15} />
                <span>{errorMsg}</span>
              </div>
            ) : null}

            {modalState.entity === 'location' ? (
              <div className="form-field">
                <label htmlFor="m05-area-type">Khu vực (Cấp 1)</label>
                <select
                  id="m05-area-type"
                  value={areaType}
                  onChange={(e) => setAreaType(e.target.value as AreaType)}
                  data-testid="dsk-m05-area-select"
                >
                  <option value="Trong tủ lạnh">Trong tủ lạnh</option>
                  <option value="Ngoài tủ lạnh">Ngoài tủ lạnh</option>
                </select>
              </div>
            ) : null}

            <div className="form-field">
              <label htmlFor="m05-name">
                {modalState.entity === 'category'
                  ? 'Tên loại thực phẩm'
                  : modalState.entity === 'unit'
                    ? 'Tên đơn vị tính'
                    : modalState.entity === 'location'
                      ? 'Tên vị trí chi tiết'
                      : 'Tên món ăn'}
                <span className="req"> *</span>
              </label>
              <input
                id="m05-name"
                type="text"
                className={
                  fieldErrors.category_name ||
                  fieldErrors.unit_name ||
                  fieldErrors.location_name ||
                  fieldErrors.recipe_name
                    ? 'is-invalid'
                    : ''
                }
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="dsk-m05-name-input"
              />
            </div>

            {modalState.entity !== 'recipe' ? (
              <div className="form-field">
                <label htmlFor="m05-desc">
                  {modalState.entity === 'location'
                    ? 'Mô tả nhiệt độ / lưu trữ'
                    : modalState.entity === 'unit'
                      ? 'Mô tả / Quy đổi'
                      : 'Mô tả'}
                </label>
                <textarea
                  id="m05-desc"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  data-testid="dsk-m05-desc-input"
                />
              </div>
            ) : (
              <>
                <div className="form-row-2">
                  <div className="form-field">
                    <label htmlFor="m05-cook-time">Thời gian nấu (phút)</label>
                    <input
                      id="m05-cook-time"
                      type="number"
                      min="1"
                      className="mono-num"
                      value={cookTime}
                      onChange={(e) => setCookTime(e.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="m05-servings">Khẩu phần (người)</label>
                    <input
                      id="m05-servings"
                      type="number"
                      min="1"
                      className="mono-num"
                      value={servings}
                      onChange={(e) => setServings(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-field">
                  <label htmlFor="m05-priority-hint">Gợi ý ưu tiên FEFO</label>
                  <input
                    id="m05-priority-hint"
                    type="text"
                    value={priorityHint}
                    onChange={(e) => setPriorityHint(e.target.value)}
                    placeholder="VD: Giải cứu nhanh rau củ và thịt cận hạn..."
                  />
                </div>

                <div className="form-field">
                  <div className="label-row-between">
                    <label>Danh sách nguyên liệu ({ingredients.length})</label>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={handleAddIngredientRow}
                    >
                      <Plus size={13} />
                      <span>Thêm dòng</span>
                    </button>
                  </div>
                  <div className="recipe-ing-editor">
                    {ingredients.map((ing, idx) => (
                      <div key={ing.ingredient_id} className="ing-editor-row">
                        <select
                          aria-label="Gợi ý điền nhanh từ danh sách thực phẩm"
                          value=""
                          onChange={(e) => handlePickFoodForIngredient(idx, e.target.value)}
                        >
                          <option value="">-- Gợi ý tên từ kho (tự do) --</option>
                          {allFoods.map((f) => (
                            <option key={f.food_id} value={f.food_id}>
                              {f.food_code} · {f.food_name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          placeholder="Tên nguyên liệu"
                          value={ing.ingredient_name}
                          onChange={(e) =>
                            handleUpdateIngredient(idx, { ingredient_name: e.target.value })
                          }
                        />
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          className="mono-num"
                          style={{ width: 76 }}
                          value={ing.quantity}
                          onChange={(e) =>
                            handleUpdateIngredient(idx, { quantity: Number(e.target.value) })
                          }
                        />
                        <input
                          type="text"
                          style={{ width: 72 }}
                          placeholder="Đơn vị"
                          value={ing.unit_name}
                          onChange={(e) =>
                            handleUpdateIngredient(idx, { unit_name: e.target.value })
                          }
                        />
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() =>
                            setIngredients((prev) => prev.filter((_, i) => i !== idx))
                          }
                          aria-label="Xóa dòng nguyên liệu"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="form-field">
                  <label htmlFor="m05-steps">Các bước hướng dẫn nấu (mỗi dòng 1 bước)</label>
                  <textarea
                    id="m05-steps"
                    rows={4}
                    value={stepsText}
                    onChange={(e) => setStepsText(e.target.value)}
                    placeholder="Bước 1: Sơ chế nguyên liệu...&#10;Bước 2: Xào chín trên lửa vừa..."
                  />
                </div>
              </>
            )}
          </div>

          <div className="modal-footer modal-footer-win">
            <button
              type="submit"
              className="btn btn-primary btn-fixed-md"
              disabled={submitting}
              data-testid="dsk-m05-submit"
            >
              {submitting ? (
                <>
                  <span className="btn-spinner" aria-hidden="true" />
                  <span>Đang lưu…</span>
                </>
              ) : (
                <span>Lưu danh mục</span>
              )}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              data-testid="dsk-m05-cancel"
            >
              Hủy
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
