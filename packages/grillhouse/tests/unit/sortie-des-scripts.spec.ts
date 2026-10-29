import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const RACINE = path.resolve(__dirname, '../../../..');

// One file of ESLint's JSON report.
interface Rapport {
  filePath: string;
  messages: { line: number; message: string }[];
}

// Witness: BPScript, `node scripts/langages/typescript/index-interfaces.mjs --publie <composant>` read through a pipe
// stopped at 65 536 bytes of 149 340. Towards a pipe, Node writes what the pipe's buffer holds at
// once and queues the rest; `process.exit` ends the process before the queue drains, and the end
// of the output is lost. A script of the frame sets `process.exitCode` and lets Node drain its
// output, as ESLint's rule `no-process-exit` asks.
describe('the scripts of the frame and their exit', () => {
  it('no script of the frame calls process.exit', () => {
    const r = spawnSync(
      'npx',
      [
        '--no-install',
        'eslint',
        '--no-eslintrc',
        '--env',
        'node,es2022',
        '--parser-options',
        'ecmaVersion:latest,sourceType:module',
        '--rule',
        'no-process-exit: error',
        '--format',
        'json',
        'packages/grillhouse/scripts/**/*.mjs',
        'packages/grillhouse/bin/*.mjs',
      ],
      { cwd: RACINE, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    );
    expect(r.stdout, r.stderr).toMatch(/^\[/);
    const rapports = JSON.parse(r.stdout) as Rapport[];
    expect(rapports.length).toBeGreaterThan(0);
    const appels = rapports.flatMap(f =>
      f.messages.map(m => `${path.relative(RACINE, f.filePath)}:${m.line} ${m.message}`)
    );
    expect(appels).toEqual([]);
  });
});
