import type { NextConfig } from 'next';
import { version } from './package.json';

const nextConfig: NextConfig = {
  output: 'export',
  // Dev cache lives in its own dir so `npm run build` never touches it. Production
  // builds ALWAYS write intermediates to `.next` (under output:'export', distDir moves
  // the export folder, NOT the build dir — verified on 15.5.9), so sharing one dir meant
  // every build cold-started the next `npm run dev`, and the clean script crashed a
  // RUNNING dev server with ENOENT. Moving the DEV side is the lever that actually works:
  // dev has no export step, so distDir there is purely the compile cache.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
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
