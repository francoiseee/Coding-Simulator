/** @type {import('next').NextConfig} */
const nextConfig = {
  // Bundles a minimal self-contained server into .next/standalone for the
  // Docker image. Vercel ignores this setting, so the live deploy is unaffected.
  output: "standalone",
};

export default nextConfig;
