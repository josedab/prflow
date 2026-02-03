import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { DashboardLayout } from '@/components/layout/dashboard-layout';

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
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          <DashboardLayout>{children}</DashboardLayout>
        </Providers>
      </body>
    </html>
  );
}
