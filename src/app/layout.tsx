import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AppDataProvider } from '@/context/AppDataContext';
import { BottomNav } from '@/components/BottomNav';
import { EmptyBottomBar } from '@/components/EmptyBottomBar';
import { ThemeProvider } from '@/components/ThemeProvider';
import { FloatingTools } from '@/components/FloatingTools';
import { FirebaseClientProvider } from '@/firebase/client-provider';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Duey',
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
        <FirebaseClientProvider>
          <AppDataProvider>
            <ThemeProvider>
              <div className="flex flex-col min-h-dvh bg-transparent relative z-0">
                <main className="flex-1 overflow-y-auto pt-[128px] pb-[50vh] px-2">
                  {children}
                </main>
                <EmptyBottomBar />
                <BottomNav />
                <FloatingTools />
              </div>
            </ThemeProvider>
          </AppDataProvider>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
