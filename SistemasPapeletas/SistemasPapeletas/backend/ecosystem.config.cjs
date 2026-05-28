const appBasePath = String(process.env.PM2_APP_BASE_PATH || '').trim();

module.exports = {
  apps: [
    {
      name: 'papeletas-api',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
        ...(appBasePath ? { APP_BASE_PATH: appBasePath } : {})
      }
    }
  ]
};
