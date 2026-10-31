// grillhouse-8o9, critères 1 et 3: a project declares its generated files under
// `grillhouse.engendres` of its package.json (scripts/engendres.mjs), as it declares its tools
// (`grillhouse.outils`); a faulty key is refused by its name before any work, the circuit's stop
// « lancement » included. The regeneration of a declared file names its command and its output when
// the command fails. Witness: OSC Bridge, 2026-10-31, four conflicts in one day on the generated
// files of synthhub (docs/SUPPORTED_DEVICES.md, docs/devices.json) and open-synth-descriptors
// (schemas/SHA256SUMS), each resolved by hand.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ARRETS, engendresAuLancement } from '../../scripts/circuit.mjs';
import { engendresDe, lireEngendres, regenerer, touchesPar } from '../../scripts/engendres.mjs';

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
