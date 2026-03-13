'use client';

import { ReactNode, useEffect } from 'react';
import useLocalStorage from '@/hooks/useLocalStorage';
import type { ThemeSettings } from '@/lib/types';
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const defaultTheme: ThemeSettings = {
  background: '220 14% 10%',
  primary: '225 50% 50%',
  accent: '188 78% 57%',
  font: 'Inter',
  backgroundImage: '',
  backgroundOpacity: 0.1,
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme] = useLocalStorage<ThemeSettings>('themeSettings', defaultTheme);

  useEffect(() => {
    const root = document.documentElement;

    if (theme) {
      root.style.setProperty('--background', theme.background);
      root.style.setProperty('--primary', theme.primary);
      root.style.setProperty('--accent', theme.accent);

      if (theme.font === 'Inter') {
        root.style.setProperty('--font-family', `var(--font-inter)`);
      } else if (theme.font === 'Serif') {
        root.style.setProperty('--font-family', 'serif');
      } else {
        root.style.setProperty('--font-family', 'monospace');
      }
      
      root.style.setProperty('--bg-image-url', theme.backgroundImage ? `url(${theme.backgroundImage})` : 'none');
      root.style.setProperty('--bg-overlay-opacity', theme.backgroundImage ? String(theme.backgroundOpacity) : '0');
    }
  }, [theme]);

  return <div className={`${inter.variable}`}>{children}</div>;
}
