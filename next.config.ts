import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  // docx uses ES6 class inheritance (super calls) that Turbopack can't handle raw —
  // transpilePackages forces it through SWC so `super` is correctly transformed in dev.
  transpilePackages: ['docx'],
  experimental: {
    // Rewrites barrel imports so only used icons/helpers are bundled (lucide-react is the big win).
    optimizePackageImports: ['lucide-react', 'framer-motion', 'date-fns'],
  },
};

export default nextConfig;
