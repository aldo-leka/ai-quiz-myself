"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type ActiveUsersPoint = {
  label: string;
  activeUsers: number;
};

type ActiveUsersChartProps = {
  daily: ActiveUsersPoint[];
  weekly: ActiveUsersPoint[];
  monthly: ActiveUsersPoint[];
};

const chartConfig = {
  activeUsers: {
    label: "Active users",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export function ActiveUsersChart({ daily, weekly, monthly }: ActiveUsersChartProps) {
  const [range, setRange] = useState<"daily" | "weekly" | "monthly">("daily");

  const data = useMemo(() => {
    if (range === "weekly") return weekly;
    if (range === "monthly") return monthly;
    return daily;
  }, [daily, monthly, range, weekly]);

  return (
    <div className="space-y-4">
      <Tabs
        value={range}
        onValueChange={(next) => {
          if (next === "daily" || next === "weekly" || next === "monthly") {
            setRange(next);
          }
        }}
      >
        <TabsList>
          <TabsTrigger value="daily">Daily</TabsTrigger>
          <TabsTrigger value="weekly">Weekly</TabsTrigger>
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
        </TabsList>
      </Tabs>

      <ChartContainer config={chartConfig} className="h-[320px] w-full">
        <LineChart data={data}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
          <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
          <Line
            dataKey="activeUsers"
            type="monotone"
            stroke="var(--color-activeUsers)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ChartContainer>
    </div>
  );
}

