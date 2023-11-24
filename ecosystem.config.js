module.exports = {
  apps: [
    {
      name: "doran-whatsapp",
      script: "./dist/src/server.js",
      instances: "max",
      env: { NODE_ENV: "production" },
    },
  ],
};
