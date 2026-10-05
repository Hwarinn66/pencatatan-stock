import { db, execute, transaction } from "../src/lib/db";

if (!process.argv.includes("--yes")) {
  console.error(
    'Perintah ini menghapus SEMUA barang dan histori transaksi. Jalankan ulang dengan: npm run data:reset -- --yes',
  );
  process.exit(1);
}

try {
  await transaction(async (conn) => {
    await execute("DELETE FROM stock_transactions", [], conn);
    await execute("DELETE FROM products", [], conn);
    await execute("DELETE FROM transaction_sequences", [], conn);
    await execute("DELETE FROM stock_events", [], conn);
  });

  await execute("ALTER TABLE stock_transactions AUTO_INCREMENT=1");
  await execute("ALTER TABLE products AUTO_INCREMENT=1");
  await execute("ALTER TABLE stock_events AUTO_INCREMENT=1");

  console.log("Reset selesai.");
  console.log("- Semua barang dihapus");
  console.log("- Semua histori/pending transaksi dihapus");
  console.log("- Counter transaksi dan event direset");
  console.log("- Akun login, kategori, dan struktur lokasi gudang tetap dipertahankan");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.end();
}
