/**
 * Type definitions
 *
 * Export all shared types from this module.
 */

/**
 * Generic result type for operations that can fail
 */
export type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E };

/**
 * Create a success result
 */
export function success<T>(data: T): Result<T, never> {
  return { success: true, data };
}

/**
 * Create a failure result
 */
export function failure<E>(error: E): Result<never, E> {
  return { success: false, error };
}
