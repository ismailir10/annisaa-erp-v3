import { readApiError } from "@/lib/api/client-errors";

/**
 * `fetch` a JSON mutation from a client form. Resolves with the parsed body
 * (or `null` for an empty one); on a non-2xx response throws the `ApiError`
 * built by `readApiError`, so `applyServerErrors` can map field errors.
 */
export async function sendJson<T = unknown>(
  url: string,
  { method, body }: { method: "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown },
  fallback: string,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await readApiError(res, fallback);
  // Test doubles and 204s may carry no JSON body — treat that as `null`.
  return (await res.json().catch(() => null)) as T;
}
