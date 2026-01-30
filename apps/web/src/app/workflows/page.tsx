'use client';

import { useQuery } from '@tanstack/react-query';
import { GitPullRequest } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Workflow {
  id: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  status: string;
  authorLogin: string;
  createdAt: string;
  completedAt?: string;
  analysis?: {
    riskLevel: string;
    filesModified: number;
  };
  synthesis?: {
    summary: string;
  };
}

const statusColors: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-800',
  ANALYZING: 'bg-blue-100 text-blue-800',
  REVIEWING: 'bg-blue-100 text-blue-800',
  GENERATING_TESTS: 'bg-purple-100 text-purple-800',
  UPDATING_DOCS: 'bg-purple-100 text-purple-800',
  SYNTHESIZING: 'bg-purple-100 text-purple-800',
  COMPLETED: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
};

const riskColors: Record<string, string> = {
  LOW: 'text-green-600',
  MEDIUM: 'text-yellow-600',
  HIGH: 'text-orange-600',
  CRITICAL: 'text-red-600',
};

export default function WorkflowsPage() {
  const { data, isLoading } = useQuery<{ data: Workflow[] }>({
    queryKey: ['workflows'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/workflows`);
      if (!res.ok) throw new Error('Failed to fetch workflows');
      return res.json();
    },
  });

  const workflows = data?.data || [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Workflows</h1>

      {isLoading ? (
        <div className="text-center py-12">Loading workflows...</div>
      ) : workflows.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <GitPullRequest className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">No workflows yet</h2>
          <p className="text-gray-600">
            Workflows will appear here when PRs are opened on connected repositories.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  PR
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Risk
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Author
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {workflows.map((workflow) => (
                <tr key={workflow.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <a
                      href={`/workflows/${workflow.id}`}
                      className="text-primary-600 hover:text-primary-800"
                    >
                      <div className="font-medium">#{workflow.prNumber}</div>
                      <div className="text-sm text-gray-500 truncate max-w-xs">
                        {workflow.prTitle}
                      </div>
                    </a>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs rounded-full ${statusColors[workflow.status]}`}>
                      {workflow.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {workflow.analysis?.riskLevel && (
                      <span className={`font-medium ${riskColors[workflow.analysis.riskLevel]}`}>
                        {workflow.analysis.riskLevel}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {workflow.authorLogin}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(workflow.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
