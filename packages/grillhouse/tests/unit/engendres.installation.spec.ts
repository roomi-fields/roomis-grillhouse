// `installerEtRegenerer` (scripts/engendres.mjs), which the integration and the queue play in
// their copy: the lock file, main's version left there, is written again from the manifests of the
// lot before the install, which `npm ci` would otherwise refuse (« Missing: … from lock file »),
// and the other generated files play after the install.
//
// A directory of two packages of workspaces, npm real and offline (no registry).
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { installerEtRegenerer } from '../../scripts/engendres.mjs';
import { COMMANDE } from '../../scripts/langages/typescript/verrou-des-dependances.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'engendres-installation-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const VERROU = { nom: 'le verrou', commande: COMMANDE, fichiers: ['package-lock.json'] };
// A generated file that reads what the install lays down, declared before the lock.
const APRES = {
  nom: "l'index",
  commande: 'ls node_modules > index.txt',
  fichiers: ['index.txt'],
};

// The copy as the integration leaves it before the install: the manifests of a lot that renames
// `synthhub-outils`, which `site` depends on, beside main's lock file.
function copie() {
  const dossier = mkdtempSync(path.join(ESSAIS, 'copie-'));
  const env = {
    ...process.env,
    npm_config_offline: 'true',
    npm_config_cache: path.join(ESSAIS, 'cache-npm'),
  };
  const lancer = (commande: string) =>
    spawnSync('sh', ['-c', commande], { cwd: dossier, encoding: 'utf8', env });
  const ecrire = (f: string, v: unknown) => {
    mkdirSync(path.dirname(path.join(dossier, f)), { recursive: true });
    writeFileSync(path.join(dossier, f), JSON.stringify(v));
  };
  const paquets = (outils: string) => {
    ecrire('packages/outils/package.json', { name: outils, version: '1.0.0' });
    ecrire('packages/site/package.json', {
      name: 'site',
      version: '1.0.0',
      dependencies: { [outils]: '*' },
    });
  };
  ecrire('package.json', { name: 'essai', private: true, workspaces: ['packages/*'] });
  paquets('synthhub-outils');
  expect(lancer(COMMANDE).status).toBe(0);
  paquets('synthub-outils');
  const installer = () => {
    const r = lancer('npm ci --no-audit --no-fund');
    return r.status === 0 ? null : r.stderr;
  };
  // git in the copy, of which the regeneration reads the state: nothing to stage here.
  const dansCopie = () => spawnSync('true', [], { encoding: 'utf8' });
  const verrou = () => readFileSync(path.join(dossier, 'package-lock.json'), 'utf8');
  return {
    lancer,
    installer,
    dansCopie,
    verrou,
    /* the commands' output, unread */ ecrire: () => {},
  };
}

describe('l’installation de la copie où un lot est appliqué', () => {
  it('suit le verrou régénéré depuis les manifestes du lot, que main ne connaît pas', () => {
    const c = copie();
    expect(c.installer()).toMatch(/Missing: synthub-outils@.* from lock file/);

    expect(installerEtRegenerer({ ...c, refs: [APRES, VERROU] })).toEqual({});

    expect(c.verrou()).toContain('synthub-outils');
    expect(c.verrou()).not.toContain('synthhub-outils');
    expect(c.lancer('cat index.txt').stdout).toContain('synthub-outils');
  }, 60_000);

  it('rend le refus de l’installation, sans jouer ce qui la suit', () => {
    const c = copie();

    expect(installerEtRegenerer({ ...c, refs: [APRES] })).toEqual({
      installation: expect.stringContaining('from lock file') as string,
    });

    expect(c.lancer('cat index.txt').status).not.toBe(0);
  }, 60_000);

  it('rend le refus d’une commande du projet, avant l’installation pour celle du verrou', () => {
    const c = copie();

    const r = installerEtRegenerer({ ...c, refs: [{ ...VERROU, commande: 'exit 3' }] });

    expect(r.refus).toContain('rend le code 3');
    expect(r.installation).toBeUndefined();
  }, 60_000);
});
