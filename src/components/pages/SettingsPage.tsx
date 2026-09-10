'use client';

import { useState, useContext, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Database, Bell, ChevronLeft, User, Pencil, History, SlidersHorizontal, GraduationCap, CalendarClock, Palette } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { AppDataContext } from '@/context/AppDataContext';
import { startTutorial } from '@/components/TutorialTour';
import { HapticsCard } from '@/components/settings/HapticsCard';
import { setHapticStrength } from '@/lib/haptics';
import { cn } from '@/lib/utils';

// Settings sub-menus are heavy (Theme + Data Management are ~1,400 lines each, and Data
// Management pulls in jsPDF) but are only opened occasionally. Code-split them out of the
// initial bundle so boot stays light; they're warmed in the background on idle (see
// prefetchSettingsMenus / AppShell) so navigation still feels instant.
const MenuFallback = () => (
  <div className="space-y-3 pt-2">
    <Skeleton className="h-24 w-full rounded-2xl" />
    <Skeleton className="h-40 w-full rounded-2xl" />
  </div>
);
const ProfileMenu = dynamic(() => import('@/components/settings/ProfileMenu').then(m => ({ default: m.ProfileMenu })), { ssr: false, loading: MenuFallback });
const ThemeSettingsMenu = dynamic(() => import('@/components/settings/ThemeSettingsMenu').then(m => ({ default: m.ThemeSettingsMenu })), { ssr: false, loading: MenuFallback });
const DataManagementMenu = dynamic(() => import('@/components/settings/DataManagementMenu').then(m => ({ default: m.DataManagementMenu })), { ssr: false, loading: MenuFallback });
const NotificationsMenu = dynamic(() => import('@/components/settings/NotificationsMenu').then(m => ({ default: m.NotificationsMenu })), { ssr: false, loading: MenuFallback });
const PayDateMenu = dynamic(() => import('@/components/settings/PayDateMenu').then(m => ({ default: m.PayDateMenu })), { ssr: false, loading: MenuFallback });
import { DayNightToggle } from '@/components/settings/DayNightToggle';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

type ActiveMenu = 'main' | 'profile' | 'config' | 'appearance' | 'data' | 'notifications' | 'paydate';

type MenuItem = {
  id: Exclude<ActiveMenu, 'main' | 'profile'>;
  title: string;
  description: string;
  icon: React.ElementType;
  tour?: string;
};

// The top level stays deliberately short — who you are (profile + day/night), one door to
// everything configurable, and the payment log. Every knob nests one level deeper.
const mainItems: MenuItem[] = [
  { id: 'config', title: 'Settings & Configuration', description: 'Reminders, data, pay date and appearance', icon: SlidersHorizontal, tour: 'settings-config' },
];

// Inside that door, ordered the way they come up: the reminder you set once, the backup you
// reach for, the pay date that drives the cycle. "How to use Duey" and Appearance are
// rendered after these (see the config screen) — the tutorial is an action, not a menu.
const configItems: MenuItem[] = [
  { id: 'notifications', title: 'Notifications',   description: 'Payment reminders on Android',        icon: Bell },
  { id: 'data',          title: 'Data Management', description: 'Backup, restore, or reset your data', icon: Database },
  { id: 'paydate',       title: 'Pay Date',        description: 'When your balance starts over',       icon: CalendarClock },
];

// Last in the list because it is a whole editor of its own (four swipeable tabs and a
// Save bar), not a single setting.
const appearanceItem: MenuItem = {
  id: 'appearance', title: 'Appearance', description: 'Themes, colours and quick-add effects', icon: Palette,
};

// Menu tree: depth drives the slide direction (deeper = forward) and each sub-menu's
// parent is where its back button / hardware-back returns to.
const MENU_DEPTH: Record<ActiveMenu, number> = {
  main: 0, profile: 1, config: 1, appearance: 2, data: 2, notifications: 2, paydate: 2,
};
const MENU_PARENT: Record<Exclude<ActiveMenu, 'main'>, ActiveMenu> = {
  profile: 'main', config: 'main', appearance: 'config', data: 'config', notifications: 'config', paydate: 'config',
};

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

// Every row in these menus is the same card-button; only the icon, the two lines and what
// tapping it does differ.
const MenuRow = ({ icon: Icon, title, description, onClick, tour }: {
  icon: React.ElementType;
  title: string;
  description: string;
  onClick: () => void;
  tour?: string;
}) => (
  <button
    data-tour={tour}
    onClick={onClick}
    className="w-full text-left p-3 bg-card rounded-2xl flex items-center gap-4 transition-transform active:scale-[0.98] hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
  >
    <Icon className="h-5 w-5 text-accent shrink-0" />
    <div>
      <p className="text-base font-semibold text-card-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  </button>
);

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
  const [dayNightOpen, setDayNightOpen] = useState(false);
  const initial = userProfile.name.trim().charAt(0).toUpperCase();
  const s = userProfile.avatarSettings;

  return (
    // Who you are and how the app looks are one block, so they share a card with a hairline
    // between them rather than sitting as two. The bottom corners square off while the theme
    // picker is open so the panel floating out from under it reads as the same surface.
    <div className={cn(
      'relative bg-card rounded-2xl mb-4 transition-[border-radius] duration-300',
      dayNightOpen && 'rounded-b-none',
    )}>
      <div className="flex items-center gap-4 p-4">
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
              Payday: {ordinal(userProfile.paydayDay)} - balance resets then
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
      <DayNightToggle embedded onExpandedChange={setDayNightOpen} />
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
  const pathname = usePathname();
  const { setNavGuard, setPageSwipeLocked, hapticsStrength, setHapticsStrength } = useContext(AppDataContext);
  const [activeMenu, setActiveMenu] = useState<ActiveMenu>('main');
  const menuDirectionRef = useRef(1);
  const [menuIsDirty, setMenuIsDirty] = useState(false);

  // The quick-add "Theme" shortcut opens the Settings sub-menu (Theme now lives inside it).
  // SettingsPage stays mounted (AppShell carousel), so this listener is live even from other
  // pages; QuickAdd navigates to /settings alongside dispatching the event.
  useEffect(() => {
    const onOpenTheme = () => { menuDirectionRef.current = 1; setActiveMenu('appearance'); };
    // Balance's cycle hairline points here, the same way the Theme shortcut does. Both skip
    // the Settings hub on the way in; Back still steps up through it.
    const onOpenPayDate = () => { menuDirectionRef.current = 1; setActiveMenu('paydate'); };
    window.addEventListener('duey:open-theme', onOpenTheme);
    window.addEventListener('duey:open-paydate', onOpenPayDate);
    return () => {
      window.removeEventListener('duey:open-theme', onOpenTheme);
      window.removeEventListener('duey:open-paydate', onOpenPayDate);
    };
  }, []);
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

  // Commit a menu change. Direction is depth-based (descend = slide forward, ascend =
  // slide back) so nested menus animate the right way. Descending pushes a dummy history
  // entry so the Android hardware back button pops one level (handled in the popstate
  // effect) instead of exiting the app; the URL stays at /settings throughout.
  const navigateTo = (target: ActiveMenu) => {
    menuDirectionRef.current = MENU_DEPTH[target] >= MENU_DEPTH[activeMenu] ? 1 : -1;
    const descending = MENU_DEPTH[target] > MENU_DEPTH[activeMenu];
    setActiveMenu(target);
    setMenuIsDirty(false);
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    if (descending) {
      window.history.pushState({ __duey_settings: target }, '', window.location.href);
    }
  };

  const tryNavigate = (target: ActiveMenu) => {
    if (menuIsDirty) {
      setPendingNav(target);
      setShowDiscardDialog(true);
    } else {
      navigateTo(target);
    }
  };

  // While inside a sub-menu, that menu owns horizontal swipes (its own sub-tabs), so
  // suppress the page-level swipe nav that would otherwise jump to Transport/Stats/etc.
  // Gated to /settings: this page stays mounted in the AppShell carousel, and a sub-menu
  // left open must not keep page swipes dead on Transport/Money/Stats.
  useEffect(() => {
    setPageSwipeLocked(activeMenu !== 'main' && pathname === '/settings');
    return () => setPageSwipeLocked(false);
  }, [activeMenu, pathname, setPageSwipeLocked]);

  // On-screen back always steps up one level (Pay Date → Settings → main).
  const handleBack = () => tryNavigate(activeMenu === 'main' ? 'main' : MENU_PARENT[activeMenu]);

  // Intercept Android hardware back button while inside a sub-menu.
  useEffect(() => {
    const onPop = () => {
      if (activeMenu !== 'main') {
        // Re-push so the popped entry is restored, then animate up one level to the
        // current menu's parent (Pay Date → Settings → main), not straight to main.
        window.history.pushState({ __duey_settings: activeMenu }, '', window.location.href);
        tryNavigate(MENU_PARENT[activeMenu]);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMenu, menuIsDirty]);

  const confirmDiscard = () => {
    setMenuIsDirty(false);
    setShowDiscardDialog(false);
    if (pendingHref !== null) {
      const href = pendingHref;
      setPendingHref(null);
      setPendingNav(null);
      router.push(href);
    } else if (pendingNav !== null) {
      navigateTo(pendingNav);
      setPendingNav(null);
    }
  };

  const handleSaved = (msg: string) => {
    showToast(msg);
    // Back up one level, not all the way out: a saved Pay Date lands you in Settings, where
    // you were, rather than skipping the hub you came through.
    navigateTo(activeMenu === 'main' ? 'main' : MENU_PARENT[activeMenu]);
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
              <ProfileMenu onDirtyChange={setMenuIsDirty} onSaved={handleSaved} onCancel={() => navigateTo('main')} />
            </>
          )}
          {activeMenu === 'appearance' && (
            <>
              <PageHeader title="Appearance" onBack={handleBack} />
              {/* One editor governs the whole page: Vibration + all appearance settings are
                  drafts committed together by its Cancel/Save bar — nothing applies until
                  Save. See ThemeSettingsMenu. */}
              <ThemeSettingsMenu onCancel={handleBack} onDirtyChange={setMenuIsDirty} onSaved={handleThemeSaved} />
            </>
          )}
          {activeMenu === 'data' && (
            <>
              <PageHeader title="Data Management" onBack={handleBack} />
              <DataManagementMenu />
            </>
          )}
          {activeMenu === 'paydate' && (
            <>
              <PageHeader title="Pay Date" onBack={handleBack} />
              <PayDateMenu onDirtyChange={setMenuIsDirty} onSaved={handleSaved} onCancel={() => navigateTo('config')} />
            </>
          )}
          {activeMenu === 'notifications' && (
            <>
              <PageHeader title="Notifications" onBack={handleBack} />
              <NotificationsMenu onDirtyChange={setMenuIsDirty} onSaved={handleSaved} onCancel={() => navigateTo('config')} />
            </>
          )}
          {activeMenu === 'config' && (
            <>
              <PageHeader title="Settings & Configuration" onBack={handleBack} />
              <div className="space-y-3">
                {configItems.map(item => (
                  <MenuRow key={item.id} {...item} onClick={() => tryNavigate(item.id)} />
                ))}
                <MenuRow
                  tour="tutorial-replay"
                  icon={GraduationCap}
                  title="How to use Duey"
                  description="Show the feature tutorial again"
                  onClick={startTutorial}
                />
                <MenuRow {...appearanceItem} onClick={() => tryNavigate(appearanceItem.id)} />
                {/* The one setting on this screen rather than behind another row: it is a
                    single four-way choice, and it belongs with the app's behaviour, not with
                    its colours (it used to be drafted inside the theme editor). No Save bar
                    here, so each pick applies straight away — to app state AND to the
                    haptics module, so the very next tap already uses it. */}
                <HapticsCard
                  value={hapticsStrength}
                  onChange={s => { setHapticsStrength(s); setHapticStrength(s); }}
                />
              </div>
            </>
          )}
          {activeMenu === 'main' && (
            <>
              <ProfileHeroCard onEdit={() => tryNavigate('profile')} />
              <div className="space-y-3">
                {mainItems.map(item => (
                  <MenuRow key={item.id} {...item} onClick={() => tryNavigate(item.id)} />
                ))}
                <MenuRow
                  icon={History}
                  title="Payment History"
                  description="View and edit all recorded payments"
                  onClick={() => router.push('/history')}
                />
              </div>
              <div className="mt-4 p-3 rounded-2xl text-center">
                <p className="text-[10px] text-muted-foreground/60">Duey · Personal finance tracker</p>
                <p className="text-[10px] text-muted-foreground/60">Built by Kiroshen · v{process.env.NEXT_PUBLIC_APP_VERSION}</p>
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
