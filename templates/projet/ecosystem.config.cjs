/**
 * PM2 Ecosystem Configuration
 *
 * This file configures PM2 for running the application as a background daemon.
 *
 * Usage:
 *   npm run daemon:start   - Start the daemon
 *   npm run daemon:stop    - Stop the daemon
 *   npm run daemon:restart - Restart the daemon
 *   npm run daemon:logs    - View logs
 *   npm run daemon:status  - Check status
 *   npm run daemon:delete  - Remove from PM2
 *
 * @see https://pm2.keymetrics.io/docs/usage/application-declaration/
 */

module.exports = {
  apps: [
    {
      // Application name (used in PM2 commands)
      name: 'project-name',

      // Entry point script
      script: 'dist/index.js',

      // Working directory
      cwd: __dirname,

      // Process mode: 'fork' for single instance, 'cluster' for multiple
      exec_mode: 'fork',
      instances: 1,

      // Auto-restart configuration
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',

      // Restart delay strategy
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      restart_delay: 3000,

      // Environment variables
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000
      },

      // Logging configuration
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      merge_logs: true,

      // Process identification
      pid_file: 'logs/pm2.pid',

      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 10000,

      // Health monitoring
      min_uptime: '10s',

      // Node.js specific
      node_args: '--enable-source-maps'
    }
  ]
};
