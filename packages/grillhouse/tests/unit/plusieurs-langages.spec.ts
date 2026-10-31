// grillhouse-akd — a project declares several languages, and the core composes their modules, as
// Bazel and Nx run one list of targets, one tool per language, each target of one language alone
// (D1 and D1 bis of grillhouse-1zu). The join of the declared modules
// (scripts/composition-des-langages.mjs) asks each module its components and gives each file to
// the module of the component that holds it; a file out of every component stays the core's, as
// it is today: the first module that judges it. A package has one language: a folder two modules
// claim is refused, named with both. The role lock, the envelope and the update take the union of
// what the declared modules ask (criteria 1, 2 and 4).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { composer } from '../../scripts/composition-des-langages.mjs';
import { SCRIPT } from '../../scripts/commandes-composees.mjs';
import { SCRIPT as INDEX_DU_NOYAU, SORTIE as INDEX } from '../../scripts/index-interfaces.mjs';
import { langageDe, langagesDe } from '../../scripts/langages.mjs';
import type { Composant, Langage } from '../../scripts/jointure.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'plusieurs-langages-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const RACINE = '/depot';
const composant = (dossier: string): Composant => ({
  dossier: path.join(RACINE, dossier),
  nom: path.basename(dossier),
  paquet: path.basename(dossier),
});
const tient = (c: Composant, f: string) => {
  const abs = path.resolve(RACINE, f);
  return abs === c.dossier || abs.startsWith(`${c.dossier}/`);
};

// A fake module of language <nom>, its components at <dossiers>, each answer naming it.
function faux(nom: string, dossiers: string[], autres: Partial<Langage> = {}): Langage {
  const comps = dossiers.map(composant);
  const de = (f: string) => comps.find(c => tient(c, f)) ?? null;
  return {
    nom,
    trouve: () => true,
    signe: `signe de ${nom}`,
    outils: [`outil-${nom}`, 'commun'],
    binaires: { [`binaire-${nom}`]: '1.0.0' },
    ignorer: [`sortie-${nom}`],
    sorties: { ecrites: [`${nom}/`], propres: [`.${nom}`], lues: [`~/.${nom}/`] },
    droits: [`Bash(${nom} test*)`],
    composants: () => comps,
    composantDe: (_r, f) => de(f),
    matieres: () => [],
    joueDesTests: (_r, c) => `${c.nom}:${nom}` !== 'aucun',
    lecteurs: (_r, o) => ({
      elements: [],
      sansFournisseur: o.noms.filter(n => !n.startsWith(nom)),
      types: { etat: 'fait', raison: null, elements: [] },
      lit: new Map(o.composants.map(c => [c, new Set<Composant>()])),
      parLesTests: new Map(),
    }),
    touches: () => ({
      touches: comps.slice(0, 1),
      dependants: [],
      horsGraphe: ['racine.txt', `hors-de-${nom}`],
    }),
    elementsDuLot: () => ({
      etat: 'fait',
      raison: null,
      elements: [],
      horsDuService: [`${dossiers[0]}/lu-par-aucun`, 'racine.txt'],
      fichiers: [`${dossiers[0]}/f`],
    }),
    commandes: () => ({
      tester: { script: `/${nom}/tester.mjs`, args: [] },
      verifier: { script: `/${nom}/verifier.mjs`, args: [] },
      typer: { script: `/${nom}/typer.mjs`, args: [] },
      [`propre-a-${nom}`]: { script: `/${nom}/propre.mjs`, args: [] },
    }),
    verdict: dossier => ({
      rapports: [{ fichier: `${dossier}/${nom}`, etat: 'passed', message: '', tests: [] }],
      taches: [],
    }),
    estUnTest: chemin =>
      de(chemin) || chemin.startsWith('tests/')
        ? { joue: true, test: true, matiere: false }
        : { joue: false, test: false, matiere: nom === 'b' && chemin.endsWith('.b') },
    manifestes: {
      verrous: [`${nom}.lock`],
      horsDesTests: (chemin: string) => (chemin.endsWith(`${nom}.toml`) ? [nom] : null),
    },
    fichiersEngendres: () => [],
    gardes: () => [[`/${nom}/garde.mjs`]],
    migrations: [{ version: '0.1.0', nom: `migration-${nom}`, migrer: () => [] }],
    miseAJour: {} as Langage['miseAJour'],
    ...autres,
  } as Langage;
}

const A = faux('a', ['a', 'commun/a']);
const B = faux('b', ['b']);
const AB = composer([A, B]);

describe('grillhouse-akd, critère 1 — chaque fichier va au module du composant qui le tient', () => {
  it('one module declared: its join is the module itself, as today', () => {
    expect(composer([A])).toBe(A);
  });

  it('the components are each module’s, each in the module of its language', () => {
    expect(AB.composants(RACINE).map(c => path.relative(RACINE, c.dossier))).toEqual([
      'a',
      'commun/a',
      'b',
    ]);
    expect(AB.composantDe(RACINE, 'b/src/x.b')?.nom).toBe('b');
    expect(AB.composantDe(RACINE, 'commun/a/y')?.nom).toBe('a');
    expect(AB.composantDe(RACINE, 'ailleurs/z')).toBeNull();
  });

  it('a file of a component is judged by its module alone; a file out of every component by the first that judges it', () => {
    const ens = composer([
      faux('a', ['a'], { estUnTest: () => ({ joue: false, test: true, matiere: false }) }),
      faux('b', ['b'], { estUnTest: () => ({ joue: true, test: true, matiere: false }) }),
    ]);
    expect(ens.estUnTest('b/tests/x.b', RACINE)).toEqual({
      joue: true,
      test: true,
      matiere: false,
    });
    expect(ens.estUnTest('a/tests/x.a', RACINE)).toEqual({
      joue: false,
      test: true,
      matiere: false,
    });
    // Out of every component: the first module that judges it, in the order of the declaration.
    expect(ens.estUnTest('tests/racine.spec', RACINE)).toEqual({
      joue: false,
      test: true,
      matiere: false,
    });
    const aucun = composer([
      faux('a', ['a'], { estUnTest: () => null }),
      faux('b', ['b'], {
        estUnTest: (c: string) =>
          c === 'x.b' ? { joue: false, test: false, matiere: true } : null,
      }),
    ]);
    expect(aucun.estUnTest('x.b', RACINE)).toEqual({ joue: false, test: false, matiere: true });
    expect(aucun.estUnTest('y', RACINE)).toBeNull();
  });

  it('whether a component plays tests is its module’s answer', () => {
    const ens = composer([
      faux('a', ['a'], { joueDesTests: () => false }),
      faux('b', ['b'], { joueDesTests: () => true }),
    ]);
    const [a, b] = ens.composants(RACINE);
    expect(ens.joueDesTests(RACINE, a)).toBe(false);
    expect(ens.joueDesTests(RACINE, b)).toBe(true);
  });

  it('the readers: each module reads its own components, the results joined', () => {
    const tous = AB.composants(RACINE);
    const r = AB.lecteurs(RACINE, {
      composants: tous,
      noms: ['aX', 'bY', 'Z'],
      texte: '',
      nommes: [],
    });
    expect([...r.lit.keys()]).toEqual(tous);
    // A name without supplier in every module is without supplier.
    expect(r.sansFournisseur).toEqual(['Z']);
    expect(r.types.etat).toBe('fait');
  });

  it('the components touched: joined; a file out of the graph is out of every module’s', () => {
    const t = AB.touches(RACINE, { depuis: 'HEAD' });
    expect(t.touches.map(c => c.nom)).toEqual(['a', 'b']);
    expect(t.horsGraphe).toEqual(['racine.txt']);
  });

  it('the elements of a lot: joined; a source read by no element is the one its own module names', () => {
    const l = AB.elementsDuLot(RACINE, { avant: 'HEAD', apres: 'HEAD' });
    expect(l.etat).toBe('fait');
    expect(l.fichiers).toEqual(['a/f', 'b/f']);
    expect(l.horsDuService).toEqual(['a/lu-par-aucun', 'b/lu-par-aucun', 'racine.txt']);
    const impossible = composer([
      A,
      faux('b', ['b'], {
        elementsDuLot: () => ({
          etat: 'impossible',
          raison: 'git échoue',
          elements: [],
          horsDuService: [],
          fichiers: [],
        }),
      }),
    ]).elementsDuLot(RACINE, { avant: 'HEAD', apres: 'HEAD' });
    expect(impossible.etat).toBe('impossible');
    expect(impossible.raison).toMatch(/b : git échoue/);
  });

  it('the verdict of a run is every module’s, read in the same results directory', () => {
    expect(AB.verdict('/resultats').rapports.map(r => r.fichier)).toEqual([
      '/resultats/a',
      '/resultats/b',
    ]);
  });

  it('the guards, the generated files and the migrations: every module’s, in the order of the declaration', () => {
    expect(AB.gardes(RACINE)).toEqual([['/a/garde.mjs'], ['/b/garde.mjs']]);
    expect(AB.migrations.map(m => m.nom)).toEqual(['migration-a', 'migration-b']);
  });

  it('the index of the interfaces, which each module generates, is one of the core: one generated file, one guard, one command', () => {
    // Each fake module generates the index and another file of its own, and guards both.
    const avecIndex = (nom: string) =>
      faux(nom, [nom], {
        fichiersEngendres: () => [
          {
            nom: "l'index des interfaces",
            commande: `node /${nom}/index-interfaces.mjs`,
            fichiers: [INDEX],
            lit: [`${nom}/docs/INTERFACE.md`],
            gardes: ['index-interfaces'],
            entiers: [INDEX],
            verifier: () => [{ message: `index de ${nom}` }],
          },
          {
            nom: `propre à ${nom}`,
            commande: `node /${nom}/propre.mjs`,
            fichiers: [`${nom}.json`],
            lit: [],
            gardes: [`propre-${nom}`],
            entiers: [],
            verifier: () => [],
          },
        ],
        gardes: () => [
          [`/${nom}/index-interfaces.mjs`, '--verifier'],
          [`/${nom}/propre-${nom}.mjs`],
        ],
        commandes: () => ({
          tester: { script: `/${nom}/tester.mjs`, args: [] },
          'index-interfaces': { script: `/${nom}/index-interfaces.mjs`, args: [] },
        }),
        entreesDeLIndex: () => [],
      });
    const ens = composer([avecIndex('a'), avecIndex('b')]);
    const engendres = ens.fichiersEngendres(RACINE);
    expect(engendres.map(e => e.nom)).toEqual([
      "l'index des interfaces",
      'propre à a',
      'propre à b',
    ]);
    const [index] = engendres;
    expect(index.fichiers).toEqual([INDEX]);
    expect(index.entiers).toEqual([INDEX]);
    expect(index.gardes).toEqual(['index-interfaces']);
    expect(index.lit).toEqual(['a/docs/INTERFACE.md', 'b/docs/INTERFACE.md']);
    expect(index.commande).toBe(`node ${JSON.stringify(INDEX_DU_NOYAU)}`);
    expect(ens.gardes(RACINE)).toEqual([
      [INDEX_DU_NOYAU, '--verifier'],
      ['/a/propre-a.mjs'],
      ['/b/propre-b.mjs'],
    ]);
    expect(ens.commandes(RACINE)['index-interfaces']).toEqual({ script: INDEX_DU_NOYAU, args: [] });
  });

  it('each command of a module is the composed command by its name, which plays it in every module that has it', () => {
    const c = AB.commandes(RACINE);
    expect(Object.keys(c).sort()).toEqual([
      'propre-a-a',
      'propre-a-b',
      'tester',
      'typer',
      'verifier',
    ]);
    for (const [nom, commande] of Object.entries(c)) {
      expect(commande).toEqual({ script: SCRIPT, args: [nom] });
    }
  });
});

describe('grillhouse-akd, critère 2 — un paquet, un langage', () => {
  it('a folder two modules claim is refused, named with both languages', () => {
    const ens = composer([faux('a', ['a', 'partage']), faux('b', ['partage'])]);
    expect(() => ens.composants(RACINE)).toThrow(/partage/);
    expect(() => ens.composants(RACINE)).toThrow(/a et b/);
    expect(() => ens.composants(RACINE)).toThrow(/un seul langage/);
    expect(() => ens.estUnTest('partage/x', RACINE)).toThrow(/partage/);
  });
});

describe('grillhouse-akd, critère 4 — l’union de ce que demandent les modules', () => {
  it('the lock of the roles: the lock files of every module; a manifest judged by its own module', () => {
    expect(AB.manifestes.verrous).toEqual(['a.lock', 'b.lock']);
    expect(AB.manifestes.horsDesTests('b/b.toml', RACINE, null, '')).toEqual(['b']);
    expect(AB.manifestes.horsDesTests('a/a.toml', RACINE, null, '')).toEqual(['a']);
    expect(AB.manifestes.horsDesTests('a/rien', RACINE, null, '')).toBeNull();
  });

  it('the envelope: the outputs and the rules of every module, each once', () => {
    expect(AB.sorties).toEqual({
      ecrites: ['a/', 'b/'],
      propres: ['.a', '.b'],
      lues: ['~/.a/', '~/.b/'],
    });
    expect(AB.droits).toEqual(['Bash(a test*)', 'Bash(b test*)']);
  });

  it('the update: the tools, the binaries and the directories to ignore of every module, each once', () => {
    expect(AB.outils).toEqual(['outil-a', 'commun', 'outil-b']);
    expect(AB.binaires).toEqual({ 'binaire-a': '1.0.0', 'binaire-b': '1.0.0' });
    expect(AB.ignorer).toEqual(['sortie-a', 'sortie-b']);
    expect(AB.nom).toBe('a+b');
  });
});

describe('grillhouse-akd, critère 1 — un projet qui déclare deux langages n’est plus refusé', () => {
  const projet = (langages: string[]) => {
    const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
    mkdirSync(racine, { recursive: true });
    writeFileSync(
      path.join(racine, 'package.json'),
      JSON.stringify({ name: 'p', grillhouse: { langages } })
    );
    return racine;
  };

  it('cargo and typescript: both modules, in the order of the declaration, composed', () => {
    const racine = projet(['cargo', 'typescript']);
    expect(langagesDe(racine).map(m => m.nom)).toEqual(['cargo', 'typescript']);
    expect(langageDe(racine).nom).toBe('cargo+typescript');
  });

  it('a language the frame lacks is still refused, named, the frame’s list named', () => {
    const racine = projet(['typescript', 'cobol']);
    expect(() => langageDe(racine)).toThrow(/cobol/);
    expect(() => langageDe(racine)).toThrow(/typescript, cargo/);
  });

  it('a language declared twice is refused, named', () => {
    expect(() => langageDe(projet(['cargo', 'cargo']))).toThrow(/cargo.*deux fois/);
  });
});
