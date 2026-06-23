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
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {label}
            </p>
            <p className="font-currency text-display font-bold mt-1.5 tracking-tight">
              {value}
            </p>
            {sublabel && (
              <p className="text-xs text-muted-foreground mt-1">{sublabel}</p>
            )}
          </div>
          <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center`}>
            <Icon size={20} className={c.icon} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
