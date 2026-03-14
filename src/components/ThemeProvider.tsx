
'use client';

import { ReactNode, useEffect, useState, useContext } from 'react';
import { idbGet } from '@/lib/utils';
import { Inter } from 'next/font/google';
import { AppDataContext } from '@/context/AppDataContext';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { themeSettings } = useContext(AppDataContext);
  const [backgroundImage, setBackgroundImage] = useState('');
  const [isImageReady, setIsImageReady] = useState(false);

  // Immediate load from local storage to prevent flicker
  useEffect(() => {
    async function loadInitialImage() {
      try {
        const storedImage = await idbGet<string>('backgroundImage');
        if (storedImage) {
          setBackgroundImage(storedImage);
        }
      } catch (error) {
        console.error("Failed to load background image", error);
      } finally {
        setIsImageReady(true);
      }
    }
    loadInitialImage();
  }, []);

  useEffect(() => {
    if (!themeSettings) return; 
    
    const root = document.documentElement;
    root.style.setProperty('--background', themeSettings.background);
    root.style.setProperty('--card', themeSettings.surface);
    root.style.setProperty('--primary', themeSettings.primary);
    root.style.setProperty('--accent', themeSettings.accent);
    root.style.setProperty('--foreground', themeSettings.foreground);
    root.style.setProperty('--accent-foreground', themeSettings.accentForeground);
    
    if (themeSettings.font === 'Inter') {
      root.style.setProperty('--font-family', `var(--font-inter)`);
    } else if (themeSettings.font === 'Serif') {
      root.style.setProperty('--font-family', 'serif');
    } else {
      root.style.setProperty('--font-family', 'monospace');
    }
    
    document.body.style.zoom = `${themeSettings.uiScale || 1.0}`;
    
    const body = document.body;
    if (backgroundImage) {
      body.classList.add('has-bg-image');
    } else {
      body.classList.remove('has-bg-image');
    }
    
  }, [themeSettings, backgroundImage, isImageReady]);

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
            style={{ opacity: backgroundImage ? 0.1 : 0 }}
          />
        </>
      {children}
    </div>
  );
}
