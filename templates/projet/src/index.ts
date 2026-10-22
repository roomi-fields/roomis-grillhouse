#!/usr/bin/env node
/**
 * Main entry point
 *
 * @packageDocumentation
 */

import { config } from './config.js';
import { logger } from './utils/logger.js';

/**
 * Main application function
 */
function main(): void {
  logger.info('Application starting...', { version: config.version });

  try {
    // Initialize your application here
    logger.info('Application started successfully');

    // Keep the process running (remove if not needed)
    // await new Promise(() => {});
  } catch (error) {
    logger.error('Application failed to start', { error });
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down...');
  process.exit(0);
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
});

// Run main
main();
