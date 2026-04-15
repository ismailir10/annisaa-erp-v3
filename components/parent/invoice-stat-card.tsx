"use client";

import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

export function InvoiceStatCard({
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
  color?: "primary" | "success" | "warning" | "destructive";
  index?: number;
}) {
  const colorMap = {
    primary: {
      bg: "bg-primary/10",
      text: "text-primary",
      icon: "text-primary",
      gradient: "from-primary/5 to-transparent",
    },
    success: {
      bg: "bg-success/10",
      text: "text-success",
      icon: "text-success",
      gradient: "from-success/5 to-transparent",
    },
    warning: {
      bg: "bg-warning/10",
      text: "text-warning",
      icon: "text-warning",
      gradient: "from-warning/5 to-transparent",
    },
    destructive: {
      bg: "bg-destructive/10",
      text: "text-destructive",
      icon: "text-destructive",
      gradient: "from-destructive/5 to-transparent",
    },
  };

  const c = colorMap[color];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4, ease: "easeOut" }}
      className="bg-gradient-to-br from-card to-muted/20 border border-border/50 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all"
    >
      <div className="flex items-center gap-4">
        <div className={`w-14 h-14 rounded-2xl ${c.bg} flex items-center justify-center shadow-inner`}>
          <Icon className="w-7 h-7" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {label}
          </p>
          <p className="font-currency text-3xl font-bold mt-1 tracking-tight">
            {value}
          </p>
          {sublabel && (
            <p className="text-xs text-muted-foreground mt-1">{sublabel}</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
