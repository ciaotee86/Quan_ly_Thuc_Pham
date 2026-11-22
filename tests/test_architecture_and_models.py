"""
Verification suite for the 4 architectural invariants and Model/Controller/Schema alignment.

Tests:
1. Invariant 1 & 2: Clients communicate strictly via Server Request/Response (no direct DB helpers),
   `server/database.py` contains no HTTP/socket server routing, and `run_server.bat` launches `server/tcp_server.py`.
2. Invariant 3: Model layer owns all SQL & data processing; `tcp_server.py` and `core_services.py`
   contain zero direct `sqlite3` / `server.database` imports and zero raw SQL; functional tests for
   `SystemConfigModel`, `CatalogModel`, `FoodInventoryModel`, `RecipeModel`, and `tcp_server._dispatch`
   using an isolated temporary SQLite database.
3. Invariant 4: Unstructured tables (`recipes`, `system_settings`) have zero SQLite foreign keys,
   SQL views (`view_alerts`, `view_fefo_recommendations`) do not reference them, and frontend
   `SEED_RECIPES` entries carry no non-null `food_id` FK links.
"""

from __future__ import annotations

import ast
import json
import os
import re
import shutil
import socket
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Iterable

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

DATABASE_DIR = PROJECT_ROOT / "database"
SCHEMA_SQL_PATH = DATABASE_DIR / "schema.sql"
SEED_SQL_PATH = DATABASE_DIR / "seed_data.sql"
REPO_SEED_DB_PATH = DATABASE_DIR / "food_management.db"

SERVER_DIR = PROJECT_ROOT / "server"
DATABASE_PY_PATH = SERVER_DIR / "database.py"
CORE_SERVICES_PY_PATH = SERVER_DIR / "core_services.py"
TCP_SERVER_PY_PATH = SERVER_DIR / "tcp_server.py"
RUN_SERVER_BAT_PATH = PROJECT_ROOT / "run_server.bat"

UI_ROOT = PROJECT_ROOT / "giaodiendukien"
DESKTOP_SRC_DIR = UI_ROOT / "desktop-server" / "src"
MOBILE_SRC_DIR = UI_ROOT / "mobile-client" / "src"
SQL_SEED_TS_PATH = UI_ROOT / "shared-sim" / "src" / "data" / "sql-seed-dataset.ts"


def _iter_source_files(root: Path, extensions: tuple[str, ...]) -> Iterable[Path]:
    for path in sorted(root.rglob("*")):
        if path.is_file() and path.suffix.lower() in extensions:
            yield path


def _collect_imported_modules(tree: ast.AST) -> set[str]:
    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                modules.add(alias.name)
        elif isinstance(node, ast.ImportFrom):
            mod = node.module or ""
            if mod:
                modules.add(mod)
                for alias in node.names:
                    modules.add(f"{mod}.{alias.name}")
    return modules


def _collect_string_literals(tree: ast.AST) -> list[str]:
    literals: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            literals.append(node.value)
    return literals


class IsolatedDbTestCase(unittest.TestCase):
    """Base TestCase that redirects `server.database.db` to an isolated temp SQLite file."""

    def setUp(self) -> None:
        self._repo_db_stat_before = (
            REPO_SEED_DB_PATH.stat().st_mtime_ns if REPO_SEED_DB_PATH.exists() else None
        )
        self.temp_dir = tempfile.TemporaryDirectory()
        self.temp_path = Path(self.temp_dir.name)

        shutil.copy2(SCHEMA_SQL_PATH, self.temp_path / "schema.sql")
        shutil.copy2(SEED_SQL_PATH, self.temp_path / "seed_data.sql")
        self.temp_db_path = self.temp_path / "isolated_food_management.db"

        import server.database as database_mod

        self.db_manager = database_mod.db
        self.db_manager.configure(db_path=str(self.temp_db_path))

    def tearDown(self) -> None:
        # Verify the repository seed DB file was never touched during the test.
        if self._repo_db_stat_before is not None and REPO_SEED_DB_PATH.exists():
            self.assertEqual(
                REPO_SEED_DB_PATH.stat().st_mtime_ns,
                self._repo_db_stat_before,
                "Repository database/food_management.db must remain untouched by tests",
            )
        self.temp_dir.cleanup()


class TestArchitecturalInvariantsStatic(unittest.TestCase):
    """Static AST & source assertions for Invariants 1, 2, 3, and 4."""

    def test_invariant_1_and_2_clients_have_no_direct_db_access(self) -> None:
        forbidden_tokens = (
            "getDatabaseSnapshot",
            "getLocalServerNode",
            "buildFoodLotViews",
            "'DESKTOP->DB'",
            '"DESKTOP->DB"',
        )
        client_dirs = (DESKTOP_SRC_DIR, MOBILE_SRC_DIR)
        scanned_count = 0
        violations: list[str] = []

        for client_dir in client_dirs:
            self.assertTrue(client_dir.is_dir(), f"Missing client src dir: {client_dir}")
            for file_path in _iter_source_files(client_dir, (".ts", ".tsx", ".js", ".jsx")):
                scanned_count += 1
                content = file_path.read_text(encoding="utf-8")
                for token in forbidden_tokens:
                    if token in content:
                        violations.append(f"{file_path}: found forbidden token {token}")

        self.assertGreater(scanned_count, 0, "Expected at least one client source file to scan")
        self.assertEqual(violations, [], "\n".join(violations))

    def test_invariant_1_and_2_database_py_has_no_socket_or_http_routing(self) -> None:
        source = DATABASE_PY_PATH.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(DATABASE_PY_PATH))

        imported = _collect_imported_modules(tree)
        self.assertNotIn("socket", imported)
        self.assertFalse(any(m.startswith("socket.") for m in imported))

        defined_names = {
            node.name
            for node in ast.walk(tree)
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
        }
        self.assertNotIn("start_test_tcp_server", defined_names)
        self.assertNotIn("route_request", defined_names)

        attr_chains: list[str] = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
                attr_chains.append(f"{node.value.id}.{node.attr}")
        self.assertNotIn("socket.socket", attr_chains)

        self.assertNotIn("start_test_tcp_server", source)
        self.assertNotIn("route_request", source)

    def test_invariant_1_and_2_run_server_bat_launches_tcp_server(self) -> None:
        bat_content = RUN_SERVER_BAT_PATH.read_text(encoding="utf-8")
        self.assertRegex(
            bat_content,
            r"(?im)^\s*python\s+server[\\/]+tcp_server\.py\b",
        )

    def test_invariant_3_tcp_server_and_core_services_isolation(self) -> None:
        raw_sql_pattern = re.compile(
            r"(?is)\b(?:SELECT\s+.+?\s+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+(?:TABLE|VIEW|INDEX)|PRAGMA\s+\w+)\b"
        )

        # tcp_server.py must not import sqlite3 or server.database and must have zero raw SQL.
        tcp_source = TCP_SERVER_PY_PATH.read_text(encoding="utf-8")
        tcp_tree = ast.parse(tcp_source, filename=str(TCP_SERVER_PY_PATH))
        tcp_imports = _collect_imported_modules(tcp_tree)

        self.assertNotIn("sqlite3", tcp_imports)
        self.assertNotIn("server.database", tcp_imports)
        self.assertNotIn("database", tcp_imports)
        self.assertFalse(any(m.startswith("server.database.") for m in tcp_imports))

        for literal in _collect_string_literals(tcp_tree):
            self.assertIsNone(
                raw_sql_pattern.search(literal),
                f"Unexpected raw SQL in tcp_server.py: {literal!r}",
            )

        # core_services.py must not import sqlite3 or server.database and must have zero raw SQL.
        core_source = CORE_SERVICES_PY_PATH.read_text(encoding="utf-8")
        core_tree = ast.parse(core_source, filename=str(CORE_SERVICES_PY_PATH))
        core_imports = _collect_imported_modules(core_tree)

        self.assertNotIn("sqlite3", core_imports)
        self.assertNotIn("server.database", core_imports)
        self.assertNotIn("database", core_imports)
        self.assertFalse(any(m.startswith("server.database.") for m in core_imports))

        for literal in _collect_string_literals(core_tree):
            self.assertIsNone(
                raw_sql_pattern.search(literal),
                f"Unexpected raw SQL in core_services.py: {literal!r}",
            )

    def test_invariant_4_shared_sim_seed_recipes_have_no_non_null_food_id_fk(self) -> None:
        ts_content = SQL_SEED_TS_PATH.read_text(encoding="utf-8")
        match = re.search(
            r"export const SEED_RECIPES\s*:\s*Recipe\[\]\s*=\s*\[(?P<body>.*?)\n\];",
            ts_content,
            flags=re.DOTALL,
        )
        self.assertIsNotNone(match, "Could not locate SEED_RECIPES in sql-seed-dataset.ts")
        recipes_block = match.group("body")

        food_id_values = re.findall(r"\bfood_id\s*:\s*([^,\s}]+)", recipes_block)
        self.assertGreater(len(food_id_values), 0, "Expected recipe ingredient food_id entries")
        non_null = [val for val in food_id_values if val != "null"]
        self.assertEqual(
            non_null,
            [],
            f"Found non-null food_id FK links in SEED_RECIPES: {non_null}",
        )


class TestDatabaseSchemaInvariant4(IsolatedDbTestCase):
    """Invariant 4 SQLite schema verification in an isolated temp database."""

    def test_unstructured_tables_have_zero_foreign_keys_and_views_do_not_reference_them(self) -> None:
        conn = sqlite3.connect(str(self.temp_db_path))
        try:
            recipes_fks = conn.execute("PRAGMA foreign_key_list('recipes');").fetchall()
            settings_fks = conn.execute("PRAGMA foreign_key_list('system_settings');").fetchall()

            self.assertEqual(recipes_fks, [])
            self.assertEqual(settings_fks, [])

            rows = conn.execute(
                """
                SELECT name, sql
                FROM sqlite_master
                WHERE type = 'view'
                  AND name IN ('view_alerts', 'view_fefo_recommendations')
                ORDER BY name;
                """
            ).fetchall()

            views_by_name = {name: sql for name, sql in rows}
            self.assertEqual(set(views_by_name.keys()), {"view_alerts", "view_fefo_recommendations"})

            for view_name, view_sql in views_by_name.items():
                lower_sql = (view_sql or "").lower()
                self.assertNotIn(
                    "system_settings",
                    lower_sql,
                    f"{view_name} must not reference unstructured table system_settings",
                )
                self.assertNotIn(
                    "recipes",
                    lower_sql,
                    f"{view_name} must not reference unstructured table recipes",
                )
        finally:
            conn.close()


class TestSystemConfigModel(IsolatedDbTestCase):
    """Functional tests for `server.models.SystemConfigModel`."""

    def test_read_update_and_reject_invalid_simulation_date(self) -> None:
        from server.models import SystemConfigModel

        model = SystemConfigModel()

        self.assertEqual(model.get_simulation_date(), "2026-11-15")
        cfg = model.get_config()
        self.assertEqual(cfg["simulation_date"], "2026-11-15")
        self.assertEqual(cfg["warning_days_threshold"], 3)
        self.assertEqual(cfg["fefo_high_days"], 2)
        self.assertEqual(cfg["fefo_medium_days"], 5)

        updated = model.set_simulation_date("2026-11-18")
        self.assertTrue(updated["ok"])
        self.assertEqual(updated["simulation_date"], "2026-11-18")
        self.assertEqual(model.get_simulation_date(), "2026-11-18")

        with self.assertRaises(ValueError):
            model.set_simulation_date("invalid-date")

        # Value in DB stays valid after rejected update.
        self.assertEqual(model.get_simulation_date(), "2026-11-18")


class TestCatalogModel(IsolatedDbTestCase):
    """Functional tests for `server.models.CatalogModel`."""

    def test_catalogs_and_exact_hardcoded_reference_counts(self) -> None:
        from server.models import CatalogModel

        model = CatalogModel()
        bundle = model.get_catalogs()

        self.assertEqual(len(bundle["categories"]), 20)
        self.assertEqual(len(bundle["units"]), 20)
        self.assertEqual(len(bundle["locations"]), 20)
        self.assertEqual(len(bundle["foods"]), 25)

        expected_category_refs = {
            1: 2,
            2: 2,
            3: 1,
            4: 3,
            5: 2,
            6: 1,
            7: 2,
            8: 1,
            10: 3,
            11: 1,
            12: 1,
            13: 2,
            14: 1,
            15: 1,
            16: 1,
            17: 1,
        }
        expected_unit_refs = {1: 6, 3: 4, 4: 4, 5: 2, 6: 1, 7: 5, 8: 1, 10: 1, 17: 1}
        expected_location_refs = {
            1: 2,
            2: 3,
            3: 1,
            4: 2,
            5: 2,
            6: 1,
            7: 1,
            9: 2,
            11: 2,
            12: 1,
            14: 2,
            15: 1,
            16: 2,
            17: 1,
            18: 1,
            20: 1,
        }
        expected_food_refs = {food_id: 1 for food_id in range(1, 26)}

        ref_counts = bundle["reference_counts"]
        self.assertEqual(ref_counts["categories"], expected_category_refs)
        self.assertEqual(ref_counts["units"], expected_unit_refs)
        self.assertEqual(ref_counts["locations"], expected_location_refs)
        self.assertEqual(ref_counts["foods"], expected_food_refs)

        cat_by_id = {c["category_id"]: c for c in bundle["categories"]}
        self.assertEqual(cat_by_id[4]["reference_count"], 3)
        self.assertEqual(cat_by_id[9]["reference_count"], 0)


class TestFoodInventoryModel(IsolatedDbTestCase):
    """Functional tests for `server.models.FoodInventoryModel`."""

    def test_fefo_ordering_and_priority_counts(self) -> None:
        from server.models import FoodInventoryModel

        model = FoodInventoryModel()
        res = model.get_fefo_recommendations()

        self.assertTrue(res["ok"])
        self.assertEqual(res["reference_date"], "2026-11-15")
        self.assertEqual(res["count"], 25)
        self.assertEqual(res["expired_excluded_count"], 0)
        self.assertEqual(
            res["counts_by_priority"],
            {"Cao": 2, "Trung bình": 5, "Thấp": 18},
        )

        top_5_ids = [item["item_id"] for item in res["items"][:5]]
        # item 1 (2026-11-16), item 2 (2026-11-17), item 3 (2026-11-18),
        # tie on 2026-11-19 & import 2026-11-12: item 5 (qty 2.0) before item 4 (qty 6.0)
        self.assertEqual(top_5_ids, [1, 2, 3, 5, 4])
        self.assertEqual(res["items"][0]["priority_level"], "Cao")
        self.assertEqual(res["items"][0]["days_remaining"], 1)
        self.assertEqual(res["items"][2]["priority_level"], "Trung bình")
        self.assertEqual(res["items"][2]["days_remaining"], 3)

        # Advance date to 2026-11-18: items 1 and 2 become expired and excluded by default.
        shifted = model.get_fefo_recommendations(system_date="2026-11-18")
        self.assertEqual(shifted["expired_excluded_count"], 2)
        self.assertEqual(shifted["count"], 23)
        self.assertEqual(shifted["items"][0]["item_id"], 3)

    def test_use_food_atomic_decrement_and_audit_row(self) -> None:
        from server.models import FoodInventoryModel

        model = FoodInventoryModel()
        res = model.use_food(item_id=1, quantity=0.4, reason="Uống buổi sáng", actor_device="Mobile")

        self.assertTrue(res["ok"])
        self.assertEqual(res["item_id"], 1)
        self.assertEqual(res["used_quantity"], 0.4)
        self.assertEqual(res["remaining_quantity"], 0.6)
        self.assertEqual(res["status"], "ACTIVE")

        audit_rows = model.get_audit_log(item_id=1, limit=5)
        latest = audit_rows[0]
        self.assertEqual(latest["action_type"], "USE")
        self.assertEqual(latest["change_quantity"], -0.4)
        self.assertEqual(latest["remaining_quantity"], 0.6)
        self.assertEqual(latest["reason"], "Uống buổi sáng")

        # Deplete completely -> CONSUMED
        res2 = model.use_food(item_id=1, quantity=0.6, reason="Dùng nốt")
        self.assertEqual(res2["remaining_quantity"], 0.0)
        self.assertEqual(res2["status"], "CONSUMED")

        # Over-consumption raises ValueError
        with self.assertRaises(ValueError):
            model.use_food(item_id=2, quantity=99.0)

    def test_add_adjust_delete_audit_trail(self) -> None:
        from server.models import FoodInventoryModel

        model = FoodInventoryModel()

        added = model.add_food_item(
            food_id=2,
            location_id=3,
            unit_id=1,
            quantity=2.5,
            expiration_date="2026-12-05",
            min_threshold=0.5,
            notes="Thịt mới mua",
        )
        self.assertTrue(added["ok"])
        new_id = added["item_id"]
        self.assertEqual(new_id, 26)
        self.assertEqual(added["status"], "ACTIVE")
        self.assertEqual(added["import_date"], "2026-11-15")

        adjusted = model.adjust_food(item_id=new_id, new_quantity=1.25, reason="Cân lại")
        self.assertTrue(adjusted["ok"])
        self.assertEqual(adjusted["previous_quantity"], 2.5)
        self.assertEqual(adjusted["new_quantity"], 1.25)
        self.assertEqual(adjusted["diff_quantity"], -1.25)
        self.assertEqual(adjusted["status"], "ACTIVE")

        deleted = model.delete_food_item(item_id=new_id, reason="Bỏ vì rã đông hỏng")
        self.assertTrue(deleted["ok"])
        self.assertEqual(deleted["status"], "DISCARDED")

        audit = model.get_audit_log(item_id=new_id, limit=10)
        self.assertEqual([row["action_type"] for row in audit], ["DELETE", "ADJUST", "IMPORT"])
        self.assertEqual(audit[0]["remaining_quantity"], 0.0)
        self.assertEqual(audit[1]["change_quantity"], -1.25)
        self.assertEqual(audit[2]["change_quantity"], 2.5)

    def test_alerts_and_three_aisle_shopping_list(self) -> None:
        from server.models import FoodInventoryModel

        model = FoodInventoryModel()
        alerts = model.get_alerts(system_date="2026-11-15")

        self.assertTrue(alerts["ok"])
        self.assertEqual(
            alerts["counts"],
            {
                "expired": 0,
                "expiring_soon": 3,
                "low_stock": 3,
                "total_alerts": 6,
                "unique_items": 5,
            },
        )
        self.assertEqual([i["item_id"] for i in alerts["expiring_soon_items"]], [1, 2, 3])
        self.assertEqual([i["item_id"] for i in alerts["low_stock_items"]], [1, 10, 12])

        # Deplete a pantry_dry item (item_id=20: Mì gói Hảo Hảo, min_threshold=5.0)
        # and add+deplete a frozen item (category 9: Đồ đông lạnh ăn liền, location 10: Ngăn đông tầng 1)
        model.adjust_food(item_id=20, new_quantity=2.0, reason="Ăn bớt mì")

        with self.db_manager.transaction() as conn:
            conn.execute(
                """
                INSERT INTO foods (food_id, food_code, food_name, category_id, brand, image_url, description)
                VALUES (26, 'TP026', 'Há cảo đông lạnh', 9, 'CP', '', 'Đồ đông lạnh');
                """
            )
        frozen_lot = model.add_food_item(
            food_id=26,
            location_id=10,
            unit_id=7,
            quantity=1.0,
            expiration_date="2027-01-01",
            min_threshold=2.0,
            notes="Đồ đông lạnh",
        )
        self.assertEqual(frozen_lot["item_id"], 26)

        shopping = model.get_shopping_list(system_date="2026-11-15")
        self.assertTrue(shopping["ok"])
        self.assertEqual([a["aisle_key"] for a in shopping["aisles"]], ["fresh_chilled", "frozen", "pantry_dry"])

        aisles_by_key = {a["aisle_key"]: a for a in shopping["aisles"]}
        self.assertEqual(
            [it["food_code"] for it in aisles_by_key["fresh_chilled"]["items"]],
            ["TP019", "TP018", "TP001"],
        )
        self.assertEqual(
            [it["food_code"] for it in aisles_by_key["frozen"]["items"]],
            ["TP026"],
        )
        self.assertEqual(
            [it["food_code"] for it in aisles_by_key["pantry_dry"]["items"]],
            ["TP020"],
        )
        self.assertEqual(shopping["total_items"], 5)


class TestRecipeModel(IsolatedDbTestCase):
    """Functional tests for `server.models.RecipeModel`."""

    def test_parses_json_ingredients_matches_pantry_excludes_staples_and_boosts_expiring(self) -> None:
        from server.models import FoodInventoryModel, RecipeModel

        recipe_model = RecipeModel()
        inv_model = FoodInventoryModel(recipe_model=recipe_model)

        all_recipes = recipe_model.get_all_recipes()
        self.assertEqual(len(all_recipes), 20)
        self.assertEqual(all_recipes[0]["recipe_name"], "Bò Xào Hành Tây Cần Tỏi")
        self.assertEqual(
            all_recipes[0]["required_ingredients"],
            ["TP007", "TP010", "TP014", "TP015"],
        )

        suggestions = recipe_model.suggest_recipes(system_date="2026-11-15")
        by_id = {r["recipe_id"]: r for r in suggestions}

        # Recipe 1: ["TP007", "TP010", "TP014", "TP015"]
        # TP014 & TP015 are staples -> ignored_staples; core = TP007 (3 days left <= warning 3 -> urgent), TP010
        r1 = by_id[1]
        self.assertEqual(r1["ignored_staples"], ["TP014", "TP015"])
        self.assertEqual(r1["total_required"], 2)
        self.assertEqual(r1["ready_count"], 2)
        self.assertEqual(r1["missing_count"], 0)
        self.assertTrue(r1["can_cook_now"])
        self.assertTrue(r1["expiring_bonus_applied"])
        self.assertEqual(r1["expiring_bonus_pct"], 30.0)
        self.assertEqual(r1["base_match_pct"], 100.0)
        self.assertEqual(r1["match_score"], 130.0)

        # Recipe 2: ["TP006", "TP009", "TP014", "TP015"] -> TP006 (11d), TP009 (4d) -> not urgent -> 100.0
        r2 = by_id[2]
        self.assertEqual(r2["ignored_staples"], ["TP014", "TP015"])
        self.assertFalse(r2["expiring_bonus_applied"])
        self.assertEqual(r2["expiring_bonus_pct"], 0.0)
        self.assertEqual(r2["match_score"], 100.0)

        # Remove staples TP014 (item 16), TP015 (item 22), TP016 (item 23) from stock -> zero penalty on Recipe 1 & 3
        inv_model.delete_food_item(16, "Hết tỏi")
        inv_model.delete_food_item(22, "Hết dầu ăn")
        inv_model.delete_food_item(23, "Hết nước mắm")

        after_staple_removal = {
            r["recipe_id"]: r for r in recipe_model.suggest_recipes(system_date="2026-11-15")
        }
        self.assertEqual(after_staple_removal[1]["match_score"], 130.0)
        self.assertTrue(after_staple_removal[1]["can_cook_now"])
        self.assertEqual(after_staple_removal[3]["match_score"], 100.0)
        self.assertTrue(after_staple_removal[3]["can_cook_now"])

        # Focus item_id=3 (TP007 - Thịt bò phi lê): returns recipes 1, 13, 14, 18
        focused = recipe_model.suggest_recipes(focus_item_id=3, system_date="2026-11-15")
        self.assertEqual({r["recipe_id"] for r in focused}, {1, 13, 14, 18})


class TestTcpServerDispatch(IsolatedDbTestCase):
    """Controller tests for `server.tcp_server._dispatch` and HTTP/JSON error boundaries."""

    def test_dispatch_endpoints_and_4xx_errors(self) -> None:
        from server import tcp_server

        status, body = tcp_server._dispatch("GET", "/api/fefo", {}, {})
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])
        self.assertEqual(body["count"], 25)

        status, body = tcp_server._dispatch("GET", "/api/catalogs", {}, {})
        self.assertEqual(status, 200)
        self.assertEqual(len(body["categories"]), 20)
        self.assertEqual(body["reference_counts"]["categories"][4], 3)

        status, body = tcp_server._dispatch("GET", "/api/shopping-list", {}, {})
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])
        self.assertEqual(len(body["aisles"]), 3)

        status, body = tcp_server._dispatch("GET", "/api/recipes/suggest", {}, {})
        self.assertEqual(status, 200)
        self.assertIsInstance(body, list)
        self.assertEqual(len(body), 20)
        self.assertEqual(body[0]["match_score"], 130.0)

        status, body = tcp_server._dispatch(
            "POST",
            "/api/food/add",
            {},
            {
                "food_id": 1,
                "location_id": 9,
                "unit_id": 4,
                "quantity": 2.0,
                "expiration_date": "2026-12-01",
                "min_threshold": 1.0,
                "notes": "API add test",
            },
        )
        self.assertEqual(status, 201)
        self.assertTrue(body["ok"])
        self.assertEqual(body["item_id"], 26)

        status, body = tcp_server._dispatch(
            "POST",
            "/api/food/use",
            {},
            {"item_id": 26, "quantity": 0.5, "reason": "API use test", "actor_device": "QA"},
        )
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])
        self.assertEqual(body["remaining_quantity"], 1.5)

        # Wrong HTTP method -> 405
        status, body = tcp_server._dispatch("POST", "/api/fefo", {}, {})
        self.assertEqual(status, 405)
        self.assertEqual(body["expected_method"], "GET")

        # Unknown route -> 404
        status, body = tcp_server._dispatch("GET", "/api/unknown-route", {}, {})
        self.assertEqual(status, 404)
        self.assertEqual(body["path"], "/api/unknown-route")

        # Invalid JSON body -> HttpRequestError(400) with no SQLite internals
        with self.assertRaises(tcp_server.HttpRequestError) as ctx:
            tcp_server._parse_json_body(b"{not-valid-json")
        self.assertEqual(ctx.exception.status, 400)
        self.assertNotIn("sqlite", str(ctx.exception).lower())

        # Full socketpair roundtrip with invalid JSON does not expose SQLite internals
        client_end, server_end = socket.socketpair()
        try:
            raw_request = (
                b"POST /api/food/add HTTP/1.1\r\n"
                b"Host: localhost\r\n"
                b"Content-Type: application/json\r\n"
                b"Content-Length: 10\r\n"
                b"\r\n"
                b"{bad_json!"
            )
            client_end.sendall(raw_request)
            tcp_server._handle_client(server_end, ("127.0.0.1", 50000))
            raw_response = client_end.recv(8192).decode("utf-8")
        finally:
            client_end.close()
            try:
                server_end.close()
            except OSError:
                pass

        self.assertTrue(raw_response.startswith("HTTP/1.1 400 Bad Request\r\n"))
        _, resp_body_str = raw_response.split("\r\n\r\n", 1)
        resp_json = json.loads(resp_body_str)
        self.assertIn("error", resp_json)
        lower_resp = raw_response.lower()
        for leak in ("sqlite", "select ", "insert ", "traceback", "food_management.db"):
            self.assertNotIn(leak, lower_resp)


if __name__ == "__main__":
    unittest.main()
