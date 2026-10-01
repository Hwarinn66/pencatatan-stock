import { hierarchyJoins, hierarchyFields } from "./locations";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { rows, execute, transaction, publish } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { productSchema, editProductSchema } from "@/validators";
import type { Product } from "@/types";
import { lockProduct, ensureUnlocked } from "./transactions";
import type { PoolConnection } from "mysql2/promise";
export const productSelect = `SELECT p.*,c.name category_name,l.code location_code,${hierarchyFields} FROM products p JOIN categories c ON c.id=p.category_id JOIN locations l ON l.id=p.location_id ${hierarchyJoins}`;
export async function getProduct(id: number) {
  const [p] = await rows<Product>(productSelect + " WHERE p.id=?", [id]);
  if (!p) throw new AppError("NOT_FOUND", "Barang tidak ditemukan.", 404);
  return p;
}
async function checkRack(
  locationId: number,
  productId: number,
  conn: PoolConnection,
) {
  const [rack] = await rows<{ code: string; active: number }>(
    "SELECT * FROM locations WHERE id=? FOR UPDATE",
    [locationId],
    conn,
  );
  if (!rack || !rack.active)
    throw new AppError(
      "INVALID_LOCATION",
      "Posisi tidak ditemukan atau tidak aktif.",
    );
  const [occupied] = await rows<{ name: string }>(
    "SELECT name FROM products WHERE location_id=? AND active=1 AND id<>?",
    [locationId, productId],
    conn,
  );
  if (occupied)
    throw new AppError(
      "LOCATION_IN_USE",
      `Posisi ${rack.code} sudah digunakan oleh ${occupied.name}. Silakan pilih posisi lain.`,
      409,
    );
}
async function checkCategory(id: number, conn: PoolConnection) {
  if (!(await rows("SELECT id FROM categories WHERE id=?", [id], conn)).length)
    throw new AppError("INVALID_CATEGORY", "Kategori tidak ditemukan.");
}
export async function createProduct(input: z.infer<typeof productSchema>) {
  return transaction(async (conn) => {
    await checkRack(input.location_id, 0, conn);
    await checkCategory(input.category_id, conn);
    const result = await execute(
      "INSERT INTO products(sku,name,category_id,unit,location_id,qr_token,image,description,movement_class) VALUES (?,?,?,?,?,?,?,?,?)",
      [
        input.sku,
        input.name,
        input.category_id,
        input.unit,
        input.location_id,
        randomUUID(),
        input.image ?? null,
        input.description ?? null,
        input.movement_class ?? null,
      ],
      conn,
    );
    await publish(conn, "product");
    return { id: result.insertId };
  });
}
export async function editProduct(
  id: number,
  input: z.infer<typeof editProductSchema>,
) {
  return transaction(async (conn) => {
    const current = await lockProduct(id, conn);
    await ensureUnlocked(current, conn);
    const updated = { ...current, ...input };
    if (updated.active) await checkRack(updated.location_id, id, conn);
    await checkCategory(updated.category_id, conn);
    await execute(
      "UPDATE products SET name=?,category_id=?,unit=?,location_id=?,description=?,image=?,active=?,movement_class=? WHERE id=?",
      [
        updated.name,
        updated.category_id,
        updated.unit,
        updated.location_id,
        updated.description ?? null,
        updated.image ?? null,
        updated.active ? 1 : 0,
        updated.movement_class ?? null,
        id,
      ],
      conn,
    );
    await publish(conn, "product");
    return { id };
  });
}
export async function regenerate(id: number) {
  return transaction(async (conn) => {
    const p = await lockProduct(id, conn);
    await ensureUnlocked(p, conn);
    await execute(
      "UPDATE products SET qr_token=? WHERE id=?",
      [randomUUID(), id],
      conn,
    );
    await publish(conn, "product");
    return { id };
  });
}
