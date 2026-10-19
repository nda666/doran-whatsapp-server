module.exports = {
  apps: [
    {
      name: "doran-whatsapp",
      script: "./dist/src/server/index.js",
      interpreter: process.env.DORAN_NODE_PATH || "/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin/node",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      exp_backoff_restart_delay: 1000,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      kill_timeout: 65000,
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        // Keep server-side authentication requests off the public CDN path.
        NEXTAUTH_URL_INTERNAL: "http://127.0.0.1:3000",
        WHATSAPP_ENABLED: "true",
        QUEUE_ENABLED: "false",
        DISPATCH_QUEUE_ENABLED: "true",
        DISPATCH_CONCURRENCY: "32",
        DISPATCH_INTERVAL_MIN_MS: "2000",
        DISPATCH_INTERVAL_MAX_MS: "5000",
        WHATSAPP_AUTH_FOLDER: "./storage/whatsapp-auth",
        WHATSAPP_LOG: "./storage/logs/whatsapp-logs",
        WEBSITE_LOG: "./storage/logs/website",
      },
      node_args: [
        // Keep memory limits above observed use; RSS also includes media buffers.
        "--max-old-space-size=4096",
      ],
      max_memory_restart: "6144M",
    },
  ],
};
