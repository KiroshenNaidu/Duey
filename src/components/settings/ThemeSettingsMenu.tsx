'use client';
import { useState, useEffect, useRef, useContext, useMemo, useCallback } from 'react';
import type { ThemeSettings, UserTheme, FontFamily } from '@/lib/types';
import { FONT_VAR_MAP } from '@/components/ThemeProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Button, buttonVariants } from '@/components/ui/button';
import { hexToHsl, hslToHex, idbGet, idbSet, cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Loader2, Trash2, Check, Plus, Minus } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { AppDataContext } from '@/context/AppDataContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import Link from 'next/link';

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
  uiStyle: 'solid',
};

const systemPresets: Omit<UserTheme, 'id'>[] = [
  {
    name: 'Default',
    settings: {
      background: '223 13% 10%', surface: '222 15% 12%',
      primary: '227 50% 50%', accent: '191 79% 57%',
      foreground: '0 0% 98%', accentForeground: '0 0% 98%',
      font: 'Inter', uiScale: 1.0, uiStyle: 'solid',
    },
  },
  {
    name: 'Midnight',
    settings: {
      background: '240 10% 4%', surface: '240 10% 7%',
      primary: '263 70% 60%', accent: '291 70% 68%',
      foreground: '0 0% 95%', accentForeground: '0 0% 98%',
      font: 'Inter', uiScale: 1.0, uiStyle: 'glass',
    },
  },
  {
    name: 'Forest',
    settings: {
      background: '150 20% 8%', surface: '148 18% 11%',
      primary: '142 60% 45%', accent: '80 60% 55%',
      foreground: '0 0% 95%', accentForeground: '0 0% 5%',
      font: 'Inter', uiScale: 1.0, uiStyle: 'solid',
    },
  },
  {
    name: 'Ember',
    settings: {
      background: '20 15% 7%', surface: '18 14% 11%',
      primary: '16 90% 55%', accent: '38 95% 55%',
      foreground: '0 0% 95%', accentForeground: '0 0% 5%',
      font: 'Inter', uiScale: 1.0, uiStyle: 'solid',
    },
  },
];

const MAX_IMAGE_DIMENSION = 2500;

function parseHsl(hslStr: string): [number, number, number] {
  if (!hslStr) return [0, 0, 0];
  const [h, s, l] = hslStr.replace(/%/g, '').split(' ').map(Number);
  return [h || 0, s || 0, l || 0];
}

const areThemeSettingsEqual = (
  s1: Omit<ThemeSettings, 'backgroundImage' | 'backgroundOpacity'>,
  s2: Omit<ThemeSettings, 'backgroundImage' | 'backgroundOpacity'>
) =>
  s1.background === s2.background && s1.surface === s2.surface &&
  s1.primary === s2.primary && s1.accent === s2.accent &&
  s1.foreground === s2.foreground && s1.accentForeground === s2.accentForeground &&
  s1.font === s2.font && s1.uiScale === s2.uiScale && s1.uiStyle === s2.uiStyle;

export function ThemeSettingsMenu({ onBack }: { onBack?: () => void }) {
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
    idbGet<string>('backgroundImage').then(img => {
      if (img) setPreviewTheme(p => ({ ...p, backgroundImage: img }));
    });
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
    root.style.setProperty('--font-family', FONT_VAR_MAP[previewTheme.font] ?? 'var(--font-inter)');
    const bgDiv = document.getElementById('global-bg-image');
    const overlayDiv = document.getElementById('global-bg-overlay');
    if (bgDiv) bgDiv.style.backgroundImage = previewTheme.backgroundImage ? `url(${previewTheme.backgroundImage})` : 'none';
    if (overlayDiv) overlayDiv.style.opacity = String(previewTheme.backgroundImage ? previewTheme.backgroundOpacity : 0);
    document.body.classList.toggle('has-bg-image', !!previewTheme.backgroundImage);
    document.body.classList.toggle('ui-glass', previewTheme.uiStyle === 'glass');
    document.body.style.zoom = `${previewTheme.uiScale}`;
  }, [previewTheme, isClient]);

  const handleColorChange = (name: keyof Pick<ThemeSettings, 'background' | 'primary' | 'accent' | 'surface' | 'foreground' | 'accentForeground'>, value: string) => {
    const hsl = hexToHsl(value);
    if (hsl) setPreviewTheme(prev => ({ ...prev, [name]: hsl }));
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
          if (width > height) { height = Math.round((height * MAX_IMAGE_DIMENSION) / width); width = MAX_IMAGE_DIMENSION; }
          else { width = Math.round((width * MAX_IMAGE_DIMENSION) / height); height = MAX_IMAGE_DIMENSION; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { setIsProcessing(false); return; }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = file.type === 'image/gif' ? (e.target?.result as string) : canvas.toDataURL(file.type, 0.9);
        setPreviewTheme(p => ({ ...p, backgroundImage: dataUrl }));
        setIsProcessing(false);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleRemoveImage = () => setPreviewTheme(p => ({ ...p, backgroundImage: '' }));

  const handleSave = () => {
    const { backgroundImage, ...settingsToSave } = previewTheme;
    idbSet('backgroundImage', backgroundImage).then(() => {
      setThemeSettings(settingsToSave);
      setTimeout(() => window.location.reload(), 500);
    });
  };

  const handleSavePreset = () => {
    if (!newThemeName.trim()) return;
    const { backgroundImage, backgroundOpacity, ...settingsToSave } = previewTheme;
    addUserTheme(newThemeName, settingsToSave);
    setNewThemeName('');
    setIsSaveDialogOpen(false);
  };

  const handleScale = (direction: 'up' | 'down') => {
    setPreviewTheme(prev => {
      const next = direction === 'up' ? prev.uiScale + 0.05 : prev.uiScale - 0.05;
      return { ...prev, uiScale: parseFloat(Math.max(0.8, Math.min(1.2, next)).toFixed(2)) };
    });
  };

  const currentActiveSettings = useMemo(() => {
    const { backgroundImage, backgroundOpacity, ...settings } = previewTheme;
    return settings;
  }, [previewTheme]);

  const isCurrentThemeSaved = useMemo(() =>
    systemPresets.some(p => areThemeSettingsEqual(p.settings, currentActiveSettings)) ||
    userThemes.some(p => areThemeSettingsEqual(p.settings, currentActiveSettings)),
  [currentActiveSettings, userThemes]);

  // ── Color editor state ──
  type ColorField = keyof Pick<ThemeSettings, 'background' | 'surface' | 'primary' | 'accent' | 'foreground' | 'accentForeground'>;
  const [colorEditor, setColorEditor] = useState<{ field: ColorField; h: number; s: number; l: number } | null>(null);

  const openColorEditor = (field: ColorField) => {
    const [h, s, l] = parseHsl(previewTheme[field] as string);
    setColorEditor({ field, h, s, l });
  };

  const updateEditorHsl = useCallback((h: number, s: number, l: number) => {
    setColorEditor(prev => {
      if (!prev) return null;
      setPreviewTheme(pt => ({ ...pt, [prev.field]: `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%` }));
      return { ...prev, h, s, l };
    });
  }, []);

  if (!isClient) return null;

  const ColorSwatch = ({
    label,
    field,
  }: {
    label: string;
    field: ColorField;
  }) => {
    const hex = hslToHex(...parseHsl(previewTheme[field] as string));
    return (
      <button
        onClick={() => openColorEditor(field)}
        className="flex flex-col items-center gap-2 group"
      >
        <div
          className="w-full h-14 rounded-2xl border-2 border-accent/10 shadow-sm transition-transform active:scale-95 group-hover:border-accent/30"
          style={{ backgroundColor: hex }}
        />
        <span className="text-[11px] text-muted-foreground/70 font-medium">{label}</span>
      </button>
    );
  };

  const PresetCard = ({
    name,
    settings,
    onDelete,
    isActive,
  }: {
    name: string;
    settings: Omit<ThemeSettings, 'backgroundImage' | 'backgroundOpacity'>;
    onDelete?: () => void;
    isActive: boolean;
  }) => (
    <div className="space-y-2">
      <button
        onClick={() => setPreviewTheme(p => ({ ...p, ...settings }))}
        className={cn(
          'w-full aspect-square rounded-2xl border-2 flex flex-col items-center justify-center relative transition-all gap-2 p-3',
          isActive ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-border/60'
        )}
        style={{ backgroundColor: hslToHex(...parseHsl(settings.background)) }}
      >
        <div className="flex gap-1.5 flex-wrap justify-center">
          {[settings.surface, settings.primary, settings.accent].map((color, i) => (
            <div
              key={i}
              className="w-6 h-6 rounded-full border-2"
              style={{
                backgroundColor: hslToHex(...parseHsl(color)),
                borderColor: hslToHex(...parseHsl(settings.background)),
              }}
            />
          ))}
        </div>
        {isActive && (
          <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
            <Check className="h-3 w-3 text-primary-foreground" />
          </div>
        )}
        {settings.uiStyle === 'glass' && (
          <span className="absolute bottom-2 left-2 text-[9px] font-semibold uppercase tracking-wider opacity-60"
                style={{ color: hslToHex(...parseHsl(settings.foreground)) }}>
            Glass
          </span>
        )}
      </button>
      <div className="flex items-center justify-between px-0.5">
        <p className="text-xs font-medium truncate">{name}</p>
        {onDelete && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete &quot;{name}&quot;?</AlertDialogTitle>
                <AlertDialogDescription>This custom preset will be permanently removed.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete} className={cn(buttonVariants({ variant: 'destructive' }))}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4 pb-8">
      {/* Action buttons */}
      <div className="flex gap-2">
        <Link
          href="/settings"
          className={cn(buttonVariants({ variant: 'ghost' }), 'flex-1')}
          onClick={(e) => { if (onBack) { e.preventDefault(); onBack(); } }}
        >
          Cancel
        </Link>
        <Button className="flex-1" onClick={handleSave}>Save</Button>
      </div>

      <Tabs defaultValue="style" className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-9">
          <TabsTrigger value="style" className="text-[11px]">Style</TabsTrigger>
          <TabsTrigger value="colors" className="text-[11px]">Colors</TabsTrigger>
          <TabsTrigger value="background" className="text-[11px]">Background</TabsTrigger>
          <TabsTrigger value="presets" className="text-[11px]">Presets</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Style ── */}
        <TabsContent value="style" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">UI Size</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <Button variant="outline" size="icon" className="h-10 w-10 rounded-full" onClick={() => handleScale('down')}>
                  <Minus className="h-4 w-4" />
                </Button>
                <div className="text-center">
                  <div className="text-2xl font-bold tabular-nums">
                    {((previewTheme.uiScale || 1.0) * 100).toFixed(0)}%
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">UI Scale</div>
                </div>
                <Button variant="outline" size="icon" className="h-10 w-10 rounded-full" onClick={() => handleScale('up')}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Display</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-semibold">Smart Bottom Padding</Label>
                  <p className="text-xs text-muted-foreground">Auto-adjusts for Android nav bar. Turn off for fixed padding.</p>
                </div>
                <Switch
                  checked={!!previewTheme.useSafeAreaInsets}
                  onCheckedChange={v => setPreviewTheme(pt => ({ ...pt, useSafeAreaInsets: v }))}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">UI Style</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {/* Solid */}
                <button
                  onClick={() => setPreviewTheme(p => ({ ...p, uiStyle: 'solid' }))}
                  className={cn(
                    'relative flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all',
                    previewTheme.uiStyle === 'solid'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/30'
                  )}
                >
                  {/* Mini preview */}
                  <div className="w-full h-16 rounded-xl bg-card border border-accent/10 flex items-center justify-center shadow-sm">
                    <div className="w-10 h-7 rounded-lg bg-primary/20 border border-primary/40" />
                  </div>
                  <span className="text-sm font-medium">Solid</span>
                  {previewTheme.uiStyle === 'solid' && (
                    <div className="absolute top-2.5 right-2.5 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                      <Check className="h-3 w-3 text-primary-foreground" />
                    </div>
                  )}
                </button>

                {/* Glass */}
                <button
                  onClick={() => setPreviewTheme(p => ({ ...p, uiStyle: 'glass' }))}
                  className={cn(
                    'relative flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all',
                    previewTheme.uiStyle === 'glass'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/30'
                  )}
                >
                  {/* Mini glass preview */}
                  <div className="w-full h-16 rounded-xl border border-accent/10 flex items-center justify-center overflow-hidden relative"
                    style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 100%)' }}>
                    <div className="absolute inset-0" style={{ backdropFilter: 'blur(4px)' }} />
                    <div className="w-10 h-7 rounded-lg border border-white/20 relative z-10"
                      style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' }} />
                  </div>
                  <span className="text-sm font-medium">Glass</span>
                  {previewTheme.uiStyle === 'glass' && (
                    <div className="absolute top-2.5 right-2.5 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                      <Check className="h-3 w-3 text-primary-foreground" />
                    </div>
                  )}
                </button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Colors ── */}
        <TabsContent value="colors" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Color Palette</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                <ColorSwatch label="Background" field="background" />
                <ColorSwatch label="Surface" field="surface" />
                <ColorSwatch label="Primary" field="primary" />
                <ColorSwatch label="Accent" field="accent" />
                <ColorSwatch label="Text" field="foreground" />
                <ColorSwatch label="Accent Text" field="accentForeground" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Font Family</CardTitle></CardHeader>
            <CardContent>
              <Select
                value={previewTheme.font}
                onValueChange={(v: FontFamily) => setPreviewTheme(p => ({ ...p, font: v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Inter">Modern (Inter)</SelectItem>
                  <SelectItem value="Nunito">Rounded (Nunito)</SelectItem>
                  <SelectItem value="Lexend">Clear (Lexend)</SelectItem>
                  <SelectItem value="DM Sans">Clean (DM Sans)</SelectItem>
                  <SelectItem value="Space Grotesk">Sharp (Space Grotesk)</SelectItem>
                  <SelectItem value="Playfair">Elegant (Playfair)</SelectItem>
                  <SelectItem value="Serif">Classic (Serif)</SelectItem>
                  <SelectItem value="Mono">Technical (Mono)</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Button
            variant="outline"
            className="w-full"
            disabled={isCurrentThemeSaved}
            onClick={() => setIsSaveDialogOpen(true)}
          >
            {isCurrentThemeSaved ? 'Colors already saved as preset' : 'Save current colors as preset'}
          </Button>
        </TabsContent>

        {/* ── Tab 3: Background ── */}
        <TabsContent value="background" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Background Image</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {/* Preview */}
              <div
                className="w-full aspect-video rounded-xl bg-secondary relative overflow-hidden border border-accent/10"
                style={{ backgroundImage: previewTheme.backgroundImage ? `url(${previewTheme.backgroundImage})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }}
              >
                {!previewTheme.backgroundImage && (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-muted-foreground text-xs">No image selected</p>
                  </div>
                )}
                <div className="absolute inset-0 bg-black rounded-xl" style={{ opacity: previewTheme.backgroundImage ? previewTheme.backgroundOpacity : 0, transition: 'opacity 0.2s' }} />
              </div>

              {/* Upload / Remove */}
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => fileInputRef.current?.click()} className="w-full" disabled={isProcessing}>
                  {isProcessing
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</>
                    : <><Upload className="mr-2 h-4 w-4" />Upload</>}
                </Button>
                <Button onClick={handleRemoveImage} variant="destructive" className="w-full" disabled={!previewTheme.backgroundImage}>
                  <Trash2 className="mr-2 h-4 w-4" />Remove
                </Button>
              </div>
              <input ref={fileInputRef} type="file" onChange={handleFileChange} accept="image/*" className="hidden" />

              {/* Opacity */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Overlay Opacity</Label>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {(previewTheme.backgroundOpacity * 100).toFixed(0)}%
                  </span>
                </div>
                <Slider
                  value={[previewTheme.backgroundOpacity]}
                  onValueChange={([v]) => setPreviewTheme(p => ({ ...p, backgroundOpacity: v }))}
                  max={1}
                  step={0.05}
                  disabled={!previewTheme.backgroundImage}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 4: Presets ── */}
        <TabsContent value="presets" className="mt-4 space-y-5">
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">System</h3>
            <div className="grid grid-cols-2 gap-x-3 gap-y-5">
              {systemPresets.map(preset => (
                <PresetCard
                  key={preset.name}
                  name={preset.name}
                  settings={preset.settings}
                  isActive={areThemeSettingsEqual(currentActiveSettings, preset.settings)}
                />
              ))}
            </div>
          </div>

          {userThemes.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">My Themes</h3>
              <ScrollArea className="max-h-[400px]">
                <div className="grid grid-cols-2 gap-x-3 gap-y-5 pr-2">
                  {userThemes.map(theme => (
                    <PresetCard
                      key={theme.id}
                      name={theme.name}
                      settings={theme.settings}
                      onDelete={() => deleteUserTheme(theme.id)}
                      isActive={areThemeSettingsEqual(currentActiveSettings, theme.settings)}
                    />
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          <Button
            variant="outline"
            className="w-full"
            disabled={isCurrentThemeSaved}
            onClick={() => setIsSaveDialogOpen(true)}
          >
            {isCurrentThemeSaved ? 'Colors already saved' : 'Save current colors as preset'}
          </Button>
        </TabsContent>
      </Tabs>

      {/* Color editor dialog */}
      <Dialog open={!!colorEditor} onOpenChange={(open) => !open && setColorEditor(null)}>
        <DialogContent className="sm:max-w-[320px]">
          <DialogHeader>
            <DialogTitle>Edit Color</DialogTitle>
          </DialogHeader>
          {colorEditor && (
            <div className="space-y-5 py-1">
              {/* Preview */}
              <div
                className="h-14 rounded-2xl border border-accent/10 shadow-inner"
                style={{ backgroundColor: hslToHex(colorEditor.h, colorEditor.s, colorEditor.l) }}
              />
              <p className="text-center text-xs font-mono text-muted-foreground -mt-3">
                {hslToHex(colorEditor.h, colorEditor.s, colorEditor.l).toUpperCase()}
              </p>
              {/* Sliders */}
              {([
                { label: 'Hue', key: 'h' as const, min: 0, max: 359, unit: '°' },
                { label: 'Saturation', key: 's' as const, min: 0, max: 100, unit: '%' },
                { label: 'Lightness', key: 'l' as const, min: 0, max: 100, unit: '%' },
              ] as const).map(({ label, key, min, max, unit }) => (
                <div key={key} className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs">{label}</Label>
                    <span className="text-xs tabular-nums font-mono text-muted-foreground">
                      {Math.round(colorEditor[key])}{unit}
                    </span>
                  </div>
                  <Slider
                    min={min} max={max} step={1}
                    value={[colorEditor[key]]}
                    onValueChange={([v]) => updateEditorHsl(
                      key === 'h' ? v : colorEditor.h,
                      key === 's' ? v : colorEditor.s,
                      key === 'l' ? v : colorEditor.l,
                    )}
                  />
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button className="w-full">Done</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save preset dialog */}
      <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as Preset</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="theme-name">Preset Name</Label>
            <Input
              id="theme-name"
              value={newThemeName}
              onChange={e => setNewThemeName(e.target.value)}
              placeholder="e.g., My Awesome Theme"
              onKeyDown={e => { if (e.key === 'Enter') handleSavePreset(); }}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="secondary">Cancel</Button></DialogClose>
            <Button onClick={handleSavePreset} disabled={!newThemeName.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
