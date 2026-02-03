'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  GitPullRequest,
  Search,
  Filter,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { formatRelativeTime } from '@/lib/utils';

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
  repositoryFullName?: string;
  analysis?: {
    riskLevel: string;
    filesModified: number;
  };
  synthesis?: {
    summary: string;
  };
}

const statusConfig: Record<
  string,
  { label: string; icon: React.ElementType; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' }
> = {
  PENDING: { label: 'Pending', icon: Clock, variant: 'secondary' },
  ANALYZING: { label: 'Analyzing', icon: Loader2, variant: 'default' },
  REVIEWING: { label: 'Reviewing', icon: Loader2, variant: 'default' },
  GENERATING_TESTS: { label: 'Generating Tests', icon: Loader2, variant: 'default' },
  UPDATING_DOCS: { label: 'Updating Docs', icon: Loader2, variant: 'default' },
  SYNTHESIZING: { label: 'Synthesizing', icon: Loader2, variant: 'default' },
  COMPLETED: { label: 'Completed', icon: CheckCircle2, variant: 'success' },
  FAILED: { label: 'Failed', icon: XCircle, variant: 'destructive' },
};

const riskConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' }> = {
  LOW: { label: 'Low', variant: 'success' },
  MEDIUM: { label: 'Medium', variant: 'warning' },
  HIGH: { label: 'High', variant: 'destructive' },
  CRITICAL: { label: 'Critical', variant: 'destructive' },
};

function WorkflowCard({ workflow }: { workflow: Workflow }) {
  const status = statusConfig[workflow.status] || statusConfig.PENDING;
  const StatusIcon = status.icon;
  const risk = workflow.analysis?.riskLevel
    ? riskConfig[workflow.analysis.riskLevel]
    : null;

  return (
    <Link href={`/workflows/${workflow.id}`}>
      <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-primary/10 p-2.5 mt-0.5">
              <GitPullRequest className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">#{workflow.prNumber}</span>
                <Badge variant={status.variant} className="gap-1">
                  <StatusIcon
                    className={`h-3 w-3 ${
                      status.icon === Loader2 ? 'animate-spin' : ''
                    }`}
                  />
                  {status.label}
                </Badge>
                {risk && <Badge variant={risk.variant}>{risk.label} Risk</Badge>}
              </div>
              <p className="text-sm font-medium truncate">{workflow.prTitle}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {workflow.repositoryFullName && (
                  <span>{workflow.repositoryFullName}</span>
                )}
                <span>by {workflow.authorLogin}</span>
                <span>•</span>
                <span>{formatRelativeTime(workflow.createdAt)}</span>
                {workflow.analysis?.filesModified && (
                  <>
                    <span>•</span>
                    <span>{workflow.analysis.filesModified} files</span>
                  </>
                )}
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function WorkflowSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-12" />
              <Skeleton className="h-5 w-20" />
            </div>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function WorkflowsPage() {
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');

  const { data, isLoading, refetch, isFetching } = useQuery<{ data: Workflow[] }>({
    queryKey: ['workflows'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/workflows`);
      if (!res.ok) throw new Error('Failed to fetch workflows');
      return res.json();
    },
  });

  const workflows = data?.data || [];

  const filteredWorkflows = React.useMemo(() => {
    return workflows.filter((workflow) => {
      const matchesSearch =
        search === '' ||
        workflow.prTitle.toLowerCase().includes(search.toLowerCase()) ||
        workflow.prNumber.toString().includes(search) ||
        workflow.authorLogin.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === 'all' || workflow.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [workflows, search, statusFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Workflows</h1>
          <p className="text-muted-foreground">
            Track and manage your PR analysis workflows
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`}
          />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search workflows..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="ANALYZING">Analyzing</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Workflow List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <WorkflowSkeleton key={i} />
          ))}
        </div>
      ) : filteredWorkflows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <GitPullRequest className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No workflows found</h2>
            <p className="text-muted-foreground text-center max-w-sm">
              {workflows.length === 0
                ? 'Workflows will appear here when PRs are opened on connected repositories.'
                : 'Try adjusting your search or filter criteria.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredWorkflows.map((workflow) => (
            <WorkflowCard key={workflow.id} workflow={workflow} />
          ))}
        </div>
      )}

      {/* Stats Summary */}
      {workflows.length > 0 && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="rounded-lg bg-blue-500/10 p-2">
                <GitPullRequest className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{workflows.length}</p>
                <p className="text-xs text-muted-foreground">Total Workflows</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="rounded-lg bg-yellow-500/10 p-2">
                <Loader2 className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {workflows.filter((w) => !['COMPLETED', 'FAILED'].includes(w.status)).length}
                </p>
                <p className="text-xs text-muted-foreground">In Progress</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="rounded-lg bg-green-500/10 p-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {workflows.filter((w) => w.status === 'COMPLETED').length}
                </p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="rounded-lg bg-red-500/10 p-2">
                <XCircle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {workflows.filter((w) => w.status === 'FAILED').length}
                </p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
