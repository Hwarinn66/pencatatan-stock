-- Upgrade layout gudang: 5 ruangan, Blok A-D per ruangan, Rak 01-25 per blok.
-- Jalankan SEKALI pada database yang sudah ada setelah backup dan saat aplikasi berhenti.
SET time_zone = '+00:00';

-- Kode blok sekarang boleh berulang di ruangan berbeda, mis. Ruangan 1/A dan Ruangan 2/A.
ALTER TABLE blocks
  DROP INDEX code,
  ADD UNIQUE KEY uq_block_code(room_id,code);

-- Kode posisi seperti A.01.01 boleh sama di ruangan berbeda; room_name menjadi pembeda.
-- Keunikan posisi tetap dijamin oleh uq_rack_position(rack_id,position_number).
ALTER TABLE locations
  DROP INDEX code,
  ADD INDEX idx_locations_code(code);

INSERT IGNORE INTO rooms(name) VALUES
 ('Ruangan 1'),('Ruangan 2'),('Ruangan 3'),('Ruangan 4'),('Ruangan 5');

INSERT IGNORE INTO blocks(room_id,code,name)
 SELECT rm.id,c.code,CONCAT('Blok ',c.code)
 FROM rooms rm
 CROSS JOIN (SELECT 'A' code UNION ALL SELECT 'B' UNION ALL SELECT 'C' UNION ALL SELECT 'D') c
 WHERE rm.name IN ('Ruangan 1','Ruangan 2','Ruangan 3','Ruangan 4','Ruangan 5');

INSERT IGNORE INTO racks(block_id,rack_number,name)
 SELECT b.id,n.n,CONCAT('Rak ',b.code,'.',LPAD(n.n,2,'0'))
 FROM blocks b
 JOIN rooms rm ON rm.id=b.room_id
 CROSS JOIN (SELECT 1 n UNION ALL SELECT 2 n UNION ALL SELECT 3 n UNION ALL SELECT 4 n UNION ALL SELECT 5 n UNION ALL SELECT 6 n UNION ALL SELECT 7 n UNION ALL SELECT 8 n UNION ALL SELECT 9 n UNION ALL SELECT 10 n UNION ALL SELECT 11 n UNION ALL SELECT 12 n UNION ALL SELECT 13 n UNION ALL SELECT 14 n UNION ALL SELECT 15 n UNION ALL SELECT 16 n UNION ALL SELECT 17 n UNION ALL SELECT 18 n UNION ALL SELECT 19 n UNION ALL SELECT 20 n UNION ALL SELECT 21 n UNION ALL SELECT 22 n UNION ALL SELECT 23 n UNION ALL SELECT 24 n UNION ALL SELECT 25 n) n
 WHERE rm.name IN ('Ruangan 1','Ruangan 2','Ruangan 3','Ruangan 4','Ruangan 5')
   AND b.code IN ('A','B','C','D');

-- Posisi barang tidak dibuat otomatis. Buat nomor posisi secara manual sesuai kebutuhan.
