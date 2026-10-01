import { rows, execute, transaction, publish } from "@/lib/db";
import { AppError } from "@/lib/errors";
export async function mutateLookup(
  kind: "categories",
  method: string,
  id: number | undefined,
  input: Record<string, unknown>,
) {
  return transaction(async (conn) => {
    if (
      id &&
      !(
        await rows(
          "SELECT id FROM categories WHERE id=? FOR UPDATE",
          [id],
          conn,
        )
      ).length
    )
      throw new AppError("NOT_FOUND", "Kategori tidak ditemukan.", 404);
    if (method === "DELETE") {
      if (
        (
          await rows(
            "SELECT id FROM products WHERE category_id=? LIMIT 1",
            [id],
            conn,
          )
        ).length
      )
        throw new AppError("IN_USE", "Kategori masih digunakan.", 409);
      await execute("DELETE FROM categories WHERE id=?", [id], conn);
    } else if (id)
      await execute(
        "UPDATE categories SET name=? WHERE id=?",
        [input.name, id],
        conn,
      );
    else
      id = (
        await execute(
          "INSERT INTO categories(name) VALUES (?)",
          [input.name],
          conn,
        )
      ).insertId;
    await publish(conn, "master");
    return { id };
  });
}
