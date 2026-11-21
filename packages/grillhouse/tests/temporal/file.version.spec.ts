// The activity of the queue that reads the version of the tool of the package that carries the
// worker running it (src/temporal/file/activites.ts): the `version` of that package's package.json,
// the same file the installation reads for the installed version.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lireLaVersionDeLOutil } from '../../src/temporal/file/activites.js';

const PACKAGE_JSON = new URL('../../package.json', import.meta.url);

describe('the version of the tool the queue starts under', () => {
  it('is the version of the package that carries the worker, read in its package.json', async () => {
    const attendue = (JSON.parse(readFileSync(PACKAGE_JSON, 'utf8')) as { version: string })
      .version;
    expect(await lireLaVersionDeLOutil()).toBe(attendue);
  });
});
