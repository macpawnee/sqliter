const { existsSync } = require('node:fs')
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

const port = process.env.PORT || '2826'

module.exports = {
  apps: [
    {
      name: process.env.APP_NAME || 'sqliter',
      script: './sqliter',
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
