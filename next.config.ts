import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  experimental: {
    // Rewrites barrel imports so only used icons/helpers are bundled (lucide-react is the big win).
    optimizePackageImports: ['lucide-react', 'framer-motion', 'date-fns'],
  },
};

export default nextConfig;
