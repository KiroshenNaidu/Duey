'use client';
import { useState, useEffect, useRef, useContext, useMemo } from 'react';
import type { ThemeSettings, UserTheme } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Button, buttonVariants } from '@/components/ui/button';
import { hexToHsl, hslToHex, idbGet, idbSet, cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Loader2, Trash2, Check, Plus, Minus } from 'lucide-react';
import { AppDataContext } from '@/context/AppDataContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ScrollArea } from '../ui/scroll-area';

const defaultThemeSettings: Omit<ThemeSettings, 'backgroundImage'> = {
  background: '223 13% 10%',
  surface: '222 15% 12%',
  primary: '227 50% 50%',
  accent: '191 79% 57%',
  foreground: '0 0% 98%',
  accentForeground: '0 0% 98%',
  font: 'Inter',
  backgroundOpacity: 0.1,
  uiScale: 1.0,
};

const systemPresets: Omit<UserTheme, 'id'>[] = [
    { 
        name: 'Default', 
        settings: { 
            background: '223 13% 10%',
            surface: '222 15% 12%',
            primary: '227 50% 50%',
            accent: '191 79% 57%',
            foreground: '0 0% 98%',
            accentForeground: '0 0% 98%',
            font: 'Inter',
            uiScale: 1.0,
        } 
    },
];

const MAX_IMAGE_DIMENSION = 2500;

function parseHsl(hslStr: string): [number, number, number] {
  if (!hslStr) return [0,0,0];
  const [h, s, l] = hslStr.replace(/%/g, '').split(' ').map(Number);
  return [h || 0, s || 0, l || 0];
}

const areThemeSettingsEqual = (s1: Omit<ThemeSettings, 'backgroundImage' | 'backgroundOpacity'>, s2: Omit<ThemeSettings, 'backgroundImage' | 'backgroundOpacity'>) => {
    return s1.background === s2.background &&
           s1.surface === s2.surface &&
           s1.primary === s2.primary &&
           s1.accent === s2.accent &&
           s1.foreground === s2.foreground &&
           s1.accentForeground === s2.accentForeground &&
           s1.font === s2.font &&
           s1.uiScale === s2.uiScale;
};

export function ThemeSettingsMenu() {
  const { themeSettings, setThemeSettings, userThemes, addUserTheme, deleteUserTheme } = useContext(AppDataContext);
  
  const [previewTheme, setPreviewTheme] = useState<ThemeSettings>(() => ({
    ...defaultThemeSettings,
    ...themeSettings,
    backgroundImage: '',
  }));
  const [isClient, setIsClient] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [newThemeName, setNewThemeName] = useState('');

  useEffect(() => {
    setIsClient(true);
    async function loadInitialImage() {
      const storedImage = await idbGet<string>('backgroundImage');
      if (storedImage) {
        setPreviewTheme(p => ({ ...p, backgroundImage: storedImage }));
      }
    }
    loadInitialImage();
  }, []);
  
  useEffect(() => {
    if (!isClient) return;

    const root = document.documentElement;
    root.style.setProperty('--background', previewTheme.background);
    root.style.setProperty('--card', previewTheme.surface);
    root.style.setProperty('--primary', previewTheme.primary);
    root.style.setProperty('--accent', previewTheme.accent);
    root.style.setProperty('--foreground', previewTheme.foreground);
    root.style.setProperty('--accent-foreground', previewTheme.accentForeground);

    if (previewTheme.font === 'Inter') {
      root.style.setProperty('--font-family', 'var(--font-inter)');
    } else if (previewTheme.font === 'Serif') {
        root.style.setProperty('--font-family', 'serif');
    } else {
        root.style.setProperty('--font-family', 'monospace');
    }

    const bgImageDiv = document.getElementById('global-bg-image');
    const bgOverlayDiv = document.getElementById('global-bg-overlay');
    
    if (bgImageDiv) {
        bgImageDiv.style.backgroundImage = previewTheme.backgroundImage ? `url(${previewTheme.backgroundImage})` : 'none';
    }
    if (bgOverlayDiv) {
        bgOverlayDiv.style.opacity = String(previewTheme.backgroundImage ? previewTheme.backgroundOpacity : 0);
    }
    
    const body = document.body;
    if (previewTheme.backgroundImage) {
        body.classList.add('has-bg-image');
    } else {
        body.classList.remove('has-bg-image');
    }
    
    body.style.zoom = `${previewTheme.uiScale}`;

  }, [previewTheme, isClient]);

  useEffect(() => {
    if (!isClient) return;

    return () => {
      async function revertStyles() {
        const root = document.documentElement;
        root.style.setProperty('--background', themeSettings.background);
        root.style.setProperty('--card', themeSettings.surface);
        root.style.setProperty('--primary', themeSettings.primary);
        root.style.setProperty('--accent', themeSettings.accent);
        root.style.setProperty('--foreground', themeSettings.foreground);
        root.style.setProperty('--accent-foreground', themeSettings.accentForeground);
        
        if (themeSettings.font === 'Inter') {
            root.style.setProperty('--font-family', 'var(--font-inter)');
        } else if (themeSettings.font === 'Serif') {
            root.style.setProperty('--font-family', 'serif');
        } else {
            root.style.setProperty('--font-family', 'monospace');
        }

        const storedImage = await idbGet<string>('backgroundImage');
        const bgImageDiv = document.getElementById('global-bg-image');
        const bgOverlayDiv = document.getElementById('global-bg-overlay');
        const body = document.body;
        
        if (bgImageDiv) {
          bgImageDiv.style.backgroundImage = storedImage ? `url(${storedImage})` : 'none';
        }
        if (bgOverlayDiv) {
          bgOverlayDiv.style.opacity = storedImage ? String(themeSettings.backgroundOpacity) : '0';
        }
        if (storedImage) {
          body.classList.add('has-bg-image');
        } else {
          body.classList.remove('has-bg-image');
        }

        body.style.zoom = `${themeSettings.uiScale}`;
      }
      revertStyles();
    };
  }, [isClient, themeSettings]);

  const handleColorChange = (name: 'background' | 'primary' | 'accent' | 'surface' | 'foreground' | 'accentForeground', value: string) => {
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
            console.error("Could not process image");
            setIsProcessing(false);
            return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = file.type === 'image/gif' ? (e.target?.result as string) : canvas.toDataURL(file.type, 0.9);
        setPreviewTheme(p => ({...p, backgroundImage: dataUrl}));
        setIsProcessing(false);
      };
      img.src = e.target?.result as string;
    };

    reader.readAsDataURL(file);
    event.target.value = '';
  };
  
  const handleRemoveImage = () => {
    setPreviewTheme(p => ({ ...p, backgroundImage: '' }));
  }

  const handleSave = () => {
    const { backgroundImage, ...settingsToSave } = previewTheme;
    
    const savePromise = idbSet('backgroundImage', backgroundImage);

    savePromise.then(() => {
        setThemeSettings(settingsToSave);
        setTimeout(() => {
            window.location.reload();
        }, 500);
    }).catch(error => {
        console.error("Failed to save background image to IndexedDB", error);
    });
  };

  const handleCancel = async () => {
    const storedImage = await idbGet<string>('backgroundImage');
    setPreviewTheme({ ...themeSettings, backgroundImage: storedImage || '' });
  };

  const handleSavePreset = () => {
    if (!newThemeName.trim()) {
        return;
    }
    const { backgroundImage, backgroundOpacity, ...settingsToSave } = previewTheme;
    addUserTheme(newThemeName, settingsToSave);
    setNewThemeName('');
    setIsSaveDialogOpen(false);
  };
  
  const handleScale = (direction: 'up' | 'down') => {
    setPreviewTheme(prev => {
      const currentScale = prev.uiScale || 1.0;
      let newScale = direction === 'up' ? currentScale + 0.05 : currentScale - 0.05;
      newScale = Math.max(0.8, Math.min(1.2, newScale)); // Clamp between 80% and 120%
      return { ...prev, uiScale: parseFloat(newScale.toFixed(2)) };
    });
  };

  const isCurrentThemeSaved = useMemo(() => {
    const { backgroundImage, backgroundOpacity, ...currentSettings } = previewTheme;
    const isSystemPreset = systemPresets.some(p => areThemeSettingsEqual(p.settings, currentSettings));
    const isUserPreset = userThemes.some(p => areThemeSettingsEqual(p.settings, currentSettings));
    return isSystemPreset || isUserPreset;
  }, [previewTheme, userThemes]);
  
  const currentActiveSettings = useMemo(() => {
    const { backgroundImage, backgroundOpacity, ...settings } = previewTheme;
    return settings;
  }, [previewTheme]);

  if (!isClient) return null;

  const PresetCard = ({ name, settings, onDelete, isActive }: { name: string, settings: Omit<ThemeSettings, 'backgroundImage' | 'backgroundOpacity'>, onDelete?: () => void, isActive: boolean }) => (
    <div className="space-y-2">
        <button
            onClick={() => setPreviewTheme(p => ({...p, ...settings}))}
            className={cn("w-full aspect-square rounded-2xl bg-card border-2 flex items-center justify-center relative",
                isActive ? 'border-primary ring-2 ring-primary' : 'border-border'
            )}
        >
            <div className="flex flex-wrap gap-2 justify-center p-2">
                {[settings.background, settings.surface, settings.primary, settings.accent].map((color, i) => (
                    <div key={i} className="w-8 h-8 rounded-full border-2 border-background" style={{ backgroundColor: hslToHex(...parseHsl(color)) }}/>
                ))}
            </div>
            {isActive && <Check className="absolute top-2 right-2 h-6 w-6 text-primary bg-background/50 rounded-full p-1"/>}
        </button>
        <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-center truncate px-1">{name}</p>
            {onDelete && (
                 <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7"><Trash2 className="h-4 w-4 text-destructive"/></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete "{name}"?</AlertDialogTitle>
                            <AlertDialogDescription>This custom preset will be permanently removed.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={onDelete} className={cn(buttonVariants({variant: 'destructive'}))}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
        </div>
    </div>
  );

  return (
    <div className="space-y-6">
        <Card>
            <CardHeader><CardTitle className="text-base">UI Size</CardTitle></CardHeader>
            <CardContent>
                <div className="flex items-center justify-center gap-4">
                    <Button variant="outline" size="icon" className="rounded-full" onClick={() => handleScale('down')}>
                        <Minus className="h-4 w-4" />
                    </Button>
                    <span className="text-lg font-bold w-24 text-center tabular-nums">
                        {((previewTheme.uiScale || 1.0) * 100).toFixed(0)}%
                    </span>
                    <Button variant="outline" size="icon" className="rounded-full" onClick={() => handleScale('up')}>
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
            </CardContent>
        </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Background Image</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="w-full aspect-video rounded-lg bg-cover bg-center relative bg-secondary" style={{ backgroundImage: `url(${previewTheme.backgroundImage})` }}>
             {!previewTheme.backgroundImage && <div className="flex items-center justify-center h-full w-full rounded-lg"><p className="text-muted-foreground text-xs">No image selected</p></div>}
             <div className="absolute inset-0 bg-black rounded-lg" style={{ opacity: previewTheme.backgroundOpacity, transition: 'opacity 0.2s' }}/>
          </div>
           <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => fileInputRef.current?.click()} className="w-full" disabled={isProcessing}>
              {isProcessing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Processing...</> : <><Upload className="mr-2 h-4 w-4" /> Upload</>}
            </Button>
            <Button onClick={handleRemoveImage} variant="destructive" className="w-full" disabled={!previewTheme.backgroundImage && !isProcessing}>
              <Trash2 className="mr-2 h-4 w-4" /> Remove
            </Button>
           </div>
          <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
          <div className="space-y-2">
            <Label className='text-xs'>Overlay Opacity</Label>
            <div className="flex items-center gap-4">
              <Slider value={[previewTheme.backgroundOpacity]} onValueChange={([v]) => setPreviewTheme(p => ({...p, backgroundOpacity: v}))} max={1} step={0.05} disabled={!previewTheme.backgroundImage} />
              <span className="text-sm text-muted-foreground w-12 text-right">{(previewTheme.backgroundOpacity * 100).toFixed(0)}%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Colors & Font</CardTitle></CardHeader>
        <CardContent>
          <Tabs defaultValue="presets" className='w-full'>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="presets">Presets</TabsTrigger>
              <TabsTrigger value="custom">Custom</TabsTrigger>
            </TabsList>
            <TabsContent value="presets" className="pt-4">
                <ScrollArea className="h-[400px] -mx-4 px-4">
                    <div className='space-y-8'>
                        <div>
                            <h3 className="text-sm font-semibold mb-4 text-foreground">System Preset</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-6">
                                {systemPresets.map(preset => (
                                    <PresetCard key={preset.name} name={preset.name} settings={preset.settings} isActive={areThemeSettingsEqual(currentActiveSettings, preset.settings)} />
                                ))}
                            </div>
                        </div>
                        {userThemes.length > 0 && (
                            <div>
                                <h3 className="text-sm font-semibold mb-4 text-foreground">My Themes</h3>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-6">
                                    {userThemes.map(theme => (
                                        <PresetCard key={theme.id} name={theme.name} settings={theme.settings} onDelete={() => deleteUserTheme(theme.id)} isActive={areThemeSettingsEqual(currentActiveSettings, theme.settings)} />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </TabsContent>
            <TabsContent value="custom" className="pt-6 space-y-6">
               <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2"><Label className='text-xs'>Background</Label><Input type="color" value={hslToHex(...parseHsl(previewTheme.background))} onChange={e => handleColorChange('background', e.target.value)} className="h-12 w-full p-1"/></div>
                <div className="space-y-2"><Label className='text-xs'>Surface</Label><Input type="color" value={hslToHex(...parseHsl(previewTheme.surface))} onChange={e => handleColorChange('surface', e.target.value)} className="h-12 w-full p-1"/></div>
                <div className="space-y-2"><Label className='text-xs'>Primary</Label><Input type="color" value={hslToHex(...parseHsl(previewTheme.primary))} onChange={e => handleColorChange('primary', e.target.value)} className="h-12 w-full p-1"/></div>
                <div className="space-y-2"><Label className='text-xs'>Accent</Label><Input type="color" value={hslToHex(...parseHsl(previewTheme.accent))} onChange={e => handleColorChange('accent', e.target.value)} className="h-12 w-full p-1"/></div>
                <div className="space-y-2"><Label className='text-xs'>Text</Label><Input type="color" value={hslToHex(...parseHsl(previewTheme.foreground))} onChange={e => handleColorChange('foreground', e.target.value)} className="h-12 w-full p-1"/></div>
                <div className="space-y-2"><Label className='text-xs'>Accent Text</Label><Input type="color" value={hslToHex(...parseHsl(previewTheme.accentForeground))} onChange={e => handleColorChange('accentForeground', e.target.value)} className="h-12 w-full p-1"/></div>
              </div>
              <div className="space-y-2">
                <Label className='text-xs'>Font Family</Label>
                <Select value={previewTheme.font} onValueChange={(value: 'Inter' | 'Serif' | 'Mono') => setPreviewTheme(p => ({...p, font: value}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Inter">Modern</SelectItem>
                    <SelectItem value="Serif">Classic</SelectItem>
                    <SelectItem value="Mono">Technical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="pt-6 border-t">
                 <Button onClick={() => setIsSaveDialogOpen(true)} disabled={isCurrentThemeSaved} className="w-full">
                    {isCurrentThemeSaved ? 'Preset Already Saved' : 'Save Current Colors as Preset'}
                 </Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      
      <div className="flex justify-end gap-2 py-4">
        <Button variant="ghost" onClick={handleCancel}>Cancel</Button>
        <Button onClick={handleSave}>Save Display Settings</Button>
      </div>

       <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Preset</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="theme-name">Preset Name</Label>
            <Input id="theme-name" value={newThemeName} onChange={e => setNewThemeName(e.target.value)} placeholder="e.g., My Awesome Theme" />
          </div>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="secondary">Cancel</Button></DialogClose>
            <Button onClick={handleSavePreset}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
