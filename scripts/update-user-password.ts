import bcrypt from "bcryptjs";
import { db, execute } from "../src/lib/db";

const [username, password] = process.argv.slice(2);

if (
  !username ||
  !password ||
  password.length < 8 ||
  Buffer.byteLength(password) > 72
) {
  console.error(
    'Gunakan: npm run user:password -- admin "PasswordMinimal8Karakter" (maks. 72 byte)',
  );
  process.exit(1);
}

try {
  const result = await execute(
    "UPDATE users SET password_hash=? WHERE username=?",
    [await bcrypt.hash(password, 12), username],
  );

  if (result.affectedRows === 0) {
    console.error(`User "${username}" tidak ditemukan.`);
    process.exitCode = 1;
  } else {
    console.log(`Password user "${username}" berhasil diubah.`);
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.end();
}
