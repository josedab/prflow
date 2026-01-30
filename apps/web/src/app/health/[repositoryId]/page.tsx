'use client';

import { useQuery } from '@tanstack/react-query';
import { Activity, TrendingUp, TrendingDown, Minus, AlertCircle, CheckCircle, Clock, BarChart3 } from 'lucide-react';
import { useParams } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface HealthDashboard {
  repositoryId: string;
  summary: {
    avgScore: number;
    totalPRs: number;
    healthyPRs: number;
    atRiskPRs: number;
    scoreDistribution: {
      excellent: number;
      good: number;
      fair: number;
      poor: number;
    };
  };
  teamHealth: {
    throughputScore: number;
    qualityScore: number;
    velocityScore: number;
    avgCycleTimeHours: number;
    avgReviewLatencyMinutes: number;
    trends: {
      reviewLatency: 'improving' | 'stable' | 'degrading';
      cycleTime: 'improving' | 'stable' | 'degrading';
      quality: 'improving' | 'stable' | 'degrading';
    };
  };
  topBlockers: string[];
  recentPRs: Array<{
    workflowId: string;
    prNumber: number;
    score: number;
    blockers: number;
    calculatedAt: string;
  }>;
  trendData: Array<{
    date: string;
    avgScore: number;
    prCount: number;
  }>;
}

const TrendIcon = ({ trend }: { trend: 'improving' | 'stable' | 'degrading' }) => {
  if (trend === 'improving') return <TrendingUp className="h-4 w-4 text-green-500" />;
  if (trend === 'degrading') return <TrendingDown className="h-4 w-4 text-red-500" />;
  return <Minus className="h-4 w-4 text-gray-500" />;
};

const ScoreGauge = ({ score, label }: { score: number; label: string }) => {
  const getColor = (s: number) => {
    if (s >= 80) return 'text-green-600 bg-green-100';
    if (s >= 60) return 'text-yellow-600 bg-yellow-100';
    if (s >= 40) return 'text-orange-600 bg-orange-100';
    return 'text-red-600 bg-red-100';
  };

  return (
    <div className="flex flex-col items-center">
      <div className={`text-3xl font-bold p-4 rounded-full ${getColor(score)}`}>
        {Math.round(score)}
      </div>
      <span className="text-sm text-gray-600 mt-2">{label}</span>
    </div>
  );
};

const MetricCard = ({ 
  title, 
  value, 
  subtitle, 
  trend, 
  icon: Icon 
}: { 
  title: string; 
  value: string | number; 
  subtitle?: string;
  trend?: 'improving' | 'stable' | 'degrading';
  icon: typeof Activity;
}) => (
  <div className="bg-white rounded-lg shadow p-6">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-2xl font-semibold mt-1">{value}</p>
        {subtitle && <p className="text-sm text-gray-400 mt-1">{subtitle}</p>}
      </div>
      <div className="flex items-center space-x-2">
        {trend && <TrendIcon trend={trend} />}
        <Icon className="h-8 w-8 text-gray-400" />
      </div>
    </div>
  </div>
);

export default function HealthDashboardPage() {
  const params = useParams();
  const repositoryId = params?.repositoryId as string;

  const { data, isLoading, error } = useQuery<HealthDashboard>({
    queryKey: ['health-dashboard', repositoryId],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/health/dashboard/${repositoryId}`);
      if (!res.ok) throw new Error('Failed to fetch health dashboard');
      return res.json();
    },
    enabled: !!repositoryId,
    refetchInterval: 60000,
  });

  if (!repositoryId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Please select a repository to view health metrics.</p>
      </div>
    );
  }

  if (isLoading) {
    return <div className="text-center py-12">Loading health dashboard...</div>;
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <p className="text-red-600">Failed to load health dashboard</p>
      </div>
    );
  }

  const { summary, teamHealth, topBlockers, recentPRs } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">PR Health Dashboard</h1>
        <span className="text-sm text-gray-500">
          Last updated: {new Date().toLocaleTimeString()}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          title="Average Score"
          value={summary.avgScore.toFixed(1)}
          subtitle={`${summary.totalPRs} PRs analyzed`}
          icon={BarChart3}
        />
        <MetricCard
          title="Healthy PRs"
          value={summary.healthyPRs}
          subtitle={`${summary.atRiskPRs} at risk`}
          icon={CheckCircle}
        />
        <MetricCard
          title="Avg Review Time"
          value={`${Math.round(teamHealth.avgReviewLatencyMinutes)}m`}
          trend={teamHealth.trends.reviewLatency}
          icon={Clock}
        />
        <MetricCard
          title="Avg Cycle Time"
          value={`${teamHealth.avgCycleTimeHours.toFixed(1)}h`}
          trend={teamHealth.trends.cycleTime}
          icon={Activity}
        />
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Team Health Metrics</h2>
        <div className="flex justify-around">
          <ScoreGauge score={teamHealth.throughputScore} label="Throughput" />
          <ScoreGauge score={teamHealth.qualityScore} label="Quality" />
          <ScoreGauge score={teamHealth.velocityScore} label="Velocity" />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Score Distribution</h2>
        <div className="flex items-end space-x-4 h-32">
          {[
            { label: 'Excellent', value: summary.scoreDistribution.excellent, color: 'bg-green-500' },
            { label: 'Good', value: summary.scoreDistribution.good, color: 'bg-blue-500' },
            { label: 'Fair', value: summary.scoreDistribution.fair, color: 'bg-yellow-500' },
            { label: 'Poor', value: summary.scoreDistribution.poor, color: 'bg-red-500' },
          ].map((item) => {
            const maxValue = Math.max(
              summary.scoreDistribution.excellent,
              summary.scoreDistribution.good,
              summary.scoreDistribution.fair,
              summary.scoreDistribution.poor,
              1
            );
            const height = (item.value / maxValue) * 100;
            return (
              <div key={item.label} className="flex-1 flex flex-col items-center">
                <div 
                  className={`w-full ${item.color} rounded-t`}
                  style={{ height: `${height}%`, minHeight: item.value > 0 ? '8px' : '0' }}
                />
                <span className="text-xs text-gray-600 mt-2">{item.label}</span>
                <span className="text-sm font-medium">{item.value}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Top Blockers</h2>
          {topBlockers.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No blockers identified</p>
          ) : (
            <ul className="space-y-3">
              {topBlockers.map((blocker, index) => (
                <li key={index} className="flex items-start">
                  <AlertCircle className="h-5 w-5 text-orange-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-gray-700">{blocker}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Recent PRs</h2>
          {recentPRs.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No recent PRs</p>
          ) : (
            <ul className="space-y-3">
              {recentPRs.slice(0, 5).map((pr) => {
                const scoreColor = pr.score >= 70 ? 'text-green-600' : pr.score >= 50 ? 'text-yellow-600' : 'text-red-600';
                return (
                  <li key={pr.workflowId} className="flex items-center justify-between">
                    <a 
                      href={`/workflows/${pr.workflowId}`}
                      className="text-primary-600 hover:text-primary-800"
                    >
                      PR #{pr.prNumber}
                    </a>
                    <div className="flex items-center space-x-4">
                      {pr.blockers > 0 && (
                        <span className="text-xs text-orange-600">
                          {pr.blockers} blocker{pr.blockers > 1 ? 's' : ''}
                        </span>
                      )}
                      <span className={`font-medium ${scoreColor}`}>
                        {Math.round(pr.score)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
