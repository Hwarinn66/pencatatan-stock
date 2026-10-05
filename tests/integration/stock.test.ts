import { mutateLocation, listLocations } from "../../src/services/locations";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db, rows, execute } from "../../src/lib/db";
import {
  createProduct,
  editProduct,
  regenerate,
} from "../../src/services/products";
import {
  scan,
  approve,
  cancel,
  adjustment,
} from "../../src/services/transactions";
// Only run on a disposable database whose name ends in _test. Import schema first.
if (!process.env.DB_NAME?.endsWith("_test"))
  throw new Error("Integration tests require DB_NAME ending in _test");
let user: number;
let category: number;
let location: number;
let product: number;
let token: string;
let room: number;
let block: number;
let rack: number;
before(async () => {
  await execute("DELETE FROM stock_events");
  await execute("DELETE FROM stock_transactions");
  await execute("DELETE FROM products");
  await execute("DELETE FROM locations");
  await execute("DELETE FROM racks");
  await execute("DELETE FROM blocks");
  await execute("DELETE FROM rooms");
  await execute("DELETE FROM categories");
  await execute("DELETE FROM sessions");
  await execute("DELETE FROM users");
  category = (await execute("INSERT INTO categories(name) VALUES ('Testing')"))
    .insertId;
  room = (
    await mutateLocation("rooms", "POST", undefined, { name: "Ruangan Test" })
  ).id!;
  block = (
    await mutateLocation("blocks", "POST", undefined, {
      room_id: room,
      code: "T",
      name: "Blok Test",
    })
  ).id!;
  rack = (
    await mutateLocation("racks", "POST", undefined, {
      block_id: block,
      rack_number: 1,
      name: "Rak 01",
    })
  ).id!;
  location = (
    await mutateLocation("locations", "POST", undefined, {
      rack_id: rack,
      position_number: 1,
      name: "Posisi 01",
    })
  ).id!;
  user = (
    await execute(
      "INSERT INTO users(username,password_hash) VALUES ('test','disabled')",
    )
  ).insertId;
});
after(async () => {
  await db.query("DROP TRIGGER IF EXISTS test_force_failure");
  await db.end();
});
async function p() {
  return (
    await rows<{ stock: number; qr_token: string; location_id: number }>(
      "SELECT * FROM products WHERE id=?",
      [product],
    )
  )[0];
}
test("end-to-end SQL inventory and concurrency", async (t) => {
  await t.test("1 create product, stock zero, auto QR", async () => {
    product = (
      await createProduct({
        sku: "BRG-001",
        name: "Mouse Logitech",
        unit: "PCS",
        category_id: category,
        location_id: location,
      })
    ).id;
    const item = await p();
    assert.equal(item.stock, 0);
    assert.match(item.qr_token, /^[0-9a-f-]{36}$/);
    token = item.qr_token;
  });
  await t.test(
    "multiple products in one rack, independent numbering per rack",
    async () => {
      const slot2 = (
        await mutateLocation("locations", "POST", undefined, {
          rack_id: rack,
          position_number: 2,
          name: "Posisi 02",
        })
      ).id!;
      const other = (
        await createProduct({
          sku: "SLOT-2",
          name: "Keyboard",
          unit: "PCS",
          category_id: category,
          location_id: slot2,
        })
      ).id;
      const available = await listLocations("locations");
      assert.equal(available.find((l) => l.id === location)?.code, "T.01.01");
      assert.equal(available.find((l) => l.id === slot2)?.code, "T.01.02");
      await assert.rejects(
        mutateLocation("locations", "POST", undefined, {
          rack_id: rack,
          position_number: 2,
          name: "Duplicate",
        }),
        { code: "ER_DUP_ENTRY" },
      );
      await assert.rejects(
        mutateLocation("blocks", "PATCH", block, {
          room_id: room,
          code: "CHANGED",
          name: "Block",
        }),
        { code: "IN_USE" },
      );
      const qr = (
        await rows<{ qr_token: string }>(
          "SELECT qr_token FROM products WHERE id=?",
          [other],
        )
      )[0].qr_token;
      const scans = await Promise.all([
        scan(token, "IN", user),
        scan(qr, "IN", user),
      ]);
      assert.equal(scans.length, 2);
      await Promise.all(scans.map((s) => cancel(s.id)));
      await assert.rejects(
        mutateLocation("locations", "PATCH", location, {
          rack_id: rack,
          position_number: 3,
          name: "Moved",
        }),
        { code: "IN_USE" },
      );
    },
  );
  await t.test("same block/rack/position code may repeat in another room", async () => {
    const room2 = (
      await mutateLocation("rooms", "POST", undefined, { name: "Ruangan Test 2" })
    ).id!;
    const block2 = (
      await mutateLocation("blocks", "POST", undefined, {
        room_id: room2,
        code: "T",
        name: "Blok Test",
      })
    ).id!;
    const rack2 = (
      await mutateLocation("racks", "POST", undefined, {
        block_id: block2,
        rack_number: 1,
        name: "Rak 01",
      })
    ).id!;
    const location2 = (
      await mutateLocation("locations", "POST", undefined, {
        rack_id: rack2,
        position_number: 1,
        name: "Posisi 01",
      })
    ).id!;
    const locations = await listLocations("locations");
    const first = locations.find((l) => l.id === location)!;
    const second = locations.find((l) => l.id === location2)!;
    assert.equal(first.code, "T.01.01");
    assert.equal(second.code, "T.01.01");
    assert.notEqual(first.room_id, second.room_id);
  });

  await t.test("7 OUT zero rejected, no pending created", async () => {
    await assert.rejects(scan(token, "OUT", user), { code: "STOCK_EMPTY" });
    assert.equal(
      (await rows("SELECT id FROM stock_transactions WHERE status='PENDING'"))
        .length,
      0,
    );
  });
  await t.test("2 IN scan does not change stock, approve +10", async () => {
    const s = await scan(token, "IN", user);
    assert.equal((await p()).stock, 0);
    const [pending] = await rows<{ quantity: number | null; status: string }>(
      "SELECT * FROM stock_transactions WHERE id=?",
      [s.id],
    );
    assert.equal(pending.quantity, null);
    assert.equal(pending.status, "PENDING");
    await approve(s.id, 10, user);
    assert.equal((await p()).stock, 10);
  });
  await t.test("3 OUT -5", async () => {
    const s = await scan(token, "OUT", user);
    await approve(s.id, 5, user);
    assert.equal((await p()).stock, 5);
  });
  await t.test(
    "4 concurrent double scan accepts exactly one across modes",
    async () => {
      const results = await Promise.allSettled([
        scan(token, "IN", user),
        scan(token, "OUT", user),
        scan(token, "IN", user),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const [pending] = await rows<{ id: number }>(
        "SELECT id FROM stock_transactions WHERE status='PENDING'",
      );
      await assert.rejects(regenerate(product), { code: "PRODUCT_PENDING" });
      await assert.rejects(editProduct(product, { active: false }), {
        code: "PRODUCT_PENDING",
      });
      await cancel(pending.id);
    },
  );
  await t.test(
    "5 cancel preserves stock and unlocks QR; terminal states immutable",
    async () => {
      const s = await scan(token, "IN", user);
      await cancel(s.id);
      assert.equal((await p()).stock, 5);
      await assert.rejects(approve(s.id, 1, user), {
        code: "ALREADY_PROCESSED",
      });
      const again = await scan(token, "IN", user);
      await cancel(again.id);
    },
  );
  await t.test("6 excessive OUT rollback and 8 low stock", async () => {
    const s = await scan(token, "OUT", user);
    await assert.rejects(approve(s.id, 10, user), { code: "STOCK_NOT_ENOUGH" });
    assert.equal((await p()).stock, 5);
    await approve(s.id, 3, user);
    assert.equal((await p()).stock, 2);
    await assert.rejects(approve(s.id, 3, user), { code: "ALREADY_PROCESSED" });
  });
  await t.test("10 duplicate occupied position rejected", async () => {
    await assert.rejects(
      createProduct({
        sku: "BRG-002",
        name: "Keyboard",
        unit: "PCS",
        category_id: category,
        location_id: location,
      }),
      { code: "LOCATION_IN_USE" },
    );
  });
  await t.test(
    "11 injected SQL failure after stock update rolls back everything",
    async () => {
      const s = await scan(token, "IN", user);
      await db.query(
        "CREATE TRIGGER test_force_failure BEFORE INSERT ON stock_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='injected failure'",
      );
      try {
        await assert.rejects(approve(s.id, 7, user));
        assert.equal((await p()).stock, 2);
        const [tx] = await rows<{ status: string; quantity: number | null }>(
          "SELECT * FROM stock_transactions WHERE id=?",
          [s.id],
        );
        assert.equal(tx.status, "PENDING");
        assert.equal(tx.quantity, null);
      } finally {
        await db.query("DROP TRIGGER test_force_failure");
      }
      await cancel(s.id);
    },
  );
  await t.test("concurrent approvals update stock only once", async () => {
    const s = await scan(token, "IN", user);
    const r = await Promise.allSettled([
      approve(s.id, 8, user),
      approve(s.id, 8, user),
    ]);
    assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal((await p()).stock, 10);
  });
  await t.test("adjustment audit and stale stock protection", async () => {
    await adjustment(
      {
        product_id: product,
        expected_stock: 10,
        physical_stock: 8,
        notes: "2 barang rusak",
      },
      user,
    );
    assert.equal((await p()).stock, 8);
    await assert.rejects(
      adjustment(
        {
          product_id: product,
          expected_stock: 10,
          physical_stock: 5,
          notes: "stale",
        },
        user,
      ),
      { code: "STALE_STOCK" },
    );
  });
  await t.test(
    "rack move preserves old history and invalidates regenerated QR",
    async () => {
      const rack2 = (
        await mutateLocation("racks", "POST", undefined, {
          block_id: block,
          rack_number: 2,
          name: "Rak 02",
        })
      ).id!;
      const loc2 = (
        await mutateLocation("locations", "POST", undefined, {
          rack_id: rack2,
          position_number: 1,
          name: "Posisi 01",
        })
      ).id!;
      assert.equal(
        (await listLocations("locations")).find((l) => l.id === loc2)?.code,
        "T.02.01",
      );
      await editProduct(product, { location_id: loc2 });
      const [old] = await rows<{ location_id: number; location_code: string }>(
        "SELECT * FROM stock_transactions WHERE product_id=? ORDER BY id LIMIT 1",
        [product],
      );
      assert.equal(old.location_id, location);
      assert.equal(old.location_code, "T.01.01");
      await regenerate(product);
      await assert.rejects(scan(token, "IN", user), { code: "QR_NOT_FOUND" });
      token = (await p()).qr_token;
      await editProduct(product, { active: false });
      await assert.rejects(scan(token, "IN", user), {
        code: "PRODUCT_INACTIVE",
      });
    },
  );
});
