// grillhouse-akd, criterion 3 — `npm test -- <chemins>`, `npm run verifier`, the circuit, the
// queue and the night play each declared module on its components and give one verdict
// (scripts/commandes-composees.mjs), as Bazel runs each target with the rule of its language and
// one red fails the build: each path goes to the module of the component that holds it, each
// module plays its own command with its tool, and a red of one module makes the whole red. A
// trial repository of two languages, each module's fake tool a script that writes its call in a
// journal and ends with the code its variable names.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { jouer } from '../../scripts/commandes-composees.mjs';
import type { Composant, Langage } from '../../scripts/jointure.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'commandes-composees-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const RACINE = path.join(ESSAIS, 'depot');
const JOURNAL = path.join(ESSAIS, 'journal');

// The fake tool of the module <nom>: it writes « <nom> <commande> <args> » in the journal, then
// whether the environment names a file of deferred greens (`GRILLHOUSE_VERT_DIFFERE`), and ends
// with the code CODE_<nom> (0 by default). grillhouse-44b.5, critère 9: no module of language
// keeps or defers a green, so this tool does neither.
function outil(nom: string) {
  const f = path.join(ESSAIS, `outil-${nom}.mjs`);
  writeFileSync(
    f,
    [
      "import { appendFileSync } from 'node:fs';",
      'const [commande, ...args] = process.argv.slice(2);',
      `appendFileSync(process.env.JOURNAL, ${JSON.stringify(nom)} + ' ' + [commande, ...args].join(' ') + '\\n');`,
      "if (process.env.GRILLHOUSE_VERT_DIFFERE) appendFileSync(process.env.JOURNAL, 'DIFFERE ' + process.env.GRILLHOUSE_VERT_DIFFERE + '\\n');",
      "appendFileSync(process.env.JOURNAL, 'MARQUES ' + [process.env.GRILLHOUSE_GRAPHE_JOUE ? 'GRAPHE_JOUE' : '', process.env.GRILLHOUSE_PASSE_ROUGE ? 'PASSE_ROUGE' : ''].filter(Boolean).join(',') + '\\n');",
      `process.exitCode = Number(process.env.CODE_${nom} ?? 0);`,
    ].join('\n')
  );
  return f;
}

// A fake module <nom> whose components are the folders <dossiers> of the trial.
function module(
  nom: string,
  dossiers: string[],
  commandes = ['tester', 'verifier'],
  manifeste?: string
): Langage {
  const comps: Composant[] = dossiers.map(d => ({
    dossier: path.join(RACINE, d),
    nom: d,
    paquet: d,
  }));
  const script = outil(nom);
  return {
    nom,
    ...(manifeste ? { manifeste } : {}),
    composants: () => comps,
    estUnTest: () => null,
    commandes: () => Object.fromEntries(commandes.map(c => [c, { script, args: [c] }])),
  } as unknown as Langage;
}

const git = (...args: string[]) => spawnSync('git', ['-C', RACINE, ...args], { encoding: 'utf8' });
mkdirSync(path.join(RACINE, 'moteur/src'), { recursive: true });
mkdirSync(path.join(RACINE, 'site/tests'), { recursive: true });
writeFileSync(path.join(RACINE, 'moteur/src/lib.rs'), '');
writeFileSync(path.join(RACINE, 'site/tests/a.spec.ts'), '');
git('init', '-q', '-b', 'main');
git('add', '-A');
git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init');
const vert = () => path.join(RACINE, '.git/grillhouse/dernier-vert/main.json');

const CARGO = module('cargo', ['moteur'], ['tester', 'verifier', 'preparer']);
const TS = module('typescript', ['site'], ['tester', 'verifier'], 'package.json');
const MODULES = [CARGO, TS];

const lancer = (nom: string, args: string[], env: Record<string, string> = {}) =>
  jouer(nom, args, {
    racine: RACINE,
    modules: MODULES,
    env: { ...process.env, JOURNAL, ...env },
  });
const lignes = () => readFileSync(JOURNAL, 'utf8').split('\n').filter(Boolean);
const journal = () => lignes().filter(l => !l.startsWith('DIFFERE') && !l.startsWith('MARQUES'));
// The marks each module received, in the order they played: '' for none.
const marques = () =>
  lignes()
    .filter(l => l.startsWith('MARQUES'))
    .map(l => l.slice('MARQUES '.length));
const differes = () => lignes().filter(l => l.startsWith('DIFFERE'));

beforeEach(() => {
  writeFileSync(JOURNAL, '');
  rmSync(vert(), { force: true });
});

describe('grillhouse-akd, critère 3 — chaque module joue ses composants, un seul verdict', () => {
  it('npm test -- <chemins>: each path to the module of its component, the options to each', () => {
    expect(lancer('tester', ['site/tests/a.spec.ts', 'moteur/src/lib.rs', '--force'])).toBe(0);
    expect(journal()).toEqual([
      'cargo tester moteur/src/lib.rs --force',
      'typescript tester site/tests/a.spec.ts --force',
    ]);
  });

  it('a path of one language alone plays that module alone', () => {
    expect(lancer('tester', ['site/tests/a.spec.ts'])).toBe(0);
    expect(journal()).toEqual(['typescript tester site/tests/a.spec.ts']);
  });

  it('without a path, every module plays', () => {
    expect(lancer('tester', [])).toBe(0);
    expect(journal()).toEqual(['cargo tester', 'typescript tester']);
  });

  it('a red of one module makes the whole red, the other module played all the same', () => {
    expect(lancer('tester', [], { CODE_cargo: '1' })).toBe(1);
    expect(journal()).toEqual(['cargo tester', 'typescript tester']);
    expect(lancer('tester', [], { CODE_typescript: '2' })).toBe(2);
  });

  it('« à repasser » of one module and green of the other: à repasser; with a red: red', () => {
    expect(lancer('tester', [], { CODE_typescript: '75' })).toBe(75);
    expect(lancer('tester', [], { CODE_typescript: '75', CODE_cargo: '1' })).toBe(1);
  });

  it('a path no module’s component holds is refused, named, and nothing plays', () => {
    expect(lancer('tester', ['ailleurs/x.txt'])).toBe(2);
    expect(journal()).toEqual([]);
  });

  it('a command one module alone has plays in that module alone', () => {
    expect(lancer('preparer', [])).toBe(0);
    expect(journal()).toEqual(['cargo preparer']);
  });

  it('grillhouse-44b.5 critère 9: no module is given a file of deferred greens, whatever the command', () => {
    expect(lancer('verifier', ['--tout'])).toBe(0);
    expect(lancer('tester', [])).toBe(0);
    expect(differes()).toEqual([]);
  });

  it('grillhouse-44b.5 critère 9: the composed command keeps no green itself, green or red', () => {
    expect(lancer('verifier', ['--tout'])).toBe(0);
    expect(journal()).toEqual(['cargo verifier --tout', 'typescript verifier --tout']);
    expect(existsSync(vert())).toBe(false);
    expect(lancer('verifier', [], { CODE_typescript: '1' })).toBe(1);
    expect(existsSync(vert())).toBe(false);
  });
});

// grillhouse-44b.5, critère 9 — « une fois » et « jamais quand l'une est rouge » : sous `verifier`,
// le module du graphe (package.json) passe sur toutes les tâches, les autres reçoivent
// GRILLHOUSE_GRAPHE_JOUE et ne les rejouent pas ; un module qui joue après un rouge reçoit
// GRILLHOUSE_PASSE_ROUGE, et la passe ne pose alors aucun vert.
describe('grillhouse-44b.5 critère 9 — les marques GRAPHE_JOUE et PASSE_ROUGE', () => {
  it('verifier: le module hors package.json reçoit GRAPHE_JOUE, celui du graphe non', () => {
    expect(lancer('verifier', [])).toBe(0);
    expect(marques()).toEqual(['GRAPHE_JOUE', '']);
  });

  it('tester: aucun module ne reçoit GRAPHE_JOUE', () => {
    expect(lancer('tester', [])).toBe(0);
    expect(marques()).toEqual(['', '']);
  });

  it('verifier sans module du graphe (package.json): aucun GRAPHE_JOUE', () => {
    expect(
      jouer('verifier', [], {
        racine: RACINE,
        modules: [CARGO],
        env: { ...process.env, JOURNAL },
      })
    ).toBe(0);
    expect(marques()).toEqual(['']);
  });

  it('un module qui joue après un module rouge reçoit PASSE_ROUGE, le rouge et ceux d’avant non', () => {
    expect(lancer('verifier', [], { CODE_cargo: '1' })).toBe(1);
    expect(marques()).toEqual(['GRAPHE_JOUE', 'PASSE_ROUGE']);
  });

  it('deux verts à la suite: aucun PASSE_ROUGE', () => {
    expect(lancer('verifier', [])).toBe(0);
    expect(marques().join(',')).not.toMatch(/PASSE_ROUGE/);
  });

  it('un rouge du dernier module ne marque personne', () => {
    expect(lancer('verifier', [], { CODE_typescript: '1' })).toBe(1);
    expect(marques().join(',')).not.toMatch(/PASSE_ROUGE/);
  });
});
