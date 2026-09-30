import { ZodError } from "zod";
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details?: unknown,
  ) {
    super(message);
  }
}
export function errorResponse(error: unknown) {
  if (error instanceof AppError)
    return Response.json(
      {
        success: false,
        code: error.code,
        message: error.message,
        details: error.details,
      },
      { status: error.status },
    );
  if (error instanceof ZodError)
    return Response.json(
      {
        success: false,
        code: "VALIDATION_ERROR",
        message: "Input tidak valid",
        details: error.flatten(),
      },
      { status: 422 },
    );
  if (error instanceof SyntaxError)
    return Response.json(
      {
        success: false,
        code: "INVALID_JSON",
        message: "Format JSON tidak valid",
      },
      { status: 400 },
    );
  const code = (error as { code?: string }).code;
  if (code === "ER_DUP_ENTRY")
    return Response.json(
      {
        success: false,
        code: "DUPLICATE",
        message: "SKU, rak aktif, nama, atau transaksi sudah digunakan.",
      },
      { status: 409 },
    );
  if (code === "ER_ROW_IS_REFERENCED_2")
    return Response.json(
      {
        success: false,
        code: "IN_USE",
        message: "Data masih digunakan dan tidak dapat dihapus.",
      },
      { status: 409 },
    );
  if (code === "ER_LOCK_DEADLOCK" || code === "ER_LOCK_WAIT_TIMEOUT")
    return Response.json(
      {
        success: false,
        code: "BUSY",
        message: "Data sedang diproses. Silakan ulangi.",
      },
      { status: 409 },
    );
  console.error("Warehouse API error:", error);
  return Response.json(
    {
      success: false,
      code: "SERVER_ERROR",
      message:
        "Server/database bermasalah. Periksa koneksi MySQL dan log server.",
    },
    { status: 500 },
  );
}
export function ok(data: unknown = null, message = "Berhasil") {
  return Response.json(
    { success: true, message, data },
    { headers: { "Cache-Control": "no-store" } },
  );
}
