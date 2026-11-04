// grillhouse-44b.5, critères 4 et 11 — le lanceur de l'enveloppe construit le plan et ses
// fournisseurs par `turbo run build --filter=<plan>…`, pour tout langage : la commande
// `construire --echec <fichier> <plan>` des modules typescript, cargo et python est une seule
// implémentation (Bazel construit les dépendances d'une cible avant la cible), et un plan dont un
// chemin n'est pas un paquet construit la copie entière. Joué contre le faux Turborepo
// (./faux-turbo.ts) : chaque module reçoit les mêmes plans, et son journal doit être le même.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Langage } from '../../scripts/jointure.js';
import cargo from '../../scripts/langages/cargo/index.mjs';
import python from '../../scripts/langages/python/index.mjs';
import typescript from '../../scripts/langages/typescript/index.mjs';
import { appelsDeTurbo, installerFauxTurbo } from './faux-turbo.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'construire-du-plan-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const JOURNAL = path.join(ESSAIS, 'journal-turbo');
let faux: string;
beforeAll(() => {
  faux = installerFauxTurbo(ESSAIS);
});

const MODULES: [string, Langage][] = [
  ['typescript', typescript as unknown as Langage],
  ['cargo', cargo as unknown as Langage],
  ['python', python as unknown as Langage],
];

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};

// Une copie de trois paquets : un crate, un projet Python, un paquet TypeScript, et un dossier
// `docs` qui n'est pas un paquet.
function copie() {
  const r = mkdtempSync(path.join(ESSAIS, 'copie-'));
  ecrire(
    r,
    'package.json',
    JSON.stringify({
      name: 'essai',
      private: true,
      workspaces: ['crates/*', 'outils', 'packages/*'],
    })
  );
  ecrire(r, 'Cargo.toml', '[workspace]\nmembers = ["crates/*"]\n');
  ecrire(r, 'Cargo.lock', 'version = 4\n');
  ecrire(r, 'crates/noyau/package.json', JSON.stringify({ name: 'noyau', private: true }));
  ecrire(r, 'crates/noyau/Cargo.toml', '[package]\nname = "noyau"\nversion = "0.1.0"\n');
  ecrire(r, 'outils/package.json', JSON.stringify({ name: 'outils', private: true }));
  ecrire(r, 'outils/pyproject.toml', '[project]\nname = "outils"\nversion = "0.1.0"\n');
  ecrire(r, 'packages/site/package.json', JSON.stringify({ name: 'site' }));
  ecrire(r, 'docs/a.md', '# a\n');
  return r;
}

// La commande `construire` de <module> sur le plan <plan>, dans <racine> : son code, son fichier
// d'échec et les appels de Turborepo hors des plans à blanc.
function construire(module: Langage, racine: string, plan: string, env: NodeJS.ProcessEnv = {}) {
  writeFileSync(JOURNAL, '');
  const echec = path.join(mkdtempSync(path.join(ESSAIS, 'echec-')), 'echec');
  const c = module.commandes(racine).construire!;
  const r = spawnSync(process.execPath, [c.script, ...c.args, '--echec', echec, plan], {
    cwd: racine,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${faux}${path.delimiter}${process.env.PATH ?? ''}`,
      FAUX_TURBO_JOURNAL: JOURNAL,
      ...env,
    },
  });
  const appels = appelsDeTurbo(JOURNAL).map(a => a.args);
  return {
    code: r.status,
    stderr: r.stderr,
    // Le fichier d'échec que la commande écrit (vide quand la construction réussit) ; `null` quand
    // elle ne l'écrit pas.
    echec: existsSync(echec) ? readFileSync(echec, 'utf8') : null,
    appels,
    jouees: appels.filter(a => !a.includes('--dry=json')),
  };
}

describe('grillhouse-44b.5, critères 4 et 11 — le plan et ses fournisseurs, par un seul lanceur', () => {
  for (const [plan, nom] of [
    ['crates/noyau', 'noyau'],
    ['outils', 'outils'],
    ['packages/site', 'site'],
  ] as const) {
    it(`critère 11: le plan ${plan} se construit par \`turbo run build --filter=${nom}…\`, pour les trois modules`, () => {
      const racine = copie();
      for (const [langage, module] of MODULES) {
        const r = construire(module, racine, plan);
        expect(r.code, `${langage} : ${r.stderr}`).toBe(0);
        const finale = r.jouees.find(a => a.includes(`--filter=${nom}...`));
        expect(finale, `${langage} : ${JSON.stringify(r.appels)}`).toBeDefined();
        expect(finale!.slice(0, 2)).toEqual(['run', 'build']);
        expect(finale).toContain('--continue=dependencies-successful');
        expect(r.echec, langage).toBe('');
      }
    });

    it(`critère 11: le plan ${plan} donne le même journal à typescript, cargo et python`, () => {
      const racine = copie();
      const journaux = MODULES.map(([, m]) => construire(m, racine, plan).appels);
      expect(journaux[1]).toEqual(journaux[0]);
      expect(journaux[2]).toEqual(journaux[0]);
    });
  }

  it('critère 11: deux paquets de deux langages dans le plan : les deux filtres', () => {
    const racine = copie();
    for (const [langage, module] of MODULES) {
      const r = construire(module, racine, 'crates/noyau:outils');
      expect(r.code, `${langage} : ${r.stderr}`).toBe(0);
      const finale = r.jouees.find(a => a.includes('--filter=noyau...'));
      expect(finale, langage).toContain('--filter=outils...');
    }
  });

  it('critère 4: un plan dont un chemin n’est pas un paquet construit la copie entière, sans filtre', () => {
    const racine = copie();
    for (const [langage, module] of MODULES) {
      for (const plan of ['docs', 'crates/noyau:docs', '.']) {
        const r = construire(module, racine, plan);
        expect(r.code, `${langage} ${plan} : ${r.stderr}`).toBe(0);
        const finale = r.jouees.find(a => a.includes('build'));
        expect(finale, `${langage} ${plan} : ${JSON.stringify(r.appels)}`).toBeDefined();
        expect(
          finale!.some(a => a.startsWith('--filter')),
          `${langage} ${plan}`
        ).toBe(false);
        expect(finale).toContain('--continue=dependencies-successful');
      }
    }
  });

  it('critère 11: une construction qui échoue n’arrête pas le lancement : 0, la ligne et la sortie dans le fichier', () => {
    const racine = copie();
    for (const [langage, module] of MODULES) {
      const r = construire(module, racine, 'crates/noyau', {
        FAUX_TURBO_CODE: '1',
        FAUX_TURBO_SORTIE: 'error[E0425]: cannot find function\n',
      });
      expect(r.code, `${langage} : ${r.stderr}`).toBe(0);
      expect(r.echec, langage).toContain('error[E0425]: cannot find function');
    }
  });

  it('critère 4: un plan à blanc que Turborepo refuse arrête le lancement (1)', () => {
    const racine = copie();
    for (const [langage, module] of MODULES) {
      expect(construire(module, racine, 'docs', { FAUX_TURBO_CODE_DRY: '1' }).code, langage).toBe(
        1
      );
    }
  });

  it('un appel mal formé (sans fichier d’échec) est refusé (2) par chaque module', () => {
    const racine = copie();
    for (const [langage, module] of MODULES) {
      const c = module.commandes(racine).construire!;
      const r = spawnSync(process.execPath, [c.script, ...c.args, '--echec'], {
        cwd: racine,
        encoding: 'utf8',
        env: { ...process.env, PATH: `${faux}${path.delimiter}${process.env.PATH ?? ''}` },
      });
      expect(r.status, langage).toBe(2);
    }
  });
});
