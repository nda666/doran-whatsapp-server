/** @type {import('next').NextConfig} */

const { i18n } = require("./next-i18next.config");
const nextConfig = {
  productionBrowserSourceMaps: false,
  experimental: {
    serverSourceMaps: false,
  },
  reactStrictMode: true,
  i18n,
  compiler: {
    // removeConsole: process.env.NODE_ENV === "production",
  },
};

module.exports = nextConfig;
