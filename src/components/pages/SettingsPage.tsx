'use client';

import { useState, useContext, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Palette, Database, Bell, ChevronLeft, User, Pencil, History } from 'lucide-react';
import { ThemeSettingsMenu } from '@/components/settings/ThemeSettingsMenu';
import { DataManagementMenu } from '@/components/settings/DataManagementMenu';
import { NotificationsMenu } from '@/components/settings/NotificationsMenu';
import { ProfileMenu } from '@/components/settings/ProfileMenu';
import { AppDataContext } from '@/context/AppDataContext';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

type ActiveMenu = 'main' | 'profile' | 'theme' | 'data' | 'notifications';

type MenuItem = {
  id: Exclude<ActiveMenu, 'main' | 'profile'>;
  title: string;
  description: string;
  icon: React.ElementType;
};

const menuItems: MenuItem[] = [
  { id: 'theme',         title: 'Theme',           description: 'Customize colors, fonts, and background', icon: Palette },
  { id: 'data',          title: 'Data Management', description: 'Backup, restore, or reset your data',      icon: Database },
  { id: 'notifications', title: 'Notifications',   description: 'Payment reminders on Android',             icon: Bell },
];

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const PageHeader = ({ title, onBack }: { title: string; onBack?: () => void }) => (
  <div className="relative flex items-center justify-center pt-0 pb-4">
    {onBack && (
      <button onClick={onBack} className="absolute left-0 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-secondary">
        <ChevronLeft className="h-6 w-6" />
      </button>
    )}
    <h1 className="text-xl font-bold text-foreground">{title}</h1>
  </div>
);

const ProfileHeroCard = ({ onEdit }: { onEdit: () => void }) => {
  const { userProfile, avatarDataUrl } = useContext(AppDataContext);
  const initial = userProfile.name.trim().charAt(0).toUpperCase();
  const s = userProfile.avatarSettings;

  return (
    <div className="relative bg-card rounded-2xl p-4 flex items-center gap-4 mb-4">
      <div className="h-14 w-14 rounded-full bg-primary/15 flex items-center justify-center shrink-0 border border-primary/25 overflow-hidden relative">
        {avatarDataUrl ? (
          <img
            src={avatarDataUrl}
            alt="avatar"
            draggable={false}
            style={{
              position: 'absolute',
              objectFit: 'cover',
              maxWidth: 'none',
              userSelect: 'none',
              width:  `${(s?.scale ?? 1) * 100}%`,
              height: `${(s?.scale ?? 1) * 100}%`,
              left: '50%',
              top: '50%',
              transform: `translate(calc(-50% + ${(s?.offsetX ?? 0) * 100}%), calc(-50% + ${(s?.offsetY ?? 0) * 100}%))`,
            }}
          />
        ) : initial ? (
          <span className="text-2xl font-bold text-primary">{initial}</span>
        ) : (
          <User className="h-6 w-6 text-primary/50" />
        )}
      </div>
      <div className="flex-1 min-w-0 pr-6">
        <p className="text-lg font-bold text-foreground truncate leading-tight">
          {userProfile.name.trim() || 'Set your name'}
        </p>
        {userProfile.bio?.trim() ? (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{userProfile.bio}</p>
        ) : (
          <p className="text-xs text-muted-foreground mt-0.5">
            Payday: {ordinal(userProfile.paydayDay)} of each month
          </p>
        )}
      </div>
      <button
        onClick={onEdit}
        className="absolute top-3 right-3 p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        aria-label="Edit profile"
      >
        <Pencil className="h-4 w-4" />
      </button>
    </div>
  );
};

const menuVariants = {
  enter: (d: number) => ({ x: d >= 0 ? '60%' : '-60%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d >= 0 ? '-60%' : '60%', opacity: 0 }),
};

const menuTransition = { type: 'tween' as const, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number], duration: 0.22 };

export function SettingsPage() {
  const router = useRouter();
  const { setNavGuard, setPageSwipeLocked } = useContext(AppDataContext);
  const [activeMenu, setActiveMenu] = useState<ActiveMenu>('main');
  const menuDirectionRef = useRef(1);
  const [menuIsDirty, setMenuIsDirty] = useState(false);
  const [pendingNav, setPendingNav] = useState<ActiveMenu | null>(null);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (menuIsDirty) {
      setNavGuard({
        onAttempt: (href) => {
          setPendingHref(href);
          setShowDiscardDialog(true);
        },
      });
    } else {
      setNavGuard(null);
    }
    return () => setNavGuard(null);
  }, [menuIsDirty, setNavGuard]);

  useEffect(() => {
    const msg = sessionStorage.getItem('duey_saved_toast');
    if (msg) {
      sessionStorage.removeItem('duey_saved_toast');
      setToast(msg);
      setTimeout(() => setToast(null), 2500);
    }
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const tryNavigate = (target: ActiveMenu) => {
    if (menuIsDirty) {
      setPendingNav(target);
      setShowDiscardDialog(true);
    } else {
      menuDirectionRef.current = target === 'main' ? -1 : 1;
      setActiveMenu(target);
      setMenuIsDirty(false);
      document.querySelector('main')?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      // Push a dummy history entry so the Android hardware back button can pop
      // back to the settings main menu instead of exiting the app or jumping to
      // the previous route. The URL stays at /settings; we handle the pop below.
      if (target !== 'main') {
        window.history.pushState({ __duey_settings: target }, '', window.location.href);
      }
    }
  };

  // While inside a sub-menu, that menu owns horizontal swipes (its own sub-tabs), so
  // suppress the page-level swipe nav that would otherwise jump to Transport/Stats/etc.
  useEffect(() => {
    setPageSwipeLocked(activeMenu !== 'main');
    return () => setPageSwipeLocked(false);
  }, [activeMenu, setPageSwipeLocked]);

  const handleBack = () => tryNavigate('main');

  // Intercept Android hardware back button while inside a sub-menu.
  useEffect(() => {
    const onPop = () => {
      if (activeMenu !== 'main') {
        // Re-push so the entry is restored, then animate to main.
        window.history.pushState({ __duey_settings: activeMenu }, '', window.location.href);
        tryNavigate('main');
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMenu]);

  const confirmDiscard = () => {
    setMenuIsDirty(false);
    setShowDiscardDialog(false);
    if (pendingHref !== null) {
      const href = pendingHref;
      setPendingHref(null);
      setPendingNav(null);
      router.push(href);
    } else if (pendingNav !== null) {
      menuDirectionRef.current = pendingNav === 'main' ? -1 : 1;
      setActiveMenu(pendingNav);
      setPendingNav(null);
    }
  };

  const handleSaved = (msg: string) => {
    showToast(msg);
    setMenuIsDirty(false);
    menuDirectionRef.current = -1;
    setActiveMenu('main');
  };

  const handleThemeSaved = (msg: string) => {
    sessionStorage.setItem('duey_saved_toast', msg);
  };

  const discardDialog = (
    <AlertDialog open={showDiscardDialog} onOpenChange={(open) => { if (!open) { setPendingNav(null); setPendingHref(null); setShowDiscardDialog(false); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes. Leave without saving?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => { setPendingNav(null); setPendingHref(null); setShowDiscardDialog(false); }}>
            Keep editing
          </AlertDialogCancel>
          <AlertDialogAction onClick={confirmDiscard}>
            Discard changes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const toastUI = toast && (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[200] bg-card border border-accent/30 text-foreground text-sm font-semibold px-5 py-2.5 rounded-full shadow-lg animate-in fade-in slide-in-from-top-2 duration-200 pointer-events-none">
      {toast}
    </div>
  );

  return (
    <div className="container mx-auto max-w-md pt-11" style={{ overflow: 'hidden' }}>
      {discardDialog}
      {toastUI}
      <AnimatePresence mode="popLayout" custom={menuDirectionRef.current}>
        <motion.div
          key={activeMenu}
          custom={menuDirectionRef.current}
          variants={menuVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={menuTransition}
        >
          {activeMenu === 'profile' && (
            <>
              <PageHeader title="Profile" onBack={handleBack} />
              <ProfileMenu onDirtyChange={setMenuIsDirty} onSaved={handleSaved} onCancel={() => { menuDirectionRef.current = -1; setActiveMenu('main'); }} />
            </>
          )}
          {activeMenu === 'theme' && (
            <>
              <PageHeader title="Theme" onBack={handleBack} />
              <ThemeSettingsMenu onCancel={handleBack} onDirtyChange={setMenuIsDirty} onSaved={handleThemeSaved} />
            </>
          )}
          {activeMenu === 'data' && (
            <>
              <PageHeader title="Data Management" onBack={handleBack} />
              <DataManagementMenu />
            </>
          )}
          {activeMenu === 'notifications' && (
            <>
              <PageHeader title="Notifications" onBack={handleBack} />
              <NotificationsMenu onDirtyChange={setMenuIsDirty} onSaved={handleSaved} onCancel={() => { menuDirectionRef.current = -1; setActiveMenu('main'); }} />
            </>
          )}
          {activeMenu === 'main' && (
            <>
              <ProfileHeroCard onEdit={() => tryNavigate('profile')} />
              <div className="space-y-3">
                {menuItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => tryNavigate(item.id)}
                    className="w-full text-left p-3 bg-card rounded-2xl flex items-center gap-4 transition-transform active:scale-[0.98] hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                  >
                    <item.icon className="h-5 w-5 text-accent shrink-0" />
                    <div>
                      <p className="text-base font-semibold text-card-foreground">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                  </button>
                ))}
                <button
                  onClick={() => router.push('/history')}
                  className="w-full text-left p-3 bg-card rounded-2xl flex items-center gap-4 transition-transform active:scale-[0.98] hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                >
                  <History className="h-5 w-5 text-accent shrink-0" />
                  <div>
                    <p className="text-base font-semibold text-card-foreground">Payment History</p>
                    <p className="text-xs text-muted-foreground">View and edit all recorded payments</p>
                  </div>
                </button>
              </div>
              <div className="mt-4 p-3 rounded-2xl text-center">
                <p className="text-[10px] text-muted-foreground/60">Duey · Personal finance tracker</p>
                <p className="text-[10px] text-muted-foreground/60">Built by Kiroshen · v1.7</p>
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
