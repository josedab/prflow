import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'PRFlow - Intelligent PR Automation',
  description: 'AI-powered pull request analysis, review, and automation',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <div className="min-h-screen bg-gray-50">
            <nav className="bg-white shadow-sm border-b">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16">
                  <div className="flex items-center">
                    <a href="/" className="text-xl font-bold text-primary-600">PRFlow</a>
                  </div>
                  <div className="flex items-center space-x-4">
                    <a href="/repositories" className="text-gray-600 hover:text-gray-900">
                      Repositories
                    </a>
                    <a href="/workflows" className="text-gray-600 hover:text-gray-900">
                      Workflows
                    </a>
                    <a href="/merge-queue" className="text-gray-600 hover:text-gray-900">
                      Merge Queue
                    </a>
                    <a href="/analytics" className="text-gray-600 hover:text-gray-900">
                      Analytics
                    </a>
                    <a href="/enterprise" className="text-gray-600 hover:text-gray-900">
                      Enterprise
                    </a>
                    <a href="/settings" className="text-gray-600 hover:text-gray-900">
                      Settings
                    </a>
                  </div>
                </div>
              </div>
            </nav>
            <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
