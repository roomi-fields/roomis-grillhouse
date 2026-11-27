// The verification pass (scripts/langages/typescript/verifier.mjs, `verifier`) gives the tasks of
// Turborepo a fingerprint of the list of the files of the index (`GRILLHOUSE_INDEX_DU_DEPOT`),
// which the guard tasks declare: Turborepo hashes an untracked file as a tracked one, so a green
// played before a file entered the index would otherwise be read back from the cache.
//
// Medium tests: the pass called in this process on a repository of trial, the real git, and a fake
// `turbo` that writes the variable it receives.
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
// @ts-expect-error — module .mjs sans déclaration de types
import { verifier } from '../../../../scripts/langages/typescript/verifier.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'verifier-index-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const BIN = path.join(ESSAIS, 'bin');
mkdirSync(BIN);
writeFileSync(
  path.join(BIN, 'turbo'),
  `#!/usr/bin/env node
require('node:fs').writeFileSync(
  process.env.FAUX_TURBO_SORTIE,
  JSON.stringify({ empreinte: process.env.GRILLHOUSE_INDEX_DU_DEPOT ?? null })
);
`
);
chmodSync(path.join(BIN, 'turbo'), 0o755);

function depot() {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  const git = (...a: string[]) => {
    const r = spawnSync('git', ['-C', racine, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
      encoding: 'utf8',
    });
    if (r.status !== 0) {
      throw new Error(`git ${a.join(' ')} : ${r.stderr}`);
    }
  };
  const ecrire = (f: string, texte: string) => writeFileSync(path.join(racine, f), texte);
  git('init', '-q', '-b', 'main');
  ecrire('package.json', '{ "name": "essai", "private": true }\n');
  ecrire('suivi.txt', 'un\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'départ');
  return { racine, git, ecrire };
}

/** The fingerprint the tasks of a pass in `racine`, asked with `args`, receive. */
function empreinte(racine: string, args: string[], env: Record<string, string> = {}) {
  const sortie = path.join(mkdtempSync(path.join(ESSAIS, 'sortie-')), 'recu.json');
  const lignes: string[] = [];
  const code = (verifier as (o: object) => number)({
    racine,
    args,
    env: {
      ...process.env,
      ...env,
      PATH: `${BIN}${path.delimiter}${process.env.PATH ?? ''}`,
      FAUX_TURBO_SORTIE: sortie,
      GRILLHOUSE_MESURE_D_ESSAI: JSON.stringify({
        coeurs: 12,
        charge: 1,
        memoireLibre: 16 * 1024 ** 3,
        memoireTotale: 32 * 1024 ** 3,
      }),
    },
    dire: (l: string) => lignes.push(l),
  });
  expect(code, lignes.join('\n')).toBe(0);
  return (JSON.parse(readFileSync(sortie, 'utf8')) as { empreinte: string | null }).empreinte;
}

describe.each([
  ['the complete verification', []],
  ['the guards alone', ['--gardes']],
])('the fingerprint of the index that %s gives its tasks', (_, args) => {
  it('changes when a file enters the index, its content unchanged', () => {
    const d = depot();
    d.ecrire('neuf.txt', 'neuf\n');
    const avant = empreinte(d.racine, args);
    d.git('add', 'neuf.txt');
    const apres = empreinte(d.racine, args);
    expect(avant).toEqual(expect.stringMatching(/\S/));
    expect(apres).toEqual(expect.stringMatching(/\S/));
    expect(apres).not.toBe(avant);
  });

  it('changes when a file leaves the index, and comes back with the same list', () => {
    const d = depot();
    const avec = empreinte(d.racine, args);
    d.git('rm', '-q', '--cached', 'suivi.txt');
    expect(empreinte(d.racine, args)).not.toBe(avec);
    d.git('add', 'suivi.txt');
    expect(empreinte(d.racine, args)).toBe(avec);
  });

  it('stays the same while the list of the files does not change, whatever their content', () => {
    const d = depot();
    const avant = empreinte(d.racine, args);
    d.ecrire('suivi.txt', 'deux\n');
    d.ecrire('libre.txt', 'non suivi\n');
    expect(empreinte(d.racine, args)).toBe(avant);
    d.git('add', 'suivi.txt');
    expect(empreinte(d.racine, args)).toBe(avant);
    expect(avant).toEqual(expect.stringMatching(/\S/));
  });

  it('is that of the index of the repository, not the one the caller of the pass inherited', () => {
    const d = depot();
    const lue = empreinte(d.racine, args);
    expect(empreinte(d.racine, args, { GRILLHOUSE_INDEX_DU_DEPOT: 'héritée' })).toBe(lue);
    expect(lue).toEqual(expect.stringMatching(/\S/));
  });
});
