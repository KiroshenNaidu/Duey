'use client';

import { ReactNode, useEffect, useState, useContext } from 'react';
import { idbGet } from '@/lib/utils';
import { Inter } from 'next/font/google';
import { AppDataContext } from '@/context/AppDataContext';
import { Skeleton } from './ui/skeleton';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { themeSettings } = useContext(AppDataContext);
  const [backgroundImage, setBackgroundImage] = useState('');
  const [isImageReady, setIsImageReady] = useState(false);

  useEffect(() => {
    async function loadInitialImage() {
      try {
        const storedImage = await idbGet<string>('backgroundImage');
        if (storedImage) {
          setBackgroundImage(storedImage);
        }
      } catch (error) {
        console.error("Failed to load background image from IndexedDB", error);
      } finally {
        setIsImageReady(true);
      }
    }
    loadInitialImage();
  }, []);

  useEffect(() => {
    if (!isImageReady || !themeSettings) return; 
    
    const root = document.documentElement;
    
    root.style.setProperty('--background', themeSettings.background);
    root.style.setProperty('--card', themeSettings.surface);
    root.style.setProperty('--primary', themeSettings.primary);
    root.style.setProperty('--accent', themeSettings.accent);
    
    if (themeSettings.font === 'Inter') {
      root.style.setProperty('--font-family', `var(--font-inter)`);
    } else if (themeSettings.font === 'Serif') {
      root.style.setProperty('--font-family', 'serif');
    } else {
      root.style.setProperty('--font-family', 'monospace');
    }
    
    const body = document.body;
    if (backgroundImage) {
      body.classList.add('has-bg-image');
    } else {
      body.classList.remove('has-bg-image');
    }
    
  }, [themeSettings, backgroundImage, isImageReady]);

  useEffect(() => {
    return () => {
      document.body.classList.remove('has-bg-image');
    };
  }, []);

  if (!isImageReady || !themeSettings) {
    return (
        <div className={`${inter.variable}`}>
            <div className="flex flex-col min-h-dvh bg-background relative z-0 p-4 space-y-4">
              <Skeleton className="h-12 w-1/2" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
        </div>
    );
  }

  return (
    <div className={`${inter.variable}`}>
        <>
          <div
            id="global-bg-image"
            className="fixed inset-0 z-[-10] bg-cover bg-center transition-all duration-500"
            style={{ backgroundImage: backgroundImage ? `url(${backgroundImage})` : 'none' }}
          />
          <div
            id="global-bg-overlay"
            className="fixed inset-0 z-[-9] bg-black transition-opacity duration-500"
            style={{ opacity: backgroundImage ? themeSettings.backgroundOpacity : 0 }}
          />
        </>
      {children}
    </div>
  );
}
