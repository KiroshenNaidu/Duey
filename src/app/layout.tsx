import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppDataProvider } from '@/context/AppDataContext';
import { BottomNav } from '@/components/BottomNav';
import { EmptyBottomBar } from '@/components/EmptyBottomBar';
import { ThemeProvider } from '@/components/ThemeProvider';
import { FloatingTools } from '@/components/FloatingTools';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ErrorModal } from '@/components/ErrorModal';
import { AppShell } from '@/components/AppShell';
import { CurrencyPickerDialog } from '@/components/CurrencyPickerDialog';
import { HardwareBackButton } from '@/components/HardwareBackButton';
import { KeyboardInset } from '@/components/KeyboardInset';

export const metadata: Metadata = {
  title: 'Duey',
  description: 'Manual Debt & Payment Tracker',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
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
          <AppDataProvider>
            <ThemeProvider>
              <ErrorBoundary>
                <div className="flex flex-col min-h-dvh bg-transparent relative z-0">
                  <main className="flex-1 overflow-y-auto px-2" style={{ paddingTop: 'var(--top-main-pt)', paddingBottom: 'calc(70px + var(--sab) + 24px)' }}>
                    <AppShell>
                      {children}
                    </AppShell>
                  </main>
                  <EmptyBottomBar />
                  <BottomNav />
                  <FloatingTools />
                </div>
                <ErrorModal />
                <CurrencyPickerDialog />
                <HardwareBackButton />
                <KeyboardInset />
              </ErrorBoundary>
            </ThemeProvider>
          </AppDataProvider>
      </body>
    </html>
  );
}
