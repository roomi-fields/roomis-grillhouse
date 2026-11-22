// The difference of the reference files a lot changes (scripts/references-changees.mjs), as the
// review of a snapshot (Jest, insta, the goldens of Chromium) shows the difference of each file
// and accepts or sends it back: measured by git on the tree, summarised by name of field for a
// JSON file, read by the reviewer (consigne and sheet) and named in the commit message.
//
// Small tests: the summaries are pure; the git measure reads a repository of trial.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { messageDuLot } from '../../scripts/activites.mjs';
import { conformiteDuLot } from '../../scripts/resultats.mjs';
import { consigne } from '../../scripts/seances.mjs';

interface Champ {
  champ: string;
  changees: number;
  ajoutees: number;
  retirees: number;
}
interface Difference {
  fichier: string;
  ajoutees: number;
  retirees: number;
  champs: Champ[] | null;
}
// Loaded by its whole path: a module not yet written leaves each test red on its own.
const MODULE = path.resolve(__dirname, '../../scripts/references-changees.mjs');
const modulee = (await import(/* @vite-ignore */ MODULE).catch(() => ({}))) as object;
const { resumeJson, differencesDesReferences, texteDesDifferences, ligneDesReferences } =
  modulee as unknown as {
    resumeJson: (avant: string, apres: string) => Champ[] | null;
    differencesDesReferences: (o: {
      copie: string;
      references: { fichiers: string[]; entiers?: string[] }[];
      base: string;
      lot: string;
    }) => Difference[];
    texteDesDifferences: (d: Difference[]) => string;
    ligneDesReferences: (d: Difference[]) => string;
  };

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'references-changees-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const git = (copie: string, ...args: string[]) =>
  execFileSync('git', ['-C', copie, ...args], { encoding: 'utf8' }).trim();
let n = 0;
const depot = (avant: Record<string, string>, apres: Record<string, string | null>) => {
  const copie = path.join(ESSAIS, `d${n++}`);
  mkdirSync(copie, { recursive: true });
  git(copie, 'init', '-q');
  git(copie, 'config', 'user.email', 'a@b.c');
  git(copie, 'config', 'user.name', 'essai');
  git(copie, 'config', 'commit.gpgsign', 'false');
  const ecrire = (fichiers: Record<string, string | null>) => {
    for (const [f, texte] of Object.entries(fichiers)) {
      const chemin = path.join(copie, f);
      if (texte === null) {
        rmSync(chemin);
      } else {
        mkdirSync(path.dirname(chemin), { recursive: true });
        writeFileSync(chemin, texte);
      }
    }
  };
  ecrire(avant);
  git(copie, 'add', '-A');
  git(copie, 'commit', '-q', '-m', 'base');
  const base = git(copie, 'rev-parse', 'HEAD');
  ecrire(apres);
  git(copie, 'add', '-A');
  git(copie, 'commit', '-q', '-m', 'lot', '--allow-empty');
  return { copie, base, lot: git(copie, 'rev-parse', 'HEAD') };
};

describe('le résumé de la différence d’un fichier de référence JSON', () => {
  it('compte, par nom de champ, les valeurs changées', () => {
    const avant = JSON.stringify({ scenes: [{ dates: 1 }, { dates: 2 }, { dates: 3 }] });
    const apres = JSON.stringify({ scenes: [{ dates: 9 }, { dates: 8 }, { dates: 3 }] });
    expect(resumeJson(avant, apres)).toEqual([
      { champ: 'dates', changees: 2, ajoutees: 0, retirees: 0 },
    ]);
  });

  it('compte les valeurs ajoutées et retirées de chaque champ', () => {
    const avant = JSON.stringify({ a: { x: 1, y: 2 }, b: 'k' });
    const apres = JSON.stringify({ a: { x: 1, z: 3 }, b: 'k' });
    const champs = resumeJson(avant, apres) ?? [];
    expect(champs).toHaveLength(2);
    expect(champs).toContainEqual({ champ: 'y', changees: 0, ajoutees: 0, retirees: 1 });
    expect(champs).toContainEqual({ champ: 'z', changees: 0, ajoutees: 1, retirees: 0 });
  });

  it('descend dans les objets imbriqués et ne rend aucun champ inchangé', () => {
    const doc = JSON.stringify({ a: { b: { c: [1, 2] } }, d: 'x' });
    expect(resumeJson(doc, doc)).toEqual([]);
    const apres = JSON.stringify({ a: { b: { c: [1, 5] } }, d: 'x' });
    expect(resumeJson(doc, apres)).toEqual([{ champ: 'c', changees: 1, ajoutees: 0, retirees: 0 }]);
  });

  it('compte l’élément ajouté ou retiré d’une liste sous le nom de son champ', () => {
    expect(resumeJson('{"l":[1]}', '{"l":[1,2,3]}')).toEqual([
      { champ: 'l', changees: 0, ajoutees: 2, retirees: 0 },
    ]);
    expect(resumeJson('{"l":[1,2,3]}', '{"l":[1]}')).toEqual([
      { champ: 'l', changees: 0, ajoutees: 0, retirees: 2 },
    ]);
  });

  it('rend null, sans échec, pour un texte qui n’est pas du JSON', () => {
    expect(resumeJson('# titre\n', '# autre\n')).toBeNull();
    expect(resumeJson('{"a":1}', 'pas du json')).toBeNull();
  });
});

describe('les fichiers de référence que le lot change, mesurés par git', () => {
  it('rend, par fichier de référence changé, ses lignes ajoutées et retirées', () => {
    const { copie, base, lot } = depot(
      { 'ref/sortie.txt': 'a\nb\nc\n', 'src/code.ts': 'x\n' },
      { 'ref/sortie.txt': 'a\nB\nc\nd\n', 'src/code.ts': 'y\n' }
    );
    const d = differencesDesReferences({
      copie,
      references: [{ fichiers: ['ref/**'] }],
      base,
      lot,
    });
    expect(d).toEqual([{ fichier: 'ref/sortie.txt', ajoutees: 2, retirees: 1, champs: null }]);
  });

  it('résume par champ un fichier JSON de référence', () => {
    const avant = JSON.stringify({ scenes: [{ dates: 1 }, { dates: 2 }] }, null, 2);
    const apres = JSON.stringify({ scenes: [{ dates: 5 }, { dates: 6 }] }, null, 2);
    const { copie, base, lot } = depot({ 'ref/s.json': avant }, { 'ref/s.json': apres });
    const [d] = differencesDesReferences({
      copie,
      references: [{ fichiers: ['ref/s.json'] }],
      base,
      lot,
    });
    expect(d.fichier).toBe('ref/s.json');
    expect(d.champs).toEqual([{ champ: 'dates', changees: 2, ajoutees: 0, retirees: 0 }]);
  });

  it('prend les fichiers déclarés entiers par une référence comme les autres', () => {
    const { copie, base, lot } = depot({ 'p/somme.txt': '1\n' }, { 'p/somme.txt': '2\n' });
    const d = differencesDesReferences({
      copie,
      references: [{ fichiers: ['rien/**'], entiers: ['p/somme.txt'] }],
      base,
      lot,
    });
    expect(d.map(x => x.fichier)).toEqual(['p/somme.txt']);
  });

  it('rend un fichier de référence ajouté ou supprimé par le lot', () => {
    const { copie, base, lot } = depot(
      { 'ref/vieux.txt': '1\n2\n' },
      { 'ref/vieux.txt': null, 'ref/neuf.txt': 'a\n' }
    );
    const d = differencesDesReferences({
      copie,
      references: [{ fichiers: ['ref/**'] }],
      base,
      lot,
    });
    expect(d.find(x => x.fichier === 'ref/neuf.txt')).toMatchObject({ ajoutees: 1, retirees: 0 });
    expect(d.find(x => x.fichier === 'ref/vieux.txt')).toMatchObject({ ajoutees: 0, retirees: 2 });
  });

  it('ne rend aucun fichier quand le lot ne change aucune référence', () => {
    const { copie, base, lot } = depot(
      { 'ref/s.txt': 'a\n', 'src/c.ts': 'x\n' },
      { 'src/c.ts': 'y\n' }
    );
    expect(
      differencesDesReferences({ copie, references: [{ fichiers: ['ref/**'] }], base, lot })
    ).toEqual([]);
  });
});

describe('le texte de la différence que lit le relecteur', () => {
  const diffs: Difference[] = [
    {
      fichier: 'ref/s.json',
      ajoutees: 12,
      retirees: 12,
      champs: [{ champ: 'dates', changees: 6, ajoutees: 0, retirees: 0 }],
    },
    { fichier: 'ref/t.txt', ajoutees: 3, retirees: 1, champs: null },
  ];

  it('écrit « aucun » quand le lot ne change aucune référence', () => {
    expect(texteDesDifferences([]).trim()).toBe('aucun');
  });

  it('nomme chaque fichier avec ses lignes ajoutées et retirées', () => {
    const t = texteDesDifferences(diffs);
    expect(t).toContain('ref/s.json');
    expect(t).toMatch(/\+12/);
    expect(t).toMatch(/[−-]12/);
    expect(t).toContain('ref/t.txt');
    expect(t).toMatch(/\+3/);
  });

  it('écrit par nom de champ le nombre de valeurs changées d’un JSON', () => {
    expect(texteDesDifferences(diffs)).toContain('dates : 6 changées');
  });

  it('écrit les valeurs ajoutées et retirées d’un champ', () => {
    const t = texteDesDifferences([
      {
        fichier: 'r.json',
        ajoutees: 2,
        retirees: 1,
        champs: [{ champ: 'z', changees: 0, ajoutees: 2, retirees: 1 }],
      },
    ]);
    expect(t).toContain('z : 2 ajoutées, 1 retirées');
  });
});

describe('le gabarit de la consigne du relecteur', () => {
  it('porte la section de la différence des fichiers de référence que le lot change', () => {
    const t = consigne({ differences: 'DIFFERENCE-DES-REFERENCES-ICI' }, 1);
    expect(t).toContain('DIFFERENCE-DES-REFERENCES-ICI');
    expect(t).toMatch(/FICHIERS DE RÉFÉRENCE/);
  });
});

describe('la ligne de conformité par fichier de référence changé', () => {
  const liste = { elements: [], fichiers: ['ref/s.json', 'src/c.ts'], references: ['ref/s.json'] };
  const ligne = (element: string) => ({
    element,
    conforme: 'oui',
    document: 'CADRE',
    reference: '§ Rend',
    piece: 'p',
  });

  it('refuse une fiche sans ligne pour un fichier de référence que le lot change', () => {
    expect(conformiteDuLot({ verdict: 'ACCEPTÉ', conformite: [] }, liste)).toMatch(/ref\/s\.json/);
  });

  it('accepte la fiche qui a la ligne du fichier, son chemin pour élément', () => {
    expect(
      conformiteDuLot({ verdict: 'ACCEPTÉ', conformite: [ligne('ref/s.json')] }, liste)
    ).toBeNull();
  });

  it('demande une ligne par fichier de référence changé', () => {
    const deux = {
      ...liste,
      references: ['ref/s.json', 'ref/t.json'],
      fichiers: ['ref/s.json', 'ref/t.json'],
    };
    const faute = conformiteDuLot({ verdict: 'ACCEPTÉ', conformite: [ligne('ref/s.json')] }, deux);
    expect(faute).toMatch(/ref\/t\.json/);
    expect(faute).not.toMatch(/ref\/s\.json/);
  });

  it('refuse la ligne d’un fichier de référence que le lot ne change pas', () => {
    expect(
      conformiteDuLot(
        { verdict: 'ACCEPTÉ', conformite: [ligne('ref/s.json'), ligne('ref/autre.json')] },
        liste
      )
    ).toMatch(/ref\/autre\.json n'est pas un élément du lot/);
  });

  it('n’exige aucune ligne de fichier quand le lot ne change aucune référence', () => {
    expect(
      conformiteDuLot(
        { verdict: 'ACCEPTÉ', conformite: [] },
        { elements: [], fichiers: ['src/c.ts'], references: [] }
      )
    ).toBeNull();
  });
});

describe('la ligne des références changées du message du commit', () => {
  const base = {
    entete: 'feat(x): Sujet (t-1)',
    description: '## Critères\n\n1. Un critère.\n',
    fiches: [],
  };
  const diffs: Difference[] = [
    { fichier: 'ref/a.json', ajoutees: 12, retirees: 4, champs: null },
    { fichier: 'ref/b.txt', ajoutees: 1, retirees: 0, champs: null },
  ];

  it('nomme les références changées, leur compte et leurs lignes', () => {
    const m = messageDuLot({ ...base, references: diffs });
    expect(m).toContain('Références changées (2) : ref/a.json (+12 −4), ref/b.txt (+1 −0)');
  });

  it('la ligne vient de ligneDesReferences, sur l’arbre du lot', () => {
    expect(ligneDesReferences(diffs)).toBe(
      'Références changées (2) : ref/a.json (+12 −4), ref/b.txt (+1 −0)'
    );
    expect(ligneDesReferences([])).toBe('');
  });

  it('n’écrit aucune ligne quand le lot ne change aucune référence', () => {
    expect(messageDuLot({ ...base, references: [] })).not.toContain('Références changées');
    expect(messageDuLot(base)).not.toContain('Références changées');
  });

  it('garde le trailer en dernier', () => {
    const lignes = messageDuLot({ ...base, references: diffs })
      .trim()
      .split('\n');
    expect(lignes.at(-1)).toMatch(/^Co-Authored-By:/);
  });
});
