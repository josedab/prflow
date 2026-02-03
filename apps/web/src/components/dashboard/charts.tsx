'use client';

import * as React from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ChartContainerProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function ChartContainer({
  title,
  description,
  children,
  className,
}: ChartContainerProps) {
  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">{title}</CardTitle>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

interface LineChartData {
  name: string;
  [key: string]: string | number;
}

interface SimpleLineChartProps {
  data: LineChartData[];
  dataKey: string;
  stroke?: string;
  height?: number;
}

export function SimpleLineChart({
  data,
  dataKey,
  stroke = 'hsl(var(--primary))',
  height = 200,
}: SimpleLineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="name"
          className="text-xs"
          tick={{ fill: 'hsl(var(--muted-foreground))' }}
        />
        <YAxis
          className="text-xs"
          tick={{ fill: 'hsl(var(--muted-foreground))' }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
          }}
        />
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={stroke}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

interface BarChartData {
  name: string;
  [key: string]: string | number;
}

interface SimpleBarChartProps {
  data: BarChartData[];
  dataKey: string;
  fill?: string;
  height?: number;
}

export function SimpleBarChart({
  data,
  dataKey,
  fill = 'hsl(var(--primary))',
  height = 200,
}: SimpleBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="name"
          className="text-xs"
          tick={{ fill: 'hsl(var(--muted-foreground))' }}
        />
        <YAxis
          className="text-xs"
          tick={{ fill: 'hsl(var(--muted-foreground))' }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
          }}
        />
        <Bar dataKey={dataKey} fill={fill} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

interface AreaChartData {
  name: string;
  [key: string]: string | number;
}

interface SimpleAreaChartProps {
  data: AreaChartData[];
  dataKey: string;
  stroke?: string;
  fill?: string;
  height?: number;
}

export function SimpleAreaChart({
  data,
  dataKey,
  stroke = 'hsl(var(--primary))',
  fill = 'hsl(var(--primary) / 0.2)',
  height = 200,
}: SimpleAreaChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="name"
          className="text-xs"
          tick={{ fill: 'hsl(var(--muted-foreground))' }}
        />
        <YAxis
          className="text-xs"
          tick={{ fill: 'hsl(var(--muted-foreground))' }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
          }}
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={stroke}
          fill={fill}
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface MultiLineChartProps {
  data: LineChartData[];
  lines: { dataKey: string; stroke: string; name: string }[];
  height?: number;
}

export function MultiLineChart({
  data,
  lines,
  height = 200,
}: MultiLineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="name"
          className="text-xs"
          tick={{ fill: 'hsl(var(--muted-foreground))' }}
        />
        <YAxis
          className="text-xs"
          tick={{ fill: 'hsl(var(--muted-foreground))' }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
          }}
        />
        <Legend />
        {lines.map((line) => (
          <Line
            key={line.dataKey}
            type="monotone"
            dataKey={line.dataKey}
            stroke={line.stroke}
            name={line.name}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export { LineChart, BarChart, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Line, Bar, Area };
