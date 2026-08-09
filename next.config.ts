import type {NextConfig} from 'next';

const isExport = process.env.NEXT_OUTPUT === 'export' || process.env.GITHUB_ACTIONS === 'true';
const rawBasePath = isExport ? (process.env.NEXT_PUBLIC_BASE_PATH || '') : '';
const sanitizedBasePath = rawBasePath.replace(/\/+$/, '');
const basePath = (sanitizedBasePath && sanitizedBasePath !== '/') ? sanitizedBasePath : undefined;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: isExport ? 'export' : 'standalone',
  basePath,
  trailingSlash: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Allow access to remote image placeholder.
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**', // This allows any path under the hostname
      },
    ],
  },
  transpilePackages: ['motion'],
  webpack: (config, {dev}) => {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modify - file watching is disabled to prevent flickering during agent edits.
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default nextConfig;
