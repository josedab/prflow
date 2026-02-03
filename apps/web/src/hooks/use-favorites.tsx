'use client';

import * as React from 'react';
import { Star, Pin, PinOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type FavoriteType = 'repository' | 'workflow' | 'page';

interface FavoriteItem {
  id: string;
  type: FavoriteType;
  name: string;
  href?: string;
  metadata?: Record<string, unknown>;
  pinnedAt: number;
}

interface FavoritesContextType {
  favorites: FavoriteItem[];
  isFavorite: (id: string) => boolean;
  addFavorite: (item: Omit<FavoriteItem, 'pinnedAt'>) => void;
  removeFavorite: (id: string) => void;
  toggleFavorite: (item: Omit<FavoriteItem, 'pinnedAt'>) => void;
  getFavoritesByType: (type: FavoriteType) => FavoriteItem[];
  reorderFavorites: (startIndex: number, endIndex: number) => void;
}

const FAVORITES_KEY = 'prflow-favorites-v2';

const FavoritesContext = React.createContext<FavoritesContextType | null>(null);

export function useFavorites() {
  const context = React.useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
}

interface FavoritesProviderProps {
  children: React.ReactNode;
}

export function FavoritesProvider({ children }: FavoritesProviderProps) {
  const [favorites, setFavorites] = React.useState<FavoriteItem[]>([]);

  // Load from localStorage
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

  // Save to localStorage
  const saveFavorites = React.useCallback((items: FavoriteItem[]) => {
    setFavorites(items);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(items));
  }, []);

  const isFavorite = React.useCallback(
    (id: string) => favorites.some((f) => f.id === id),
    [favorites]
  );

  const addFavorite = React.useCallback(
    (item: Omit<FavoriteItem, 'pinnedAt'>) => {
      if (!isFavorite(item.id)) {
        saveFavorites([...favorites, { ...item, pinnedAt: Date.now() }]);
      }
    },
    [favorites, isFavorite, saveFavorites]
  );

  const removeFavorite = React.useCallback(
    (id: string) => {
      saveFavorites(favorites.filter((f) => f.id !== id));
    },
    [favorites, saveFavorites]
  );

  const toggleFavorite = React.useCallback(
    (item: Omit<FavoriteItem, 'pinnedAt'>) => {
      if (isFavorite(item.id)) {
        removeFavorite(item.id);
      } else {
        addFavorite(item);
      }
    },
    [isFavorite, addFavorite, removeFavorite]
  );

  const getFavoritesByType = React.useCallback(
    (type: FavoriteType) => favorites.filter((f) => f.type === type),
    [favorites]
  );

  const reorderFavorites = React.useCallback(
    (startIndex: number, endIndex: number) => {
      const result = Array.from(favorites);
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
      saveFavorites(result);
    },
    [favorites, saveFavorites]
  );

  return (
    <FavoritesContext.Provider
      value={{
        favorites,
        isFavorite,
        addFavorite,
        removeFavorite,
        toggleFavorite,
        getFavoritesByType,
        reorderFavorites,
      }}
    >
      {children}
    </FavoritesContext.Provider>
  );
}

// UI Components
interface FavoriteButtonProps {
  item: Omit<FavoriteItem, 'pinnedAt'>;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'star' | 'pin';
  showLabel?: boolean;
}

export function FavoriteButton({
  item,
  className,
  size = 'md',
  variant = 'star',
  showLabel = false,
}: FavoriteButtonProps) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const favorited = isFavorite(item.id);

  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-10 w-10',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  const Icon = variant === 'star' ? Star : favorited ? Pin : PinOff;

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        sizeClasses[size],
        favorited && variant === 'star' && 'text-yellow-500',
        favorited && variant === 'pin' && 'text-blue-500',
        className
      )}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        toggleFavorite(item);
      }}
      title={favorited ? 'Remove from favorites' : 'Add to favorites'}
    >
      <Icon
        className={cn(
          iconSizes[size],
          favorited && variant === 'star' && 'fill-yellow-500'
        )}
      />
      {showLabel && (
        <span className="ml-1 text-xs">
          {favorited ? 'Favorited' : 'Favorite'}
        </span>
      )}
    </Button>
  );
}

// Favorites list component
interface FavoritesListProps {
  type?: FavoriteType;
  onSelect?: (item: FavoriteItem) => void;
  emptyMessage?: string;
  className?: string;
}

export function FavoritesList({
  type,
  onSelect,
  emptyMessage = 'No favorites yet',
  className,
}: FavoritesListProps) {
  const { favorites, getFavoritesByType, removeFavorite } = useFavorites();

  const items = type ? getFavoritesByType(type) : favorites;

  if (items.length === 0) {
    return (
      <div className={cn('py-4 text-center text-sm text-muted-foreground', className)}>
        <Star className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-1', className)}>
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer group"
          onClick={() => onSelect?.(item)}
        >
          <Star className="h-3 w-3 fill-yellow-500 text-yellow-500 shrink-0" />
          <span className="flex-1 text-sm truncate">{item.name}</span>
          <span className="text-xs text-muted-foreground capitalize">
            {item.type}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              removeFavorite(item.id);
            }}
          >
            <PinOff className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  );
}
