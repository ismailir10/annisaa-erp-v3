import { redirect } from "next/navigation";

// Legacy route. Kept as a server-side redirect so bookmarks + shared links
// (`/admin/assessments/scores?id=<id>`) continue to land on the canonical
// path-segment route (`/admin/assessments/<id>`). Remove after a grace period.
export default async function LegacyScoresRedirect({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  if (id) redirect(`/admin/assessments/${id}`);
  redirect("/admin/assessments");
}
