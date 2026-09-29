/**
 * Client-side sign-out shared by every portal shell (admin sidebar, teacher
 * and parent headers, parent profile button).
 *
 * `router.push("/")` after the logout POST left Next's client router cache
 * intact, so browser Back re-rendered the previous signed-in page (parent
 * profile: name, phone, email, children) with no server request — PAR-1 in the
 * 2026-09-29 full E2E review. `window.location.replace` is a full document
 * navigation: it discards all client state (router cache, in-memory data) and
 * replaces the signed-in history entry, so Back must hit the server, which
 * redirects to login. The logout response already carries `Cache-Control:
 * no-store`, which keeps the browser's own bfcache/HTTP cache out of it.
 *
 * Throws when the server refuses to end the session so the caller can tell the
 * user instead of pretending they are signed out.
 */
export async function signOut(
  home = "/",
  // Injectable so unit tests can observe the navigation (jsdom's
  // `location.replace` is non-configurable and cannot be spied on).
  navigate: (url: string) => void = (url) => window.location.replace(url),
): Promise<void> {
  const res = await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
  if (!res.ok) throw new Error("logout failed");
  navigate(home);
}
