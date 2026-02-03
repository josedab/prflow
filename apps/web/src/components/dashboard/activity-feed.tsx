'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  GitPullRequest,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatRelativeTime } from '@/lib/utils';

interface Activity {
  id: string;
  type: 'pr_analyzed' | 'pr_approved' | 'pr_merged' | 'issue_found' | 'test_generated';
  title: string;
  repository: string;
  prNumber: number;
  timestamp: Date;
  status?: 'success' | 'warning' | 'error';
}

interface ActivityFeedProps {
  activities: Activity[];
  isLoading?: boolean;
}

const activityIcons = {
  pr_analyzed: GitPullRequest,
  pr_approved: CheckCircle2,
  pr_merged: GitPullRequest,
  issue_found: AlertTriangle,
  test_generated: CheckCircle2,
};

const activityColors = {
  pr_analyzed: 'text-blue-500',
  pr_approved: 'text-green-500',
  pr_merged: 'text-purple-500',
  issue_found: 'text-yellow-500',
  test_generated: 'text-green-500',
};

export function ActivityFeed({ activities, isLoading }: ActivityFeedProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-start gap-3 animate-pulse">
                <div className="h-8 w-8 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 rounded bg-muted" />
                  <div className="h-3 w-1/2 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Clock className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No recent activity</p>
            <p className="text-xs text-muted-foreground mt-1">
              Install PRFlow on a repository to get started
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-medium">Recent Activity</CardTitle>
        <Link
          href="/workflows"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          View all
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[320px]">
          <div className="space-y-1 p-4 pt-0">
            {activities.map((activity) => {
              const Icon = activityIcons[activity.type];
              const iconColor = activityColors[activity.type];

              return (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 rounded-lg p-2 hover:bg-muted/50 transition-colors"
                >
                  <div className={`mt-0.5 ${iconColor}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{activity.title}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{activity.repository}</span>
                      <span>#{activity.prNumber}</span>
                      <span>•</span>
                      <span>{formatRelativeTime(activity.timestamp)}</span>
                    </div>
                  </div>
                  {activity.status && (
                    <Badge
                      variant={
                        activity.status === 'success'
                          ? 'success'
                          : activity.status === 'warning'
                          ? 'warning'
                          : 'destructive'
                      }
                      className="text-[10px] px-1.5"
                    >
                      {activity.status}
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
