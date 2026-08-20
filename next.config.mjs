/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Без этого папка референсов не попадает в сборку на Vercel:
    // локальный билд зелёный, а в проде «файл не найден».
    outputFileTracingIncludes: {
      '/api/ai/render': ['./public/references/**/*'],
    },
  },
};

export default nextConfig;
