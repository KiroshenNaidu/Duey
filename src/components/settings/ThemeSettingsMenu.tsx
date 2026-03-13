'use client';
import { useState, useEffect, useRef } from 'react';
import useLocalStorage from '@/hooks/useLocalStorage';
import type { ThemeSettings } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { hexToHsl, hslToHex } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Upload } from 'lucide-react';

const defaultTheme: ThemeSettings = {
  background: '220 14% 10%',
  card: '220 14% 12%',
  primary: '225 50% 50%',
  accent: '188 78% 57%',
  font: 'Inter',
  backgroundImage: '',
  backgroundOpacity: 0.1,
};

const colorPresets: { name: string; settings: Partial<ThemeSettings> }[] = [
  { name: 'Default', settings: { background: '220 14% 10%', card: '220 14% 12%', primary: '225 50% 50%', accent: '188 78% 57%' } },
  { name: 'Forest', settings: { background: '120 15% 15%', card: '120 15% 18%', primary: '140 40% 45%', accent: '90 50% 60%' } },
  { name: 'Ocean', settings: { background: '210 30% 20%', card: '210 30% 25%', primary: '200 60% 50%', accent: '180 70% 45%' } },
  { name: 'Sunset', settings: { background: '25 20% 18%', card: '25 20% 22%', primary: '30 80% 60%', accent: '0 70% 65%' } },
  { name: 'Rose', settings: { background: '340 10% 15%', card: '340 10% 20%', primary: '330 50% 60%', accent: '350 70% 70%' } },
  { name: 'Mono', settings: { background: '240 5% 12%', card: '240 5% 15%', primary: '240 5% 80%', accent: '240 5% 50%' } },
];

const MAX_IMAGE_SIZE_MB = 2;

function parseHsl(hslStr: string): [number, number, number] {
  if (!hslStr) return [0,0,0];
  const [h, s, l] = hslStr.replace(/%/g, '').split(' ').map(Number);
  return [h || 0, s || 0, l || 0];
}

export function ThemeSettingsMenu() {
  const [storedTheme, setStoredTheme] = useLocalStorage<ThemeSettings>('themeSettings', defaultTheme);
  const [previewTheme, setPreviewTheme] = useState(storedTheme);
  const [isClient, setIsClient] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    setIsClient(true);
    setPreviewTheme(storedTheme);
  }, [storedTheme]);
  
  useEffect(() => {
    if (!isClient) return;
    const root = document.documentElement;
    root.style.setProperty('--background', previewTheme.background);
    root.style.setProperty('--card', previewTheme.card);
    root.style.setProperty('--primary', previewTheme.primary);
    root.style.setProperty('--accent', previewTheme.accent);
    root.style.setProperty('--font-family', previewTheme.font === 'Inter' ? 'var(--font-inter)' : previewTheme.font.toLowerCase());
    root.style.setProperty('--bg-image-url', previewTheme.backgroundImage ? `url(${previewTheme.backgroundImage})` : 'none');
    root.style.setProperty('--bg-overlay-opacity', previewTheme.backgroundImage ? String(previewTheme.backgroundOpacity) : '0');
  }, [previewTheme, isClient]);

  const handleColorChange = (name: 'background' | 'primary' | 'accent' | 'card', value: string) => {
    const hslValue = hexToHsl(value);
    if (hslValue) {
      setPreviewTheme(prev => ({ ...prev, [name]: hslValue }));
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
        toast({
          title: 'Image Too Large',
          description: `Please select an image smaller than ${MAX_IMAGE_SIZE_MB}MB.`,
          variant: 'destructive',
        });
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewTheme(p => ({...p, backgroundImage: e.target?.result as string}));
      };
      reader.readAsDataURL(file);
      event.target.value = '';
    }
  };

  const handleSave = () => {
    setStoredTheme(previewTheme);
    toast({ title: 'Theme Saved', description: 'Your new theme has been applied.' });
  };

  const handleCancel = () => {
    setPreviewTheme(storedTheme);
    toast({ title: 'Changes Reverted' });
  };

  if (!isClient) {
    return null; // or a skeleton loader
  }

  const [bgH, bgS, bgL] = parseHsl(previewTheme.background);
  const [cardH, cardS, cardL] = parseHsl(previewTheme.card);
  const [prH, prS, prL] = parseHsl(previewTheme.primary);
  const [acH, acS, acL] = parseHsl(previewTheme.accent);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-xl">Background Image</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div 
            className="w-full aspect-video rounded-lg bg-cover bg-center relative" 
            style={{ backgroundImage: `url(${previewTheme.backgroundImage})` }}
          >
             {!previewTheme.backgroundImage && (
                <div className="flex items-center justify-center h-full w-full bg-secondary rounded-lg">
                    <p className="text-muted-foreground">No image selected</p>
                </div>
             )}
             <div 
                className="absolute inset-0 bg-black rounded-lg"
                style={{ opacity: previewTheme.backgroundOpacity }}
             />
          </div>
           <Button onClick={() => fileInputRef.current?.click()} className="w-full">
            <Upload className="mr-2 h-4 w-4" /> Upload Image
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />
          <div className="space-y-2">
            <Label>Overlay Opacity</Label>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-xl">Colors & Font</CardTitle></CardHeader>
        <CardContent>
          <Tabs defaultValue="presets">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="presets">Presets</TabsTrigger>
              <TabsTrigger value="custom">Custom</TabsTrigger>
            </TabsList>
            <TabsContent value="presets" className="pt-4">
              <div className="grid grid-cols-3 gap-4">
                {colorPresets.map(preset => (
                  <button key={preset.name} onClick={() => setPreviewTheme(p => ({...p, ...preset.settings}))} className="space-y-2 focus:outline-none focus:ring-2 focus:ring-ring rounded-lg p-1">
                    <div className="flex -space-x-3 justify-center">
                        <div className="w-8 h-8 rounded-full border-2 border-background" style={{ backgroundColor: hslToHex(...parseHsl(preset.settings.background!)) }}/>
                        <div className="w-8 h-8 rounded-full border-2 border-background" style={{ backgroundColor: hslToHex(...parseHsl(preset.settings.card!)) }}/>
                        <div className="w-8 h-8 rounded-full border-2 border-background" style={{ backgroundColor: hslToHex(...parseHsl(preset.settings.primary!)) }}/>
                        <div className="w-8 h-8 rounded-full border-2 border-background" style={{ backgroundColor: hslToHex(...parseHsl(preset.settings.accent!)) }}/>
                    </div>
                    <p className="text-xs text-center text-muted-foreground">{preset.name}</p>
                  </button>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="custom" className="pt-4 space-y-6">
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Background</Label>
                  <Input type="color" value={hslToHex(bgH, bgS, bgL)} onChange={e => handleColorChange('background', e.target.value)} className="h-12 w-full"/>
                </div>
                 <div className="space-y-2">
                  <Label>Surface/Card</Label>
                  <Input type="color" value={hslToHex(cardH, cardS, cardL)} onChange={e => handleColorChange('card', e.target.value)} className="h-12 w-full"/>
                </div>
                <div className="space-y-2">
                  <Label>Primary</Label>
                  <Input type="color" value={hslToHex(prH, prS, prL)} onChange={e => handleColorChange('primary', e.target.value)} className="h-12 w-full"/>
                </div>
                <div className="space-y-2">
                  <Label>Accent</Label>
                  <Input type="color" value={hslToHex(acH, acS, acL)} onChange={e => handleColorChange('accent', e.target.value)} className="h-12 w-full"/>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="space-y-2 pt-6 border-t mt-6">
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
        </CardContent>
      </Card>
      
      <div className="flex justify-end gap-2 py-4">
        <Button variant="ghost" onClick={handleCancel}>Cancel</Button>
        <Button onClick={handleSave}>Save Theme</Button>
      </div>
    </div>
  );
}
