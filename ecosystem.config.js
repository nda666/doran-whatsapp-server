module.exports = {
  apps: [
    {
      name: "doran-whatsapp",
      script: "./dist/src/server.js",
      instances: "max",
      exec_mode: "cluster",
      env: { NODE_ENV: "production" },
    },
  ],
};
