'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Fuse from 'fuse.js';
import {
  LayoutDashboard,
  GitPullRequest,
  GitBranch,
  FolderGit2,
  BarChart3,
  Building2,
  Settings,
  Search,
  FileText,
  Clock,
  Star,
  Moon,
  Sun,
  Keyboard,
  RefreshCw,
  Copy,
  Plus,
  Trash2,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';

interface RecentItem {
  id: string;
  type: 'page' | 'workflow' | 'repository';
  name: string;
  href: string;
  timestamp: number;
}

interface CommandItem {
  id: string;
  name: string;
  description?: string;
  href?: string;
  action?: string;
  icon: React.ElementType;
  shortcut?: string;
  category: 'navigation' | 'action' | 'theme' | 'recent' | 'favorite';
  keywords?: string[];
}

const navigationCommands: CommandItem[] = [
  { id: 'nav-dashboard', name: 'Dashboard', href: '/', icon: LayoutDashboard, shortcut: 'G H', category: 'navigation', keywords: ['home', 'main'] },
  { id: 'nav-repos', name: 'Repositories', href: '/repositories', icon: FolderGit2, shortcut: 'G R', category: 'navigation', keywords: ['repos', 'projects'] },
  { id: 'nav-workflows', name: 'Workflows', href: '/workflows', icon: GitPullRequest, shortcut: 'G W', category: 'navigation', keywords: ['pr', 'pull request', 'analysis'] },
  { id: 'nav-merge', name: 'Merge Queue', href: '/merge-queue', icon: GitBranch, shortcut: 'G M', category: 'navigation', keywords: ['queue', 'merge', 'ci'] },
  { id: 'nav-analytics', name: 'Analytics', href: '/analytics', icon: BarChart3, shortcut: 'G A', category: 'navigation', keywords: ['stats', 'metrics', 'charts'] },
  { id: 'nav-enterprise', name: 'Enterprise', href: '/enterprise', icon: Building2, shortcut: 'G E', category: 'navigation', keywords: ['org', 'organization', 'team'] },
  { id: 'nav-settings', name: 'Settings', href: '/settings', icon: Settings, shortcut: 'G S', category: 'navigation', keywords: ['config', 'preferences'] },
];

const quickActions: CommandItem[] = [
  { id: 'action-search', name: 'Search Repositories', description: 'Find repositories by name', action: 'search-repos', icon: Search, category: 'action', keywords: ['find', 'filter'] },
  { id: 'action-recent', name: 'View Recent Workflows', description: 'See latest PR analyses', action: 'recent-workflows', icon: FileText, category: 'action' },
  { id: 'action-new', name: 'New Analysis', description: 'Start a new PR analysis', action: 'new-analysis', icon: Plus, category: 'action', keywords: ['create', 'analyze'] },
  { id: 'action-refresh', name: 'Refresh Data', description: 'Reload current page data', action: 'refresh', icon: RefreshCw, shortcut: '⌘ R', category: 'action' },
  { id: 'action-copy-url', name: 'Copy Page URL', description: 'Copy current URL to clipboard', action: 'copy-url', icon: Copy, category: 'action' },
  { id: 'action-shortcuts', name: 'Keyboard Shortcuts', description: 'View all shortcuts', action: 'shortcuts', icon: Keyboard, shortcut: '⌘ /', category: 'action' },
  { id: 'action-clear-recent', name: 'Clear Recent Items', description: 'Clear browsing history', action: 'clear-recent', icon: Trash2, category: 'action' },
];

const themeCommands: CommandItem[] = [
  { id: 'theme-light', name: 'Light Mode', description: 'Switch to light theme', action: 'theme-light', icon: Sun, category: 'theme' },
  { id: 'theme-dark', name: 'Dark Mode', description: 'Switch to dark theme', action: 'theme-dark', icon: Moon, category: 'theme' },
  { id: 'theme-system', name: 'System Theme', description: 'Follow system preference', action: 'theme-system', icon: Settings, category: 'theme' },
];

const RECENT_ITEMS_KEY = 'prflow-recent-items';
const FAVORITES_KEY = 'prflow-favorites';
const MAX_RECENT_ITEMS = 10;

function useRecentItems() {
  const [recentItems, setRecentItems] = React.useState<RecentItem[]>([]);

  React.useEffect(() => {
    const stored = localStorage.getItem(RECENT_ITEMS_KEY);
    if (stored) {
      try {
        setRecentItems(JSON.parse(stored));
      } catch {
        // Ignore
      }
    }
  }, []);

  const addRecentItem = React.useCallback((item: Omit<RecentItem, 'timestamp'>) => {
    setRecentItems((prev) => {
      const filtered = prev.filter((i) => i.id !== item.id);
      const updated = [{ ...item, timestamp: Date.now() }, ...filtered].slice(0, MAX_RECENT_ITEMS);
      localStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const clearRecentItems = React.useCallback(() => {
    setRecentItems([]);
    localStorage.removeItem(RECENT_ITEMS_KEY);
  }, []);

  return { recentItems, addRecentItem, clearRecentItems };
}

function useFavorites() {
  const [favorites, setFavorites] = React.useState<string[]>([]);

  React.useEffect(() => {
    const stored = localStorage.getItem(FAVORITES_KEY);
    if (stored) {
      try {
        setFavorites(JSON.parse(stored));
      } catch {
        // Ignore
      }
    }
  }, []);

  const toggleFavorite = React.useCallback((id: string) => {
    setFavorites((prev) => {
      const updated = prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id];
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  return { favorites, toggleFavorite };
}

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const router = useRouter();
  const { setTheme } = useTheme();
  const { recentItems, addRecentItem, clearRecentItems } = useRecentItems();
  const { favorites, toggleFavorite } = useFavorites();

  // Combine all commands for fuzzy search
  const allCommands = React.useMemo(
    () => [...navigationCommands, ...quickActions, ...themeCommands],
    []
  );

  // Initialize Fuse for fuzzy search
  const fuse = React.useMemo(
    () =>
      new Fuse(allCommands, {
        keys: ['name', 'description', 'keywords'],
        threshold: 0.4,
        includeScore: true,
      }),
    [allCommands]
  );

  // Filter commands based on search
  const filteredCommands = React.useMemo(() => {
    if (!search.trim()) return null;
    return fuse.search(search).map((result) => result.item);
  }, [search, fuse]);

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const handleSelect = (href: string, name: string) => {
    setOpen(false);
    setSearch('');
    addRecentItem({ id: href, type: 'page', name, href });
    router.push(href);
  };

  const handleAction = (action: string) => {
    setOpen(false);
    setSearch('');
    
    switch (action) {
      case 'search-repos':
        router.push('/repositories?search=true');
        break;
      case 'recent-workflows':
        router.push('/workflows?sort=recent');
        break;
      case 'new-analysis':
        router.push('/workflows/new');
        break;
      case 'refresh':
        window.location.reload();
        break;
      case 'copy-url':
        navigator.clipboard.writeText(window.location.href);
        break;
      case 'shortcuts': {
        const event = new KeyboardEvent('keydown', { key: '/', metaKey: true });
        document.dispatchEvent(event);
        break;
      }
      case 'clear-recent':
        clearRecentItems();
        break;
      case 'theme-light':
        setTheme('light');
        break;
      case 'theme-dark':
        setTheme('dark');
        break;
      case 'theme-system':
        setTheme('system');
        break;
    }
  };

  const favoriteCommands = navigationCommands.filter((cmd) => favorites.includes(cmd.id));

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput 
        placeholder="Type a command or search..." 
        value={search}
        onValueChange={setSearch}
      />
      <CommandList className="max-h-[400px]">
        <CommandEmpty>
          <div className="py-6 text-center">
            <p className="text-sm text-muted-foreground">No results found</p>
            <p className="text-xs text-muted-foreground mt-1">Try a different search term</p>
          </div>
        </CommandEmpty>

        {/* Fuzzy search results */}
        {filteredCommands && filteredCommands.length > 0 && (
          <CommandGroup heading="Search Results">
            {filteredCommands.map((item) => {
              const ItemIcon = item.icon;
              return (
                <CommandItem
                  key={item.id}
                  onSelect={() => item.href ? handleSelect(item.href, item.name) : handleAction(item.action!)}
                  className="flex items-center gap-2"
                >
                  <ItemIcon className="h-4 w-4 shrink-0" />
                  <div className="flex flex-col flex-1 min-w-0">
                    <span>{item.name}</span>
                    {item.description && (
                      <span className="text-xs text-muted-foreground truncate">{item.description}</span>
                    )}
                  </div>
                  {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {/* Show default groups when not searching */}
        {!filteredCommands && (
          <>
            {/* Favorites */}
            {favoriteCommands.length > 0 && (
              <>
                <CommandGroup heading="Favorites">
                  {favoriteCommands.map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <CommandItem
                        key={item.id}
                        onSelect={() => handleSelect(item.href!, item.name)}
                        className="flex items-center gap-2"
                      >
                        <Star className="h-4 w-4 shrink-0 fill-yellow-400 text-yellow-400" />
                        <ItemIcon className="h-4 w-4 shrink-0" />
                        <span>{item.name}</span>
                        <CommandShortcut>{item.shortcut}</CommandShortcut>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            {/* Recent Items */}
            {recentItems.length > 0 && (
              <>
                <CommandGroup heading="Recent">
                  {recentItems.slice(0, 5).map((item) => (
                    <CommandItem
                      key={item.id}
                      onSelect={() => handleSelect(item.href, item.name)}
                      className="flex items-center gap-2"
                    >
                      <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span>{item.name}</span>
                      <Badge variant="secondary" className="ml-auto text-[10px]">
                        {item.type}
                      </Badge>
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            {/* Navigation */}
            <CommandGroup heading="Navigation">
              {navigationCommands.map((item) => {
                const ItemIcon = item.icon;
                const isFavorite = favorites.includes(item.id);
                return (
                  <CommandItem
                    key={item.id}
                    onSelect={() => handleSelect(item.href!, item.name)}
                    className="flex items-center gap-2 group"
                  >
                    <ItemIcon className="h-4 w-4 shrink-0" />
                    <span className="flex-1">{item.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(item.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Star className={`h-3 w-3 ${isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
                    </button>
                    <CommandShortcut>{item.shortcut}</CommandShortcut>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />

            {/* Quick Actions */}
            <CommandGroup heading="Actions">
              {quickActions.map((item) => {
                const ItemIcon = item.icon;
                return (
                  <CommandItem
                    key={item.id}
                    onSelect={() => handleAction(item.action!)}
                    className="flex items-center gap-2"
                  >
                    <ItemIcon className="h-4 w-4 shrink-0" />
                    <div className="flex flex-col flex-1 min-w-0">
                      <span>{item.name}</span>
                      {item.description && (
                        <span className="text-xs text-muted-foreground">{item.description}</span>
                      )}
                    </div>
                    {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />

            {/* Theme */}
            <CommandGroup heading="Theme">
              {themeCommands.map((item) => {
                const ItemIcon = item.icon;
                return (
                  <CommandItem
                    key={item.id}
                    onSelect={() => handleAction(item.action!)}
                    className="flex items-center gap-2"
                  >
                    <ItemIcon className="h-4 w-4 shrink-0" />
                    <span>{item.name}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>
      <div className="border-t px-3 py-2 text-xs text-muted-foreground flex items-center justify-between">
        <div className="flex items-center gap-2">
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">↑↓</kbd>
          <span>Navigate</span>
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">↵</kbd>
          <span>Select</span>
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">esc</kbd>
          <span>Close</span>
        </div>
        <div className="flex items-center gap-1">
          <Star className="h-3 w-3" />
          <span>Hover to favorite</span>
        </div>
      </div>
    </CommandDialog>
  );
}
