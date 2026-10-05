import { db, execute } from "../src/lib/db";

try {
  const result = await execute("UPDATE products SET stock=0");
  console.log(`Stok berhasil direset ke 0 untuk ${result.affectedRows} barang.`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.end();
}
