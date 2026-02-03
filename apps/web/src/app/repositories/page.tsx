'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Settings,
  ExternalLink,
  Search,
  FolderGit2,
  Lock,
  Globe,
  CheckCircle2,
  XCircle,
  MoreHorizontal,
  Activity,
  GitPullRequest,
  AlertTriangle,
  RefreshCw,
  Plus,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Repository {
  id: string;
  name: string;
  fullName: string;
  owner: string;
  isPrivate: boolean;
  defaultBranch?: string;
  settings?: {
    reviewEnabled: boolean;
    testGenerationEnabled: boolean;
    docUpdatesEnabled: boolean;
  };
  stats?: {
    prsAnalyzed?: number;
    issuesFound?: number;
    healthScore?: number;
  };
}

function RepositoryCard({ repo }: { repo: Repository }) {
  const healthScore = repo.stats?.healthScore ?? 85;
  const healthColor =
    healthScore >= 80
      ? 'text-green-500'
      : healthScore >= 60
      ? 'text-yellow-500'
      : 'text-red-500';

  return (
    <Card className="hover:bg-muted/30 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2.5">
              <FolderGit2 className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Link
                  href={`/repositories/${repo.owner}/${repo.name}`}
                  className="font-semibold hover:underline"
                >
                  {repo.fullName}
                </Link>
                <Badge variant="outline" className="text-[10px] gap-1">
                  {repo.isPrivate ? (
                    <>
                      <Lock className="h-3 w-3" />
                      Private
                    </>
                  ) : (
                    <>
                      <Globe className="h-3 w-3" />
                      Public
                    </>
                  )}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {repo.defaultBranch && <span>Branch: {repo.defaultBranch}</span>}
                {repo.stats?.prsAnalyzed !== undefined && (
                  <span className="flex items-center gap-1">
                    <GitPullRequest className="h-3 w-3" />
                    {repo.stats.prsAnalyzed} PRs analyzed
                  </span>
                )}
                {repo.stats?.issuesFound !== undefined && (
                  <span className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {repo.stats.issuesFound} issues found
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {repo.settings?.reviewEnabled !== undefined && (
                  <Badge
                    variant={repo.settings.reviewEnabled ? 'success' : 'secondary'}
                    className="text-[10px] gap-1"
                  >
                    {repo.settings.reviewEnabled ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                    Review
                  </Badge>
                )}
                {repo.settings?.testGenerationEnabled !== undefined && (
                  <Badge
                    variant={repo.settings.testGenerationEnabled ? 'success' : 'secondary'}
                    className="text-[10px] gap-1"
                  >
                    {repo.settings.testGenerationEnabled ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                    Tests
                  </Badge>
                )}
                {repo.settings?.docUpdatesEnabled !== undefined && (
                  <Badge
                    variant={repo.settings.docUpdatesEnabled ? 'success' : 'secondary'}
                    className="text-[10px] gap-1"
                  >
                    {repo.settings.docUpdatesEnabled ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                    Docs
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Health Score */}
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted">
              <Activity className={cn('h-4 w-4', healthColor)} />
              <span className={cn('text-sm font-medium', healthColor)}>
                {healthScore}%
              </span>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/repositories/${repo.owner}/${repo.name}`}>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/health/${repo.id}`}>
                    <Activity className="mr-2 h-4 w-4" />
                    Health Report
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a
                    href={`https://github.com/${repo.fullName}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    View on GitHub
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RepositorySkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-64" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-16" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function RepositoriesPage() {
  const [search, setSearch] = React.useState('');

  const { data: repositories, isLoading, refetch, isFetching } = useQuery<Repository[]>({
    queryKey: ['repositories'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/repositories`);
      if (!res.ok) throw new Error('Failed to fetch repositories');
      return res.json();
    },
  });

  const filteredRepos = React.useMemo(() => {
    if (!repositories) return [];
    if (!search) return repositories;
    return repositories.filter(
      (repo) =>
        repo.fullName.toLowerCase().includes(search.toLowerCase()) ||
        repo.owner.toLowerCase().includes(search.toLowerCase())
    );
  }, [repositories, search]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Repositories</h1>
          <p className="text-muted-foreground">
            Manage your connected GitHub repositories
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn('mr-2 h-4 w-4', isFetching && 'animate-spin')} />
            Refresh
          </Button>
          <Button asChild>
            <a
              href="https://github.com/apps/prflow/installations/new"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Repository
            </a>
          </Button>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search repositories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* Repository List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <RepositorySkeleton key={i} />
          ))}
        </div>
      ) : filteredRepos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderGit2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              {repositories?.length === 0
                ? 'No repositories connected'
                : 'No repositories found'}
            </h2>
            <p className="text-muted-foreground text-center max-w-sm mb-4">
              {repositories?.length === 0
                ? 'Install the PRFlow GitHub App to connect your repositories.'
                : 'Try adjusting your search criteria.'}
            </p>
            {repositories?.length === 0 && (
              <Button asChild>
                <a
                  href="https://github.com/apps/prflow/installations/new"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Install GitHub App
                </a>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredRepos.map((repo) => (
            <RepositoryCard key={repo.id} repo={repo} />
          ))}
        </div>
      )}

      {/* Summary Stats */}
      {repositories && repositories.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <FolderGit2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{repositories.length}</p>
                <p className="text-xs text-muted-foreground">Connected Repos</p>
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
                  {repositories.filter((r) => r.settings?.reviewEnabled).length}
                </p>
                <p className="text-xs text-muted-foreground">Review Enabled</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="rounded-lg bg-blue-500/10 p-2">
                <Activity className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {Math.round(
                    repositories.reduce(
                      (acc, r) => acc + (r.stats?.healthScore ?? 85),
                      0
                    ) / repositories.length
                  )}
                  %
                </p>
                <p className="text-xs text-muted-foreground">Avg Health Score</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
