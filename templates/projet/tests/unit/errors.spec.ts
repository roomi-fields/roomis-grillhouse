/**
 * Error classes tests
 */

import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  RateLimitError,
  ExternalServiceError,
  isOperationalError,
} from '../../src/errors.js';

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create error with default values', () => {
      const error = new AppError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
    });

    it('should create error with custom values', () => {
      const error = new AppError('Custom error', 'CUSTOM_CODE', 418, false);
      expect(error.message).toBe('Custom error');
      expect(error.code).toBe('CUSTOM_CODE');
      expect(error.statusCode).toBe(418);
      expect(error.isOperational).toBe(false);
    });

    it('should have proper stack trace', () => {
      const error = new AppError('Test');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('AppError');
    });
  });

  describe('ValidationError', () => {
    it('should create validation error', () => {
      const error = new ValidationError('Invalid input');
      expect(error.message).toBe('Invalid input');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error', () => {
      const error = new NotFoundError('User');
      expect(error.message).toBe('User not found');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
    });
  });

  describe('AuthenticationError', () => {
    it('should create authentication error with default message', () => {
      const error = new AuthenticationError();
      expect(error.message).toBe('Authentication required');
      expect(error.statusCode).toBe(401);
    });

    it('should create authentication error with custom message', () => {
      const error = new AuthenticationError('Invalid token');
      expect(error.message).toBe('Invalid token');
    });
  });

  describe('AuthorizationError', () => {
    it('should create authorization error', () => {
      const error = new AuthorizationError();
      expect(error.message).toBe('Permission denied');
      expect(error.statusCode).toBe(403);
    });
  });

  describe('ConflictError', () => {
    it('should create conflict error', () => {
      const error = new ConflictError('Resource already exists');
      expect(error.statusCode).toBe(409);
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error', () => {
      const error = new RateLimitError();
      expect(error.statusCode).toBe(429);
    });
  });

  describe('ExternalServiceError', () => {
    it('should create external service error', () => {
      const error = new ExternalServiceError('PaymentAPI');
      expect(error.message).toBe('External service error: PaymentAPI');
      expect(error.statusCode).toBe(502);
    });

    it('should include original error message', () => {
      const original = new Error('Connection timeout');
      const error = new ExternalServiceError('PaymentAPI', original);
      expect(error.message).toBe('External service error: PaymentAPI - Connection timeout');
    });
  });

  describe('isOperationalError', () => {
    it('should return true for operational errors', () => {
      const error = new AppError('Test', 'TEST', 400, true);
      expect(isOperationalError(error)).toBe(true);
    });

    it('should return false for non-operational errors', () => {
      const error = new AppError('Test', 'TEST', 500, false);
      expect(isOperationalError(error)).toBe(false);
    });

    it('should return false for standard errors', () => {
      const error = new Error('Standard error');
      expect(isOperationalError(error)).toBe(false);
    });

    it('should return false for non-error values', () => {
      expect(isOperationalError(null)).toBe(false);
      expect(isOperationalError(undefined)).toBe(false);
      expect(isOperationalError('string')).toBe(false);
    });
  });
});
