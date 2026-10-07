/**
 * Types module tests
 */

import { describe, it, expect } from 'vitest';
import { success, failure, type Result } from '../../src/types/index.js';

describe('Types', () => {
  describe('Result type', () => {
    describe('success', () => {
      it('should create a success result', () => {
        const result = success(42);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(42);
        }
      });

      it('should work with objects', () => {
        const data = { id: 1, name: 'Test' };
        const result = success(data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual(data);
        }
      });

      it('should work with arrays', () => {
        const data = [1, 2, 3];
        const result = success(data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual(data);
        }
      });
    });

    describe('failure', () => {
      it('should create a failure result', () => {
        const error = new Error('Something went wrong');
        const result = failure(error);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe(error);
        }
      });

      it('should work with custom error types', () => {
        const customError = { code: 'CUSTOM', message: 'Custom error' };
        const result = failure(customError);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toEqual(customError);
        }
      });
    });

    describe('type narrowing', () => {
      it('should narrow types correctly', () => {
        function processResult(result: Result<number, string>): string {
          if (result.success) {
            return `Value: ${result.data}`;
          } else {
            return `Error: ${result.error}`;
          }
        }

        expect(processResult(success(42))).toBe('Value: 42');
        expect(processResult(failure('oops'))).toBe('Error: oops');
      });
    });
  });
});
