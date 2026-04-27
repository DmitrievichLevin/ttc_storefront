/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    sri: {
      algorithm: 'sha256',
    },
  },
  // Prevent Next.js from trying to optimize images
  images: {
    unoptimized: true,
    minimumCacheTTL: 3600, // Explicitly set to 1 hour if needed
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.shopify.com',
      },
    ],
  },
  // Ensure the server doesn't attempt to generate static HTML
  output: 'standalone',
  async headers() {
    return [
      {
        // The URL the client requests
        source: '/:path*',
        // The actual file path Next.js resolves it to
        destination: '/api/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          {
            // Tailored CSP: 
            // - Allows external images from Shopify CDN
            // - Allows API connections to your Shopify domain
            // - Retains strict rules for objects and base URIs
            key: 'Content-Security-Policy',
            value: "default-src 'self'; img-src 'self' data: https://cdn.shopify.com; script-src 'self' 'unsafe-eval' 'unsafe-inline'; connect-src 'self' https://*.myshopify.com; object-src 'none'; base-uri 'self';",
          },
        ],
      },
    ];
  },
};

export default nextConfig;