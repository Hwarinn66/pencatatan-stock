# Hasil verifikasi

## Lulus di lingkungan pengembangan

- Build produksi Next.js 16.3.7, TypeScript strict.
- 8 unit tests: aritmetika IN/OUT, validasi quantity dan overflow, status stok, token QR, penolakan input stock/foto SVG, batas tanggal Asia/Jakarta, CSV formula escaping.
- 14 tests termasuk parent suite pada **MariaDB 10.11.14**, memakai schema `database.sql` yang diimpor ke database test terpisah:
  - Create barang menghasilkan UUID dan stok 0.
  - OUT pada stok 0 ditolak tanpa membuat pending.
  - Scan IN tidak mengubah stok; approve menambah stok.
  - OUT mengurangi stok sesuai quantity.
  - Tiga scan bersamaan IN/OUT untuk barang sama hanya menghasilkan satu pending.
  - Cancel menjaga stok, membuka QR, dan tidak dapat diapprove ulang.
  - OUT melebihi stok ditolak; stok tetap.
  - Stock akhir 2 setelah OUT tervalidasi.
  - Posisi yang sama ditolak; beberapa barang dapat memakai rak yang sama di posisi berbeda.
  - Trigger test menyisipkan error SQL setelah UPDATE stock; perubahan produk dan transaksi keduanya rollback.
  - Dua approve bersamaan hanya mengubah stok satu kali.
  - Adjustment mencatat delta dan menolak stok tampilan yang sudah basi.
  - Pindah rak mempertahankan histori lokasi; regenerasi menolak QR lama; QR barang nonaktif ditolak.
- HTTP smoke test terhadap build produksi + MariaDB: autentikasi, cookie HttpOnly, endpoint terlindungi, Origin/CSRF, Zod, QR SVG, scan, SSE, quantity, approve, histori, CSV, logout/session revocation.

## Batas verifikasi

Browser Chromium pengujian gagal diluncurkan pada sandbox ini. Karena itu pemeriksaan visual browser, interaksi UI otomatis, kamera smartphone, fokus QR cetak, beep/vibrasi, Windows Firewall, dan trust sertifikat HP **belum diverifikasi pada perangkat fisik**. Gunakan checklist penerimaan di README untuk pengujian di komputer Laragon dan HP Anda.

Build sandbox memakai workaround sementara untuk introspeksi RSS Node.js karena `/proc` tidak tersedia. Workaround berada di luar repository, tidak mengubah aplikasi, dan tidak diperlukan pada Windows biasa.

Database pengujian adalah MariaDB Linux, bukan instalasi Laragon Windows Anda. Source tidak memakai SQLite/mock database, Prisma, PostgreSQL, atau layanan database cloud.

## Reproduksi

- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run test:integration` setelah menyiapkan `.env.test` dan database disposable `warehouse_stock_test`.
- `npm run test:http` saat server aplikasi menggunakan database test yang sama. Tambahkan `http://127.0.0.1:3000` ke ALLOWED_ORIGINS. Lihat README untuk detail.

## Verifikasi v2 lokasi bertingkat

- Unit: format A.01.01, A.01.02, A.02.01 dan nomor >99 tanpa pemotongan.
- MariaDB: dua barang aktif pada posisi berbeda dalam satu rak; scan pending kedua barang diperbolehkan; posisi duplikat ditolak; perubahan identitas posisi terpakai diblokir.
- Migrasi v1 → v2 diuji pada database sementara sungguhan, termasuk kode lama tidak standar, alias rak, stok/UUID/ID tetap, dan snapshot transaksi pending lama tidak ditulis ulang.
- Form memilih ruangan/blok/rak/posisi, pengelolaan master, dan label cetak tetap memerlukan pemeriksaan visual di perangkat pengguna sesuai batas verifikasi di atas.
