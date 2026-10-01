import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db, rows, execute } from "../../src/lib/db";
import { listProducts, csv } from "../../src/services/reports";
import { productListSchema } from "../../src/validators";
if (!process.env.DB_NAME?.endsWith("_test"))
  throw new Error("Use a disposable *_test database");
after(async () => {
  await db.end();
});
test("inventory ordering and movement categories use approved OUT quantities", async (t) => {
  const prefix = "SORT-" + randomUUID().slice(0, 8);
  let room: number | undefined,
    category: number | undefined,
    user: number | undefined,
    block: number | undefined;
  const products: Record<string, number> = {};
  const slots: Record<string, number> = {};
  try {
    room = (await execute("INSERT INTO rooms(name) VALUES (?)", [prefix]))
      .insertId;
    category = (
      await execute("INSERT INTO categories(name) VALUES (?)", [prefix])
    ).insertId;
    user = (
      await execute("INSERT INTO users(username,password_hash) VALUES (?,?)", [
        prefix,
        "disabled",
      ])
    ).insertId;
    const code = "SRT" + prefix.replace(/[^A-Za-z]/g, "").toUpperCase();
    block = (
      await execute("INSERT INTO blocks(room_id,code,name) VALUES (?,?,?)", [
        room,
        code,
        prefix,
      ])
    ).insertId;
    const rackIds: Record<number, number> = {};
    for (const n of [1, 2, 10, 100])
      rackIds[n] = (
        await execute(
          "INSERT INTO racks(block_id,rack_number,name) VALUES (?,?,?)",
          [block, n, `Rack ${n}`],
        )
      ).insertId;
    for (const [name, stock, rack, position] of [
      ["Zeta", 100, 1, 1],
      ["Beta", 90, 1, 2],
      ["Gamma", 15, 2, 1],
      ["Omega", 3, 10, 1],
      ["Alpha", 5, 100, 1],
    ] as const) {
      slots[name] = (
        await execute(
          "INSERT INTO locations(rack_id,position_number,code,name) VALUES (?,?,?,?)",
          [
            rackIds[rack],
            position,
            `${code}.${String(rack).padStart(2, "0")}.${String(position).padStart(2, "0")}`,
            name,
          ],
        )
      ).insertId;
      products[name] = (
        await execute(
          "INSERT INTO products(sku,name,category_id,unit,stock,location_id,qr_token) VALUES (?,?,?,?,?,?,?)",
          [
            prefix + "-" + name,
            name,
            category,
            "PCS",
            stock,
            slots[name],
            randomUUID(),
          ],
        )
      ).insertId;
    }
    const add = async (
      name: string,
      quantity: number,
      type = "OUT",
      status = "APPROVED",
      days = 1,
    ) => {
      await execute(
        "INSERT INTO stock_transactions(transaction_number,product_id,location_id,location_code,transaction_type,quantity,stock_before,stock_after,status,actor_id,approved_at,scanned_at) VALUES (?,?,?,?,?,?,?,?,?,?,IF(?='APPROVED',TIMESTAMPADD(DAY,?,UTC_TIMESTAMP(3)),NULL),TIMESTAMPADD(DAY,?,UTC_TIMESTAMP(3)))",
        [
          randomUUID(),
          products[name],
          slots[name],
          "snapshot",
          type,
          quantity,
          Math.abs(quantity),
          0,
          status,
          user,
          status,
          -days,
          -days,
        ],
      );
    };
    await add("Alpha", 10);
    await add("Beta", 9);
    await add("Gamma", 30);
    await add("Zeta", 10);
    await add("Beta", 1000, "OUT", "APPROVED", 90);
    await add("Zeta", 500, "OUT", "APPROVED", 90);
    await add("Omega", 500, "OUT", "CANCELLED");
    await add("Omega", 500, "OUT", "PENDING");
    await add("Omega", 500, "IN");
    await add("Omega", -500, "ADJUSTMENT");
    // Future timestamps must not leak into the evaluation as-of time.
    await add("Omega", 999, "OUT", "APPROVED", -1);
    const query = (params: Record<string, unknown> = {}) =>
      listProducts(productListSchema.parse({ q: prefix, ...params }));
    const names = (result: Awaited<ReturnType<typeof query>>) =>
      result.items.map((p) => p.name);
    await t.test(
      "default name A-Z is independent of creation order",
      async () =>
        assert.deepEqual(names(await query()), [
          "Alpha",
          "Beta",
          "Gamma",
          "Omega",
          "Zeta",
        ]),
    );
    await t.test("largest stock first", async () =>
      assert.deepEqual(names(await query({ sort: "stock" })), [
        "Zeta",
        "Beta",
        "Gamma",
        "Alpha",
        "Omega",
      ]),
    );
    await t.test("largest lifetime OUT first, only approved OUT", async () => {
      const r = await query({ sort: "out_total" });
      assert.deepEqual(names(r), ["Beta", "Zeta", "Gamma", "Alpha", "Omega"]);
      assert.equal(r.items[0].out_total, 1009);
      assert.equal(r.items.find((p) => p.name === "Omega")?.out_total, 0);
    });
    await t.test("location uses numeric rack and position order", async () =>
      assert.deepEqual(names(await query({ sort: "location" })), [
        "Zeta",
        "Beta",
        "Gamma",
        "Omega",
        "Alpha",
      ]),
    );
    await t.test(
      "fast-only is alphabetical, not most quantity first",
      async () => {
        const r = await query({ sort: "fast", direction: "desc" });
        assert.deepEqual(names(r), ["Alpha", "Gamma", "Zeta"]);
        assert.equal(r.total, 3);
        assert.ok(r.items.every((p) => p.movement_class === "FAST"));
      },
    );
    await t.test(
      "slow-only includes zero OUT and is alphabetical",
      async () => {
        const r = await query({ sort: "slow" });
        assert.deepEqual(names(r), ["Beta", "Omega"]);
        assert.equal(r.total, 2);
        assert.equal(r.items[1].out_period, 0);
      },
    );
    await t.test("combined groups are fast A-Z then slow A-Z", async () =>
      assert.deepEqual(names(await query({ sort: "movement" })), [
        "Alpha",
        "Gamma",
        "Zeta",
        "Beta",
        "Omega",
      ]),
    );
    await t.test("threshold and window are configurable", async () => {
      assert.deepEqual(
        names(await query({ sort: "fast", fast_threshold: 20 })),
        ["Gamma"],
      );
      assert.deepEqual(
        names(await query({ sort: "fast", movement_days: 180 })),
        ["Alpha", "Beta", "Gamma", "Zeta"],
      );
    });
    await t.test(
      "filters, pagination and CSV keep group ordering",
      async () => {
        const r = await query({
          sort: "fast",
          page: 2,
          limit: 1,
          room_id: room,
        });
        assert.equal(r.total, 3);
        assert.deepEqual(names(r), ["Gamma"]);
        const all = await query({
          sort: "fast",
          page: 2,
          limit: 1,
          export: "csv",
        });
        assert.deepEqual(names(all), ["Alpha", "Gamma", "Zeta"]);
        const content = await csv(
          all.items as unknown as Record<string, unknown>[],
          ["name", "out_total", "out_period", "movement_class"],
          "test",
        ).text();
        assert.ok(content.indexOf("Alpha") < content.indexOf("Gamma"));
        assert.ok(!content.includes("Beta"));
      },
    );
  } finally {
    if (user)
      await execute("DELETE FROM stock_transactions WHERE actor_id=?", [user]);
    if (category)
      await execute("DELETE FROM products WHERE category_id=?", [category]);
    if (block) {
      await execute(
        "DELETE l FROM locations l JOIN racks r ON r.id=l.rack_id WHERE r.block_id=?",
        [block],
      );
      await execute("DELETE FROM racks WHERE block_id=?", [block]);
      await execute("DELETE FROM blocks WHERE id=?", [block]);
    }
    if (room) await execute("DELETE FROM rooms WHERE id=?", [room]);
    if (category)
      await execute("DELETE FROM categories WHERE id=?", [category]);
    if (user) await execute("DELETE FROM users WHERE id=?", [user]);
  }
});
