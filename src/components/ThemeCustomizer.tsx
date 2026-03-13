'use client';
import { useState, useEffect } from 'react';
import useLocalStorage from '@/hooks/useLocalStorage';
import type { ThemeSettings } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Slider } from './ui/slider';
import { Button } from './ui/button';
import { hexToHsl, hslToHex } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const defaultTheme: ThemeSettings = {
  background: '220 14% 10%',
  primary: '225 50% 50%',
  accent: '188 78% 57%',
  font: 'Inter',
  backgroundImage: '',
  backgroundOpacity: 0.1,
};

function parseHsl(hslStr: string): [number, number, number] {
  const [h, s, l] = hslStr.replace(/%/g, '').split(' ').map(Number);
  return [h, s, l];
}

export function ThemeCustomizer() {
  const [storedTheme, setStoredTheme] = useLocalStorage<ThemeSettings>('themeSettings', defaultTheme);
  const [previewTheme, setPreviewTheme] = useState(storedTheme);
  const [isClient, setIsClient] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setIsClient(true);
    setPreviewTheme(storedTheme);
  }, [storedTheme]);
  
  useEffect(() => {
    if (!isClient) return;
    const root = document.documentElement;
    root.style.setProperty('--background', previewTheme.background);
    root.style.setProperty('--primary', previewTheme.primary);
    root.style.setProperty('--accent', previewTheme.accent);
    root.style.setProperty('--font-family', previewTheme.font === 'Inter' ? 'var(--font-inter)' : previewTheme.font.toLowerCase());
    root.style.setProperty('--bg-image-url', previewTheme.backgroundImage ? `url(${previewTheme.backgroundImage})` : 'none');
    root.style.setProperty('--bg-overlay-opacity', previewTheme.backgroundImage ? String(previewTheme.backgroundOpacity) : '0');
  }, [previewTheme, isClient]);

  const handleColorChange = (name: 'background' | 'primary' | 'accent', value: string) => {
    const hslValue = hexToHsl(value);
    if (hslValue) {
      setPreviewTheme(prev => ({ ...prev, [name]: hslValue }));
    }
  };

  const handleSave = () => {
    setStoredTheme(previewTheme);
    toast({ title: 'Theme Saved', description: 'Your new theme has been applied.' });
  };

  const handleCancel = () => {
    setPreviewTheme(storedTheme);
    toast({ title: 'Changes Reverted', variant: 'destructive' });
  };

  if (!isClient) {
    return null;
  }

  const [bgH, bgS, bgL] = parseHsl(previewTheme.background);
  const [prH, prS, prL] = parseHsl(previewTheme.primary);
  const [acH, acS, acL] = parseHsl(previewTheme.accent);

  return (
    <Card>
      <CardHeader><CardTitle>Theme Customization</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Background</Label>
            <Input type="color" value={hslToHex(bgH, bgS, bgL)} onChange={e => handleColorChange('background', e.target.value)} className="h-12"/>
          </div>
          <div className="space-y-2">
            <Label>Primary</Label>
            <Input type="color" value={hslToHex(prH, prS, prL)} onChange={e => handleColorChange('primary', e.target.value)} className="h-12"/>
          </div>
          <div className="space-y-2">
            <Label>Accent</Label>
            <Input type="color" value={hslToHex(acH, acS, acL)} onChange={e => handleColorChange('accent', e.target.value)} className="h-12"/>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Font Family</Label>
          <Select value={previewTheme.font} onValueChange={(value: 'Inter' | 'Serif' | 'Mono') => setPreviewTheme(p => ({...p, font: value}))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Inter">Inter (Modern)</SelectItem>
              <SelectItem value="Serif">Serif (Classic)</SelectItem>
              <SelectItem value="Mono">Mono (Technical)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Background Image URL</Label>
          <Input placeholder="https://images.unsplash.com/..." value={previewTheme.backgroundImage} onChange={e => setPreviewTheme(p => ({...p, backgroundImage: e.target.value}))}/>
        </div>

        <div className="space-y-2">
          <Label>Background Overlay Opacity</Label>
          <div className="flex items-center gap-4">
            <Slider 
              value={[previewTheme.backgroundOpacity]} 
              onValueChange={([v]) => setPreviewTheme(p => ({...p, backgroundOpacity: v}))}
              max={1} 
              step={0.05} 
              disabled={!previewTheme.backgroundImage}
            />
            <span className="text-sm text-muted-foreground w-12 text-right">{(previewTheme.backgroundOpacity * 100).toFixed(0)}%</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="ghost" onClick={handleCancel}>Cancel</Button>
          <Button onClick={handleSave}>Save Theme</Button>
        </div>
      </CardContent>
    </Card>
  );
}
