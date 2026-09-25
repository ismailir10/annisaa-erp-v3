import { Suspense } from "react";
import { getSession, homePathForRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ParentHeader } from "@/components/parent/header";
import { ParentBottomNav } from "@/components/parent/bottom-nav";
import { getParentWithChildren } from "@/lib/parent-helpers";

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "GUARDIAN") redirect(homePathForRole(session.role));
  const { children: linkedChildren } = await getParentWithChildren(session);
  const childIds = linkedChildren.map((child) => child.studentId);

  return (
    <div className="min-h-screen bg-background pb-20">
      <Suspense fallback={<div className="h-14" />}>
        <ParentHeader userName={session.name ?? "Orang Tua"} childIds={childIds} />
      </Suspense>
      <main className="max-w-md mx-auto px-page-x py-6">{children}</main>
      {/* Suspense boundary required — ParentBottomNav calls useSearchParams()
          which opts the whole tree out of static rendering on Next 16
          without this wrapper. */}
      <Suspense fallback={null}>
        <ParentBottomNav childIds={childIds} />
      </Suspense>
    </div>
  );
}
