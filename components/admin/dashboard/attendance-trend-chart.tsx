"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/lib/format";

export type WeeklyTrend = {
  date: string; // YYYY-MM-DD
  present: number;
  late: number;
  absent: number;
};

const chartConfig = {
  present: { label: "Hadir", color: "var(--chart-1)" },
  late: { label: "Terlambat", color: "var(--chart-2)" },
  absent: { label: "Tidak Hadir", color: "var(--chart-3)" },
} satisfies ChartConfig;

export function AttendanceTrendChart({
  data,
  className,
}: {
  data: WeeklyTrend[];
  className?: string;
}) {
  const isEmpty =
    data.length === 0 || data.every((d) => d.present + d.late + d.absent === 0);

  const chartData = data.map((d) => ({
    label: formatDate(d.date, { weekday: "short" }),
    present: d.present,
    late: d.late,
    absent: d.absent,
  }));

  return (
    <Card className={`p-card ${className ?? ""}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">Tren Kehadiran (7 Hari Terakhir)</h3>
        <Link
          href="/admin/attendance"
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          Lihat detail <ArrowRight size={12} />
        </Link>
      </div>
      {isEmpty ? (
        <div className="h-32 flex items-center justify-center text-xs text-muted-foreground">
          Data kehadiran belum tersedia
        </div>
      ) : (
        <ChartContainer config={chartConfig} className="h-32 w-full">
          <BarChart data={chartData}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis hide />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Bar dataKey="present" stackId="a" fill="var(--color-present)" radius={[4, 4, 4, 4]} />
            <Bar dataKey="late" stackId="a" fill="var(--color-late)" radius={[4, 4, 4, 4]} />
            <Bar dataKey="absent" stackId="a" fill="var(--color-absent)" radius={[4, 4, 4, 4]} />
          </BarChart>
        </ChartContainer>
      )}
    </Card>
  );
}
