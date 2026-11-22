"""
server/models/recipe_model.py
============================================================================
Domain Model for standalone unstructured `recipes` table.
- ZERO database foreign-key relationships (required_ingredients stored as JSON
  list of food codes such as ["TP007", "TP010", "TP014", "TP015"]).
- Parses JSON ingredients in Python and matches against active pantry items:
  - Ignores basic staples (TP014, TP015, TP016) in core readiness scoring.
  - Applies +30% expiring bonus when a matched core ingredient is expiring soon.
============================================================================
"""

from __future__ import annotations

import json
from typing import Any, Dict, FrozenSet, List, Optional

from server.database import query_all
from server.models.catalog_model import CatalogModel
from server.models.system_config_model import SystemConfigModel


class RecipeModel:
    """Handles unstructured recipes and Python-side pantry ingredient matching."""

    BASIC_STAPLE_CODES: FrozenSet[str] = frozenset({"TP014", "TP015", "TP016"})
    BASIC_STAPLE_NAMES: FrozenSet[str] = frozenset(
        {"hành tỏi khô", "dầu đậu nành", "dầu ăn", "nước mắm"}
    )

    def __init__(
        self,
        config_model: Optional[SystemConfigModel] = None,
        catalog_model: Optional[CatalogModel] = None,
    ) -> None:
        self.config_model = config_model or SystemConfigModel()
        self.catalog_model = catalog_model or CatalogModel()

    @staticmethod
    def _parse_ingredients(raw_ingredients: Any) -> List[str]:
        if isinstance(raw_ingredients, list):
            return [str(x).strip() for x in raw_ingredients if str(x).strip()]
        if not raw_ingredients:
            return []
        raw_str = str(raw_ingredients).strip()
        try:
            parsed = json.loads(raw_str)
            if isinstance(parsed, list):
                return [str(x).strip() for x in parsed if str(x).strip()]
        except Exception:
            pass
        return [item.strip() for item in raw_str.split(",") if item.strip()]

    @classmethod
    def _is_basic_staple(cls, token: str, resolved_name: str = "") -> bool:
        upper_tok = token.strip().upper()
        if upper_tok in cls.BASIC_STAPLE_CODES:
            return True
        lower_name = (resolved_name or token).strip().lower()
        return any(staple in lower_name for staple in cls.BASIC_STAPLE_NAMES)

    def get_all_recipes(self) -> List[Dict[str, Any]]:
        """Fetch standalone recipes and parse required_ingredients JSON in Python."""
        rows = query_all(
            "SELECT recipe_id, recipe_name, required_ingredients, cooking_guide FROM recipes ORDER BY recipe_id;"
        )
        food_code_map = self.catalog_model.get_food_code_map()

        recipes: List[Dict[str, Any]] = []
        for row in rows:
            ing_tokens = self._parse_ingredients(row.get("required_ingredients"))
            ing_names: List[str] = []
            for tok in ing_tokens:
                food_meta = food_code_map.get(tok.upper())
                ing_names.append(food_meta["food_name"] if food_meta else tok)

            recipes.append(
                {
                    "recipe_id": int(row["recipe_id"]),
                    "recipe_name": row["recipe_name"],
                    "required_ingredients": ing_tokens,
                    "required_ingredient_names": ing_names,
                    "cooking_guide": row["cooking_guide"],
                }
            )
        return recipes

    def get_matching_recipes_for_food(
        self,
        food_code: str,
        food_name: str,
        recipes: Optional[List[Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        """Find recipes requiring the given food_code (or food_name fallback)."""
        all_recipes = recipes if recipes is not None else self.get_all_recipes()
        code_upper = (food_code or "").strip().upper()
        name_lower = (food_name or "").strip().lower()

        matched: List[Dict[str, Any]] = []
        for r in all_recipes:
            tokens = r.get("required_ingredients", [])
            is_match = False
            for tok in tokens:
                tok_str = str(tok).strip()
                if code_upper and tok_str.upper() == code_upper:
                    is_match = True
                    break
                tok_lower = tok_str.lower()
                if name_lower and (name_lower in tok_lower or tok_lower in name_lower):
                    is_match = True
                    break
            if is_match:
                matched.append(
                    {
                        "recipe_id": r["recipe_id"],
                        "recipe_name": r["recipe_name"],
                        "cooking_guide": r["cooking_guide"],
                    }
                )
        return matched

    def suggest_recipes(
        self,
        focus_item_id: Optional[int] = None,
        system_date: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Match recipes against active non-expired pantry items:
        - Parses required_ingredients JSON (food codes like TP007 or names).
        - Ignores basic staples (TP014, TP015, TP016) in core match coverage.
        - Applies +30% expiring bonus when at least one core ingredient is expiring soon.
        """
        config = self.config_model.get_config()
        ref_date = system_date or config["simulation_date"]
        warning_days = int(config.get("warning_days_threshold", 3))
        food_code_map = self.catalog_model.get_food_code_map()

        inventory_rows = query_all(
            """
            SELECT
                fi.item_id,
                fi.food_id,
                f.food_code,
                f.food_name,
                fi.expiration_date,
                fi.current_quantity,
                u.unit_name
            FROM food_items fi
            JOIN foods f ON fi.food_id = f.food_id
            JOIN units u ON fi.unit_id = u.unit_id
            WHERE fi.current_quantity > 0
              AND fi.status IN ('ACTIVE', 'Đang sử dụng')
            ORDER BY fi.expiration_date ASC, fi.import_date ASC, fi.item_id ASC;
            """
        )

        # Keep earliest-expiring (FEFO) active non-expired lot per food_code and food_name
        available_by_code: Dict[str, Dict[str, Any]] = {}
        available_by_name: Dict[str, Dict[str, Any]] = {}
        focus_food_code = ""
        focus_food_name = ""

        for it in inventory_rows:
            days = self.config_model.calculate_days_left(it["expiration_date"], ref_date)
            code_upper = str(it.get("food_code") or "").strip().upper()
            name_lower = str(it.get("food_name") or "").strip().lower()

            if focus_item_id is not None and int(it["item_id"]) == int(focus_item_id):
                focus_food_code = code_upper
                focus_food_name = name_lower

            if days < 0:
                continue  # Ignore expired lots

            priority = self.config_model.classify_fefo_priority(days, config)
            is_expiring = (priority == "Cao") or (days <= warning_days)
            is_fefo = is_expiring or (priority == "Trung bình")

            lot_info = {
                "item_id": int(it["item_id"]),
                "food_id": int(it["food_id"]),
                "food_code": code_upper,
                "food_name": it["food_name"],
                "days_remaining": days,
                "priority": priority,
                "is_urgent": is_expiring,
                "is_fefo": is_fefo,
                "current_quantity": float(it["current_quantity"]),
                "unit_name": it["unit_name"],
            }

            if code_upper and (
                code_upper not in available_by_code or days < available_by_code[code_upper]["days_remaining"]
            ):
                available_by_code[code_upper] = lot_info

            if name_lower and (
                name_lower not in available_by_name or days < available_by_name[name_lower]["days_remaining"]
            ):
                available_by_name[name_lower] = lot_info

        # Fallback if focus_item_id was expired or inactive: look up its food metadata
        if focus_item_id is not None and not focus_food_code and not focus_food_name:
            focus_row = query_all(
                """
                SELECT f.food_code, f.food_name
                FROM food_items fi
                JOIN foods f ON fi.food_id = f.food_id
                WHERE fi.item_id = ?;
                """,
                (int(focus_item_id),),
            )
            if focus_row:
                focus_food_code = str(focus_row[0].get("food_code") or "").strip().upper()
                focus_food_name = str(focus_row[0].get("food_name") or "").strip().lower()

        recipes = self.get_all_recipes()
        results: List[Dict[str, Any]] = []

        for r in recipes:
            tokens = r["required_ingredients"]

            # Check focus filter first if requested
            if focus_item_id is not None and (focus_food_code or focus_food_name):
                matches_focus = any(
                    (focus_food_code and tok.upper() == focus_food_code)
                    or (focus_food_name and (focus_food_name in tok.lower() or tok.lower() in focus_food_name))
                    for tok in tokens
                )
                if not matches_focus:
                    continue

            core_tokens: List[str] = []
            ignored_staples: List[str] = []
            for tok in tokens:
                food_meta = food_code_map.get(tok.upper())
                resolved_name = food_meta["food_name"] if food_meta else tok
                if self._is_basic_staple(tok, resolved_name):
                    ignored_staples.append(tok)
                else:
                    core_tokens.append(tok)

            # Edge case: recipe consists solely of staples
            eval_tokens = core_tokens if core_tokens else tokens

            matched_high_count = 0
            matched_fefo_count = 0
            core_ready_count = 0
            core_missing_count = 0

            matched_items: List[str] = []
            urgent_rescue_items: List[str] = []
            missing_items: List[str] = []
            ingredient_statuses: List[Dict[str, Any]] = []

            for tok in tokens:
                tok_upper = tok.upper()
                tok_lower = tok.lower()
                food_meta = food_code_map.get(tok_upper)
                display_name = food_meta["food_name"] if food_meta else tok
                is_staple = self._is_basic_staple(tok, display_name) and bool(core_tokens)

                matched_lot = available_by_code.get(tok_upper)
                if matched_lot is None:
                    name_key = next(
                        (k for k in available_by_name if k in tok_lower or tok_lower in k),
                        None,
                    )
                    if name_key is not None:
                        matched_lot = available_by_name[name_key]

                if matched_lot is not None:
                    if not is_staple:
                        core_ready_count += 1
                        if matched_lot["is_urgent"]:
                            matched_high_count += 1
                            urgent_rescue_items.append(matched_lot["food_name"])
                        if matched_lot["is_fefo"]:
                            matched_fefo_count += 1
                    matched_items.append(matched_lot["food_name"])
                    ingredient_statuses.append(
                        {
                            "ingredient_code": tok if tok_upper in food_code_map else None,
                            "ingredient_name": display_name,
                            "is_staple": is_staple,
                            "availability": (
                                "Gia vị cơ bản (có sẵn)"
                                if is_staple
                                else ("Có sẵn - Ưu tiên cao" if matched_lot["is_urgent"] else "Có sẵn")
                            ),
                            "matched_item_id": matched_lot["item_id"],
                            "matched_food_name": matched_lot["food_name"],
                            "days_remaining": matched_lot["days_remaining"],
                            "priority": matched_lot["priority"],
                        }
                    )
                else:
                    if not is_staple:
                        core_missing_count += 1
                        missing_items.append(display_name)
                    ingredient_statuses.append(
                        {
                            "ingredient_code": tok if tok_upper in food_code_map else None,
                            "ingredient_name": display_name,
                            "is_staple": is_staple,
                            "availability": "Gia vị cơ bản (bỏ qua)" if is_staple else "Thiếu",
                            "matched_item_id": None,
                        }
                    )

            total_core = len(eval_tokens)
            base_match_pct = (core_ready_count / total_core) * 100.0 if total_core > 0 else 0.0
            expiring_bonus_applied = matched_high_count > 0
            expiring_bonus_pct = 30.0 if expiring_bonus_applied else 0.0
            match_score = round(
                base_match_pct * 1.30 if expiring_bonus_applied else base_match_pct,
                2,
            )

            results.append(
                {
                    "recipe_id": r["recipe_id"],
                    "recipe_name": r["recipe_name"],
                    "match_score": match_score,
                    "score": match_score,
                    "base_match_pct": round(base_match_pct, 2),
                    "expiring_bonus_applied": expiring_bonus_applied,
                    "expiring_bonus_pct": expiring_bonus_pct,
                    "ignored_staples": ignored_staples,
                    "total_required": total_core,
                    "total_ingredients_raw": len(tokens),
                    "ready_count": core_ready_count,
                    "missing_count": core_missing_count,
                    "matched_high_priority_count": matched_high_count,
                    "matched_fefo_count": matched_fefo_count,
                    "urgent_rescue_ingredients": urgent_rescue_items,
                    "matched_ingredients": matched_items,
                    "missing_ingredients": missing_items,
                    "ingredient_statuses": ingredient_statuses,
                    "can_cook_now": core_missing_count == 0,
                    "required_ingredients": tokens,
                    "cooking_guide": r["cooking_guide"],
                }
            )

        results.sort(
            key=lambda x: (
                x["match_score"],
                x["matched_high_priority_count"],
                x["matched_fefo_count"],
                x["ready_count"],
                -x["missing_count"],
                -x["recipe_id"],
            ),
            reverse=True,
        )
        return results
