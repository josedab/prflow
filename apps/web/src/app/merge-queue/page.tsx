'use client';

import * as React from 'react';
import {
  GitMerge,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Trash2,
  Wifi,
  WifiOff,
  Settings,
  Play,
} from 'lucide-react';
import { api, type MergeQueueItem, type MergeQueueResponse } from '@/lib/api';
import { useWebSocket } from '@/lib/websocket';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function MergeQueuePage() {
  const [owner, setOwner] = React.useState('');
  const [repo, setRepo] = React.useState('');
  const [queueData, setQueueData] = React.useState<MergeQueueResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const { isConnected } = useWebSocket({
    onMessage: (message) => {
      if (
        message.type === 'merge_queue_status' ||
        message.type === 'merge_queue_joined' ||
        message.type === 'merge_queue_left'
      ) {
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

  // Mock data for demo
  const mockQueueData: MergeQueueResponse = {
    repository: {
      owner: 'example',
      repo: 'demo',
      fullName: 'example/demo',
    },
    stats: { total: 8, queued: 3, checking: 2, ready: 2, merging: 1, blocked: 0 },
    config: {
      enabled: true,
      autoMergeEnabled: true,
      requireApprovals: 2,
      requireChecks: true,
      requireUpToDate: true,
      mergeMethod: 'squash',
      batchSize: 5,
      maxWaitTimeMinutes: 60,
    },
    queue: [
      {
        id: '1',
        repositoryId: 'repo-1',
        prNumber: 142,
        prTitle: 'feat: Add user authentication flow',
        authorLogin: 'johndoe',
        headSha: 'abc123',
        baseBranch: 'main',
        status: 'merging',
        position: 1,
        addedAt: new Date(Date.now() - 1800000).toISOString(),
        priority: 1,
      },
      {
        id: '2',
        repositoryId: 'repo-1',
        prNumber: 141,
        prTitle: 'fix: Memory leak in dashboard component',
        authorLogin: 'janedoe',
        headSha: 'def456',
        baseBranch: 'main',
        status: 'ready',
        position: 2,
        addedAt: new Date(Date.now() - 3600000).toISOString(),
        priority: 0,
      },
      {
        id: '3',
        repositoryId: 'repo-1',
        prNumber: 140,
        prTitle: 'chore: Update dependencies',
        authorLogin: 'bot',
        headSha: 'ghi789',
        baseBranch: 'main',
        status: 'checking',
        position: 3,
        addedAt: new Date(Date.now() - 7200000).toISOString(),
        priority: 0,
      },
      {
        id: '4',
        repositoryId: 'repo-1',
        prNumber: 139,
        prTitle: 'docs: Update API documentation',
        authorLogin: 'johndoe',
        headSha: 'jkl012',
        baseBranch: 'main',
        status: 'queued',
        position: 4,
        addedAt: new Date(Date.now() - 10800000).toISOString(),
        priority: 0,
      },
    ],
  };

  const displayData = queueData || mockQueueData;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Merge Queue</h1>
          <p className="text-muted-foreground">
            Manage your pull request merge queue
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={isConnected ? 'success' : 'destructive'}
            className="gap-1.5"
          >
            {isConnected ? (
              <Wifi className="h-3 w-3" />
            ) : (
              <WifiOff className="h-3 w-3" />
            )}
            {isConnected ? 'Live' : 'Disconnected'}
          </Badge>
        </div>
      </div>

      {/* Repository Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Select Repository</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 md:flex-row">
            <Input
              placeholder="Owner (e.g., acme)"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              className="md:flex-1"
            />
            <Input
              placeholder="Repository (e.g., web-app)"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              className="md:flex-1"
            />
            <Button
              onClick={loadQueue}
              disabled={!owner || !repo || loading}
            >
              <RefreshCw
                className={cn('mr-2 h-4 w-4', loading && 'animate-spin')}
              />
              Load Queue
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="p-4 text-destructive">
            {error}
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          label="Total"
          value={displayData.stats.total}
          color="bg-muted"
          textColor="text-foreground"
        />
        <StatCard
          label="Queued"
          value={displayData.stats.queued}
          color="bg-blue-500/10"
          textColor="text-blue-600"
        />
        <StatCard
          label="Checking"
          value={displayData.stats.checking}
          color="bg-yellow-500/10"
          textColor="text-yellow-600"
        />
        <StatCard
          label="Ready"
          value={displayData.stats.ready}
          color="bg-green-500/10"
          textColor="text-green-600"
        />
        <StatCard
          label="Merging"
          value={displayData.stats.merging}
          color="bg-purple-500/10"
          textColor="text-purple-600"
        />
        <StatCard
          label="Blocked"
          value={displayData.stats.blocked}
          color="bg-red-500/10"
          textColor="text-red-600"
        />
      </div>

      {/* Queue Config */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Configuration
          </CardTitle>
          <Badge variant={displayData.config.enabled ? 'success' : 'secondary'}>
            {displayData.config.enabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ConfigItem
              label="Auto Merge"
              value={displayData.config.autoMergeEnabled ? 'Yes' : 'No'}
            />
            <ConfigItem
              label="Required Approvals"
              value={displayData.config.requireApprovals.toString()}
            />
            <ConfigItem
              label="Merge Method"
              value={displayData.config.mergeMethod}
            />
            <ConfigItem
              label="Batch Size"
              value={displayData.config.batchSize.toString()}
            />
          </div>
        </CardContent>
      </Card>

      {/* Queue Items */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-medium">
            Queue ({displayData.queue.length})
          </CardTitle>
          <Button size="sm" onClick={handleProcessQueue}>
            <Play className="mr-2 h-4 w-4" />
            Process Queue
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {displayData.queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <GitMerge className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No pull requests in the merge queue</p>
            </div>
          ) : (
            <div className="divide-y">
              {displayData.queue.map((item) => (
                <QueueItemRow
                  key={item.id}
                  item={item}
                  onRemove={() => handleRemoveFromQueue(item.prNumber)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  textColor,
}: {
  label: string;
  value: number;
  color: string;
  textColor: string;
}) {
  return (
    <Card className={cn(color)}>
      <CardContent className="p-4">
        <div className={cn('text-2xl font-bold', textColor)}>{value}</div>
        <div className={cn('text-sm', textColor)}>{label}</div>
      </CardContent>
    </Card>
  );
}

function ConfigItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium capitalize">{value}</p>
    </div>
  );
}

function QueueItemRow({
  item,
  onRemove,
}: {
  item: MergeQueueItem;
  onRemove: () => void;
}) {
  const statusConfig: Record<
    string,
    {
      icon: React.ElementType;
      color: string;
      label: string;
      variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';
    }
  > = {
    queued: {
      icon: Clock,
      color: 'text-blue-500',
      label: 'Queued',
      variant: 'secondary',
    },
    checking: {
      icon: RefreshCw,
      color: 'text-yellow-500',
      label: 'Checking',
      variant: 'warning',
    },
    ready: {
      icon: CheckCircle,
      color: 'text-green-500',
      label: 'Ready',
      variant: 'success',
    },
    merging: {
      icon: GitMerge,
      color: 'text-purple-500',
      label: 'Merging',
      variant: 'default',
    },
    merged: {
      icon: CheckCircle,
      color: 'text-green-600',
      label: 'Merged',
      variant: 'success',
    },
    failed: {
      icon: XCircle,
      color: 'text-red-500',
      label: 'Failed',
      variant: 'destructive',
    },
    blocked: {
      icon: AlertTriangle,
      color: 'text-orange-500',
      label: 'Blocked',
      variant: 'warning',
    },
  };

  const status = statusConfig[item.status] || statusConfig.queued;
  const StatusIcon = status.icon;

  return (
    <div className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted font-bold text-muted-foreground">
          #{item.position}
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">#{item.prNumber}</span>
            <span className="text-sm text-muted-foreground truncate max-w-[300px]">
              {item.prTitle}
            </span>
            {item.priority > 0 && (
              <Badge variant="warning" className="text-[10px]">
                Priority: {item.priority}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>by {item.authorLogin}</span>
            <span>•</span>
            <span>{item.baseBranch}</span>
            {item.failureReason && (
              <>
                <span>•</span>
                <span className="text-destructive">{item.failureReason}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Badge variant={status.variant} className="gap-1">
          <StatusIcon
            className={cn(
              'h-3 w-3',
              item.status === 'checking' && 'animate-spin',
              item.status === 'merging' && 'animate-pulse'
            )}
          />
          {status.label}
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
