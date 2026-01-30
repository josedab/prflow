'use client';

import { useState } from 'react';
import {
  BarChart3,
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
} from 'lucide-react';

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

export default function AnalyticsDashboard() {
  const [teamId, setTeamId] = useState('');
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });
  const [analytics, setAnalytics] = useState<TeamAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = async () => {
    if (!teamId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/teams/${teamId}?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`
      );
      if (!response.ok) throw new Error('Failed to load analytics');
      const data = await response.json();
      setAnalytics(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const exportData = async (format: 'json' | 'csv') => {
    if (!teamId) return;

    const response = await fetch(
      `/api/teams/${teamId}/export?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}&format=${format}`
    );
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `team-analytics.${format}`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Analytics</h1>
          <p className="text-gray-600">Track PR metrics, identify bottlenecks, and benchmark performance</p>
        </div>
        {analytics && (
          <div className="flex space-x-2">
            <button
              onClick={() => exportData('csv')}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm flex items-center hover:bg-gray-50"
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </button>
            <button
              onClick={() => exportData('json')}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm flex items-center hover:bg-gray-50"
            >
              <Download className="h-4 w-4 mr-2" />
              Export JSON
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Select Team & Date Range</h2>
        <div className="flex space-x-4">
          <input
            type="text"
            placeholder="Team ID"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <input
            type="date"
            value={dateRange.startDate}
            onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <input
            type="date"
            value={dateRange.endDate}
            onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            onClick={loadAnalytics}
            disabled={!teamId || loading}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 flex items-center"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Load
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {analytics && (
        <>
          {/* Overview Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <StatCard
              icon={<Users className="h-5 w-5" />}
              label="Team Members"
              value={analytics.overview.members}
              color="blue"
            />
            <StatCard
              icon={<GitPullRequest className="h-5 w-5" />}
              label="Repositories"
              value={analytics.overview.repositories}
              color="purple"
            />
            <StatCard
              icon={<Clock className="h-5 w-5" />}
              label="Active PRs"
              value={analytics.overview.activePRs}
              color="yellow"
            />
            <StatCard
              icon={<CheckCircle className="h-5 w-5" />}
              label="Completed PRs"
              value={analytics.overview.completedPRs}
              color="green"
            />
            <StatCard
              icon={<TrendingUp className="h-5 w-5" />}
              label="Merge Rate"
              value={`${analytics.throughput.mergeRate.toFixed(1)}%`}
              color="teal"
            />
            <StatCard
              icon={<Zap className="h-5 w-5" />}
              label="Issues Found"
              value={analytics.quality.issuesFound}
              color="orange"
            />
          </div>

          {/* Cycle Time Metrics */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center">
              <Clock className="h-5 w-5 mr-2 text-primary-600" />
              Cycle Time Metrics
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <MetricCard
                label="Average Cycle Time"
                value={`${analytics.cycleTime.average.toFixed(1)}h`}
                subtitle="Time from PR open to merge"
              />
              <MetricCard
                label="Median Cycle Time"
                value={`${analytics.cycleTime.median.toFixed(1)}h`}
                subtitle="50th percentile"
              />
              <MetricCard
                label="P90 Cycle Time"
                value={`${analytics.cycleTime.p90.toFixed(1)}h`}
                subtitle="90th percentile"
              />
              <MetricCard
                label="P95 Cycle Time"
                value={`${analytics.cycleTime.p95.toFixed(1)}h`}
                subtitle="95th percentile"
              />
            </div>
            <div className="mt-6 grid grid-cols-3 gap-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="text-sm text-blue-600 font-medium">Time to First Review</div>
                <div className="text-2xl font-bold text-blue-900">
                  {analytics.cycleTime.breakdown.timeToFirstReview.toFixed(1)}h
                </div>
              </div>
              <div className="bg-purple-50 rounded-lg p-4">
                <div className="text-sm text-purple-600 font-medium">Review Time</div>
                <div className="text-2xl font-bold text-purple-900">
                  {analytics.cycleTime.breakdown.reviewTime.toFixed(1)}h
                </div>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <div className="text-sm text-green-600 font-medium">Time to Merge</div>
                <div className="text-2xl font-bold text-green-900">
                  {analytics.cycleTime.breakdown.timeToMerge.toFixed(1)}h
                </div>
              </div>
            </div>
          </div>

          {/* Throughput & Quality */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Throughput */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center">
                <BarChart3 className="h-5 w-5 mr-2 text-primary-600" />
                Throughput
              </h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">PRs Opened</span>
                  <span className="font-semibold">{analytics.throughput.prsOpened}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">PRs Merged</span>
                  <span className="font-semibold text-green-600">{analytics.throughput.prsMerged}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">PRs Abandoned</span>
                  <span className="font-semibold text-red-600">{analytics.throughput.prsAbandoned}</span>
                </div>
                <hr />
                <div className="text-sm text-gray-500">
                  <p>Avg PR Size: {analytics.throughput.averagePRSize.files.toFixed(0)} files</p>
                  <p>
                    +{analytics.throughput.averagePRSize.additions.toFixed(0)} / 
                    -{analytics.throughput.averagePRSize.deletions.toFixed(0)} lines
                  </p>
                </div>
              </div>
            </div>

            {/* Quality */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center">
                <Target className="h-5 w-5 mr-2 text-primary-600" />
                Quality Metrics
              </h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Issues Found</span>
                  <span className="font-semibold">{analytics.quality.issuesFound}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">False Positive Rate</span>
                  <span className="font-semibold">{analytics.quality.falsePositiveRate.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Tests Generated</span>
                  <span className="font-semibold">{analytics.quality.testsGenerated}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Test Acceptance Rate</span>
                  <span className="font-semibold text-green-600">
                    {analytics.quality.testAcceptanceRate.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottlenecks */}
          {analytics.bottlenecks.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center">
                <AlertTriangle className="h-5 w-5 mr-2 text-yellow-600" />
                Identified Bottlenecks
              </h2>
              <div className="space-y-4">
                {analytics.bottlenecks.map((bottleneck) => (
                  <BottleneckCard key={bottleneck.id} bottleneck={bottleneck} />
                ))}
              </div>
            </div>
          )}

          {/* Benchmarks */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center">
              <TrendingUp className="h-5 w-5 mr-2 text-primary-600" />
              Industry Benchmarks
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Metric</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Your Team</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Industry Avg</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Top 10%</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Percentile</th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.benchmarks.map((benchmark) => (
                    <tr key={benchmark.metric} className="border-b">
                      <td className="py-3 px-4 text-sm">{benchmark.metric}</td>
                      <td className="py-3 px-4 text-sm text-right font-medium">
                        {benchmark.teamValue.toFixed(1)}
                      </td>
                      <td className="py-3 px-4 text-sm text-right text-gray-500">
                        {benchmark.industryAverage.toFixed(1)}
                      </td>
                      <td className="py-3 px-4 text-sm text-right text-gray-500">
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
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-600',
    purple: 'bg-purple-100 text-purple-600',
    yellow: 'bg-yellow-100 text-yellow-600',
    green: 'bg-green-100 text-green-600',
    teal: 'bg-teal-100 text-teal-600',
    orange: 'bg-orange-100 text-orange-600',
  };

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className={`w-10 h-10 rounded-lg ${colorClasses[color]} flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: string;
  subtitle: string;
}) {
  return (
    <div className="text-center">
      <div className="text-3xl font-bold text-gray-900">{value}</div>
      <div className="text-sm font-medium text-gray-700">{label}</div>
      <div className="text-xs text-gray-500">{subtitle}</div>
    </div>
  );
}

function BottleneckCard({ bottleneck }: { bottleneck: Bottleneck }) {
  const severityColors = {
    low: 'border-yellow-200 bg-yellow-50',
    medium: 'border-orange-200 bg-orange-50',
    high: 'border-red-200 bg-red-50',
  };

  const severityIcons = {
    low: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
    medium: <AlertTriangle className="h-5 w-5 text-orange-500" />,
    high: <AlertTriangle className="h-5 w-5 text-red-500" />,
  };

  return (
    <div className={`border rounded-lg p-4 ${severityColors[bottleneck.severity]}`}>
      <div className="flex items-start space-x-3">
        {severityIcons[bottleneck.severity]}
        <div className="flex-1">
          <div className="font-medium text-gray-900">{bottleneck.description}</div>
          <div className="text-sm text-gray-600 mt-1">
            <span className="font-medium">{bottleneck.metric}:</span> {bottleneck.value.toFixed(1)} 
            (threshold: {bottleneck.threshold.toFixed(1)})
          </div>
          <div className="text-sm text-gray-700 mt-2 italic">
            💡 {bottleneck.recommendation}
          </div>
        </div>
      </div>
    </div>
  );
}

function RatingBadge({ rating }: { rating: Benchmark['rating'] }) {
  const colors = {
    excellent: 'bg-green-100 text-green-800',
    good: 'bg-blue-100 text-blue-800',
    average: 'bg-yellow-100 text-yellow-800',
    needs_improvement: 'bg-red-100 text-red-800',
  };

  const labels = {
    excellent: 'Excellent',
    good: 'Good',
    average: 'Average',
    needs_improvement: 'Needs Work',
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[rating]}`}>
      {labels[rating]}
    </span>
  );
}
