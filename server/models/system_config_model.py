"""
server/models/system_config_model.py
============================================================================
Domain Model for standalone unstructured `system_settings` table.
Resolves simulation_date, FEFO/warning thresholds, and date calculations.
Zero foreign-key relationships in SQLite.
============================================================================
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, Optional

from server.database import execute_mutation, query_all, query_one


class SystemConfigModel:
    """Manages unstructured system_settings and FEFO/expiry date resolution."""

    DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh"
    DEFAULT_FEFO_HIGH_DAYS = 2
    DEFAULT_FEFO_MEDIUM_DAYS = 5
    DEFAULT_WARNING_DAYS = 3
    DEFAULT_MIN_QUANTITY = 1.0

    def get_all_settings_raw(self) -> Dict[str, str]:
        rows = query_all("SELECT setting_key, setting_value FROM system_settings;")
        return {str(r["setting_key"]): str(r["setting_value"]) for r in rows}

    def get_config(self) -> Dict[str, Any]:
        settings = self.get_all_settings_raw()
        sim_date = settings.get("simulation_date") or date.today().strftime("%Y-%m-%d")

        return {
            "timezone": settings.get("timezone", self.DEFAULT_TIMEZONE),
            "simulation_date": sim_date,
            "simulated_date": sim_date,
            "use_simulated_date": True,
            "fefo_high_days": int(
                settings.get("fefo_high_days", settings.get("urgent_threshold_days", self.DEFAULT_FEFO_HIGH_DAYS))
            ),
            "fefo_medium_days": int(
                settings.get("fefo_medium_days", settings.get("warning_threshold_days", self.DEFAULT_FEFO_MEDIUM_DAYS))
            ),
            "warning_days_threshold": int(settings.get("warning_days_threshold", self.DEFAULT_WARNING_DAYS)),
            "min_quantity_default": float(settings.get("min_quantity_default", self.DEFAULT_MIN_QUANTITY)),
            "app_name": settings.get("app_name", "Hệ Thống Quản Lý Thực Phẩm Gia Đình"),
            "app_version": settings.get("app_version", "1.0.0-PROD"),
            "raw_settings": settings,
        }

    def get_simulation_date(self) -> str:
        row = query_one(
            "SELECT setting_value FROM system_settings WHERE setting_key = 'simulation_date';"
        )
        if row and row.get("setting_value"):
            return str(row["setting_value"])
        return date.today().strftime("%Y-%m-%d")

    def set_simulation_date(self, new_date_str: str) -> Dict[str, Any]:
        if not new_date_str or not isinstance(new_date_str, str):
            raise ValueError("Thiếu ngày giả lập simulation_date (định dạng chuẩn: YYYY-MM-DD)")

        try:
            valid_date = datetime.strptime(new_date_str.strip(), "%Y-%m-%d").date()
            formatted_date = valid_date.strftime("%Y-%m-%d")
        except ValueError as exc:
            raise ValueError(
                f"Định dạng ngày không hợp lệ: '{new_date_str}'. Định dạng chuẩn là YYYY-MM-DD"
            ) from exc

        execute_mutation(
            """
            INSERT INTO system_settings (setting_key, setting_value, description)
            VALUES ('simulation_date', ?, 'Ngày mốc hệ thống giả lập')
            ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value;
            """,
            (formatted_date,),
        )

        return {
            "ok": True,
            "success": True,
            "simulation_date": formatted_date,
            "message": f"Đã cập nhật ngày hệ thống sang: {formatted_date}",
        }

    def update_setting(self, key: str, value: Any, description: Optional[str] = None) -> Dict[str, Any]:
        clean_key = str(key).strip()
        if not clean_key:
            raise ValueError("setting_key không được để trống")
        str_val = str(value)
        execute_mutation(
            """
            INSERT INTO system_settings (setting_key, setting_value, description)
            VALUES (?, ?, ?)
            ON CONFLICT(setting_key) DO UPDATE SET
                setting_value = excluded.setting_value,
                description = COALESCE(excluded.description, system_settings.description);
            """,
            (clean_key, str_val, description),
        )
        return {"ok": True, "setting_key": clean_key, "setting_value": str_val}

    def calculate_days_left(self, expiry_date: str, system_date: Optional[str] = None) -> int:
        if not expiry_date:
            raise ValueError("expiry_date không được để trống")

        ref_date = system_date or self.get_simulation_date()
        exp_dt = datetime.strptime(str(expiry_date).strip()[:10], "%Y-%m-%d").date()
        sys_dt = datetime.strptime(str(ref_date).strip()[:10], "%Y-%m-%d").date()
        return (exp_dt - sys_dt).days

    def classify_fefo_priority(
        self,
        days_remaining: int,
        config: Optional[Dict[str, Any]] = None,
    ) -> str:
        cfg = config or self.get_config()
        high_threshold = int(cfg.get("fefo_high_days", self.DEFAULT_FEFO_HIGH_DAYS))
        med_threshold = int(cfg.get("fefo_medium_days", self.DEFAULT_FEFO_MEDIUM_DAYS))

        if days_remaining <= high_threshold:
            return "Cao"
        if days_remaining <= med_threshold:
            return "Trung bình"
        return "Thấp"
