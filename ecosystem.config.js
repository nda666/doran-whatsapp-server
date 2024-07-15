module.exports = {
  apps: [
    {
      name: "doran-whatsapp",
      script: "./dist/src/server.js",
      env: { NODE_ENV: "production" },
      // node_args: ["--max-old-space-size=4096"],
      max_memory_restart: "600M",
    },
  ],
};
