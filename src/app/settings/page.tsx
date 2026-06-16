'use client';

import { useState, useContext } from 'react';
import { Palette, Database, Bell, ChevronLeft, User, Pencil } from 'lucide-react';
import { ThemeSettingsMenu } from '@/components/settings/ThemeSettingsMenu';
import { DataManagementMenu } from '@/components/settings/DataManagementMenu';
import { NotificationsMenu } from '@/components/settings/NotificationsMenu';
import { ProfileMenu } from '@/components/settings/ProfileMenu';
import { AppDataContext } from '@/context/AppDataContext';

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

export default function SettingsPage() {
  const [activeMenu, setActiveMenu] = useState<ActiveMenu>('main');
  const handleBack = () => setActiveMenu('main');

  if (activeMenu === 'profile') {
    return (
      <div className="container mx-auto max-w-md pt-11">
        <PageHeader title="Profile" onBack={handleBack} />
        <ProfileMenu />
      </div>
    );
  }

  if (activeMenu === 'theme') {
    return (
      <div className="container mx-auto max-w-md pt-11">
        <PageHeader title="Theme" onBack={handleBack} />
        <ThemeSettingsMenu onBack={handleBack} />
      </div>
    );
  }

  if (activeMenu === 'data') {
    return (
      <div className="container mx-auto max-w-md pt-11">
        <PageHeader title="Data Management" onBack={handleBack} />
        <DataManagementMenu />
      </div>
    );
  }

  if (activeMenu === 'notifications') {
    return (
      <div className="container mx-auto max-w-md pt-11">
        <PageHeader title="Notifications" onBack={handleBack} />
        <NotificationsMenu />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-md pt-11">
      <ProfileHeroCard onEdit={() => setActiveMenu('profile')} />

      <div className="space-y-3">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveMenu(item.id)}
            className="w-full text-left p-3 bg-card rounded-2xl flex items-center gap-4 transition-transform active:scale-[0.98] hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
          >
            <item.icon className="h-5 w-5 text-accent shrink-0" />
            <div>
              <p className="text-base font-semibold text-card-foreground">{item.title}</p>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-4 p-3 rounded-2xl text-center">
        <p className="text-[10px] text-muted-foreground/60">Duey · Personal finance tracker</p>
        <p className="text-[10px] text-muted-foreground/60">Built by Kiroshen · v1.0</p>
      </div>
    </div>
  );
}
