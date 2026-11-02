// grillhouse-9tu: the tool installed in the cache stands alone, as a stage0 brings its library: the
// module of language, run from an installation of the cache without a parent node_modules,
// computes the elements of a lot on a trial repository (the review of the lot: without the peer
// dependencies of the package, « Cannot find module 'typescript' », and the pass of architecture
// was lost). A night test: it mounts a trial repository.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { declarerLeLangage } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { describe, expect, it } from 'vitest';
import { installer } from '../../scripts/aiguillage.mjs';
import { dossier, fauxNpm } from './outil-essai.js';

describe('the published version installed in the cache', () => {
  it('the module of language runs from an installation of the cache, without a parent node_modules, and computes the elements of a lot', () => {
    const cache = dossier('cache');
    const journal = path.join(dossier('journal'), 'npm.log');
    const { dossier: d } = installer('2.0.4', { cache, npm: fauxNpm(journal, { copie: true }) });
    const p = dossier('lot');
    const git = (...a: string[]) =>
      spawnSync('git', ['-C', p, '-c', 'user.name=e', '-c', 'user.email=e@e', ...a], {
        encoding: 'utf8',
      });
    git('init', '-q');
    declarerLeLangage(p);
    mkdirSync(path.join(p, 'src'));
    writeFileSync(path.join(p, 'src/a.ts'), 'export const a = 1;\n');
    git('add', '-A');
    git('commit', '-qm', 'a');
    writeFileSync(path.join(p, 'src/a.ts'), 'export const a = 2;\n');
    git('commit', '-qam', 'b');
    const langages = path.join(d, 'node_modules/@roomi-fields/grillhouse/scripts/langages.mjs');
    const r = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `const { langageDe } = await import(${JSON.stringify(`file://${langages}`)});
const r = langageDe(process.argv[1]).elementsDuLot(process.argv[1], { avant: 'HEAD~1', apres: 'HEAD' });
process.stdout.write(JSON.stringify({ etat: r.etat, raison: r.raison }));`,
        p,
      ],
      { cwd: p, encoding: 'utf8', timeout: 30_000 }
    );
    expect(JSON.parse(r.stdout || '{}'), r.stderr).toEqual({ etat: 'fait', raison: null });
  });
});
