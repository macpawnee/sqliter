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

# 1. Pull the latest code. The compiled binary is not tracked in git anymore, so
#    a pull can never drop a foreign-OS binary into this directory.
echo "Pulling latest code..."
git pull

# 2. Preflight: the build needs Node (frontend), Go, and a C compiler (cgo).
if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found in PATH. Install Node.js (>= 20) on this server, then re-run ./deploy.sh" >&2
  exit 1
fi
if ! command -v go >/dev/null 2>&1; then
  echo "go not found in PATH. Install Go (>= 1.20) on this server, then re-run ./deploy.sh" >&2
  exit 1
fi
if ! command -v gcc >/dev/null 2>&1 && ! command -v cc >/dev/null 2>&1; then
  echo "No C compiler found. mattn/go-sqlite3 needs cgo: install gcc (apt install build-essential), then re-run ./deploy.sh" >&2
  exit 1
fi

# 3. Rebuild the frontend (its output is embedded into the Go binary) and the
#    binary itself. npm ci fails loudly if package.json and package-lock.json
#    disagree.
echo "Installing frontend dependencies (npm ci)..."
npm --prefix web ci

echo "Building frontend..."
npm --prefix web run build

echo "Building Go binary..."
rm -f sqliter
CGO_ENABLED=1 go build -o sqliter .

# 4. Refuse to hand PM2 a binary built for another OS. Executing e.g. a macOS
#    build on Linux makes the shell read it as a script, which shows up as
#    'Syntax error: "(" unexpected' in the PM2 logs.
binary_magic="$(head -c 4 sqliter | od -An -tx1 | tr -d ' \n')"
case "$(uname -s)" in
  Linux) expected_magic=7f454c46 ;;             # ELF
  Darwin) expected_magic=${EXPECTED_MACHO_MAGIC:-cffaedfe} ;;  # Mach-O 64-bit LE
  *) expected_magic="" ;;
esac
if [ -n "$expected_magic" ] && [ "$binary_magic" != "$expected_magic" ]; then
  echo "sqliter has magic ${binary_magic}, expected ${expected_magic} for $(uname -s)." >&2
  echo "The build produced a binary for the wrong platform." >&2
  exit 1
fi
chmod +x sqliter

# 5. Back up every SQLite database before the new code starts, so a bad deploy
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

# 6. (Re)start PM2 from the config. delete + start applies the current flags
#    (database list, port) instead of keeping a stale process definition.
echo "Restarting PM2..."
pm2 delete ecosystem.config.cjs 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

echo "Deployment complete!"
