// The types of ./mesure.mjs, for a strict TypeScript test that imports
// `@roomi-fields/grillhouse/vitest-config/mesure`.
import type { TestContext } from 'vitest';

// Marks the test of <ctx> as a measure of time and gives back what <fn> returns.
export declare function mesurerAuRepos<T>(ctx: TestContext, fn: () => T): T;
