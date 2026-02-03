'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Plus, GitPullRequest, Settings, BarChart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface QuickAction {
  title: string;
  description: string;
  href: string;
  icon: React.ElementType;
}

const quickActions: QuickAction[] = [
  {
    title: 'Add Repository',
    description: 'Connect a new repository to PRFlow',
    href: '/repositories/new',
    icon: Plus,
  },
  {
    title: 'View Workflows',
    description: 'Check recent PR analyses',
    href: '/workflows',
    icon: GitPullRequest,
  },
  {
    title: 'Analytics',
    description: 'View team metrics',
    href: '/analytics',
    icon: BarChart,
  },
  {
    title: 'Settings',
    description: 'Configure PRFlow',
    href: '/settings',
    icon: Settings,
  },
];

export function QuickActions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <Link key={action.href} href={action.href}>
              <div className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{action.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {action.description}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
