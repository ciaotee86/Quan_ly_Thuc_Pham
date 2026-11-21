"""
server/core_services.py
=============================================================================
ĐỘNG CƠ LÕI NGHIỆP VỤ & THUẬT TOÁN FEFO (PHẦN 2)
Dự án: Quản lý thực phẩm gia đình - Môn Lập trình Mạng (TS. Đặng Hùng Vĩ)
Nhóm thực hiện: Nhóm Thầy Bùa Mao Sơn
Kỹ sư phụ trách: Nguyễn Hữu Nhân (Mảng Động cơ Thuật toán & Nghiệp vụ Lõi)

CÁC TÍNH NĂNG NÂNG CẤP ĐỘT PHÁ:
1. Thuật toán hòa hạn FEFO 3 cấp độ (Multi-level Tie-breaker):
   - Tầng 1: Hạn dùng gần nhất trước (expiry_date ASC).
   - Tầng 2: Nếu trùng hạn, lô nhập trước dùng trước (import_date ASC - FIFO).
   - Tầng 3: Nếu cùng hạn và cùng ngày nhập, ưu tiên lô có số lượng ít hơn
             (current_quantity ASC) để giải phóng triệt để diện tích ngăn tủ (Space Liberation).
2. Cơ chế Match Score thông minh cho công thức món ăn:
   - Hệ số nhân khẩn cấp (Emergency Multiplier): Món tận dụng nguyên liệu cận hạn (<= 2 ngày)
     được nhân 1.3 (tăng 30% điểm ưu tiên) để đẩy lên đầu danh sách gợi ý.
   - Tách riêng danh mục "Gia vị cơ bản" (Pantry Staples White-list): Nếu thiếu muối, mắm,
     tiêu, đường... KHÔNG trừ điểm Match Score vì gia đình nào cũng có sẵn.
3. Thuật toán gom cụm Danh sách Đi chợ thông minh (Smart Grouping - GET /api/shopping-list):
   - Tự động gom nhóm theo Quầy hàng thực tế (Tươi sống, Rau củ, Gia vị & Đồ khô, Trứng & Sữa).
   - Định lượng mua đề xuất thông minh: Bằng (Ngưỡng an toàn tối đa - Tồn thực tế) + Lượng thiếu cho món nấu.
=============================================================================
"""

import json
from datetime import datetime, date
from typing import Dict, List, Optional, Any, Union

from server.database import (
    query_all,
    query_one,
    execute_mutation,
    DatabaseTransaction,
    get_connection
)

# -----------------------------------------------------------------------------
# DANH MỤC GIA VỊ CƠ BẢN (PANTRY STAPLES WHITE-LIST)
# Quy tắc: Thiếu gia vị cơ bản không trừ điểm Match Score công thức món ăn
# -----------------------------------------------------------------------------
BASIC_STAPLES_WHITELIST = {
    "muối", "muối ăn", "đường", "đường cát", "tiêu", "tiêu đen", "tiêu đen xay",
    "tiêu sọ", "tiêu đen xay phú quốc", "nước mắm", "nước mắm nam ngư", "hạt nêm",
    "hạt nêm knorr", "hạt nêm knorr thịt thăn", "bột ngọt", "mì chính", "dầu ăn",
    "nước tương", "xì dầu", "tỏi", "hành tím", "hành tím khô", "tỏi khô", "ớt"
}


# -----------------------------------------------------------------------------
# 1. QUẢN LÝ NGÀY GIẢ LẬP HỆ THỐNG & CẤU HÌNH NGƯỠNG (SYSTEM CONFIG)
# -----------------------------------------------------------------------------

def get_system_config() -> Dict[str, Any]:
    """
    Đọc cấu hình hệ thống từ bảng system_settings:
    - simulation_date: Ngày mốc tính toán
    - fefo_high_days: Ngưỡng ngày mức Cao (mặc định 2)
    - fefo_medium_days: Ngưỡng ngày mức Trung bình (mặc định 5 hoặc 7)
    - warning_days_threshold: Ngưỡng cảnh báo sắp hết hạn (mặc định 3)
    """
    rows = query_all("SELECT setting_key, setting_value FROM system_settings")
    settings = {r['setting_key']: r['setting_value'] for r in rows}

    return {
        "timezone": settings.get('timezone', 'Asia/Ho_Chi_Minh'),
        "simulation_date": settings.get('simulation_date') or date.today().strftime('%Y-%m-%d'),
        "use_simulated_date": True,
        "fefo_high_days": int(settings.get('fefo_high_days', settings.get('urgent_threshold_days', 2))),
        "fefo_medium_days": int(settings.get('fefo_medium_days', settings.get('warning_threshold_days', 5))),
        "warning_days_threshold": int(settings.get('warning_days_threshold', 3)),
        "min_quantity_default": float(settings.get('min_quantity_default', 1.0))
    }


def get_system_date() -> str:
    """Lấy ngày mốc hệ thống hiện hành (YYYY-MM-DD)."""
    return get_system_config()["simulation_date"]


def set_system_date(new_date_str: str) -> Dict[str, Any]:
    """
    Cập nhật ngày giả lập của hệ thống (phục vụ test nhảy hạn realtime).
    Định dạng: YYYY-MM-DD.
    """
    try:
        valid_date = datetime.strptime(new_date_str.strip(), '%Y-%m-%d').date()
        formatted_date = valid_date.strftime('%Y-%m-%d')
    except ValueError:
        raise ValueError(f"Định dạng ngày không hợp lệ: '{new_date_str}'. Định dạng chuẩn là YYYY-MM-DD")

    execute_mutation(
        """
        INSERT INTO system_settings (setting_key, setting_value, description)
        VALUES ('simulation_date', ?, 'Ngày mốc hệ thống giả lập')
        ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value
        """,
        (formatted_date,)
    )

    return {
        "success": True,
        "simulation_date": formatted_date,
        "message": f"Đã cập nhật ngày hệ thống sang: {formatted_date}"
    }


# -----------------------------------------------------------------------------
# 2. HÀM TÍNH NGÀY CÒN LẠI & PHÂN LOẠI MỨC ĐỘ ƯU TIÊN FEFO
# -----------------------------------------------------------------------------

def calculate_days_left(expiry_date: str, system_date: Optional[str] = None) -> int:
    """
    Tính số ngày còn lại từ system_date đến expiry_date:
    - delta > 0: Còn hạn sử dụng.
    - delta = 0: Hết hạn đúng ngày hôm nay.
    - delta < 0: Đã quá hạn.
    """
    if not expiry_date:
        raise ValueError("expiry_date không được để trống")

    if not system_date:
        system_date = get_system_date()

    exp_dt = datetime.strptime(str(expiry_date).strip()[:10], '%Y-%m-%d').date()
    sys_dt = datetime.strptime(str(system_date).strip()[:10], '%Y-%m-%d').date()

    return (exp_dt - sys_dt).days


def classify_fefo_priority(days_remaining: int, config: Optional[Dict[str, Any]] = None) -> str:
    """
    Phân loại mức độ ưu tiên FEFO khớp 100% với giao diện dự kiến:
    - days_remaining <= fefo_high_days (<= 2 ngày): 'Cao'
    - days_remaining <= fefo_medium_days (<= 5 ngày): 'Trung bình'
    - days_remaining > fefo_medium_days: 'Thấp'
    """
    cfg = config or get_system_config()
    high_threshold = cfg.get("fefo_high_days", 2)
    med_threshold = cfg.get("fefo_medium_days", 5)

    if days_remaining <= high_threshold:
        return 'Cao'
    elif days_remaining <= med_threshold:
        return 'Trung bình'
    else:
        return 'Thấp'


def build_priority_reason(
    days_remaining: int,
    priority: str,
    tie_group_size: int,
    tie_position: int,
    expiry_date: str,
    import_date: str,
    location_name: str,
    current_quantity: float = 0.0,
    unit_name: str = "",
    has_same_import_tie: bool = False
) -> str:
    """
    Sinh chuỗi giải trình quy tắc FEFO 3 tầng:
    Tầng 1: Hạn dùng (days_remaining)
    Tầng 2: Ngày nhập FIFO (tie_position / tie_group_size)
    Tầng 3: Dung tích tồn ít hơn (ưu tiên dọn khay dở dang để giải phóng ngăn chứa).
    """
    if days_remaining == 0:
        day_label = "Hết hạn ngay hôm nay"
    elif days_remaining == 1:
        day_label = "Chỉ còn 1 ngày sử dụng"
    elif days_remaining < 0:
        day_label = f"Đã quá hạn {abs(days_remaining)} ngày"
    else:
        day_label = f"Còn {days_remaining} ngày đến hạn"

    fifo_suffix = ""
    if tie_group_size > 1:
        fifo_suffix = f" · Đồng hạn {expiry_date}, xếp FIFO #{tie_position}/{tie_group_size} (nhập {import_date})"
        if has_same_import_tie and current_quantity > 0:
            fifo_suffix += f", ưu tiên dọn khay dở ({current_quantity} {unit_name})"

    if priority == 'Cao':
        return f"{day_label}, cần ưu tiên chế biến ngay{fifo_suffix}."
    elif priority == 'Trung bình':
        return f"{day_label}, nên lên kế hoạch dùng trong tuần{fifo_suffix}."
    else:
        return f"{day_label}, bảo quản ổn định ({location_name}){fifo_suffix}."


def build_suggested_action(priority: str) -> str:
    """Sinh hành động đề xuất tiêu dùng theo giao diện dự kiến."""
    if priority == 'Cao':
        return "Sắp hết hạn, nấu ngay hôm nay/mai"
    elif priority == 'Trung bình':
        return "Dự kiến dùng trong tuần"
    else:
        return "Bảo quản tiếp tục"


# -----------------------------------------------------------------------------
# 3. THUẬT TOÁN ĐỀ XUẤT FEFO 3 CẤP ĐỘ (MULTI-LEVEL TIE-BREAKER)
# -----------------------------------------------------------------------------

def get_fefo_recommendations(
    include_expired: bool = False,
    system_date: Optional[str] = None,
    area_type: Optional[str] = None,
    location_id: Optional[Union[int, str]] = None,
    priority_level: Optional[str] = None
) -> Dict[str, Any]:
    """
    Động cơ FEFO Nâng Cấp Hòa Hạn 3 Tầng:
    1. Lọc các lô còn tồn kho (current_quantity > 0) và trạng thái hợp lệ.
    2. Tách đồ quá hạn (days_remaining < 0) vào expired_excluded_count.
    3. SẮP XẾP HÒA HẠN 3 TẦNG:
       - Tầng 1: expiry_date ASC (Hạn gần nhất xếp trước - FEFO cốt lõi).
       - Tầng 2: import_date ASC (Lô mua trước ăn trước - FIFO).
       - Tầng 3: current_quantity ASC (Cùng hạn, cùng ngày nhập -> Lô còn ít hơn ăn trước
                 để dọn sạch khay dở dang, giải phóng ngăn tủ lạnh).
       - Deterministic Tie-breaker: item_id ASC.
    4. Phân tích nhóm đồng hạn và sinh priority_reason & suggested_action.
    5. Khớp công thức món ăn liên quan (matching_recipe_ids).
    """
    config = get_system_config()
    ref_date = system_date or config["simulation_date"]

    sql = """
        SELECT 
            fi.item_id,
            fi.food_id,
            f.food_code,
            f.food_name,
            f.brand,
            f.image_url,
            c.category_id,
            c.category_name,
            sl.location_id,
            sl.location_name,
            sl.area_type,
            u.unit_id,
            u.unit_name,
            fi.current_quantity,
            fi.min_threshold,
            fi.import_date,
            fi.expiration_date,
            fi.status,
            fi.notes
        FROM food_items fi
        JOIN foods f ON fi.food_id = f.food_id
        JOIN categories c ON f.category_id = c.category_id
        JOIN storage_locations sl ON fi.location_id = sl.location_id
        JOIN units u ON fi.unit_id = u.unit_id
        WHERE fi.current_quantity > 0 
          AND fi.status IN ('ACTIVE', 'Đang sử dụng')
    """
    raw_items = query_all(sql)
    recipes = get_all_recipes()

    eligible_lots = []
    expired_excluded_count = 0

    for it in raw_items:
        exp_date = it.get('expiration_date') or it.get('expiry_date')
        days_rem = calculate_days_left(exp_date, ref_date)

        if days_rem < 0:
            expired_excluded_count += 1
            if not include_expired:
                continue

        it_dict = dict(it)
        it_dict['days_remaining'] = days_rem
        it_dict['days_left'] = days_rem
        it_dict['expiry_date'] = exp_date
        it_dict['expiration_date'] = exp_date
        eligible_lots.append(it_dict)

    # -------------------------------------------------------------------------
    # NÂNG CẤP THUẬT TOÁN HÒA HẠN 3 TẦNG (MULTI-LEVEL TIE-BREAKER)
    # Tầng 1: expiry_date ASC (FEFO)
    # Tầng 2: import_date ASC (FIFO)
    # Tầng 3: current_quantity ASC (Dung tích tồn - Lô dở dang ưu tiên giải phóng diện tích)
    # Tầng 4: item_id ASC (Xác định tuyệt đối)
    # -------------------------------------------------------------------------
    eligible_lots.sort(
        key=lambda x: (
            x['expiry_date'],
            x['import_date'],
            float(x['current_quantity']),
            x['item_id']
        )
    )

    # Gom nhóm theo expiry_date để tính FIFO Tie Group (Tầng 1 & 2)
    tie_groups: Dict[str, List[Dict[str, Any]]] = {}
    same_import_groups: Dict[tuple, List[Dict[str, Any]]] = {}

    for lot in eligible_lots:
        ed = lot['expiry_date']
        imd = lot['import_date']
        
        if ed not in tie_groups:
            tie_groups[ed] = []
        tie_groups[ed].append(lot)

        key_import = (ed, imd)
        if key_import not in same_import_groups:
            same_import_groups[key_import] = []
        same_import_groups[key_import].append(lot)

    counts_by_priority = {
        "Cao": 0,
        "Trung bình": 0,
        "Thấp": 0
    }

    ranked_items = []
    for idx, lot in enumerate(eligible_lots):
        days_rem = lot['days_remaining']
        priority = classify_fefo_priority(days_rem, config)
        
        if priority in counts_by_priority:
            counts_by_priority[priority] += 1

        tg = tie_groups.get(lot['expiry_date'], [lot])
        tie_group_size = len(tg)
        tie_position = next((i + 1 for i, entry in enumerate(tg) if entry['item_id'] == lot['item_id']), 1)

        sig = same_import_groups.get((lot['expiry_date'], lot['import_date']), [lot])
        has_same_import_tie = len(sig) > 1

        reason = build_priority_reason(
            days_remaining=days_rem,
            priority=priority,
            tie_group_size=tie_group_size,
            tie_position=tie_position,
            expiry_date=lot['expiry_date'],
            import_date=lot['import_date'],
            location_name=lot['location_name'],
            current_quantity=float(lot['current_quantity']),
            unit_name=lot['unit_name'],
            has_same_import_tie=has_same_import_tie
        )
        action = build_suggested_action(priority)

        # Khớp công thức món ăn (matching_recipe_ids)
        food_name_clean = lot['food_name'].lower()
        matched_recipes = []
        matched_recipe_ids = []
        for r in recipes:
            req_ings = [ing.lower() for ing in r['required_ingredients']]
            if any(food_name_clean in ing or ing in food_name_clean for ing in req_ings):
                matched_recipe_ids.append(r['recipe_id'])
                matched_recipes.append({
                    "recipe_id": r['recipe_id'],
                    "recipe_name": r['recipe_name'],
                    "cooking_guide": r['cooking_guide']
                })

        area = lot.get('area_type', '')
        if area in ('FREEZER', 'CHILLER', 'DOOR', 'VEG_BOX'):
            area = 'Trong tủ lạnh'
        elif area in ('PANTRY',):
            area = 'Ngoài tủ lạnh'

        item_obj = {
            "rank": idx + 1,
            "item_id": lot['item_id'],
            "food_id": lot['food_id'],
            "food_code": lot['food_code'],
            "item_code": lot.get('item_code') or f"LOT-{lot['item_id']:03d}",
            "food_name": lot['food_name'],
            "category_id": lot['category_id'],
            "category_name": lot['category_name'],
            "brand": lot['brand'],
            "image_url": lot['image_url'],
            "area_type": area,
            "location_id": lot['location_id'],
            "location_name": lot['location_name'],
            "current_quantity": lot['current_quantity'],
            "min_threshold": lot['min_threshold'],
            "unit_id": lot['unit_id'],
            "unit_name": lot['unit_name'],
            "import_date": lot['import_date'],
            "expiry_date": lot['expiry_date'],
            "expiration_date": lot['expiry_date'],
            "days_remaining": days_rem,
            "days_left": days_rem,
            "priority_level": priority,
            "priority": {
                "level": "HIGH" if priority == 'Cao' else "MEDIUM" if priority == 'Trung bình' else "LOW",
                "label": priority,
                "badge_color": "danger" if priority == 'Cao' else "warning" if priority == 'Trung bình' else "success"
            },
            "priority_reason": reason,
            "suggested_action": action,
            "fifo_tie_group_size": tie_group_size,
            "fifo_tie_position": tie_position,
            "has_same_import_tie": has_same_import_tie,
            "matching_recipe_ids": matched_recipe_ids,
            "suggested_recipes": matched_recipes,
            "status": lot['status'],
            "notes": lot['notes']
        }
        ranked_items.append(item_obj)

    filtered_items = ranked_items
    if area_type and area_type != 'all':
        filtered_items = [i for i in filtered_items if i['area_type'] == area_type]
    if location_id and location_id != 'all':
        filtered_items = [i for i in filtered_items if str(i['location_id']) == str(location_id)]
    if priority_level and priority_level != 'all':
        filtered_items = [i for i in filtered_items if i['priority_level'] == priority_level or i['priority']['level'] == priority_level]

    return {
        "success": True,
        "reference_date": ref_date,
        "items": filtered_items,
        "data": filtered_items,
        "count": len(filtered_items),
        "counts_by_priority": counts_by_priority,
        "expired_excluded_count": expired_excluded_count
    }


# -----------------------------------------------------------------------------
# 4. GỢI Ý MÓN ĂN THÔNG MINH (EMERGENCY MULTIPLIER & TÁCH GIA VỊ CƠ BẢN)
# -----------------------------------------------------------------------------

def is_basic_staple(ingredient_name: str) -> bool:
    """Kiểm tra nguyên liệu có phải gia vị cơ bản gia đình hay không."""
    name_clean = ingredient_name.strip().lower()
    return any(staple in name_clean or name_clean in staple for staple in BASIC_STAPLES_WHITELIST)


def get_all_recipes() -> List[Dict[str, Any]]:
    """Lấy danh sách công thức nấu ăn gia đình từ CSDL."""
    rows = query_all("SELECT recipe_id, recipe_name, required_ingredients, cooking_guide FROM recipes")
    recipes = []
    for r in rows:
        r_dict = dict(r)
        raw_ings = r['required_ingredients']
        try:
            r_dict['required_ingredients'] = json.loads(raw_ings)
        except Exception:
            r_dict['required_ingredients'] = [i.strip() for i in raw_ings.split(',') if i.strip()]
        recipes.append(r_dict)
    return recipes


def suggest_recipes(
    focus_item_id: Optional[int] = None,
    system_date: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Động cơ gợi ý món ăn thông minh với 2 cải tiến:
    1. Tách riêng "Gia vị cơ bản" (Pantry Staples): Thiếu muối, tiêu, mắm... KHÔNG trừ điểm Match Score.
    2. Hệ số nhân khẩn cấp (Emergency Multiplier): Món tận dụng đồ cận hạn (<= 2 ngày)
       được nhân 1.3 (+30% điểm ưu tiên) để đẩy lên đầu danh sách giải cứu thực phẩm.
    """
    ref_date = system_date or get_system_date()
    config = get_system_config()

    inventory_items = query_all(
        """
        SELECT fi.item_id, fi.food_id, f.food_name, fi.expiration_date, fi.current_quantity, u.unit_name
        FROM food_items fi
        JOIN foods f ON fi.food_id = f.food_id
        JOIN units u ON fi.unit_id = u.unit_id
        WHERE fi.current_quantity > 0 AND fi.status IN ('ACTIVE', 'Đang sử dụng')
        """
    )

    available_foods: Dict[str, Dict[str, Any]] = {}
    focus_food_name = ""

    for it in inventory_items:
        days = calculate_days_left(it['expiration_date'], ref_date)
        if days < 0:
            continue

        name_lower = it['food_name'].lower()
        if it['item_id'] == focus_item_id:
            focus_food_name = name_lower

        priority = classify_fefo_priority(days, config)
        if name_lower not in available_foods or days < available_foods[name_lower]['days_remaining']:
            available_foods[name_lower] = {
                "item_id": it['item_id'],
                "food_id": it['food_id'],
                "food_name": it['food_name'],
                "days_remaining": days,
                "priority": priority,
                "is_urgent": (priority == 'Cao' or days <= 2),
                "is_fefo": (priority in ('Cao', 'Trung bình')),
                "current_quantity": it['current_quantity'],
                "unit_name": it['unit_name']
            }

    recipes = get_all_recipes()
    results = []

    for r in recipes:
        required = r['required_ingredients']
        total_required = len(required)

        core_required_count = 0
        core_ready_count = 0
        matched_high_count = 0
        matched_fefo_count = 0
        ready_count = 0

        matched_items = []
        urgent_rescue_items = []
        missing_core_items = []
        missing_staples_items = []
        ingredient_statuses = []

        for req_ing in required:
            req_clean = req_ing.lower()
            is_staple = is_basic_staple(req_ing)

            if not is_staple:
                core_required_count += 1

            matched_key = next((k for k in available_foods if k in req_clean or req_clean in k), None)

            if matched_key:
                food_info = available_foods[matched_key]
                ready_count += 1
                matched_items.append(food_info['food_name'])

                if not is_staple:
                    core_ready_count += 1

                if food_info['is_urgent']:
                    matched_high_count += 1
                    urgent_rescue_items.append(food_info['food_name'])
                if food_info['is_fefo']:
                    matched_fefo_count += 1

                ingredient_statuses.append({
                    "ingredient_name": req_ing,
                    "is_basic_staple": is_staple,
                    "availability": "Có sẵn - Ưu tiên cao" if food_info['is_urgent'] else "Có sẵn",
                    "matched_item_id": food_info['item_id'],
                    "matched_food_name": food_info['food_name'],
                    "days_remaining": food_info['days_remaining'],
                    "priority": food_info['priority']
                })
            else:
                if is_staple:
                    missing_staples_items.append(req_ing)
                    ingredient_statuses.append({
                        "ingredient_name": req_ing,
                        "is_basic_staple": True,
                        "availability": "Gia vị thiếu (Có thể mua hoặc bỏ qua)",
                        "matched_item_id": None
                    })
                else:
                    missing_core_items.append(req_ing)
                    ingredient_statuses.append({
                        "ingredient_name": req_ing,
                        "is_basic_staple": False,
                        "availability": "Thiếu nguyên liệu chính",
                        "matched_item_id": None
                    })

        # ---------------------------------------------------------------------
        # TÍNH MATCH SCORE CẢI TIẾN:
        # Base Score tính trên tỉ lệ nguyên liệu CHÍNH (không phạt gia vị cơ bản)
        # ---------------------------------------------------------------------
        if core_required_count > 0:
            base_score = round((core_ready_count / core_required_count) * 100, 1)
        else:
            base_score = 100.0 if ready_count == total_required else 80.0

        # ÁP DỤNG HỆ SỐ NHÂN KHẨN CẤP (EMERGENCY MULTIPLIER 30%)
        has_urgent_rescue = len(urgent_rescue_items) > 0
        if has_urgent_rescue:
            final_match_score = min(100.0, round(base_score * 1.3, 1))
        else:
            final_match_score = base_score

        # Điểm trọng số phụ để sort (ưu tiên số món giải cứu)
        ranking_weight = (matched_high_count * 35) + (matched_fefo_count * 15) + final_match_score

        if focus_food_name and not any(focus_food_name in ing.lower() or ing.lower() in focus_food_name for ing in required):
            continue

        results.append({
            "recipe_id": r['recipe_id'],
            "recipe_name": r['recipe_name'],
            "match_score": final_match_score,
            "base_score": base_score,
            "emergency_multiplier_applied": has_urgent_rescue,
            "emergency_bonus_percent": 30 if has_urgent_rescue else 0,
            "ranking_weight": ranking_weight,
            "score": ranking_weight,
            "total_required": total_required,
            "core_required_count": core_required_count,
            "core_ready_count": core_ready_count,
            "ready_count": ready_count,
            "missing_core_count": len(missing_core_items),
            "missing_staples_count": len(missing_staples_items),
            "matched_high_priority_count": matched_high_count,
            "matched_fefo_count": matched_fefo_count,
            "urgent_rescue_ingredients": urgent_rescue_items,
            "matched_ingredients": matched_items,
            "missing_core_ingredients": missing_core_items,
            "missing_staples_ingredients": missing_staples_items,
            "missing_ingredients": missing_core_items + missing_staples_items,
            "ingredient_statuses": ingredient_statuses,
            "can_cook_now": (len(missing_core_items) == 0),
            "cooking_guide": r['cooking_guide']
        })

    # Sắp xếp ưu tiên: Điểm Match Score cao -> Giải cứu được nhiều đồ cận hạn -> Ít thiếu đồ chính
    results.sort(
        key=lambda x: (
            x['matched_high_priority_count'],
            x['match_score'],
            -x['missing_core_count'],
            x['ranking_weight']
        ),
        reverse=True
    )
    return results


# -----------------------------------------------------------------------------
# 5. THUẬT TOÁN GOM CỤM DANH SÁCH ĐI CHỢ THÔNG MINH (SMART GROUPING)
# Phụ trách API: GET /api/shopping-list
# -----------------------------------------------------------------------------

def map_ingredient_to_aisle(food_name: str, category_name: str = "") -> Dict[str, str]:
    """Phân loại nguyên liệu vào Quầy hàng thực tế tại chợ / siêu thị."""
    fn = food_name.lower()
    cn = category_name.lower()

    if any(k in fn for k in ["thịt", "bò", "heo", "lợn", "gà", "vịt", "cá", "hồi", "tôm", "mực", "cua", "sườn"]) or "thịt" in cn or "hải sản" in cn:
        return {"aisle_id": "fresh", "aisle_name": "Quầy Tươi Sống (Thịt & Hải sản)", "icon": "🥩"}
    
    if any(k in fn for k in ["rau", "cải", "xà lách", "cà chua", "hành", "ngò", "dưa", "nấm", "củ", "khoai", "cà rốt", "táo", "cam"]) or "rau" in cn:
        return {"aisle_id": "veggies", "aisle_name": "Quầy Rau Củ Quả & Nấm", "icon": "🥬"}
    
    if any(k in fn for k in ["sữa", "trứng", "sữa chua", "bơ", "phô mai", "kem"]) or "sữa" in cn or "trứng" in cn:
        return {"aisle_id": "dairy", "aisle_name": "Quầy Trứng, Sữa & Đồ Lạnh", "icon": "❄️"}
    
    if any(k in fn for k in ["mắm", "muối", "tiêu", "đường", "hạt nêm", "dầu ăn", "nước tương", "gạo", "mì", "đậu phụ", "bánh mì", "đồ hộp"]) or "gia vị" in cn:
        return {"aisle_id": "staples", "aisle_name": "Quầy Gia Vị & Đồ Khô", "icon": "🧂"}
    
    return {"aisle_id": "other", "aisle_name": "Quầy Hàng Tổng Hợp", "icon": "🛒"}


def get_smart_shopping_list(
    focus_recipe_id: Optional[int] = None,
    system_date: Optional[str] = None
) -> Dict[str, Any]:
    """
    Thuật toán gom cụm Danh sách Đi chợ thông minh:
    1. Quét đồ cạn kiệt trong kho: current_quantity <= min_threshold hoặc hết tồn kho.
    2. Quét nguyên liệu thiếu từ món muốn nấu (nếu focus_recipe_id được chỉ định).
    3. Định lượng mua đề xuất = max(0, min_threshold * 2 - current_quantity) + lượng thiếu cho món.
    4. Gom cụm theo Quầy hàng thực tế (Tươi sống, Rau củ, Gia vị & Đồ khô, Trứng & Sữa).
    """
    ref_date = system_date or get_system_date()

    # 1. Quét kho lấy các món chạm ngưỡng hoặc hết hàng
    inventory = query_all(
        """
        SELECT 
            fi.item_id, f.food_name, c.category_name, u.unit_name,
            fi.current_quantity, fi.min_threshold
        FROM food_items fi
        JOIN foods f ON fi.food_id = f.food_id
        JOIN categories c ON f.category_id = c.category_id
        JOIN units u ON fi.unit_id = u.unit_id
        WHERE fi.status IN ('ACTIVE', 'Đang sử dụng')
          AND (fi.current_quantity <= fi.min_threshold OR fi.current_quantity = 0)
        """
    )

    items_to_buy_map: Dict[str, Dict[str, Any]] = {}

    for it in inventory:
        fn = it['food_name']
        curr_q = float(it['current_quantity'] or 0)
        min_th = float(it['min_threshold'] or 1.0)
        unit = it['unit_name']
        cat = it['category_name']

        target_safe = max(min_th * 2.0, 1.0)
        suggested_qty = round(max(0.0, target_safe - curr_q), 2)
        if suggested_qty <= 0:
            suggested_qty = 1.0

        aisle = map_ingredient_to_aisle(fn, cat)

        items_to_buy_map[fn.lower()] = {
            "food_name": fn,
            "category_name": cat,
            "unit_name": unit,
            "current_quantity": curr_q,
            "min_threshold": min_th,
            "needed_for_recipe": 0.0,
            "suggested_buy_quantity": suggested_qty,
            "reason": f"Chạm ngưỡng an toàn (còn {curr_q} {unit}, ngưỡng {min_th} {unit})",
            "aisle": aisle,
            "from_low_stock": True,
            "from_recipe": False
        }

    # 2. Nếu có chọn món muốn nấu (focus_recipe_id), bổ sung nguyên liệu thiếu
    if focus_recipe_id:
        recipe_row = query_one(
            "SELECT recipe_id, recipe_name, required_ingredients FROM recipes WHERE recipe_id = ?",
            (focus_recipe_id,)
        )
        if recipe_row:
            rec_name = recipe_row['recipe_name']
            raw_ings = recipe_row['required_ingredients']
            try:
                ings = json.loads(raw_ings)
            except Exception:
                ings = [i.strip() for i in raw_ings.split(',') if i.strip()]

            # Kiểm tra xem nguyên liệu nào chưa có trong tủ
            stock_items = query_all(
                """
                SELECT f.food_name, fi.current_quantity, u.unit_name
                FROM food_items fi
                JOIN foods f ON fi.food_id = f.food_id
                JOIN units u ON fi.unit_id = u.unit_id
                WHERE fi.current_quantity > 0 AND fi.status IN ('ACTIVE', 'Đang sử dụng')
                """
            )
            stock_dict = {s['food_name'].lower(): float(s['current_quantity']) for s in stock_items}

            for ing in ings:
                ing_lower = ing.lower()
                has_in_stock = any(k in ing_lower or ing_lower in k for k in stock_dict)

                if not has_in_stock:
                    aisle = map_ingredient_to_aisle(ing)
                    if ing_lower in items_to_buy_map:
                        items_to_buy_map[ing_lower]['needed_for_recipe'] = 1.0
                        items_to_buy_map[ing_lower]['suggested_buy_quantity'] += 1.0
                        items_to_buy_map[ing_lower]['reason'] += f" & Thiếu để nấu '{rec_name}'"
                        items_to_buy_map[ing_lower]['from_recipe'] = True
                    else:
                        items_to_buy_map[ing_lower] = {
                            "food_name": ing,
                            "category_name": "Theo công thức",
                            "unit_name": "phần/kg/g",
                            "current_quantity": 0.0,
                            "min_threshold": 0.0,
                            "needed_for_recipe": 1.0,
                            "suggested_buy_quantity": 1.0,
                            "reason": f"Nguyên liệu còn thiếu cho món '{rec_name}'",
                            "aisle": aisle,
                            "from_low_stock": False,
                            "from_recipe": True
                        }

    # 3. GOM CỤM THEO QUẦY HÀNG (AISLE GROUPING)
    aisles_dict: Dict[str, Dict[str, Any]] = {}
    for item in items_to_buy_map.values():
        aisle_info = item['aisle']
        aid = aisle_info['aisle_id']
        if aid not in aisles_dict:
            aisles_dict[aid] = {
                "aisle_id": aid,
                "aisle_name": aisle_info['aisle_name'],
                "icon": aisle_info['icon'],
                "items": []
            }
        # Xóa key aisle khỏi item để JSON gọn gàng
        item_copy = {k: v for k, v in item.items() if k != 'aisle'}
        aisles_dict[aid]['items'].append(item_copy)

    grouped_list = list(aisles_dict.values())

    return {
        "success": True,
        "generated_at": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        "system_date": ref_date,
        "total_items_to_buy": len(items_to_buy_map),
        "total_aisles": len(grouped_list),
        "grouped_aisles": grouped_list,
        "raw_items": list(items_to_buy_map.values())
    }


# -----------------------------------------------------------------------------
# 6. NGHIỆP VỤ XUẤT DÙNG, ĐIỀU CHỈNH & QUẢN LÝ KHO (AUDIT TRAIL)
# -----------------------------------------------------------------------------

def use_food(
    item_id: int,
    quantity: float,
    reason: str = "Nấu ăn hàng ngày",
    actor_device: str = "Client"
) -> Dict[str, Any]:
    """
    Xuất dùng thực phẩm (tương đương sp_use_food):
    - Kiểm tra tồn kho.
    - Cập nhật số lượng mới; nếu <= 0 thì chuyển status = 'Đã hết'.
    - Ghi nhận Audit Log vào inventory_transactions trong 1 Transaction an toàn.
    """
    if quantity <= 0:
        raise ValueError(f"Số lượng xuất dùng phải lớn hơn 0 (nhận được: {quantity})")

    with DatabaseTransaction() as conn:
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT fi.item_id, fi.current_quantity, fi.status, f.food_name, u.unit_name
            FROM food_items fi
            JOIN foods f ON fi.food_id = f.food_id
            JOIN units u ON fi.unit_id = u.unit_id
            WHERE fi.item_id = ?
            """,
            (item_id,)
        )
        row = cursor.fetchone()
        if not row:
            raise ValueError(f"Không tìm thấy thực phẩm với item_id = {item_id}")

        current_qty = float(row['current_quantity'])
        food_name = row['food_name']
        unit_name = row['unit_name']

        if row['status'] not in ('ACTIVE', 'Đang sử dụng'):
            raise ValueError(f"Thực phẩm '{food_name}' hiện không ở trạng thái Đang sử dụng (trạng thái: {row['status']})")

        if quantity > current_qty:
            raise ValueError(
                f"Lỗi: Số lượng sử dụng ({quantity} {unit_name}) lớn hơn tồn kho thực tế ({current_qty} {unit_name})!"
            )

        new_qty = round(current_qty - quantity, 3)
        new_status = 'Đã hết' if new_qty <= 0 else 'Đang sử dụng'

        cursor.execute(
            """
            UPDATE food_items
            SET current_quantity = ?, status = ?
            WHERE item_id = ?
            """,
            (new_qty, new_status, item_id)
        )

        cursor.execute(
            """
            INSERT INTO inventory_transactions (
                item_id, action_type, change_quantity, remaining_quantity, reason
            ) VALUES (?, 'Sử dụng', ?, ?, ?)
            """,
            (item_id, -quantity, new_qty, reason)
        )
        tx_id = cursor.lastrowid

    return {
        "success": True,
        "trang_thai": "Thành công",
        "item_id": item_id,
        "ten_thuc_pham": food_name,
        "food_name": food_name,
        "so_luong_da_dung": quantity,
        "used_quantity": quantity,
        "so_luong_con_lai": new_qty,
        "remaining_quantity": new_qty,
        "unit_name": unit_name,
        "trang_thai_kho": new_status,
        "status": new_status,
        "transaction_id": tx_id,
        "message": f"Đã xuất dùng {quantity} {unit_name} '{food_name}'. Còn lại: {new_qty} {unit_name}."
    }


def adjust_food(
    item_id: int,
    new_quantity: float,
    reason: str = "Kiểm kê tủ lạnh",
    actor_device: str = "Client"
) -> Dict[str, Any]:
    """Kiểm kê điều chỉnh số lượng thực tế trong tủ lạnh."""
    if new_quantity < 0:
        raise ValueError(f"Số lượng tồn kho không thể âm (nhận được: {new_quantity})")

    with DatabaseTransaction() as conn:
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT fi.item_id, fi.current_quantity, f.food_name, u.unit_name
            FROM food_items fi
            JOIN foods f ON fi.food_id = f.food_id
            JOIN units u ON fi.unit_id = u.unit_id
            WHERE fi.item_id = ?
            """,
            (item_id,)
        )
        row = cursor.fetchone()
        if not row:
            raise ValueError(f"Không tìm thấy thực phẩm với item_id = {item_id}")

        old_qty = float(row['current_quantity'])
        diff_qty = round(new_quantity - old_qty, 3)
        new_status = 'Đã hết' if new_quantity <= 0 else 'Đang sử dụng'

        cursor.execute(
            """
            UPDATE food_items
            SET current_quantity = ?, status = ?
            WHERE item_id = ?
            """,
            (new_quantity, new_status, item_id)
        )

        cursor.execute(
            """
            INSERT INTO inventory_transactions (
                item_id, action_type, change_quantity, remaining_quantity, reason
            ) VALUES (?, 'Điều chỉnh', ?, ?, ?)
            """,
            (item_id, diff_qty, new_quantity, reason)
        )
        tx_id = cursor.lastrowid

    return {
        "success": True,
        "item_id": item_id,
        "food_name": row['food_name'],
        "previous_quantity": old_qty,
        "new_quantity": new_quantity,
        "diff_quantity": diff_qty,
        "unit_name": row['unit_name'],
        "transaction_id": tx_id,
        "message": f"Đã kiểm kê '{row['food_name']}': từ {old_qty} thành {new_quantity} {row['unit_name']}."
    }


def add_food_item(
    food_id: int,
    location_id: int,
    unit_id: int,
    quantity: float,
    expiration_date: str,
    import_date: Optional[str] = None,
    min_threshold: float = 1.0,
    notes: str = ""
) -> Dict[str, Any]:
    """Thêm lô thực phẩm mới vào ngăn tủ chỉ định."""
    if quantity <= 0:
        raise ValueError("Số lượng nhập phải lớn hơn 0")

    if not import_date:
        import_date = get_system_date()

    with DatabaseTransaction() as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT food_name FROM foods WHERE food_id = ?", (food_id,))
        food_row = cursor.fetchone()
        if not food_row:
            raise ValueError(f"food_id = {food_id} không tồn tại")

        cursor.execute(
            """
            INSERT INTO food_items (
                food_id, location_id, unit_id, current_quantity, min_threshold,
                import_date, expiration_date, status, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Đang sử dụng', ?)
            """,
            (food_id, location_id, unit_id, quantity, min_threshold, import_date, expiration_date, notes)
        )
        new_item_id = cursor.lastrowid

        cursor.execute(
            """
            INSERT INTO inventory_transactions (
                item_id, action_type, change_quantity, remaining_quantity, reason
            ) VALUES (?, 'Nhập thêm', ?, ?, ?)
            """,
            (new_item_id, quantity, quantity, f"Nhập kho: {notes or 'Nhập mua mới'}")
        )

    return {
        "success": True,
        "item_id": new_item_id,
        "food_name": food_row['food_name'],
        "quantity": quantity,
        "import_date": import_date,
        "expiration_date": expiration_date,
        "message": f"Đã thêm mới '{food_row['food_name']}' thành công."
    }


def delete_food_item(
    item_id: int,
    reason: str = "Vứt hủy / Hỏng"
) -> Dict[str, Any]:
    """Xóa mềm (Vứt hủy) thực phẩm khỏi tủ."""
    with DatabaseTransaction() as conn:
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT fi.item_id, fi.current_quantity, f.food_name
            FROM food_items fi
            JOIN foods f ON fi.food_id = f.food_id
            WHERE fi.item_id = ?
            """,
            (item_id,)
        )
        row = cursor.fetchone()
        if not row:
            raise ValueError(f"Không tìm thấy item_id = {item_id}")

        old_qty = float(row['current_quantity'])

        cursor.execute(
            """
            UPDATE food_items
            SET current_quantity = 0, status = 'Đã hủy'
            WHERE item_id = ?
            """,
            (item_id,)
        )

        cursor.execute(
            """
            INSERT INTO inventory_transactions (
                item_id, action_type, change_quantity, remaining_quantity, reason
            ) VALUES (?, 'Vứt hủy', ?, 0, ?)
            """,
            (item_id, -old_qty, reason)
        )

    return {
        "success": True,
        "item_id": item_id,
        "food_name": row['food_name'],
        "message": f"Đã loại bỏ '{row['food_name']}' khỏi tủ (Lý do: {reason})."
    }


# -----------------------------------------------------------------------------
# 7. HỆ THỐNG CẢNH BÁO KÉP (ALERTS)
# -----------------------------------------------------------------------------

def get_alerts(system_date: Optional[str] = None) -> Dict[str, Any]:
    """
    Cảnh báo chuẩn hóa theo view_alerts của giao diện dự kiến:
    1. 'CẢNH BÁO: ĐÃ HẾT HẠN' (days_remaining < 0)
    2. 'CẢNH BÁO: SẮP HẾT HẠN' (0 <= days_remaining <= warning_days_threshold)
    3. 'CẢNH BÁO: SẮP HẾT TỒN KHO' (current_quantity <= min_threshold)
    """
    ref_date = system_date or get_system_date()
    cfg = get_system_config()
    warning_days = cfg.get("warning_days_threshold", 3)

    items = query_all(
        """
        SELECT 
            fi.item_id, f.food_name, c.category_name, sl.location_name,
            u.unit_name, fi.current_quantity, fi.min_threshold,
            fi.import_date, fi.expiration_date
        FROM food_items fi
        JOIN foods f ON fi.food_id = f.food_id
        JOIN categories c ON f.category_id = c.category_id
        JOIN storage_locations sl ON fi.location_id = sl.location_id
        JOIN units u ON fi.unit_id = u.unit_id
        WHERE fi.current_quantity > 0 AND fi.status IN ('ACTIVE', 'Đang sử dụng')
        ORDER BY fi.expiration_date ASC
        """
    )

    expiring_soon = []
    already_expired = []
    low_stock = []

    for item in items:
        days = calculate_days_left(item['expiration_date'], ref_date)
        item_data = dict(item)
        item_data['days_remaining'] = days
        item_data['days_left'] = days

        if days < 0:
            item_data['alert_type'] = 'CẢNH BÁO: ĐÃ HẾT HẠN'
            already_expired.append(item_data)
        elif days <= warning_days:
            item_data['alert_type'] = 'CẢNH BÁO: SẮP HẾT HẠN'
            expiring_soon.append(item_data)

        min_th = float(item['min_threshold'] or 0)
        curr_q = float(item['current_quantity'] or 0)
        if min_th > 0 and curr_q <= min_th:
            item_data['alert_type'] = 'CẢNH BÁO: SẮP HẾT TỒN KHO'
            low_stock.append(item_data)

    return {
        "success": True,
        "system_date": ref_date,
        "counts": {
            "expired": len(already_expired),
            "expiring_soon": len(expiring_soon),
            "low_stock": len(low_stock),
            "total_alerts": len(already_expired) + len(expiring_soon) + len(low_stock)
        },
        "expired_items": already_expired,
        "expiring_soon_items": expiring_soon,
        "low_stock_items": low_stock
    }


# -----------------------------------------------------------------------------
# 8. TRUY VẤN TỦ LẠNH (INVENTORY) & AUDIT LOG
# -----------------------------------------------------------------------------

def get_inventory(
    search_text: Optional[str] = None,
    location_id: Optional[Union[int, str]] = None,
    category_id: Optional[Union[int, str]] = None,
    status: Optional[str] = None,
    system_date: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Truy vấn danh sách tồn kho có hỗ trợ bộ lọc và tìm kiếm."""
    ref_date = system_date or get_system_date()
    config = get_system_config()

    query = """
        SELECT 
            fi.item_id, fi.food_id, f.food_code, f.food_name, f.brand, f.image_url,
            c.category_id, c.category_name,
            sl.location_id, sl.location_name, sl.area_type,
            u.unit_id, u.unit_name,
            fi.current_quantity, fi.min_threshold,
            fi.import_date, fi.expiration_date, fi.status, fi.notes
        FROM food_items fi
        JOIN foods f ON fi.food_id = f.food_id
        JOIN categories c ON f.category_id = c.category_id
        JOIN storage_locations sl ON fi.location_id = sl.location_id
        JOIN units u ON fi.unit_id = u.unit_id
        WHERE 1=1
    """
    params = []

    if status and status != 'all':
        if status in ('ACTIVE', 'Đang sử dụng'):
            query += " AND fi.status IN ('ACTIVE', 'Đang sử dụng')"
        else:
            query += " AND fi.status = ?"
            params.append(status)

    if location_id and location_id != 'all':
        query += " AND fi.location_id = ?"
        params.append(int(location_id))

    if category_id and category_id != 'all':
        query += " AND f.category_id = ?"
        params.append(int(category_id))

    if search_text:
        term = f"%{search_text.strip()}%"
        query += " AND (f.food_name LIKE ? OR f.brand LIKE ? OR fi.notes LIKE ?)"
        params.extend([term, term, term])

    query += " ORDER BY fi.expiration_date ASC, fi.import_date ASC"

    rows = query_all(query, tuple(params))
    results = []
    for r in rows:
        r_dict = dict(r)
        days = calculate_days_left(r['expiration_date'], ref_date)
        priority = classify_fefo_priority(days, config)
        r_dict['days_remaining'] = days
        r_dict['days_left'] = days
        r_dict['priority_level'] = priority
        r_dict['priority'] = {
            "level": "HIGH" if priority == 'Cao' else "MEDIUM" if priority == 'Trung bình' else "LOW",
            "label": priority
        }
        results.append(r_dict)

    return results


def get_audit_log(item_id: Optional[int] = None, limit: int = 50) -> List[Dict[str, Any]]:
    """Lấy nhật ký giao dịch biến động kho (Audit Trail)."""
    query = """
        SELECT 
            it.transaction_id,
            it.item_id,
            it.action_type,
            it.change_quantity,
            it.remaining_quantity,
            it.reason,
            it.transaction_time,
            f.food_name,
            u.unit_name,
            sl.location_name
        FROM inventory_transactions it
        JOIN food_items fi ON it.item_id = fi.item_id
        JOIN foods f ON fi.food_id = f.food_id
        JOIN units u ON fi.unit_id = u.unit_id
        JOIN storage_locations sl ON fi.location_id = sl.location_id
    """
    params = []
    if item_id:
        query += " WHERE it.item_id = ?"
        params.append(int(item_id))

    query += " ORDER BY it.transaction_id DESC LIMIT ?"
    params.append(int(limit))

    return query_all(query, tuple(params))


def get_metadata() -> Dict[str, Any]:
    """Danh mục nền tảng (Categories, Locations, Units, Foods)."""
    return {
        "categories": query_all("SELECT category_id, category_name FROM categories ORDER BY category_id"),
        "locations": query_all("SELECT location_id, location_name, area_type FROM storage_locations ORDER BY location_id"),
        "units": query_all("SELECT unit_id, unit_name FROM units ORDER BY unit_id"),
        "foods": query_all("SELECT food_id, food_name, category_id FROM foods ORDER BY food_name")
    }
