module.exports = {
  apps: [
    {
      name: 'leadsgetter-backend',
      script: 'src/server.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'development',
      },
      // pm2 start ecosystem.config.cjs --env production
      env_production: {
        NODE_ENV: 'production',
        PORT: 3010,
      },
    },
  ],
};
