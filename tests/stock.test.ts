import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateStock, stockLabel } from "../src/lib/stock";
import { quantitySchema, scanSchema, productSchema } from "../src/validators";
import { dateBoundary, csv } from "../src/services/reports";
test("IN and OUT arithmetic; stock never negative", () => {
  assert.equal(calculateStock(15, 10, "IN"), 25);
  assert.equal(calculateStock(25, 5, "OUT"), 20);
  assert.throws(() => calculateStock(3, 5, "OUT"), {
    code: "STOCK_NOT_ENOUGH",
  });
});
test("quantity validates positive bounded integers", () => {
  for (const n of [0, -5, 1.1, 2147483648, NaN]) {
    assert.equal(quantitySchema.safeParse(n).success, false);
    assert.throws(() => calculateStock(10, n, "IN"));
  }
  assert.equal(quantitySchema.safeParse("2").success, false);
  assert.throws(() => calculateStock(2147483647, 1, "IN"));
});
test("stock flags", () => {
  assert.equal(stockLabel(0), "STOK HABIS");
  assert.equal(stockLabel(calculateStock(5, 3, "OUT")), "STOK MENIPIS");
  assert.equal(stockLabel(3), "AMAN");
});
test("scan requires secure token and explicit mode", () => {
  assert.equal(
    scanSchema.safeParse({ qr_token: "BRG-001", mode: "IN" }).success,
    false,
  );
  assert.equal(
    scanSchema.safeParse({
      qr_token: "550e8400-e29b-41d4-a716-446655440001",
      mode: "IN",
    }).success,
    true,
  );
});
test("product create rejects stock assignment and SVG image", () => {
  const product = {
    sku: "TEST",
    name: "Test",
    category_id: 1,
    unit: "PCS",
    location_id: 1,
  };
  assert.equal(
    productSchema.safeParse({ ...product, stock: 10 }).success,
    false,
  );
  assert.equal(
    productSchema.safeParse({
      ...product,
      image: "data:image/svg+xml;base64,aaa",
    }).success,
    false,
  );
});
test("Indonesian date filters map to UTC boundaries", () => {
  process.env.APP_TIMEZONE = "Asia/Jakarta";
  assert.equal(dateBoundary("2026-09-30"), "2026-09-29 17:00:00");
  assert.equal(dateBoundary("2026-09-30", true), "2026-09-30 17:00:00");
});
test("CSV escapes quotes and spreadsheet formulas", async () => {
  const text = await csv(
    [{ name: '=HYPERLINK("x")' }],
    ["name"],
    "test",
  ).text();
  assert.ok(text.includes("'=HYPERLINK"));
  assert.ok(text.includes('""x""'));
});
