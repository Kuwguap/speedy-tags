/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  /** Next.js 16: serverActions lives under experimental. Default limit ~1 MB causes 413 on PDF FormData. */
  experimental: {
    serverActions: {
      bodySizeLimit: '8mb',
    },
  },
  serverExternalPackages: ['pdf-parse', '@napi-rs/canvas'],
}

export default nextConfig
