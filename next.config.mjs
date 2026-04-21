/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      // Serve the Vite SPA for all non-API, non-auth, non-Next routes
      {
        source: '/:path*',
        destination: '/index.html',
        // Next.js applies these AFTER matching its own pages and API routes,
        // so /api/*, /auth/*, /reports/*, etc. are unaffected.
      },
    ]
  },
}

export default nextConfig
