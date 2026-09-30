import mysql, {
  type Pool,
  type PoolConnection,
  type RowDataPacket,
  type ResultSetHeader,
} from "mysql2/promise";
const globalDb = globalThis as unknown as { warehousePool?: Pool };
export const db =
  globalDb.warehousePool ??
  mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    timezone: "Z",
    dateStrings: true,
    decimalNumbers: true,
    multipleStatements: false,
  });
if (!globalDb.warehousePool) db.pool.on("connection", (connection) => {
  connection.query("SET time_zone = '+00:00'");
});
if (process.env.NODE_ENV !== "production") globalDb.warehousePool = db;
export type Connection = Pool | PoolConnection;
export async function rows<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
  conn: Connection = db,
): Promise<T[]> {
  const [result] = await conn.execute<RowDataPacket[]>(sql, sqlValues(params));
  return result as T[];
}
export async function execute(
  sql: string,
  params: unknown[] = [],
  conn: Connection = db,
) {
  const [result] = await conn.execute<ResultSetHeader>(sql, sqlValues(params));
  return result;
}
export async function transaction<T>(
  fn: (conn: PoolConnection) => Promise<T>,
): Promise<T> {
  const conn = await db.getConnection();
  try {
    await conn.query("SET time_zone = '+00:00'");
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
export async function publish(conn: PoolConnection, type: string) {
  await execute(
    "INSERT INTO stock_events(event_type) VALUES (?)",
    [type],
    conn,
  );
}

function sqlValues(
  values: unknown[],
): (string | number | boolean | null | Date | Buffer)[] {
  return values.map((value) => {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value instanceof Date ||
      Buffer.isBuffer(value)
    )
      return value;
    throw new TypeError("Invalid SQL parameter");
  });
}
