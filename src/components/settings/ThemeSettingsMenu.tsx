'use client';
import { useState, useEffect, useRef, useContext } from 'react';
import type { ThemeSettings } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { hexToHsl, hslToHex, idbGet, idbSet } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Upload, Loader2, Trash2 } from 'lucide-react';
import { AppDataContext } from '@/context/AppDataContext';

const defaultTheme: Omit<ThemeSettings, 'backgroundImage'> = {
  background: '220 14% 10%',
  surface: '220 14% 12%',
  primary: '225 50% 50%',
  accent: '188 78% 57%',
  font: 'Inter',
  backgroundOpacity: 0.1,
};

const colorPresets: { name: string; settings: Partial<Omit<ThemeSettings, 'backgroundImage' | 'backgroundOpacity'>> }[] = [
  { name: 'Default', settings: { background: '220 14% 10%', surface: '220 14% 12%', primary: '225 50% 50%', accent: '188 78% 57%' } },
  { name: 'Forest', settings: { background: '120 15% 15%', surface: '120 15% 18%', primary: '140 40% 45%', accent: '90 50% 60%' } },
  { name: 'Ocean', settings: { background: '210 30% 20%', surface: '210 30% 25%', primary: '200 60% 50%', accent: '180 70% 45%' } },
  { name: 'Sunset', settings: { background: '25 20% 18%', surface: '25 20% 22%', primary: '30 80% 60%', accent: '0 70% 65%' } },
  { name: 'Rose', settings: { background: '340 10% 15%', surface: '340 10% 20%', primary: '330 50% 60%', accent: '350 70% 70%' } },
  { name: 'Mono', settings: { background: '240 5% 12%', surface: '240 5% 15%', primary: '240 5% 80%', accent: '240 5% 50%' } },
];

const MAX_IMAGE_DIMENSION = 2500;

function parseHsl(hslStr: string): [number, number, number] {
  if (!hslStr) return [0,0,0];
  const [h, s, l] = hslStr.replace(/%/g, '').split(' ').map(Number);
  return [h || 0, s || 0, l || 0];
}

export function ThemeSettingsMenu() {
  const { themeSettings, setThemeSettings } = useContext(AppDataContext);
  
  const [initialBackgroundImage, setInitialBackgroundImage] = useState('');
  const [previewTheme, setPreviewTheme] = useState<ThemeSettings>({ ...defaultTheme, backgroundImage: ''});
  const [isClient, setIsClient] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    setIsClient(true);
    async function loadInitialTheme() {
        setPreviewTheme(p => ({...p, ...themeSettings}));
        const storedImage = await idbGet<string>('backgroundImage');
        setInitialBackgroundImage(storedImage || '');
        setPreviewTheme(p => ({ ...p, backgroundImage: storedImage || '' }));
    }
    loadInitialTheme();
  }, [themeSettings]);
  
  useEffect(() => {
    if (!isClient) return;
    const root = document.documentElement;
    root.style.setProperty('--background', previewTheme.background);
    root.style.setProperty('--card', previewTheme.surface);
    root.style.setProperty('--primary', previewTheme.primary);
    root.style.setProperty('--accent', previewTheme.accent);
    root.style.setProperty('--font-family', previewTheme.font === 'Inter' ? 'var(--font-inter)' : previewTheme.font.toLowerCase());
  }, [previewTheme, isClient]);

  const handleColorChange = (name: 'background' | 'primary' | 'accent' | 'surface', value: string) => {
    const hslValue = hexToHsl(value);
    if (hslValue) {
      setPreviewTheme(prev => ({ ...prev, [name]: hslValue }));
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
          if (width > height) {
            height = Math.round((height * MAX_IMAGE_DIMENSION) / width);
            width = MAX_IMAGE_DIMENSION;
          } else {
            width = Math.round((width * MAX_IMAGE_DIMENSION) / height);
            height = MAX_IMAGE_DIMENSION;
          }
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            toast({ title: "Could not process image", variant: "destructive" });
            setIsProcessing(false);
            return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = file.type === 'image/gif' ? (e.target?.result as string) : canvas.toDataURL(file.type, 0.9);
        setPreviewTheme(p => ({...p, backgroundImage: dataUrl}));
        setIsProcessing(false);
        toast({ title: 'Background preview updated.' });
      };
      img.src = e.target?.result as string;
    };

    reader.readAsDataURL(file);
    event.target.value = '';
  };
  
  const handleRemoveImage = () => {
    setPreviewTheme(p => ({ ...p, backgroundImage: '' }));
    toast({ title: 'Background image removed from preview.' });
  }

  const handleSave = () => {
    const { backgroundImage, ...settingsToSave } = previewTheme;
    
    idbSet('backgroundImage', backgroundImage).then(() => {
        setThemeSettings(settingsToSave);
        toast({ title: 'Theme Saved!', description: 'Reloading app to apply changes...' });
        
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    });
  };

  const handleCancel = () => {
    setPreviewTheme({ ...themeSettings, backgroundImage: initialBackgroundImage });
    toast({ title: 'Changes Reverted' });
  };

  if (!isClient) {
    return null;
  }

  const [bgH, bgS, bgL] = parseHsl(previewTheme.background);
  const [suH, suS, suL] = parseHsl(previewTheme.surface);
  const [prH, prS, prL] = parseHsl(previewTheme.primary);
  const [acH, acS, acL] = parseHsl(previewTheme.accent);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-xl">Background Image</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div 
            className="w-full aspect-video rounded-lg bg-cover bg-center relative bg-secondary" 
            style={{ backgroundImage: `url(${previewTheme.backgroundImage})` }}
          >
             {!previewTheme.backgroundImage && (
                <div className="flex items-center justify-center h-full w-full rounded-lg">
                    <p className="text-muted-foreground">No image selected</p>
                </div>
             )}
             <div 
                className="absolute inset-0 bg-black rounded-lg"
                style={{ opacity: previewTheme.backgroundOpacity, transition: 'opacity 0.2s' }}
             />
          </div>
           <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => fileInputRef.current?.click()} className="w-full" disabled={isProcessing}>
              {isProcessing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Processing...</> : <><Upload className="mr-2 h-4 w-4" /> Upload</>}
            </Button>
            <Button onClick={handleRemoveImage} variant="destructive" className="w-full" disabled={!previewTheme.backgroundImage && !isProcessing}>
              <Trash2 className="mr-2 h-4 w-4" /> Remove
            </Button>
           </div>
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
                        <div className="w-8 h-8 rounded-full border-2 border-background" style={{ backgroundColor: hslToHex(...parseHsl(preset.settings.surface!)) }}/>
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
                  <Input type="color" value={hslToHex(suH, suS, suL)} onChange={e => handleColorChange('surface', e.target.value)} className="h-12 w-full"/>
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
