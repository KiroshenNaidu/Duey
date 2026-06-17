'use client';

import { useContext, useState, useRef, useCallback, useEffect } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Camera, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AvatarSettings } from '@/lib/types';

const DEFAULT_SETTINGS: AvatarSettings = { offsetX: 0, offsetY: 0, scale: 1 };
const PREVIEW_SIZE = 220;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function avatarImgStyle(s?: AvatarSettings): React.CSSProperties {
  return {
    position: 'absolute',
    objectFit: 'cover',
    maxWidth: 'none',
    userSelect: 'none',
    width:  `${(s?.scale ?? 1) * 100}%`,
    height: `${(s?.scale ?? 1) * 100}%`,
    left: '50%',
    top: '50%',
    transform: `translate(calc(-50% + ${(s?.offsetX ?? 0) * 100}%), calc(-50% + ${(s?.offsetY ?? 0) * 100}%))`,
  };
}

function AvatarEditor({
  avatarDataUrl,
  initialSettings,
  onSave,
  onChangePhoto,
  onRemove,
  open,
  onClose,
}: {
  avatarDataUrl: string;
  initialSettings?: AvatarSettings;
  onSave: (s: AvatarSettings) => void;
  onChangePhoto: () => void;
  onRemove: () => void;
  open: boolean;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<AvatarSettings>(initialSettings ?? DEFAULT_SETTINGS);
  const isDraggingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  // Reset draft when editor opens with new settings
  useEffect(() => {
    if (open) setDraft(initialSettings ?? DEFAULT_SETTINGS);
  }, [open, initialSettings]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    lastPosRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    setDraft(prev => {
      const dx = (e.clientX - lastPosRef.current.x) / (PREVIEW_SIZE * prev.scale);
      const dy = (e.clientY - lastPosRef.current.y) / (PREVIEW_SIZE * prev.scale);
      lastPosRef.current = { x: e.clientX, y: e.clientY };
      return {
        ...prev,
        offsetX: clamp(prev.offsetX + dx, -0.45, 0.45),
        offsetY: clamp(prev.offsetY + dy, -0.45, 0.45),
      };
    });
  }, []);

  const onPointerUp = useCallback(() => { isDraggingRef.current = false; }, []);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xs rounded-3xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="text-base font-semibold">Adjust Photo</DialogTitle>
          <DialogDescription className="sr-only">Drag and pinch to reposition and scale your profile photo.</DialogDescription>
        </DialogHeader>

        <div className="px-5 py-4 space-y-4">
          <div className="flex flex-col items-center gap-2">
            <div
              className="rounded-full overflow-hidden relative bg-primary/15 border-2 border-primary/25 cursor-grab active:cursor-grabbing touch-none select-none"
              style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {avatarDataUrl && (
                <img src={avatarDataUrl} alt="avatar preview" draggable={false} style={avatarImgStyle(draft)} />
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">Drag to reposition</p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Zoom</Label>
              <span className="text-[10px] text-muted-foreground font-mono">{draft.scale.toFixed(1)}×</span>
            </div>
            <Slider
              min={1} max={3} step={0.05}
              value={[draft.scale]}
              onValueChange={([v]) => setDraft(prev => ({ ...prev, scale: v }))}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={onChangePhoto}>
              <Camera className="h-3.5 w-3.5 mr-1.5" />Change photo
            </Button>
            <Button size="sm" className="flex-1 text-xs" onClick={() => onSave(draft)}>
              Apply
            </Button>
          </div>

          <button
            type="button"
            onClick={onRemove}
            className="w-full text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors py-1"
          >
            Remove photo
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ProfileMenuProps {
  onDirtyChange?: (dirty: boolean) => void;
  onSaved?: (msg: string) => void;
  onCancel?: () => void;
}

export function ProfileMenu({ onDirtyChange, onSaved, onCancel }: ProfileMenuProps) {
  const { userProfile, setUserProfile, avatarDataUrl, setProfileAvatar } = useContext(AppDataContext);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  // Text field drafts
  const [name, setName] = useState(userProfile.name);
  const [paydayDay, setPaydayDay] = useState(userProfile.paydayDay.toString());
  const [bio, setBio] = useState(userProfile.bio ?? '');

  // Avatar draft: null = no change, '' = remove, 'data:...' = new photo
  const [draftAvatarUrl, setDraftAvatarUrl] = useState<string | null>(null);
  const [draftAvatarSettings, setDraftAvatarSettings] = useState<AvatarSettings | undefined>(userProfile.avatarSettings);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const displayAvatarUrl = draftAvatarUrl !== null ? draftAvatarUrl : avatarDataUrl;
  const initial = (name.trim() || userProfile.name.trim()).charAt(0).toUpperCase();

  const isDirty =
    name !== userProfile.name ||
    paydayDay !== userProfile.paydayDay.toString() ||
    bio !== (userProfile.bio ?? '') ||
    draftAvatarUrl !== null ||
    JSON.stringify(draftAvatarSettings) !== JSON.stringify(userProfile.avatarSettings);

  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  const handleSave = async () => {
    const day = parseInt(paydayDay, 10);
    const validDay = !isNaN(day) && day >= 1 && day <= 31 ? day : userProfile.paydayDay;

    if (draftAvatarUrl !== null) {
      await setProfileAvatar(draftAvatarUrl);
    }
    setUserProfile({
      ...userProfile,
      name: name.trim() || userProfile.name,
      paydayDay: validDay,
      bio: bio.trim(),
      avatarSettings: draftAvatarSettings,
    });
    setDraftAvatarUrl(null);
    onDirtyChange?.(false);
    onSaved?.('Profile saved');
  };

  const handleCancel = () => {
    setName(userProfile.name);
    setPaydayDay(userProfile.paydayDay.toString());
    setBio(userProfile.bio ?? '');
    setDraftAvatarUrl(null);
    setDraftAvatarSettings(userProfile.avatarSettings);
    onDirtyChange?.(false);
    onCancel?.();
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const MAX = 1000;
        const ratio = Math.min(1, MAX / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * ratio);
        canvas.height = Math.round(img.height * ratio);
        const ctx = canvas.getContext('2d');
        if (!ctx) { setUploadError('Canvas context unavailable — try a different browser.'); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setDraftAvatarUrl(canvas.toDataURL('image/jpeg', 0.9));
        setDraftAvatarSettings(undefined);
        setEditorOpen(true);
      };
      img.onerror = () => {
        setUploadError('Could not read image — file may be corrupted or unsupported.');
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleAvatarEditorSave = (settings: AvatarSettings) => {
    setDraftAvatarSettings(settings);
    setEditorOpen(false);
  };

  const handleRemove = () => {
    setDraftAvatarUrl('');
    setDraftAvatarSettings(undefined);
    setEditorOpen(false);
  };

  const ordinal = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  const parsedDay = parseInt(paydayDay, 10);

  return (
    <div className="space-y-3">
      <AvatarEditor
        avatarDataUrl={displayAvatarUrl}
        initialSettings={draftAvatarSettings}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSave={handleAvatarEditorSave}
        onChangePhoto={() => { setEditorOpen(false); setTimeout(() => avatarInputRef.current?.click(), 100); }}
        onRemove={handleRemove}
      />

      {/* Save / Cancel */}
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={handleCancel}>Cancel</Button>
        <Button
          className={cn('flex-1', isDirty && 'ring-2 ring-accent/50 ring-offset-1 ring-offset-background')}
          onClick={handleSave}
        >
          Save
        </Button>
      </div>

      <Card>
        <CardContent className="p-3 space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Personal Info</p>

          {/* Avatar circle */}
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => displayAvatarUrl ? setEditorOpen(true) : avatarInputRef.current?.click()}
              className="relative h-20 w-20 rounded-full overflow-hidden bg-primary/15 border-2 border-primary/25 flex items-center justify-center group"
              aria-label={displayAvatarUrl ? 'Edit profile photo' : 'Add profile photo'}
            >
              {displayAvatarUrl ? (
                <img src={displayAvatarUrl} alt="avatar" draggable={false} style={avatarImgStyle(draftAvatarSettings)} />
              ) : initial ? (
                <span className="text-3xl font-bold text-primary">{initial}</span>
              ) : (
                <User className="h-8 w-8 text-primary/50" />
              )}
              <div className="absolute inset-0 bg-black/45 flex items-center justify-center opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity">
                <Camera className="h-5 w-5 text-white" />
              </div>
            </button>
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            <p className="text-[10px] text-muted-foreground/60">
              {displayAvatarUrl ? 'Tap to adjust' : 'Tap to add photo'}
            </p>
            {uploadError && (
              <p className="text-xs text-destructive text-center">{uploadError}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Your Name</Label>
            <Input
              placeholder="e.g., Jhon Skyrim"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Payday (day of month)</Label>
            <Input
              type="number"
              min={1}
              max={31}
              placeholder="e.g., 25"
              value={paydayDay}
              onChange={e => setPaydayDay(e.target.value)}
            />
            {!isNaN(parsedDay) && parsedDay >= 1 && parsedDay <= 31 && (
              <p className="text-[10px] text-muted-foreground">
                You get paid on the {ordinal(parsedDay)} of each month
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">About me</Label>
            <Textarea
              placeholder="e.g., Saving towards a debt-free life..."
              value={bio}
              onChange={e => setBio(e.target.value)}
              rows={3}
              className="resize-none text-sm"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">About</p>
          <p className="text-sm text-foreground font-medium">Duey</p>
          <p className="text-xs text-muted-foreground">Personal finance tracker</p>
          <p className="text-xs text-muted-foreground mt-1">Built by Kiroshen-For my laziness tehe~ · v1.2</p>
        </CardContent>
      </Card>
    </div>
  );
}
