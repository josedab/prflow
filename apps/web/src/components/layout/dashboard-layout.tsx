'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import { Sidebar } from '@/components/layout/sidebar';
import { MobileNav } from '@/components/layout/mobile-nav';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { CommandPalette } from '@/components/layout/command-palette';
import { NotificationCenter } from '@/components/layout/notification-center';
import { KeyboardShortcutsDialog, useKeyboardShortcuts } from '@/components/layout/keyboard-shortcuts';
import { StatusBar } from '@/components/layout/status-bar';
import { Input } from '@/components/ui/input';
import { ThemeToggle } from '@/components/layout/theme-toggle';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const { shortcutsOpen, setShortcutsOpen } = useKeyboardShortcuts();

  React.useEffect(() => {
    const stored = localStorage.getItem('sidebar-collapsed');
    if (stored !== null) {
      setSidebarCollapsed(JSON.parse(stored));
    }
  }, []);

  const handleToggleSidebar = React.useCallback(() => {
    const newValue = !sidebarCollapsed;
    setSidebarCollapsed(newValue);
    localStorage.setItem('sidebar-collapsed', JSON.stringify(newValue));
  }, [sidebarCollapsed]);

  // Listen for toggle-sidebar custom event
  React.useEffect(() => {
    const handleToggleEvent = () => handleToggleSidebar();
    window.addEventListener('toggle-sidebar', handleToggleEvent);
    return () => window.removeEventListener('toggle-sidebar', handleToggleEvent);
  }, [handleToggleSidebar]);

  return (
    <div className="flex h-screen overflow-hidden">
      <CommandPalette />
      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      {/* Desktop Sidebar */}
      <div className="hidden md:flex">
        <Sidebar collapsed={sidebarCollapsed} onToggle={handleToggleSidebar} />
      </div>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-14 items-center gap-4 border-b bg-card px-4 md:px-6">
          <MobileNav />

          <div className="flex-1">
            <Breadcrumb />
          </div>

          {/* Search */}
          <div className="hidden md:flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search... (⌘K)"
                className="w-64 pl-8 h-9"
                onFocus={(e) => {
                  e.target.blur();
                  const event = new KeyboardEvent('keydown', {
                    key: 'k',
                    metaKey: true,
                  });
                  document.dispatchEvent(event);
                }}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <NotificationCenter />
            <div className="hidden md:block">
              <ThemeToggle />
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto bg-background p-4 md:p-6">
          {children}
        </main>

        {/* Status Bar */}
        <StatusBar className="hidden md:flex" />
      </div>
    </div>
  );
}
