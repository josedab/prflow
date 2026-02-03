'use client';

import * as React from 'react';
import {
  TrendingUp,
  Clock,
  Users,
  GitPullRequest,
  AlertTriangle,
  CheckCircle,
  Download,
  RefreshCw,
  Target,
  Zap,
  Calendar,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChartContainer,
  SimpleLineChart,
  SimpleBarChart,
  MultiLineChart,
} from '@/components/dashboard/charts';
import { cn } from '@/lib/utils';

// Types matching the API
interface TeamOverview {
  teamId: string;
  teamName: string;
  repositories: number;
  members: number;
  activePRs: number;
  completedPRs: number;
}

interface CycleTimeMetrics {
  average: number;
  median: number;
  p90: number;
  p95: number;
  trend: number;
  breakdown: {
    timeToFirstReview: number;
    reviewTime: number;
    timeToMerge: number;
  };
}

interface ThroughputMetrics {
  prsOpened: number;
  prsMerged: number;
  prsAbandoned: number;
  mergeRate: number;
  averagePRSize: {
    files: number;
    additions: number;
    deletions: number;
  };
  byDay: Array<{ date: string; opened: number; merged: number }>;
}

interface QualityMetrics {
  issuesFound: number;
  issuesBySeverity: Record<string, number>;
  issuesByCategory: Record<string, number>;
  falsePositiveRate: number;
  testsGenerated: number;
  testAcceptanceRate: number;
  docsGenerated: number;
  docAcceptanceRate: number;
}

interface Bottleneck {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  metric: string;
  value: number;
  threshold: number;
  recommendation: string;
}

interface Benchmark {
  metric: string;
  teamValue: number;
  industryAverage: number;
  topPerformers: number;
  percentile: number;
  rating: 'excellent' | 'good' | 'average' | 'needs_improvement';
}

interface TeamAnalytics {
  overview: TeamOverview;
  cycleTime: CycleTimeMetrics;
  throughput: ThroughputMetrics;
  quality: QualityMetrics;
  bottlenecks: Bottleneck[];
  benchmarks: Benchmark[];
}

// Mock data for demo
const mockThroughputData = [
  { name: 'Mon', opened: 8, merged: 6 },
  { name: 'Tue', opened: 12, merged: 10 },
  { name: 'Wed', opened: 10, merged: 8 },
  { name: 'Thu', opened: 15, merged: 12 },
  { name: 'Fri', opened: 9, merged: 11 },
  { name: 'Sat', opened: 3, merged: 5 },
  { name: 'Sun', opened: 2, merged: 3 },
];

const mockCycleTimeData = [
  { name: 'Week 1', value: 24 },
  { name: 'Week 2', value: 22 },
  { name: 'Week 3', value: 18 },
  { name: 'Week 4', value: 16 },
];

const mockIssuesBySeverity = [
  { name: 'Critical', value: 5 },
  { name: 'High', value: 18 },
  { name: 'Medium', value: 42 },
  { name: 'Low', value: 67 },
];

export default function AnalyticsDashboard() {
  const [dateRange, setDateRange] = React.useState('30d');
  const [loading, setLoading] = React.useState(false);

  // Mock analytics data for demo
  const analytics: TeamAnalytics = {
    overview: {
      teamId: 'team-1',
      teamName: 'Engineering',
      repositories: 12,
      members: 8,
      activePRs: 23,
      completedPRs: 156,
    },
    cycleTime: {
      average: 18.5,
      median: 12.3,
      p90: 36.2,
      p95: 48.5,
      trend: -15,
      breakdown: {
        timeToFirstReview: 4.2,
        reviewTime: 8.1,
        timeToMerge: 6.2,
      },
    },
    throughput: {
      prsOpened: 89,
      prsMerged: 76,
      prsAbandoned: 5,
      mergeRate: 85.4,
      averagePRSize: {
        files: 8,
        additions: 245,
        deletions: 89,
      },
      byDay: [],
    },
    quality: {
      issuesFound: 132,
      issuesBySeverity: { critical: 5, high: 18, medium: 42, low: 67 },
      issuesByCategory: {},
      falsePositiveRate: 3.2,
      testsGenerated: 234,
      testAcceptanceRate: 78.5,
      docsGenerated: 45,
      docAcceptanceRate: 92.3,
    },
    bottlenecks: [
      {
        id: '1',
        type: 'review_time',
        severity: 'medium',
        description: 'Review time is above average',
        metric: 'Avg Review Time',
        value: 8.1,
        threshold: 6.0,
        recommendation: 'Consider adding more reviewers or breaking PRs into smaller chunks',
      },
    ],
    benchmarks: [
      { metric: 'Cycle Time (hours)', teamValue: 18.5, industryAverage: 24.0, topPerformers: 8.0, percentile: 72, rating: 'good' },
      { metric: 'Merge Rate (%)', teamValue: 85.4, industryAverage: 78.0, topPerformers: 95.0, percentile: 68, rating: 'good' },
      { metric: 'Test Acceptance (%)', teamValue: 78.5, industryAverage: 65.0, topPerformers: 90.0, percentile: 82, rating: 'excellent' },
    ],
  };

  const handleRefresh = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 1000);
  };

  const exportData = (format: 'json' | 'csv') => {
    const data = JSON.stringify(analytics, null, 2);
    const blob = new Blob([data], { type: format === 'json' ? 'application/json' : 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `team-analytics.${format}`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">
            Track PR metrics, identify bottlenecks, and benchmark performance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[140px]">
              <Calendar className="mr-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="1y">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportData('csv')}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <MetricCard
          icon={Users}
          label="Team Members"
          value={analytics.overview.members}
          className="bg-blue-500/10"
          iconColor="text-blue-500"
        />
        <MetricCard
          icon={GitPullRequest}
          label="Repositories"
          value={analytics.overview.repositories}
          className="bg-purple-500/10"
          iconColor="text-purple-500"
        />
        <MetricCard
          icon={Clock}
          label="Active PRs"
          value={analytics.overview.activePRs}
          className="bg-yellow-500/10"
          iconColor="text-yellow-500"
        />
        <MetricCard
          icon={CheckCircle}
          label="Completed PRs"
          value={analytics.overview.completedPRs}
          className="bg-green-500/10"
          iconColor="text-green-500"
        />
        <MetricCard
          icon={TrendingUp}
          label="Merge Rate"
          value={`${analytics.throughput.mergeRate.toFixed(1)}%`}
          className="bg-teal-500/10"
          iconColor="text-teal-500"
        />
        <MetricCard
          icon={Zap}
          label="Issues Found"
          value={analytics.quality.issuesFound}
          className="bg-orange-500/10"
          iconColor="text-orange-500"
        />
      </div>

      {/* Tabs for different analytics views */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="cycle-time">Cycle Time</TabsTrigger>
          <TabsTrigger value="quality">Quality</TabsTrigger>
          <TabsTrigger value="benchmarks">Benchmarks</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <ChartContainer
              title="PR Throughput"
              description="PRs opened vs merged per day"
              className="lg:col-span-2"
            >
              <MultiLineChart
                data={mockThroughputData}
                lines={[
                  { dataKey: 'opened', stroke: 'hsl(var(--chart-1))', name: 'Opened' },
                  { dataKey: 'merged', stroke: 'hsl(var(--chart-2))', name: 'Merged' },
                ]}
                height={250}
              />
            </ChartContainer>

            <ChartContainer title="Issues by Severity" description="Distribution of detected issues">
              <SimpleBarChart data={mockIssuesBySeverity} dataKey="value" height={250} />
            </ChartContainer>
          </div>

          {/* Bottlenecks */}
          {analytics.bottlenecks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  Identified Bottlenecks
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {analytics.bottlenecks.map((bottleneck) => (
                  <BottleneckCard key={bottleneck.id} bottleneck={bottleneck} />
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="cycle-time" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <CycleTimeCard
              label="Average"
              value={`${analytics.cycleTime.average.toFixed(1)}h`}
              subtitle="Time from PR open to merge"
            />
            <CycleTimeCard
              label="Median"
              value={`${analytics.cycleTime.median.toFixed(1)}h`}
              subtitle="50th percentile"
            />
            <CycleTimeCard
              label="P90"
              value={`${analytics.cycleTime.p90.toFixed(1)}h`}
              subtitle="90th percentile"
            />
            <CycleTimeCard
              label="P95"
              value={`${analytics.cycleTime.p95.toFixed(1)}h`}
              subtitle="95th percentile"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <ChartContainer title="Cycle Time Trend" description="Weekly average cycle time">
              <SimpleLineChart data={mockCycleTimeData} dataKey="value" height={200} />
            </ChartContainer>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">Cycle Time Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <BreakdownItem
                  label="Time to First Review"
                  value={analytics.cycleTime.breakdown.timeToFirstReview}
                  total={analytics.cycleTime.average}
                  color="bg-blue-500"
                />
                <BreakdownItem
                  label="Review Time"
                  value={analytics.cycleTime.breakdown.reviewTime}
                  total={analytics.cycleTime.average}
                  color="bg-purple-500"
                />
                <BreakdownItem
                  label="Time to Merge"
                  value={analytics.cycleTime.breakdown.timeToMerge}
                  total={analytics.cycleTime.average}
                  color="bg-green-500"
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="quality" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <QualityCard
              label="Issues Found"
              value={analytics.quality.issuesFound}
              icon={AlertTriangle}
            />
            <QualityCard
              label="False Positive Rate"
              value={`${analytics.quality.falsePositiveRate.toFixed(1)}%`}
              icon={Target}
              trend={{ value: -0.5, isPositive: true }}
            />
            <QualityCard
              label="Tests Generated"
              value={analytics.quality.testsGenerated}
              icon={CheckCircle}
            />
            <QualityCard
              label="Test Acceptance"
              value={`${analytics.quality.testAcceptanceRate.toFixed(1)}%`}
              icon={TrendingUp}
              trend={{ value: 5.2, isPositive: true }}
            />
          </div>

          <ChartContainer
            title="Issues by Severity"
            description="Distribution of issues detected"
          >
            <SimpleBarChart data={mockIssuesBySeverity} dataKey="value" height={250} />
          </ChartContainer>
        </TabsContent>

        <TabsContent value="benchmarks" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Industry Benchmarks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Metric</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Your Team</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Industry Avg</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Top 10%</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Percentile</th>
                      <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.benchmarks.map((benchmark) => (
                      <tr key={benchmark.metric} className="border-b">
                        <td className="py-3 px-4 text-sm font-medium">{benchmark.metric}</td>
                        <td className="py-3 px-4 text-sm text-right font-semibold">
                          {benchmark.teamValue.toFixed(1)}
                        </td>
                        <td className="py-3 px-4 text-sm text-right text-muted-foreground">
                          {benchmark.industryAverage.toFixed(1)}
                        </td>
                        <td className="py-3 px-4 text-sm text-right text-muted-foreground">
                          {benchmark.topPerformers.toFixed(1)}
                        </td>
                        <td className="py-3 px-4 text-sm text-right">
                          {benchmark.percentile.toFixed(0)}%
                        </td>
                        <td className="py-3 px-4 text-center">
                          <RatingBadge rating={benchmark.rating} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  className,
  iconColor,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  className?: string;
  iconColor?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center mb-3', className)}>
          <Icon className={cn('h-5 w-5', iconColor)} />
        </div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

function CycleTimeCard({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: string;
  subtitle: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <div className="text-3xl font-bold">{value}</div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </CardContent>
    </Card>
  );
}

function BreakdownItem({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const percentage = (value / total) * 100;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-medium">{value.toFixed(1)}h</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function QualityCard({
  label,
  value,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  trend?: { value: number; isPositive: boolean };
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <Icon className="h-5 w-5 text-muted-foreground" />
          {trend && (
            <span
              className={cn(
                'text-xs font-medium',
                trend.isPositive ? 'text-green-600' : 'text-red-600'
              )}
            >
              {trend.isPositive ? '+' : ''}
              {trend.value}%
            </span>
          )}
        </div>
        <div className="mt-2">
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function BottleneckCard({ bottleneck }: { bottleneck: Bottleneck }) {
  const severityVariant = {
    low: 'warning' as const,
    medium: 'warning' as const,
    high: 'destructive' as const,
  };

  return (
    <div className="flex items-start gap-3 rounded-lg border p-3 bg-muted/30">
      <AlertTriangle
        className={cn(
          'h-5 w-5 mt-0.5',
          bottleneck.severity === 'high'
            ? 'text-red-500'
            : bottleneck.severity === 'medium'
            ? 'text-orange-500'
            : 'text-yellow-500'
        )}
      />
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{bottleneck.description}</span>
          <Badge variant={severityVariant[bottleneck.severity]} className="text-[10px]">
            {bottleneck.severity}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">{bottleneck.metric}:</span> {bottleneck.value.toFixed(1)} (threshold: {bottleneck.threshold.toFixed(1)})
        </p>
        <p className="text-xs text-muted-foreground">💡 {bottleneck.recommendation}</p>
      </div>
    </div>
  );
}

function RatingBadge({ rating }: { rating: Benchmark['rating'] }) {
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
    excellent: 'success',
    good: 'default',
    average: 'warning',
    needs_improvement: 'destructive',
  };

  const labels = {
    excellent: 'Excellent',
    good: 'Good',
    average: 'Average',
    needs_improvement: 'Needs Work',
  };

  return <Badge variant={variants[rating]}>{labels[rating]}</Badge>;
}
