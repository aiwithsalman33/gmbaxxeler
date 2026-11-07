// Caddy serves the web app and API from one origin, so cookies stay same-site.
const BASE = "/api/v1";

export class ApiFailure extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;

/** Parallel 401s share one refresh, because refresh tokens are single-use. */
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${BASE}/auth/refresh`, { method: "POST", credentials: "include" })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

interface Options {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  form?: FormData;
}

async function send(path: string, { method = "GET", body, form }: Options): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
}

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  let response = await send(path, options);
  if (response.status === 401 && !path.startsWith("/auth/") && (await refreshSession())) {
    response = await send(path, options);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiFailure(response.status, data?.error?.code ?? "request_failed", data?.error?.message ?? "Something went wrong");
  }
  return data as T;
}

export function apiUrl(path: string): string {
  return `${BASE}${path}`;
}
