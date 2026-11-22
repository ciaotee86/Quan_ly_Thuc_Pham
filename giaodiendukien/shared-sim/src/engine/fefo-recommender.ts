import {
  diffCalendarDays,
  getTodayInTimezone,
  isValidIsoDate,
  normalizeVietnameseSearchText,
  roundConvertedQuantity,
} from '../domain/calendar-date';
import type {
  Category,
  FefoPriorityLevel,
  FefoRecommendationItem,
  Food,
  FoodItem,
  FoodLotView,
  HouseholdDatabaseState,
  RecipeIngredient,
  RecipeIngredientAvailability,
  RecipeMatchSuggestion,
  StorageLocation,
  SystemConfig,
  Unit,
} from '../domain/food-entities';
import type { FefoListResult, FefoQueryPayload } from '../domain/protocol-contracts';

export function resolveEffectiveDate(config: SystemConfig): string {
  if (config.use_simulated_date && isValidIsoDate(config.simulated_date)) {
    return config.simulated_date;
  }
  return getTodayInTimezone(config.timezone);
}

export function classifyFefoPriority(daysRemaining: number, config: SystemConfig): FefoPriorityLevel {
  if (daysRemaining <= config.fefo_high_days) {
    return 'Cao';
  }
  if (daysRemaining <= config.fefo_medium_days) {
    return 'Trung bình';
  }
  return 'Thấp';
}

export function buildFoodLotView(
  item: FoodItem,
  food: Food,
  category: Category | undefined,
  location: StorageLocation | undefined,
  unit: Unit | undefined,
  config: SystemConfig,
  referenceDate: string,
): FoodLotView {
  const daysRemaining = diffCalendarDays(item.expiry_date, referenceDate);
  const isActive = item.status === 'Đang sử dụng';
  const isExpired = isActive && daysRemaining < 0;
  const isExpiringSoon = isActive && daysRemaining >= 0 && daysRemaining <= config.warning_days_threshold;
  const isLowStock = isActive && item.current_quantity <= item.min_threshold;
  const fefoPriority =
    isActive && item.current_quantity > 0 && daysRemaining >= 0
      ? classifyFefoPriority(daysRemaining, config)
      : null;

  return {
    item_id: item.item_id,
    food_id: food.food_id,
    food_code: food.food_code,
    item_code: item.item_code,
    food_name: food.food_name,
    category_id: food.category_id,
    category_name: category?.category_name ?? 'Chưa phân loại',
    brand: food.brand,
    image_url: food.image_url,
    description: food.description,
    area_type: location?.area_type ?? 'Trong tủ lạnh',
    location_id: item.location_id,
    location_name: location?.location_name ?? 'Chưa xác định',
    unit_id: item.unit_id,
    unit_name: unit?.unit_name ?? 'đơn vị',
    initial_quantity: item.initial_quantity,
    current_quantity: item.current_quantity,
    min_threshold: item.min_threshold,
    import_date: item.import_date,
    expiry_date: item.expiry_date,
    status: item.status,
    note: item.note,
    updated_at: item.updated_at,
    days_remaining: daysRemaining,
    is_expired: isExpired,
    is_expiring_soon: isExpiringSoon,
    is_low_stock: isLowStock,
    fefo_priority: fefoPriority,
  };
}

export function buildFoodLotViews(state: HouseholdDatabaseState): FoodLotView[] {
  const referenceDate = resolveEffectiveDate(state.system_config);
  const foodsById = new Map(state.foods.map((f) => [f.food_id, f]));
  const categoriesById = new Map(state.categories.map((c) => [c.category_id, c]));
  const unitsById = new Map(state.units.map((u) => [u.unit_id, u]));
  const locationsById = new Map(state.storage_locations.map((l) => [l.location_id, l]));

  const views: FoodLotView[] = [];
  for (const item of state.food_items) {
    const food = foodsById.get(item.food_id);
    if (!food) continue;
    views.push(
      buildFoodLotView(
        item,
        food,
        categoriesById.get(food.category_id),
        locationsById.get(item.location_id),
        unitsById.get(item.unit_id),
        state.system_config,
        referenceDate,
      ),
    );
  }
  return views;
}

export function compareFefoThenFifo(a: FoodLotView, b: FoodLotView): number {
  if (a.expiry_date !== b.expiry_date) {
    return a.expiry_date < b.expiry_date ? -1 : 1;
  }
  if (a.import_date !== b.import_date) {
    return a.import_date < b.import_date ? -1 : 1;
  }
  return a.item_id - b.item_id;
}

export function doesIngredientMatchFood(
  ing: Pick<RecipeIngredient, 'food_id' | 'ingredient_name'>,
  foodId: number,
  normalizedFoodName: string,
): boolean {
  if (ing.food_id !== undefined && ing.food_id !== null) {
    return ing.food_id === foodId;
  }
  const normalizedIngName = normalizeVietnameseSearchText(ing.ingredient_name);
  if (!normalizedIngName || !normalizedFoodName) return false;
  return (
    normalizedFoodName.includes(normalizedIngName) ||
    normalizedIngName.includes(normalizedFoodName)
  );
}

export function convertRecipeQuantityToLotUnit(
  quantity: number,
  fromUnit: string,
  toUnit: string,
): number | null {
  if (!Number.isFinite(quantity) || quantity < 0) {
    return null;
  }
  const src = fromUnit.trim().toLowerCase();
  const dst = toUnit.trim().toLowerCase();
  if (!src || !dst) return null;

  let converted: number;
  if (src === dst) {
    converted = quantity;
  } else if (src === 'g' && dst === 'kg') {
    converted = quantity / 1000;
  } else if (src === 'kg' && dst === 'g') {
    converted = quantity * 1000;
  } else if (src === 'ml' && dst === 'lít') {
    converted = quantity / 1000;
  } else if (src === 'lít' && dst === 'ml') {
    converted = quantity * 1000;
  } else {
    return null;
  }

  return roundConvertedQuantity(converted);
}

function buildPriorityReason(
  lot: FoodLotView,
  priority: FefoPriorityLevel,
  tieGroupSize: number,
  tiePosition: number,
): string {
  const dayLabel =
    lot.days_remaining === 0
      ? 'Hết hạn ngay hôm nay'
      : lot.days_remaining === 1
        ? 'Chỉ còn 1 ngày sử dụng'
        : `Còn ${lot.days_remaining} ngày đến hạn`;

  const fifoSuffix =
    tieGroupSize > 1
      ? ` · Đồng hạn ${lot.expiry_date}, xếp FIFO #${tiePosition}/${tieGroupSize} (nhập ${lot.import_date})`
      : '';

  if (priority === 'Cao') {
    return `${dayLabel}, cần ưu tiên chế biến ngay${fifoSuffix}.`;
  }
  if (priority === 'Trung bình') {
    return `${dayLabel}, nên lên kế hoạch dùng trong tuần${fifoSuffix}.`;
  }
  return `${dayLabel}, bảo quản ổn định (${lot.location_name})${fifoSuffix}.`;
}

function buildSuggestedAction(priority: FefoPriorityLevel): string {
  if (priority === 'Cao') return 'Sắp hết hạn, nấu ngay hôm nay/mai';
  if (priority === 'Trung bình') return 'Dự kiến dùng trong tuần';
  return 'Bảo quản tiếp tục';
}

export function generateFefoRecommendations(
  state: HouseholdDatabaseState,
  query?: FefoQueryPayload,
): FefoListResult {
  const referenceDate = resolveEffectiveDate(state.system_config);
  const allLots = buildFoodLotViews(state);

  let expiredExcludedCount = 0;
  const eligibleLots: FoodLotView[] = [];

  for (const lot of allLots) {
    if (lot.status !== 'Đang sử dụng' || lot.current_quantity <= 0) {
      continue;
    }
    if (lot.days_remaining < 0) {
      expiredExcludedCount += 1;
      continue;
    }
    eligibleLots.push(lot);
  }

  eligibleLots.sort(compareFefoThenFifo);

  // Track FIFO tie groups sharing the exact same expiry_date
  const tieGroups = new Map<string, FoodLotView[]>();
  for (const lot of eligibleLots) {
    const group = tieGroups.get(lot.expiry_date) ?? [];
    group.push(lot);
    tieGroups.set(lot.expiry_date, group);
  }

  const countsByPriority = {
    Cao: 0,
    'Trung bình': 0,
    Thấp: 0,
  };

  const rankedItems: FefoRecommendationItem[] = eligibleLots.map((lot, index) => {
    const priority = lot.fefo_priority ?? classifyFefoPriority(lot.days_remaining, state.system_config);
    countsByPriority[priority] += 1;

    const tieGroup = tieGroups.get(lot.expiry_date) ?? [lot];
    const tiePosition = tieGroup.findIndex((entry) => entry.item_id === lot.item_id) + 1;

    const normalizedLotName = normalizeVietnameseSearchText(lot.food_name);
    const matchingRecipeIds = state.recipes
      .filter((recipe) =>
        recipe.ingredients.some((ing) =>
          doesIngredientMatchFood(ing, lot.food_id, normalizedLotName),
        ),
      )
      .map((recipe) => recipe.recipe_id);

    return {
      rank: index + 1,
      item_id: lot.item_id,
      food_id: lot.food_id,
      food_code: lot.food_code,
      item_code: lot.item_code,
      food_name: lot.food_name,
      category_id: lot.category_id,
      category_name: lot.category_name,
      area_type: lot.area_type,
      location_id: lot.location_id,
      location_name: lot.location_name,
      current_quantity: lot.current_quantity,
      min_threshold: lot.min_threshold,
      unit_id: lot.unit_id,
      unit_name: lot.unit_name,
      import_date: lot.import_date,
      expiry_date: lot.expiry_date,
      days_remaining: lot.days_remaining,
      priority_level: priority,
      priority_reason: buildPriorityReason(lot, priority, tieGroup.length, tiePosition),
      suggested_action: buildSuggestedAction(priority),
      fifo_tie_group_size: tieGroup.length,
      fifo_tie_position: tiePosition,
      matching_recipe_ids: matchingRecipeIds,
      image_url: lot.image_url,
    };
  });

  const filteredItems = rankedItems.filter((item) => {
    if (query?.area_type && query.area_type !== 'all' && item.area_type !== query.area_type) {
      return false;
    }
    if (query?.location_id && query.location_id !== 'all' && item.location_id !== query.location_id) {
      return false;
    }
    if (
      query?.priority_level &&
      query.priority_level !== 'all' &&
      item.priority_level !== query.priority_level
    ) {
      return false;
    }
    return true;
  });

  return {
    reference_date: referenceDate,
    items: filteredItems,
    counts_by_priority: countsByPriority,
    expired_excluded_count: expiredExcludedCount,
  };
}

export function suggestRecipesForPantry(
  state: HouseholdDatabaseState,
  focusItemId?: number,
): RecipeMatchSuggestion[] {
  const allLots = buildFoodLotViews(state);
  const eligibleLots = allLots
    .filter((lot) => lot.status === 'Đang sử dụng' && lot.current_quantity > 0 && lot.days_remaining >= 0)
    .sort(compareFefoThenFifo);

  const focusLot = focusItemId !== undefined ? allLots.find((l) => l.item_id === focusItemId) : undefined;
  const normalizedFocusName = focusLot ? normalizeVietnameseSearchText(focusLot.food_name) : '';

  const suggestions: RecipeMatchSuggestion[] = state.recipes.map((recipe) => {
    let matchedFefoCount = 0;
    let matchedHighPriorityCount = 0;
    let readyCount = 0;
    let missingCount = 0;

    const ingredientStatuses: RecipeIngredientAvailability[] = recipe.ingredients.map((ing) => {
      const matchedLot = eligibleLots.find((lot) =>
        doesIngredientMatchFood(ing, lot.food_id, normalizeVietnameseSearchText(lot.food_name)),
      );

      if (!matchedLot) {
        missingCount += 1;
        return {
          ingredient_id: ing.ingredient_id,
          food_id: ing.food_id ?? null,
          ingredient_name: ing.ingredient_name,
          required_quantity: ing.quantity,
          unit_name: ing.unit_name,
          is_essential: ing.is_essential,
          availability: 'Thiếu',
          matched_item_id: null,
          matched_food_name: null,
          available_quantity: 0,
          available_unit_name: null,
          deduct_quantity_in_lot_unit: undefined,
          unit_compatible: undefined,
          matched_days_remaining: null,
          matched_expiry_date: null,
          matched_priority: null,
        };
      }

      readyCount += 1;
      const isUrgent =
        matchedLot.fefo_priority === 'Cao' ||
        matchedLot.days_remaining <= state.system_config.warning_days_threshold;

      if (matchedLot.fefo_priority === 'Cao') {
        matchedHighPriorityCount += 1;
      }
      if (isUrgent || matchedLot.fefo_priority === 'Trung bình') {
        matchedFefoCount += 1;
      }

      const convertedDeductQty = convertRecipeQuantityToLotUnit(
        ing.quantity,
        ing.unit_name,
        matchedLot.unit_name,
      );

      return {
        ingredient_id: ing.ingredient_id,
        food_id: ing.food_id ?? null,
        ingredient_name: ing.ingredient_name,
        required_quantity: ing.quantity,
        unit_name: ing.unit_name,
        is_essential: ing.is_essential,
        availability: isUrgent ? 'Có sẵn - Ưu tiên cao' : 'Có sẵn',
        matched_item_id: matchedLot.item_id,
        matched_food_name: matchedLot.food_name,
        available_quantity: matchedLot.current_quantity,
        available_unit_name: matchedLot.unit_name,
        deduct_quantity_in_lot_unit: convertedDeductQty ?? undefined,
        unit_compatible: convertedDeductQty !== null,
        matched_days_remaining: matchedLot.days_remaining,
        matched_expiry_date: matchedLot.expiry_date,
        matched_priority: matchedLot.fefo_priority,
      };
    });

    const matchScore =
      matchedHighPriorityCount * 35 + matchedFefoCount * 15 + readyCount * 10 - missingCount * 5;

    return {
      recipe,
      match_score: matchScore,
      matched_fefo_count: matchedFefoCount,
      matched_high_priority_count: matchedHighPriorityCount,
      ready_count: readyCount,
      missing_count: missingCount,
      ingredient_statuses: ingredientStatuses,
    };
  });

  const filtered = focusLot
    ? suggestions.filter((s) =>
        s.recipe.ingredients.some((ing) =>
          doesIngredientMatchFood(ing, focusLot.food_id, normalizedFocusName),
        ),
      )
    : suggestions;

  return filtered.sort((a, b) => {
    if (b.matched_high_priority_count !== a.matched_high_priority_count) {
      return b.matched_high_priority_count - a.matched_high_priority_count;
    }
    if (b.matched_fefo_count !== a.matched_fefo_count) {
      return b.matched_fefo_count - a.matched_fefo_count;
    }
    if (b.match_score !== a.match_score) {
      return b.match_score - a.match_score;
    }
    return a.recipe.recipe_id - b.recipe.recipe_id;
  });
}
