import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.duey.app',
  appName: 'Duey',
  webDir: 'out',
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_duey',
      iconColor: '#4062BF',
    },
  },
};

export default config;
