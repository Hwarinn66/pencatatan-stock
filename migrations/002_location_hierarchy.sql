-- Upgrade v1 -> v2, MySQL >=8.0.16 / MariaDB >=10.6. Run ONCE.
-- Stop app and BACK UP database first. DDL implicitly commits; restore backup on failure.
-- Select warehouse_stock in HeidiSQL/phpMyAdmin before running. No DROP DATABASE.
SET time_zone = '+00:00';
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

ALTER TABLE locations ADD COLUMN rack_id INT UNSIGNED NULL,
 ADD COLUMN position_number INT UNSIGNED NULL, ADD COLUMN legacy_code VARCHAR(50) NULL;
ALTER TABLE stock_transactions ADD COLUMN room_name VARCHAR(100) NULL;
CREATE TEMPORARY TABLE location_migration_map AS
SELECT id, code legacy_code,
 CASE WHEN code REGEXP '^[A-Za-z]{1,20}[-.][0-9]{1,6}$'
 AND CAST(SUBSTRING_INDEX(REPLACE(code,'-','.'),'.',-1) AS UNSIGNED)>0
 THEN UPPER(SUBSTRING_INDEX(REPLACE(code,'-','.'),'.',1)) ELSE 'LEGACY' END block_code,
 CASE WHEN code REGEXP '^[A-Za-z]{1,20}[-.][0-9]{1,6}$'
 AND CAST(SUBSTRING_INDEX(REPLACE(code,'-','.'),'.',-1) AS UNSIGNED)>0
 THEN CAST(SUBSTRING_INDEX(REPLACE(code,'-','.'),'.',-1) AS UNSIGNED) ELSE id END rack_number
FROM locations;
INSERT INTO rooms(name) VALUES ('Ruangan 1');
INSERT INTO blocks(room_id,code,name)
 SELECT 1,block_code,CONCAT('Blok ',block_code) FROM location_migration_map GROUP BY block_code;
INSERT INTO racks(block_id,rack_number,name)
 SELECT b.id,m.rack_number,CONCAT('Rak ',b.code,'.',m.rack_number)
 FROM location_migration_map m JOIN blocks b ON b.code=m.block_code GROUP BY b.id,m.rack_number,b.code;
CREATE TEMPORARY TABLE location_migration_positions AS
 SELECT m.*,r.id rack_id,ROW_NUMBER() OVER(PARTITION BY r.id ORDER BY m.id) position_number
 FROM location_migration_map m JOIN blocks b ON b.code=m.block_code
 JOIN racks r ON r.block_id=b.id AND r.rack_number=m.rack_number;
-- Remove only the old code index, then recreate uniqueness after atomic mapping update.
ALTER TABLE locations DROP INDEX code;
UPDATE locations l JOIN location_migration_positions m ON m.id=l.id
 SET l.rack_id=m.rack_id,l.position_number=m.position_number,l.legacy_code=m.legacy_code,
 l.code=CONCAT(m.block_code,'.',IF(m.rack_number<10,CONCAT('0',m.rack_number),m.rack_number),'.',IF(m.position_number<10,CONCAT('0',m.position_number),m.position_number));
ALTER TABLE locations MODIFY rack_id INT UNSIGNED NOT NULL, MODIFY position_number INT UNSIGNED NOT NULL,
 ADD UNIQUE KEY code(code), ADD UNIQUE KEY uq_rack_position(rack_id,position_number),
 ADD FOREIGN KEY(rack_id) REFERENCES racks(id), ADD CHECK(position_number>0);
DROP TEMPORARY TABLE location_migration_positions;
DROP TEMPORARY TABLE location_migration_map;
-- products.location_id, stock, UUID QR and historical location_code are unchanged.
