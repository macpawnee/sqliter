#!/bin/bash
set -euo pipefail

# Read a single key from .env without executing the file (values such as
# "one.db, two.db" contain spaces, and sourcing .env would run code from it).
env_value() {
  if [ ! -f .env ]; then
    return 0
  fi
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" .env |
    tail -n 1 |
    sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

DATABASES="${SQLITER_DATABASES:-$(env_value SQLITER_DATABASES)}"
BACKUP_DIR="${SQLITER_BACKUP_DIR:-$(env_value SQLITER_BACKUP_DIR)}"

# 1. Pull the latest code
echo "Pulling latest code..."
git pull

# 2. Rebuild the frontend (its output is embedded into the Go binary) and the
#    binary itself. npm ci fails loudly if package.json and package-lock.json
#    disagree.
echo "Installing frontend dependencies (npm ci)..."
npm --prefix web ci

echo "Building frontend..."
npm --prefix web run build

echo "Building Go binary..."
go build -o sqliter .

# 3. Back up every SQLite database before the new code starts, so a bad deploy
#    can always be rolled back. Uses SQLite's online backup API (safe on a live
#    file) and keeps the newest 14 copies per database.
if command -v sqlite3 >/dev/null 2>&1; then
  backup_dir="${BACKUP_DIR:-backups}"
  mkdir -p "$backup_dir"

  IFS=',' read -ra databases <<< "$DATABASES"
  for database in "${databases[@]}"; do
    database="$(printf '%s' "$database" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    if [ -z "$database" ] || [ ! -f "$database" ]; then
      continue
    fi

    name="$(basename "$database" .db)"
    target="$backup_dir/$name-$(date +%Y%m%d-%H%M%S).db"
    sqlite3 "$database" ".backup '$target'"
    echo "  backed up $database -> $target"

    ls -1t "$backup_dir/$name"-*.db 2>/dev/null | tail -n +15 | while IFS= read -r old; do
      rm -f "$old"
    done
  done
else
  echo "sqlite3 CLI not found, skipping database backup."
fi

# 4. (Re)start PM2 from the config. delete + start applies the current flags
#    (database list, port) instead of keeping a stale process definition.
echo "Restarting PM2..."
pm2 delete ecosystem.config.cjs 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

echo "Deployment complete!"
