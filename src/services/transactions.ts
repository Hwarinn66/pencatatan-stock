import type { PoolConnection } from "mysql2/promise";
import { rows, execute, transaction, publish } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { calculateStock } from "@/lib/stock";
import type { Product, StockTransaction } from "@/types";
export async function lockProduct(id: number, conn: PoolConnection) {
  const [product] = await rows<Product>(
    "SELECT p.*,l.code location_code FROM products p JOIN locations l ON l.id=p.location_id WHERE p.id=? FOR UPDATE",
    [id],
    conn,
  );
  if (!product) throw new AppError("NOT_FOUND", "Barang tidak ditemukan.", 404);
  return product;
}
export async function ensureUnlocked(product: Product, conn: PoolConnection) {
  const [pending] = await rows<StockTransaction>(
    "SELECT * FROM stock_transactions WHERE product_id=? AND status='PENDING' LIMIT 1 FOR UPDATE",
    [product.id],
    conn,
  );
  if (pending)
    throw new AppError(
      "PRODUCT_PENDING",
      `Barang masih menunggu proses. ${product.name}. Nomor transaksi: ${pending.transaction_number}. Selesaikan transaksi sebelumnya terlebih dahulu.`,
      409,
      { product, transaction: pending },
    );
}
export async function nextNumber(type: string, conn: PoolConnection) {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.APP_TIMEZONE || "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const kind = type === "ADJUSTMENT" ? "ADJ" : type;
  await execute(
    "INSERT INTO transaction_sequences(sequence_date,kind,last_number) VALUES (?,?,1) ON DUPLICATE KEY UPDATE last_number=last_number+1",
    [day, kind],
    conn,
  );
  const [sequence] = await rows<{ last_number: number }>(
    "SELECT last_number FROM transaction_sequences WHERE sequence_date=? AND kind=?",
    [day, kind],
    conn,
  );
  return `${kind}-${day.replaceAll("-", "")}-${String(sequence.last_number).padStart(4, "0")}`;
}
export async function scan(token: string, mode: "IN" | "OUT", userId: number) {
  return transaction(async (conn) => {
    const [identity] = await rows<{ id: number }>(
      "SELECT id FROM products WHERE qr_token=?",
      [token],
      conn,
    );
    if (!identity)
      throw new AppError("QR_NOT_FOUND", "QR tidak terdaftar.", 404);
    const p = await lockProduct(identity.id, conn);
    if (p.qr_token !== token)
      throw new AppError(
        "QR_NOT_FOUND",
        "QR telah diganti. Gunakan label terbaru.",
        404,
      );
    if (!p.active)
      throw new AppError("PRODUCT_INACTIVE", "Barang sudah tidak aktif.", 409);
    await ensureUnlocked(p, conn);
    if (mode === "OUT" && p.stock === 0)
      throw new AppError(
        "STOCK_EMPTY",
        `STOK HABIS. ${p.name}. Stok: 0 ${p.unit}.`,
        409,
        { product: p },
      );
    const number = await nextNumber(mode, conn);
    const result = await execute(
      "INSERT INTO stock_transactions(transaction_number,product_id,location_id,location_code,transaction_type,actor_id) VALUES (?,?,?,?,?,?)",
      [number, p.id, p.location_id, p.location_code, mode, userId],
      conn,
    );
    await publish(conn, "scan");
    return {
      id: result.insertId,
      transaction_number: number,
      status: "PENDING",
      product: p,
      mode,
    };
  });
}
async function lockedTransaction(id: number, conn: PoolConnection) {
  const [identity] = await rows<{ product_id: number }>(
    "SELECT product_id FROM stock_transactions WHERE id=?",
    [id],
    conn,
  );
  if (!identity)
    throw new AppError("NOT_FOUND", "Transaksi tidak ditemukan.", 404);
  // Semua jalur mutasi memakai urutan lock yang sama: product, lalu transaction.
  const product = await lockProduct(identity.product_id, conn);
  const [item] = await rows<StockTransaction>(
    "SELECT * FROM stock_transactions WHERE id=? FOR UPDATE",
    [id],
    conn,
  );
  if (item.status !== "PENDING")
    throw new AppError("ALREADY_PROCESSED", "Transaksi sudah diproses.", 409);
  return { product, item };
}
export async function setQuantity(id: number, quantity: number) {
  return transaction(async (conn) => {
    const { product, item } = await lockedTransaction(id, conn);
    calculateStock(
      product.stock,
      quantity,
      item.transaction_type as "IN" | "OUT",
    );
    await execute(
      "UPDATE stock_transactions SET quantity=? WHERE id=?",
      [quantity, id],
      conn,
    );
    await publish(conn, "quantity");
    return { id, quantity };
  });
}
export async function approve(
  id: number,
  quantity: number | undefined,
  userId: number,
) {
  return transaction(async (conn) => {
    const { product, item } = await lockedTransaction(id, conn);
    if (!product.active)
      throw new AppError("PRODUCT_INACTIVE", "Barang sudah tidak aktif.", 409);
    const amount = quantity ?? item.quantity;
    if (amount === null)
      throw new AppError("INVALID_QUANTITY", "Isi quantity terlebih dahulu.");
    const after = calculateStock(
      product.stock,
      amount,
      item.transaction_type as "IN" | "OUT",
    );
    await execute(
      "UPDATE products SET stock=? WHERE id=?",
      [after, product.id],
      conn,
    );
    await execute(
      "UPDATE stock_transactions SET quantity=?,stock_before=?,stock_after=?,status='APPROVED',approved_at=UTC_TIMESTAMP(3),actor_id=? WHERE id=?",
      [amount, product.stock, after, userId, id],
      conn,
    );
    await publish(conn, "approved");
    return {
      id,
      quantity: amount,
      stock_before: product.stock,
      stock_after: after,
      type: item.transaction_type,
      unit: product.unit,
    };
  });
}
export async function cancel(id: number) {
  return transaction(async (conn) => {
    await lockedTransaction(id, conn);
    await execute(
      "UPDATE stock_transactions SET status='CANCELLED',cancelled_at=UTC_TIMESTAMP(3) WHERE id=?",
      [id],
      conn,
    );
    await publish(conn, "cancelled");
    return { id };
  });
}
export async function adjustment(
  input: {
    product_id: number;
    physical_stock: number;
    expected_stock: number;
    notes: string;
  },
  userId: number,
) {
  return transaction(async (conn) => {
    const p = await lockProduct(input.product_id, conn);
    if (!p.active)
      throw new AppError("PRODUCT_INACTIVE", "Barang sudah tidak aktif.", 409);
    await ensureUnlocked(p, conn);
    if (p.stock !== input.expected_stock)
      throw new AppError(
        "STALE_STOCK",
        "Stok berubah sejak ditampilkan. Muat ulang lalu periksa kembali.",
        409,
      );
    const delta = input.physical_stock - p.stock;
    if (delta === 0)
      throw new AppError("NO_CHANGE", "Stok fisik sama dengan stok sistem.");
    const number = await nextNumber("ADJUSTMENT", conn);
    await execute(
      "UPDATE products SET stock=? WHERE id=?",
      [input.physical_stock, p.id],
      conn,
    );
    const result = await execute(
      "INSERT INTO stock_transactions(transaction_number,product_id,location_id,location_code,transaction_type,quantity,stock_before,stock_after,status,notes,approved_at,actor_id) VALUES (?,?,?,?,'ADJUSTMENT',?,?,?,'APPROVED',?,UTC_TIMESTAMP(3),?)",
      [
        number,
        p.id,
        p.location_id,
        p.location_code,
        delta,
        p.stock,
        input.physical_stock,
        input.notes,
        userId,
      ],
      conn,
    );
    await publish(conn, "adjustment");
    return { id: result.insertId, transaction_number: number };
  });
}
export const transactionSelect =
  "SELECT t.*,p.name,p.sku,p.unit,p.stock FROM stock_transactions t JOIN products p ON p.id=t.product_id";
export function pending() {
  return rows<StockTransaction>(
    transactionSelect + " WHERE t.status='PENDING' ORDER BY t.scanned_at,t.id",
  );
}
