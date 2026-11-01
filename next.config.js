/** @type {import('next').NextConfig} */

const { i18n } = require("./next-i18next.config");
const nextConfig = {
  productionBrowserSourceMaps: false,
  distDir: process.env.DORAN_LOCAL === "true" ? ".next-local" : ".next",
  serverExternalPackages: ["@whiskeysockets/baileys", "pdfkit", "exceljs"],
  outputFileTracingRoot: __dirname,
  outputFileTracingExcludes: {
    "*": ["./storage/**/*", "./whatsapp-auth/**/*"],
  },
  experimental: { cpus: process.platform === "win32" ? 1 : 2 },
  modularizeImports: {
    "@ant-design/icons": {
      transform: "@ant-design/icons/lib/icons/{{member}}",
      preventFullImport: true,
    },
  },
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=15552000" }] : []),
    ] }];
  },
  i18n,
  compiler: {
    // removeConsole: process.env.NODE_ENV === "production",
  },
};

module.exports = nextConfig;

