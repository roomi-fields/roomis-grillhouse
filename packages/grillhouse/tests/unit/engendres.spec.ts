// grillhouse-8o9, critères 1 et 3: a project declares its generated files under
// `grillhouse.engendres` of its package.json (scripts/engendres.mjs), as it declares its tools
// (`grillhouse.outils`); a faulty key is refused by its name before any work, the circuit's stop
// « lancement » included. The regeneration of a declared file names its command and its output when
// the command fails. Witness: OSC Bridge, 2026-10-31, four conflicts in one day on the generated
// files of synthhub (docs/SUPPORTED_DEVICES.md, docs/devices.json) and open-synth-descriptors
// (schemas/SHA256SUMS), each resolved by hand.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ARRETS, engendresAuLancement } from '../../scripts/circuit.mjs';
import {
  aRejouer,
  couvertPar,
  encoreDeclares,
  engendresDe,
  lireEngendres,
  partDesLots,
  poserLesRetires,
  prendreLesEngendres,
  regenerer,
  touchesPar,
} from '../../scripts/engendres.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'engendres-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const pkg = (engendres: unknown) => ({ name: 'essai', grillhouse: { engendres } });

// A project of trial <nom> whose package.json declares <engendres>.
function projet(nom: string, engendres: unknown): string {
  const dir = path.join(ESSAIS, nom);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg(engendres)));
  return dir;
}

const LISTE = {
  commande: 'node liste.mjs',
  fichiers: ['docs/liste.txt'],
  lit: ['src/**'],
};

describe('critère 1 — a project declares its generated files under grillhouse.engendres', () => {
  it('gives each declared file with its command, its files and what it reads, written in full', () => {
    expect(lireEngendres(pkg({ liste: LISTE }))).toEqual({
      engendres: [
        {
          nom: 'liste',
          commande: 'node liste.mjs',
          fichiers: ['docs/liste.txt'],
          lit: ['src/**'],
          gardes: [],
          entiers: ['docs/liste.txt'],
        },
      ],
      fautes: [],
    });
  });

  it('reads nothing without the key, and an empty `lit` when it is not given', () => {
    expect(lireEngendres({ name: 'x' })).toEqual({ engendres: [], fautes: [] });
    expect(
      lireEngendres(pkg({ sommes: { commande: 'sha256sum x > S', fichiers: ['S'] } })).engendres[0]
        ?.lit
    ).toEqual([]);
  });

  it.each([
    ['without a command', { x: { fichiers: ['a'] } }, /grillhouse\.engendres\.x.*commande/],
    ['without files', { x: { commande: 'true' } }, /grillhouse\.engendres\.x.*fichiers/],
    ['with empty files', { x: { commande: 'true', fichiers: [] } }, /grillhouse\.engendres\.x/],
    [
      'a file out of the repository',
      { x: { commande: 'true', fichiers: ['../ailleurs.txt'] } },
      /grillhouse\.engendres\.x.*« \.\.\/ailleurs\.txt ».*hors du dépôt/,
    ],
    [
      'an absolute file',
      { x: { commande: 'true', fichiers: ['/etc/passwd'] } },
      /grillhouse\.engendres\.x.*« \/etc\/passwd ».*hors du dépôt/,
    ],
    [
      'what it reads out of the repository',
      { x: { commande: 'true', fichiers: ['a'], lit: ['src/../../b'] } },
      /grillhouse\.engendres\.x.*hors du dépôt/,
    ],
    ['`lit` not a list', { x: { commande: 'true', fichiers: ['a'], lit: 'src' } }, /\.x\.lit/],
    ['an entry not an object', { x: 'true' }, /grillhouse\.engendres\.x/],
    ['a key not an object', ['x'], /grillhouse\.engendres vaut/],
  ])('refuses a key %s, by its name, and gives no generated file', (_cas, engendres, faute) => {
    const { engendres: lus, fautes } = lireEngendres(pkg(engendres));
    expect(lus).toEqual([]);
    expect(fautes.join('\n')).toMatch(faute);
  });

  it('throws every fault of the key of the project at <dir>', () => {
    expect(() => engendresDe(projet('fautive', { x: { fichiers: ['a'] } }))).toThrow(
      /grillhouse\.engendres\.x/
    );
    expect(engendresDe(projet('valide', { liste: LISTE }))).toHaveLength(1);
  });

  it('stops the circuit at its launch, « lancement », before any session, the key named', () => {
    expect(engendresAuLancement(projet('lancement-valide', { liste: LISTE }))).toMatchObject({
      engendres: [{ nom: 'liste' }],
    });
    const { arret, engendres } = engendresAuLancement(
      projet('lancement-fautif', { x: { commande: 'true' } })
    );
    expect(engendres).toBeUndefined();
    expect(arret).toMatchObject({ code: ARRETS.lancement, nom: 'lancement' });
    for (const t of [arret?.rapport, arret?.piece, arret?.question]) {
      expect(t).toContain('grillhouse.engendres.x');
    }
  });
});

describe('critère 2 — a lot that touches a declared file, or what it reads, regenerates it', () => {
  const [liste] = lireEngendres(pkg({ liste: LISTE })).engendres;
  it('is touched by its file or by what it reads, not by another file', () => {
    expect(touchesPar([liste], ['docs/liste.txt'])).toEqual([liste]);
    expect(touchesPar([liste], ['src/d/index.ts'])).toEqual([liste]);
    expect(touchesPar([liste], ['README.md'])).toEqual([]);
  });
});

describe('critère 3 — a command that fails stops, the command and its output named', () => {
  // The tree stood in: git's status before and after the commands, and each git call recorded.
  // The real commands on a real tree are the night's (packages/grillhouse-essais/tests/
  // integrer.engendres.nuit.spec.ts).
  function arbre(avant: string[], apres: string[]) {
    const appels: string[][] = [];
    let statuts = 0;
    const dansCopie = (...a: string[]) => {
      appels.push(a);
      const lignes = a[0] === 'status' ? (statuts++ === 0 ? avant : apres) : [];
      return { status: 0, stdout: lignes.map(l => `${l}\0`).join(''), stderr: '' } as never;
    };
    return { appels, dansCopie };
  }
  const resultat = (status: number, stdout = '', stderr = '') =>
    ({ status, stdout, stderr, signal: null, error: undefined }) as never;
  const liste = () => ({ ...lireEngendres(pkg({ liste: LISTE })).engendres[0], cadre: false });

  it('refuses, naming the declared file, its command, its code and its output', () => {
    const t = arbre([], []);
    const commande = 'python3 scripts/liste.py';
    const refus = regenerer({
      refs: [{ ...liste(), commande }],
      lancer: () => resultat(3, '', 'la source b est illisible\n'),
      dansCopie: t.dansCopie,
    });
    expect(refus).toContain('liste');
    expect(refus).toContain(commande);
    expect(refus).toContain('3');
    expect(refus).toContain('la source b est illisible');
  });

  it('stages the declared file it writes, and refuses a file it does not declare', () => {
    const t = arbre(['M  src/d/index.ts'], ['M  src/d/index.ts', ' M docs/liste.txt']);
    expect(
      regenerer({
        refs: [liste()],
        lancer: () => resultat(0),
        dansCopie: t.dansCopie,
        ecrire: () => {},
      })
    ).toBeNull();
    expect(t.appels).toContainEqual(['add', '-A', '--', 'docs/liste.txt']);
    const autre = arbre([], ['?? autre.txt']);
    const refus = regenerer({
      refs: [liste()],
      lancer: () => resultat(0),
      dansCopie: autre.dansCopie,
      ecrire: () => {},
    });
    expect(refus).toContain('autre.txt');
    expect(autre.appels.some(a => a[0] === 'add')).toBe(false);
  });
});

// A generated file a lot removes from the key, with its command, is not played on the tree where
// the lot is applied, and its files follow the lot. Witness: SyntHub, 2026-11-17, SH-br0.3, refused
// at the integration on the command of « devices-json », whose script its lot deletes.
describe('les fichiers qu’une référence couvre', () => {
  it('un chemin, un dossier ou un motif (*, **) couvre un fichier, lu comme les entrées de Turborepo', () => {
    expect(couvertPar(['reference.txt'], 'reference.txt')).toBe(true);
    expect(couvertPar(['reference.txt'], 'autre/reference.txt')).toBe(false);
    expect(couvertPar(['src/empreinte'], 'src/empreinte/a/une.json')).toBe(true);
    expect(couvertPar(['src/empreinte/'], 'src/empreinte/une.json')).toBe(true);
    expect(couvertPar(['src/empreinte'], 'src/empreinte-v2/une.json')).toBe(false);
    expect(couvertPar(['src/empreinte/*.json'], 'src/empreinte/une.json')).toBe(true);
    expect(couvertPar(['src/empreinte/*.json'], 'src/empreinte/a/une.json')).toBe(false);
    expect(couvertPar(['src/empreinte/*.json'], 'src/empreinte/une.txt')).toBe(false);
    expect(couvertPar(['packages/**/empreinte/**'], 'packages/tools/src/empreinte/a/b.json')).toBe(
      true
    );
    expect(couvertPar(['a.txt', 'src/**/*.json'], 'src/x/y.json')).toBe(true);
    expect(couvertPar([], 'reference.txt')).toBe(false);
  });
});

describe('a generated file the applied tree no longer declares follows the lot', () => {
  const git = (dossier: string, ...args: string[]) =>
    spawnSync('git', ['-C', dossier, ...args], { encoding: 'utf8' });
  const ok = (dossier: string, ...args: string[]) => {
    const r = git(dossier, ...args);
    if (r.status !== 0) {
      throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
    }
    return r.stdout.trim();
  };
  const DEUX = [
    { nom: 'liste', entiers: ['docs/liste.txt'] },
    { nom: 'index', entiers: ['docs/index.json'] },
  ];
  // A repository of trial: the two generated files committed, then main writes the list again.
  function depot(nom: string) {
    const dir = path.join(ESSAIS, nom);
    mkdirSync(path.join(dir, 'docs'), { recursive: true });
    ok(dir, 'init', '-q', '-b', 'main');
    ok(dir, 'config', 'user.email', 'essai@example.com');
    ok(dir, 'config', 'user.name', 'essai');
    writeFileSync(path.join(dir, 'docs/liste.txt'), 'a\n');
    writeFileSync(path.join(dir, 'docs/index.json'), '{"a":1}\n');
    ok(dir, 'add', '-A');
    ok(dir, 'commit', '-qm', 'base');
    return dir;
  }
  const surMain = (dir: string) => {
    writeFileSync(path.join(dir, 'docs/liste.txt'), 'a\nb\n');
    writeFileSync(path.join(dir, 'docs/index.json'), '{"a":1,"b":2}\n');
    ok(dir, 'commit', '-qam', 'main');
  };

  it('keeps the generated files the tree declares by name, all of them when it does not read', () => {
    const tous = projet('declares-tous', { liste: LISTE, index: LISTE });
    const un = projet('declares-un', { index: LISTE });
    const sansCle = path.join(ESSAIS, 'declares-sans-cle');
    mkdirSync(sansCle, { recursive: true });
    writeFileSync(path.join(sansCle, 'package.json'), '{"name":"essai"}');
    const illisible = path.join(ESSAIS, 'declares-illisible');
    mkdirSync(illisible, { recursive: true });
    writeFileSync(path.join(illisible, 'package.json'), '<<<<<<< ours\n{}\n');
    expect(encoreDeclares(DEUX, tous)).toEqual(DEUX);
    expect(encoreDeclares(DEUX, un)).toEqual([DEUX[1]]);
    expect(encoreDeclares(DEUX, sansCle)).toEqual([]);
    expect(encoreDeclares(DEUX, illisible)).toEqual(DEUX);
    expect(encoreDeclares(DEUX, path.join(ESSAIS, 'declares-absent'))).toEqual(DEUX);
  });

  it('reads a package.json in conflict at its two versions: the lot removes what its base declares and it does not', () => {
    const conflit = path.join(ESSAIS, 'declares-conflit');
    mkdirSync(conflit, { recursive: true });
    writeFileSync(path.join(conflit, 'package.json'), '<<<<<<< ours\n{}\n');
    const texte = (noms: string[]) =>
      JSON.stringify(pkg(Object.fromEntries(noms.map(n => [n, LISTE]))));
    const etages = (base: string[], lot: string[]) => () => ({
      base: texte(base),
      lot: texte(lot),
    });
    expect(encoreDeclares(DEUX, conflit, etages(['liste', 'index'], ['index']))).toEqual([DEUX[1]]);
    // An entry main added since the base of the lot stays declared.
    expect(encoreDeclares(DEUX, conflit, etages(['index'], ['index']))).toEqual(DEUX);
    expect(encoreDeclares(DEUX, conflit, () => ({ base: '', lot: '' }))).toEqual(DEUX);
  });

  it('gives the integration its part: the files that follow the lots, the references whose commands play', () => {
    const arbre = projet('part-des-lots', { index: LISTE });
    const liste = { nom: 'liste', entiers: ['docs/liste.txt', 'docs/commun.txt'] };
    const index = { nom: 'index', entiers: ['docs/index.json'] };
    // A reference of the frame under the name of a generated file the tree does not declare.
    const cadre = { nom: 'liste', entiers: ['docs/INTERFACES.md', 'docs/commun.txt'] };
    const part = partDesLots({
      references: [liste, index, cadre],
      duProjet: [liste, index],
      entiers: ['docs/liste.txt', 'docs/commun.txt', 'docs/index.json', 'docs/INTERFACES.md'],
      touchees: [liste, index, cadre],
      arbre,
    });
    expect(part.suivis).toEqual(['docs/liste.txt']);
    expect(part.rejouees).toEqual([index, cadre]);
  });

  it('gives the queue the generated files to play: those the lot touches that the tree still declares', () => {
    const arbre = projet('a-rejouer', { index: LISTE });
    const liste = { nom: 'liste', entiers: ['docs/liste.txt'], lit: ['src/**'] };
    const index = { nom: 'index', entiers: ['docs/index.json'], lit: ['src/**'] };
    expect(aRejouer([liste, index], arbre, ['src/a.txt'])).toEqual([index]);
    expect(aRejouer([liste, index], arbre, ['autre.txt'])).toEqual([]);
  });

  it('applies the files a lot left out: a deletion whatever main wrote since, another change three ways', () => {
    const dir = depot('poser');
    const base = ok(dir, 'rev-parse', 'HEAD');
    ok(dir, 'rm', '-q', 'docs/liste.txt');
    writeFileSync(path.join(dir, 'docs/index.json'), '{"a":1}\n{"main":0}\n');
    ok(dir, 'commit', '-qam', 'lot');
    const lot = path.join(ESSAIS, 'poser.patch');
    writeFileSync(lot, git(dir, 'diff', '--binary', base, 'HEAD').stdout);
    ok(dir, 'reset', '-q', '--hard', base);
    writeFileSync(path.join(dir, 'docs/liste.txt'), 'a\nb\n');
    ok(dir, 'commit', '-qam', 'main');
    const refus = poserLesRetires({
      lots: [lot],
      fichiers: ['docs/liste.txt', 'docs/index.json'],
      dansCopie: (...args) => git(dir, ...args),
    });
    expect(refus).toBeNull();
    expect(ok(dir, 'status', '--porcelain')).toBe('M  docs/index.json\nD  docs/liste.txt');
    expect(
      poserLesRetires({ lots: [lot], fichiers: [], dansCopie: () => git(dir, 'x') })
    ).toBeNull();
  });

  it('refuses, the lot named, a change that does not apply to main’s version', () => {
    const dir = depot('poser-conflit');
    const base = ok(dir, 'rev-parse', 'HEAD');
    writeFileSync(path.join(dir, 'docs/liste.txt'), 'lot\n');
    ok(dir, 'commit', '-qam', 'lot');
    const lot = path.join(ESSAIS, 'poser-conflit.patch');
    writeFileSync(lot, git(dir, 'diff', '--binary', base, 'HEAD').stdout);
    ok(dir, 'reset', '-q', '--hard', base);
    surMain(dir);
    const refus = poserLesRetires({
      lots: [lot],
      fichiers: ['docs/liste.txt'],
      dansCopie: (...args) => git(dir, ...args),
    });
    expect(refus).toContain(`Le lot ${lot} ne s'applique pas`);
  });

  it('resolves the conflicts of a rebase: main’s version for a file still declared, the branch’s deletion for one removed', () => {
    const dir = depot('prendre');
    ok(dir, 'checkout', '-q', '-b', 'agent/demo-1');
    ok(dir, 'rm', '-q', 'docs/liste.txt');
    writeFileSync(path.join(dir, 'docs/index.json'), '{"a":1,"c":3}\n');
    ok(dir, 'commit', '-qam', 'lot');
    ok(dir, 'checkout', '-q', 'main');
    surMain(dir);
    ok(dir, 'checkout', '-q', 'agent/demo-1');
    expect(git(dir, 'rebase', 'main').status).not.toBe(0);
    const conflits = ok(dir, 'diff', '--name-only', '--diff-filter=U').split('\n').sort();
    expect(conflits).toEqual(['docs/index.json', 'docs/liste.txt']);
    const resolu = prendreLesEngendres({
      conflits,
      vivants: [DEUX[1]],
      dansCopie: (...args) => git(dir, ...args),
    });
    expect(resolu).toBe(true);
    expect(git(dir, '-c', 'core.editor=true', 'rebase', '--continue').status).toBe(0);
    expect(existsSync(path.join(dir, 'docs/liste.txt'))).toBe(false);
    expect(readFileSync(path.join(dir, 'docs/index.json'), 'utf8')).toBe('{"a":1,"b":2}\n');
  });
});
