// PM2 process manager configuration
// Used on both plain Linux and Plesk VPS
module.exports = {
  apps: [{
    name: 'fah-stats',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '256M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      SMTP_HOST: 'localhost',
      SMTP_PORT: '25',
      SMTP_FROM: 'noreply@fof-stats.de',
      MILESTONE_NOTIFY_EMAIL: 'admin@fof-stats.de',
    },
  }],
};
