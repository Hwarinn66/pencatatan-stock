import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import mysql from "mysql2/promise";
test("v1 migration preserves stock, QR, IDs and historical location snapshots", async () => {
  if (!process.env.DB_NAME?.endsWith("_test"))
    throw new Error("Use .env.test with DB_NAME ending _test");
  const name =
    "warehouse_migration_" + randomBytes(4).toString("hex") + "_test";
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });
  try {
    await c.query(
      (await readFile("tests/fixtures/v1.sql", "utf8")).replaceAll(
        "warehouse_stock",
        name,
      ),
    );
    await c.query(
      "INSERT INTO users(username,password_hash) VALUES ('test','disabled'); INSERT INTO stock_transactions(transaction_number,product_id,location_id,location_code,transaction_type,actor_id) VALUES ('IN-OLD-0001',1,1,'A-01','IN',1)",
    );
    await c.query(
      "INSERT INTO locations(code,name) VALUES ('custom shelf','Custom'),('A.01','Same physical rack alias')",
    );
    await c.query(
      await readFile("migrations/002_location_hierarchy.sql", "utf8"),
    );
    await c.query(
      await readFile("migrations/003_manual_movement_label.sql", "utf8"),
    );
    const [labels] = await c.query<mysql.RowDataPacket[]>(
      "SELECT sku,movement_class FROM products ORDER BY id",
    );
    assert.ok(labels.every((p) => p.movement_class === null));
    assert.equal(labels[0].sku, "BRG-001");
    const [raw] = await c.query<mysql.RowDataPacket[]>(
      "SELECT p.stock,p.qr_token,l.id,l.code,l.legacy_code FROM products p JOIN locations l ON l.id=p.location_id WHERE p.id=1",
    );
    assert.equal(raw[0].stock, 25);
    assert.equal(raw[0].id, 1);
    assert.equal(raw[0].code, "A.01.01");
    assert.equal(raw[0].legacy_code, "A-01");
    assert.equal(raw[0].qr_token, "550e8400-e29b-41d4-a716-446655440001");
    const [tx] = await c.query<mysql.RowDataPacket[]>(
      "SELECT * FROM stock_transactions LIMIT 1",
    );
    assert.equal(tx[0].status, "PENDING");
    assert.equal(tx[0].location_code, "A-01");
    assert.equal(tx[0].room_name, null);
    const [alias] = await c.query<mysql.RowDataPacket[]>(
      "SELECT code FROM locations WHERE legacy_code='A.01'",
    );
    assert.equal(alias[0].code, "A.01.02");
    const [legacy] = await c.query<mysql.RowDataPacket[]>(
      "SELECT code FROM locations WHERE legacy_code='custom shelf'",
    );
    assert.match(legacy[0].code, /^LEGACY\.\d+\.01$/);
    await assert.rejects(
      c.query(
        "INSERT INTO locations(rack_id,position_number,code,name) SELECT rack_id,position_number,'DUP','duplicate' FROM locations WHERE id=1",
      ),
    );
  } finally {
    await c.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await c.end();
  }
});
