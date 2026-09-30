# Warehouse Stock Management — QR + MySQL

Aplikasi Next.js + TypeScript untuk gudang lokal Windows. Database **MySQL/MariaDB Laragon**, driver **mysql2/promise**, SQL langsung tanpa ORM. UI Tailwind CSS dengan komponen shadcn/ui, validasi Zod, QR generator `qrcode`, scanner kamera `html5-qrcode`, notifikasi Sonner.

## Alur utama

Tambah barang → stok awal 0 + UUID QR otomatis → cetak label → HP login `/scanner` → pilih IN/OUT → scan → transaksi PENDING (stok belum berubah) → komputer menerima SSE → isi quantity → approve → SQL transaction memperbarui stok dan histori → QR dapat dipakai lagi. Cancel mempertahankan histori dan tidak mengubah stok.

Fitur: dashboard 8 indikator, master barang/kategori/rak, foto opsional tersimpan di MySQL, detail dan histori barang, regenerasi QR, label cetak, antrean multi-barang, adjustment stock opname dengan alasan, filter/search/sorting/pagination, CSV, soft disable barang, login server session, feedback suara/vibrasi HP. Semua data operasional berasal dari MySQL; browser tidak mengakses database.

## Persyaratan

- Windows 10/11, Laragon dan MySQL **8.0.16+** atau MariaDB **10.6+**, engine InnoDB. Versi ini diperlukan untuk generated columns dan CHECK constraints.
- Node.js **22 LTS atau lebih baru**, npm, browser modern.
- 1 smartphone dan komputer dalam Wi-Fi/LAN yang sama. Untuk kamera melalui IP LAN: HTTPS dengan sertifikat yang **dipercaya smartphone**.
- Aplikasi dijalankan sebagai server Node.js (`next dev` atau `next start`), bukan melalui Apache/PHP Laragon.

## Instalasi Windows / Laragon

1. Clone/copy repository, lalu buka terminal di folder proyek:
   ```powershell
   git clone https://github.com/Hwarinn66/pencatatan-stock.git
   cd pencatatan-stock
   npm install
   ```
2. Buka Laragon → **Start MySQL**. Periksa port yang dipakai (biasanya 3306).
3. Buka HeidiSQL atau phpMyAdmin dari Laragon. Import **`database.sql`** sebagai SQL script. File berisi `CREATE DATABASE`, `USE`, tabel, foreign key, indexes, unique constraints dan seed. Import **sekali ke database baru**, bukan ke database produksi yang sudah terisi.
4. Pastikan database `warehouse_stock` dan tabelnya tersedia. HeidiSQL: File → Load SQL file → pilih `database.sql` → jalankan seluruh script. phpMyAdmin: tab Import → pilih file → Go.
5. Buat konfigurasi lokal:
   ```powershell
   Copy-Item .env.example .env.local
   ```
   Isi `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`. Credential tidak disimpan dalam source code. Untuk Laragon standar user sering `root` dengan password kosong; sesuaikan instalasi Anda.
6. Buat akun. **Tidak ada password default / akun publik dalam seed.** Gunakan password pribadi minimal 12 karakter, maksimal 72 byte:
   ```powershell
   npm run user:create -- admin "GantiDenganPasswordPribadiAnda"
   ```
   Password di-hash bcrypt cost 12. Perintah membuat akun baru, tidak menimpa akun yang ada. Hindari membagikan history terminal yang berisi password. Bila password mengandung `$` atau karakter khusus PowerShell, gunakan petik tunggal.
7. Jalankan:
   ```powershell
   npm run dev
   ```
8. Buka `http://localhost:3000`, login dengan akun tadi. Script dev sudah bind `0.0.0.0`.

Untuk pemakaian stabil setelah setup:

```powershell
npm run build
npm start
```

Restart server setelah mengubah `.env.local`. Jangan commit `.env.local`, `.env.test`, atau private key sertifikat.

## Seed data

| SKU     | Barang                 | Rak  | Stock | Status  |
| ------- | ---------------------- | ---- | ----: | ------- |
| BRG-001 | Mouse Logitech M331    | A-01 |    25 | Aman    |
| BRG-002 | Keyboard Logitech K120 | A-02 |     2 | Menipis |
| BRG-003 | HDMI Cable 2 Meter     | B-01 |     0 | Habis   |

Kategori: Elektronik, Kabel, ATK, Sparepart. Rak kosong: A-03 dan A-05. Stok seed adalah saldo awal contoh; tidak dihitung sebagai IN hari ini. Untuk uji tambah barang, gunakan SKU baru (mis. BRG-004) dan rak kosong karena BRG-001/A-01 sudah dipakai seed.

## Akses dari smartphone

1. Sambungkan HP dan komputer ke Wi-Fi yang sama; matikan client/AP isolation pada router jika aktif.
2. Di terminal Windows jalankan `ipconfig`, cari **IPv4 Address** adapter Wi-Fi aktif, misalnya `192.168.1.10`.
3. `npm run dev` sudah setara dengan `next dev --hostname 0.0.0.0`.
4. Tambahkan origin LAN ke konfigurasi, misalnya:
   ```dotenv
   APP_URL=http://localhost:3000
   ALLOWED_ORIGINS=http://localhost:3000,http://192.168.1.10:3000
   COOKIE_SECURE=false
   ```
5. Izinkan aplikasi Node.js/port TCP 3000 pada **Windows Firewall untuk profil Private**, bukan seluruh jaringan publik. Contoh PowerShell Administrator:
   ```powershell
   New-NetFirewallRule -DisplayName "Warehouse LAN 3000" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 -Profile Private -RemoteAddress LocalSubnet
   ```
6. Buka `http://192.168.1.10:3000/scanner` di HP dan login. Ini cukup untuk menguji koneksi dan input token; kamera pada IP HTTP biasanya **tidak tersedia**. Gunakan setup HTTPS berikut untuk scan kamera.

## HTTPS lokal untuk kamera smartphone

`localhost` pada HP menunjuk HP sendiri, bukan komputer. Membuka IP komputer lewat HTTP tidak menjadi secure context. Melewati warning sertifikat self-signed saja juga belum tentu mengaktifkan kamera.

Cara yang disarankan untuk prototype LAN adalah **mkcert** dengan local CA yang dipercaya kedua perangkat (lihat [dokumentasi resmi mkcert](https://github.com/FiloSottile/mkcert)).

1. Install mkcert di Windows (misalnya `winget install FiloSottile.mkcert`), lalu:
   ```powershell
   mkcert -install
   New-Item -ItemType Directory -Force certificates
   mkcert -key-file certificates/local-key.pem -cert-file certificates/local.pem localhost 127.0.0.1 192.168.1.10
   mkcert -CAROOT
   ```
   Ganti IP dengan IPv4 komputer. Bila IP berubah, buat ulang sertifikat atau tetapkan DHCP reservation.
2. Dari folder CA yang ditampilkan, salin **hanya `rootCA.pem`** ke HP (dapat diubah nama menjadi `rootCA.crt` untuk installer sertifikat). **Jangan menyalin `rootCA-key.pem` atau `local-key.pem`.**
3. Android: Settings → Security / Encryption & credentials → Install a certificate → CA certificate; menu berbeda menurut produsen. iOS: install profile sertifikat, lalu Settings → General → About → Certificate Trust Settings → aktifkan full trust untuk CA itu. Lakukan hanya untuk CA prototype milik Anda dan hapus trust setelah pengujian selesai.
4. Ubah `.env.local`:
   ```dotenv
   APP_URL=https://localhost:3000
   ALLOWED_ORIGINS=https://localhost:3000,https://192.168.1.10:3000
   COOKIE_SECURE=true
   ```
5. Jalankan `npm run dev:https`. Script memakai key/cert pada `certificates/`. Flag HTTPS hanya tersedia pada development Next.js, bukan `next start`.
6. Buka **`https://192.168.1.10:3000/scanner`** di HP. Pastikan tidak ada certificate warning, login kembali, izinkan kamera. Prioritas kamera belakang (`facingMode: environment`). Pilih IN atau OUT sebelum scan.
7. Untuk penggunaan produksi lokal, terminasi HTTPS dengan reverse proxy lokal (mis. Caddy/IIS) ke `next start`, pertahankan origin yang benar dan `COOKIE_SECURE=true`.

Lihat [Next.js CLI — HTTPS](https://nextjs.org/docs/app/api-reference/cli/next). Tidak diperlukan database cloud atau tunnel publik.

## Penggunaan

- **Tambah Barang**: SKU unik, nama, kategori, satuan dan rak wajib. Tidak ada input stok. Foto PNG/JPEG/WebP maksimum 1 MB, disimpan di MySQL; SVG tidak diterima.
- **QR Barang**: download SVG, Print QR dengan nama/SKU/rak. QR hanya memuat UUID, bukan SKU atau nomor rak. Regenerate membatalkan token lama; cetak dan ganti label setelahnya.
- **Scanner HP**: mode IN/OUT → scan → tampilkan hasil backend. Kamera berhenti sementara setelah pembacaan; tombol **Scan berikutnya** mengaktifkan lagi. Ini menghindari spam kamera, sementara aturan anti-double scan yang sebenarnya berada di database, tanpa cooldown waktu.
- **Transaksi Pending**: isi bilangan bulat positif, lihat preview, Approve atau Batalkan. Quantity dapat juga disimpan lewat endpoint PATCH. UI approve mengirim quantity secara atomik sehingga tidak ada ketergantungan penyimpanan draft.
- **Adjustment**: pilih barang, masukkan stok fisik nonnegatif, alasan dan konfirmasi approve. Backend memeriksa stok yang dilihat user masih sama; jika berubah, pilih ulang barang. Quantity histori adjustment adalah selisih, dapat negatif.
- **Edit/rak**: stok dan SKU tidak dapat diedit. Perpindahan rak membutuhkan konfirmasi; rak baru harus kosong. Histori menyimpan ID dan kode rak saat transaksi, tidak berubah saat master rak diedit.
- **Nonaktifkan**: record barang dipertahankan. QR nonaktif ditolak. Tidak dapat mengubah barang/rak/QR/adjustment saat ada pending; selesaikan dahulu.
- **Histori**: semua status tersedia, filter tanggal berdasarkan `scanned_at` di timezone aplikasi. IN/OUT hari ini pada dashboard dihitung berdasarkan `approved_at`, hanya APPROVED. CSV mengekspor seluruh hasil filter, bukan hanya halaman saat ini. Waktu CSV adalah UTC dari database. Formula berbahaya pada CSV dinetralkan.
- **Stock menipis**: halaman daftar mencakup `<=2`, termasuk 0. Card dashboard memisahkan stok 1–2 dan stok 0. Total Stock menjumlahkan unit lintas barang; periksa satuan masing-masing saat menafsirkan total.

## Konsistensi database dan keamanan

- Semua SQL melalui backend, menggunakan parameter `?` dan connection pool terpusat di `src/lib/db.ts`.
- Scan melakukan SQL transaction: lock product `FOR UPDATE`, validasi aktif/token/stock OUT, cari pending dengan lock, lalu insert pending + event outbox. Token diverifikasi lagi setelah lock, sehingga regenerasi bersamaan tidak mengaktifkan token lama.
- Generated column `pending_product_id` + UNIQUE adalah perlindungan tambahan satu pending per barang. `active_location_id` + UNIQUE menjamin satu barang aktif per rak.
- Approve/cancel/quantity selalu lock **product dulu, transaction kemudian**. Validasi status terminal, quantity, overflow dan stock terbaru. Stok tidak boleh negatif. Semua query satu transaksi menggunakan **connection mysql2 yang sama**. Gagal di mana pun → rollback.
- Nomor transaksi: counter harian per IN/OUT/ADJ, dibuat dalam transaction dengan upsert yang terkunci, ditambah unique constraint. Format `IN-YYYYMMDD-0001` (angka melebar bila >9999).
- SSE membaca `stock_events` outbox di MySQL tiap 1 detik. Revisi memakai MAX(id) dan COUNT(*) agar commit yang selesai tidak berurutan tetap terdeteksi. Event ditulis dalam transaction yang sama; tidak ada event untuk perubahan yang rollback. Mendukung beberapa proses Node karena tidak bergantung pada EventEmitter memory. Klien reconnect dan fallback polling 5 detik bila SSE gagal. Ini bukan binlog streaming; latensi normal sekitar 1 detik plus jaringan.
- Server session opaque random 256-bit; database hanya menyimpan SHA-256 token, cookie HttpOnly + SameSite=Lax, Secure bila dikonfigurasi. Expiry default 12 jam. Semua halaman operasional dan API termasuk scan/QR/SSE memerlukan login. Endpoint login adalah pengecualian yang memang harus publik; logout menghapus session database.
- Login dibatasi 10 percobaan per username per 15 menit. Mutasi browser memeriksa Origin terhadap `APP_URL`/`ALLOWED_ORIGINS`. Tidak ada wildcard. Database credential tidak dikirim ke browser.
- Timestamp disimpan dalam UTC (connection timezone +00:00); UI/nomor transaksi/rekap harian memakai `APP_TIMEZONE`, default `Asia/Jakarta`. Waktu HP tidak dipercaya.
- Gunakan akun DB aplikasi dengan izin seperlunya setelah import/setup (SELECT/INSERT/UPDATE/DELETE). Jangan buka port 3306 ke HP; HP hanya mengakses port aplikasi.
- Backup database via HeidiSQL/phpMyAdmin sebelum pemakaian sungguhan. Jangan mengubah stock secara manual lewat SQL saat operasi berjalan.

## API

Semua API berbasis JSON kecuali QR SVG, CSV dan SSE. Autentikasi menggunakan session cookie. Respons normal `{success:true,message,data}`, error `{success:false,code,message,details?}`. Validation 422, konflik 409, unauthenticated 401.

| Method       | Endpoint                                                          | Input/keterangan                                   |
| ------------ | ----------------------------------------------------------------- | -------------------------------------------------- |
| POST         | `/api/auth/login`                                                 | `{username,password}`                              |
| POST         | `/api/auth/logout`                                                | logout session                                     |
| GET          | `/api/auth/me`                                                    | user aktif                                         |
| POST         | `/api/scan`                                                       | `{qr_token,mode:"IN"\|"OUT"}`                      |
| GET          | `/api/pending-transactions`                                       | daftar pending                                     |
| PATCH        | `/api/transactions/:id/quantity`                                  | `{quantity}`                                       |
| POST         | `/api/transactions/:id/approve`                                   | `{quantity}` atau quantity tersimpan               |
| POST         | `/api/transactions/:id/cancel`                                    | `{}`                                               |
| GET/POST     | `/api/products`                                                   | list / create                                      |
| GET/PATCH    | `/api/products/:id`                                               | detail / edit, `{active:false}` untuk nonaktif     |
| GET/POST     | `/api/products/:id/qr`                                            | SVG / regenerate                                   |
| GET          | `/api/history/in`, `/api/history/out`, `/api/history/adjustments` | histori                                            |
| POST         | `/api/adjustments`                                                | `{product_id,physical_stock,expected_stock,notes}` |
| GET          | `/api/dashboard`                                                  | statistik                                          |
| GET/POST     | `/api/categories`, `/api/locations`                               | list/create                                        |
| PATCH/DELETE | `/api/categories/:id`, `/api/locations/:id`                       | edit/delete jika tidak direferensikan              |
| GET          | `/api/events`                                                     | SSE event `update`                                 |
| GET          | `/api/settings`                                                   | konfigurasi publik, tanpa credential               |

List products/history: `q,page,limit,sort,direction,location_id`; products menambah `category_id,stock=low|zero|safe,active=0|1|all`; history menambah `product_id,status,from,to`. CSV: `export=csv`. Field sort dipetakan ke daftar kolom internal, tidak diinterpolasi mentah dari input.

Scanner fisik dapat menggantikan kamera: pembaca keyboard-wedge mengisi token pada form pengujian di `/scanner`, atau client terautentikasi mengirim JSON ke `/api/scan`. Business logic tetap identik. Client nonbrowser tetap wajib menyertakan session hasil login.

## Struktur

```text
src/app/                  Next.js pages dan route handlers
src/components/ui/        Komponen shadcn/ui
src/components/workspace/ Dashboard, master data, QR, histori
src/components/scanner.tsx Reader kamera, terpisah dari stok
src/hooks/use-live.ts      SSE + fallback polling
src/lib/db.ts              mysql2 pool dan transaction helper
src/lib/auth.ts            Login, session, Origin check
src/services/             SQL dan business logic
src/validators/           Zod schema
src/types/                Tipe domain
scripts/create-user.ts    Pembuatan akun bcrypt
tests/                    Unit dan integration tests
database.sql              Schema + seed Laragon
```

## Pengujian

```powershell
npm run typecheck
npm test
npm run build
```

### Integration test MariaDB/MySQL sungguhan

Test akan **menghapus data dalam database test**, sehingga sengaja menolak DB_NAME yang tidak berakhiran `_test`.

1. Buat salinan schema khusus test:
   ```powershell
   (Get-Content database.sql -Raw).Replace('warehouse_stock','warehouse_stock_test') | Set-Content -Encoding utf8 database.test.sql
   ```
2. Import `database.test.sql` ke MySQL seperti sebelumnya. Jangan gunakan database operasional.
3. Copy `.env.example` menjadi `.env.test`; isi credential database dan `DB_NAME=warehouse_stock_test`.
4. Jalankan `npm run test:integration`.

Suite menguji create/QR/stock 0, IN/OUT, concurrent scan antar-mode, cancel/unlock, quantity melebihi stock, low stock, duplicate rack, simultaneous approvals, adjustment/stale stock, perpindahan rak, token lama dan barang nonaktif. Rollback diuji dengan **trigger test yang sengaja menggagalkan INSERT outbox setelah UPDATE stock**; pastikan user DB test mempunyai izin CREATE/DROP TRIGGER.

### Checklist penerimaan perangkat (wajib dilakukan di LAN Anda)

| Test | Langkah                                       | Hasil yang diharapkan                        |
| ---- | --------------------------------------------- | -------------------------------------------- |
| 1    | Buat BRG-004 pada A-03                        | Stock 0, QR dapat diunduh/cetak              |
| 2    | HP IN → scan → komputer qty 10 → approve      | Pending sebelum approve; stock 10 sesudahnya |
| 3    | HP OUT → qty 5 → approve                      | Stock turun menjadi 5                        |
| 4    | Scan barang sama dua kali, termasuk beda mode | Scan kedua ditolak dengan nomor pending      |
| 5    | Scan lalu cancel                              | Stock tetap; dapat scan kembali              |
| 6    | Stock 3, OUT qty 5                            | Ditolak, tetap 3                             |
| 7    | Scan OUT HDMI seed stock 0                    | STOK HABIS, tidak ada pending baru           |
| 8    | Stock 5, OUT 3                                | Stock 2, label merah                         |
| 9    | Buka komputer dan HP bersamaan; scan HP       | Pending muncul tanpa refresh (~1 detik)      |
| 10   | Buat barang baru di A-01 yang terpakai        | Pesan rak sudah digunakan                    |
| 11   | Jalankan integration rollback trigger         | Stock dan transaction sama-sama rollback     |

Periksa juga izin kamera ditolak, HTTPS trust, kamera belakang, beep setelah gesture memilih mode, vibrasi (opsional, tidak tersedia pada semua browser), print label fisik, login/logout, dan reconnect Wi-Fi. Automasi server tidak membuktikan kompatibilitas kamera/sertifikat pada HP tertentu.

## Troubleshooting

| Masalah                               | Penanganan                                                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MySQL tidak terkoneksi / ECONNREFUSED | Start MySQL Laragon; periksa host/port `.env.local`; cek log terminal Next.js.                                                                          |
| Port 3306 bentrok                     | Hentikan service MySQL lain atau ganti port Laragon dan `DB_PORT`.                                                                                      |
| Access denied                         | Cocokkan username/password dan izin host MySQL; restart Next setelah ubah env.                                                                          |
| Table/database tidak ditemukan        | Import seluruh `database.sql`; pastikan `DB_NAME=warehouse_stock`.                                                                                      |
| Import ulang gagal table exists       | Script untuk DB baru. Jangan drop database operasional; pakai database test terpisah.                                                                   |
| HP tidak bisa buka IP                 | Pastikan satu Wi-Fi, IPv4 benar, server bind 0.0.0.0, tanpa AP isolation/VPN.                                                                           |
| Firewall memblokir                    | Izinkan TCP 3000 pada profil Private dan LocalSubnet; jangan membuka semua port.                                                                        |
| INVALID_ORIGIN                        | Masukkan origin lengkap termasuk http/https, IP/hostname, port, tanpa slash akhir ke ALLOWED_ORIGINS. Restart.                                          |
| Login kembali terus                   | Cocokkan COOKIE_SECURE dengan HTTPS; login ulang di origin HP. Cookie localhost dan IP berbeda.                                                         |
| Kamera permission denied              | Izinkan kamera lewat pengaturan situs/browser; tutup aplikasi lain yang memakai kamera.                                                                 |
| MediaDevices tidak tersedia           | IP HTTP bukan secure context. Pasang dan trust CA lokal, gunakan HTTPS.                                                                                 |
| Sertifikat invalid                    | Pastikan IP ada di SAN sertifikat, CA dipercaya, tanggal perangkat benar, sertifikat dibuat ulang setelah IP berubah.                                   |
| QR tidak terbaca                      | Cetak cukup besar, sisakan margin putih, perbaiki cahaya/fokus. Scan QR dari halaman barang, bukan QR lain.                                             |
| QR invalid setelah regenerate         | Token lama sudah tidak berlaku; cetak ulang dan ganti label rak.                                                                                        |
| Barang masih pending                  | Approve atau cancel transaksi yang disebutkan, tidak perlu menunggu cooldown.                                                                           |
| Tidak bisa edit/nonaktifkan/adjust    | Selesaikan pending barang dahulu.                                                                                                                       |
| Realtime putus                        | Periksa jaringan/session; SSE reconnect otomatis dan polling 5s. Reverse proxy harus menonaktifkan buffering `/api/events` dan memberi timeout panjang. |
| STALE_STOCK                           | Pilih ulang barang agar stok sistem terbaru ditampilkan, periksa fisik, approve lagi.                                                                   |
| BUSY / deadlock                       | Transaksi rollback aman. Ulangi tindakan setelah proses lain selesai.                                                                                   |
| Foto ditolak                          | PNG/JPEG/WebP max 1 MB; perkecil gambar.                                                                                                                |
| Beep/vibrasi tidak terdengar          | Pilih mode lewat tap; cek silent mode. Vibration API tidak didukung semua browser.                                                                      |

## Rujukan

- [Next.js](https://nextjs.org/docs), [mysql2 prepared statements](https://sidorares.github.io/node-mysql2/docs), [shadcn/ui](https://ui.shadcn.com/docs)
- [html5-qrcode](https://scanapp.org/html5-qrcode-docs/), [mkcert](https://github.com/FiloSottile/mkcert)

### HTTP smoke test

Setelah integration test, jalankan server dengan konfigurasi database test yang sama (misalnya salin `.env.test` ke `.env.local` pada checkout test terpisah), kemudian `npm run build`, `npm start`, dan di terminal kedua `npm run test:http`. Default URL test `http://127.0.0.1:3000`; tambahkan origin ini ke `ALLOWED_ORIGINS`. Jangan jalankan terhadap database operasional. Test membuat akun/barang test, memeriksa autentikasi, Origin, validasi, QR SVG, SSE, quantity, approve, histori, CSV dan pencabutan session.
