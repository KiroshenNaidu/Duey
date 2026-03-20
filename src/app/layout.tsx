import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppDataProvider } from '@/context/AppDataContext';
import { BottomNav } from '@/components/BottomNav';
import { ThemeProvider } from '@/components/ThemeProvider';
import { FloatingTools } from '@/components/FloatingTools';
import { FirebaseClientProvider } from '@/firebase/client-provider';

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
      <body className="font-body antialiased">
        <FirebaseClientProvider>
          <AppDataProvider>
            <ThemeProvider>
              <div className="flex flex-col min-h-dvh bg-transparent relative z-0">
                <BottomNav />
                <main className="flex-1 overflow-y-auto pt-16 pb-16 px-2">
                  {children}
                </main>
                <div className="fixed bottom-0 left-0 right-0 h-14 bg-card/95 backdrop-blur-sm border-t border-accent/[.1] z-50" />
                <FloatingTools />
              </div>
            </ThemeProvider>
          </AppDataProvider>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
