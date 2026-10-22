/**
 * Config module tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset modules to get fresh config
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('environment detection', () => {
    it('should default to development', async () => {
      delete process.env.NODE_ENV;
      const { config } = await import('../../src/config.js');
      expect(config.isDev).toBe(true);
    });

    it('should detect production environment', async () => {
      process.env.NODE_ENV = 'production';
      const { config } = await import('../../src/config.js');
      expect(config.isProd).toBe(true);
      expect(config.isDev).toBe(false);
    });

    it('should detect test environment', async () => {
      process.env.NODE_ENV = 'test';
      const { config } = await import('../../src/config.js');
      expect(config.isTest).toBe(true);
    });
  });

  describe('server configuration', () => {
    it('should use default port', async () => {
      delete process.env.PORT;
      const { config } = await import('../../src/config.js');
      expect(config.server.port).toBe(3000);
    });

    it('should use custom port from environment', async () => {
      process.env.PORT = '8080';
      const { config } = await import('../../src/config.js');
      expect(config.server.port).toBe(8080);
    });
  });

  describe('logging configuration', () => {
    it('should default to info log level', async () => {
      delete process.env.LOG_LEVEL;
      const { config } = await import('../../src/config.js');
      expect(config.logging.level).toBe('info');
    });

    it('should use custom log level', async () => {
      process.env.LOG_LEVEL = 'debug';
      const { config } = await import('../../src/config.js');
      expect(config.logging.level).toBe('debug');
    });
  });
});
