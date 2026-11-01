const { existsSync, readFileSync, statSync } = require('node:fs')
const { join } = require('node:path')

// Node >= 20.12 reads .env natively (process.loadEnvFile), so dotenv is not a
// dependency anymore. The old `require('dotenv')` is what printed
// "dotenv load failed: Cannot find module 'dotenv'" — dotenv was never
// installed in this Go project.
const envFile = join(__dirname, '.env')
if (existsSync(envFile) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envFile)
}

// Comma-separated list of SQLite files; each one becomes a --db flag, so the
// header dropdown in the web UI can switch between them.
function databasesFromEnv() {
  const databases = (process.env.SQLITER_DATABASES || '')
    .split(',')
    .map((database) => database.trim())
    .filter(Boolean)

  if (databases.length === 0) {
    throw new Error(
      'SQLITER_DATABASES is empty. Set it in .env, e.g. SQLITER_DATABASES=/data/one.db,/data/two.db'
    )
  }

  return databases
}

// The binary must match this machine's format. Running a macOS (Mach-O) build on
// Linux makes the shell fall back to interpreting the binary as a script, which
// surfaces as 'Syntax error: "(" unexpected'. Fail here with an actionable
// message instead of letting PM2 crash-loop.
const BINARY_MAGIC = {
  linux: ['7f454c46'], // ELF
  darwin: ['cffaedfe', 'cefaedfe', 'feedface', 'feedfacf'], // Mach-O
  win32: ['4d5a'], // MZ
}

function assertRunnableBinary(binary) {
  if (!existsSync(binary)) {
    throw new Error(
      `${binary} is missing. Build it first: go build -o sqliter .  (or run ./deploy.sh)`
    )
  }

  const magic = readFileSync(binary).subarray(0, 4).toString('hex')
  const expected = BINARY_MAGIC[process.platform]
  if (expected && !expected.includes(magic)) {
    throw new Error(
      `${binary} is not a ${process.platform} executable (magic ${magic}). ` +
        'It was built for another OS (or committed by mistake) — rebuild it on this machine with ./deploy.sh'
    )
  }

  if ((statSync(binary).mode & 0o111) === 0) {
    throw new Error(`${binary} is not executable. Run: chmod +x sqliter`)
  }
}

const port = process.env.PORT || '2826'
const script = join(__dirname, 'sqliter')
assertRunnableBinary(script)

module.exports = {
  apps: [
    {
      name: process.env.APP_NAME || 'sqliter',
      script,
      // sqliter is a compiled Go binary, not a Node script.
      interpreter: 'none',
      args: [...databasesFromEnv().flatMap((database) => ['--db', database]), '--port', port],
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '1G',
    },
  ],
}
