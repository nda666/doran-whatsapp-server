module.exports = {
  apps: [
    {
      name: "doran-whatsapp",
      script: "./dist/src/server/index.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        WHATSAPP_AUTH_FOLDER: "./storage/whatsapp-auth",
        WHATSAPP_LOG: "./storage/logs/whatsapp-logs",
        WEBSITE_LOG: "./storage/logs/website",
      },
      node_args: [
        "--http-server-default-timeout=0",
        "--max-old-space-size=4096",
      ],
      max_memory_restart: "4500M",
    },
  ],
};
