/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent Next.js from trying to optimize images
  images: { unoptimized: true },
  // Ensure the server doesn't attempt to generate static HTML
  output: 'standalone',
  // Optional: Add headers to prevent your API from being embedded in iframes
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "default-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;