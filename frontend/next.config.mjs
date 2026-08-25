/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // NEXT_PUBLIC_SERVER_URL is read directly in lib/socket.ts (with a localhost
  // dev fallback + production warning). The old env block here baked the
  // localhost fallback into the build, hiding a misconfigured deployment.
};

export default nextConfig;
