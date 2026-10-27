#!/usr/bin/env bash
# Run on the EC2 box from the app directory: ./scripts/deploy.sh
# Expects .env.local (production values) next to package.json.
set -euo pipefail

cd "$(dirname "$0")/.."

git pull --ff-only
pnpm install --frozen-lockfile
pnpm build
pnpm db:migrate

if pm2 describe web > /dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
  pm2 save
fi
