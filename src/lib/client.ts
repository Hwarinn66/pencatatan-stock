export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export async function api<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch("/api/" + path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("auth/login"))
      location.href = "/login";
    throw new ApiError(
      body.message || "Permintaan gagal",
      body.code,
      body.details,
    );
  }
  return body.data as T;
}
export function write<T = unknown>(
  path: string,
  data: unknown = {},
  method = "POST",
) {
  return api<T>(path, { method, body: JSON.stringify(data) });
}
export function timestamp(
  value: string | null | undefined,
  timezone = "Asia/Jakarta",
) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value.replace(" ", "T") + "Z"));
}
