"use client"

import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis } from "recharts"
import type * as React from "react"

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

// Series take the palette's chart tokens in order, so /frontend-kit:theme recolors every chart.
const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]

export type ChartSeries = { key: string; label: string }

export function ChartCard({
  title,
  description,
  data,
  xKey,
  series,
  type = "area",
  action,
  formatX = (value) => String(value),
}: {
  title: string
  description?: string
  data: Record<string, string | number>[]
  xKey: string
  /** Up to five series; each one is a numeric key in `data`. */
  series: ChartSeries[]
  type?: "area" | "bar"
  action?: React.ReactNode
  formatX?: (value: string | number) => string
}) {
  const config = Object.fromEntries(
    series.slice(0, CHART_COLORS.length).map((s, i) => [s.key, { label: s.label, color: CHART_COLORS[i] }]),
  ) satisfies ChartConfig
  const keys = Object.keys(config)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div
            role="status"
            className="flex aspect-video items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground"
          >
            No data for this period yet.
          </div>
        ) : (
          <ChartContainer config={config} className="aspect-video w-full">
            {type === "bar" ? (
              <BarChart accessibilityLayer data={data}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} tickFormatter={formatX} />
                <ChartTooltip content={<ChartTooltipContent />} />
                {keys.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
                {keys.map((key) => (
                  <Bar key={key} dataKey={key} fill={`var(--color-${key})`} radius={4} />
                ))}
              </BarChart>
            ) : (
              <AreaChart accessibilityLayer data={data}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} tickFormatter={formatX} />
                <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                {keys.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
                {keys.map((key) => (
                  <Area
                    key={key}
                    dataKey={key}
                    type="monotone"
                    fill={`var(--color-${key})`}
                    fillOpacity={0.2}
                    stroke={`var(--color-${key})`}
                    strokeWidth={2}
                  />
                ))}
              </AreaChart>
            )}
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
