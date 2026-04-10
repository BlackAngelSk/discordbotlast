module.exports = {
  apps: [
    {
      name: "discord-bot",
      script: "index.js",
      cwd: __dirname,
      node_args: "--no-deprecation",
      autorestart: true,
      watch: false,
      max_restarts: 50,
      exp_backoff_restart_delay: 200,
      restart_delay: 5000,
      min_uptime: "10s",
      max_memory_restart: "900M",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
