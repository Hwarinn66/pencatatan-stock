-- Upgrade existing v2 database ONCE. Select warehouse_stock first; back up and stop app.
-- No label is inferred from OUT: existing products remain unlabelled until the user chooses.
ALTER TABLE products ADD COLUMN movement_class ENUM('FAST','SLOW') NULL DEFAULT NULL AFTER unit;
CREATE INDEX idx_products_movement_name ON products(movement_class,name);
