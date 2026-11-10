// grillhouse-9tu: the frame's repository is led by a published version, as rustc is built by its
// stage0 and Bazel by a released Bazel. `grillhouse.outil` of the root package.json names the
// version; `grillhouse outil` installs it under ~/.cache/grillhouse/outil/<version>/; the command
// (bin/grillhouse.mjs) hands each subcommand of the orchestration to that version, and keeps the
// tests, the verification, the guards and the tools of the repository to the code it runs.
// Without the key, nothing changes. The module of language run from an installation of the cache
// on a trial repository is the night's (outil.nuit.test.ts).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  aiguillage,
  DU_CODE_EN_COURS,
  echecDeLOutil,
  dossierDeLOutil,
  installer,
  OUTILS_DU_DEPOT,
  REDIRIGEES,
  versionDeLOutil,
} from '../../scripts/aiguillage.mjs';
import { SOUS_COMMANDES } from '../../scripts/sous-commandes.mjs';
import {
  COMMANDE,
  dossier,
  fauxNpm,
  installe,
  npmEnPanne,
  PAQUET,
  pidMort,
  projet,
} from './outil-essai.js';

describe('the key grillhouse.outil', () => {
  it('names the published version, a version x.y.z', () => {
    expect(versionDeLOutil(projet({ outil: '0.29.0' }))).toBe('0.29.0');
  });

  it('is null when the project names none: an ordinary project', () => {
    expect(versionDeLOutil(projet())).toBeNull();
    expect(versionDeLOutil(projet({ outils: {} }))).toBeNull();
  });

  it('is refused by its name when it is no version x.y.z', () => {
    expect(() => versionDeLOutil(projet({ outil: 'latest' }))).toThrow(/grillhouse\.outil/);
    expect(() => versionDeLOutil(projet({ outil: 29 }))).toThrow(/grillhouse\.outil/);
  });
});

describe('each subcommand has its side, so that a new one never falls on one by default', () => {
  it('the orchestration runs by the published version: circuit, supervisor, night, board, hooks of Claude Code, locks and rights of the sessions, integration', () => {
    expect([...REDIRIGEES].sort()).toEqual(
      [
        'attente-au-tour',
        'bilan',
        'circuit',
        'commande',
        'droits',
        'enveloppe',
        'integrer',
        'journal',
        'lancer',
        'ligne-etat',
        'nuit',
        'registre',
        'resultats',
        'retirer-copie',
        'session-start',
        'structure-guard',
        'superviseur',
        'tableau',
        'ticket-du-sous-agent',
        'verrou',
      ].sort()
    );
  });

  it('the tests, the verification, the guards, the temporary folder and the git hooks run the code of the copy', () => {
    expect([...DU_CODE_EN_COURS].sort()).toEqual(
      [
        'composants-affectes',
        'dependances-internes',
        'flux-des-paquets',
        'fusion-du-changelog',
        'gardes-du-cadre',
        'hook',
        'hooks',
        'langages-des-paquets',
        'style-a-l-ecriture',
        'temporaire',
        'tests',
        'verifier',
      ].sort()
    );
  });

  it('the tools of the repository run the code of the repository', () => {
    expect([...OUTILS_DU_DEPOT].sort()).toEqual(
      'greffons init maj outil paquet pression sortie sous-modules temporal ticket'.split(' ')
    );
  });

  it('every subcommand of the core is in exactly one of the three lists', () => {
    const listes = [REDIRIGEES, DU_CODE_EN_COURS, OUTILS_DU_DEPOT];
    for (const nom of Object.keys(SOUS_COMMANDES)) {
      expect(listes.filter(l => l.has(nom)).length, nom).toBe(1);
    }
    for (const l of listes) {
      for (const nom of l) {
        expect(Object.keys(SOUS_COMMANDES), nom).toContain(nom);
      }
    }
  });

  it('a command of a module of language runs the code of the copy', () => {
    const p = projet({ outil: '1.2.3' });
    expect(
      aiguillage('frontieres', { racine: p, cache: dossier('cache'), paquet: PAQUET })
    ).toBeNull();
  });
});

describe('the switch (aiguillage)', () => {
  const cache = dossier('cache');

  it('hands an orchestration subcommand to the version of the key, under the cache', () => {
    const p = projet({ outil: '1.2.3' });
    const vers = aiguillage('circuit', { racine: p, cache, paquet: PAQUET });
    expect(vers).toEqual({
      version: '1.2.3',
      dossier: path.join(cache, '1.2.3'),
      commande: path.join(cache, '1.2.3/node_modules/@roomi-fields/grillhouse/bin/grillhouse.mjs'),
    });
  });

  it('keeps any other subcommand to the code that runs', () => {
    const p = projet({ outil: '1.2.3' });
    expect(aiguillage('tests', { racine: p, cache, paquet: PAQUET })).toBeNull();
    expect(aiguillage('verifier', { racine: p, cache, paquet: PAQUET })).toBeNull();
  });

  it('changes nothing without the key', () => {
    expect(aiguillage('circuit', { racine: projet(), cache, paquet: PAQUET })).toBeNull();
  });

  it('runs in place when the code that runs is the version installed, by their paths', () => {
    const p = projet({ outil: '1.2.4' });
    const bin = installe(cache, '1.2.4');
    const paquet = path.resolve(path.dirname(bin), '..');
    expect(aiguillage('circuit', { racine: p, cache, paquet })).toBeNull();
  });
});

describe('the installation (grillhouse outil)', () => {
  it('installs the published package under <cache>/<version>, by npm', () => {
    const cache = dossier('cache');
    const journal = path.join(dossier('journal'), 'npm.log');
    const r = installer('2.0.0', { cache, npm: fauxNpm(journal) });
    expect(r).toEqual({ dossier: path.join(cache, '2.0.0'), installe: true });
    expect(readFileSync(journal, 'utf8')).toContain('@roomi-fields/grillhouse@2.0.0');
    expect(
      existsSync(path.join(cache, '2.0.0/node_modules/@roomi-fields/grillhouse/bin/grillhouse.mjs'))
    ).toBe(true);
  });

  it('does nothing when the version is there', () => {
    const cache = dossier('cache');
    installe(cache, '2.0.1');
    const journal = path.join(dossier('journal'), 'npm.log');
    expect(installer('2.0.1', { cache, npm: fauxNpm(journal) }).installe).toBe(false);
    expect(existsSync(journal)).toBe(false);
  });

  it('leaves no version half installed when npm fails', () => {
    const cache = dossier('cache');
    expect(() => installer('2.0.2', { cache, npm: '/bin/false' })).toThrow(/2\.0\.2/);
    expect(existsSync(dossierDeLOutil('2.0.2', cache))).toBe(false);
    expect(readdirSync(cache).filter(e => e.includes('.installation-'))).toEqual([]);
  });

  it('installs the peer dependencies the published package declares, at their declared ranges: the tool stands alone', () => {
    const cache = dossier('cache');
    const journal = path.join(dossier('journal'), 'npm.log');
    const peers = { typescript: '^5.3.3', 'dependency-cruiser': '^16.10.4 || ^17.0.0' };
    installer('2.0.3', { cache, npm: fauxNpm(journal, { peers }) });
    const appels = readFileSync(journal, 'utf8').trim().split('\n');
    expect(appels.at(-1)).toContain('typescript@^5.3.3');
    expect(appels.at(-1)).toContain('dependency-cruiser@^16.10.4 || ^17.0.0');
  });

  it('the dependencies the package expects of the project resolve from its installation in the cache, without a parent node_modules', () => {
    const cache = dossier('cache');
    const journal = path.join(dossier('journal'), 'npm.log');
    const { dossier: d } = installer('2.0.4', { cache, npm: fauxNpm(journal, { copie: true }) });
    const module = path.join(
      d,
      'node_modules/@roomi-fields/grillhouse/scripts/langages/typescript/elements-du-lot.mjs'
    );
    // A link of the stand-in resolves to the repository's: the call not throwing is the proof.
    expect(() => createRequire(module).resolve('typescript')).not.toThrow();
  });

  it('keeps a failure some minutes: a second call within them runs no npm', () => {
    const cache = dossier('cache');
    const journal = path.join(dossier('journal'), 'npm.log');
    expect(() => installer('2.0.5', { cache, npm: npmEnPanne(journal) })).toThrow(/ENOTFOUND/);
    const avant = readFileSync(journal, 'utf8');
    expect(() => installer('2.0.5', { cache, npm: npmEnPanne(journal) })).toThrow(/ENOTFOUND/);
    expect(readFileSync(journal, 'utf8')).toBe(avant);
    // Past the delay, npm runs again.
    expect(() => installer('2.0.5', { cache, npm: npmEnPanne(journal), retenue: 0 })).toThrow();
    expect(readFileSync(journal, 'utf8')).not.toBe(avant);
  });

  it('sweeps the installation folder of a process that died, and leaves a living one', () => {
    const cache = dossier('cache');
    const mort = path.join(cache, `2.0.6.installation-${pidMort()}`);
    const vivant = path.join(cache, `2.0.7.installation-${process.ppid}`);
    mkdirSync(mort, { recursive: true });
    mkdirSync(vivant, { recursive: true });
    installer('2.0.8', { cache, npm: fauxNpm(path.join(dossier('journal'), 'npm.log')) });
    expect(existsSync(mort)).toBe(false);
    expect(existsSync(vivant)).toBe(true);
  });

  it('takes the folder another installation completed meanwhile, and leaves no folder of its own', () => {
    const cache = dossier('cache');
    const final = dossierDeLOutil('2.0.9', cache);
    const journal = path.join(dossier('journal'), 'npm.log');
    const r = installer('2.0.9', { cache, npm: fauxNpm(journal, { concurrent: final }) });
    expect(r.dossier).toBe(final);
    expect(
      readFileSync(
        path.join(final, 'node_modules/@roomi-fields/grillhouse/bin/grillhouse.mjs'),
        'utf8'
      )
    ).toBe('autre');
    expect(readdirSync(cache).filter(e => e.includes('.installation-'))).toEqual([]);
  });
});

// A failure that lasts is seen, by the paths that exist: the state file of the tool, the session's
// start and the board's alerts (the review of the lot: the line on the error stream alone reached
// nobody).
describe('a failed installation, kept in the state file of the tool', () => {
  it('is the version of the key, its reason and its date, while the file stands', () => {
    const cache = dossier('cache');
    const p = projet({ outil: '4.0.0' });
    expect(echecDeLOutil(p, { cache })).toBeNull();
    expect(() =>
      installer('4.0.0', { cache, npm: npmEnPanne(path.join(dossier('j'), 'n')) })
    ).toThrow();
    const e = echecDeLOutil(p, { cache });
    expect(e?.version).toBe('4.0.0');
    expect(e?.raison).toContain('ENOTFOUND');
    expect(Number.isNaN(Date.parse(e?.date ?? ''))).toBe(false);
  });

  it('is gone at the first installation that succeeds', () => {
    const cache = dossier('cache');
    const p = projet({ outil: '4.0.1' });
    expect(() =>
      installer('4.0.1', { cache, npm: npmEnPanne(path.join(dossier('j'), 'n')) })
    ).toThrow();
    installer('4.0.1', { cache, npm: fauxNpm(path.join(dossier('j'), 'n')), retenue: 0 });
    expect(echecDeLOutil(p, { cache })).toBeNull();
  });

  it('is none, and removed, when the version is installed: a failure written after another launch succeeded', () => {
    const cache = dossier('cache');
    const p = projet({ outil: '4.0.4' });
    installe(cache, '4.0.4');
    const f = path.join(cache, '4.0.4.echec');
    writeFileSync(f, JSON.stringify({ date: new Date().toISOString(), raison: 'npm : ENOTFOUND' }));
    expect(echecDeLOutil(p, { cache })).toBeNull();
    expect(existsSync(f)).toBe(false);
  });

  it('is none without the key, or for another version than the key’s', () => {
    const cache = dossier('cache');
    expect(() =>
      installer('4.0.2', { cache, npm: npmEnPanne(path.join(dossier('j'), 'n')) })
    ).toThrow();
    expect(echecDeLOutil(projet(), { cache })).toBeNull();
    expect(echecDeLOutil(projet({ outil: '4.0.3' }), { cache })).toBeNull();
  });
});

describe('the session’s start says a failed installation on its standard output', () => {
  // The session's start of the repository, in the project <p>, the home <maison>: a session the
  // circuit launches (BEADS_ACTOR), which takes no supervisor's lock.
  const ouverture = (p: string, maison: string) =>
    spawnSync('bash', [path.join(PAQUET, 'scripts/session-start.sh')], {
      cwd: p,
      encoding: 'utf8',
      input: '{"hook_event_name":"SessionStart","source":"startup"}',
      env: { ...process.env, CLAUDE_PROJECT_DIR: p, HOME: maison, BEADS_ACTOR: 'essai' },
      timeout: 60_000,
    });

  it('while the state file stands for the version of the key', () => {
    const maison = dossier('maison');
    const cache = path.join(maison, '.cache/grillhouse/outil');
    mkdirSync(cache, { recursive: true });
    writeFileSync(
      path.join(cache, '5.0.0.echec'),
      JSON.stringify({ date: new Date().toISOString(), raison: 'npm : ENOTFOUND' })
    );
    const r = ouverture(projet({ outil: '5.0.0' }), maison);
    expect(r.stdout).toContain(
      "⚠️ Version publiée 5.0.0 non installable (npm : ENOTFOUND) : l'orchestration tourne sur le code du dépôt. `npx grillhouse outil` la réinstalle."
    );
  });

  it('says nothing of it without the file', () => {
    const r = ouverture(projet({ outil: '5.0.1' }), dossier('maison'));
    expect(r.stdout).not.toContain('Version publiée');
  });
});

describe('the command, in a project that names its published version', () => {
  // The command run in <cwd>, the home <maison> (its cache under it), npm the stand-in <npm>.
  const grillhouse = (args: string[], cwd: string, maison: string, npm?: string) =>
    spawnSync(COMMANDE, args, {
      cwd,
      encoding: 'utf8',
      timeout: 30_000,
      env: {
        ...process.env,
        HOME: maison,
        PATH: [npm ? path.dirname(npm) : null, process.env.PATH].filter(Boolean).join(':'),
      },
    });

  it('runs an orchestration subcommand by the version installed, its arguments and its exit code', () => {
    const maison = dossier('maison');
    installe(path.join(maison, '.cache/grillhouse/outil'), '3.0.0');
    const p = projet({ outil: '3.0.0' });
    const r = grillhouse(['tableau', '--texte'], p, maison);
    expect(r.stdout).toContain(`publiee tableau --texte @ ${p}`);
    expect(r.status).toBe(7);
  });

  it('installs a version absent at its first launch, npm writing on the error stream only', () => {
    const maison = dossier('maison');
    const journal = path.join(dossier('journal'), 'npm.log');
    const p = projet({ outil: '3.0.1' });
    const r = grillhouse(['session-start'], p, maison, fauxNpm(journal));
    expect(readFileSync(journal, 'utf8')).toContain('@roomi-fields/grillhouse@3.0.1');
    expect(r.stdout).toBe('publiee session-start\n');
    expect(r.status).toBe(7);
  });

  it('`grillhouse outil <x.y.z>` writes the key and installs the version', () => {
    const maison = dossier('maison');
    const journal = path.join(dossier('journal'), 'npm.log');
    const p = projet();
    const r = grillhouse(['outil', '3.1.0'], p, maison, fauxNpm(journal));
    expect(r.status, r.stderr).toBe(0);
    expect(versionDeLOutil(p)).toBe('3.1.0');
    expect(existsSync(dossierDeLOutil('3.1.0', path.join(maison, '.cache/grillhouse/outil')))).toBe(
      true
    );
  });

  it('a version that cannot be installed is said in one line, and the code of the repository runs in its place', () => {
    const maison = dossier('maison');
    const journal = path.join(dossier('journal'), 'npm.log');
    const p = projet({ outil: '3.2.0' });
    const r = grillhouse(['bilan'], p, maison, npmEnPanne(journal));
    expect(r.stderr).toContain('version publiée 3.2.0 non installable : ');
    expect(r.stderr).toContain('ENOTFOUND');
    expect(r.stderr).toContain('le code du dépôt la remplace');
    expect(r.stdout + r.stderr).toContain('usage: bilan.mjs');
  });

  it('`grillhouse outil <x.y.z>` without a package.json is refused by its name, exit 2', () => {
    const r = grillhouse(['outil', '3.3.0'], dossier('vide'), dossier('maison'));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('package.json');
    expect(r.stderr).not.toContain('at ');
  });

  it('`grillhouse outil` without the key says so, exit 2', () => {
    const r = grillhouse(['outil'], projet(), dossier('maison'));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('grillhouse.outil');
  });
});
