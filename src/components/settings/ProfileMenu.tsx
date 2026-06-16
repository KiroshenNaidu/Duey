'use client';

import { useContext, useState, useRef, useCallback } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Camera, User } from 'lucide-react';
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

  const onOpenChange = (o: boolean) => {
    if (!o) { onClose(); }
  };

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs rounded-3xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="text-base font-semibold">Adjust Photo</DialogTitle>
        </DialogHeader>

        <div className="px-5 py-4 space-y-4">
          {/* Draggable circle preview */}
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
                <img
                  src={avatarDataUrl}
                  alt="avatar preview"
                  draggable={false}
                  style={avatarImgStyle(draft)}
                />
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">Drag to reposition</p>
          </div>

          {/* Zoom slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Zoom</Label>
              <span className="text-[10px] text-muted-foreground font-mono">{draft.scale.toFixed(1)}×</span>
            </div>
            <Slider
              min={1}
              max={3}
              step={0.05}
              value={[draft.scale]}
              onValueChange={([v]) => setDraft(prev => ({ ...prev, scale: v }))}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs"
              onClick={onChangePhoto}
            >
              <Camera className="h-3.5 w-3.5 mr-1.5" />
              Change photo
            </Button>
            <Button
              size="sm"
              className="flex-1 text-xs"
              onClick={() => onSave(draft)}
            >
              Save
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

export function ProfileMenu() {
  const { userProfile, setUserProfile, avatarDataUrl, setProfileAvatar } = useContext(AppDataContext);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const [name, setName] = useState(userProfile.name);
  const [paydayDay, setPaydayDay] = useState(userProfile.paydayDay.toString());
  const [bio, setBio] = useState(userProfile.bio ?? '');

  const initial = userProfile.name.trim().charAt(0).toUpperCase();
  const s = userProfile.avatarSettings;

  const saveName = () => {
    if (name.trim() !== userProfile.name) {
      setUserProfile({ ...userProfile, name: name.trim() });
    }
  };

  const savePayday = () => {
    const day = parseInt(paydayDay, 10);
    if (!isNaN(day) && day >= 1 && day <= 31 && day !== userProfile.paydayDay) {
      setUserProfile({ ...userProfile, paydayDay: day });
    } else {
      setPaydayDay(userProfile.paydayDay.toString());
    }
  };

  const saveBio = () => {
    if (bio.trim() !== (userProfile.bio ?? '')) {
      setUserProfile({ ...userProfile, bio: bio.trim() });
    }
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setProfileAvatar(canvas.toDataURL('image/jpeg', 0.9));
        // Reset position when new photo uploaded
        setUserProfile({ ...userProfile, avatarSettings: undefined });
        setEditorOpen(true);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSave = (settings: AvatarSettings) => {
    setUserProfile({ ...userProfile, avatarSettings: settings });
    setEditorOpen(false);
  };

  const handleRemove = () => {
    setProfileAvatar('');
    setUserProfile({ ...userProfile, avatarSettings: undefined });
    setEditorOpen(false);
  };

  const ordinal = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  return (
    <div className="space-y-3">
      <AvatarEditor
        avatarDataUrl={avatarDataUrl}
        initialSettings={userProfile.avatarSettings}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSave={handleSave}
        onChangePhoto={() => { setEditorOpen(false); setTimeout(() => avatarInputRef.current?.click(), 100); }}
        onRemove={handleRemove}
      />

      <Card>
        <CardContent className="p-3 space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Personal Info</p>

          {/* Avatar circle */}
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => avatarDataUrl ? setEditorOpen(true) : avatarInputRef.current?.click()}
              className="relative h-20 w-20 rounded-full overflow-hidden bg-primary/15 border-2 border-primary/25 flex items-center justify-center group"
              aria-label={avatarDataUrl ? 'Edit profile photo' : 'Add profile photo'}
            >
              {avatarDataUrl ? (
                <img src={avatarDataUrl} alt="avatar" draggable={false} style={avatarImgStyle(s)} />
              ) : initial ? (
                <span className="text-3xl font-bold text-primary">{initial}</span>
              ) : (
                <User className="h-8 w-8 text-primary/50" />
              )}
              <div className="absolute inset-0 bg-black/45 flex items-center justify-center opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity">
                <Camera className="h-5 w-5 text-white" />
              </div>
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
            />
            <p className="text-[10px] text-muted-foreground/60">
              {avatarDataUrl ? 'Tap to adjust' : 'Tap to add photo'}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Your Name</Label>
            <Input
              placeholder="e.g., Jhon Skyrim"
              value={name}
              onChange={e => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={e => e.key === 'Enter' && saveName()}
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
              onBlur={savePayday}
              onKeyDown={e => e.key === 'Enter' && savePayday()}
            />
            {!isNaN(parseInt(paydayDay, 10)) && (
              <p className="text-[10px] text-muted-foreground">
                You get paid on the {ordinal(parseInt(paydayDay, 10))} of each month
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">About me</Label>
            <Textarea
              placeholder="e.g., Saving towards a debt-free life..."
              value={bio}
              onChange={e => setBio(e.target.value)}
              onBlur={saveBio}
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
