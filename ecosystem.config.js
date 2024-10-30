module.exports = {
  apps: [
    {
      name: "doran-whatsapp",
      script: "./dist/src/server/index.js",
      env: {
        NODE_ENV: "production",
        WHATSAPP_AUTH_FOLDER: "./storage/whatsapp-auth",
        WHATSAPP_LOG: "./storage/logs/whatsapp-logs",
        WEBSITE_LOG: "./storage/logs/website",
      },
      node_args: ["--max-old-space-size=4096"],
      // node_args: ["--max-old-space-size=1024"],
      // max_memory_restart: "2000M",
    },
  ],
};
