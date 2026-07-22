'use client';
import { useState, useEffect, useRef, useContext, useMemo, useCallback } from 'react';
import type { ThemeSettings, UserTheme } from '@/lib/types';
import { systemPresets } from '@/lib/systemThemes';
import { RadialFxDemo } from '@/components/settings/RadialFxDemo';
import { QuickMenuConfig } from '@/components/settings/QuickMenuConfig';
import { PageTransitionDemo } from '@/components/settings/PageTransitionDemo';
import { Switch } from '@/components/ui/switch';
import { STATUS_COLOR_VARS, applyStatusColors } from '@/components/ThemeProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Button, buttonVariants } from '@/components/ui/button';
import { hexToHsl, hslToHex, idbGet, idbSet, cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Loader2, Trash2, Check, Plus, Minus, Star, RotateCcw } from 'lucide-react';
import { AppDataContext } from '@/context/AppDataContext';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SwipeTabView } from '@/components/SwipeTabView';
import { HapticsCard } from '@/components/settings/HapticsCard';
import { setHapticStrength } from '@/lib/haptics';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

const TAB_ORDER = ['style', 'colors', 'background', 'presets'] as const;
type TabKey = (typeof TAB_ORDER)[number];

// Width of the left/right edge band whose swipes always change tabs (bypassing
// SwipeTabView's slider guard) — keeps slider-heavy tabs like Background swipeable.
const EDGE_ZONE = 28;

const defaultThemeSettings: Omit<ThemeSettings, 'backgroundImage' | 'backgroundVideo'> = {
  background: '240 6% 7%',
  surface: '240 4% 11%',
  primary: '96 65% 64%',
  accent: '103 77% 59%',
  foreground: '60 8% 95%',
  accentForeground: '240 3% 62%',
  font: 'Inter',
  backgroundOpacity: 0.5,
  backgroundBlur: 0,
  uiScale: 1.0,
  uiStyle: 'solid',
  useSafeAreaInsets: true,
  bgX: 50,
  bgY: 50,
  bgScale: 1,
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
  s1: Omit<ThemeSettings, 'backgroundImage' | 'backgroundVideo' | 'backgroundOpacity'>,
  s2: Omit<ThemeSettings, 'backgroundImage' | 'backgroundVideo' | 'backgroundOpacity'>
) =>
  s1.background === s2.background && s1.surface === s2.surface &&
  s1.primary === s2.primary && s1.accent === s2.accent &&
  s1.foreground === s2.foreground && s1.accentForeground === s2.accentForeground &&
  s1.font === s2.font && s1.uiScale === s2.uiScale && s1.uiStyle === s2.uiStyle &&
  (s1.bgX ?? 50) === (s2.bgX ?? 50) &&
  (s1.bgY ?? 50) === (s2.bgY ?? 50);

export function ThemeSettingsMenu({ onCancel, onDirtyChange, onSaved }: { onCancel?: () => void; onDirtyChange?: (dirty: boolean) => void; onSaved?: (msg: string) => void }) {
  const {
    themeSettings, setThemeSettings, userThemes, addUserTheme, deleteUserTheme, setAppError,
    favouriteThemes, hiddenSystemPresets, setFavouriteThemes, setHiddenSystemPresets,
    quickAddFxId, setQuickAddFxId, quickAddShortcuts, setQuickAddShortcuts,
    pageTransitionId, setPageTransitionId, swipeActionsEnabled, setSwipeActionsEnabled,
    hapticsStrength, setHapticsStrength,
  } = useContext(AppDataContext);

  // Quick-add + preset + vibration drafts — same save-then-apply contract as the theme
  // itself: edits live here (and drive the previews) but only reach app state on Save.
  const [draftFxId, setDraftFxId] = useState(quickAddFxId);
  const [draftShortcuts, setDraftShortcuts] = useState<string[]>([...quickAddShortcuts]);
  const [draftFavourites, setDraftFavourites] = useState<string[]>([...favouriteThemes]);
  const [draftHidden, setDraftHidden] = useState<string[]>([...hiddenSystemPresets]);
  const [draftPageTransitionId, setDraftPageTransitionId] = useState(pageTransitionId);
  const [draftSwipeActions, setDraftSwipeActions] = useState(swipeActionsEnabled);
  const [draftHaptics, setDraftHaptics] = useState(hapticsStrength);

  const toggleDraftFavourite = (id: string) =>
    setDraftFavourites(f => f.includes(id) ? f.filter(x => x !== id) : [...f, id]);
  const hideDraftPreset = (name: string) =>
    setDraftHidden(h => h.includes(name) ? h : [...h, name]);
  const restoreDraftPresets = () => setDraftHidden([]);

  const [previewTheme, setPreviewTheme] = useState<ThemeSettings>(() => ({
    ...defaultThemeSettings,
    ...themeSettings,
    backgroundImage: '',
    backgroundVideo: '',
  }));
  const [isClient, setIsClient] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const isBgDraggingRef = useRef(false);
  const lastBgPosRef = useRef({ x: 0, y: 0 });
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [newThemeName, setNewThemeName] = useState('');
  // Real device aspect ratio so the preview crops exactly like the full-screen background.
  const [screenAspect, setScreenAspect] = useState('9 / 19.5');

  // Refs for dirty detection and unmount-cleanup
  const initialThemeRef = useRef<ThemeSettings | null>(null);
  const initialBgRef = useRef('');
  const initialVideoRef = useRef('');
  const savedThemeRef = useRef(themeSettings);

  useEffect(() => {
    const capturedSettings = themeSettings;
    setIsClient(true);
    setScreenAspect(`${window.innerWidth} / ${window.innerHeight}`);
    Promise.all([idbGet<string>('backgroundImage'), idbGet<string>('backgroundVideo')]).then(([img, vid]) => {
      const loadedImg = img || '';
      const loadedVid = vid || '';
      initialBgRef.current = loadedImg;
      initialVideoRef.current = loadedVid;
      if (loadedImg || loadedVid) setPreviewTheme(p => ({ ...p, backgroundImage: loadedImg, backgroundVideo: loadedVid }));
      initialThemeRef.current = { ...capturedSettings, backgroundImage: loadedImg, backgroundVideo: loadedVid };
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
      root.style.setProperty('--bg-scale', String(saved.bgScale ?? 1));
      root.style.setProperty('--bg-blur', `${saved.backgroundBlur ?? 0}px`);
      root.style.setProperty('--glass-opacity', String(saved.glassOpacity ?? 0.55));
      document.body.classList.remove('ui-glass', 'ui-minimal', 'ui-elevated');
      if (saved.uiStyle !== 'solid') document.body.classList.add(`ui-${saved.uiStyle}`);
      document.body.style.zoom = `${saved.uiScale}`;
      const hadVideo = !!initialVideoRef.current;
      const bgDiv = document.getElementById('global-bg-image');
      if (bgDiv) {
        bgDiv.style.backgroundImage = initialBgRef.current ? `url(${initialBgRef.current})` : 'none';
        bgDiv.style.display = hadVideo ? 'none' : 'block';
      }
      const bgVid = document.getElementById('global-bg-video') as HTMLVideoElement | null;
      if (bgVid) {
        bgVid.src = initialVideoRef.current || '';
        bgVid.style.display = hadVideo ? 'block' : 'none';
      }
      document.body.classList.toggle('has-bg-image', !!initialBgRef.current || hadVideo);
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
    const hasVideo = !!previewTheme.backgroundVideo;
    const hasBg = hasVideo || !!previewTheme.backgroundImage;
    const bgDiv = document.getElementById('global-bg-image');
    const bgVid = document.getElementById('global-bg-video') as HTMLVideoElement | null;
    const overlayDiv = document.getElementById('global-bg-overlay');
    if (bgDiv) {
      bgDiv.style.backgroundImage = previewTheme.backgroundImage ? `url(${previewTheme.backgroundImage})` : 'none';
      bgDiv.style.display = hasVideo ? 'none' : 'block';
    }
    if (bgVid) {
      const nextSrc = previewTheme.backgroundVideo || '';
      // Only reassign src when it actually changes — otherwise the video restarts on every slider tick.
      if (bgVid.getAttribute('src') !== nextSrc) {
        bgVid.src = nextSrc;
        if (nextSrc) bgVid.play?.().catch(() => {});
      }
      bgVid.style.display = hasVideo ? 'block' : 'none';
    }
    if (overlayDiv) overlayDiv.style.opacity = String(hasBg ? previewTheme.backgroundOpacity : 0);
    root.style.setProperty('--bg-x', `${previewTheme.bgX ?? 50}%`);
    root.style.setProperty('--bg-y', `${previewTheme.bgY ?? 50}%`);
    root.style.setProperty('--bg-scale', String(previewTheme.bgScale ?? 1));
    root.style.setProperty('--bg-blur', `${previewTheme.backgroundBlur ?? 0}px`);
    document.body.classList.toggle('has-bg-image', hasBg);
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
        // Uploaded image replaces any video and resets to full-screen framing.
        setPreviewTheme(p => ({ ...p, backgroundImage: dataUrl, backgroundVideo: '', bgX: 50, bgY: 50, bgScale: 1 }));
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

  const handleRemoveImage = () => setPreviewTheme(p => ({ ...p, backgroundImage: '', backgroundVideo: '', bgX: 50, bgY: 50, bgScale: 1, backgroundBlur: 0 }));

  const onBgPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!previewTheme.backgroundImage && !previewTheme.backgroundVideo) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isBgDraggingRef.current = true;
    lastBgPosRef.current = { x: e.clientX, y: e.clientY };
  }, [previewTheme.backgroundImage, previewTheme.backgroundVideo]);

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
    const { backgroundImage, backgroundVideo, ...settingsToSave } = previewTheme;
    try {
      await idbSet('backgroundImage', backgroundImage);
      await idbSet('backgroundVideo', backgroundVideo);
      setThemeSettings(settingsToSave);
      // Quick-add + preset drafts commit together with the theme — never before.
      setQuickAddFxId(draftFxId);
      setQuickAddShortcuts(draftShortcuts);
      setPageTransitionId(draftPageTransitionId);
      setSwipeActionsEnabled(draftSwipeActions);
      // Vibration commits with everything else — persist it AND push it to the haptics
      // module now so the very next tick (and post-reload app) uses the saved strength.
      setHapticsStrength(draftHaptics);
      setHapticStrength(draftHaptics);
      // Hidden first (it prunes favourites for hidden presets), then favourites.
      setHiddenSystemPresets(draftHidden);
      setFavouriteThemes(draftFavourites);
      onDirtyChange?.(false);
      onSaved?.('Settings saved!');
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
    const { backgroundImage, backgroundVideo, backgroundOpacity, ...settingsToSave } = previewTheme;
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
    return (
      JSON.stringify(previewTheme) !== JSON.stringify(initialThemeRef.current) ||
      draftFxId !== quickAddFxId ||
      JSON.stringify(draftShortcuts) !== JSON.stringify(quickAddShortcuts) ||
      JSON.stringify(draftFavourites) !== JSON.stringify(favouriteThemes) ||
      JSON.stringify(draftHidden) !== JSON.stringify(hiddenSystemPresets) ||
      draftPageTransitionId !== pageTransitionId ||
      draftSwipeActions !== swipeActionsEnabled ||
      draftHaptics !== hapticsStrength
    );
  }, [previewTheme, draftFxId, quickAddFxId, draftShortcuts, quickAddShortcuts,
      draftFavourites, favouriteThemes, draftHidden, hiddenSystemPresets,
      draftPageTransitionId, pageTransitionId, draftSwipeActions, swipeActionsEnabled,
      draftHaptics, hapticsStrength]);

  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  const currentActiveSettings = useMemo(() => {
    const { backgroundImage, backgroundVideo, backgroundOpacity, ...settings } = previewTheme;
    return settings;
  }, [previewTheme]);

  const hasBg = !!previewTheme.backgroundImage || !!previewTheme.backgroundVideo;

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

  // ── Sub-tab navigation (swipeable via SwipeTabView) ──
  const [tab, setTab] = useState<TabKey>('style');
  const pathname = usePathname();
  const goToTab = useCallback((next: TabKey) => {
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    setTab(next);
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
    deleteDescription = 'This custom preset will be permanently removed.',
    isActive,
    isFavourite,
    onToggleFavourite,
  }: {
    name: string;
    settings: Omit<ThemeSettings, 'backgroundImage' | 'backgroundVideo' | 'backgroundOpacity'>;
    onDelete?: () => void;
    deleteDescription?: string;
    isActive: boolean;
    isFavourite: boolean;
    onToggleFavourite: () => void;
  }) => (
    <div className="space-y-2">
      <button
        onClick={() => setPreviewTheme(p => ({ ...p, ...defaultStatusColors, ...settings }))}
        className={cn(
          'w-full aspect-square rounded-2xl border-2 flex flex-col items-center justify-center relative transition-all gap-2 p-3',
          isActive ? 'border-primary sel-glow' : 'border-border hover:border-border/60'
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
      <div className="flex items-center justify-between px-0.5 gap-1">
        <p className="text-xs font-medium truncate flex-1">{name}</p>
        {/* Favourite star — starred themes are what the Day/Night quick-switch offers */}
        <button
          onClick={onToggleFavourite}
          aria-label={isFavourite ? `Unfavourite ${name}` : `Favourite ${name}`}
          className="h-6 w-6 shrink-0 flex items-center justify-center rounded-lg active:bg-muted"
        >
          <Star className={cn('h-3.5 w-3.5', isFavourite ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/40')} />
        </button>
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
                <AlertDialogDescription>{deleteDescription}</AlertDialogDescription>
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

      {/* Vibration — drafted like everything else here; the Save bar above commits it. */}
      <HapticsCard value={draftHaptics} onChange={setDraftHaptics} />

      <Tabs value={tab} onValueChange={(v) => goToTab(v as TabKey)} className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-9">
          <TabsTrigger value="style" className="text-[11px]">Style</TabsTrigger>
          <TabsTrigger value="colors" className="text-[11px]">Colors</TabsTrigger>
          <TabsTrigger value="background" className="text-[11px]">Background</TabsTrigger>
          <TabsTrigger value="presets" className="text-[11px]">Presets</TabsTrigger>
        </TabsList>

        {/* Sub-tab carousel — the SAME finger-tracked pager the main pages use (shared
            tuning + the user's transition preset). Listens at the document level so the
            whole screen works; `enabled` gates it to /settings since SettingsPage stays
            mounted in the page carousel even while other routes are showing. */}
        <SwipeTabView
          tabs={TAB_ORDER}
          active={tab}
          onChange={goToTab}
          edgeZone={EDGE_ZONE}
          enabled={pathname === '/settings'}
          renderTab={t => (
            <div>
        {/* ── Tab 1: Style ── */}
        {t === 'style' && (
        <div className="mt-4 space-y-4">
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
                      ? 'border-primary bg-primary/5 sel-glow'
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
                      ? 'border-primary bg-primary/5 sel-glow'
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
                      ? 'border-primary bg-primary/5 sel-glow'
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
                      ? 'border-primary bg-primary/5 sel-glow'
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

          {/* Quick-add radial gesture effects — applies immediately (not part of theme save) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Quick Add Effects</CardTitle>
            </CardHeader>
            <CardContent>
              <RadialFxDemo value={draftFxId} onChange={setDraftFxId} />
            </CardContent>
          </Card>

          {/* Which shortcuts live in the quick-add radial + their arc order */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Quick Menu</CardTitle>
            </CardHeader>
            <CardContent>
              <QuickMenuConfig value={draftShortcuts} onChange={setDraftShortcuts} />
            </CardContent>
          </Card>

          {/* How the page carousel animates when swiping between the 4 main tabs */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Page Transition</CardTitle>
            </CardHeader>
            <CardContent>
              <PageTransitionDemo value={draftPageTransitionId} onChange={setDraftPageTransitionId} />
            </CardContent>
          </Card>

          {/* Swipe-to-reveal action trays on list cards (SwipeableRow) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Gestures</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between bg-muted/30 rounded-xl px-3 py-2.5">
                <div className="flex-1 min-w-0 pr-3">
                  <p className="text-xs font-semibold text-foreground">Swipe actions on cards</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Swipe expenses, debts and rides left to reveal edit / pay / delete
                  </p>
                </div>
                <Switch checked={draftSwipeActions} onCheckedChange={setDraftSwipeActions} />
              </div>
            </CardContent>
          </Card>
        </div>
        )}

        {/* ── Tab 2: Colors ── */}
        {t === 'colors' && (
        <div className="mt-4 space-y-4">
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
        </div>
        )}

        {/* ── Tab 3: Background ── */}
        {t === 'background' && (
        <div className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Background</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {/* Preview — matches the device aspect ratio so framing is WYSIWYG. Drag to reposition. */}
              <div className="flex justify-center">
              <div
                ref={previewRef}
                className={cn(
                  "h-[260px] max-w-full rounded-xl bg-secondary relative overflow-hidden border border-accent/10",
                  hasBg && "cursor-grab active:cursor-grabbing touch-none select-none"
                )}
                style={{ aspectRatio: screenAspect }}
                onPointerDown={onBgPointerDown}
                onPointerMove={onBgPointerMove}
                onPointerUp={onBgPointerUp}
                onPointerCancel={onBgPointerUp}
              >
                {previewTheme.backgroundVideo ? (
                  <video
                    key={previewTheme.backgroundVideo}
                    autoPlay muted loop playsInline preload="auto"
                    src={previewTheme.backgroundVideo}
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    style={{
                      objectFit: 'cover',
                      objectPosition: `${previewTheme.bgX ?? 50}% ${previewTheme.bgY ?? 50}%`,
                      transform: `scale(${previewTheme.bgScale ?? 1})`,
                      filter: `blur(${(previewTheme.backgroundBlur ?? 0) / 3}px)`,
                    }}
                  />
                ) : previewTheme.backgroundImage ? (
                  <div
                    className="absolute inset-0 bg-cover pointer-events-none"
                    style={{
                      backgroundImage: `url(${previewTheme.backgroundImage})`,
                      backgroundPosition: `${previewTheme.bgX ?? 50}% ${previewTheme.bgY ?? 50}%`,
                      transform: `scale(${previewTheme.bgScale ?? 1})`,
                      filter: `blur(${(previewTheme.backgroundBlur ?? 0) / 3}px)`,
                    }}
                  />
                ) : null}
                {!hasBg && (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-muted-foreground text-xs">No background selected</p>
                  </div>
                )}
                {hasBg && (
                  <div
                    className="absolute w-3 h-3 rounded-full border-2 border-white/80 pointer-events-none -translate-x-1/2 -translate-y-1/2 z-10"
                    style={{ left: `${previewTheme.bgX ?? 50}%`, top: `${previewTheme.bgY ?? 50}%`, boxShadow: '0 0 0 1px rgba(0,0,0,0.5)' }}
                  />
                )}
                <div className="absolute inset-0 bg-black rounded-xl pointer-events-none" style={{ opacity: hasBg ? previewTheme.backgroundOpacity : 0, transition: 'opacity 0.2s' }} />
              </div>
              </div>

              {/* Upload image + Remove */}
              <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="w-full" disabled={isProcessing}>
                {isProcessing
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</>
                  : <><Upload className="mr-2 h-4 w-4" />Upload</>}
              </Button>
              <Button onClick={handleRemoveImage} variant="destructive" className="w-full" disabled={!hasBg}>
                <Trash2 className="mr-2 h-4 w-4" />Remove background
              </Button>
              <input ref={fileInputRef} type="file" onChange={handleFileChange} accept="image/*" className="hidden" />

              {/* Opacity */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Overlay Opacity</Label>
                  <div className="flex items-center gap-3">
                    {hasBg && (previewTheme.bgX !== 50 || previewTheme.bgY !== 50) && (
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
                  disabled={!hasBg}
                />
              </div>

              {/* Position X / Y — sliders with steppers for precise framing */}
              {([
                { axis: 'bgX' as const, label: 'Position X' },
                { axis: 'bgY' as const, label: 'Position Y' },
              ]).map(({ axis, label }) => {
                const val = previewTheme[axis] ?? 50;
                const nudge = (d: number) =>
                  setPreviewTheme(p => ({ ...p, [axis]: Math.min(100, Math.max(0, Math.round((p[axis] ?? 50) + d))) }));
                return (
                  <div key={axis} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">{label}</Label>
                      <span className="text-xs text-muted-foreground tabular-nums">{Math.round(val)}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon" className="h-8 w-8 rounded-full shrink-0" disabled={!hasBg} onClick={() => nudge(-1)}>
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <Slider
                        value={[val]}
                        onValueChange={([v]) => setPreviewTheme(p => ({ ...p, [axis]: v }))}
                        min={0}
                        max={100}
                        step={1}
                        disabled={!hasBg}
                        className="flex-1"
                      />
                      <Button variant="outline" size="icon" className="h-8 w-8 rounded-full shrink-0" disabled={!hasBg} onClick={() => nudge(1)}>
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}

              {/* Blur */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Blur</Label>
                  <span className="text-xs text-muted-foreground tabular-nums">{(previewTheme.backgroundBlur ?? 0).toFixed(0)}px</span>
                </div>
                <Slider
                  value={[previewTheme.backgroundBlur ?? 0]}
                  onValueChange={([v]) => setPreviewTheme(p => ({ ...p, backgroundBlur: v }))}
                  max={20}
                  step={1}
                  disabled={!hasBg}
                />
              </div>

              {/* Zoom */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Zoom</Label>
                  <span className="text-xs text-muted-foreground tabular-nums">{(previewTheme.bgScale ?? 1).toFixed(2)}×</span>
                </div>
                <Slider
                  value={[previewTheme.bgScale ?? 1]}
                  onValueChange={([v]) => setPreviewTheme(p => ({ ...p, bgScale: v }))}
                  min={1}
                  max={3}
                  step={0.05}
                  disabled={!hasBg}
                />
              </div>
            </CardContent>
          </Card>
        </div>
        )}

        {/* ── Tab 4: Presets ── */}
        {t === 'presets' && (
        <div className="mt-4 space-y-5">
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">System</h3>
            <div className="grid grid-cols-2 gap-x-3 gap-y-5">
              {systemPresets
                .filter(preset => !draftHidden.includes(preset.name))
                .map(preset => (
                  <PresetCard
                    key={preset.name}
                    name={preset.name}
                    settings={preset.settings}
                    isActive={areThemeSettingsEqual(currentActiveSettings, preset.settings)}
                    isFavourite={draftFavourites.includes(`preset:${preset.name}`)}
                    onToggleFavourite={() => toggleDraftFavourite(`preset:${preset.name}`)}
                    // Deleting a built-in just hides it (restorable, drafted until Save).
                    // Withheld on the last visible one — one system preset must always remain.
                    onDelete={
                      systemPresets.length - draftHidden.length > 1
                        ? () => { hideDraftPreset(preset.name); setDraftFavourites(f => f.filter(id => id !== `preset:${preset.name}`)); }
                        : undefined
                    }
                    deleteDescription="This built-in preset will be removed from your list on Save. You can restore hidden presets anytime."
                  />
                ))}
            </div>
            {draftHidden.length > 0 && (
              <Button variant="ghost" size="sm" className="mt-3 w-full text-xs gap-1.5" onClick={restoreDraftPresets}>
                <RotateCcw className="h-3 w-3" />
                Restore {draftHidden.length} hidden preset{draftHidden.length !== 1 ? 's' : ''}
              </Button>
            )}
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
                      // Deleting a saved theme is immediate + destructive (not drafted);
                      // also drop it from the favourites draft so Save can't resurrect it.
                      onDelete={() => { deleteUserTheme(theme.id); setDraftFavourites(f => f.filter(id => id !== theme.id)); }}
                      isActive={areThemeSettingsEqual(currentActiveSettings, theme.settings)}
                      isFavourite={draftFavourites.includes(theme.id)}
                      onToggleFavourite={() => toggleDraftFavourite(theme.id)}
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
        </div>
        )}
            </div>
          )}
        />
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
