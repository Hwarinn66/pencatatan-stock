-- MySQL >= 8.0.16 / MariaDB >= 10.6, InnoDB. Import sekali ke database baru.
CREATE DATABASE IF NOT EXISTS warehouse_stock CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE warehouse_stock;
SET time_zone = '+00:00';
CREATE TABLE users (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, username VARCHAR(100) NOT NULL UNIQUE,
 password_hash VARCHAR(255) NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
CREATE TABLE sessions (
 token_hash CHAR(64) PRIMARY KEY, user_id INT UNSIGNED NOT NULL, expires_at DATETIME(3) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, INDEX(expires_at)
) ENGINE=InnoDB;
CREATE TABLE login_attempts (
 identity_hash CHAR(64) PRIMARY KEY, attempts INT UNSIGNED NOT NULL DEFAULT 0,
 window_start DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
CREATE TABLE categories (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
CREATE TABLE rooms (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
CREATE TABLE blocks (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, room_id INT UNSIGNED NOT NULL,
 code VARCHAR(20) NOT NULL UNIQUE, name VARCHAR(100) NOT NULL,
 FOREIGN KEY(room_id) REFERENCES rooms(id),
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
CREATE TABLE racks (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, block_id INT UNSIGNED NOT NULL,
 rack_number INT UNSIGNED NOT NULL, name VARCHAR(100) NOT NULL,
 UNIQUE KEY uq_rack_number(block_id,rack_number), CHECK(rack_number>0),
 FOREIGN KEY(block_id) REFERENCES blocks(id),
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
CREATE TABLE locations (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, rack_id INT UNSIGNED NOT NULL,
 position_number INT UNSIGNED NOT NULL, code VARCHAR(50) NOT NULL UNIQUE,
 name VARCHAR(100) NOT NULL, description TEXT, active BOOLEAN NOT NULL DEFAULT 1,
 legacy_code VARCHAR(50) NULL,
 UNIQUE KEY uq_rack_position(rack_id,position_number), CHECK(position_number>0),
 FOREIGN KEY(rack_id) REFERENCES racks(id),
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
CREATE TABLE products (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, sku VARCHAR(64) NOT NULL UNIQUE,
 name VARCHAR(160) NOT NULL, category_id INT UNSIGNED NOT NULL, unit VARCHAR(20) NOT NULL,
 movement_class ENUM('FAST','SLOW') NULL DEFAULT NULL,
 stock INT NOT NULL DEFAULT 0, location_id INT UNSIGNED NOT NULL,
 qr_token CHAR(36) NOT NULL UNIQUE, image MEDIUMTEXT, description TEXT,
 active BOOLEAN NOT NULL DEFAULT 1,
 active_location_id INT UNSIGNED GENERATED ALWAYS AS (CASE WHEN active=1 THEN location_id ELSE NULL END) STORED,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_active_location (active_location_id), CHECK(stock >= 0),
 FOREIGN KEY(category_id) REFERENCES categories(id), FOREIGN KEY(location_id) REFERENCES locations(id)
) ENGINE=InnoDB;
CREATE TABLE transaction_sequences (
 sequence_date DATE NOT NULL, kind VARCHAR(3) NOT NULL, last_number INT UNSIGNED NOT NULL,
 PRIMARY KEY(sequence_date,kind)
) ENGINE=InnoDB;
CREATE TABLE stock_transactions (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, transaction_number VARCHAR(40) NOT NULL UNIQUE,
 product_id INT UNSIGNED NOT NULL, location_id INT UNSIGNED NOT NULL,
 -- Snapshot kode rak agar perubahan nama/kode rak tidak mengubah histori.
 location_code VARCHAR(50) NOT NULL, room_name VARCHAR(100) NULL,
 transaction_type ENUM('IN','OUT','ADJUSTMENT') NOT NULL,
 quantity INT NULL, stock_before INT NULL, stock_after INT NULL,
 status ENUM('PENDING','APPROVED','CANCELLED') NOT NULL DEFAULT 'PENDING', notes TEXT,
 actor_id INT UNSIGNED NOT NULL,
 pending_product_id INT UNSIGNED GENERATED ALWAYS AS (CASE WHEN status='PENDING' THEN product_id ELSE NULL END) STORED,
 scanned_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), approved_at DATETIME(3), cancelled_at DATETIME(3),
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_pending_product(pending_product_id),
 FOREIGN KEY(product_id) REFERENCES products(id), FOREIGN KEY(location_id) REFERENCES locations(id),
 FOREIGN KEY(actor_id) REFERENCES users(id),
 CHECK (stock_before IS NULL OR stock_before >= 0), CHECK(stock_after IS NULL OR stock_after >= 0),
 CHECK(transaction_type='ADJUSTMENT' OR quantity IS NULL OR quantity > 0),
 CHECK(status <> 'APPROVED' OR (quantity IS NOT NULL AND stock_before IS NOT NULL AND stock_after IS NOT NULL AND approved_at IS NOT NULL))
) ENGINE=InnoDB;
CREATE INDEX idx_products_location ON products(location_id);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_movement_name ON products(movement_class,name);
CREATE INDEX idx_transactions_product ON stock_transactions(product_id);
CREATE INDEX idx_transactions_status ON stock_transactions(status);
CREATE INDEX idx_transactions_type ON stock_transactions(transaction_type);
CREATE INDEX idx_transactions_scanned ON stock_transactions(scanned_at);
CREATE INDEX idx_transactions_approved ON stock_transactions(approved_at);
-- Transactional outbox: SSE hanya membaca perubahan yang telah COMMIT.
CREATE TABLE stock_events (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, event_type VARCHAR(40) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
INSERT INTO categories(name) VALUES ('Elektronik'),('Kabel'),('ATK'),('Sparepart');
INSERT INTO rooms(name) VALUES ('Ruangan 1');
INSERT INTO blocks(room_id,code,name) VALUES (1,'A','Blok A'),(1,'B','Blok B');
INSERT INTO racks(block_id,rack_number,name) VALUES (1,1,'Rak A.01'),(1,2,'Rak A.02'),(2,1,'Rak B.01'),(1,3,'Rak A.03'),(1,5,'Rak A.05');
INSERT INTO locations(rack_id,position_number,code,name) VALUES
 (1,1,'A.01.01','Posisi 01'),(2,1,'A.02.01','Posisi 01'),(3,1,'B.01.01','Posisi 01'),
 (4,1,'A.03.01','Posisi 01'),(5,1,'A.05.01','Posisi 01'),
 (1,2,'A.01.02','Posisi 02'),(2,2,'A.02.02','Posisi 02'),(2,3,'A.02.03','Posisi 03');
INSERT INTO products(sku,name,category_id,unit,stock,location_id,qr_token) VALUES
 ('BRG-001','Mouse Logitech M331',1,'PCS',25,1,'550e8400-e29b-41d4-a716-446655440001'),
 ('BRG-002','Keyboard Logitech K120',1,'PCS',2,2,'550e8400-e29b-41d4-a716-446655440002'),
 ('BRG-003','HDMI Cable 2 Meter',2,'PCS',0,3,'550e8400-e29b-41d4-a716-446655440003');
-- Tidak ada password default. Buat akun dengan npm run user:create -- admin "PASSWORD-ANDA".
