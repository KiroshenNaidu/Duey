'use client';

import { useState } from 'react';
import { Palette, Database, Bell, ChevronLeft } from 'lucide-react';
import { ThemeSettingsMenu } from '@/components/settings/ThemeSettingsMenu';
import { DataManagementMenu } from '@/components/settings/DataManagementMenu';
import { NotificationsMenu } from '@/components/settings/NotificationsMenu';

type MenuItem = {
  id: 'theme' | 'data' | 'notifications';
  title: string;
  description: string;
  icon: React.ElementType;
};

const menuItems: MenuItem[] = [
  { id: 'theme', title: 'Theme', description: 'Customize colors, fonts, and background', icon: Palette },
  { id: 'data', title: 'Data Management', description: 'Backup, restore, or reset your data', icon: Database },
  { id: 'notifications', title: 'Notifications', description: 'Manage monthly payment reminders', icon: Bell },
];

const SettingsHeader = ({ title, onBack }: { title: string; onBack?: () => void }) => (
  <div className="relative flex items-center justify-center pt-2 pb-6">
    {onBack && (
      <button onClick={onBack} className="absolute left-0 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-secondary">
        <ChevronLeft className="h-6 w-6" />
      </button>
    )}
    <h1 className="text-3xl font-bold text-foreground">{title}</h1>
  </div>
);

const MainMenu = ({ onNavigate }: { onNavigate: (menu: 'theme' | 'data' | 'notifications') => void }) => (
  <div className="space-y-4">
    {menuItems.map((item) => (
      <button
        key={item.id}
        onClick={() => onNavigate(item.id)}
        className="w-full text-left p-6 bg-card rounded-3xl flex items-center gap-6 transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
      >
        <item.icon className="h-8 w-8 text-accent" />
        <div>
          <p className="text-xl font-semibold text-card-foreground">{item.title}</p>
          <p className="text-sm text-muted-foreground">{item.description}</p>
        </div>
      </button>
    ))}
  </div>
);

export default function SettingsPage() {
  const [activeMenu, setActiveMenu] = useState<'main' | 'theme' | 'data' | 'notifications'>('main');

  const handleBack = () => setActiveMenu('main');

  if (activeMenu === 'theme') {
    return (
      <div className="container mx-auto max-w-2xl">
        <SettingsHeader title="Theme" onBack={handleBack} />
        <ThemeSettingsMenu />
      </div>
    );
  }
  
  if (activeMenu === 'data') {
    return (
      <div className="container mx-auto max-w-2xl">
        <SettingsHeader title="Data Management" onBack={handleBack} />
        <DataManagementMenu />
      </div>
    );
  }
  
  if (activeMenu === 'notifications') {
    return (
      <div className="container mx-auto max-w-2xl">
        <SettingsHeader title="Notifications" onBack={handleBack} />
        <NotificationsMenu />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl">
      <SettingsHeader title="Settings" />
      <MainMenu onNavigate={setActiveMenu} />
    </div>
  );
}
