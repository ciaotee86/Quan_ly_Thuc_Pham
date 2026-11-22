"""
server/core_services.py
============================================================================
Service Facade Layer (Server Controller -> Service Facade -> Models -> DB).
Delegates 100% of data processing and SQLite queries to `server.models.*`.
Zero raw SQL queries or direct database driver calls live in this module.
============================================================================
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Union

from server.models import (
    CatalogModel,
    FoodInventoryModel,
    RecipeModel,
    SystemConfigModel,
)

_config_model = SystemConfigModel()
_catalog_model = CatalogModel()
_recipe_model = RecipeModel(config_model=_config_model, catalog_model=_catalog_model)
_inventory_model = FoodInventoryModel(config_model=_config_model, recipe_model=_recipe_model)


def get_status() -> Dict[str, Any]:
    """Return server health & active simulation configuration snapshot."""
    cfg = _config_model.get_config()
    return {
        "ok": True,
        "server": "Python Pure TCP Socket Server",
        "database": "SQLite 3NF + Unstructured Settings/Recipes (WAL)",
        "simulation_date": cfg["simulation_date"],
        "app_name": cfg["app_name"],
        "app_version": cfg["app_version"],
        "warning_days_threshold": cfg["warning_days_threshold"],
        "fefo_high_days": cfg["fefo_high_days"],
        "fefo_medium_days": cfg["fefo_medium_days"],
    }


def get_system_config() -> Dict[str, Any]:
    return _config_model.get_config()


def get_system_date() -> str:
    return _config_model.get_simulation_date()


def set_system_date(new_date_str: str) -> Dict[str, Any]:
    return _config_model.set_simulation_date(new_date_str)


def set_simulation_date(simulation_date: str) -> Dict[str, Any]:
    return _config_model.set_simulation_date(simulation_date)


def calculate_days_left(expiry_date: str, system_date: Optional[str] = None) -> int:
    return _config_model.calculate_days_left(expiry_date=expiry_date, system_date=system_date)


def classify_fefo_priority(days_remaining: int, config: Optional[Dict[str, Any]] = None) -> str:
    return _config_model.classify_fefo_priority(days_remaining=days_remaining, config=config)


def get_fefo_recommendations(
    include_expired: bool = False,
    system_date: Optional[str] = None,
    area_type: Optional[str] = None,
    location_id: Optional[Union[int, str]] = None,
    priority_level: Optional[str] = None,
) -> Dict[str, Any]:
    include_exp_flag = (
        include_expired
        if isinstance(include_expired, bool)
        else str(include_expired).strip().lower() in ("1", "true", "yes")
    )
    return _inventory_model.get_fefo_recommendations(
        include_expired=include_exp_flag,
        system_date=system_date,
        area_type=area_type,
        location_id=location_id,
        priority_level=priority_level,
    )


def get_all_recipes() -> List[Dict[str, Any]]:
    return _recipe_model.get_all_recipes()


def get_recipes() -> Dict[str, Any]:
    recipes = _recipe_model.get_all_recipes()
    return {"ok": True, "total": len(recipes), "data": recipes}


def suggest_recipes(
    focus_item_id: Optional[Union[int, str]] = None,
    system_date: Optional[str] = None,
) -> List[Dict[str, Any]]:
    parsed_focus = int(focus_item_id) if focus_item_id not in (None, "", "all") else None
    return _recipe_model.suggest_recipes(focus_item_id=parsed_focus, system_date=system_date)


def use_food(
    item_id: int,
    quantity: float,
    reason: str = "Nấu ăn hàng ngày",
    actor_device: str = "Client",
) -> Dict[str, Any]:
    return _inventory_model.use_food(
        item_id=int(item_id),
        quantity=float(quantity),
        reason=reason,
        actor_device=actor_device,
    )


def adjust_food(
    item_id: int,
    new_quantity: float,
    reason: str = "Kiểm kê tủ lạnh",
    actor_device: str = "Client",
) -> Dict[str, Any]:
    return _inventory_model.adjust_food(
        item_id=int(item_id),
        new_quantity=float(new_quantity),
        reason=reason,
        actor_device=actor_device,
    )


def add_food_item(
    food_id: int,
    location_id: int,
    unit_id: int,
    quantity: float,
    expiration_date: str,
    import_date: Optional[str] = None,
    min_threshold: float = 1.0,
    notes: str = "",
) -> Dict[str, Any]:
    return _inventory_model.add_food_item(
        food_id=int(food_id),
        location_id=int(location_id),
        unit_id=int(unit_id),
        quantity=float(quantity),
        expiration_date=str(expiration_date),
        import_date=import_date,
        min_threshold=float(min_threshold),
        notes=notes,
    )


def delete_food_item(
    item_id: int,
    reason: str = "Vứt hủy / Hỏng",
) -> Dict[str, Any]:
    return _inventory_model.delete_food_item(item_id=int(item_id), reason=reason)


def get_alerts(system_date: Optional[str] = None) -> Dict[str, Any]:
    return _inventory_model.get_alerts(system_date=system_date)


def get_shopping_list(system_date: Optional[str] = None) -> Dict[str, Any]:
    return _inventory_model.get_shopping_list(system_date=system_date)


def get_inventory(
    search_text: Optional[str] = None,
    search: Optional[str] = None,
    location_id: Optional[Union[int, str]] = None,
    category_id: Optional[Union[int, str]] = None,
    status: Optional[str] = None,
    system_date: Optional[str] = None,
) -> List[Dict[str, Any]]:
    return _inventory_model.get_inventory(
        search_text=search_text,
        search=search,
        location_id=location_id,
        category_id=category_id,
        status=status,
        system_date=system_date,
    )


def get_audit_log(
    item_id: Optional[Union[int, str]] = None,
    limit: Union[int, str] = 50,
) -> List[Dict[str, Any]]:
    parsed_item = int(item_id) if item_id not in (None, "", "all") else None
    parsed_limit = int(limit) if limit not in (None, "") else 50
    return _inventory_model.get_audit_log(item_id=parsed_item, limit=parsed_limit)


def get_metadata() -> Dict[str, Any]:
    return _catalog_model.get_metadata()


def get_catalogs() -> Dict[str, Any]:
    return _catalog_model.get_catalogs()
