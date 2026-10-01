import { hierarchyJoins } from "./locations";
import { z } from "zod";
import { rows } from "@/lib/db";
import { listSchema } from "@/validators";
import { productSelect } from "./products";
import { transactionSelect } from "./transactions";
import type { Product, StockTransaction } from "@/types";
type Filters = z.infer<typeof listSchema>;
export async function listProducts(f: Filters) {
  const where = ["1=1"];
  const args: unknown[] = [];
  if (f.active !== "all") {
    where.push("p.active=?");
    args.push(Number(f.active));
  }
  if (f.q) {
    where.push(
      "(p.name LIKE ? OR p.sku LIKE ? OR l.code LIKE ? OR rm.name LIKE ?)",
    );
    args.push(...Array(4).fill(`%${f.q}%`));
  }
  if (f.category_id) {
    where.push("p.category_id=?");
    args.push(f.category_id);
  }
  if (f.location_id) {
    where.push("p.location_id=?");
    args.push(f.location_id);
  }
  if (f.room_id) {
    where.push("rm.id=?");
    args.push(f.room_id);
  }
  if (f.block_id) {
    where.push("b.id=?");
    args.push(f.block_id);
  }
  if (f.rack_id) {
    where.push("r.id=?");
    args.push(f.rack_id);
  }
  if (f.stock)
    where.push(
      { low: "p.stock<=2", zero: "p.stock=0", safe: "p.stock>2" }[f.stock],
    );
  const clause = " WHERE " + where.join(" AND ");
  const sorts: Record<string, string> = {
    id: "p.id",
    sku: "p.sku",
    name: "p.name",
    stock: "p.stock",
    location: "l.code",
  };
  const [{ total }] = await rows<{ total: number }>(
    "SELECT COUNT(*) total FROM products p JOIN locations l ON l.id=p.location_id" +
      hierarchyJoins +
      clause,
    args,
  );
  const items = await rows<Product>(
    productSelect +
      clause +
      ` ORDER BY ${sorts[f.sort] || "p.id"} ${f.direction},p.id ${f.export ? "" : `LIMIT ${f.limit} OFFSET ${(f.page - 1) * f.limit}`}`,
    args,
  );
  return { items, total, page: f.page, limit: f.limit };
}
// Date filters use the same configured timezone as display. Compute midnight offsets via Intl (including DST).
export function dateBoundary(day: string, next = false) {
  const [y, m, d] = day.split("-").map(Number);
  let target = Date.UTC(y, m - 1, d + (next ? 1 : 0));
  let utc = target;
  for (let n = 0; n < 3; n++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: process.env.APP_TIMEZONE || "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(utc));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const represented = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour"),
      get("minute"),
      get("second"),
    );
    utc += target - represented;
  }
  return new Date(utc).toISOString().slice(0, 19).replace("T", " ");
}
export async function history(type: string, f: Filters) {
  const where = ["t.transaction_type=?"];
  const args: unknown[] = [type];
  if (f.q) {
    where.push(
      "(p.name LIKE ? OR p.sku LIKE ? OR t.location_code LIKE ? OR t.transaction_number LIKE ? OR t.room_name LIKE ?)",
    );
    args.push(...Array(5).fill(`%${f.q}%`));
  }
  if (f.product_id) {
    where.push("t.product_id=?");
    args.push(f.product_id);
  }
  if (f.location_id) {
    where.push("t.location_id=?");
    args.push(f.location_id);
  }
  if (f.status) {
    where.push("t.status=?");
    args.push(f.status);
  }
  if (f.from) {
    where.push("t.scanned_at>=?");
    args.push(dateBoundary(f.from));
  }
  if (f.to) {
    where.push("t.scanned_at<?");
    args.push(dateBoundary(f.to, true));
  }
  const clause = " WHERE " + where.join(" AND ");
  const sorts: Record<string, string> = {
    id: "t.id",
    scanned_at: "t.scanned_at",
    approved_at: "t.approved_at",
    quantity: "t.quantity",
    sku: "p.sku",
  };
  const [{ total }] = await rows<{ total: number }>(
    "SELECT COUNT(*) total FROM stock_transactions t JOIN products p ON p.id=t.product_id" +
      clause,
    args,
  );
  const items = await rows<StockTransaction>(
    transactionSelect +
      clause +
      ` ORDER BY ${sorts[f.sort] || "t.id"} ${f.direction},t.id ${f.export ? "" : `LIMIT ${f.limit} OFFSET ${(f.page - 1) * f.limit}`}`,
    args,
  );
  return { items, total, page: f.page, limit: f.limit };
}
export async function dashboard() {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.APP_TIMEZONE || "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const from = dateBoundary(day),
    to = dateBoundary(day, true);
  const [products] = await rows(
    "SELECT COUNT(*) total_products,COALESCE(SUM(stock),0) total_stock,COALESCE(SUM(stock<=2 AND stock>0),0) low_stock,COALESCE(SUM(stock=0),0) zero_stock FROM products WHERE active=1",
  );
  const [trans] = await rows(
    "SELECT COALESCE(SUM(CASE WHEN transaction_type='IN' AND status='APPROVED' AND approved_at>=? AND approved_at<? THEN quantity ELSE 0 END),0) incoming,COALESCE(SUM(CASE WHEN transaction_type='OUT' AND status='APPROVED' AND approved_at>=? AND approved_at<? THEN quantity ELSE 0 END),0) outgoing,COALESCE(SUM(status='PENDING'),0) pending,COALESCE(SUM(scanned_at>=? AND scanned_at<?),0) today FROM stock_transactions",
    [from, to, from, to, from, to],
  );
  return { ...products, ...trans };
}
export function csv(
  items: Record<string, unknown>[],
  columns: string[],
  name: string,
) {
  const cell = (value: unknown) => {
    let s = value == null ? "" : String(value);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const body =
    "\uFEFF" +
    [
      columns.map(cell).join(","),
      ...items.map((row) => columns.map((c) => cell(row[c])).join(",")),
    ].join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
