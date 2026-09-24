// =============================================================
// PURPOSE: Central API base URL + tiny fetch helpers
// Reads VITE_API_URL from frontend/.env
// =============================================================

const PRODUCTION_API_URL = "https://moctam.onrender.com";
const DEFAULT_TIMEOUT_MS = 60_000;

const rawBaseUrl = import.meta.env.VITE_API_URL;

if (!rawBaseUrl) {
  console.warn(
    `VITE_API_URL is not set — falling back to ${PRODUCTION_API_URL}`,
  );
}

/** Base URL of the backend, without a trailing slash. */
export const API_BASE_URL = (
  rawBaseUrl || PRODUCTION_API_URL
).replace(/\/+$/, "");

/** Build a full URL for a backend path, e.g. apiUrl("/api/feedback"). */
export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function toUserFacingFetchError(error: unknown): Error {
  if (error instanceof DOMException && error.name === "AbortError") {
    return new Error(
      "Request timed out. The server may be waking up — please try again in a moment.",
    );
  }
  if (error instanceof TypeError) {
    return new Error(
      "Cannot reach the server. Please try again in a moment.",
    );
  }
  if (error instanceof Error) return error;
  return new Error("Request failed.");
}

/** Best-effort ping so Render free tier can wake before a real API call. */
export async function wakeApi(timeoutMs = 20_000): Promise<void> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(apiUrl("/"), { method: "GET", signal: controller.signal });
  } catch {
    // Ignore — the real request will surface a clearer error.
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/** POST JSON to the backend and parse the JSON response. */
export async function apiPost<T>(
  path: string,
  body: unknown,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  return apiRequest<T>(path, {
    ...init,
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders(init) },
    body: JSON.stringify(body),
  }, timeoutMs);
}

/** GET JSON from the backend (optional Authorization via init.headers). */
export async function apiGet<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  return apiRequest<T>(path, {
    ...init,
    method: "GET",
    headers: { ...extraHeaders(init) },
  }, timeoutMs);
}

/** PUT JSON to the backend and parse the JSON response. */
export async function apiPut<T>(
  path: string,
  body: unknown,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  return apiRequest<T>(path, {
    ...init,
    method: "PUT",
    headers: { "Content-Type": "application/json", ...extraHeaders(init) },
    body: JSON.stringify(body),
  }, timeoutMs);
}

async function apiRequest<T>(
  path: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(apiUrl(path), {
      ...init,
      signal: controller.signal,
    });

    const text = await response.text();

    let data: T | null = null;
    if (text) {
      try {
        data = JSON.parse(text) as T;
      } catch {
        data = null;
      }
    }

    if (!response.ok) {
      const message =
        (data as { message?: string } | null)?.message ??
        text ??
        `Request failed with status ${response.status}`;
      throw new Error(message || `Request failed with status ${response.status}`);
    }

    return data as T;
  } catch (error) {
    throw toUserFacingFetchError(error);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function extraHeaders(init: RequestInit): Record<string, string> {
  const headers = init.headers;
  if (!headers) return {};
  return headers instanceof Headers
    ? Object.fromEntries(headers.entries())
    : (headers as Record<string, string>);
}
