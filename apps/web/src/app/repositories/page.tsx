'use client';

import { useQuery } from '@tanstack/react-query';
import { Settings, ExternalLink } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Repository {
  id: string;
  name: string;
  fullName: string;
  owner: string;
  isPrivate: boolean;
  settings?: {
    reviewEnabled: boolean;
    testGenerationEnabled: boolean;
    docUpdatesEnabled: boolean;
  };
}

export default function RepositoriesPage() {
  const { data: repositories, isLoading } = useQuery<Repository[]>({
    queryKey: ['repositories'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/repositories`);
      if (!res.ok) throw new Error('Failed to fetch repositories');
      return res.json();
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Repositories</h1>
        <a
          href="https://github.com/apps/prflow/installations/new"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
        >
          Add Repository
          <ExternalLink className="ml-2 h-4 w-4" />
        </a>
      </div>

      {isLoading ? (
        <div className="text-center py-12">Loading repositories...</div>
      ) : repositories?.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">No repositories connected</h2>
          <p className="text-gray-600 mb-4">
            Install the PRFlow GitHub App to get started.
          </p>
          <a
            href="https://github.com/apps/prflow/installations/new"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
          >
            Install GitHub App
          </a>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow divide-y">
          {repositories?.map((repo) => (
            <div key={repo.id} className="p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-semibold">{repo.fullName}</span>
                  {repo.isPrivate && (
                    <span className="px-2 py-0.5 text-xs bg-gray-100 rounded">Private</span>
                  )}
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  {repo.settings?.reviewEnabled && (
                    <span className="mr-3">✅ Review</span>
                  )}
                  {repo.settings?.testGenerationEnabled && (
                    <span className="mr-3">✅ Tests</span>
                  )}
                  {repo.settings?.docUpdatesEnabled && (
                    <span>✅ Docs</span>
                  )}
                </div>
              </div>
              <a
                href={`/repositories/${repo.owner}/${repo.name}`}
                className="p-2 text-gray-400 hover:text-gray-600"
              >
                <Settings className="h-5 w-5" />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
