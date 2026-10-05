import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // There is no public site. The proxy sends signed-out visitors on to /login.
  async redirects() {
    return [
      { source: '/', destination: '/dashboard', permanent: false },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'res.cloudinary.com',
      },
    ],
  },
};

export default nextConfig;
