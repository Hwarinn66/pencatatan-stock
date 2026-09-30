import bcrypt from "bcryptjs";
import { db, execute } from "../src/lib/db";
const [username, password] = process.argv.slice(2);
if (
  !username ||
  !password ||
  password.length < 12 ||
  Buffer.byteLength(password) > 72
) {
  console.error(
    'Gunakan: npm run user:create -- admin "PasswordMinimal12Karakter" (maks. 72 byte)',
  );
  process.exit(1);
}
try {
  await execute("INSERT INTO users(username,password_hash) VALUES (?,?)", [
    username,
    await bcrypt.hash(password, 12),
  ]);
  console.log("Akun berhasil dibuat.");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.end();
}
