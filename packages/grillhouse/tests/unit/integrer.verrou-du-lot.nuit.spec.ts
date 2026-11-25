// A lot that renames a package of the workspaces, its lock file right, enters through the two
// places that replay a lot on the main of the moment: the integration
// (scripts/integration/integrer.mjs) and the queue (scripts/integration/file.mjs). Both leave
// main's lock file in the copy where a generated file writes it in full, so the lock is written
// again from the lot's manifests before the install, which `npm ci` would otherwise refuse
// (« Missing: … from lock file »).
//
// A night test: it mounts trial repositories and plays the integration and the queue on them,
// git and npm real and offline (the packages of the workspaces alone, no registry); Beads is a
// stand-in.
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { preparerLaBranche } from '../../scripts/integration/file.mjs';
import { main } from '../../scripts/integration/integrer.mjs';
import { COMMANDE } from '../../scripts/langages/typescript/verrou-des-dependances.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'verrou-du-lot-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const VERROU = {
  commande: COMMANDE,
  fichiers: ['package-lock.json'],
  lit: ['package.json', '**/package.json'],
};

const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;

// A repository of two packages of workspaces, `site` depending on `outils`, its lock file written
// by npm; `renommer` renames `outils` and writes the lock again, as the lot of a ticket does.
function depot(grillhouse: Record<string, unknown> = {}) {
  vi.stubEnv('npm_config_offline', 'true');
  vi.stubEnv('npm_config_cache', path.join(ESSAIS, 'cache-npm'));
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  const git = (...a: string[]) => execFileSync('git', ['-C', racine, ...a], { encoding: 'utf8' });
  const ecrire = (f: string, t: string) => {
    mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
    writeFileSync(path.join(racine, f), t);
  };
  const verrouiller = () =>
    execFileSync('npm', COMMANDE.split(' ').slice(1), { cwd: racine, stdio: 'pipe' });
  // The name and the version of `outils` stand apart in its manifest and next to each other in
  // the lock file: a change of each side conflicts in the lock file alone.
  const paquets = (outils: string, version = '1.0.0') => {
    ecrire(
      'packages/outils/package.json',
      json({ name: outils, description: 'outils', license: 'MIT', version })
    );
    ecrire(
      'packages/site/package.json',
      json({ name: 'site', version: '1.0.0', dependencies: { [outils]: '*' } })
    );
  };
  const valider = (message: string) => {
    git('add', '-A');
    git('commit', '-qm', message);
  };
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 't');
  git('config', 'user.email', 't@t');
  ecrire('.gitignore', 'node_modules\n.claude\n');
  ecrire('.beads/config.yaml', 'issue-prefix: "demo"\n');
  ecrire(
    'docs/ARCHITECTURE.md',
    '| Composant | Langage |\n| --- | --- |\n| `packages/outils` | typescript |\n| `packages/site` | typescript |\n'
  );
  ecrire(
    'package.json',
    json({ name: 'essai', private: true, workspaces: ['packages/*'], grillhouse })
  );
  paquets('synthhub-outils');
  verrouiller();
  valider('base');
  const renommer = () => {
    paquets('synthub-outils');
    verrouiller();
  };
  return { racine, git, paquets, verrouiller, valider, renommer };
}

describe('un lot qui renomme un paquet de l’espace de travail, son verrou juste', () => {
  it('s’intègre : le verrou se régénère avant l’installation de la copie d’intégration', () => {
    const d = depot();
    d.renommer();
    const lot = path.join(mkdtempSync(path.join(ESSAIS, 'lot-')), 'code.patch');
    writeFileSync(lot, d.git('diff', 'HEAD'));
    d.git('checkout', '-q', '--', '.');
    const message = path.join(path.dirname(lot), 'message');
    writeFileSync(message, 'feat: renomme (demo-1)\n');
    const references = path.join(path.dirname(lot), 'references.json');
    writeFileSync(
      references,
      json([{ ...VERROU, nom: 'le verrou des dépendances', entiers: VERROU.fichiers, cadre: true }])
    );
    const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
    writeFileSync(
      path.join(bin, 'bd'),
      `#!/bin/sh
case "$1" in
  show) echo '[{"id":"demo-1","labels":[]}]' ;;
  comments) echo '[{"author":"relecteur","text":"ACCEPTÉ"}]' ;;
esac
`
    );
    chmodSync(path.join(bin, 'bd'), 0o755);
    vi.stubEnv('PATH', `${bin}${path.delimiter}${process.env.PATH}`);
    let sortie = '';
    vi.spyOn(process.stdout, 'write').mockImplementation(s => {
      sortie += String(s);
      return true;
    });

    const code = main(
      [
        ...['--ticket', 'demo-1', '--code', lot],
        ...['--message', message, '--references', references],
      ],
      d.racine
    );

    vi.restoreAllMocks();
    expect(code, sortie).toBe(0);
    const livre = d.git('show', 'agent/demo-1:package-lock.json');
    expect(livre).toContain('"synthub-outils"');
    expect(livre).not.toContain('synthhub-outils');
  }, 120_000);

  it('se repose dans la file : le verrou en conflit se régénère avant l’installation', () => {
    const d = depot({ engendres: { verrou: VERROU } });
    d.git('checkout', '-q', '-b', 'agent/demo-1');
    d.renommer();
    d.valider('feat: renomme (demo-1)');
    d.git('checkout', '-q', 'main');
    // Main bumps the version of the package the branch renames.
    d.paquets('synthhub-outils', '1.0.1');
    d.verrouiller();
    d.valider('feat: autre (demo-2)');
    const dites: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const r = preparerLaBranche(
      {
        racine: d.racine,
        principale: 'main',
        bd: () => ({ status: 0, stdout: '', stderr: '' }),
        dire: (l: string) => dites.push(l),
      },
      { ticket: 'demo-1', branche: 'agent/demo-1' }
    );

    expect(r).toHaveProperty('candidat');
    const verrou = d.git('show', 'agent/demo-1:package-lock.json');
    expect(verrou).toContain('"synthub-outils"');
    expect(verrou).not.toContain('synthhub-outils');
    expect(verrou).toContain('"version": "1.0.1"');
    expect(readFileSync(path.join(d.racine, 'package-lock.json'), 'utf8')).toContain(
      'synthhub-outils'
    );
  }, 120_000);
});
