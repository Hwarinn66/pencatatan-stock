import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { db, execute, rows } from "../../src/lib/db";
if (!process.env.DB_NAME?.endsWith("_test"))
  throw new Error("HTTP smoke tests require *_test database");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const username = "http-" + randomUUID().slice(0, 8),
  password = randomUUID();
let cookie = "";
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  auth = true,
) {
  return fetch(base + "/api/" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: base,
      ...(auth ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
try {
  await execute("INSERT INTO users(username,password_hash) VALUES (?,?)", [
    username,
    await bcrypt.hash(password, 12),
  ]);
  assert.equal(
    (await request("products", "GET", undefined, false)).status,
    401,
  );
  assert.equal(
    (
      await request(
        "scan",
        "POST",
        { qr_token: randomUUID(), mode: "IN" },
        false,
      )
    ).status,
    401,
  );
  assert.equal((await request("events", "GET", undefined, false)).status, 401);
  const logged = await request(
    "auth/login",
    "POST",
    { username, password },
    false,
  );
  assert.equal(logged.status, 200);
  const setCookie = logged.headers.get("set-cookie") || "";
  assert.match(setCookie, /HttpOnly/i);
  cookie = setCookie.split(";")[0];
  const bad = await fetch(base + "/api/scan", {
    method: "POST",
    headers: {
      Origin: "https://evil.example",
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(bad.status, 403);
  const invalid = await request("scan", "POST", {
    qr_token: "BRG-001",
    mode: "IN",
  });
  assert.equal(invalid.status, 422);
  const loc = await (
    await request("locations", "POST", {
      code: username,
      name: "HTTP test rack",
    })
  ).json();
  assert.equal(loc.success, true);
  const [category] = await rows<{ id: number }>(
    "SELECT id FROM categories LIMIT 1",
  );
  const created = await (
    await request("products", "POST", {
      sku: username,
      name: "HTTP test product",
      category_id: category.id,
      unit: "PCS",
      location_id: loc.data.id,
    })
  ).json();
  assert.equal(created.success, true);
  const product = (await (await request("products/" + created.data.id)).json())
    .data;
  assert.equal(product.stock, 0);
  const qr = await request("products/" + product.id + "/qr");
  assert.equal(qr.status, 200);
  assert.match(await qr.text(), /<svg/);
  const controller = new AbortController();
  const events = await fetch(base + "/api/events", {
    headers: { Cookie: cookie },
    signal: controller.signal,
  });
  assert.equal(events.status, 200);
  const reader = events.body!.getReader();
  let eventBuffer = "";
  const decoder = new TextDecoder();
  const event = async () => {
    while (!eventBuffer.includes("event: update")) {
      const { value, done } = await reader.read();
      assert.equal(done, false);
      eventBuffer += decoder.decode(value);
    }
    const match = eventBuffer.match(/"version":(\d+)/);
    eventBuffer = "";
    return Number(match?.[1]);
  };
  const first = await event();
  const scanned = await (
    await request("scan", "POST", { qr_token: product.qr_token, mode: "IN" })
  ).json();
  assert.equal(scanned.success, true);
  const next = await Promise.race([
    event(),
    new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error("SSE timeout")), 7000);
      timer.unref();
    }),
  ]);
  assert.ok(next > first);
  // A lower event ID may commit after a higher ID. Both commits must notify.
  const held = await db.getConnection();
  try {
    await held.beginTransaction();
    await held.execute(
      "INSERT INTO stock_events(event_type) VALUES ('late-commit')",
    );
    await execute(
      "INSERT INTO stock_events(event_type) VALUES ('early-commit')",
    );
    await event();
    await held.commit();
    await Promise.race([
      event(),
      new Promise<never>((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Late commit was missed by SSE")),
          7000,
        );
        timer.unref();
      }),
    ]);
  } finally {
    await held.rollback();
    held.release();
  }
  controller.abort();
  assert.equal(
    (await (await request("products/" + product.id)).json()).data.stock,
    0,
  );
  assert.equal(
    (await request("scan", "POST", { qr_token: product.qr_token, mode: "OUT" }))
      .status,
    409,
  );
  assert.equal(
    (
      await request(`transactions/${scanned.data.id}/quantity`, "PATCH", {
        quantity: 10,
      })
    ).status,
    200,
  );
  assert.equal(
    (await request(`transactions/${scanned.data.id}/approve`, "POST", {}))
      .status,
    200,
  );
  assert.equal(
    (await (await request("products/" + product.id)).json()).data.stock,
    10,
  );
  assert.equal(
    (
      await request(`transactions/${scanned.data.id}/approve`, "POST", {
        quantity: 10,
      })
    ).status,
    409,
  );
  const history = await (
    await request("history/in?product_id=" + product.id)
  ).json();
  assert.equal(history.data.items[0].stock_after, 10);
  const csv = await request("products?export=csv");
  assert.match(csv.headers.get("content-type") || "", /text\/csv/);
  assert.ok((await csv.text()).includes(username));
  const dashboard = await request("dashboard");
  assert.equal(dashboard.status, 200);
  await request("auth/logout", "POST", {});
  assert.equal((await request("products")).status, 401);
  console.log(
    "PASS: authenticated HTTP API, CSRF, validation, QR SVG, scan → SSE → quantity → approve → stock/history/CSV, session revocation.",
  );
} finally {
  await db.end();
}
