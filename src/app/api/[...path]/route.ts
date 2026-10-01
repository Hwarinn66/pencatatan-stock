import { listLocations, mutateLocation } from "@/services/locations";
import { z } from "zod";
import QRCode from "qrcode";
import { ok, errorResponse, AppError } from "@/lib/errors";
import { checkOrigin, requireUser, login, logout } from "@/lib/auth";
import { rows } from "@/lib/db";
import * as schemas from "@/validators";
import * as stock from "@/services/transactions";
import * as products from "@/services/products";
import { listProducts, history, dashboard, csv } from "@/services/reports";
import { mutateLookup } from "@/services/lookups";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
async function handler(req: Request, { params }: Context) {
  try {
    const path = (await params).path;
    const [resource, key, action] = path;
    const method = req.method;
    const url = new URL(req.url);
    if (method !== "GET") checkOrigin(req);
    const body = async () => {
      if (Number(req.headers.get("content-length") || 0) > 2000000)
        throw new AppError("TOO_LARGE", "Foto terlalu besar.", 413);
      const text = await req.text();
      if (text.length > 2000000)
        throw new AppError("TOO_LARGE", "Foto terlalu besar.", 413);
      return JSON.parse(text || "{}");
    };
    if (resource === "auth" && key === "login" && method === "POST") {
      const input = schemas.loginSchema.parse(await body());
      await login(input.username, input.password);
      return ok(null, "Login berhasil");
    }
    const user = await requireUser();
    if (resource === "auth" && key === "logout" && method === "POST") {
      await logout();
      return ok();
    }
    if (resource === "auth" && key === "me" && method === "GET")
      return ok(user);
    const filter = () =>
      schemas.listSchema.parse(Object.fromEntries(url.searchParams));
    if (resource === "scan" && method === "POST") {
      const input = schemas.scanSchema.parse(await body());
      return ok(
        await stock.scan(input.qr_token, input.mode, user.id),
        "QR berhasil dibaca. Menunggu proses di komputer.",
      );
    }
    if (resource === "pending-transactions" && method === "GET")
      return ok(await stock.pending());
    if (resource === "transactions" && key) {
      const id = schemas.idSchema.parse(key);
      if (action === "quantity" && method === "PATCH") {
        const input = z
          .object({ quantity: schemas.quantitySchema })
          .parse(await body());
        return ok(await stock.setQuantity(id, input.quantity));
      }
      if (action === "approve" && method === "POST") {
        const input = z
          .object({ quantity: schemas.quantitySchema.optional() })
          .parse(await body());
        return ok(
          await stock.approve(id, input.quantity, user.id),
          "Transaksi berhasil di-approve",
        );
      }
      if (action === "cancel" && method === "POST")
        return ok(await stock.cancel(id), "Transaksi dibatalkan");
    }
    if (resource === "products") {
      if (!key && method === "GET") {
        const f = filter(),
          result = await listProducts(f);
        return f.export
          ? csv(
              result.items as unknown as Record<string, unknown>[],
              [
                "sku",
                "name",
                "category_name",
                "stock",
                "unit",
                "location_code",
                "room_name",
                "active",
              ],
              "barang",
            )
          : ok(result);
      }
      if (!key && method === "POST")
        return ok(
          await products.createProduct(
            schemas.productSchema.parse(await body()),
          ),
          "Barang berhasil dibuat",
        );
      const id = schemas.idSchema.parse(key);
      if (action === "qr" && method === "GET") {
        const p = await products.getProduct(id);
        return new Response(
          await QRCode.toString(p.qr_token, {
            type: "svg",
            width: 360,
            margin: 3,
            errorCorrectionLevel: "M",
          }),
          {
            headers: {
              "Content-Type": "image/svg+xml",
              "Cache-Control": "no-store",
            },
          },
        );
      }
      if (action === "qr" && method === "POST")
        return ok(
          await products.regenerate(id),
          "QR diganti. Cetak ulang label.",
        );
      if (!action && method === "GET") return ok(await products.getProduct(id));
      if (!action && method === "PATCH")
        return ok(
          await products.editProduct(
            id,
            schemas.editProductSchema.parse(await body()),
          ),
          "Barang diperbarui",
        );
    }
    if (
      resource === "history" &&
      method === "GET" &&
      ["in", "out", "adjustments"].includes(key)
    ) {
      const f = filter(),
        type = key === "adjustments" ? "ADJUSTMENT" : key.toUpperCase(),
        result = await history(type, f);
      return f.export
        ? csv(
            result.items as unknown as Record<string, unknown>[],
            [
              "transaction_number",
              "scanned_at",
              "approved_at",
              "cancelled_at",
              "sku",
              "name",
              "location_code",
              "room_name",
              "quantity",
              "stock_before",
              "stock_after",
              "status",
              "notes",
            ],
            "riwayat-" + key,
          )
        : ok(result);
    }
    if (resource === "adjustments" && method === "POST")
      return ok(
        await stock.adjustment(
          schemas.adjustmentSchema.parse(await body()),
          user.id,
        ),
        "Stock adjustment disimpan",
      );
    if (resource === "dashboard" && method === "GET")
      return ok(await dashboard());
    if (resource === "settings" && method === "GET")
      return ok({
        timezone: process.env.APP_TIMEZONE || "Asia/Jakarta",
        app_url: process.env.APP_URL,
        cookie_secure: process.env.COOKIE_SECURE === "true",
      });
    const masters = {
      rooms: schemas.roomSchema,
      blocks: schemas.blockSchema,
      racks: schemas.rackSchema,
      locations: schemas.locationSchema,
      categories: schemas.categorySchema,
    };
    if (Object.hasOwn(masters, resource)) {
      const kind = resource as keyof typeof masters;
      if (method === "GET" && !key)
        return ok(
          kind === "categories"
            ? await rows("SELECT * FROM categories ORDER BY name")
            : await listLocations(kind),
        );
      if (["POST", "PATCH", "DELETE"].includes(method)) {
        const id = key ? schemas.idSchema.parse(key) : undefined;
        if ((method === "POST" && id) || (method !== "POST" && !id))
          throw new AppError("INVALID_ID", "URL master data tidak sesuai.");
        const input =
          method === "DELETE" ? {} : masters[kind].parse(await body());
        return ok(
          kind === "categories"
            ? await mutateLookup(kind, method, id, input)
            : await mutateLocation(kind, method, id, input),
        );
      }
    }
    throw new AppError("NOT_FOUND", "Endpoint tidak ditemukan.", 404);
  } catch (error) {
    return errorResponse(error);
  }
}
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
