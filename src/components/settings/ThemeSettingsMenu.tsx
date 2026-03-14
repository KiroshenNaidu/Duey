'use client';
import { useState, useEffect, useRef, useContext, useMemo } from 'react';
import type { ThemeSettings, UserTheme } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { hexToHsl, hslToHex, idbGet, idbSet, cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Loader2, Trash2, Check, Sparkles } from 'lucide-react';
import { AppDataContext } from '@/context/AppDataContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ScrollArea } from '../ui/scroll-area';

const defaultThemeSettings: Omit<ThemeSettings, 'backgroundImage'> = {
  background: '220 14% 10%',
  surface: '220 14% 12%',
  primary: '225 50% 50%',
  accent: '188 78% 57%',
  font: 'Inter',
  backgroundOpacity: 0.1,
};

const systemPresets: Omit<UserTheme, 'id'>[] = [
    { name: 'Sky', settings: { background: '234 92% 93%', surface: '219 86% 83%', primary: '244 86% 76%', accent: '243 76% 68%', font: 'Inter' } },
    { name: 'Rose', settings: { background: '345 48% 96%', surface: '355 100% 91%', primary: '349 100% 85%', accent: '344 100% 82%', font: 'Inter' } },
    { name: 'Cyber', settings: { background: '0 0% 0%', surface: '193 100% 22%', primary: '41 92% 55%', accent: '0 0% 100%', font: 'Inter' } },
    { name: 'Slate', settings: { background: '236 15% 14%', surface: '231 13% 25%', primary: '234 15% 32%', accent: '231 15% 48%', font: 'Inter' } },
    { name: 'Matrix', settings: { background: '180 100% 7%', surface: '180 100% 10%', primary: '180 100% 13%', accent: '180 100% 17%', font: 'Inter' } },
    { name: 'Amethyst', settings: { background: '278 21% 11%', surface: '262 23% 30%', primary: '265 59% 68%', accent: '262 24% 51%', font: 'Inter' } },
    { name: 'Deep Purple', settings: { background: '278 21% 11%', surface: '262 23% 30%', primary: '262 24% 51%', accent: '262 24% 51%', font: 'Inter' } },
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
           s1.font === s2.font;
};

export function ThemeSettingsMenu() {
  const { themeSettings, setThemeSettings, userThemes, addUserTheme, deleteUserTheme } = useContext(AppDataContext);
  
  const [initialBackgroundImage, setInitialBackgroundImage] = useState('');
  const [previewTheme, setPreviewTheme] = useState<ThemeSettings>({ ...defaultThemeSettings, backgroundImage: ''});
  const [isClient, setIsClient] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [newThemeName, setNewThemeName] = useState('');

  useEffect(() => {
    setIsClient(true);
    async function loadInitialTheme() {
        setPreviewTheme(p => ({...p, ...themeSettings}));
        const storedImage = await idbGet<string>('backgroundImage');
        if (storedImage) {
            setInitialBackgroundImage(storedImage);
            setPreviewTheme(p => ({ ...p, backgroundImage: storedImage }));
        }
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
    
    const body = document.body;
    if (previewTheme.backgroundImage) {
      body.classList.add('has-bg-image');
    } else {
      body.classList.remove('has-bg-image');
    }
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

  const handleSavePreset = () => {
    if (!newThemeName.trim()) {
        toast({ variant: 'destructive', title: 'Invalid Name', description: 'Please enter a name for your preset.' });
        return;
    }
    const { backgroundImage, backgroundOpacity, ...settingsToSave } = previewTheme;
    addUserTheme(newThemeName, settingsToSave);
    setNewThemeName('');
    setIsSaveDialogOpen(false);
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

  const [bgH, bgS, bgL] = parseHsl(previewTheme.background);
  const [suH, suS, suL] = parseHsl(previewTheme.surface);
  const [prH, prS, prL] = parseHsl(previewTheme.primary);
  const [acH, acS, acL] = parseHsl(previewTheme.accent);

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
        <CardHeader><CardTitle className="text-xl">Background Image</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="w-full aspect-video rounded-lg bg-cover bg-center relative bg-secondary" style={{ backgroundImage: `url(${previewTheme.backgroundImage})` }}>
             {!previewTheme.backgroundImage && <div className="flex items-center justify-center h-full w-full rounded-lg"><p className="text-muted-foreground">No image selected</p></div>}
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
            <Label>Overlay Opacity</Label>
            <div className="flex items-center gap-4">
              <Slider value={[previewTheme.backgroundOpacity]} onValueChange={([v]) => setPreviewTheme(p => ({...p, backgroundOpacity: v}))} max={1} step={0.05} disabled={!previewTheme.backgroundImage} />
              <span className="text-sm text-muted-foreground w-12 text-right">{(previewTheme.backgroundOpacity * 100).toFixed(0)}%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-xl">Colors & Font</CardTitle></CardHeader>
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
                            <h3 className="text-lg font-semibold mb-4 text-foreground">System Presets</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-6">
                                {systemPresets.map(preset => (
                                    <PresetCard key={preset.name} name={preset.name} settings={preset.settings} isActive={areThemeSettingsEqual(currentActiveSettings, preset.settings)} />
                                ))}
                            </div>
                        </div>
                        {userThemes.length > 0 && (
                            <div>
                                <h3 className="text-lg font-semibold mb-4 text-foreground">My Themes</h3>
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
               <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="space-y-2"><Label>Background</Label><Input type="color" value={hslToHex(bgH, bgS, bgL)} onChange={e => handleColorChange('background', e.target.value)} className="h-12 w-full"/></div>
                <div className="space-y-2"><Label>Surface/Card</Label><Input type="color" value={hslToHex(suH, suS, suL)} onChange={e => handleColorChange('surface', e.target.value)} className="h-12 w-full"/></div>
                <div className="space-y-2"><Label>Primary</Label><Input type="color" value={hslToHex(prH, prS, prL)} onChange={e => handleColorChange('primary', e.target.value)} className="h-12 w-full"/></div>
                <div className="space-y-2"><Label>Accent</Label><Input type="color" value={hslToHex(acH, acS, acL)} onChange={e => handleColorChange('accent', e.target.value)} className="h-12 w-full"/></div>
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
        <Button onClick={handleSave}>Save Theme</Button>
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
