/** @type {import('next').NextConfig} */
const API_URL = process.env.API_URL ?? "http://localhost:4000/api/v1";

const nextConfig = {
  transpilePackages: ["@estudio/shared"],
  // El navegador llama a /api/v1 en el mismo origen y Next lo reenvía a la API.
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${API_URL}/:path*` }];
  },
};
export default nextConfig;
