import { ReactNode } from "react";

export function StatsCardsRow({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {children}
    </div>
  );
}
