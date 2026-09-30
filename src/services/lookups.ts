import { rows, execute, transaction, publish } from "@/lib/db";
import { AppError } from "@/lib/errors";
// Table identifier comes exclusively from this internal enum, never user input.
export async function mutateLookup(
  kind: "categories" | "locations",
  method: string,
  id: number | undefined,
  input: Record<string, unknown>,
) {
  return transaction(async (conn) => {
    if (id) {
      const [row] = await rows(
        `SELECT id FROM ${kind} WHERE id=? FOR UPDATE`,
        [id],
        conn,
      );
      if (!row) throw new AppError("NOT_FOUND", "Data tidak ditemukan.", 404);
    }
    if (method === "DELETE") {
      const column = kind === "categories" ? "category_id" : "location_id";
      if (
        (
          await rows(
            `SELECT id FROM products WHERE ${column}=? LIMIT 1`,
            [id],
            conn,
          )
        ).length
      )
        throw new AppError(
          "IN_USE",
          "Data masih digunakan barang. Pindahkan barang terlebih dahulu.",
          409,
        );
      await execute(`DELETE FROM ${kind} WHERE id=?`, [id], conn);
    } else if (kind === "categories") {
      if (id)
        await execute(
          "UPDATE categories SET name=? WHERE id=?",
          [input.name, id],
          conn,
        );
      else {
        const r = await execute(
          "INSERT INTO categories(name) VALUES (?)",
          [input.name],
          conn,
        );
        id = r.insertId;
      }
    } else {
      if (
        id &&
        input.active === false &&
        (
          await rows(
            "SELECT id FROM products WHERE location_id=? AND active=1 LIMIT 1",
            [id],
            conn,
          )
        ).length
      )
        throw new AppError("IN_USE", "Rak masih dipakai barang aktif.", 409);
      const values = [
        input.code,
        input.name,
        input.description ?? null,
        input.active === false ? 0 : 1,
      ];
      if (id)
        await execute(
          "UPDATE locations SET code=?,name=?,description=?,active=? WHERE id=?",
          [...values, id],
          conn,
        );
      else {
        const r = await execute(
          "INSERT INTO locations(code,name,description,active) VALUES (?,?,?,?)",
          values,
          conn,
        );
        id = r.insertId;
      }
    }
    await publish(conn, "master");
    return { id };
  });
}
