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

/**
 * Async function type helper
 */
export type AsyncFunction<T = void> = () => Promise<T>;

/**
 * Dictionary type helper
 */
export type Dictionary<T> = Record<string, T>;

/**
 * Make specific properties optional
 */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Make specific properties required
 */
export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

/**
 * Extract non-nullable type
 */
export type NonNullableFields<T> = {
  [K in keyof T]: NonNullable<T[K]>;
};
