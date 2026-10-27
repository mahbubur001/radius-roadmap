// pm2 process file for the EC2 box: `pm2 start ecosystem.config.cjs`.
// Both apps read env from /srv/radius-roadmap/.env.local (see scripts/deploy.sh).
module.exports = {
  apps: [
    {
      name: "web",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      node_args: "--env-file-if-exists=.env.local",
      instances: 1,
      max_memory_restart: "1G",
      env: { NODE_ENV: "production" },
    },
    {
      name: "worker",
      script: "dist/worker.js",
      node_args: "--env-file-if-exists=.env.local",
      instances: 1,
      max_memory_restart: "512M",
      kill_timeout: 30_000,
      env: { NODE_ENV: "production" },
    },
  ],
};
