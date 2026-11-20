import { createRequire } from 'node:module';
import path from 'node:path';
import type { Langage } from '../../../../scripts/jointure.js';

// The module c and its entries of conformity, loaded at the first use and not at the import of a
// test file: a test file loads whatever the module holds, and each test judges what it asks of it.
const requis = createRequire(__filename);

function paresseux<T extends object>(rel: string): T {
  let charge: T | undefined;
  const lire = () => (charge ??= (requis(path.resolve(__dirname, rel)) as { default: T }).default);
  return new Proxy({} as T, {
    get: (_, cle) => (lire() as Record<string | symbol, unknown>)[cle],
    ownKeys: () => Reflect.ownKeys(lire()),
    getOwnPropertyDescriptor: (_, cle) => ({
      enumerable: true,
      configurable: true,
      value: (lire() as Record<string | symbol, unknown>)[cle],
    }),
    has: (_, cle) => cle in lire(),
  });
}

/** The module of language c (scripts/langages/c/index.mjs). */
export const moduleC = paresseux<Langage>('../../../../scripts/langages/c/index.mjs');
/** Its entries of the suite of conformity (scripts/langages/c/exemples.mjs). */
export const exemplesC = paresseux<object>('../../../../scripts/langages/c/exemples.mjs');
