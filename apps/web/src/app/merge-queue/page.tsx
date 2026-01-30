'use client';

import { useState } from 'react';
import { GitMerge, Clock, CheckCircle, AlertTriangle, XCircle, RefreshCw, Trash2 } from 'lucide-react';
import { api, type MergeQueueItem, type MergeQueueResponse } from '@/lib/api';
import { useWebSocket } from '@/lib/websocket';

export default function MergeQueuePage() {
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [queueData, setQueueData] = useState<MergeQueueResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { isConnected } = useWebSocket({
    onMessage: (message) => {
      if (message.type === 'merge_queue_status' || message.type === 'merge_queue_joined' || message.type === 'merge_queue_left') {
        // Refresh queue on updates
        if (owner && repo) {
          loadQueue();
        }
      }
    },
  });

  const loadQueue = async () => {
    if (!owner || !repo) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const data = await api.mergeQueue.get(owner, repo);
      setQueueData(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFromQueue = async (prNumber: number) => {
    try {
      await api.mergeQueue.remove(owner, repo, prNumber);
      loadQueue();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleProcessQueue = async () => {
    try {
      await api.mergeQueue.process(owner, repo);
      loadQueue();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Merge Queue</h1>
          <p className="text-gray-600">Manage your pull request merge queue</p>
        </div>
        <div className="flex items-center space-x-2">
          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
            isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            <span className={`w-2 h-2 rounded-full mr-1.5 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            {isConnected ? 'Live' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Repository Selector */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Select Repository</h2>
        <div className="flex space-x-4">
          <input
            type="text"
            placeholder="Owner"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <input
            type="text"
            placeholder="Repository"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            onClick={loadQueue}
            disabled={!owner || !repo || loading}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
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

      {queueData && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <StatCard label="Total" value={queueData.stats.total} color="gray" />
            <StatCard label="Queued" value={queueData.stats.queued} color="blue" />
            <StatCard label="Checking" value={queueData.stats.checking} color="yellow" />
            <StatCard label="Ready" value={queueData.stats.ready} color="green" />
            <StatCard label="Merging" value={queueData.stats.merging} color="purple" />
            <StatCard label="Blocked" value={queueData.stats.blocked} color="red" />
          </div>

          {/* Queue Config */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Configuration</h2>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                queueData.config.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
              }`}>
                {queueData.config.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Auto Merge:</span>
                <span className="ml-2 font-medium">{queueData.config.autoMergeEnabled ? 'Yes' : 'No'}</span>
              </div>
              <div>
                <span className="text-gray-500">Required Approvals:</span>
                <span className="ml-2 font-medium">{queueData.config.requireApprovals}</span>
              </div>
              <div>
                <span className="text-gray-500">Merge Method:</span>
                <span className="ml-2 font-medium capitalize">{queueData.config.mergeMethod}</span>
              </div>
              <div>
                <span className="text-gray-500">Batch Size:</span>
                <span className="ml-2 font-medium">{queueData.config.batchSize}</span>
              </div>
            </div>
          </div>

          {/* Queue Items */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Queue ({queueData.queue.length})</h2>
              <button
                onClick={handleProcessQueue}
                className="px-3 py-1.5 bg-primary-600 text-white text-sm rounded-md hover:bg-primary-700 flex items-center"
              >
                <RefreshCw className="h-4 w-4 mr-1.5" />
                Process Queue
              </button>
            </div>
            
            {queueData.queue.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <GitMerge className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <p>No pull requests in the merge queue</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {queueData.queue.map((item) => (
                  <QueueItem
                    key={item.id}
                    item={item}
                    onRemove={() => handleRemoveFromQueue(item.prNumber)}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorClasses: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-800',
    blue: 'bg-blue-100 text-blue-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    green: 'bg-green-100 text-green-800',
    purple: 'bg-purple-100 text-purple-800',
    red: 'bg-red-100 text-red-800',
  };

  return (
    <div className={`rounded-lg p-4 ${colorClasses[color]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm">{label}</div>
    </div>
  );
}

function QueueItem({ item, onRemove }: { item: MergeQueueItem; onRemove: () => void }) {
  const statusConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
    queued: { icon: <Clock className="h-4 w-4" />, color: 'text-blue-500', label: 'Queued' },
    checking: { icon: <RefreshCw className="h-4 w-4 animate-spin" />, color: 'text-yellow-500', label: 'Checking' },
    ready: { icon: <CheckCircle className="h-4 w-4" />, color: 'text-green-500', label: 'Ready' },
    merging: { icon: <GitMerge className="h-4 w-4 animate-pulse" />, color: 'text-purple-500', label: 'Merging' },
    merged: { icon: <CheckCircle className="h-4 w-4" />, color: 'text-green-600', label: 'Merged' },
    failed: { icon: <XCircle className="h-4 w-4" />, color: 'text-red-500', label: 'Failed' },
    blocked: { icon: <AlertTriangle className="h-4 w-4" />, color: 'text-orange-500', label: 'Blocked' },
  };

  const status = statusConfig[item.status] || statusConfig.queued;

  return (
    <div className="p-4 hover:bg-gray-50 flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <div className="flex-shrink-0 w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center font-bold text-gray-600">
          #{item.position}
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-medium">#{item.prNumber}</span>
            <span className="text-gray-600">{item.prTitle}</span>
            {item.priority > 0 && (
              <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded">
                Priority: {item.priority}
              </span>
            )}
          </div>
          <div className="text-sm text-gray-500">
            by {item.authorLogin} • {item.baseBranch}
            {item.failureReason && (
              <span className="ml-2 text-red-500">• {item.failureReason}</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center space-x-4">
        <div className={`flex items-center space-x-1.5 ${status.color}`}>
          {status.icon}
          <span className="text-sm font-medium">{status.label}</span>
        </div>
        <button
          onClick={onRemove}
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
          title="Remove from queue"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
