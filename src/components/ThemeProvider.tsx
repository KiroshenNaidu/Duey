'use client';

import { ReactNode, useEffect, useState, useContext } from 'react';
import { idbGet } from '@/lib/utils';
import { Inter, Nunito, Lexend, DM_Sans, Space_Grotesk, Playfair_Display } from 'next/font/google';
import { AppDataContext } from '@/context/AppDataContext';

const inter         = Inter          ({ subsets: ['latin'], variable: '--font-inter',         display: 'swap' });
const nunito        = Nunito         ({ subsets: ['latin'], variable: '--font-nunito',        display: 'swap' });
const lexend        = Lexend         ({ subsets: ['latin'], variable: '--font-lexend',        display: 'swap' });
const dmSans        = DM_Sans        ({ subsets: ['latin'], variable: '--font-dm-sans',       display: 'swap' });
const spaceGrotesk  = Space_Grotesk  ({ subsets: ['latin'], variable: '--font-space-grotesk', display: 'swap' });
const playfair      = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair',     display: 'swap' });

export const FONT_VAR_MAP: Record<string, string> = {
  Inter:           'var(--font-inter)',
  Serif:           'serif',
  Mono:            'monospace',
  Nunito:          'var(--font-nunito)',
  Lexend:          'var(--font-lexend)',
  'DM Sans':       'var(--font-dm-sans)',
  'Space Grotesk': 'var(--font-space-grotesk)',
  Playfair:        'var(--font-playfair)',
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { themeSettings } = useContext(AppDataContext);
  const [backgroundImage, setBackgroundImage] = useState('');
  const [isImageReady, setIsImageReady] = useState(false);

  // One-time probe: flag genuinely low-end devices so globals.css can ease the
  // most GPU-expensive effect (glass backdrop-blur) without changing the look elsewhere.
  useEffect(() => {
    const nav = navigator as Navigator & { deviceMemory?: number };
    const cores = nav.hardwareConcurrency ?? 8;
    const memory = nav.deviceMemory ?? 8;
    if (cores <= 4 || memory <= 3) {
      document.body.classList.add('low-power');
    }
  }, []);

  useEffect(() => {
    async function loadInitialImage() {
      try {
        const storedImage = await idbGet<string>('backgroundImage');
        if (storedImage) setBackgroundImage(storedImage);
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
    root.style.setProperty('--ring', themeSettings.accent);
    root.style.setProperty('--foreground', themeSettings.foreground);
    root.style.setProperty('--accent-foreground', themeSettings.accentForeground);
    root.style.setProperty('--font-family', FONT_VAR_MAP[themeSettings.font] ?? 'var(--font-inter)');
    root.style.setProperty('--bg-x', `${themeSettings.bgX ?? 50}%`);
    root.style.setProperty('--bg-y', `${themeSettings.bgY ?? 50}%`);
    root.style.setProperty('--glass-opacity', String(themeSettings.glassOpacity ?? 0.55));

    document.body.style.zoom = `${themeSettings.uiScale || 1.0}`;

    const body = document.body;
    body.classList.toggle('has-bg-image', !!backgroundImage);
    body.classList.remove('ui-glass', 'ui-minimal', 'ui-elevated');
    if (themeSettings.uiStyle !== 'solid') body.classList.add(`ui-${themeSettings.uiStyle}`);

  }, [themeSettings, backgroundImage, isImageReady]);

  const fontClasses = [
    inter.variable, nunito.variable, lexend.variable,
    dmSans.variable, spaceGrotesk.variable, playfair.variable,
  ].join(' ');

  return (
    <div className={fontClasses}>
      <div
        id="global-bg-image"
        className="fixed inset-0 z-[-10] bg-cover"
        style={{
          backgroundImage: backgroundImage ? `url(${backgroundImage})` : 'none',
          backgroundPosition: 'var(--bg-x, 50%) var(--bg-y, 50%)',
          willChange: 'opacity',
          transform: 'translateZ(0)',
        }}
      />
      <div
        id="global-bg-overlay"
        className="fixed inset-0 z-[-9] bg-black transition-opacity duration-500"
        style={{ opacity: backgroundImage ? themeSettings.backgroundOpacity : 0, willChange: 'opacity', transform: 'translateZ(0)' }}
      />
      {children}
    </div>
  );
}
