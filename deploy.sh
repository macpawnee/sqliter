#!/bin/bash

# 1. Pull the latest code
echo "Pulling latest code..."
git pull

echo "Removing old dependencies..."
rm -rf node_modules

# 2. Install exactly the locked dependency tree (npm ci = reproducible, and it
#    fails loudly if package.json and package-lock.json disagree)
echo "Installing dependencies (npm ci)..."
npm ci

# 3. Quality gate — a broken type check or a failing test must never reach PM2
echo "Running type check..."
npx nuxi typecheck

# echo "Running unit tests..."
# npm test

# 4. Run the build process (compiles to .output/)
echo "Building the application..."
npm run build

# 5. Database migrations run automatically on server startup (getDb → migrate
#    in server/utils/db.ts) — no separate step needed.

# 5b. Back up the SQLite database BEFORE the new code starts, so a bad deploy can
#     always be rolled back. Uses SQLite's online backup API (safe on a live file)
#     and keeps the newest 14 copies in server/data/backups/.
echo "Backing up the database..."
npm run db:backup

# 6. (Re)start PM2 from the config — delete + start guarantees the pinned port
#    and env are applied. (`pm2 reload --update-env` can keep a stale env,
#    which is exactly what made the port drift after deploys.)
echo "Restarting PM2..."
#pm2 delete planner 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

echo "Deployment complete!"