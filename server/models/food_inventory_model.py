"""
server/models/food_inventory_model.py
============================================================================
Domain Model for Inventory & Transactions (`food_items`, `inventory_transactions`):
- `get_inventory`: filtered pantry list with days_left & FEFO priority.
- `get_fefo_recommendations`: 3-tier priority + FIFO tie-breaker + opened low-stock
  lot tie-breaker + recipe cross-matching via RecipeModel.
- `get_alerts`: expired, expiring soon, and low-stock alerts.
- `get_shopping_list`: 3-aisle replenishment shopping list (`fresh_chilled`,
  `frozen`, `pantry_dry`).
- Atomic mutations: `add_food_item`, `use_food`, `adjust_food`, `delete_food_item`.
- `get_audit_log`: audit trail of inventory transactions.
============================================================================
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple, Union

from server.database import DatabaseTransaction, query_all
from server.models.recipe_model import RecipeModel
from server.models.system_config_model import SystemConfigModel


class FoodInventoryModel:
    """Owns all inventory, FEFO, alerts, shopping list, and transaction queries/mutations."""

    ACTIVE_STATUSES: Tuple[str, ...] = ("ACTIVE", "Đang sử dụng")
    DEPLETED_STATUSES: Tuple[str, ...] = ("CONSUMED", "Đã hết")
    OPENED_NOTE_KEYWORDS: Tuple[str, ...] = ("đã mở", "mở nắp", "đang mở", "ăn dở", "opened")

    AISLE_LABELS: Dict[str, str] = {
        "fresh_chilled": "Thực phẩm tươi sống & Bảo quản mát",
        "frozen": "Thực phẩm đông lạnh",
        "pantry_dry": "Đồ khô, Gia vị & Đóng gói",
    }

    FRESH_CHILLED_CATEGORIES = frozenset(
        {
            "thịt tươi sống",
            "thủy hải sản tươi",
            "gia cầm & trứng",
            "rau lá xanh",
            "củ & quả nấu canh",
            "nấm & rau mầm",
            "sữa tươi & sữa chua",
            "bơ & phô mai",
            "thịt nguội & xúc xích",
            "trái cây tươi nhiệt đới",
            "thảo mộc & rau thơm",
        }
    )

    FROZEN_CATEGORIES = frozenset({"đồ đông lạnh ăn liền"})

    def __init__(
        self,
        config_model: Optional[SystemConfigModel] = None,
        recipe_model: Optional[RecipeModel] = None,
    ) -> None:
        self.config_model = config_model or SystemConfigModel()
        self.recipe_model = recipe_model or RecipeModel(config_model=self.config_model)

    @staticmethod
    def _normalize_area_type(area_type: Optional[str]) -> str:
        area = (area_type or "").strip()
        if area in ("FREEZER", "CHILLER", "DOOR", "VEG_BOX"):
            return "Trong tủ lạnh"
        if area == "PANTRY":
            return "Ngoài tủ lạnh"
        return area

    @classmethod
    def _is_opened_or_low_stock_lot(cls, lot: Dict[str, Any]) -> bool:
        curr_qty = float(lot.get("current_quantity") or 0.0)
        min_th = float(lot.get("min_threshold") or 0.0)
        notes = str(lot.get("notes") or "").lower()
        is_low_stock = min_th > 0 and curr_qty <= min_th
        is_opened_note = any(kw in notes for kw in cls.OPENED_NOTE_KEYWORDS)
        return is_low_stock or is_opened_note

    @classmethod
    def _classify_shopping_aisle(cls, category_name: str, area_type: str, location_name: str) -> str:
        cat_lower = (category_name or "").strip().lower()
        loc_lower = (location_name or "").strip().lower()
        area_norm = cls._normalize_area_type(area_type)

        if cat_lower in cls.FROZEN_CATEGORIES or "ngăn đông" in loc_lower or area_type == "FREEZER":
            return "frozen"
        if cat_lower in cls.FRESH_CHILLED_CATEGORIES or area_norm == "Trong tủ lạnh":
            return "fresh_chilled"
        return "pantry_dry"

    @staticmethod
    def _build_priority_reason(
        days_remaining: int,
        priority: str,
        tie_group_size: int,
        tie_position: int,
        expiry_date: str,
        import_date: str,
        location_name: str,
        is_opened_low_stock: bool,
    ) -> str:
        if days_remaining == 0:
            day_label = "Hết hạn ngay hôm nay"
        elif days_remaining == 1:
            day_label = "Chỉ còn 1 ngày sử dụng"
        elif days_remaining < 0:
            day_label = f"Đã quá hạn {abs(days_remaining)} ngày"
        else:
            day_label = f"Còn {days_remaining} ngày đến hạn"

        tie_notes: List[str] = []
        if tie_group_size > 1:
            tie_notes.append(f"Đồng hạn {expiry_date}, xếp FIFO #{tie_position}/{tie_group_size} (nhập {import_date})")
            if is_opened_low_stock:
                tie_notes.append("ưu tiên dùng hết lô đang mở/tồn thấp")
        suffix = f" · {'; '.join(tie_notes)}" if tie_notes else ""

        if priority == "Cao":
            return f"{day_label}, cần ưu tiên chế biến ngay{suffix}."
        if priority == "Trung bình":
            return f"{day_label}, nên lên kế hoạch dùng trong tuần{suffix}."
        return f"{day_label}, bảo quản ổn định ({location_name}){suffix}."

    @staticmethod
    def _build_suggested_action(priority: str) -> str:
        if priority == "Cao":
            return "Sắp hết hạn, nấu ngay hôm nay/mai"
        if priority == "Trung bình":
            return "Dự kiến dùng trong tuần"
        return "Bảo quản tiếp tục"

    def get_fefo_recommendations(
        self,
        include_expired: bool = False,
        system_date: Optional[str] = None,
        area_type: Optional[str] = None,
        location_id: Optional[Union[int, str]] = None,
        priority_level: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Compute FEFO recommendations with:
        - 3-tier priority ('Cao', 'Trung bình', 'Thấp')
        - FIFO tie-breaker (import_date ASC)
        - Opened / low-stock lot tie-breaker (opened/low-stock first, smaller qty first)
        - Recipe cross-matching via RecipeModel
        """
        config = self.config_model.get_config()
        ref_date = system_date or config["simulation_date"]

        raw_items = query_all(
            """
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
              AND fi.status IN ('ACTIVE', 'Đang sử dụng');
            """
        )

        recipes = self.recipe_model.get_all_recipes()
        eligible_lots: List[Dict[str, Any]] = []
        expired_excluded_count = 0

        for it in raw_items:
            exp_date = str(it.get("expiration_date") or "")
            days_rem = self.config_model.calculate_days_left(exp_date, ref_date)

            if days_rem < 0:
                expired_excluded_count += 1
                if not include_expired:
                    continue

            lot = dict(it)
            lot["days_remaining"] = days_rem
            lot["days_left"] = days_rem
            lot["expiry_date"] = exp_date
            lot["expiration_date"] = exp_date
            lot["is_opened_low_stock"] = self._is_opened_or_low_stock_lot(lot)
            eligible_lots.append(lot)

        # Sort: FEFO (expiration_date ASC) -> FIFO (import_date ASC)
        # -> Opened / low-stock tie-breaker -> smaller remaining qty -> item_id ASC
        eligible_lots.sort(
            key=lambda x: (
                x["expiration_date"],
                str(x.get("import_date") or ""),
                0 if x["is_opened_low_stock"] else 1,
                float(x["current_quantity"]),
                int(x["item_id"]),
            )
        )

        tie_groups: Dict[str, List[Dict[str, Any]]] = {}
        for lot in eligible_lots:
            tie_groups.setdefault(lot["expiration_date"], []).append(lot)

        counts_by_priority = {"Cao": 0, "Trung bình": 0, "Thấp": 0}
        ranked_items: List[Dict[str, Any]] = []

        for idx, lot in enumerate(eligible_lots):
            days_rem = lot["days_remaining"]
            priority = self.config_model.classify_fefo_priority(days_rem, config)
            if priority in counts_by_priority:
                counts_by_priority[priority] += 1

            tg = tie_groups.get(lot["expiration_date"], [lot])
            tie_group_size = len(tg)
            tie_position = next(
                (i + 1 for i, entry in enumerate(tg) if entry["item_id"] == lot["item_id"]),
                1,
            )

            reason = self._build_priority_reason(
                days_remaining=days_rem,
                priority=priority,
                tie_group_size=tie_group_size,
                tie_position=tie_position,
                expiry_date=lot["expiration_date"],
                import_date=str(lot.get("import_date") or ""),
                location_name=lot["location_name"],
                is_opened_low_stock=lot["is_opened_low_stock"],
            )
            action = self._build_suggested_action(priority)

            matched_recipes = self.recipe_model.get_matching_recipes_for_food(
                food_code=str(lot.get("food_code") or ""),
                food_name=str(lot.get("food_name") or ""),
                recipes=recipes,
            )
            matched_recipe_ids = [r["recipe_id"] for r in matched_recipes]
            area = self._normalize_area_type(lot.get("area_type"))

            ranked_items.append(
                {
                    "rank": idx + 1,
                    "item_id": int(lot["item_id"]),
                    "food_id": int(lot["food_id"]),
                    "food_code": lot["food_code"],
                    "item_code": f"LOT-{int(lot['item_id']):03d}",
                    "food_name": lot["food_name"],
                    "category_id": int(lot["category_id"]),
                    "category_name": lot["category_name"],
                    "brand": lot["brand"],
                    "image_url": lot["image_url"],
                    "area_type": area,
                    "location_id": int(lot["location_id"]),
                    "location_name": lot["location_name"],
                    "current_quantity": float(lot["current_quantity"]),
                    "min_threshold": float(lot["min_threshold"] or 0.0),
                    "unit_id": int(lot["unit_id"]),
                    "unit_name": lot["unit_name"],
                    "import_date": lot["import_date"],
                    "expiry_date": lot["expiration_date"],
                    "expiration_date": lot["expiration_date"],
                    "days_remaining": days_rem,
                    "days_left": days_rem,
                    "is_opened_low_stock": lot["is_opened_low_stock"],
                    "priority_level": priority,
                    "priority": {
                        "level": "HIGH" if priority == "Cao" else "MEDIUM" if priority == "Trung bình" else "LOW",
                        "label": priority,
                        "badge_color": "danger" if priority == "Cao" else "warning" if priority == "Trung bình" else "success",
                    },
                    "priority_reason": reason,
                    "suggested_action": action,
                    "fifo_tie_group_size": tie_group_size,
                    "fifo_tie_position": tie_position,
                    "matching_recipe_ids": matched_recipe_ids,
                    "suggested_recipes": matched_recipes,
                    "status": lot["status"],
                    "notes": lot["notes"],
                }
            )

        filtered_items = ranked_items
        if area_type and area_type != "all":
            filtered_items = [i for i in filtered_items if i["area_type"] == area_type]
        if location_id is not None and str(location_id) != "all":
            filtered_items = [i for i in filtered_items if str(i["location_id"]) == str(location_id)]
        if priority_level and priority_level != "all":
            filtered_items = [
                i
                for i in filtered_items
                if i["priority_level"] == priority_level or i["priority"]["level"] == priority_level
            ]

        return {
            "ok": True,
            "success": True,
            "reference_date": ref_date,
            "items": filtered_items,
            "data": filtered_items,
            "count": len(filtered_items),
            "counts_by_priority": counts_by_priority,
            "expired_excluded_count": expired_excluded_count,
        }

    def get_inventory(
        self,
        search_text: Optional[str] = None,
        search: Optional[str] = None,
        location_id: Optional[Union[int, str]] = None,
        category_id: Optional[Union[int, str]] = None,
        status: Optional[str] = None,
        system_date: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Query pantry inventory with optional search, location, category, and status filters."""
        config = self.config_model.get_config()
        ref_date = system_date or config["simulation_date"]
        keyword = search_text if search_text is not None else search

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
        params: List[Any] = []

        if status and status != "all":
            if status in self.ACTIVE_STATUSES:
                query += " AND fi.status IN ('ACTIVE', 'Đang sử dụng')"
            elif status in self.DEPLETED_STATUSES:
                query += " AND fi.status IN ('CONSUMED', 'Đã hết')"
            else:
                query += " AND fi.status = ?"
                params.append(status)

        if location_id is not None and str(location_id) != "all" and str(location_id).strip() != "":
            query += " AND fi.location_id = ?"
            params.append(int(location_id))

        if category_id is not None and str(category_id) != "all" and str(category_id).strip() != "":
            query += " AND f.category_id = ?"
            params.append(int(category_id))

        if keyword and str(keyword).strip():
            term = f"%{str(keyword).strip()}%"
            query += " AND (f.food_name LIKE ? OR f.food_code LIKE ? OR f.brand LIKE ? OR fi.notes LIKE ?)"
            params.extend([term, term, term, term])

        query += " ORDER BY fi.expiration_date ASC, fi.import_date ASC, fi.item_id ASC;"

        rows = query_all(query, tuple(params))
        results: List[Dict[str, Any]] = []
        for r in rows:
            item = dict(r)
            days = self.config_model.calculate_days_left(item["expiration_date"], ref_date)
            priority = self.config_model.classify_fefo_priority(days, config)
            item["area_type"] = self._normalize_area_type(item.get("area_type"))
            item["days_remaining"] = days
            item["days_left"] = days
            item["expiry_date"] = item["expiration_date"]
            item["priority_level"] = priority
            item["priority"] = {
                "level": "HIGH" if priority == "Cao" else "MEDIUM" if priority == "Trung bình" else "LOW",
                "label": priority,
            }
            results.append(item)

        return results

    def get_alerts(self, system_date: Optional[str] = None) -> Dict[str, Any]:
        """Compute expired, expiring soon, and low-stock alerts."""
        config = self.config_model.get_config()
        ref_date = system_date or config["simulation_date"]
        warning_days = int(config.get("warning_days_threshold", 3))

        items = query_all(
            """
            SELECT
                fi.item_id, fi.food_id, f.food_code, f.food_name,
                c.category_name, sl.location_name, sl.area_type,
                u.unit_name, fi.current_quantity, fi.min_threshold,
                fi.import_date, fi.expiration_date, fi.status
            FROM food_items fi
            JOIN foods f ON fi.food_id = f.food_id
            JOIN categories c ON f.category_id = c.category_id
            JOIN storage_locations sl ON fi.location_id = sl.location_id
            JOIN units u ON fi.unit_id = u.unit_id
            WHERE fi.status IN ('ACTIVE', 'Đang sử dụng', 'CONSUMED', 'Đã hết')
            ORDER BY fi.expiration_date ASC, fi.item_id ASC;
            """
        )

        # Foods that already have a healthy non-expired lot above min_threshold
        healthy_food_ids = set()
        for it in items:
            if it["status"] in self.ACTIVE_STATUSES:
                days = self.config_model.calculate_days_left(it["expiration_date"], ref_date)
                curr_q = float(it["current_quantity"] or 0.0)
                min_th = float(it["min_threshold"] or 0.0)
                if days >= 0 and curr_q > min_th and curr_q > 0:
                    healthy_food_ids.add(int(it["food_id"]))

        expiring_soon: List[Dict[str, Any]] = []
        already_expired: List[Dict[str, Any]] = []
        low_stock: List[Dict[str, Any]] = []

        for item in items:
            days = self.config_model.calculate_days_left(item["expiration_date"], ref_date)
            curr_q = float(item["current_quantity"] or 0.0)
            min_th = float(item["min_threshold"] or 0.0)
            food_id = int(item["food_id"])

            base = dict(item)
            base["area_type"] = self._normalize_area_type(base.get("area_type"))
            base["days_remaining"] = days
            base["days_left"] = days
            base["expiry_date"] = item["expiration_date"]

            if item["status"] in self.ACTIVE_STATUSES and curr_q > 0:
                if days < 0:
                    exp_entry = dict(base)
                    exp_entry["alert_type"] = "CẢNH BÁO: ĐÃ HẾT HẠN"
                    exp_entry["is_expired"] = True
                    already_expired.append(exp_entry)
                elif days <= warning_days:
                    soon_entry = dict(base)
                    soon_entry["alert_type"] = "CẢNH BÁO: SẮP HẾT HẠN"
                    soon_entry["is_expired"] = False
                    expiring_soon.append(soon_entry)

                if min_th > 0 and curr_q <= min_th:
                    target_stock = max(min_th * 2, min_th + 1)
                    low_entry = dict(base)
                    low_entry["alert_type"] = "CẢNH BÁO: SẮP HẾT TỒN KHO"
                    low_entry["suggested_buy_quantity"] = round(max(1.0, target_stock - curr_q), 2)
                    low_stock.append(low_entry)
            elif item["status"] in self.DEPLETED_STATUSES and food_id not in healthy_food_ids:
                target_stock = max(min_th * 2, min_th, 1.0)
                low_entry = dict(base)
                low_entry["alert_type"] = "CẢNH BÁO: SẮP HẾT TỒN KHO"
                low_entry["suggested_buy_quantity"] = round(max(1.0, target_stock), 2)
                low_stock.append(low_entry)

        unique_ids = {
            i["item_id"] for i in already_expired + expiring_soon + low_stock
        }

        return {
            "ok": True,
            "success": True,
            "system_date": ref_date,
            "reference_date": ref_date,
            "counts": {
                "expired": len(already_expired),
                "expiring_soon": len(expiring_soon),
                "low_stock": len(low_stock),
                "total_alerts": len(already_expired) + len(expiring_soon) + len(low_stock),
                "unique_items": len(unique_ids),
            },
            "expired_items": already_expired,
            "expiring_soon_items": expiring_soon,
            "low_stock_items": low_stock,
        }

    def get_shopping_list(self, system_date: Optional[str] = None) -> Dict[str, Any]:
        """
        Generate a 3-aisle replenishment shopping list (`fresh_chilled`, `frozen`, `pantry_dry`)
        for items that are low in stock, depleted, or expired without healthy backup lots.
        """
        config = self.config_model.get_config()
        ref_date = system_date or config["simulation_date"]

        rows = query_all(
            """
            SELECT
                fi.item_id, fi.food_id, f.food_code, f.food_name,
                c.category_id, c.category_name,
                sl.location_id, sl.location_name, sl.area_type,
                u.unit_name, fi.current_quantity, fi.min_threshold,
                fi.expiration_date, fi.status
            FROM food_items fi
            JOIN foods f ON fi.food_id = f.food_id
            JOIN categories c ON f.category_id = c.category_id
            JOIN storage_locations sl ON fi.location_id = sl.location_id
            JOIN units u ON fi.unit_id = u.unit_id
            WHERE fi.status IN ('ACTIVE', 'Đang sử dụng', 'CONSUMED', 'Đã hết')
            ORDER BY fi.expiration_date ASC, fi.item_id ASC;
            """
        )

        # Group by food_id to determine whether a food has a healthy active non-expired batch
        food_batches: Dict[int, List[Dict[str, Any]]] = {}
        for r in rows:
            days = self.config_model.calculate_days_left(r["expiration_date"], ref_date)
            entry = dict(r)
            entry["days_left"] = days
            food_batches.setdefault(int(r["food_id"]), []).append(entry)

        grouped: Dict[str, List[Dict[str, Any]]] = {
            "fresh_chilled": [],
            "frozen": [],
            "pantry_dry": [],
        }

        for food_id, batches in food_batches.items():
            healthy_batches = [
                b
                for b in batches
                if b["status"] in self.ACTIVE_STATUSES
                and float(b["current_quantity"]) > 0
                and b["days_left"] >= 0
                and float(b["current_quantity"]) > float(b["min_threshold"] or 0.0)
            ]
            if healthy_batches:
                continue

            # Pick the most representative batch to derive quantity/location/reason
            rep = batches[0]
            active_non_expired = [
                b
                for b in batches
                if b["status"] in self.ACTIVE_STATUSES and float(b["current_quantity"]) > 0 and b["days_left"] >= 0
            ]

            reason = "Cần mua bù hàng sắp hết"
            curr_total = sum(float(b["current_quantity"]) for b in active_non_expired)
            min_th = max(float(b["min_threshold"] or 0.0) for b in batches)

            if active_non_expired:
                rep = active_non_expired[0]
                if not (min_th > 0 and curr_total <= min_th):
                    continue
                target = max(min_th * 2, min_th + 1)
                suggested_qty = round(max(1.0, target - curr_total), 2)
                reason = f"Sắp hết tồn kho ({curr_total:g}/{min_th:g} {rep['unit_name']})"
            elif any(b["status"] in self.ACTIVE_STATUSES and b["days_left"] < 0 for b in batches):
                target = max(min_th * 2, min_th, 1.0)
                suggested_qty = round(max(1.0, target), 2)
                reason = "Lô hiện tại đã hết hạn, cần mua thay thế"
            else:
                target = max(min_th * 2, min_th, 1.0)
                suggested_qty = round(max(1.0, target), 2)
                reason = "Đã dùng hết trong tủ"

            aisle_key = self._classify_shopping_aisle(
                category_name=str(rep["category_name"]),
                area_type=str(rep["area_type"]),
                location_name=str(rep["location_name"]),
            )

            grouped[aisle_key].append(
                {
                    "food_id": food_id,
                    "food_code": rep["food_code"],
                    "food_name": rep["food_name"],
                    "category_id": int(rep["category_id"]),
                    "category_name": rep["category_name"],
                    "location_name": rep["location_name"],
                    "unit_name": rep["unit_name"],
                    "current_quantity": round(curr_total, 2),
                    "min_threshold": min_th,
                    "suggested_buy_quantity": suggested_qty,
                    "reason": reason,
                    "aisle_key": aisle_key,
                    "aisle_name": self.AISLE_LABELS[aisle_key],
                }
            )

        aisles = []
        flat_items: List[Dict[str, Any]] = []
        for aisle_key in ("fresh_chilled", "frozen", "pantry_dry"):
            aisle_items = sorted(grouped[aisle_key], key=lambda x: x["food_name"])
            flat_items.extend(aisle_items)
            aisles.append(
                {
                    "aisle_key": aisle_key,
                    "aisle_name": self.AISLE_LABELS[aisle_key],
                    "count": len(aisle_items),
                    "items": aisle_items,
                }
            )

        return {
            "ok": True,
            "success": True,
            "reference_date": ref_date,
            "aisles": aisles,
            "aisles_map": grouped,
            "items": flat_items,
            "total_items": len(flat_items),
        }

    def add_food_item(
        self,
        food_id: int,
        location_id: int,
        unit_id: int,
        quantity: float,
        expiration_date: str,
        import_date: Optional[str] = None,
        min_threshold: float = 1.0,
        notes: str = "",
    ) -> Dict[str, Any]:
        """Atomically insert a new food_item lot and its IMPORT audit transaction."""
        qty = float(quantity)
        min_th = float(min_threshold)
        if qty <= 0:
            raise ValueError("Số lượng nhập phải lớn hơn 0")
        if min_th < 0:
            raise ValueError("Ngưỡng tối thiểu không được âm")

        try:
            exp_formatted = datetime.strptime(str(expiration_date).strip()[:10], "%Y-%m-%d").strftime("%Y-%m-%d")
        except ValueError as exc:
            raise ValueError(f"Định dạng expiration_date không hợp lệ: '{expiration_date}' (cần YYYY-MM-DD)") from exc

        eff_import_date = import_date or self.config_model.get_simulation_date()
        try:
            imp_formatted = datetime.strptime(str(eff_import_date).strip()[:10], "%Y-%m-%d").strftime("%Y-%m-%d")
        except ValueError as exc:
            raise ValueError(f"Định dạng import_date không hợp lệ: '{eff_import_date}' (cần YYYY-MM-DD)") from exc

        with DatabaseTransaction() as conn:
            cursor = conn.cursor()

            cursor.execute("SELECT food_name FROM foods WHERE food_id = ?;", (int(food_id),))
            food_row = cursor.fetchone()
            if not food_row:
                raise ValueError(f"food_id = {food_id} không tồn tại")

            cursor.execute("SELECT location_name FROM storage_locations WHERE location_id = ?;", (int(location_id),))
            if not cursor.fetchone():
                raise ValueError(f"location_id = {location_id} không tồn tại")

            cursor.execute("SELECT unit_name FROM units WHERE unit_id = ?;", (int(unit_id),))
            if not cursor.fetchone():
                raise ValueError(f"unit_id = {unit_id} không tồn tại")

            cursor.execute(
                """
                INSERT INTO food_items (
                    food_id, location_id, unit_id, current_quantity, min_threshold,
                    import_date, expiration_date, status, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?);
                """,
                (int(food_id), int(location_id), int(unit_id), qty, min_th, imp_formatted, exp_formatted, notes),
            )
            new_item_id = int(cursor.lastrowid)

            cursor.execute(
                """
                INSERT INTO inventory_transactions (
                    item_id, action_type, change_quantity, remaining_quantity, reason, transaction_time
                ) VALUES (?, 'IMPORT', ?, ?, ?, DATETIME('now', 'localtime'));
                """,
                (new_item_id, qty, qty, f"Nhập kho: {notes or 'Nhập mua mới'}"),
            )
            tx_id = int(cursor.lastrowid)

        return {
            "ok": True,
            "success": True,
            "item_id": new_item_id,
            "transaction_id": tx_id,
            "food_name": food_row["food_name"],
            "quantity": qty,
            "import_date": imp_formatted,
            "expiration_date": exp_formatted,
            "status": "ACTIVE",
            "message": f"Đã thêm mới '{food_row['food_name']}' thành công.",
        }

    def use_food(
        self,
        item_id: int,
        quantity: float,
        reason: str = "Nấu ăn hàng ngày",
        actor_device: str = "Client",
    ) -> Dict[str, Any]:
        """Atomically deduct used quantity and write a USE audit transaction."""
        use_qty = float(quantity)
        if use_qty <= 0:
            raise ValueError(f"Số lượng xuất dùng phải lớn hơn 0 (nhận được: {quantity})")

        with DatabaseTransaction() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT fi.item_id, fi.current_quantity, fi.status, f.food_name, u.unit_name
                FROM food_items fi
                JOIN foods f ON fi.food_id = f.food_id
                JOIN units u ON fi.unit_id = u.unit_id
                WHERE fi.item_id = ?;
                """,
                (int(item_id),),
            )
            row = cursor.fetchone()
            if not row:
                raise ValueError(f"Không tìm thấy thực phẩm với item_id = {item_id}")

            current_qty = float(row["current_quantity"])
            food_name = row["food_name"]
            unit_name = row["unit_name"]

            if row["status"] not in self.ACTIVE_STATUSES:
                raise ValueError(
                    f"Thực phẩm '{food_name}' hiện không ở trạng thái hoạt động (trạng thái: {row['status']})"
                )

            if use_qty > current_qty:
                raise ValueError(
                    f"Lỗi: Số lượng sử dụng ({use_qty} {unit_name}) lớn hơn tồn kho thực tế ({current_qty} {unit_name})!"
                )

            new_qty = round(current_qty - use_qty, 3)
            new_status = "CONSUMED" if new_qty <= 0 else "ACTIVE"

            cursor.execute(
                "UPDATE food_items SET current_quantity = ?, status = ? WHERE item_id = ?;",
                (new_qty, new_status, int(item_id)),
            )

            cursor.execute(
                """
                INSERT INTO inventory_transactions (
                    item_id, action_type, change_quantity, remaining_quantity, reason, transaction_time
                ) VALUES (?, 'USE', ?, ?, ?, DATETIME('now', 'localtime'));
                """,
                (int(item_id), -use_qty, new_qty, reason or "Nấu ăn hàng ngày"),
            )
            tx_id = int(cursor.lastrowid)

        return {
            "ok": True,
            "success": True,
            "trang_thai": "Thành công",
            "item_id": int(item_id),
            "ten_thuc_pham": food_name,
            "food_name": food_name,
            "so_luong_da_dung": use_qty,
            "used_quantity": use_qty,
            "so_luong_con_lai": new_qty,
            "remaining_quantity": new_qty,
            "unit_name": unit_name,
            "trang_thai_kho": new_status,
            "status": new_status,
            "actor_device": actor_device,
            "transaction_id": tx_id,
            "message": f"Đã xuất dùng {use_qty} {unit_name} '{food_name}'. Còn lại: {new_qty} {unit_name}.",
        }

    def adjust_food(
        self,
        item_id: int,
        new_quantity: float,
        reason: str = "Kiểm kê tủ lạnh",
        actor_device: str = "Client",
    ) -> Dict[str, Any]:
        """Atomically adjust stock quantity and write an ADJUST audit transaction."""
        target_qty = float(new_quantity)
        if target_qty < 0:
            raise ValueError(f"Số lượng tồn kho không thể âm (nhận được: {new_quantity})")

        with DatabaseTransaction() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT fi.item_id, fi.current_quantity, f.food_name, u.unit_name
                FROM food_items fi
                JOIN foods f ON fi.food_id = f.food_id
                JOIN units u ON fi.unit_id = u.unit_id
                WHERE fi.item_id = ?;
                """,
                (int(item_id),),
            )
            row = cursor.fetchone()
            if not row:
                raise ValueError(f"Không tìm thấy thực phẩm với item_id = {item_id}")

            old_qty = float(row["current_quantity"])
            diff_qty = round(target_qty - old_qty, 3)
            new_status = "CONSUMED" if target_qty <= 0 else "ACTIVE"

            cursor.execute(
                "UPDATE food_items SET current_quantity = ?, status = ? WHERE item_id = ?;",
                (target_qty, new_status, int(item_id)),
            )

            cursor.execute(
                """
                INSERT INTO inventory_transactions (
                    item_id, action_type, change_quantity, remaining_quantity, reason, transaction_time
                ) VALUES (?, 'ADJUST', ?, ?, ?, DATETIME('now', 'localtime'));
                """,
                (int(item_id), diff_qty, target_qty, reason or "Kiểm kê tủ lạnh"),
            )
            tx_id = int(cursor.lastrowid)

        return {
            "ok": True,
            "success": True,
            "item_id": int(item_id),
            "food_name": row["food_name"],
            "previous_quantity": old_qty,
            "new_quantity": target_qty,
            "diff_quantity": diff_qty,
            "unit_name": row["unit_name"],
            "status": new_status,
            "actor_device": actor_device,
            "transaction_id": tx_id,
            "message": f"Đã kiểm kê '{row['food_name']}': từ {old_qty} thành {target_qty} {row['unit_name']}.",
        }

    def delete_food_item(
        self,
        item_id: int,
        reason: str = "Vứt hủy / Hỏng",
    ) -> Dict[str, Any]:
        """Soft-delete (discard) a food_item lot and write a DELETE audit transaction."""
        with DatabaseTransaction() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT fi.item_id, fi.current_quantity, f.food_name
                FROM food_items fi
                JOIN foods f ON fi.food_id = f.food_id
                WHERE fi.item_id = ?;
                """,
                (int(item_id),),
            )
            row = cursor.fetchone()
            if not row:
                raise ValueError(f"Không tìm thấy item_id = {item_id}")

            old_qty = float(row["current_quantity"])
            cursor.execute(
                "UPDATE food_items SET current_quantity = 0, status = 'DISCARDED' WHERE item_id = ?;",
                (int(item_id),),
            )

            cursor.execute(
                """
                INSERT INTO inventory_transactions (
                    item_id, action_type, change_quantity, remaining_quantity, reason, transaction_time
                ) VALUES (?, 'DELETE', ?, 0, ?, DATETIME('now', 'localtime'));
                """,
                (int(item_id), -old_qty, reason or "Vứt hủy / Hỏng"),
            )
            tx_id = int(cursor.lastrowid)

        return {
            "ok": True,
            "success": True,
            "item_id": int(item_id),
            "food_name": row["food_name"],
            "status": "DISCARDED",
            "transaction_id": tx_id,
            "message": f"Đã loại bỏ '{row['food_name']}' khỏi tủ (Lý do: {reason}).",
        }

    def get_audit_log(self, item_id: Optional[int] = None, limit: int = 50) -> List[Dict[str, Any]]:
        """Fetch recent inventory transaction audit records."""
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
        params: List[Any] = []
        if item_id is not None and str(item_id).strip() != "":
            query += " WHERE it.item_id = ?"
            params.append(int(item_id))

        query += " ORDER BY it.transaction_id DESC LIMIT ?;"
        params.append(max(1, int(limit)))
        return query_all(query, tuple(params))
