import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BottomNav } from "@/components/teacher/bottom-nav";

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session || session.role !== "TEACHER") redirect("/");

  return (
    <div className="min-h-screen bg-background pb-20">
      <main className="max-w-md mx-auto">{children}</main>
      <BottomNav />
    </div>
  );
}
