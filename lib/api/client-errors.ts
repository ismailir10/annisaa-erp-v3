/**
 * Client-side error → user-facing message translation.
 *
 * Client components fetch JSON from our API routes and, on failure, need
 * to show the admin something readable. The naive `err instanceof Error
 * ? err.message : fallback` pattern is only safe when every `Error`
 * reaching the catch block was deliberately constructed with copy meant
 * for display. In practice it also catches `TypeError`s from a failed
 * `res.json()` call (e.g. a 500 with an empty body), network failures,
 * and anything else the runtime or a library throws — all of which leak
 * raw exception text (`"Unexpected end of JSON input"`, etc.) straight
 * into the UI.
 *
 * `ApiError` marks a message as author-approved for display. Throw it
 * (never a plain `Error`) at the point client code reads an API error
 * envelope — `if (!res.ok) throw new ApiError(body.error ?? "<Indonesian
 * fallback>")` — or otherwise deliberately writes a message meant for a
 * user. `userMessage()` then passes that message through and falls back
 * to the caller-supplied copy for every other error shape.
 */
export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Resolve a user-facing error message for a catch block.
 *
 * Returns `err.message` only when `err` is an `ApiError`. Every other
 * error — parse errors, network errors, `TypeError`s, anything else
 * thrown by the runtime or a library — falls back to `fallback`. The
 * raw error is always logged so debuggability isn't lost.
 */
export function userMessage(err: unknown, fallback: string): string {
  console.error(err);
  return err instanceof ApiError ? err.message : fallback;
}
