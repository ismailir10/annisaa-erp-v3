"use client";

import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  sublabel,
  icon: Icon,
  color = "primary",
  index = 0,
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  icon: LucideIcon;
  color?: "primary" | "success" | "warning" | "error";
  index?: number;
}) {
  const colorMap = {
    primary: { bg: "bg-primary/10", text: "text-primary", icon: "text-primary" },
    success: { bg: "bg-success/10", text: "text-success", icon: "text-success" },
    warning: { bg: "bg-warning/10", text: "text-warning", icon: "text-warning" },
    error: { bg: "bg-destructive/10", text: "text-destructive", icon: "text-destructive" },
  };

  const c = colorMap[color];

  return (
    <Card className="transition-shadow hover:shadow-md" data-index={index}>
      <CardContent>
        <div className="flex min-w-0 items-start justify-between gap-field">
          <div className="min-w-0">
            <p className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <p className="mt-1.5 font-currency text-display font-bold tracking-tight tabular-nums">
              {value}
            </p>
            {sublabel && (
              <p className="mt-1 text-small text-muted-foreground">{sublabel}</p>
            )}
          </div>
          <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${c.bg}`}>
            <Icon size={20} className={c.icon} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
