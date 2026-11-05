// grillhouse-44b.4.1: the write lock of a session runs on the published version that leads the
// repository (`grillhouse.outil`, scripts/aiguillage.mjs), never on the code of the copy it guards.
// A medium test: the command of the copy is run for real on a folder, no trial repository is
// mounted; the verdicts that need a git repository (a write out of the plan) are in
// verrou-publie.nuit.test.ts.
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dossier, installe, npmEnPanne } from './outil-essai.js';
import {
  CASSES,
  copieCassee,
  copieSaine,
  depot,
  maisonAvecLaVersionSaine,
  SYNTAXE,
  verrou,
  VERSION,
} from './verrou-essai.js';

describe('grillhouse-44b.4.1, critère 1 — le verrou charge son code depuis la version publiée', () => {
  it('critère 1 : la commande de la copie remet `verrou` à la version publiée, même quand un script de la copie ne se charge plus', () => {
    const maison = dossier('maison');
    installe(path.join(maison, '.cache/grillhouse/outil'), VERSION);
    const copie = copieCassee('scripts/langages.mjs', SYNTAXE);
    const r = verrou(copie, { repo: depot(), maison, fichier: 'packages/a/tests/x.spec.ts' });
    expect(r.stdout).toContain('publiee verrou testwriter');
    expect(r.status).toBe(7);
  });
});

describe('grillhouse-44b.4.1, critère 2 — une copie à module cassé : le verrou juge comme d’habitude', () => {
  it.each(CASSES)('critère 2 : %s — l’écriture du plan passe', (_nom, rel, casser) => {
    const maison = maisonAvecLaVersionSaine();
    const copie = copieCassee(rel, casser);
    const r = verrou(copie, { repo: depot(), maison, fichier: 'packages/a/tests/x.spec.ts' });
    expect(r.stderr).toBe('');
    expect(r.stdout).toBe('');
    expect(r.status).toBe(0);
  });

  it.each(CASSES)(
    'critère 2 : %s — l’écriture qui répare le module cassé passe',
    (_nom, rel, casser) => {
      const maison = maisonAvecLaVersionSaine();
      const repo = depot();
      const demande = {
        repo,
        maison,
        role: 'developpeur',
        fichier: 'packages/a/src/reparation.ts',
      };
      const attendu = verrou(copieSaine(), demande);
      const r = verrou(copieCassee(rel, casser), demande);
      // The lock judges the repair as it judges it from a healthy copy: same verdict, same words.
      expect(r.stderr).not.toMatch(/SyntaxError|does not provide an export/);
      expect([r.status, r.stdout, r.stderr]).toEqual([
        attendu.status,
        attendu.stdout,
        attendu.stderr,
      ]);
    }
  );
});

describe('grillhouse-44b.4.1, critère 3 — le verrou garde ses refus, avec leur message', () => {
  it('critère 3 : le testwriter qui écrit du code du plan est refusé, code 2, message actuel', () => {
    const maison = maisonAvecLaVersionSaine();
    const copie = copieCassee('scripts/langages.mjs', SYNTAXE);
    const r = verrou(copie, { repo: depot(), maison, fichier: 'packages/a/src/code.ts' });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/seulement des fichiers de test/);
  });

  it('critère 3 : le message est celui de la version publiée sur une copie saine', () => {
    const maison = maisonAvecLaVersionSaine();
    const repo = depot();
    const saine = verrou(copieSaine(), { repo, maison, fichier: 'packages/a/src/code.ts' });
    const cassee = verrou(copieCassee('scripts/langages.mjs', SYNTAXE), {
      repo,
      maison,
      fichier: 'packages/a/src/code.ts',
    });
    expect(cassee.stderr).toBe(saine.stderr);
    expect(cassee.status).toBe(saine.status);
  });
});

describe('grillhouse-44b.4.1, critère 8 — la version publiée absente : le verrou refuse, nommément', () => {
  it('critère 8 : version non installable et copie cassée — code 2, la version et la cause nommées, jamais un passage ni un échec muet', () => {
    const maison = dossier('maison');
    const npm = npmEnPanne(path.join(dossier('journal'), 'npm.log'));
    const copie = copieCassee('scripts/langages.mjs', SYNTAXE);
    const r = verrou(copie, {
      repo: depot({ outil: '9.9.8' }),
      maison,
      fichier: 'packages/a/tests/x.spec.ts',
      npm,
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('9.9.8');
    expect(r.stderr).toContain('ENOTFOUND');
  });
});

describe('grillhouse-44b.4.1, critère 7 — le verrou lancé depuis l’arbre principal juge la copie', () => {
  // The main tree's command (its package) judges a copy whose package c the main tree has never
  // heard of: the plan, the root of the written file, the language and the packages of the plan
  // are the copy's.
  it('critère 7 : l’écriture de test du plan c, que seule la copie connaît, passe', () => {
    const r = verrou(copieSaine('principal'), {
      repo: depot({ avecC: true }),
      maison: maisonAvecLaVersionSaine(),
      fichier: 'packages/c/tests/x.spec.ts',
      plan: 'packages/c',
    });
    expect([r.status, r.stdout, r.stderr]).toEqual([0, '', '']);
  });

  it('critère 7 : le testwriter qui écrit le code de c est refusé sur le plan de la copie', () => {
    const r = verrou(copieSaine('principal'), {
      repo: depot({ avecC: true }),
      maison: maisonAvecLaVersionSaine(),
      fichier: 'packages/c/src/code.ts',
      plan: 'packages/c',
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/seulement des fichiers de test/);
  });
});
