import {
  DEFAULT_SIMULATED_DATE,
  diffCalendarDays,
  extractDatePart,
  formatIsoTimestampInTimezone,
  isValidIsoDate,
  normalizeVietnameseSearchText,
  roundConvertedQuantity,
  roundStockQuantity,
  shiftIsoDate,
} from '../domain/calendar-date';
import { filterFoodLotViews } from '../domain/pantry-formatters';
import type {
  Category,
  DuplicateCheckResult,
  Food,
  FoodFormInput,
  FoodItem,
  FoodLotView,
  FoodSearchFilter,
  HouseholdDatabaseState,
  InventoryTransaction,
  InventoryTransactionView,
  Recipe,
  StorageLocation,
  SystemConfig,
  Unit,
  AuditLogFilter,
} from '../domain/food-entities';
import type {
  AdjustFoodPayload,
  CancelFoodItemPayload,
  CatalogMetadataResult,
  CheckDuplicatePayload,
  CookRecipePayload,
  CookRecipeResult,
  CreateFoodItemResult,
  GetAuditLogsResult,
  ItemDetailResult,
  MoveLocationPayload,
  ProtocolError,
  RestockFoodPayload,
  SaveCategoryPayload,
  SaveLocationPayload,
  SaveRecipePayload,
  SaveUnitPayload,
  SearchFoodItemsResult,
  ShiftSimulatedDatePayload,
  UseFoodPayload,
} from '../domain/protocol-contracts';
import {
  buildFoodLotViews,
  compareFefoThenFifo,
  convertRecipeQuantityToLotUnit,
  doesIngredientMatchFood,
  resolveEffectiveDate,
  suggestRecipesForPantry,
} from './fefo-recommender';

export type LedgerOutcome<T> = { ok: true; data: T } | { ok: false; error: ProtocolError };

function makeError(
  code: ProtocolError['code'],
  message: string,
  extra?: Partial<ProtocolError>,
): { ok: false; error: ProtocolError } {
  return {
    ok: false,
    error: {
      code,
      message,
      ...extra,
    },
  };
}

export function buildLedgerTimestamp(state: HouseholdDatabaseState): string {
  const realFormatted = formatIsoTimestampInTimezone(new Date(), state.system_config.timezone);
  if (state.system_config.use_simulated_date) {
    const effectiveDate = resolveEffectiveDate(state.system_config);
    return `${effectiveDate} ${realFormatted.slice(11, 19)}`;
  }
  return realFormatted;
}

export function checkFoodDuplicate(
  state: HouseholdDatabaseState,
  payload: CheckDuplicatePayload,
): DuplicateCheckResult {
  const normalizedCode = payload.food_code.trim().toLowerCase();
  const normalizedName = payload.food_name.trim().toLowerCase();

  const codeConflict = normalizedCode
    ? (state.foods.find(
        (f) => f.food_id !== payload.exclude_food_id && f.food_code.trim().toLowerCase() === normalizedCode,
      ) ?? null)
    : null;

  const nameConflict = normalizedName
    ? (state.foods.find(
        (f) => f.food_id !== payload.exclude_food_id && f.food_name.trim().toLowerCase() === normalizedName,
      ) ?? null)
    : null;

  const allLots = nameConflict ? buildFoodLotViews(state) : [];
  const existingActiveLots = nameConflict
    ? allLots.filter((lot) => lot.food_id === nameConflict.food_id && lot.status === 'Đang sử dụng')
    : [];

  return {
    has_code_conflict: codeConflict !== null,
    code_conflict_food: codeConflict,
    has_name_conflict: nameConflict !== null,
    name_conflict_food: nameConflict,
    existing_active_lots: existingActiveLots,
  };
}

export function validateFoodForm(
  state: HouseholdDatabaseState,
  input: FoodFormInput,
  mode: 'create' | 'edit',
): Partial<Record<string, string>> {
  const fieldErrors: Partial<Record<string, string>> = {};

  if (!input.merge_into_food_id) {
    const trimmedCode = input.food_code.trim();
    if (!trimmedCode) {
      fieldErrors.food_code = 'Vui lòng nhập mã thực phẩm (ví dụ TP016).';
    } else if (trimmedCode.length > 50) {
      fieldErrors.food_code = 'Mã thực phẩm tối đa 50 ký tự.';
    }

    const trimmedName = input.food_name.trim();
    if (!trimmedName) {
      fieldErrors.food_name = 'Vui lòng nhập tên thực phẩm.';
    } else if (trimmedName.length > 150) {
      fieldErrors.food_name = 'Tên thực phẩm tối đa 150 ký tự.';
    }

    if (!state.categories.some((c) => c.category_id === input.category_id)) {
      fieldErrors.category_id = 'Loại thực phẩm không hợp lệ.';
    }
  }

  if (!state.storage_locations.some((l) => l.location_id === input.location_id)) {
    fieldErrors.location_id = 'Vui lòng chọn vị trí bảo quản hợp lệ.';
  }

  if (!state.units.some((u) => u.unit_id === input.unit_id)) {
    fieldErrors.unit_id = 'Vui lòng chọn đơn vị tính hợp lệ.';
  }

  if (!Number.isFinite(input.quantity)) {
    fieldErrors.quantity = 'Số lượng không hợp lệ.';
  } else if (mode === 'create' && input.quantity <= 0) {
    fieldErrors.quantity = 'Số lượng nhập ban đầu phải lớn hơn 0.';
  } else if (mode === 'edit' && input.quantity < 0) {
    fieldErrors.quantity = 'Số lượng tồn kho không thể âm.';
  }

  if (!Number.isFinite(input.min_threshold) || input.min_threshold < 0) {
    fieldErrors.min_threshold = 'Ngưỡng tồn tối thiểu phải lớn hơn hoặc bằng 0.';
  }

  if (!isValidIsoDate(input.import_date)) {
    fieldErrors.import_date = 'Ngày nhập không đúng định dạng YYYY-MM-DD.';
  }

  if (!isValidIsoDate(input.expiry_date)) {
    fieldErrors.expiry_date = 'Hạn sử dụng không đúng định dạng YYYY-MM-DD.';
  } else if (isValidIsoDate(input.import_date) && diffCalendarDays(input.expiry_date, input.import_date) < 0) {
    fieldErrors.expiry_date = 'Hạn sử dụng phải lớn hơn hoặc bằng ngày nhập.';
  }

  return fieldErrors;
}

export function createFoodItem(
  state: HouseholdDatabaseState,
  input: FoodFormInput,
): LedgerOutcome<CreateFoodItemResult> {
  const fieldErrors = validateFoodForm(state, input, 'create');
  if (Object.keys(fieldErrors).length > 0) {
    return makeError('VALIDATION_ERROR', 'Dữ liệu biểu mẫu chưa hợp lệ. Vui lòng kiểm tra các trường báo đỏ.', {
      field_errors: fieldErrors,
    });
  }

  const nowTs = buildLedgerTimestamp(state);
  const actorDevice = input.actor_device?.trim() || 'Desktop Server';

  let targetFood: Food | undefined;
  let mergedExistingFood = false;

  if (input.merge_into_food_id !== undefined) {
    targetFood = state.foods.find((f) => f.food_id === input.merge_into_food_id);
    if (!targetFood) {
      return makeError('NOT_FOUND', 'Không tìm thấy thực phẩm gốc để ghép lô mới.');
    }
    mergedExistingFood = true;
  } else {
    const dupCheck = checkFoodDuplicate(state, {
      food_code: input.food_code,
      food_name: input.food_name,
    });

    if (dupCheck.has_code_conflict) {
      return makeError(
        'DUPLICATE_FOOD_CODE',
        `Mã thực phẩm "${input.food_code.trim()}" đã tồn tại cho món "${dupCheck.code_conflict_food?.food_name}".`,
        {
          field_errors: {
            food_code: 'Mã thực phẩm đã tồn tại, vui lòng đổi mã khác hoặc chọn ghép lô.',
          },
          duplicate_match: dupCheck,
        },
      );
    }

    if (dupCheck.has_name_conflict && !input.force_create_separate_food) {
      return makeError(
        'DUPLICATE_FOOD_NAME',
        `Thực phẩm "${dupCheck.name_conflict_food?.food_name}" đã có trong danh mục. Bạn muốn tạo lô mới dùng chung thực phẩm hay tạo riêng?`,
        {
          duplicate_match: dupCheck,
        },
      );
    }

    const newFoodId = state.next_ids.food++;
    targetFood = {
      food_id: newFoodId,
      food_code: input.food_code.trim(),
      food_name: input.food_name.trim(),
      category_id: input.category_id,
      default_unit_id: input.unit_id,
      min_quantity: roundStockQuantity(input.min_threshold),
      brand: input.brand.trim() || null,
      image_url: input.image_url?.trim() || null,
      description: input.description.trim() || null,
      created_at: nowTs,
    };
    state.foods.push(targetFood);
  }

  const newItemId = state.next_ids.item++;
  const initialQty = roundStockQuantity(input.quantity);
  const newItem: FoodItem = {
    item_id: newItemId,
    food_id: targetFood.food_id,
    item_code: `LO-${String(newItemId).padStart(3, '0')}`,
    location_id: input.location_id,
    unit_id: input.unit_id,
    initial_quantity: initialQty,
    current_quantity: initialQty,
    min_threshold: roundStockQuantity(input.min_threshold),
    import_date: input.import_date,
    expiry_date: input.expiry_date,
    status: 'Đang sử dụng',
    note: input.note.trim() || null,
    updated_at: nowTs,
  };
  state.food_items.push(newItem);

  const txId = state.next_ids.transaction++;
  const transaction: InventoryTransaction = {
    transaction_id: txId,
    item_id: newItemId,
    action_type: 'Nhập thêm',
    change_quantity: initialQty,
    remaining_quantity: initialQty,
    reason: mergedExistingFood
      ? `Nhập lô mới dùng chung thực phẩm ${targetFood.food_code}`
      : 'Nhập thực phẩm mới vào kho',
    transaction_date: nowTs,
    actor_device: actorDevice,
  };
  state.inventory_transactions.push(transaction);

  const lotView = buildFoodLotViews(state).find((l) => l.item_id === newItemId)!;

  return {
    ok: true,
    data: {
      food: targetFood,
      item: lotView,
      transaction,
      merged_existing_food: mergedExistingFood,
    },
  };
}

export function useFood(
  state: HouseholdDatabaseState,
  payload: UseFoodPayload,
): LedgerOutcome<{ item: FoodLotView; transaction: InventoryTransaction }> {
  const item = state.food_items.find((i) => i.item_id === payload.item_id);
  if (!item) {
    return makeError('NOT_FOUND', 'Lỗi: Không tìm thấy món này trong kho!', { sql_state: '45000' });
  }

  if (item.status === 'Đã hủy') {
    return makeError('VALIDATION_ERROR', 'Lô thực phẩm này đã bị thanh lý/hủy, không thể xuất dùng.');
  }

  const unitName = state.units.find((u) => u.unit_id === item.unit_id)?.unit_name ?? 'đơn vị';

  if (
    payload.expected_current_quantity !== undefined &&
    Math.abs(payload.expected_current_quantity - item.current_quantity) > 0.001
  ) {
    return makeError(
      'CONFLICT_STALE_STOCK',
      `Tồn kho vừa được thiết bị khác cập nhật còn ${item.current_quantity} ${unitName}. Vui lòng kiểm tra lại số lượng mới nhất.`,
      {
        sql_state: '45000',
        latest_quantity: item.current_quantity,
        unit_name: unitName,
      },
    );
  }

  if (!Number.isFinite(payload.quantity_used) || payload.quantity_used <= 0) {
    return makeError('VALIDATION_ERROR', 'Số lượng sử dụng phải lớn hơn 0.', {
      field_errors: { quantity_used: 'Vui lòng nhập số lượng lớn hơn 0.' },
    });
  }

  const qtyUsed = roundStockQuantity(payload.quantity_used);
  if (item.current_quantity < qtyUsed) {
    return makeError('ERR_INSUFFICIENT_STOCK', 'Lỗi: Số lượng sử dụng lớn hơn tồn kho thực tế!', {
      sql_state: '45000',
      latest_quantity: item.current_quantity,
      unit_name: unitName,
    });
  }

  const newQty = roundStockQuantity(Math.max(0, item.current_quantity - qtyUsed));
  const nowTs = buildLedgerTimestamp(state);

  // Trigger trg_after_inventory_transaction fidelity
  item.current_quantity = newQty;
  item.status = newQty <= 0 ? 'Đã hết' : 'Đang sử dụng';
  item.updated_at = nowTs;

  const transaction: InventoryTransaction = {
    transaction_id: state.next_ids.transaction++,
    item_id: item.item_id,
    action_type: 'Sử dụng',
    change_quantity: -qtyUsed,
    remaining_quantity: newQty,
    reason: payload.reason.trim() || 'Xuất dùng chế biến',
    transaction_date: nowTs,
    actor_device: payload.actor_device?.trim() || 'Desktop Server',
  };
  state.inventory_transactions.push(transaction);

  const lotView = buildFoodLotViews(state).find((l) => l.item_id === item.item_id)!;
  return { ok: true, data: { item: lotView, transaction } };
}

export function restockFood(
  state: HouseholdDatabaseState,
  payload: RestockFoodPayload,
): LedgerOutcome<{ item: FoodLotView; transaction: InventoryTransaction }> {
  const item = state.food_items.find((i) => i.item_id === payload.item_id);
  if (!item) {
    return makeError('NOT_FOUND', 'Không tìm thấy lô thực phẩm trong kho.');
  }
  if (item.status === 'Đã hủy') {
    return makeError('VALIDATION_ERROR', 'Không thể nhập thêm vào lô đã thanh lý/hủy. Hãy tạo lô mới.');
  }
  if (!Number.isFinite(payload.quantity_added) || payload.quantity_added <= 0) {
    return makeError('VALIDATION_ERROR', 'Số lượng nhập thêm phải lớn hơn 0.', {
      field_errors: { quantity_added: 'Số lượng nhập thêm phải lớn hơn 0.' },
    });
  }

  const qtyAdded = roundStockQuantity(payload.quantity_added);
  const newQty = roundStockQuantity(item.current_quantity + qtyAdded);
  const nowTs = buildLedgerTimestamp(state);

  item.current_quantity = newQty;
  item.status = 'Đang sử dụng';
  item.updated_at = nowTs;

  const transaction: InventoryTransaction = {
    transaction_id: state.next_ids.transaction++,
    item_id: item.item_id,
    action_type: 'Nhập thêm',
    change_quantity: qtyAdded,
    remaining_quantity: newQty,
    reason: payload.reason.trim() || 'Mua bổ sung vào lô hiện tại',
    transaction_date: nowTs,
    actor_device: payload.actor_device?.trim() || 'Desktop Server',
  };
  state.inventory_transactions.push(transaction);

  const lotView = buildFoodLotViews(state).find((l) => l.item_id === item.item_id)!;
  return { ok: true, data: { item: lotView, transaction } };
}

export function adjustFood(
  state: HouseholdDatabaseState,
  payload: AdjustFoodPayload,
): LedgerOutcome<{ item: FoodLotView; transaction: InventoryTransaction }> {
  const item = state.food_items.find((i) => i.item_id === payload.item_id);
  if (!item) {
    return makeError('NOT_FOUND', 'Không tìm thấy lô thực phẩm trong kho.');
  }
  if (item.status === 'Đã hủy') {
    return makeError('VALIDATION_ERROR', 'Không thể kiểm kê lô hàng đã hủy.');
  }
  if (!Number.isFinite(payload.new_quantity) || payload.new_quantity < 0) {
    return makeError('VALIDATION_ERROR', 'Số lượng thực tế kiểm kê không được âm.', {
      field_errors: { new_quantity: 'Số lượng kiểm kê phải >= 0.' },
    });
  }

  const newQty = roundStockQuantity(payload.new_quantity);
  const delta = roundStockQuantity(newQty - item.current_quantity);
  const nowTs = buildLedgerTimestamp(state);

  item.current_quantity = newQty;
  item.status = newQty <= 0 ? 'Đã hết' : 'Đang sử dụng';
  item.updated_at = nowTs;

  const transaction: InventoryTransaction = {
    transaction_id: state.next_ids.transaction++,
    item_id: item.item_id,
    action_type: 'Điều chỉnh',
    change_quantity: delta,
    remaining_quantity: newQty,
    reason: payload.reason.trim() || 'Kiểm kê điều chỉnh tồn kho thực tế',
    transaction_date: nowTs,
    actor_device: payload.actor_device?.trim() || 'Desktop Server',
  };
  state.inventory_transactions.push(transaction);

  const lotView = buildFoodLotViews(state).find((l) => l.item_id === item.item_id)!;
  return { ok: true, data: { item: lotView, transaction } };
}

export function moveFoodLocation(
  state: HouseholdDatabaseState,
  payload: MoveLocationPayload,
): LedgerOutcome<{ item: FoodLotView; transaction: InventoryTransaction }> {
  const item = state.food_items.find((i) => i.item_id === payload.item_id);
  if (!item) {
    return makeError('NOT_FOUND', 'Không tìm thấy lô thực phẩm.');
  }
  if (item.status === 'Đã hủy') {
    return makeError('VALIDATION_ERROR', 'Không thể đổi vị trí lô hàng đã hủy.');
  }

  const targetLoc = state.storage_locations.find((l) => l.location_id === payload.new_location_id);
  if (!targetLoc) {
    return makeError('VALIDATION_ERROR', 'Vị trí bảo quản mới không tồn tại.');
  }
  if (item.location_id === payload.new_location_id) {
    return makeError('VALIDATION_ERROR', 'Lô hàng đang ở đúng vị trí này rồi.');
  }

  const prevLoc = state.storage_locations.find((l) => l.location_id === item.location_id);
  const nowTs = buildLedgerTimestamp(state);

  item.location_id = targetLoc.location_id;
  item.updated_at = nowTs;

  const locSummary = `${prevLoc?.location_name ?? 'Cũ'} → ${targetLoc.area_type} · ${targetLoc.location_name}`;
  const reasonText = payload.reason?.trim()
    ? `Đổi vị trí (${locSummary}): ${payload.reason.trim()}`
    : `Đổi vị trí (${locSummary})`;

  const transaction: InventoryTransaction = {
    transaction_id: state.next_ids.transaction++,
    item_id: item.item_id,
    action_type: 'Điều chỉnh',
    change_quantity: 0,
    remaining_quantity: item.current_quantity,
    reason: reasonText,
    transaction_date: nowTs,
    actor_device: payload.actor_device?.trim() || 'Desktop Server',
  };
  state.inventory_transactions.push(transaction);

  const lotView = buildFoodLotViews(state).find((l) => l.item_id === item.item_id)!;
  return { ok: true, data: { item: lotView, transaction } };
}

export function updateFoodItem(
  state: HouseholdDatabaseState,
  itemId: number,
  input: FoodFormInput,
): LedgerOutcome<{ item: FoodLotView; transaction: InventoryTransaction | null }> {
  const item = state.food_items.find((i) => i.item_id === itemId);
  if (!item) {
    return makeError('NOT_FOUND', 'Không tìm thấy lô thực phẩm cần sửa.');
  }
  if (item.status === 'Đã hủy') {
    return makeError(
      'VALIDATION_ERROR',
      'Lô thực phẩm đã thanh lý/vứt hủy, không thể chỉnh sửa hồ sơ hoặc thay đổi số lượng.',
    );
  }
  const food = state.foods.find((f) => f.food_id === item.food_id);
  if (!food) {
    return makeError('NOT_FOUND', 'Không tìm thấy hồ sơ thực phẩm gốc.');
  }

  const fieldErrors = validateFoodForm(state, input, 'edit');
  if (Object.keys(fieldErrors).length > 0) {
    return makeError('VALIDATION_ERROR', 'Thông tin cập nhật chưa hợp lệ.', {
      field_errors: fieldErrors,
    });
  }

  const dupCheck = checkFoodDuplicate(state, {
    food_code: input.food_code,
    food_name: input.food_name,
    exclude_food_id: food.food_id,
  });
  if (dupCheck.has_code_conflict) {
    return makeError(
      'DUPLICATE_FOOD_CODE',
      `Mã thực phẩm "${input.food_code.trim()}" đang thuộc về món "${dupCheck.code_conflict_food?.food_name}".`,
      {
        field_errors: { food_code: 'Mã thực phẩm bị trùng với món khác.' },
        duplicate_match: dupCheck,
      },
    );
  }

  const nowTs = buildLedgerTimestamp(state);
  const prevQty = item.current_quantity;
  const nextQty = roundStockQuantity(input.quantity);

  food.food_code = input.food_code.trim();
  food.food_name = input.food_name.trim();
  food.category_id = input.category_id;
  food.default_unit_id = input.unit_id;
  food.min_quantity = roundStockQuantity(input.min_threshold);
  food.brand = input.brand.trim() || null;
  food.description = input.description.trim() || null;
  food.image_url = input.image_url?.trim() || null;

  item.location_id = input.location_id;
  item.unit_id = input.unit_id;
  item.min_threshold = roundStockQuantity(input.min_threshold);
  item.import_date = input.import_date;
  item.expiry_date = input.expiry_date;
  item.note = input.note.trim() || null;
  item.updated_at = nowTs;

  let transaction: InventoryTransaction | null = null;
  if (Math.abs(nextQty - prevQty) > 0.001) {
    const delta = roundStockQuantity(nextQty - prevQty);
    item.current_quantity = nextQty;
    item.status = nextQty <= 0 ? 'Đã hết' : 'Đang sử dụng';
    transaction = {
      transaction_id: state.next_ids.transaction++,
      item_id: item.item_id,
      action_type: 'Điều chỉnh',
      change_quantity: delta,
      remaining_quantity: nextQty,
      reason: input.adjustment_reason?.trim() || 'Cập nhật số lượng khi chỉnh sửa hồ sơ lô',
      transaction_date: nowTs,
      actor_device: input.actor_device?.trim() || 'Desktop Server',
    };
    state.inventory_transactions.push(transaction);
  }

  const lotView = buildFoodLotViews(state).find((l) => l.item_id === item.item_id)!;
  return { ok: true, data: { item: lotView, transaction } };
}

export function cancelFoodItem(
  state: HouseholdDatabaseState,
  payload: CancelFoodItemPayload,
): LedgerOutcome<{ item: FoodLotView; transaction: InventoryTransaction }> {
  const item = state.food_items.find((i) => i.item_id === payload.item_id);
  if (!item) {
    return makeError('NOT_FOUND', 'Không tìm thấy lô thực phẩm cần thanh lý.');
  }
  if (item.status === 'Đã hủy') {
    return makeError('VALIDATION_ERROR', 'Lô thực phẩm này đã ở trạng thái Đã hủy.');
  }

  const nowTs = buildLedgerTimestamp(state);
  const prevQty = item.current_quantity;

  // Preserve distinct 'Đã hủy' status per Section 8 Decision #6
  item.current_quantity = 0;
  item.status = 'Đã hủy';
  item.updated_at = nowTs;

  const transaction: InventoryTransaction = {
    transaction_id: state.next_ids.transaction++,
    item_id: item.item_id,
    action_type: 'Vứt hủy',
    change_quantity: -prevQty,
    remaining_quantity: 0,
    reason: payload.reason.trim() || 'Thanh lý / vứt hủy thực phẩm không còn sử dụng',
    transaction_date: nowTs,
    actor_device: payload.actor_device?.trim() || 'Desktop Server',
  };
  state.inventory_transactions.push(transaction);

  const lotView = buildFoodLotViews(state).find((l) => l.item_id === item.item_id)!;
  return { ok: true, data: { item: lotView, transaction } };
}

export function searchFoodItems(
  state: HouseholdDatabaseState,
  filter?: FoodSearchFilter,
): SearchFoodItemsResult {
  const referenceDate = resolveEffectiveDate(state.system_config);
  const items = filterFoodLotViews(
    buildFoodLotViews(state),
    filter,
    state.system_config.warning_days_threshold,
  );

  return {
    items,
    total_count: items.length,
    reference_date: referenceDate,
  };
}

export function cookRecipe(
  state: HouseholdDatabaseState,
  payload: CookRecipePayload,
): LedgerOutcome<CookRecipeResult> {
  const recipe = state.recipes.find((r) => r.recipe_id === payload.recipe_id);
  if (!recipe) {
    return makeError('NOT_FOUND', 'Không tìm thấy công thức nấu ăn cần chế biến.');
  }

  const eligibleLotViews = buildFoodLotViews(state)
    .filter((lot) => lot.status === 'Đang sử dụng' && lot.current_quantity > 0 && lot.days_remaining >= 0)
    .sort(compareFefoThenFifo);

  const remainingByItemId = new Map<number, number>();
  for (const lot of eligibleLotViews) {
    remainingByItemId.set(lot.item_id, lot.current_quantity);
  }

  interface PlannedIngredientDeduction {
    item_id: number;
    deduct_qty: number;
    ingredient_name: string;
  }

  const planned: PlannedIngredientDeduction[] = [];
  let skippedMissing = 0;

  // Phase 1: Validate every ingredient & unit conversion upfront before any state mutation
  for (const ing of recipe.ingredients) {
    if (!Number.isFinite(ing.quantity) || ing.quantity <= 0) {
      return makeError(
        'VALIDATION_ERROR',
        `Định lượng nguyên liệu "${ing.ingredient_name}" không hợp lệ (> 0).`,
      );
    }

    const matchedLot = eligibleLotViews.find(
      (lot) =>
        (remainingByItemId.get(lot.item_id) ?? 0) > 0 &&
        doesIngredientMatchFood(ing, lot.food_id, normalizeVietnameseSearchText(lot.food_name)),
    );

    if (!matchedLot) {
      skippedMissing += 1;
      continue;
    }

    const convertedQty = convertRecipeQuantityToLotUnit(
      ing.quantity,
      ing.unit_name,
      matchedLot.unit_name,
    );
    if (convertedQty === null) {
      return makeError(
        'VALIDATION_ERROR',
        `Không thể quy đổi đơn vị "${ing.unit_name}" sang "${matchedLot.unit_name}" cho nguyên liệu "${ing.ingredient_name}".`,
      );
    }
    if (convertedQty <= 0) {
      return makeError(
        'VALIDATION_ERROR',
        `Lượng trừ sau quy đổi cho "${ing.ingredient_name}" phải lớn hơn 0.`,
      );
    }

    const availableInLot = remainingByItemId.get(matchedLot.item_id) ?? 0;
    const deductQty = roundConvertedQuantity(Math.min(convertedQty, availableInLot));
    if (deductQty <= 0) {
      skippedMissing += 1;
      continue;
    }

    planned.push({
      item_id: matchedLot.item_id,
      deduct_qty: deductQty,
      ingredient_name: ing.ingredient_name,
    });
    remainingByItemId.set(matchedLot.item_id, roundConvertedQuantity(availableInLot - deductQty));
  }

  if (planned.length === 0) {
    return makeError(
      'VALIDATION_ERROR',
      `Không có nguyên liệu nào đang khả dụng trong kho để nấu món "${recipe.recipe_name}".`,
    );
  }

  // Phase 2: Atomic commit across all matched active lots
  const nowTs = buildLedgerTimestamp(state);
  const actorDevice = payload.actor_device?.trim() || 'Desktop Server';
  const updatedItemIdSet = new Set<number>();

  for (const step of planned) {
    const item = state.food_items.find((i) => i.item_id === step.item_id);
    if (!item) continue;

    const rawNext = roundConvertedQuantity(Math.max(0, item.current_quantity - step.deduct_qty));
    const nextQty = rawNext <= 0 ? 0 : rawNext;
    item.current_quantity = nextQty;
    item.status = nextQty <= 0 ? 'Đã hết' : 'Đang sử dụng';
    item.updated_at = nowTs;

    state.inventory_transactions.push({
      transaction_id: state.next_ids.transaction++,
      item_id: item.item_id,
      action_type: 'Sử dụng',
      change_quantity: -step.deduct_qty,
      remaining_quantity: nextQty,
      reason: `Nấu món: ${recipe.recipe_name} (${step.ingredient_name})`,
      transaction_date: nowTs,
      actor_device: actorDevice,
    });

    updatedItemIdSet.add(item.item_id);
  }

  const updatedItems = buildFoodLotViews(state).filter((l) => updatedItemIdSet.has(l.item_id));
  return {
    ok: true,
    data: {
      recipe_name: recipe.recipe_name,
      updated_items: updatedItems,
      deducted_count: updatedItems.length,
      skipped_missing: skippedMissing,
    },
  };
}

export function getAuditLogs(
  state: HouseholdDatabaseState,
  filter?: AuditLogFilter,
): GetAuditLogsResult {
  const itemsById = new Map(state.food_items.map((i) => [i.item_id, i]));
  const foodsById = new Map(state.foods.map((f) => [f.food_id, f]));
  const unitsById = new Map(state.units.map((u) => [u.unit_id, u]));

  let rows: InventoryTransactionView[] = [];
  for (const tx of state.inventory_transactions) {
    const item = itemsById.get(tx.item_id);
    const food = item ? foodsById.get(item.food_id) : undefined;
    const unit = item ? unitsById.get(item.unit_id) : undefined;

    rows.push({
      ...tx,
      food_id: food?.food_id ?? 0,
      food_code: food?.food_code ?? 'N/A',
      item_code: item?.item_code ?? `LO-${tx.item_id}`,
      food_name: food?.food_name ?? 'Thực phẩm không xác định',
      unit_name: unit?.unit_name ?? 'đơn vị',
      previous_quantity: roundStockQuantity(tx.remaining_quantity - tx.change_quantity),
    });
  }

  if (filter?.item_id !== undefined) {
    rows = rows.filter((r) => r.item_id === filter.item_id);
  }

  if (filter?.action_type && filter.action_type !== 'all') {
    rows = rows.filter((r) => r.action_type === filter.action_type);
  }

  if (filter?.actor_device && filter.actor_device !== 'all') {
    const targetDevice = normalizeVietnameseSearchText(filter.actor_device);
    rows = rows.filter((r) => normalizeVietnameseSearchText(r.actor_device).includes(targetDevice));
  }

  if (filter?.start_date && isValidIsoDate(filter.start_date)) {
    rows = rows.filter((r) => extractDatePart(r.transaction_date) >= filter.start_date!);
  }

  if (filter?.end_date && isValidIsoDate(filter.end_date)) {
    rows = rows.filter((r) => extractDatePart(r.transaction_date) <= filter.end_date!);
  }

  if (filter?.keyword) {
    const kw = normalizeVietnameseSearchText(filter.keyword);
    rows = rows.filter((r) =>
      [r.food_name, r.food_code, r.item_code, r.reason ?? '', r.actor_device].some((txt) =>
        normalizeVietnameseSearchText(txt).includes(kw),
      ),
    );
  }

  rows.sort((a, b) => {
    const dateCmp = b.transaction_date.localeCompare(a.transaction_date);
    if (dateCmp !== 0) return dateCmp;
    return b.transaction_id - a.transaction_id;
  });

  let restockTotal = 0;
  let useTotal = 0;
  let wasteTotal = 0;
  let adjustCount = 0;

  for (const row of rows) {
    if (row.action_type === 'Nhập thêm') {
      restockTotal = roundStockQuantity(restockTotal + Math.abs(row.change_quantity));
    } else if (row.action_type === 'Sử dụng') {
      useTotal = roundStockQuantity(useTotal + Math.abs(row.change_quantity));
    } else if (row.action_type === 'Vứt hủy') {
      wasteTotal = roundStockQuantity(wasteTotal + Math.abs(row.change_quantity));
    } else if (row.action_type === 'Điều chỉnh') {
      adjustCount += 1;
    }
  }

  return {
    transactions: rows,
    summary: {
      total_count: rows.length,
      restock_total: restockTotal,
      use_total: useTotal,
      waste_total: wasteTotal,
      adjust_count: adjustCount,
    },
  };
}

export function getItemDetail(
  state: HouseholdDatabaseState,
  itemId: number,
): LedgerOutcome<ItemDetailResult> {
  const lot = buildFoodLotViews(state).find((l) => l.item_id === itemId);
  if (!lot) {
    return makeError('NOT_FOUND', 'Không tìm thấy lô hàng trong kho (có thể đã bị xóa bởi thiết bị khác).');
  }
  const { transactions } = getAuditLogs(state, { item_id: itemId });
  const matchingRecipes = suggestRecipesForPantry(state, itemId);

  return {
    ok: true,
    data: {
      item: lot,
      transactions,
      matching_recipes: matchingRecipes,
    },
  };
}

export function saveCategory(
  state: HouseholdDatabaseState,
  payload: SaveCategoryPayload,
): LedgerOutcome<Category> {
  const name = payload.category_name.trim();
  if (!name) {
    return makeError('VALIDATION_ERROR', 'Tên loại thực phẩm không được để trống.', {
      field_errors: { category_name: 'Vui lòng nhập tên loại thực phẩm.' },
    });
  }

  const duplicate = state.categories.find(
    (c) =>
      c.category_id !== payload.category_id &&
      c.category_name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (duplicate) {
    return makeError('VALIDATION_ERROR', `Loại thực phẩm "${name}" đã tồn tại trong danh mục.`, {
      field_errors: { category_name: 'Tên loại thực phẩm đã tồn tại.' },
    });
  }

  if (payload.category_id !== undefined) {
    const existing = state.categories.find((c) => c.category_id === payload.category_id);
    if (!existing) return makeError('NOT_FOUND', 'Không tìm thấy loại thực phẩm cần sửa.');
    existing.category_name = name;
    existing.description = payload.description?.trim() || null;
    return { ok: true, data: { ...existing } };
  }

  const created: Category = {
    category_id: state.next_ids.category++,
    category_name: name,
    description: payload.description?.trim() || null,
  };
  state.categories.push(created);
  return { ok: true, data: { ...created } };
}

export function deleteCategory(
  state: HouseholdDatabaseState,
  categoryId: number,
): LedgerOutcome<{ deleted_id: number }> {
  const index = state.categories.findIndex((c) => c.category_id === categoryId);
  if (index === -1) return makeError('NOT_FOUND', 'Không tìm thấy loại thực phẩm.');

  const refCount = state.foods.filter((f) => f.category_id === categoryId).length;
  if (refCount > 0) {
    return makeError(
      'CONSTRAINT_IN_USE',
      `Không thể xóa loại "${state.categories[index].category_name}" vì đang có ${refCount} thực phẩm tham chiếu.`,
      { referencing_count: refCount },
    );
  }

  state.categories.splice(index, 1);
  return { ok: true, data: { deleted_id: categoryId } };
}

export function saveUnit(state: HouseholdDatabaseState, payload: SaveUnitPayload): LedgerOutcome<Unit> {
  const name = payload.unit_name.trim();
  if (!name) {
    return makeError('VALIDATION_ERROR', 'Tên đơn vị tính không được để trống.', {
      field_errors: { unit_name: 'Vui lòng nhập tên đơn vị.' },
    });
  }

  const duplicate = state.units.find(
    (u) => u.unit_id !== payload.unit_id && u.unit_name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (duplicate) {
    return makeError('VALIDATION_ERROR', `Đơn vị "${name}" đã tồn tại.`, {
      field_errors: { unit_name: 'Tên đơn vị đã tồn tại.' },
    });
  }

  if (payload.unit_id !== undefined) {
    const existing = state.units.find((u) => u.unit_id === payload.unit_id);
    if (!existing) return makeError('NOT_FOUND', 'Không tìm thấy đơn vị tính cần sửa.');
    existing.unit_name = name;
    existing.description = payload.description?.trim() || null;
    return { ok: true, data: { ...existing } };
  }

  const created: Unit = {
    unit_id: state.next_ids.unit++,
    unit_name: name,
    description: payload.description?.trim() || null,
  };
  state.units.push(created);
  return { ok: true, data: { ...created } };
}

export function deleteUnit(
  state: HouseholdDatabaseState,
  unitId: number,
): LedgerOutcome<{ deleted_id: number }> {
  const index = state.units.findIndex((u) => u.unit_id === unitId);
  if (index === -1) return makeError('NOT_FOUND', 'Không tìm thấy đơn vị tính.');

  const refCount =
    state.food_items.filter((i) => i.unit_id === unitId).length +
    state.foods.filter((f) => f.default_unit_id === unitId).length;
  if (refCount > 0) {
    return makeError(
      'CONSTRAINT_IN_USE',
      `Không thể xóa đơn vị "${state.units[index].unit_name}" vì đang được sử dụng bởi ${refCount} bản ghi thực phẩm/lô hàng.`,
      { referencing_count: refCount },
    );
  }

  state.units.splice(index, 1);
  return { ok: true, data: { deleted_id: unitId } };
}

export function saveLocation(
  state: HouseholdDatabaseState,
  payload: SaveLocationPayload,
): LedgerOutcome<StorageLocation> {
  const name = payload.location_name.trim();
  if (!name) {
    return makeError('VALIDATION_ERROR', 'Tên vị trí bảo quản không được để trống.', {
      field_errors: { location_name: 'Vui lòng nhập tên vị trí bảo quản.' },
    });
  }

  const duplicate = state.storage_locations.find(
    (l) =>
      l.location_id !== payload.location_id &&
      l.area_type === payload.area_type &&
      l.location_name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (duplicate) {
    return makeError('VALIDATION_ERROR', `Vị trí "${name}" đã tồn tại trong khu vực ${payload.area_type}.`, {
      field_errors: { location_name: 'Vị trí bảo quản đã tồn tại trong khu vực này.' },
    });
  }

  if (payload.location_id !== undefined) {
    const existing = state.storage_locations.find((l) => l.location_id === payload.location_id);
    if (!existing) return makeError('NOT_FOUND', 'Không tìm thấy vị trí bảo quản cần sửa.');
    existing.area_type = payload.area_type;
    existing.location_name = name;
    existing.description = payload.description?.trim() || null;
    return { ok: true, data: { ...existing } };
  }

  const created: StorageLocation = {
    location_id: state.next_ids.location++,
    area_type: payload.area_type,
    location_name: name,
    description: payload.description?.trim() || null,
  };
  state.storage_locations.push(created);
  return { ok: true, data: { ...created } };
}

export function deleteLocation(
  state: HouseholdDatabaseState,
  locationId: number,
): LedgerOutcome<{ deleted_id: number }> {
  const index = state.storage_locations.findIndex((l) => l.location_id === locationId);
  if (index === -1) return makeError('NOT_FOUND', 'Không tìm thấy vị trí bảo quản.');

  const refCount = state.food_items.filter((i) => i.location_id === locationId).length;
  if (refCount > 0) {
    return makeError(
      'CONSTRAINT_IN_USE',
      `Không thể xóa vị trí "${state.storage_locations[index].location_name}" vì đang có ${refCount} lô thực phẩm được lưu trữ tại đây.`,
      { referencing_count: refCount },
    );
  }

  state.storage_locations.splice(index, 1);
  return { ok: true, data: { deleted_id: locationId } };
}

export function saveRecipe(
  state: HouseholdDatabaseState,
  payload: SaveRecipePayload,
): LedgerOutcome<Recipe> {
  const name = payload.recipe_name.trim();
  if (!name) {
    return makeError('VALIDATION_ERROR', 'Tên món ăn không được để trống.', {
      field_errors: { recipe_name: 'Vui lòng nhập tên công thức món ăn.' },
    });
  }
  if (!payload.ingredients.length) {
    return makeError('VALIDATION_ERROR', 'Công thức cần ít nhất 1 nguyên liệu.');
  }
  if (!payload.steps.length) {
    return makeError('VALIDATION_ERROR', 'Công thức cần ít nhất 1 bước hướng dẫn chế biến.');
  }

  const cleanedIngredients = payload.ingredients.map((ing, idx) => ({
    ...ing,
    ingredient_id: ing.ingredient_id || idx + 1,
    food_id: ing.food_id ?? null,
    ingredient_name: ing.ingredient_name.trim(),
    unit_name: ing.unit_name.trim() || 'đơn vị',
    quantity: Number.isFinite(ing.quantity) && ing.quantity > 0 ? roundStockQuantity(ing.quantity) : 1,
  }));

  const cleanedSteps = payload.steps.map((s) => s.trim()).filter(Boolean);
  if (!cleanedSteps.length) {
    return makeError('VALIDATION_ERROR', 'Các bước chế biến không được để trống.');
  }

  if (payload.recipe_id !== undefined) {
    const existing = state.recipes.find((r) => r.recipe_id === payload.recipe_id);
    if (!existing) return makeError('NOT_FOUND', 'Không tìm thấy công thức món ăn.');
    existing.recipe_name = name;
    existing.cook_time_minutes = Math.max(1, Math.round(payload.cook_time_minutes || 15));
    existing.servings = Math.max(1, Math.round(payload.servings || 2));
    existing.priority_hint = payload.priority_hint.trim();
    existing.ingredients = cleanedIngredients;
    existing.steps = cleanedSteps;
    return { ok: true, data: { ...existing } };
  }

  const created: Recipe = {
    recipe_id: state.next_ids.recipe++,
    recipe_name: name,
    cook_time_minutes: Math.max(1, Math.round(payload.cook_time_minutes || 15)),
    servings: Math.max(1, Math.round(payload.servings || 2)),
    priority_hint: payload.priority_hint.trim(),
    ingredients: cleanedIngredients,
    steps: cleanedSteps,
  };
  state.recipes.push(created);
  return { ok: true, data: { ...created } };
}

export function getCatalogMetadata(state: HouseholdDatabaseState): CatalogMetadataResult {
  const categories: Record<number, number> = {};
  const units: Record<number, number> = {};
  const locations: Record<number, number> = {};

  for (const food of state.foods) {
    categories[food.category_id] = (categories[food.category_id] ?? 0) + 1;
    units[food.default_unit_id] = (units[food.default_unit_id] ?? 0) + 1;
  }
  for (const item of state.food_items) {
    units[item.unit_id] = (units[item.unit_id] ?? 0) + 1;
    locations[item.location_id] = (locations[item.location_id] ?? 0) + 1;
  }

  return {
    foods: state.foods.map((f) => ({ ...f })),
    reference_counts: {
      categories,
      units,
      locations,
    },
  };
}

export function deleteRecipe(
  state: HouseholdDatabaseState,
  recipeId: number,
): LedgerOutcome<{ deleted_id: number }> {
  const index = state.recipes.findIndex((r) => r.recipe_id === recipeId);
  if (index === -1) return makeError('NOT_FOUND', 'Không tìm thấy công thức món ăn.');
  state.recipes.splice(index, 1);
  return { ok: true, data: { deleted_id: recipeId } };
}

export function updateSystemConfig(
  state: HouseholdDatabaseState,
  patch: Partial<SystemConfig>,
): LedgerOutcome<SystemConfig> {
  const next: SystemConfig = {
    ...state.system_config,
    ...patch,
  };

  const fieldErrors: Partial<Record<string, string>> = {};
  if (!Number.isFinite(next.warning_days_threshold) || next.warning_days_threshold < 0) {
    fieldErrors.warning_days_threshold = 'Ngưỡng cảnh báo hết hạn phải >= 0 ngày.';
  }
  if (!Number.isFinite(next.min_quantity_default) || next.min_quantity_default < 0) {
    fieldErrors.min_quantity_default = 'Mức tồn tối thiểu mặc định phải >= 0.';
  }
  if (!Number.isFinite(next.fefo_high_days) || next.fefo_high_days < 0) {
    fieldErrors.fefo_high_days = 'Ngưỡng FEFO Ưu tiên Cao phải >= 0.';
  }
  if (!Number.isFinite(next.fefo_medium_days) || next.fefo_medium_days < next.fefo_high_days) {
    fieldErrors.fefo_medium_days = 'Ngưỡng FEFO Trung bình phải >= ngưỡng Ưu tiên Cao.';
  }
  if (!Number.isInteger(next.server_port) || next.server_port < 1024 || next.server_port > 65535) {
    fieldErrors.server_port = 'Cổng Server hợp lệ từ 1024 đến 65535.';
  }
  if (!isValidIsoDate(next.simulated_date)) {
    fieldErrors.simulated_date = 'Ngày mô phỏng không đúng định dạng YYYY-MM-DD.';
  }
  if (!next.server_ip.trim()) {
    fieldErrors.server_ip = 'Địa chỉ IP Server không được để trống.';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return makeError('VALIDATION_ERROR', 'Cấu hình hệ thống chưa hợp lệ.', { field_errors: fieldErrors });
  }

  state.system_config = next;

  // Keep SQL system_settings table rows synchronized
  const syncKey = (key: string, value: string) => {
    const row = state.system_settings.find((s) => s.setting_key === key);
    if (row) row.setting_value = value;
  };
  syncKey('timezone', next.timezone);
  syncKey('warning_days_threshold', String(next.warning_days_threshold));
  syncKey('min_quantity_default', String(next.min_quantity_default));

  return { ok: true, data: { ...state.system_config } };
}

export function shiftSimulatedDate(
  state: HouseholdDatabaseState,
  payload: ShiftSimulatedDatePayload,
): LedgerOutcome<SystemConfig> {
  if (payload.reset_to_default) {
    return updateSystemConfig(state, {
      simulated_date: DEFAULT_SIMULATED_DATE,
      use_simulated_date: true,
    });
  }

  if (payload.target_date !== undefined) {
    if (payload.target_date === null) {
      return updateSystemConfig(state, { use_simulated_date: false });
    }
    if (!isValidIsoDate(payload.target_date)) {
      return makeError('VALIDATION_ERROR', 'Ngày mô phỏng đích không hợp lệ.');
    }
    return updateSystemConfig(state, {
      simulated_date: payload.target_date,
      use_simulated_date: true,
    });
  }

  const delta = payload.delta_days ?? 0;
  const currentEffective = resolveEffectiveDate(state.system_config);
  const nextDate = shiftIsoDate(currentEffective, delta);
  return updateSystemConfig(state, {
    simulated_date: nextDate,
    use_simulated_date: true,
  });
}
