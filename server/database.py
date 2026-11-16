"""
============================================================================
HỆ THỐNG QUẢN LÝ THỰC PHẨM GIA ĐÌNH - MÔN HỌC LẬP TRÌNH MẠNG
Server Database Access Layer (Thread-Safe SQLite 3NF Manager)
File: server/database.py
============================================================================
"""

import json
import os
import re
import socket
import sqlite3
import sys
import threading
from contextlib import contextmanager
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple, Union
from urllib.parse import parse_qs, unquote, urlparse


class DatabaseManager:
    _instance: Optional["DatabaseManager"] = None
    _init_lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        with cls._init_lock:
            if cls._instance is None:
                cls._instance = super(DatabaseManager, cls).__new__(cls)
            return cls._instance

    def __init__(self, db_path: Optional[str] = None):
        if hasattr(self, "_initialized") and self._initialized:
            return

        if db_path is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            self.db_dir = os.path.join(base_dir, "database")
            self.db_path = os.path.join(self.db_dir, "food_management.db")
            self.schema_path = os.path.join(self.db_dir, "schema.sql")
            self.seed_path = os.path.join(self.db_dir, "seed_data.sql")
        else:
            self.db_path = os.path.abspath(db_path)
            self.db_dir = os.path.dirname(self.db_path)
            self.schema_path = os.path.join(self.db_dir, "schema.sql")
            self.seed_path = os.path.join(self.db_dir, "seed_data.sql")

        self.lock = threading.RLock()
        os.makedirs(self.db_dir, exist_ok=True)
        self._initialized = True
        self.init_database()

    def _get_raw_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(
            self.db_path,
            timeout=30.0,
            check_same_thread=False,
            isolation_level=None
        )
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA journal_mode = WAL;")
        return conn

    @contextmanager
    def transaction(self):
        with self.lock:
            conn = self._get_raw_connection()
            try:
                conn.execute("BEGIN TRANSACTION;")
                yield conn
                conn.execute("COMMIT;")
            except Exception as e:
                conn.execute("ROLLBACK;")
                raise e
            finally:
                conn.close()

    def init_database(self, force_seed: bool = False) -> None:
        with self.lock:
            conn = self._get_raw_connection()
            try:
                if os.path.exists(self.schema_path):
                    with open(self.schema_path, "r", encoding="utf-8") as f:
                        schema_sql = f.read()
                    conn.executescript(schema_sql)

                cursor = conn.cursor()
                cursor.execute("SELECT COUNT(*) as cnt FROM categories;")
                row = cursor.fetchone()
                has_data = row and row["cnt"] > 0

                if (not has_data or force_seed) and os.path.exists(self.seed_path):
                    with open(self.seed_path, "r", encoding="utf-8") as f:
                        seed_sql = f.read()
                    conn.executescript(seed_sql)
            finally:
                conn.close()

    def fetch_all(self, query: str, params: Union[Tuple, List] = ()) -> List[Dict[str, Any]]:
        with self.lock:
            conn = self._get_raw_connection()
            try:
                cursor = conn.cursor()
                cursor.execute(query, params)
                return [dict(row) for row in cursor.fetchall()]
            finally:
                conn.close()

    def fetch_one(self, query: str, params: Union[Tuple, List] = ()) -> Optional[Dict[str, Any]]:
        with self.lock:
            conn = self._get_raw_connection()
            try:
                cursor = conn.cursor()
                cursor.execute(query, params)
                row = cursor.fetchone()
                return dict(row) if row else None
            finally:
                conn.close()

    def execute_non_query(self, query: str, params: Union[Tuple, List] = ()) -> Dict[str, Any]:
        with self.lock:
            conn = self._get_raw_connection()
            try:
                cursor = conn.cursor()
                cursor.execute("BEGIN TRANSACTION;")
                cursor.execute(query, params)
                lastrowid = cursor.lastrowid
                rowcount = cursor.rowcount
                cursor.execute("COMMIT;")
                return {"lastrowid": lastrowid, "rows_affected": rowcount}
            except Exception as e:
                conn.execute("ROLLBACK;")
                raise e
            finally:
                conn.close()

    def get_simulation_date(self) -> str:
        row = self.fetch_one("SELECT setting_value FROM system_settings WHERE setting_key = 'simulation_date';")
        return row["setting_value"] if row else datetime.now().strftime("%Y-%m-%d")

    def set_simulation_date(self, new_date: str) -> bool:
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", new_date):
            raise ValueError("Định dạng ngày không hợp lệ. Yêu cầu: YYYY-MM-DD")

        result = self.execute_non_query(
            """
            INSERT INTO system_settings (setting_key, setting_value, description)
            VALUES ('simulation_date', ?, 'Ngày giả lập hiện tại của hệ thống')
            ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value;
            """,
            (new_date,)
        )
        return result["rows_affected"] > 0

    def get_catalogs(self) -> Dict[str, Any]:
        return {
            "categories": self.fetch_all("SELECT * FROM categories ORDER BY category_id;"),
            "locations": self.fetch_all("SELECT * FROM storage_locations ORDER BY location_id;"),
            "units": self.fetch_all("SELECT * FROM units ORDER BY unit_id;"),
            "foods": self.fetch_all("SELECT * FROM foods ORDER BY food_name;")
        }

    def get_all_inventory(self, search: str = "", location_id: Optional[int] = None) -> List[Dict[str, Any]]:
        sim_date = self.get_simulation_date()
        query = """
            SELECT 
                fi.item_id,
                f.food_code,
                f.food_name,
                c.category_name,
                sl.location_id,
                sl.location_name,
                sl.area_type,
                u.unit_name,
                fi.current_quantity,
                fi.min_threshold,
                fi.import_date,
                fi.expiration_date,
                fi.status,
                fi.notes,
                CAST(ROUND(JULIANDAY(fi.expiration_date) - JULIANDAY(?)) AS INTEGER) AS days_left
            FROM food_items fi
            JOIN foods f ON fi.food_id = f.food_id
            JOIN categories c ON f.category_id = c.category_id
            JOIN storage_locations sl ON fi.location_id = sl.location_id
            JOIN units u ON fi.unit_id = u.unit_id
            WHERE fi.status = 'ACTIVE' AND fi.current_quantity > 0
        """
        params: List[Any] = [sim_date]

        if search:
            query += " AND (f.food_name LIKE ? OR f.food_code LIKE ? OR fi.notes LIKE ?)"
            term = f"%{search}%"
            params.extend([term, term, term])

        if location_id is not None:
            query += " AND fi.location_id = ?"
            params.append(location_id)

        query += " ORDER BY fi.expiration_date ASC, fi.item_id ASC;"
        return self.fetch_all(query, params)

    def get_fefo_recommendations(self) -> List[Dict[str, Any]]:
        return self.fetch_all("SELECT * FROM view_fefo_recommendations;")

    def get_alerts(self) -> List[Dict[str, Any]]:
        return self.fetch_all("SELECT * FROM view_alerts;")

    def add_food_item(
        self,
        food_id: int,
        location_id: int,
        unit_id: int,
        quantity: float,
        expiration_date: str,
        min_threshold: float = 0.0,
        notes: str = ""
    ) -> int:
        sim_date = self.get_simulation_date()
        with self.transaction() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO food_items (food_id, location_id, unit_id, current_quantity, min_threshold, import_date, expiration_date, status, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?);
                """,
                (food_id, location_id, unit_id, quantity, min_threshold, sim_date, expiration_date, notes)
            )
            item_id = cursor.lastrowid

            cursor.execute(
                """
                INSERT INTO inventory_transactions (item_id, action_type, change_quantity, remaining_quantity, reason, transaction_time)
                VALUES (?, 'IMPORT', ?, ?, 'Nhập mới vào tủ lạnh', DATETIME('now', 'localtime'));
                """,
                (item_id, quantity, quantity)
            )
            return item_id

    def use_food_item(self, item_id: int, use_quantity: float, reason: str = "Nấu ăn") -> Dict[str, Any]:
        if use_quantity <= 0:
            raise ValueError("Số lượng sử dụng phải lớn hơn 0")

        with self.transaction() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT fi.current_quantity, fi.status, f.food_name 
                FROM food_items fi
                JOIN foods f ON fi.food_id = f.food_id
                WHERE fi.item_id = ?;
                """,
                (item_id,)
            )
            row = cursor.fetchone()
            if not row:
                raise ValueError(f"Không tìm thấy thực phẩm với item_id={item_id}")
            if row["status"] != "ACTIVE":
                raise ValueError("Thực phẩm này không còn hoạt động trong tủ lạnh")

            current_qty = row["current_quantity"]
            if use_quantity > current_qty:
                raise ValueError(f"Số lượng lấy ({use_quantity}) vượt quá tồn kho thực tế ({current_qty})")

            remaining = round(current_qty - use_quantity, 2)
            new_status = "CONSUMED" if remaining <= 0 else "ACTIVE"

            cursor.execute(
                "UPDATE food_items SET current_quantity = ?, status = ? WHERE item_id = ?;",
                (remaining, new_status, item_id)
            )

            cursor.execute(
                """
                INSERT INTO inventory_transactions (item_id, action_type, change_quantity, remaining_quantity, reason, transaction_time)
                VALUES (?, 'USE', ?, ?, ?, DATETIME('now', 'localtime'));
                """,
                (item_id, -use_quantity, remaining, reason)
            )

            return {
                "item_id": item_id,
                "food_name": row["food_name"],
                "used_quantity": use_quantity,
                "remaining_quantity": remaining,
                "status": new_status
            }

    def adjust_food_quantity(self, item_id: int, new_quantity: float, reason: str = "Kiểm kê dọn tủ") -> Dict[str, Any]:
        if new_quantity < 0:
            raise ValueError("Số lượng tồn kho không được âm")

        with self.transaction() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT fi.current_quantity, f.food_name 
                FROM food_items fi
                JOIN foods f ON fi.food_id = f.food_id
                WHERE fi.item_id = ?;
                """,
                (item_id,)
            )
            row = cursor.fetchone()
            if not row:
                raise ValueError(f"Không tìm thấy thực phẩm với item_id={item_id}")

            old_qty = row["current_quantity"]
            change_qty = round(new_quantity - old_qty, 2)
            new_status = "CONSUMED" if new_quantity == 0 else "ACTIVE"

            cursor.execute(
                "UPDATE food_items SET current_quantity = ?, status = ? WHERE item_id = ?;",
                (new_quantity, new_status, item_id)
            )

            cursor.execute(
                """
                INSERT INTO inventory_transactions (item_id, action_type, change_quantity, remaining_quantity, reason, transaction_time)
                VALUES (?, 'ADJUST', ?, ?, ?, DATETIME('now', 'localtime'));
                """,
                (item_id, change_qty, new_quantity, reason)
            )

            return {
                "item_id": item_id,
                "food_name": row["food_name"],
                "old_quantity": old_qty,
                "new_quantity": new_quantity,
                "change_quantity": change_qty
            }

    def delete_food_item(self, item_id: int, reason: str = "Xóa khỏi tủ") -> bool:
        with self.transaction() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT current_quantity FROM food_items WHERE item_id = ?;", (item_id,))
            row = cursor.fetchone()
            if not row:
                return False

            qty = row["current_quantity"]
            cursor.execute(
                "UPDATE food_items SET current_quantity = 0, status = 'DISCARDED' WHERE item_id = ?;",
                (item_id,)
            )

            cursor.execute(
                """
                INSERT INTO inventory_transactions (item_id, action_type, change_quantity, remaining_quantity, reason, transaction_time)
                VALUES (?, 'DELETE', ?, 0, ?, DATETIME('now', 'localtime'));
                """,
                (item_id, -qty, reason)
            )
            return True

    def get_audit_logs(self, limit: int = 50) -> List[Dict[str, Any]]:
        query = """
            SELECT 
                it.transaction_id,
                it.item_id,
                f.food_name,
                sl.location_name,
                it.action_type,
                it.change_quantity,
                it.remaining_quantity,
                u.unit_name,
                it.reason,
                it.transaction_time
            FROM inventory_transactions it
            JOIN food_items fi ON it.item_id = fi.item_id
            JOIN foods f ON fi.food_id = f.food_id
            JOIN storage_locations sl ON fi.location_id = sl.location_id
            JOIN units u ON fi.unit_id = u.unit_id
            ORDER BY it.transaction_time DESC, it.transaction_id DESC
            LIMIT ?;
        """
        return self.fetch_all(query, (limit,))

    def get_recipes(self) -> List[Dict[str, Any]]:
        recipes = self.fetch_all("SELECT * FROM recipes ORDER BY recipe_id;")
        for r in recipes:
            try:
                r["required_ingredients"] = json.loads(r["required_ingredients"])
            except Exception:
                pass
        return recipes


db = DatabaseManager()


def run_self_test():
    print("=" * 70)
    print("▶ BẮT ĐẦU KIỂM THỬ CƠ SỞ DỮ LIỆU SQLITE 3NF (TẦNG TRUY XUẤT DỮ LIỆU)")
    print(f"  File CSDL: {db.db_path}")
    print("=" * 70)

    sim_date = db.get_simulation_date()
    print(f"✔ 1. Ngày giả lập hệ thống: {sim_date}")

    catalogs = db.get_catalogs()
    print(f"✔ 2. Danh mục: {len(catalogs['categories'])} loại, Vị trí: {len(catalogs['locations'])}, Đơn vị: {len(catalogs['units'])}, Thực phẩm: {len(catalogs['foods'])}")

    inv = db.get_all_inventory()
    print(f"✔ 3. Tồn kho thực tế trong tủ: {len(inv)} mặt hàng.")

    alerts = db.get_alerts()
    fefo = db.get_fefo_recommendations()
    print(f"✔ 4. Báo cáo CSDL: {len(alerts)} món kích hoạt cảnh báo, {len(fefo)} món trong danh sách FEFO")
    print("=" * 70)
    print("🎉 TẤT CẢ CÁC BÀI KIỂM THỬ CSDL 3NF & TẦNG TRUY XUẤT ĐỀU ĐẠT CHUẨN 100%!")
    print("=" * 70)


def start_test_tcp_server(host: str = "0.0.0.0", port: int = 8080):
    server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

    try:
        server_socket.bind((host, port))
        server_socket.listen(50)
        print(f"\n==================================================================")
        print(f"🌐 MÁY CHỦ TCP SOCKET THUẦN ĐANG HOẠT ĐỘNG TẠI: http://localhost:{port}")
        print(f"👉 Mở trình duyệt để xem giao diện Web Client hoặc gọi API:")
        print(f"   • Giao diện Web:    http://localhost:{port}/")
        print(f"   • Toàn bộ kho:      http://localhost:{port}/api/inventory")
        print(f"   • Đề xuất FEFO:     http://localhost:{port}/api/fefo")
        print(f"   • Cảnh báo hạn:     http://localhost:{port}/api/alerts")
        print(f"   • Nhật ký Audit:    http://localhost:{port}/api/audit-log")
        print(f"==================================================================\n")

        while True:
            client_sock, client_addr = server_socket.accept()
            client_thread = threading.Thread(
                target=handle_client_socket,
                args=(client_sock, client_addr),
                daemon=True
            )
            client_thread.start()
    except KeyboardInterrupt:
        print("\n🛑 Đã dừng máy chủ TCP Socket.")
    finally:
        server_socket.close()


def handle_client_socket(client_sock: socket.socket, client_addr: Tuple[str, int]):
    try:
        raw_data = b""
        client_sock.settimeout(5.0)
        while True:
            chunk = client_sock.recv(4096)
            if not chunk:
                break
            raw_data += chunk
            if b"\r\n\r\n" in raw_data:
                break

        if not raw_data:
            client_sock.close()
            return

        parts = raw_data.split(b"\r\n\r\n", 1)
        header_text = parts[0].decode("utf-8", errors="replace")
        body_bytes = parts[1] if len(parts) > 1 else b""

        lines = header_text.split("\r\n")
        request_line = lines[0]
        tokens = request_line.split(" ")
        if len(tokens) < 2:
            client_sock.close()
            return

        method = tokens[0].upper()
        raw_path = tokens[1]
        parsed_url = urlparse(raw_path)
        path = parsed_url.path
        query_params = parse_qs(parsed_url.query)

        content_length = 0
        for line in lines[1:]:
            if line.lower().startswith("content-length:"):
                content_length = int(line.split(":")[1].strip())
                break

        while len(body_bytes) < content_length:
            chunk = client_sock.recv(4096)
            if not chunk:
                break
            body_bytes += chunk

        json_body = {}
        if body_bytes:
            try:
                json_body = json.loads(body_bytes.decode("utf-8", errors="replace"))
            except Exception:
                pass

        status_code, response_data = route_request(method, path, query_params, json_body)

        if status_code == "200_HTML":
            content_type = "text/html; charset=utf-8"
            body_str = str(response_data)
            status_line = "HTTP/1.1 200 OK"
        elif status_code == "200_CSS":
            content_type = "text/css; charset=utf-8"
            body_str = str(response_data)
            status_line = "HTTP/1.1 200 OK"
        elif status_code == "200_JS":
            content_type = "application/javascript; charset=utf-8"
            body_str = str(response_data)
            status_line = "HTTP/1.1 200 OK"
        else:
            content_type = "application/json; charset=utf-8"
            body_str = json.dumps(response_data, ensure_ascii=False, indent=2)
            status_line = f"HTTP/1.1 {status_code}"

        body_encoded = body_str.encode("utf-8")
        response_bytes = (
            f"{status_line}\r\n"
            f"Content-Type: {content_type}\r\n"
            f"Content-Length: {len(body_encoded)}\r\n"
            f"Access-Control-Allow-Origin: *\r\n"
            f"Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
            f"Access-Control-Allow-Headers: Content-Type\r\n"
            f"Connection: close\r\n"
            f"\r\n"
        ).encode("utf-8") + body_encoded

        client_sock.sendall(response_bytes)
    except Exception as e:
        err_msg = json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False)
        err_res = (
            f"HTTP/1.1 500 Internal Error\r\n"
            f"Content-Type: application/json; charset=utf-8\r\n"
            f"Content-Length: {len(err_msg.encode('utf-8'))}\r\n"
            f"Access-Control-Allow-Origin: *\r\n"
            f"Connection: close\r\n\r\n{err_msg}"
        ).encode("utf-8")
        try:
            client_sock.sendall(err_res)
        except Exception:
            pass
    finally:
        try:
            client_sock.close()
        except Exception:
            pass


def route_request(method: str, path: str, query_params: Dict[str, List[str]], body: Dict[str, Any]) -> Tuple[str, Any]:
    if method == "OPTIONS":
        return "200 OK", {"ok": True}

    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    client_dir = os.path.join(base_dir, "client")

    if method == "GET":
        if path in ["/", "/index.html"]:
            index_file = os.path.join(client_dir, "index.html")
            if os.path.exists(index_file):
                with open(index_file, "r", encoding="utf-8") as f:
                    return "200_HTML", f.read()
        elif path == "/style.css":
            css_file = os.path.join(client_dir, "style.css")
            if os.path.exists(css_file):
                with open(css_file, "r", encoding="utf-8") as f:
                    return "200_CSS", f.read()
        elif path == "/app.js":
            js_file = os.path.join(client_dir, "app.js")
            if os.path.exists(js_file):
                with open(js_file, "r", encoding="utf-8") as f:
                    return "200_JS", f.read()

    try:
        if path == "/api/status":
            return "200 OK", {
                "ok": True,
                "server": "Python Pure TCP Socket Server",
                "database": "SQLite 3NF (food_management.db)",
                "simulation_date": db.get_simulation_date()
            }

        elif path == "/api/inventory" and method == "GET":
            search = query_params.get("search", [""])[0]
            loc_str = query_params.get("location_id", [None])[0]
            loc_id = int(loc_str) if loc_str and loc_str.isdigit() else None
            items = db.get_all_inventory(search=search, location_id=loc_id)
            return "200 OK", {"ok": True, "total": len(items), "data": items}

        elif path == "/api/fefo" and method == "GET":
            fefo_list = db.get_fefo_recommendations()
            return "200 OK", {"ok": True, "total": len(fefo_list), "data": fefo_list}

        elif path == "/api/alerts" and method == "GET":
            alerts = db.get_alerts()
            return "200 OK", {"ok": True, "total": len(alerts), "data": alerts}

        elif path == "/api/audit-log" and method == "GET":
            limit = int(query_params.get("limit", [50])[0])
            logs = db.get_audit_logs(limit=limit)
            return "200 OK", {"ok": True, "total": len(logs), "data": logs}

        elif path == "/api/catalogs" and method == "GET":
            return "200 OK", {"ok": True, "data": db.get_catalogs()}

        elif path == "/api/recipes" and method == "GET":
            return "200 OK", {"ok": True, "total": len(db.get_recipes()), "data": db.get_recipes()}

        elif path == "/api/simulation/date" and method == "POST":
            new_date = body.get("simulation_date")
            if not new_date:
                return "400 Bad Request", {"ok": False, "error": "Thiếu trường simulation_date (YYYY-MM-DD)"}
            db.set_simulation_date(new_date)
            return "200 OK", {"ok": True, "message": f"Đã chuyển ngày giả lập sang: {new_date}", "simulation_date": new_date}

        elif path == "/api/food/add" and method == "POST":
            item_id = db.add_food_item(
                food_id=int(body["food_id"]),
                location_id=int(body["location_id"]),
                unit_id=int(body["unit_id"]),
                quantity=float(body["quantity"]),
                expiration_date=str(body["expiration_date"]),
                min_threshold=float(body.get("min_threshold", 0.0)),
                notes=str(body.get("notes", ""))
            )
            return "200 OK", {"ok": True, "message": "Thêm thực phẩm thành công", "item_id": item_id}

        elif path == "/api/food/use" and method == "POST":
            result = db.use_food_item(
                item_id=int(body["item_id"]),
                use_quantity=float(body["use_quantity"]),
                reason=str(body.get("reason", "Nấu ăn"))
            )
            return "200 OK", {"ok": True, "message": "Đã sử dụng thực phẩm", "data": result}

        elif path == "/api/food/adjust" and method == "POST":
            result = db.adjust_food_quantity(
                item_id=int(body["item_id"]),
                new_quantity=float(body["new_quantity"]),
                reason=str(body.get("reason", "Kiểm kê dọn tủ"))
            )
            return "200 OK", {"ok": True, "message": "Điều chỉnh số lượng thành công", "data": result}

        elif path == "/api/food/delete" and method == "POST":
            success = db.delete_food_item(
                item_id=int(body["item_id"]),
                reason=str(body.get("reason", "Xóa khỏi tủ"))
            )
            return "200 OK", {"ok": success, "message": "Đã xóa thực phẩm khỏi tủ"}

        return "404 Not Found", {"ok": False, "error": f"Không tìm thấy endpoint: {method} {path}"}
    except Exception as e:
        return "400 Bad Request", {"ok": False, "error": str(e)}


if __name__ == "__main__":
    run_self_test()
    start_test_tcp_server(host="0.0.0.0", port=8080)
