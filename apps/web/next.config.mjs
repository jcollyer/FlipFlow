/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages are TypeScript source — let Next compile them.
  transpilePackages: ['@flipflow/api', '@flipflow/db', '@flipflow/types'],
  experimental: {
    // tRPC + superjson on RSC works best with this enabled.
    serverComponentsExternalPackages: ['@prisma/client'],
  },
};

export default nextConfig;
