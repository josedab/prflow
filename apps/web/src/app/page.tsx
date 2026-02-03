'use client';

import {
  GitPullRequest,
  Clock,
  Bug,
  TestTube,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { StatsCard } from '@/components/dashboard/stats-card';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import { QuickActions } from '@/components/dashboard/quick-actions';
import {
  ChartContainer,
  SimpleLineChart,
  SimpleBarChart,
  SimpleAreaChart,
} from '@/components/dashboard/charts';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// Mock data for charts
const prAnalyzedData = [
  { name: 'Mon', value: 12 },
  { name: 'Tue', value: 19 },
  { name: 'Wed', value: 15 },
  { name: 'Thu', value: 22 },
  { name: 'Fri', value: 18 },
  { name: 'Sat', value: 8 },
  { name: 'Sun', value: 5 },
];

const issuesBySeverityData = [
  { name: 'Critical', value: 3 },
  { name: 'High', value: 12 },
  { name: 'Medium', value: 28 },
  { name: 'Low', value: 45 },
];

const timeSavedData = [
  { name: 'Week 1', value: 12 },
  { name: 'Week 2', value: 18 },
  { name: 'Week 3', value: 24 },
  { name: 'Week 4', value: 32 },
];

const mockActivities = [
  {
    id: '1',
    type: 'pr_analyzed' as const,
    title: 'feat: Add user authentication',
    repository: 'acme/web-app',
    prNumber: 142,
    timestamp: new Date(Date.now() - 1000 * 60 * 5),
    status: 'success' as const,
  },
  {
    id: '2',
    type: 'issue_found' as const,
    title: 'fix: Memory leak in component',
    repository: 'acme/web-app',
    prNumber: 141,
    timestamp: new Date(Date.now() - 1000 * 60 * 30),
    status: 'warning' as const,
  },
  {
    id: '3',
    type: 'test_generated' as const,
    title: 'refactor: Optimize database queries',
    repository: 'acme/api',
    prNumber: 89,
    timestamp: new Date(Date.now() - 1000 * 60 * 60),
    status: 'success' as const,
  },
  {
    id: '4',
    type: 'pr_approved' as const,
    title: 'docs: Update API documentation',
    repository: 'acme/docs',
    prNumber: 34,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
    status: 'success' as const,
  },
  {
    id: '5',
    type: 'pr_merged' as const,
    title: 'chore: Bump dependencies',
    repository: 'acme/web-app',
    prNumber: 140,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3),
  },
];

async function fetchDashboardStats() {
  // In production, this would call the API
  // Simulating API delay
  await new Promise((resolve) => setTimeout(resolve, 500));
  return {
    prsAnalyzed: 247,
    prsAnalyzedTrend: 12,
    issuesFound: 89,
    issuesFoundTrend: -5,
    testsGenerated: 156,
    testsGeneratedTrend: 23,
    timeSaved: '48h',
    timeSavedTrend: 15,
  };
}

export default function Home() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchDashboardStats,
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your PR automation activity
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          <>
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          <>
            <StatsCard
              title="PRs Analyzed"
              value={stats?.prsAnalyzed ?? 0}
              description="Total this month"
              icon={GitPullRequest}
              trend={
                stats?.prsAnalyzedTrend
                  ? { value: stats.prsAnalyzedTrend, isPositive: true }
                  : undefined
              }
            />
            <StatsCard
              title="Issues Found"
              value={stats?.issuesFound ?? 0}
              description="Bugs & issues detected"
              icon={Bug}
              trend={
                stats?.issuesFoundTrend
                  ? {
                      value: Math.abs(stats.issuesFoundTrend),
                      isPositive: stats.issuesFoundTrend < 0,
                    }
                  : undefined
              }
            />
            <StatsCard
              title="Tests Generated"
              value={stats?.testsGenerated ?? 0}
              description="Automated tests created"
              icon={TestTube}
              trend={
                stats?.testsGeneratedTrend
                  ? { value: stats.testsGeneratedTrend, isPositive: true }
                  : undefined
              }
            />
            <StatsCard
              title="Time Saved"
              value={stats?.timeSaved ?? '0h'}
              description="Review time saved"
              icon={Clock}
              trend={
                stats?.timeSavedTrend
                  ? { value: stats.timeSavedTrend, isPositive: true }
                  : undefined
              }
            />
          </>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <ChartContainer
          title="PRs Analyzed"
          description="Pull requests analyzed per day"
        >
          <SimpleLineChart data={prAnalyzedData} dataKey="value" />
        </ChartContainer>

        <ChartContainer
          title="Issues by Severity"
          description="Distribution of detected issues"
        >
          <SimpleBarChart
            data={issuesBySeverityData}
            dataKey="value"
            fill="hsl(var(--chart-1))"
          />
        </ChartContainer>

        <ChartContainer
          title="Time Saved"
          description="Hours saved per week"
        >
          <SimpleAreaChart
            data={timeSavedData}
            dataKey="value"
            stroke="hsl(var(--chart-2))"
            fill="hsl(var(--chart-2) / 0.2)"
          />
        </ChartContainer>
      </div>

      {/* Activity & Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ActivityFeed activities={mockActivities} />
        </div>
        <QuickActions />
      </div>
    </div>
  );
}
