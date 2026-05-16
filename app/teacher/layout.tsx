import { getSession, homePathForRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BottomNav } from "@/components/teacher/bottom-nav";
import { TeacherHeader } from "@/components/teacher/header";

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "TEACHER") redirect(homePathForRole(session.role));

  return (
    <div className="min-h-screen bg-background pb-20">
      <TeacherHeader userName={session.name ?? "Guru"} />
      <main className="max-w-md mx-auto px-page-x py-6">{children}</main>
      <BottomNav />
    </div>
  );
}
