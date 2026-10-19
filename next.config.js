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
  experimental: { cpus: 2 },
  modularizeImports: {
    "@ant-design/icons": {
      transform: "@ant-design/icons/lib/icons/{{member}}",
      preventFullImport: true,
    },
  },
  reactStrictMode: true,
  i18n,
  compiler: {
    // removeConsole: process.env.NODE_ENV === "production",
  },
};

module.exports = nextConfig;

