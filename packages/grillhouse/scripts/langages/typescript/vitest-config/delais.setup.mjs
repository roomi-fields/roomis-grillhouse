// A setup file of the base configuration: a test file has the delay of its size, as Bazel gives
// each test the delay of its `size`. It reads the size of the file it sets up (./delais.mjs, by the
// classification of the guard of the sizes) and gives Vitest its delay for a test and a hook.
import { vi } from 'vitest';
import { delaisSurLeDisque } from './delais.mjs';

const fichier = globalThis.__vitest_worker__?.filepath;
if (fichier) {
  const { delai } = delaisSurLeDisque(fichier);
  vi.setConfig({ testTimeout: delai, hookTimeout: delai });
}
