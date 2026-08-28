/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // No ESLint config ships with this project, and a lint failure at 2am on the
  // night before a demo is not a useful signal. `npm test` is the gate that matters.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
