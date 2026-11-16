/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Server actions carry every mutation in this app.
    serverActions: { bodySizeLimit: "4mb" },
  },
  // OpenNext patches the generated client for workerd; it must stay external.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
};

export default nextConfig;
