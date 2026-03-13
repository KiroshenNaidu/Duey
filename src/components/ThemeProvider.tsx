'use client';

import { ReactNode, useEffect, useState } from 'react';
import useLocalStorage from '@/hooks/useLocalStorage';
import type { ThemeSettings } from '@/lib/types';
import { idbGet } from '@/lib/utils';
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const defaultTheme: Omit<ThemeSettings, 'backgroundImage'> = {
  background: '220 14% 10%',
  surface: '220 14% 12%',
  primary: '225 50% 50%',
  accent: '188 78% 57%',
  font: 'Inter',
  backgroundOpacity: 0.1,
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeSettings] = useLocalStorage<Omit<ThemeSettings, 'backgroundImage'>>('themeSettings', defaultTheme);
  const [backgroundImage, setBackgroundImage] = useState('');
  const [isThemeReady, setIsThemeReady] = useState(false);

  useEffect(() => {
    async function loadBackground() {
      const storedImage = await idbGet<string>('backgroundImage');
      if (storedImage) {
        setBackgroundImage(storedImage);
      }
      setIsThemeReady(true);
    }
    loadBackground();
  }, []);

  useEffect(() => {
    if (!isThemeReady) return;
    
    const root = document.documentElement;
    const theme = { ...defaultTheme, ...themeSettings };
    
    root.style.setProperty('--background', theme.background);
    root.style.setProperty('--card', theme.surface);
    root.style.setProperty('--primary', theme.primary);
    root.style.setProperty('--accent', theme.accent);
    
    if (theme.font === 'Inter') {
      root.style.setProperty('--font-family', `var(--font-inter)`);
    } else if (theme.font === 'Serif') {
      root.style.setProperty('--font-family', 'serif');
    } else {
      root.style.setProperty('--font-family', 'monospace');
    }
    
    if (backgroundImage) {
      document.body.classList.add('has-bg-image');
    } else {
      document.body.classList.remove('has-bg-image');
    }
    
  }, [themeSettings, backgroundImage, isThemeReady]);

  useEffect(() => {
    // Cleanup function to remove class on component unmount (e.g., for HMR)
    return () => {
      document.body.classList.remove('has-bg-image');
    };
  }, []);

  return (
    <div className={`${inter.variable}`}>
      {isThemeReady && backgroundImage && (
        <>
          <div
            className="fixed inset-0 z-[-10] bg-cover bg-center transition-all duration-500"
            style={{ backgroundImage: `url(${backgroundImage})` }}
          />
          <div
            className="fixed inset-0 z-[-9] bg-black transition-opacity duration-500"
            style={{ opacity: themeSettings.backgroundOpacity }}
          />
        </>
      )}
      {children}
    </div>
  );
}
