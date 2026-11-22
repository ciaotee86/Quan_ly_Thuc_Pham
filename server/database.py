"""
============================================================================
HỆ THỐNG QUẢN LÝ THỰC PHẨM GIA ĐÌNH - MÔN HỌC LẬP TRÌNH MẠNG
Server Database Connection & Transaction Layer (SQLite WAL + RLock)
File: server/database.py
============================================================================
Strictly owns ONLY SQLite connections, WAL mode, PRAGMA foreign_keys,
thread-safe RLock synchronization, and transaction primitives.
No HTTP/TCP networking and no domain business logic live here.
"""

from __future__ import annotations

import os
import sqlite3
import threading
from contextlib import contextmanager
from typing import Any, Dict, Iterator, List, Optional, Tuple, Union


def _default_paths() -> Tuple[str, str, str]:
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    db_dir = os.path.join(base_dir, "database")
    return (
        os.path.join(db_dir, "food_management.db"),
        os.path.join(db_dir, "schema.sql"),
        os.path.join(db_dir, "seed_data.sql"),
    )


class DatabaseManager:
    """Thread-safe SQLite connection & transaction manager (WAL + FK ON)."""

    _instance: Optional["DatabaseManager"] = None
    _init_lock = threading.Lock()

    def __new__(cls, *args: Any, **kwargs: Any) -> "DatabaseManager":
        with cls._init_lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
            return cls._instance

    def __init__(
        self,
        db_path: Optional[str] = None,
        schema_path: Optional[str] = None,
        seed_path: Optional[str] = None,
    ) -> None:
        if getattr(self, "_initialized", False):
            return
        self.lock = threading.RLock()
        self._initialized = True
        self.configure(db_path=db_path, schema_path=schema_path, seed_path=seed_path)

    def configure(
        self,
        db_path: Optional[str] = None,
        schema_path: Optional[str] = None,
        seed_path: Optional[str] = None,
    ) -> None:
        """Point the manager to a SQLite database file and initialize schema/seed."""
        default_db, default_schema, default_seed = _default_paths()

        with self.lock:
            if db_path is None:
                self.db_path = default_db
                self.db_dir = os.path.dirname(self.db_path)
                self.schema_path = schema_path or default_schema
                self.seed_path = seed_path or default_seed
            else:
                self.db_path = os.path.abspath(db_path)
                self.db_dir = os.path.dirname(self.db_path)
                local_schema = os.path.join(self.db_dir, "schema.sql")
                local_seed = os.path.join(self.db_dir, "seed_data.sql")
                self.schema_path = schema_path or (local_schema if os.path.exists(local_schema) else default_schema)
                self.seed_path = seed_path or (local_seed if os.path.exists(local_seed) else default_seed)

            os.makedirs(self.db_dir, exist_ok=True)
            self.init_database()

    def get_connection(self) -> sqlite3.Connection:
        """Create a configured SQLite connection with WAL and foreign keys enabled."""
        conn = sqlite3.connect(
            self.db_path,
            timeout=30.0,
            check_same_thread=False,
            isolation_level=None,
        )
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA journal_mode = WAL;")
        return conn

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        """Yield a locked SQLite connection inside an atomic BEGIN/COMMIT/ROLLBACK block."""
        with self.lock:
            conn = self.get_connection()
            try:
                conn.execute("BEGIN TRANSACTION;")
                yield conn
                conn.execute("COMMIT;")
            except Exception:
                conn.execute("ROLLBACK;")
                raise
            finally:
                conn.close()

    def init_database(self, force_seed: bool = False) -> None:
        """Apply schema.sql and seed_data.sql (when database has no categories or forced)."""
        with self.lock:
            conn = self.get_connection()
            try:
                if os.path.exists(self.schema_path):
                    with open(self.schema_path, "r", encoding="utf-8") as f:
                        conn.executescript(f.read())

                cursor = conn.cursor()
                cursor.execute("SELECT COUNT(*) AS cnt FROM categories;")
                row = cursor.fetchone()
                has_data = bool(row and row["cnt"] > 0)

                if (not has_data or force_seed) and os.path.exists(self.seed_path):
                    with open(self.seed_path, "r", encoding="utf-8") as f:
                        conn.executescript(f.read())
            finally:
                conn.close()

    def fetch_all(self, query: str, params: Union[Tuple[Any, ...], List[Any]] = ()) -> List[Dict[str, Any]]:
        with self.lock:
            conn = self.get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute(query, params)
                return [dict(row) for row in cursor.fetchall()]
            finally:
                conn.close()

    def fetch_one(self, query: str, params: Union[Tuple[Any, ...], List[Any]] = ()) -> Optional[Dict[str, Any]]:
        with self.lock:
            conn = self.get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute(query, params)
                row = cursor.fetchone()
                return dict(row) if row else None
            finally:
                conn.close()

    def execute_non_query(
        self,
        query: str,
        params: Union[Tuple[Any, ...], List[Any]] = (),
    ) -> Dict[str, Any]:
        with self.lock:
            conn = self.get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute("BEGIN TRANSACTION;")
                cursor.execute(query, params)
                lastrowid = cursor.lastrowid
                rowcount = cursor.rowcount
                cursor.execute("COMMIT;")
                return {"lastrowid": lastrowid, "rows_affected": rowcount}
            except Exception:
                conn.execute("ROLLBACK;")
                raise
            finally:
                conn.close()


db = DatabaseManager()


def get_connection() -> sqlite3.Connection:
    """Return a configured SQLite connection from the active DatabaseManager."""
    return db.get_connection()


@contextmanager
def DatabaseTransaction() -> Iterator[sqlite3.Connection]:
    """Context manager wrapping an atomic SQLite transaction under RLock."""
    with db.transaction() as conn:
        yield conn


def query_all(query: str, params: Union[Tuple[Any, ...], List[Any]] = ()) -> List[Dict[str, Any]]:
    """Execute a SELECT query and return all rows as dictionaries."""
    return db.fetch_all(query, params)


def query_one(query: str, params: Union[Tuple[Any, ...], List[Any]] = ()) -> Optional[Dict[str, Any]]:
    """Execute a SELECT query and return the first row as a dict, or None."""
    return db.fetch_one(query, params)


def execute_mutation(
    query: str,
    params: Union[Tuple[Any, ...], List[Any]] = (),
) -> Dict[str, Any]:
    """Execute an INSERT/UPDATE/DELETE mutation inside a locked transaction."""
    return db.execute_non_query(query, params)


def init_database(force_seed: bool = False) -> None:
    """Initialize or re-seed the active SQLite database."""
    db.init_database(force_seed=force_seed)


def run_self_test() -> None:
    """Quick CLI self-check for SQLite WAL connection and schema integrity."""
    print("=" * 70)
    print("▶ KIỂM THỬ TẦNG KẾT NỐI SQLITE (WAL + FOREIGN KEYS)")
    print(f"  File CSDL: {db.db_path}")
    print("=" * 70)

    fk_row = query_one("PRAGMA foreign_keys;")
    jm_row = query_one("PRAGMA journal_mode;")
    tables = query_all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
    print(f"✔ PRAGMA foreign_keys = {fk_row}")
    print(f"✔ PRAGMA journal_mode = {jm_row}")
    print(f"✔ Số bảng hiện có: {len(tables)} -> {[t['name'] for t in tables]}")
    print("=" * 70)


if __name__ == "__main__":
    run_self_test()
