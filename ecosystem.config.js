module.exports = {
  apps: [
    {
      name: "doran-whatsapp",
      script: "./dist/src/server.js",
      env: { NODE_ENV: "production" },
      node_args: ["--max-old-space-size=1024"],
      max_memory_restart: "600M",
    },
  ],
};
