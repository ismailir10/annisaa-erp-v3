// /login — alias of /. The login form lives on the landing page now;
// keep this route as a redirect so any external bookmarks / docs that
// reference /login keep working.

import { redirect } from "next/navigation";

export default async function LoginRedirect({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const target = params.next ? `/?next=${encodeURIComponent(params.next)}` : "/";
  redirect(target);
}
