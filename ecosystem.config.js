module.exports = {
  apps: [
    {
      name: "doran-whatsapp",
      script: "./dist/src/server/index.js",
      instances: 4,
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        WHATSAPP_AUTH_FOLDER: "./storage/whatsapp-auth",
        WHATSAPP_LOG: "./storage/logs/whatsapp-logs",
        WEBSITE_LOG: "./storage/logs/website",
      },
      node_args: ["--max-old-space-size=2048"],
      // node_args: ["--max-old-space-size=1024"],
      max_memory_restart: "10G",
    },
  ],
};
