import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ParentHeader } from "@/components/parent/header";
import { ParentBottomNav } from "@/components/parent/bottom-nav";

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.role !== "GUARDIAN") redirect("/");

  return (
    <div className="min-h-screen bg-background pb-20">
      <ParentHeader userName={session.name ?? "Orang Tua"} />
      <main className="max-w-md mx-auto px-page-x py-6">{children}</main>
      <ParentBottomNav />
    </div>
  );
}
