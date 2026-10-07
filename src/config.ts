/**
 * Application configuration
 *
 * Centralizes all configuration from environment variables
 * with sensible defaults for development.
 */

import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenvConfig();

/**
 * Environment configuration schema
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

/**
 * Parse and validate environment variables
 */
function parseEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid environment configuration:');
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}

const env = parseEnv();

/**
 * Application configuration object
 */
export const config = {
  /** Application version from package.json */
  version: '1.0.0',

  /** Current environment */
  env: env.NODE_ENV,

  /** Is development mode */
  isDev: env.NODE_ENV === 'development',

  /** Is production mode */
  isProd: env.NODE_ENV === 'production',

  /** Is test mode */
  isTest: env.NODE_ENV === 'test',

  /** Server configuration */
  server: {
    port: env.PORT,
  },

  /** Logging configuration */
  logging: {
    level: env.LOG_LEVEL,
  },
} as const;

export type Config = typeof config;
