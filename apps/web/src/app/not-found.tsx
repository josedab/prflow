import Link from 'next/link';
import { Home, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center text-center px-4">
      <div className="space-y-6 max-w-md">
        {/* 404 illustration */}
        <div className="space-y-2">
          <h1 className="text-8xl font-bold text-muted-foreground/30">404</h1>
          <h2 className="text-2xl font-semibold tracking-tight">
            Page not found
          </h2>
          <p className="text-muted-foreground">
            Sorry, we couldn&apos;t find the page you&apos;re looking for. It might have
            been moved, deleted, or never existed.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button asChild>
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              Go home
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="javascript:history.back()">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go back
            </Link>
          </Button>
        </div>

        {/* Help text */}
        <p className="text-sm text-muted-foreground">
          Try using the search bar or navigation menu to find what you need.
        </p>
      </div>
    </div>
  );
}
