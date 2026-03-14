import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 1. ADD THIS LINE (Required for APKs)
  output: 'export', 
  
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    // 2. ADD THIS LINE (Required for APKs)
    unoptimized: true, 
    
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;npm install @capacitor/core @capacitor/cli @capacitor/android