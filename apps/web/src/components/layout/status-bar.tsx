'use client';

import * as React from 'react';
import {
  Wifi,
  WifiOff,
  GitBranch,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Keyboard,
  Bell,
  BellOff,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { useWebSocket } from '@/lib/websocket';
import { useNotifications } from '@/hooks/use-notifications';
import { cn } from '@/lib/utils';

interface StatusBarProps {
  className?: string;
}

function StatusItem({
  icon: Icon,
  label,
  value,
  status,
  onClick,
  tooltip,
}: {
  icon: React.ElementType;
  label: string;
  value?: string | number;
  status?: 'success' | 'warning' | 'error' | 'loading';
  onClick?: () => void;
  tooltip?: string;
}) {
  const statusColors = {
    success: 'text-green-500',
    warning: 'text-yellow-500',
    error: 'text-red-500',
    loading: 'text-blue-500 animate-pulse',
  };

  const content = (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-muted/50 rounded transition-colors',
        onClick && 'cursor-pointer',
        !onClick && 'cursor-default'
      )}
    >
      <Icon className={cn('h-3.5 w-3.5', status && statusColors[status])} />
      {value !== undefined && <span>{value}</span>}
      <span className="text-muted-foreground">{label}</span>
    </button>
  );

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

function ConnectionStatus() {
  const { isConnected, isConnecting } = useWebSocket({ autoConnect: false });

  if (isConnecting) {
    return (
      <StatusItem
        icon={Loader2}
        label="Connecting..."
        status="loading"
        tooltip="Establishing WebSocket connection"
      />
    );
  }

  return (
    <StatusItem
      icon={isConnected ? Wifi : WifiOff}
      label={isConnected ? 'Connected' : 'Disconnected'}
      status={isConnected ? 'success' : 'error'}
      tooltip={
        isConnected
          ? 'Real-time updates enabled'
          : 'Not connected to real-time updates'
      }
    />
  );
}

function NotificationStatus() {
  const { unreadCount } = useNotifications();
  const [muted, setMuted] = React.useState(false);

  return (
    <StatusItem
      icon={muted ? BellOff : Bell}
      label={muted ? 'Muted' : 'Notifications'}
      value={unreadCount > 0 ? unreadCount : undefined}
      status={unreadCount > 0 ? 'warning' : undefined}
      onClick={() => setMuted(!muted)}
      tooltip={
        muted
          ? 'Click to unmute notifications'
          : `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`
      }
    />
  );
}

function CurrentTime() {
  const [time, setTime] = React.useState<string>('');

  React.useEffect(() => {
    const updateTime = () => {
      setTime(
        new Date().toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      );
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return <StatusItem icon={Clock} label={time} tooltip="Current time" />;
}

function KeyboardShortcutsHint({ onClick }: { onClick: () => void }) {
  return (
    <StatusItem
      icon={Keyboard}
      label="⌘K"
      onClick={onClick}
      tooltip="Open command palette (⌘K)"
    />
  );
}

export function StatusBar({ className }: StatusBarProps) {
  const [stats, setStats] = React.useState({
    activeWorkflows: 0,
    queuedPRs: 0,
    issuesFound: 0,
  });

  // Simulated stats - in production, fetch from API
  React.useEffect(() => {
    setStats({
      activeWorkflows: 3,
      queuedPRs: 8,
      issuesFound: 12,
    });
  }, []);

  const openCommandPalette = () => {
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      bubbles: true,
    });
    document.dispatchEvent(event);
  };

  const openShortcuts = () => {
    const event = new KeyboardEvent('keydown', {
      key: '/',
      metaKey: true,
      bubbles: true,
    });
    document.dispatchEvent(event);
  };

  return (
    <div
      className={cn(
        'flex items-center justify-between h-6 px-2 bg-muted/30 border-t text-xs',
        className
      )}
    >
      {/* Left side */}
      <div className="flex items-center">
        <ConnectionStatus />
        <Separator orientation="vertical" className="h-4 mx-1" />
        <NotificationStatus />
        <Separator orientation="vertical" className="h-4 mx-1" />
        <StatusItem
          icon={GitBranch}
          label="workflows"
          value={stats.activeWorkflows}
          status={stats.activeWorkflows > 0 ? 'success' : undefined}
          tooltip={`${stats.activeWorkflows} active workflow${stats.activeWorkflows !== 1 ? 's' : ''}`}
        />
        <StatusItem
          icon={CheckCircle2}
          label="queued"
          value={stats.queuedPRs}
          tooltip={`${stats.queuedPRs} PR${stats.queuedPRs !== 1 ? 's' : ''} in merge queue`}
        />
        {stats.issuesFound > 0 && (
          <StatusItem
            icon={AlertTriangle}
            label="issues"
            value={stats.issuesFound}
            status="warning"
            tooltip={`${stats.issuesFound} issue${stats.issuesFound !== 1 ? 's' : ''} found`}
          />
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center">
        <KeyboardShortcutsHint onClick={openCommandPalette} />
        <Separator orientation="vertical" className="h-4 mx-1" />
        <button
          onClick={openShortcuts}
          className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded transition-colors"
        >
          <span>⌘/</span>
          <span>Shortcuts</span>
        </button>
        <Separator orientation="vertical" className="h-4 mx-1" />
        <CurrentTime />
      </div>
    </div>
  );
}
