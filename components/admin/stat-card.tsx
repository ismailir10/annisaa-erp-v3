"use client";

import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

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
    primary: { bg: "bg-[#5DB4B8]/10", text: "text-[#5DB4B8]", icon: "text-[#5DB4B8]" },
    success: { bg: "bg-[#00B37E]/10", text: "text-[#00B37E]", icon: "text-[#00B37E]" },
    warning: { bg: "bg-[#FF8C00]/10", text: "text-[#FF8C00]", icon: "text-[#FF8C00]" },
    error: { bg: "bg-[#FF3B3B]/10", text: "text-[#FF3B3B]", icon: "text-[#FF3B3B]" },
  };

  const c = colorMap[color];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4, ease: "easeOut" }}
      className="bg-card border border-border rounded-xl p-5 hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {label}
          </p>
          <p className="font-currency text-3xl font-bold mt-1.5 tracking-tight">
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
    </motion.div>
  );
}
