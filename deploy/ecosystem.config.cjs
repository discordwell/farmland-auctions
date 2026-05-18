module.exports = {
  apps: [
    {
      name: "farmauction-api",
      cwd: "/opt/farmauction/app",
      script: "dist-api/server/index.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
