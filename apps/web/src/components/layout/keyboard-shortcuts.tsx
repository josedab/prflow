'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';

interface Shortcut {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: Shortcut[];
}

const shortcutGroups: ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['⌘', 'K'], description: 'Open command palette' },
      { keys: ['⌘', 'B'], description: 'Toggle sidebar' },
      { keys: ['⌘', '/'], description: 'Show keyboard shortcuts' },
      { keys: ['G', 'H'], description: 'Go to home' },
      { keys: ['G', 'W'], description: 'Go to workflows' },
      { keys: ['G', 'R'], description: 'Go to repositories' },
      { keys: ['G', 'A'], description: 'Go to analytics' },
    ],
  },
  {
    title: 'Theme',
    shortcuts: [
      { keys: ['⌘', 'T'], description: 'Toggle theme (light/dark)' },
    ],
  },
  {
    title: 'Actions',
    shortcuts: [
      { keys: ['N'], description: 'Open notifications' },
      { keys: ['Esc'], description: 'Close dialog / Cancel' },
    ],
  },
];

interface KeyboardShortcutsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Navigate and control the dashboard using your keyboard.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {shortcutGroups.map((group, index) => (
            <div key={group.title}>
              {index > 0 && <Separator className="mb-4" />}
              <h4 className="mb-3 text-sm font-medium text-muted-foreground">
                {group.title}
              </h4>
              <div className="space-y-2">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.description}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, i) => (
                        <kbd
                          key={i}
                          className="inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Hook to manage keyboard shortcuts
export function useKeyboardShortcuts() {
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const { setTheme, theme } = useTheme();
  const sequenceRef = React.useRef<string[]>([]);
  const sequenceTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore if in input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      // ⌘ + / to show shortcuts
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      // ⌘ + T to toggle theme
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault();
        setTheme(theme === 'dark' ? 'light' : 'dark');
        return;
      }

      // ⌘ + B to toggle sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        const event = new CustomEvent('toggle-sidebar');
        window.dispatchEvent(event);
        return;
      }

      // Handle sequences like G + H
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        const key = e.key.toUpperCase();
        
        if (sequenceTimeoutRef.current) {
          clearTimeout(sequenceTimeoutRef.current);
        }

        sequenceRef.current.push(key);

        // Check for sequences
        const sequence = sequenceRef.current.join('');
        
        if (sequence === 'GH') {
          e.preventDefault();
          window.location.href = '/';
        } else if (sequence === 'GW') {
          e.preventDefault();
          window.location.href = '/workflows';
        } else if (sequence === 'GR') {
          e.preventDefault();
          window.location.href = '/repositories';
        } else if (sequence === 'GA') {
          e.preventDefault();
          window.location.href = '/analytics';
        } else if (key === 'N') {
          // Open notifications
          const notificationBtn = document.querySelector('[aria-label="Notifications"]') as HTMLButtonElement;
          notificationBtn?.click();
        }

        // Reset sequence after delay
        sequenceTimeoutRef.current = setTimeout(() => {
          sequenceRef.current = [];
        }, 1000);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (sequenceTimeoutRef.current) {
        clearTimeout(sequenceTimeoutRef.current);
      }
    };
  }, [theme, setTheme]);

  return {
    shortcutsOpen,
    setShortcutsOpen,
  };
}
