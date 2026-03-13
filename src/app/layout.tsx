import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppDataProvider } from '@/context/AppDataContext';
import { BottomNav } from '@/components/BottomNav';
import { Toaster } from "@/components/ui/toaster";
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'DebtMate',
  description: 'Manual Debt & Payment Tracker',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#4062BF',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head />
      <body className={`${inter.variable} font-body antialiased`}>
        <AppDataProvider>
          <div className="flex flex-col min-h-dvh bg-background">
            <main className="flex-1 overflow-y-auto pb-24 pt-4 px-4">
              {children}
            </main>
            <BottomNav />
          </div>
          <Toaster />
        </AppDataProvider>
      </body>
    </html>
  );
}
