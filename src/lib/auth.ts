import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { rows, execute, transaction } from "./db";
import { AppError } from "./errors";
export const cookieName = "warehouse_session";
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function session(token?: string) {
  const value = token ?? (await cookies()).get(cookieName)?.value;
  if (!value) return null;
  return (
    (
      await rows<{ id: number; username: string }>(
        "SELECT u.id,u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP(3)",
        [hash(value)],
      )
    )[0] ?? null
  );
}
export async function requireUser() {
  const user = await session();
  if (!user) throw new AppError("UNAUTHORIZED", "Silakan login dahulu.", 401);
  return user;
}
export function checkOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const allowed = [
    process.env.APP_URL,
    ...(process.env.ALLOWED_ORIGINS || "").split(","),
  ].filter(Boolean);
  // Browser writes require an explicitly configured origin. Hardware clients may omit Origin and use a valid session cookie.
  if (origin && !allowed.includes(origin))
    throw new AppError(
      "INVALID_ORIGIN",
      "Origin belum diizinkan. Periksa ALLOWED_ORIGINS.",
      403,
    );
  if (req.headers.get("sec-fetch-site") === "cross-site")
    throw new AppError(
      "INVALID_ORIGIN",
      "Permintaan lintas situs ditolak.",
      403,
    );
}
export async function login(username: string, password: string) {
  const key = hash(username.toLowerCase());
  await transaction(async (conn) => {
    await execute(
      "INSERT IGNORE INTO login_attempts(identity_hash) VALUES (?)",
      [key],
      conn,
    );
    const [rate] = await rows<{ attempts: number; age: number }>(
      "SELECT attempts,TIMESTAMPDIFF(SECOND,window_start,UTC_TIMESTAMP()) age FROM login_attempts WHERE identity_hash=? FOR UPDATE",
      [key],
      conn,
    );
    if (rate.age >= 900)
      await execute(
        "UPDATE login_attempts SET attempts=1,window_start=UTC_TIMESTAMP(3) WHERE identity_hash=?",
        [key],
        conn,
      );
    else {
      if (rate.attempts >= 10)
        throw new AppError(
          "RATE_LIMIT",
          "Terlalu banyak percobaan. Coba lagi setelah 15 menit.",
          429,
        );
      await execute(
        "UPDATE login_attempts SET attempts=attempts+1 WHERE identity_hash=?",
        [key],
        conn,
      );
    }
  });
  const [user] = await rows<{ id: number; password_hash: string }>(
    "SELECT id,password_hash FROM users WHERE username=?",
    [username],
  );
  const valid = await bcrypt.compare(
    password,
    user?.password_hash ??
      "$2b$12$C6UzMDM.H6dfI/f/IKcEe.7NXFdtUm17mDAeSBt.FWjR0VvS4u1yK",
  );
  if (!user || !valid)
    throw new AppError("INVALID_LOGIN", "Username atau password salah.", 401);
  const token = randomBytes(32).toString("hex");
  const hours = Math.min(
    72,
    Math.max(1, Number(process.env.SESSION_HOURS) || 12),
  );
  await execute(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,TIMESTAMPADD(HOUR,?,UTC_TIMESTAMP(3)))",
    [hash(token), user.id, hours],
  );
  await execute("DELETE FROM login_attempts WHERE identity_hash=?", [key]);
  await execute("DELETE FROM sessions WHERE expires_at<UTC_TIMESTAMP(3)");
  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: hours * 3600,
  });
}
export async function logout() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token)
    await execute("DELETE FROM sessions WHERE token_hash=?", [hash(token)]);
  jar.delete(cookieName);
}
