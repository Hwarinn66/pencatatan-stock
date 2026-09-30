import { AppError } from "./errors";
export function calculateStock(
  stock: number,
  quantity: number,
  type: "IN" | "OUT",
) {
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 2147483647)
    throw new AppError(
      "INVALID_QUANTITY",
      "Quantity harus bilangan bulat lebih besar dari 0.",
    );
  if (type === "OUT" && stock < quantity)
    throw new AppError(
      "STOCK_NOT_ENOUGH",
      `Stok tidak mencukupi. Stok tersedia: ${stock}. Quantity keluar: ${quantity}.`,
      409,
      { stock, quantity },
    );
  const after = type === "IN" ? stock + quantity : stock - quantity;
  if (after > 2147483647)
    throw new AppError("STOCK_OVERFLOW", "Stok melampaui batas sistem.");
  return after;
}
export function stockLabel(stock: number) {
  return stock === 0 ? "STOK HABIS" : stock <= 2 ? "STOK MENIPIS" : "AMAN";
}
