/**
 * Test setup file
 *
 * This file is loaded before all tests.
 * Configure global test utilities and mocks here.
 */

import { beforeAll, afterAll, afterEach } from 'vitest';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

/**
 * Global setup - runs once before all tests
 */
beforeAll(async () => {
  // Initialize test database, mock servers, etc.
});

/**
 * Global teardown - runs once after all tests
 */
afterAll(async () => {
  // Cleanup test database, close connections, etc.
});

/**
 * Reset after each test
 */
afterEach(() => {
  // Reset mocks, clear state, etc.
});
