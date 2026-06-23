"use client";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ArrowRight, ChartNoAxesColumnIncreasing } from "lucide-react";
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
  late: { label: "Terlambat", color: "var(--chart-3)" },
  absent: { label: "Tidak Hadir", color: "var(--chart-4)" },
} satisfies ChartConfig;

const chartColors = {
  present: "#2F9EA3",
  late: "#D99A00",
  absent: "#D62F3E",
};

export function AttendanceTrendChart({
  data,
  className,
}: {
  data: WeeklyTrend[];
  className?: string;
}) {
  const isEmpty =
    data.length === 0 || data.every((d) => d.present + d.late + d.absent === 0);
  const totals = data.reduce(
    (acc, day) => ({
      present: acc.present + day.present,
      late: acc.late + day.late,
      absent: acc.absent + day.absent,
    }),
    { present: 0, late: 0, absent: 0 },
  );

  const chartData = data.map((d) => ({
    label: formatDate(d.date, { weekday: "short" }),
    present: d.present,
    late: d.late,
    absent: d.absent,
  }));

  return (
    <Card className={className}>
      <CardHeader className="border-b">
        <CardTitle>Tren Kehadiran</CardTitle>
        <CardDescription>7 hari kerja terakhir</CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/admin/employee-attendance" />}
          >
            Lihat detail
            <ArrowRight />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {isEmpty ? (
          <EmptyState
            icon={ChartNoAxesColumnIncreasing}
            title="Data kehadiran belum tersedia"
            description="Rekap harian akan muncul setelah absensi karyawan tercatat."
          />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <TrendPill
                label="Hadir"
                value={totals.present}
                className="text-primary"
              />
              <TrendPill
                label="Terlambat"
                value={totals.late}
                className="text-warning"
              />
              <TrendPill
                label="Tidak hadir"
                value={totals.absent}
                className="text-destructive"
              />
            </div>
            <ChartContainer
              config={chartConfig}
              className="aspect-auto h-[304px] w-full"
            >
              <AreaChart
                accessibilityLayer
                data={chartData}
                margin={{ top: 12, right: 12, left: 12, bottom: 0 }}
              >
                <CartesianGrid
                  vertical={false}
                  strokeDasharray="3 3"
                  strokeOpacity={0.28}
                />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent indicator="line" />}
                />
                <Area
                  dataKey="present"
                  type="linear"
                  fill={chartColors.present}
                  fillOpacity={0.28}
                  stroke={chartColors.present}
                  strokeWidth={3.25}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2 }}
                  isAnimationActive={false}
                />
                <Area
                  dataKey="late"
                  type="linear"
                  fill={chartColors.late}
                  fillOpacity={0.12}
                  stroke={chartColors.late}
                  strokeWidth={2.75}
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 2 }}
                  isAnimationActive={false}
                />
                <Area
                  dataKey="absent"
                  type="linear"
                  fill={chartColors.absent}
                  fillOpacity={0.12}
                  stroke={chartColors.absent}
                  strokeWidth={2.75}
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ChartContainer>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TrendPill({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="text-[11px] font-medium text-muted-foreground">
        {label}
      </div>
      <div className={`font-mono text-lg font-semibold ${className ?? ""}`}>
        {value}
      </div>
    </div>
  );
}
