import { ReactNode } from "react";

const COLS_CLASS: Record<3 | 4 | 5 | 6, string> = {
  3: "grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6",
  4: "grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6",
  5: "grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6",
  6: "grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6",
};

export function StatsCardsRow({
  children,
  cols = 4,
}: {
  children: ReactNode;
  cols?: 3 | 4 | 5 | 6;
}) {
  return <div className={COLS_CLASS[cols]}>{children}</div>;
}
