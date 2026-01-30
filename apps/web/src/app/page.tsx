import { GitPullRequest, CheckCircle, AlertTriangle, Clock } from 'lucide-react';

export default function Home() {
  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Welcome to PRFlow
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          Intelligent pull request automation that analyzes, reviews, and enhances your PRs automatically.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard
          icon={<GitPullRequest className="h-8 w-8 text-blue-500" />}
          title="PRs Analyzed"
          value="0"
          description="Total pull requests processed"
        />
        <StatCard
          icon={<CheckCircle className="h-8 w-8 text-green-500" />}
          title="Issues Found"
          value="0"
          description="Bugs and issues detected"
        />
        <StatCard
          icon={<AlertTriangle className="h-8 w-8 text-yellow-500" />}
          title="Tests Generated"
          value="0"
          description="Automated tests created"
        />
        <StatCard
          icon={<Clock className="h-8 w-8 text-purple-500" />}
          title="Time Saved"
          value="0h"
          description="Review time saved"
        />
      </div>

      {/* Quick Start */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-semibold mb-4">Get Started</h2>
        <div className="space-y-4">
          <Step
            number={1}
            title="Install the GitHub App"
            description="Grant PRFlow access to your repositories"
          />
          <Step
            number={2}
            title="Configure Settings"
            description="Customize which features to enable per repository"
          />
          <Step
            number={3}
            title="Open a Pull Request"
            description="PRFlow will automatically analyze and review your PR"
          />
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-semibold mb-4">Recent Activity</h2>
        <div className="text-gray-500 text-center py-8">
          No recent activity. Install PRFlow on a repository to get started.
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  title,
  value,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  description: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center space-x-4">
        {icon}
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-gray-400">{description}</p>
        </div>
      </div>
    </div>
  );
}

function Step({
  number,
  title,
  description,
}: {
  number: number;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start space-x-4">
      <div className="flex-shrink-0 w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-semibold">
        {number}
      </div>
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-gray-600">{description}</p>
      </div>
    </div>
  );
}
