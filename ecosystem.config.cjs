try {
  require('dotenv').config()
} catch (err) {
  console.error('dotenv load failed:', err.message)
}

module.exports = {
  apps: [
    {
      name: process.env.APP_NAME,
      script: './.output/server/index.mjs',
      exec_mode: 'fork',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        // Pin the production port HARD — Nitro reads NITRO_PORT → PORT → 3000.
        // NOT derived from NUXT_PORT (that is the `nuxt dev` port only, and
        // dotenv never overrides an already-set var), so a git pull or deploy
        // can never move the app to another port.
        PORT: process.env.PORT,
        NITRO_PORT: process.env.PORT,
        HOST: '0.0.0.0',
      },
      max_memory_restart: '1G',
    },
  ],
}