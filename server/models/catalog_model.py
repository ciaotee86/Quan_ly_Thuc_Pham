"""
server/models/catalog_model.py
============================================================================
Domain Model for reference catalogs:
`categories`, `units`, `storage_locations`, and `foods`.
Computes server-side `reference_counts` so clients never read SQLite directly.
============================================================================
"""

from __future__ import annotations

from typing import Any, Dict, List

from server.database import query_all


class CatalogModel:
    """Manages catalog entities and computes foreign-key reference counts."""

    def get_reference_counts(self) -> Dict[str, Dict[int, int]]:
        """Compute reference counts for categories, units, and storage_locations."""
        cat_rows = query_all(
            "SELECT category_id, COUNT(*) AS cnt FROM foods GROUP BY category_id;"
        )
        unit_rows = query_all(
            "SELECT unit_id, COUNT(*) AS cnt FROM food_items GROUP BY unit_id;"
        )
        loc_rows = query_all(
            "SELECT location_id, COUNT(*) AS cnt FROM food_items GROUP BY location_id;"
        )
        food_rows = query_all(
            "SELECT food_id, COUNT(*) AS cnt FROM food_items GROUP BY food_id;"
        )

        return {
            "categories": {int(r["category_id"]): int(r["cnt"]) for r in cat_rows},
            "units": {int(r["unit_id"]): int(r["cnt"]) for r in unit_rows},
            "locations": {int(r["location_id"]): int(r["cnt"]) for r in loc_rows},
            "foods": {int(r["food_id"]): int(r["cnt"]) for r in food_rows},
        }

    def get_catalogs(self) -> Dict[str, Any]:
        """Return full catalogs bundle with server-computed reference_counts."""
        categories = query_all("SELECT * FROM categories ORDER BY category_id;")
        locations = query_all("SELECT * FROM storage_locations ORDER BY location_id;")
        units = query_all("SELECT * FROM units ORDER BY unit_id;")
        foods = query_all(
            """
            SELECT f.*, c.category_name
            FROM foods f
            LEFT JOIN categories c ON f.category_id = c.category_id
            ORDER BY f.food_name;
            """
        )

        ref_counts = self.get_reference_counts()

        for cat in categories:
            cat["reference_count"] = ref_counts["categories"].get(int(cat["category_id"]), 0)
        for unit in units:
            unit["reference_count"] = ref_counts["units"].get(int(unit["unit_id"]), 0)
        for loc in locations:
            loc["reference_count"] = ref_counts["locations"].get(int(loc["location_id"]), 0)
        for food in foods:
            food["reference_count"] = ref_counts["foods"].get(int(food["food_id"]), 0)

        return {
            "categories": categories,
            "locations": locations,
            "storage_locations": locations,
            "units": units,
            "foods": foods,
            "reference_counts": ref_counts,
        }

    def get_metadata(self) -> Dict[str, Any]:
        """Return lightweight metadata lists plus reference_counts."""
        ref_counts = self.get_reference_counts()
        categories = query_all("SELECT category_id, category_name FROM categories ORDER BY category_id;")
        locations = query_all(
            "SELECT location_id, location_name, area_type FROM storage_locations ORDER BY location_id;"
        )
        units = query_all("SELECT unit_id, unit_name FROM units ORDER BY unit_id;")
        foods = query_all(
            "SELECT food_id, food_code, food_name, category_id FROM foods ORDER BY food_name;"
        )

        for cat in categories:
            cat["reference_count"] = ref_counts["categories"].get(int(cat["category_id"]), 0)
        for unit in units:
            unit["reference_count"] = ref_counts["units"].get(int(unit["unit_id"]), 0)
        for loc in locations:
            loc["reference_count"] = ref_counts["locations"].get(int(loc["location_id"]), 0)

        return {
            "categories": categories,
            "locations": locations,
            "units": units,
            "foods": foods,
            "reference_counts": ref_counts,
        }

    def get_food_code_map(self) -> Dict[str, Dict[str, Any]]:
        """Map uppercase food_code -> food metadata for recipe ingredient resolution."""
        foods: List[Dict[str, Any]] = query_all(
            "SELECT food_id, food_code, food_name, category_id FROM foods;"
        )
        return {str(f["food_code"]).strip().upper(): f for f in foods if f.get("food_code")}
