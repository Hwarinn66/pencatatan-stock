import { z } from "zod";
export const idSchema = z.coerce.number().int().positive().max(2147483647);
export const quantitySchema = z.number().int().positive().max(2147483647);
export const scanSchema = z.object({
  qr_token: z.string().uuid(),
  mode: z.enum(["IN", "OUT"]),
});
export const productSchema = z
  .object({
    sku: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(160),
    category_id: idSchema,
    unit: z.string().trim().min(1).max(20),
    location_id: idSchema,
    description: z.string().max(5000).nullable().optional(),
    image: z
      .string()
      .max(1500000)
      .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)
      .nullable()
      .optional(),
    active: z.boolean().optional(),
  })
  .strict();
export const editProductSchema = productSchema.omit({ sku: true }).partial();
export const adjustmentSchema = z.object({
  product_id: idSchema,
  physical_stock: z.number().int().min(0).max(2147483647),
  expected_stock: z.number().int().min(0),
  notes: z.string().trim().min(3).max(2000),
});
export const categorySchema = z.object({
  name: z.string().trim().min(1).max(100),
});
export const roomSchema = z.object({ name: z.string().trim().min(1).max(100) });
export const blockSchema = z.object({
  room_id: idSchema,
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{1,20}$/),
  name: z.string().trim().min(1).max(100),
});
export const rackSchema = z.object({
  block_id: idSchema,
  rack_number: z.coerce.number().int().min(1).max(999999),
  name: z.string().trim().min(1).max(100),
});
export const locationSchema = z.object({
  rack_id: idSchema,
  position_number: z.coerce.number().int().min(1).max(999999),
  name: z.string().trim().min(1).max(100),
  description: z.string().max(2000).nullable().optional(),
  active: z.boolean().optional(),
});
export const loginSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
});
export const listSchema = z.object({
  q: z.string().max(160).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().max(40).default("id"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  category_id: idSchema.optional(),
  location_id: idSchema.optional(),
  product_id: idSchema.optional(),
  room_id: idSchema.optional(),
  block_id: idSchema.optional(),
  rack_id: idSchema.optional(),
  stock: z.enum(["low", "zero", "safe"]).optional(),
  status: z.enum(["PENDING", "APPROVED", "CANCELLED"]).optional(),
  active: z.enum(["0", "1", "all"]).default("1"),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  export: z.enum(["csv"]).optional(),
});

// Product ordering is independent of history's newest-first default.
export const productListSchema = listSchema.extend({
  sort: z
    .enum([
      "name",
      "sku",
      "id",
      "stock",
      "out_total",
      "location",
      "fast",
      "slow",
      "movement",
    ])
    .default("name"),
  direction: z.enum(["asc", "desc"]).optional(),
  movement_days: z.coerce.number().int().min(1).max(365).default(30),
  fast_threshold: z.coerce.number().int().min(1).max(2147483647).default(10),
});
