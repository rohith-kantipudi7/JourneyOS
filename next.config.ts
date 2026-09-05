import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // React Flow's ResizeObserver does not survive React 19's StrictMode double
  // mount in dev, leaving graph nodes unmeasured and non-interactive.
  reactStrictMode: false,
  typedRoutes: true,
  eslint: {
    dirs: ['src'],
  },
};

export default nextConfig;
