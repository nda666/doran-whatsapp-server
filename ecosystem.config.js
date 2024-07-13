module.exports = {
  apps: [
    {
      name: "doran-whatsapp",
      script: "./dist/src/server.js",
      env: { NODE_ENV: "production" },
    },
  ],
};
