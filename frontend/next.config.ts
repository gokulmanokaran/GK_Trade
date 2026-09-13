import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow server-side fetch with longer timeout for Yahoo Finance
  serverExternalPackages: [],

  // Headers for service worker scope
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Cache-Control', value: 'no-cache' },
        ],
      },
    ];
  },
};

export default nextConfig;
