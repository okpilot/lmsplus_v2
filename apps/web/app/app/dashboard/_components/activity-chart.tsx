'use client'

import type { DailyActivity } from '@/lib/queries/analytics'
import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type ActivityChartProps = {
  data: DailyActivity[]
}

export function ActivityChart({ data }: ActivityChartProps) {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    setHydrated(true)
  }, [])

  if (!hydrated) {
    return <div className="h-64 animate-pulse rounded-lg bg-muted" />
  }

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-border">
        <p className="text-sm text-muted-foreground">No activity data yet.</p>
      </div>
    )
  }

  const formatted = data.map((d) => ({
    ...d,
    label: new Date(d.day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
  }))

  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="mb-3 text-sm font-medium">Daily Activity (Last 30 Days)</h3>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={formatted} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10 }}
            interval="preserveStartEnd"
            className="text-muted-foreground"
          />
          <YAxis tick={{ fontSize: 10 }} allowDecimals={false} className="text-muted-foreground" />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '6px',
              fontSize: '12px',
            }}
          />
          <Bar
            dataKey="correct"
            stackId="a"
            fill="hsl(var(--chart-2))"
            name="Correct"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="incorrect"
            stackId="a"
            fill="hsl(var(--chart-5))"
            name="Incorrect"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
