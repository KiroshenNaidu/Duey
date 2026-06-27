import type { NextConfig } from 'next';
import { version } from './package.json';

const nextConfig: NextConfig = {
  output: 'export',
  // Single source of truth: the app version shown in the UI is derived from package.json,
  // inlined at build time so components can read process.env.NEXT_PUBLIC_APP_VERSION.
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    // Rewrites barrel imports so only used icons/helpers are bundled (lucide-react is the big win).
    optimizePackageImports: ['lucide-react', 'framer-motion', 'date-fns'],
  },
};

export default nextConfig;
