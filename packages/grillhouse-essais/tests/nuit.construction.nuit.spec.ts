// The night builds the frame's package before the full pass, in a repository of trial that carries
// the package (or not), with fake npm, npx and turbo that write each call to one log, in order,
// beside the line the laying of the Temporal program writes.
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const CADRE = path.resolve(__dirname, '../../grillhouse');
const NUIT = path.join(CADRE, 'scripts/nuit.sh');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'nuit-construction-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// The night of a repository of trial; <porteLeCadre> says whether @roomi-fields/grillhouse is a
// package of the repository; <construction> fails the build when 'echoue'.
function nuitDeConstruction(porteLeCadre: boolean, construction: 'reussit' | 'echoue' = 'reussit') {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  writeFileSync(
    path.join(racine, 'package.json'),
    JSON.stringify({ name: 'essai', private: true, workspaces: ['packages/*'] })
  );
  if (porteLeCadre) {
    mkdirSync(path.join(racine, 'packages/grillhouse'), { recursive: true });
    writeFileSync(
      path.join(racine, 'packages/grillhouse/package.json'),
      JSON.stringify({
        name: '@roomi-fields/grillhouse',
        version: '0.0.0',
        scripts: { build: 'true' },
      })
    );
  }
  const git = (...a: string[]) => {
    const r = spawnSync('git', ['-C', racine, ...a], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
  };
  git('init', '-q');
  git('add', '.');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'un');

  const bin = `${racine}-bin`;
  mkdirSync(bin);
  const journal = `${racine}-appels`;
  const lanceur = (nom: string) => [
    '#!/bin/sh',
    `printf '%s\\n' "${nom} $*" >> '${journal}'`,
    construction === 'echoue'
      ? `case " $* " in *" build "*|*" build:"*) echo 'construction refusée' >&2; exit 1;; esac`
      : '',
    'exit 0',
    '',
  ];
  for (const nom of ['npm', 'npx', 'turbo']) {
    writeFileSync(path.join(bin, nom), lanceur(nom).join('\n'));
    chmodSync(path.join(bin, nom), 0o755);
  }
  writeFileSync(path.join(bin, 'bd'), '#!/bin/sh\necho "[]"\n');
  chmodSync(path.join(bin, 'bd'), 0o755);
  writeFileSync(
    path.join(bin, 'node'),
    [
      '#!/bin/sh',
      'if [ "${1##*/}" = "grillhouse.mjs" ]; then',
      `  if [ "$*" = "$1 temporal installer --programme-seul" ]; then printf '%s\\n' POSE >> '${journal}'; echo '${path.join(ESSAIS, 'temporal')}'; fi`,
      '  exit 0',
      'fi',
      `exec '${process.execPath}' "$@"`,
      '',
    ].join('\n')
  );
  chmodSync(path.join(bin, 'node'), 0o755);

  const env: Record<string, string | undefined> = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
  };
  delete env.TEMPORAL;
  const r = spawnSync('bash', [NUIT], { cwd: racine, encoding: 'utf8', timeout: 120_000, env });
  const dossier = path.join(racine, '.git', 'nuit');
  const texte = existsSync(dossier)
    ? readdirSync(dossier)
        .filter(f => f.endsWith('.log'))
        .map(f => readFileSync(path.join(dossier, f), 'utf8'))
        .join('\n')
    : '';
  const appels = existsSync(journal)
    ? readFileSync(journal, 'utf8').split('\n').filter(Boolean)
    : [];
  const construit = (l: string) => /\bbuild\b/.test(l);
  const passe = (l: string) => /\bverifier\b/.test(l);
  return {
    code: r.status,
    sortie: `${texte}\n${r.stdout}\n${r.stderr}`,
    appels,
    pose: appels.indexOf('POSE'),
    constructions: appels.filter(construit),
    premiereConstruction: appels.findIndex(construit),
    passe: appels.findIndex(passe),
  };
}

describe('the night builds the frame’s package once, before the full pass', () => {
  it('builds the package after laying the Temporal program down and before the full pass, once', () => {
    const r = nuitDeConstruction(true);
    expect(r.code, r.sortie).toBe(0);
    expect(r.constructions).toHaveLength(1);
    expect(r.constructions[0]).toContain('@roomi-fields/grillhouse');
    expect(r.pose).toBeGreaterThanOrEqual(0);
    expect(r.premiereConstruction).toBeGreaterThan(r.pose);
    expect(r.passe).toBeGreaterThan(r.premiereConstruction);
  });

  it('plays no build in a project that installs the frame instead of carrying its package', () => {
    const r = nuitDeConstruction(false);
    expect(r.code, r.sortie).toBe(0);
    expect(r.constructions).toEqual([]);
    expect(r.passe).toBeGreaterThanOrEqual(0);
  });

  it('a build that fails turns the night red before the pass, a line naming the build, nothing played', () => {
    const r = nuitDeConstruction(true, 'echoue');
    expect(r.code).toBe(1);
    expect(r.sortie).toMatch(/✗ la construction du paquet/);
    expect(r.passe).toBe(-1);
  });
});
