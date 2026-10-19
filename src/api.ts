/** 같은 Origin의 /api를 부른다. 상태를 바꾸는 요청에는 /api/me에서 받은 CSRF 토큰을 붙인다. */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

let csrfToken = "";

export function setCsrfToken(token: string) {
  csrfToken = token;
}

export async function api<T = unknown>(path: string, method = "GET", body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers["X-CSRF-Token"] = csrfToken;
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    if (!res.ok) throw new ApiError(res.status, `서버 응답 오류 (${res.status})`);
  }
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error ?? `요청 실패 (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export const post = <T = unknown>(path: string, body: unknown = {}) => api<T>(path, "POST", body);
export const put = <T = unknown>(path: string, body: unknown = {}) => api<T>(path, "PUT", body);
export const del = <T = unknown>(path: string) => api<T>(path, "DELETE");
