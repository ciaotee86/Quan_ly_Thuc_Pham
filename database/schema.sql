PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
    category_id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_name TEXT NOT NULL UNIQUE,
    description TEXT
);

CREATE TABLE IF NOT EXISTS units (
    unit_id INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_name TEXT NOT NULL UNIQUE,
    description TEXT
);

CREATE TABLE IF NOT EXISTS storage_locations (
    location_id INTEGER PRIMARY KEY AUTOINCREMENT,
    area_type TEXT NOT NULL,
    location_name TEXT NOT NULL UNIQUE,
    description TEXT
);

CREATE TABLE IF NOT EXISTS foods (
    food_id INTEGER PRIMARY KEY AUTOINCREMENT,
    food_code TEXT NOT NULL UNIQUE,
    food_name TEXT NOT NULL,
    category_id INTEGER NOT NULL,
    brand TEXT,
    image_url TEXT,
    description TEXT,
    FOREIGN KEY (category_id) REFERENCES categories(category_id) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS food_items (
    item_id INTEGER PRIMARY KEY AUTOINCREMENT,
    food_id INTEGER NOT NULL,
    location_id INTEGER NOT NULL,
    unit_id INTEGER NOT NULL,
    current_quantity REAL NOT NULL CHECK (current_quantity >= 0),
    min_threshold REAL DEFAULT 0 CHECK (min_threshold >= 0),
    import_date TEXT NOT NULL DEFAULT (DATE('now', 'localtime')),
    expiration_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    notes TEXT,
    FOREIGN KEY (food_id) REFERENCES foods(food_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (location_id) REFERENCES storage_locations(location_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS inventory_transactions (
    transaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    action_type TEXT NOT NULL,
    change_quantity REAL NOT NULL,
    remaining_quantity REAL NOT NULL CHECK (remaining_quantity >= 0),
    reason TEXT,
    transaction_time TEXT NOT NULL DEFAULT (DATETIME('now', 'localtime')),
    FOREIGN KEY (item_id) REFERENCES food_items(item_id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS system_settings (
    setting_id INTEGER PRIMARY KEY AUTOINCREMENT,
    setting_key TEXT NOT NULL UNIQUE,
    setting_value TEXT NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS recipes (
    recipe_id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_name TEXT NOT NULL UNIQUE,
    required_ingredients TEXT NOT NULL,
    cooking_guide TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_food_items_fefo ON food_items(status, expiration_date ASC);
CREATE INDEX IF NOT EXISTS idx_food_items_location ON food_items(location_id);
CREATE INDEX IF NOT EXISTS idx_food_items_food ON food_items(food_id);
CREATE INDEX IF NOT EXISTS idx_transactions_item ON inventory_transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_transactions_time ON inventory_transactions(transaction_time DESC);

CREATE VIEW IF NOT EXISTS view_alerts AS
SELECT 
    fi.item_id,
    f.food_name,
    c.category_name,
    sl.location_name,
    fi.current_quantity,
    fi.min_threshold,
    u.unit_name,
    fi.expiration_date,
    CAST(ROUND(JULIANDAY(fi.expiration_date) - JULIANDAY(IFNULL((SELECT setting_value FROM system_settings WHERE setting_key = 'simulation_date'), DATE('now')))) AS INTEGER) AS days_left,
    CASE 
        WHEN (JULIANDAY(fi.expiration_date) - JULIANDAY(IFNULL((SELECT setting_value FROM system_settings WHERE setting_key = 'simulation_date'), DATE('now')))) < 0 THEN 'ĐÃ HẾT HẠN'
        WHEN (JULIANDAY(fi.expiration_date) - JULIANDAY(IFNULL((SELECT setting_value FROM system_settings WHERE setting_key = 'simulation_date'), DATE('now')))) <= 3 THEN 'SẮP HẾT HẠN'
        WHEN fi.current_quantity <= fi.min_threshold THEN 'SẮP HẾT TỒN KHO'
        ELSE 'BÌNH THƯỜNG'
    END AS alert_type
FROM food_items fi
JOIN foods f ON fi.food_id = f.food_id
JOIN categories c ON f.category_id = c.category_id
JOIN storage_locations sl ON fi.location_id = sl.location_id
JOIN units u ON fi.unit_id = u.unit_id
WHERE fi.status = 'ACTIVE' 
  AND (
      (JULIANDAY(fi.expiration_date) - JULIANDAY(IFNULL((SELECT setting_value FROM system_settings WHERE setting_key = 'simulation_date'), DATE('now')))) <= 3
      OR fi.current_quantity <= fi.min_threshold
  );

CREATE VIEW IF NOT EXISTS view_fefo_recommendations AS
SELECT 
    fi.item_id,
    f.food_code,
    f.food_name,
    c.category_name,
    sl.area_type,
    sl.location_name,
    fi.current_quantity,
    u.unit_name,
    fi.import_date,
    fi.expiration_date,
    CAST(ROUND(JULIANDAY(fi.expiration_date) - JULIANDAY(IFNULL((SELECT setting_value FROM system_settings WHERE setting_key = 'simulation_date'), DATE('now')))) AS INTEGER) AS days_left,
    CASE 
        WHEN (JULIANDAY(fi.expiration_date) - JULIANDAY(IFNULL((SELECT setting_value FROM system_settings WHERE setting_key = 'simulation_date'), DATE('now')))) < 0 THEN 'Đã hết hạn'
        WHEN (JULIANDAY(fi.expiration_date) - JULIANDAY(IFNULL((SELECT setting_value FROM system_settings WHERE setting_key = 'simulation_date'), DATE('now')))) <= 2 THEN 'Ưu tiên Cao'
        WHEN (JULIANDAY(fi.expiration_date) - JULIANDAY(IFNULL((SELECT setting_value FROM system_settings WHERE setting_key = 'simulation_date'), DATE('now')))) <= 7 THEN 'Ưu tiên Trung bình'
        ELSE 'Ưu tiên Thấp'
    END AS priority_level,
    CASE 
        WHEN (JULIANDAY(fi.expiration_date) - JULIANDAY(IFNULL((SELECT setting_value FROM system_settings WHERE setting_key = 'simulation_date'), DATE('now')))) < 0 THEN 'Cần thanh lý/bỏ khỏi tủ'
        WHEN (JULIANDAY(fi.expiration_date) - JULIANDAY(IFNULL((SELECT setting_value FROM system_settings WHERE setting_key = 'simulation_date'), DATE('now')))) <= 2 THEN 'Nấu ngay hôm nay/ngày mai'
        WHEN (JULIANDAY(fi.expiration_date) - JULIANDAY(IFNULL((SELECT setting_value FROM system_settings WHERE setting_key = 'simulation_date'), DATE('now')))) <= 7 THEN 'Lên kế hoạch dùng trong tuần'
        ELSE 'Bảo quản bình thường'
    END AS suggested_action
FROM food_items fi
JOIN foods f ON fi.food_id = f.food_id
JOIN categories c ON f.category_id = c.category_id
JOIN storage_locations sl ON fi.location_id = sl.location_id
JOIN units u ON fi.unit_id = u.unit_id
WHERE fi.status = 'ACTIVE' AND fi.current_quantity > 0
ORDER BY fi.expiration_date ASC, fi.import_date ASC;
