'use client';
import { useState, useEffect, useRef, useContext, useMemo, useCallback } from 'react';
import type { ThemeSettings, UserTheme } from '@/lib/types';
import { STATUS_COLOR_VARS, applyStatusColors } from '@/components/ThemeProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Button, buttonVariants } from '@/components/ui/button';
import { hexToHsl, hslToHex, idbGet, idbSet, cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Loader2, Trash2, Check, Plus, Minus, ShieldCheck } from 'lucide-react';
import { AppDataContext } from '@/context/AppDataContext';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import Link from 'next/link';

const defaultThemeSettings: Omit<ThemeSettings, 'backgroundImage'> = {
  background: '240 6% 7%',
  surface: '240 4% 11%',
  primary: '96 65% 64%',
  accent: '103 77% 59%',
  foreground: '60 8% 95%',
  accentForeground: '240 3% 62%',
  font: 'Inter',
  backgroundOpacity: 0.5,
  uiScale: 1.0,
  uiStyle: 'solid',
  useSafeAreaInsets: true,
  bgX: 50,
  bgY: 50,
  glassOpacity: 0.55,
  positive: '161 50% 57%',
  negative: '0 70% 62%',
  catTransport: '217 91% 68%',
  catBudget: '0 70% 62%',
  catExpense: '25 95% 53%',
  catCompletion: '43 96% 70%',
  catEmployment: '173 80% 74%',
  catSnapshot: '199 89% 62%',
};

const systemPresets: Omit<UserTheme, 'id'>[] = [
  {
    name: 'Duey',
    settings: {
      background: '240 6% 7%', surface: '240 4% 11%',
      primary: '96 65% 64%', accent: '103 77% 59%',
      foreground: '60 8% 95%', accentForeground: '240 3% 62%',
      font: 'Inter', uiScale: 1.0, uiStyle: 'solid',
      positive: '161 50% 57%', negative: '0 70% 62%',
      catTransport: '217 91% 68%', catBudget: '0 70% 62%',
      catExpense: '25 95% 53%', catCompletion: '43 96% 70%',
      catEmployment: '173 80% 74%', catSnapshot: '199 89% 62%',
    },
  },
  {
    name: 'Noir',
    settings: {
      background: '0 0% 7%', surface: '0 0% 12%',
      primary: '0 0% 88%', accent: '0 0% 72%',
      foreground: '0 0% 98%', accentForeground: '0 0% 65%',
      font: 'Inter', uiScale: 1.0, uiStyle: 'solid',
      positive: '0 0% 82%', negative: '0 0% 52%',
      catTransport: '0 0% 68%', catBudget: '0 0% 74%', catExpense: '0 0% 60%',
      catCompletion: '0 0% 88%', catEmployment: '0 0% 70%', catSnapshot: '0 0% 78%',
    },
  },
  {
    name: 'Crimson',
    settings: {
      background: '0 12% 6%', surface: '0 10% 10%',
      primary: '0 72% 62%', accent: '15 80% 60%',
      foreground: '0 10% 95%', accentForeground: '0 5% 60%',
      font: 'Inter', uiScale: 1.0, uiStyle: 'solid',
      positive: '161 50% 57%', negative: '0 70% 62%',
      catTransport: '217 91% 68%', catBudget: '0 70% 62%', catExpense: '25 95% 53%',
      catCompletion: '43 96% 70%', catEmployment: '173 80% 74%', catSnapshot: '199 89% 62%',
    },
  },
  {
    name: 'Ocean',
    settings: {
      background: '220 28% 7%', surface: '220 22% 11%',
      primary: '199 80% 60%', accent: '212 85% 65%',
      foreground: '210 10% 95%', accentForeground: '210 8% 62%',
      font: 'Inter', uiScale: 1.0, uiStyle: 'solid',
      positive: '161 50% 57%', negative: '0 70% 62%',
      catTransport: '199 80% 60%', catBudget: '0 70% 62%', catExpense: '25 95% 53%',
      catCompletion: '43 96% 70%', catEmployment: '173 80% 74%', catSnapshot: '199 89% 62%',
    },
  },
  {
    name: 'Amber',
    settings: {
      background: '30 14% 6%', surface: '30 11% 10%',
      primary: '38 90% 60%', accent: '28 92% 58%',
      foreground: '35 10% 96%', accentForeground: '30 6% 62%',
      font: 'Inter', uiScale: 1.0, uiStyle: 'solid',
      positive: '161 50% 57%', negative: '0 70% 62%',
      catTransport: '217 91% 68%', catBudget: '0 70% 62%', catExpense: '38 90% 60%',
      catCompletion: '43 96% 70%', catEmployment: '173 80% 74%', catSnapshot: '199 89% 62%',
    },
  },
  {
    name: 'Violet',
    settings: {
      background: '268 18% 7%', surface: '268 14% 11%',
      primary: '268 65% 70%', accent: '285 68% 67%',
      foreground: '270 10% 95%', accentForeground: '268 6% 62%',
      font: 'Inter', uiScale: 1.0, uiStyle: 'solid',
      positive: '161 50% 57%', negative: '0 70% 62%',
      catTransport: '217 91% 68%', catBudget: '0 70% 62%', catExpense: '25 95% 53%',
      catCompletion: '43 96% 70%', catEmployment: '268 65% 70%', catSnapshot: '199 89% 62%',
    },
  },
  {
    name: 'Slate',
    settings: {
      background: '215 22% 7%', surface: '215 18% 11%',
      primary: '213 62% 65%', accent: '220 65% 68%',
      foreground: '215 10% 96%', accentForeground: '215 7% 62%',
      font: 'Inter', uiScale: 1.0, uiStyle: 'solid',
      positive: '161 50% 57%', negative: '0 70% 62%',
      catTransport: '213 62% 65%', catBudget: '0 70% 62%', catExpense: '25 95% 53%',
      catCompletion: '43 96% 70%', catEmployment: '173 80% 74%', catSnapshot: '199 89% 62%',
    },
  },
  {
    name: 'Rose',
    settings: {
      background: '338 14% 6%', surface: '338 11% 10%',
      primary: '338 62% 65%', accent: '320 65% 62%',
      foreground: '338 10% 95%', accentForeground: '338 5% 62%',
      font: 'Inter', uiScale: 1.0, uiStyle: 'solid',
      positive: '161 50% 57%', negative: '338 62% 65%',
      catTransport: '217 91% 68%', catBudget: '338 62% 65%', catExpense: '25 95% 53%',
      catCompletion: '43 96% 70%', catEmployment: '173 80% 74%', catSnapshot: '199 89% 62%',
    },
  },
  {
    name: 'Jade',
    settings: {
      background: '168 20% 6%', surface: '168 16% 10%',
      primary: '158 52% 58%', accent: '172 56% 55%',
      foreground: '160 8% 95%', accentForeground: '165 6% 62%',
      font: 'Inter', uiScale: 1.0, uiStyle: 'solid',
      positive: '158 52% 58%', negative: '0 70% 62%',
      catTransport: '217 91% 68%', catBudget: '0 70% 62%', catExpense: '25 95% 53%',
      catCompletion: '43 96% 70%', catEmployment: '172 56% 55%', catSnapshot: '199 89% 62%',
    },
  },
  {
    name: 'Solar',
    settings: {
      background: '42 16% 6%', surface: '42 12% 10%',
      primary: '44 88% 62%', accent: '38 88% 58%',
      foreground: '44 10% 96%', accentForeground: '44 8% 62%',
      font: 'Inter', uiScale: 1.0, uiStyle: 'solid',
      positive: '161 50% 57%', negative: '0 70% 62%',
      catTransport: '217 91% 68%', catBudget: '0 70% 62%', catExpense: '44 88% 62%',
      catCompletion: '43 96% 70%', catEmployment: '173 80% 74%', catSnapshot: '199 89% 62%',
    },
  },
  {
    name: 'Copper',
    settings: {
      background: '22 16% 6%', surface: '22 13% 10%',
      primary: '22 70% 58%', accent: '32 72% 56%',
      foreground: '22 10% 95%', accentForeground: '22 6% 62%',
      font: 'Inter', uiScale: 1.0, uiStyle: 'solid',
      positive: '161 50% 57%', negative: '0 70% 62%',
      catTransport: '217 91% 68%', catBudget: '0 70% 62%', catExpense: '22 70% 58%',
      catCompletion: '43 96% 70%', catEmployment: '173 80% 74%', catSnapshot: '199 89% 62%',
    },
  },
  {
    name: 'Midnight',
    settings: {
      background: '240 32% 5%', surface: '240 26% 9%',
      primary: '240 60% 70%', accent: '255 62% 72%',
      foreground: '240 10% 96%', accentForeground: '240 8% 62%',
      font: 'Inter', uiScale: 1.0, uiStyle: 'solid',
      positive: '161 50% 57%', negative: '0 70% 62%',
      catTransport: '240 60% 70%', catBudget: '0 70% 62%', catExpense: '25 95% 53%',
      catCompletion: '43 96% 70%', catEmployment: '173 80% 74%', catSnapshot: '255 62% 72%',
    },
  },
];

// Colored status-color defaults — applied when selecting a preset that doesn't define its
// own status colors, so switching away from a B&W preset restores the colored palette.
const defaultStatusColors = Object.fromEntries(
  STATUS_COLOR_VARS.map(v => [v.field, v.default])
) as Partial<ThemeSettings>;

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
  s1.font === s2.font && s1.uiScale === s2.uiScale && s1.uiStyle === s2.uiStyle &&
  (s1.bgX ?? 50) === (s2.bgX ?? 50) &&
  (s1.bgY ?? 50) === (s2.bgY ?? 50);

export function ThemeSettingsMenu({ onCancel, onDirtyChange, onSaved }: { onCancel?: () => void; onDirtyChange?: (dirty: boolean) => void; onSaved?: (msg: string) => void }) {
  const { themeSettings, setThemeSettings, userThemes, addUserTheme, deleteUserTheme, setAppError } = useContext(AppDataContext);

  const [previewTheme, setPreviewTheme] = useState<ThemeSettings>(() => ({
    ...defaultThemeSettings,
    ...themeSettings,
    backgroundImage: '',
  }));
  const [isClient, setIsClient] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const isBgDraggingRef = useRef(false);
  const lastBgPosRef = useRef({ x: 0, y: 0 });
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [newThemeName, setNewThemeName] = useState('');

  // Refs for dirty detection and unmount-cleanup
  const initialThemeRef = useRef<ThemeSettings | null>(null);
  const initialBgRef = useRef('');
  const savedThemeRef = useRef(themeSettings);

  useEffect(() => {
    const capturedSettings = themeSettings;
    setIsClient(true);
    idbGet<string>('backgroundImage').then(img => {
      const loaded = img || '';
      initialBgRef.current = loaded;
      if (loaded) setPreviewTheme(p => ({ ...p, backgroundImage: loaded }));
      initialThemeRef.current = { ...capturedSettings, backgroundImage: loaded };
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Revert CSS vars to saved values when this component unmounts (discard)
  useEffect(() => {
    return () => {
      const saved = savedThemeRef.current;
      const root = document.documentElement;
      root.style.setProperty('--background', saved.background);
      root.style.setProperty('--card', saved.surface);
      root.style.setProperty('--primary', saved.primary);
      root.style.setProperty('--accent', saved.accent);
      root.style.setProperty('--ring', saved.accent);
      root.style.setProperty('--foreground', saved.foreground);
      root.style.setProperty('--accent-foreground', saved.accentForeground);
      applyStatusColors(root, saved);
      root.style.setProperty('--bg-x', `${saved.bgX ?? 50}%`);
      root.style.setProperty('--bg-y', `${saved.bgY ?? 50}%`);
      root.style.setProperty('--glass-opacity', String(saved.glassOpacity ?? 0.55));
      document.body.classList.remove('ui-glass', 'ui-minimal', 'ui-elevated');
      if (saved.uiStyle !== 'solid') document.body.classList.add(`ui-${saved.uiStyle}`);
      document.body.style.zoom = `${saved.uiScale}`;
      const bgDiv = document.getElementById('global-bg-image');
      if (bgDiv) bgDiv.style.backgroundImage = initialBgRef.current ? `url(${initialBgRef.current})` : 'none';
      document.body.classList.toggle('has-bg-image', !!initialBgRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isClient) return;
    const root = document.documentElement;
    root.style.setProperty('--background', previewTheme.background);
    root.style.setProperty('--card', previewTheme.surface);
    root.style.setProperty('--primary', previewTheme.primary);
    root.style.setProperty('--accent', previewTheme.accent);
    root.style.setProperty('--foreground', previewTheme.foreground);
    root.style.setProperty('--accent-foreground', previewTheme.accentForeground);
    applyStatusColors(root, previewTheme);
    const bgDiv = document.getElementById('global-bg-image');
    const overlayDiv = document.getElementById('global-bg-overlay');
    if (bgDiv) bgDiv.style.backgroundImage = previewTheme.backgroundImage ? `url(${previewTheme.backgroundImage})` : 'none';
    if (overlayDiv) overlayDiv.style.opacity = String(previewTheme.backgroundImage ? previewTheme.backgroundOpacity : 0);
    root.style.setProperty('--bg-x', `${previewTheme.bgX ?? 50}%`);
    root.style.setProperty('--bg-y', `${previewTheme.bgY ?? 50}%`);
    document.body.classList.toggle('has-bg-image', !!previewTheme.backgroundImage);
    document.body.classList.remove('ui-glass', 'ui-minimal', 'ui-elevated');
    if (previewTheme.uiStyle !== 'solid') document.body.classList.add(`ui-${previewTheme.uiStyle}`);
    document.body.style.zoom = `${previewTheme.uiScale}`;
    document.documentElement.style.setProperty('--glass-opacity', String(previewTheme.glassOpacity ?? 0.55));
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
      img.onerror = () => {
        setIsProcessing(false);
        setAppError({
          friendly: 'Could not read image — file may be corrupted or unsupported.',
          operation: 'img.onerror in handleFileChange in ThemeSettingsMenu',
          error: new Error('Image failed to load'),
          ts: Date.now(),
        });
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleRemoveImage = () => setPreviewTheme(p => ({ ...p, backgroundImage: '', bgX: 50, bgY: 50 }));

  const onBgPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!previewTheme.backgroundImage) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isBgDraggingRef.current = true;
    lastBgPosRef.current = { x: e.clientX, y: e.clientY };
  }, [previewTheme.backgroundImage]);

  const onBgPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isBgDraggingRef.current || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const dx = e.clientX - lastBgPosRef.current.x;
    const dy = e.clientY - lastBgPosRef.current.y;
    lastBgPosRef.current = { x: e.clientX, y: e.clientY };
    setPreviewTheme(prev => ({
      ...prev,
      bgX: Math.min(100, Math.max(0, (prev.bgX ?? 50) + (dx / rect.width) * 100)),
      bgY: Math.min(100, Math.max(0, (prev.bgY ?? 50) + (dy / rect.height) * 100)),
    }));
  }, []);

  const onBgPointerUp = useCallback(() => { isBgDraggingRef.current = false; }, []);

  const handleSave = async () => {
    const { backgroundImage, ...settingsToSave } = previewTheme;
    try {
      await idbSet('backgroundImage', backgroundImage);
      setThemeSettings(settingsToSave);
      onDirtyChange?.(false);
      onSaved?.('Theme saved!');
      document.documentElement.classList.add('page-fading-out');
      setTimeout(() => { window.location.href = '/'; }, 130);
    } catch (err) {
      setAppError({
        friendly: 'Could not save theme — storage may be full.',
        operation: "idbSet('backgroundImage') in ThemeSettingsMenu.handleSave",
        error: err,
        ts: Date.now(),
      });
    }
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

  const isDirty = useMemo(() => {
    if (!initialThemeRef.current) return false;
    return JSON.stringify(previewTheme) !== JSON.stringify(initialThemeRef.current);
  }, [previewTheme]);

  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  const currentActiveSettings = useMemo(() => {
    const { backgroundImage, backgroundOpacity, ...settings } = previewTheme;
    return settings;
  }, [previewTheme]);

  const isCurrentThemeSaved = useMemo(() =>
    systemPresets.some(p => areThemeSettingsEqual(p.settings, currentActiveSettings)) ||
    userThemes.some(p => areThemeSettingsEqual(p.settings, currentActiveSettings)),
  [currentActiveSettings, userThemes]);

  // ── Color editor state ──
  type ColorField = keyof Pick<ThemeSettings,
    'background' | 'surface' | 'primary' | 'accent' | 'foreground' | 'accentForeground' |
    'positive' | 'negative' | 'catTransport' | 'catBudget' | 'catExpense' | 'catCompletion' | 'catEmployment' | 'catSnapshot'>;
  const [colorEditor, setColorEditor] = useState<{ field: ColorField; h: number; s: number; l: number } | null>(null);
  const [hexInputValue, setHexInputValue] = useState('');
  const hexInputRef = useRef<HTMLInputElement>(null);

  const openColorEditor = (field: ColorField) => {
    const [h, s, l] = parseHsl(previewTheme[field] as string);
    setColorEditor({ field, h, s, l });
    setHexInputValue(hslToHex(h, s, l).toUpperCase());
  };

  const updateEditorHsl = useCallback((h: number, s: number, l: number) => {
    setColorEditor(prev => {
      if (!prev) return null;
      setPreviewTheme(pt => ({ ...pt, [prev.field]: `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%` }));
      if (document.activeElement !== hexInputRef.current) {
        setHexInputValue(hslToHex(h, s, l).toUpperCase());
      }
      return { ...prev, h, s, l };
    });
  }, []);

  const handleHexInputChange = (raw: string) => {
    setHexInputValue(raw);
    const cleaned = raw.replace(/^#/, '');
    // Expand 3-char shorthand
    const full = cleaned.length === 3
      ? cleaned.split('').map(c => c + c).join('')
      : cleaned;
    if (full.length === 6 && /^[0-9a-fA-F]{6}$/.test(full)) {
      const hslStr = hexToHsl('#' + full);
      if (hslStr) {
        const [h, s, l] = hslStr.replace(/%/g, '').split(' ').map(Number);
        setColorEditor(prev => {
          if (!prev) return null;
          setPreviewTheme(pt => ({ ...pt, [prev.field]: `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%` }));
          return { ...prev, h: h || 0, s: s || 0, l: l || 0 };
        });
      }
    }
  };

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
    isDefault,
  }: {
    name: string;
    settings: Omit<ThemeSettings, 'backgroundImage' | 'backgroundOpacity'>;
    onDelete?: () => void;
    isActive: boolean;
    isDefault?: boolean;
  }) => (
    <div className="space-y-2">
      <button
        onClick={() => setPreviewTheme(p => ({ ...p, ...defaultStatusColors, ...settings }))}
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
        {isDefault && (
          <div
            className="absolute top-2 left-2 h-5 w-5 rounded-full bg-black/30 flex items-center justify-center"
            title="Safe mode — always restores to app defaults"
          >
            <ShieldCheck className="h-3 w-3 text-white/70" />
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
          onClick={(e) => { if (onCancel) { e.preventDefault(); onCancel(); } }}
        >
          Cancel
        </Link>
        <Button
          className={cn('flex-1', isDirty && 'ring-2 ring-accent/50 ring-offset-1 ring-offset-background')}
          onClick={handleSave}
        >
          Save
        </Button>
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

                {/* Minimal */}
                <button
                  onClick={() => setPreviewTheme(p => ({ ...p, uiStyle: 'minimal' }))}
                  className={cn(
                    'relative flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all',
                    previewTheme.uiStyle === 'minimal'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/30'
                  )}
                >
                  <div className="w-full h-16 rounded-xl flex items-center justify-center">
                    <div className="w-10 h-7 rounded-lg bg-primary/15" />
                  </div>
                  <span className="text-sm font-medium">Minimal</span>
                  {previewTheme.uiStyle === 'minimal' && (
                    <div className="absolute top-2.5 right-2.5 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                      <Check className="h-3 w-3 text-primary-foreground" />
                    </div>
                  )}
                </button>

                {/* Elevated */}
                <button
                  onClick={() => setPreviewTheme(p => ({ ...p, uiStyle: 'elevated' }))}
                  className={cn(
                    'relative flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all',
                    previewTheme.uiStyle === 'elevated'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/30'
                  )}
                >
                  <div className="w-full h-16 rounded-xl bg-card flex items-center justify-center"
                    style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                    <div className="w-10 h-7 rounded-lg bg-primary/20"
                      style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }} />
                  </div>
                  <span className="text-sm font-medium">Elevated</span>
                  {previewTheme.uiStyle === 'elevated' && (
                    <div className="absolute top-2.5 right-2.5 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                      <Check className="h-3 w-3 text-primary-foreground" />
                    </div>
                  )}
                </button>
              </div>

              {previewTheme.uiStyle === 'glass' && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Glass Transparency</Label>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {Math.round((1 - (previewTheme.glassOpacity ?? 0.55)) * 100)}%
                    </span>
                  </div>
                  <Slider
                    value={[1 - (previewTheme.glassOpacity ?? 0.55)]}
                    onValueChange={([v]) => setPreviewTheme(p => ({ ...p, glassOpacity: parseFloat((1 - v).toFixed(2)) }))}
                    min={0.05}
                    max={0.9}
                    step={0.05}
                  />
                  <p className="text-[10px] text-muted-foreground">Higher = more see-through</p>
                </div>
              )}
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
            <CardHeader className="pb-2"><CardTitle className="text-sm">Status Colors</CardTitle></CardHeader>
            <CardContent>
              <p className="text-[11px] text-muted-foreground/70 mb-3">
                Colors used for badges and amounts across History &amp; Stats (payments, transport, budget, etc.).
              </p>
              <div className="grid grid-cols-3 gap-3">
                {STATUS_COLOR_VARS.map(({ field, label }) => (
                  <ColorSwatch key={field} label={label} field={field as ColorField} />
                ))}
              </div>
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
              {/* Preview — drag to reposition */}
              <div
                ref={previewRef}
                className={cn(
                  "w-full aspect-video rounded-xl bg-secondary relative overflow-hidden border border-accent/10",
                  previewTheme.backgroundImage && "cursor-grab active:cursor-grabbing touch-none select-none"
                )}
                style={{
                  backgroundImage: previewTheme.backgroundImage ? `url(${previewTheme.backgroundImage})` : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: `${previewTheme.bgX ?? 50}% ${previewTheme.bgY ?? 50}%`,
                }}
                onPointerDown={onBgPointerDown}
                onPointerMove={onBgPointerMove}
                onPointerUp={onBgPointerUp}
                onPointerCancel={onBgPointerUp}
              >
                {!previewTheme.backgroundImage && (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-muted-foreground text-xs">No image selected</p>
                  </div>
                )}
                {previewTheme.backgroundImage && (
                  <div
                    className="absolute w-3 h-3 rounded-full border-2 border-white/80 pointer-events-none -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${previewTheme.bgX ?? 50}%`, top: `${previewTheme.bgY ?? 50}%`, boxShadow: '0 0 0 1px rgba(0,0,0,0.5)' }}
                  />
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
                  <div className="flex items-center gap-3">
                    {previewTheme.backgroundImage && (previewTheme.bgX !== 50 || previewTheme.bgY !== 50) && (
                      <button
                        className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                        onClick={() => setPreviewTheme(p => ({ ...p, bgX: 50, bgY: 50 }))}
                      >
                        Reset position
                      </button>
                    )}
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {(previewTheme.backgroundOpacity * 100).toFixed(0)}%
                    </span>
                  </div>
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
                  isDefault={preset.name === 'Duey'}
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
        <DialogContent
          className="sm:max-w-[320px]"
          onCloseAutoFocus={e => { e.preventDefault(); (document.activeElement as HTMLElement)?.blur(); }}
        >
          <DialogHeader>
            <DialogTitle>Edit Color</DialogTitle>
            <DialogDescription className="sr-only">Adjust hue, saturation, and lightness to customize this color.</DialogDescription>
          </DialogHeader>
          {colorEditor && (
            <div className="space-y-4 py-1">
              {/* Preview */}
              <div
                className="h-14 rounded-2xl border border-accent/10 shadow-inner"
                style={{ backgroundColor: hslToHex(colorEditor.h, colorEditor.s, colorEditor.l) }}
              />
              {/* Hex input */}
              <div className="relative flex items-center">
                <div
                  className="absolute left-3 w-5 h-5 rounded-md border border-white/10 shrink-0"
                  style={{ backgroundColor: hslToHex(colorEditor.h, colorEditor.s, colorEditor.l) }}
                />
                <Input
                  ref={hexInputRef}
                  value={hexInputValue}
                  onChange={e => handleHexInputChange(e.target.value)}
                  onFocus={e => e.target.select()}
                  placeholder="#000000"
                  maxLength={7}
                  spellCheck={false}
                  className="pl-10 font-mono text-sm tracking-widest uppercase bg-muted/30 border-muted/40 rounded-xl h-10"
                />
              </div>
              {/* Sliders */}
              <div className="space-y-4">
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
            <DialogDescription className="sr-only">Give your current color theme a name to save it as a reusable preset.</DialogDescription>
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
