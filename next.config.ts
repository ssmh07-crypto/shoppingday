import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: { root: process.cwd() },
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: '79image.com' },
      { protocol: 'https', hostname: '79image.com' },
    ],
  },
}

export default nextConfig
