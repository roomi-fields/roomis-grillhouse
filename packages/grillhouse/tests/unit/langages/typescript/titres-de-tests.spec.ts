// The guard of the titles of tests (scripts/langages/typescript/titres-de-tests.mjs): a test bears
// the name of the behavior it proves, never a ticket's or a « critère N » (Software Engineering at
// Google, ch. 12: one test per behavior). The guard counts, per Vitest file, the titles that name a
// ticket of the project or a « critère N » (a union: a title counts once), judges the count against
// the debt inscribed file by file, and refuses a count that rises or a debt left above the count.
// The texts of the cases lie in files of their own (tests/formes/titres/), so that the reading of
// this file sees no title that names a ticket. The guard is called in process: the trial
// repositories take git alone, so the file is medium, not large.
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lire as lireDette } from '../../../../scripts/dette.mjs';
import { gardesDuCadre } from '../../../../scripts/gardes-du-cadre.mjs';
import { commandeDe } from '../../../../scripts/sous-commandes.mjs';

// The guard is loaded in beforeAll, so that a missing module fails each test by its reason.
const SCRIPT = path.resolve(
  __dirname,
  '../../../../scripts/langages/typescript/titres-de-tests.mjs'
);
type Constat = { fichier: string; ligne?: number; regle: string; message: string };
type Refus = { fichier: string; message: string };
interface Garde {
  jugerLesTitres: (...a: unknown[]) => Refus[];
  prefixe: (...a: unknown[]) => string;
  renommesDuLot: (...a: unknown[]) => Record<string, string>;
  titresNommantUnTicket: (...a: unknown[]) => { titre: string; ligne: number }[];
  verifier: (...a: unknown[]) => Constat[];
}
let mod: Garde = new Proxy({} as Garde, {
  get: () => () => {
    throw new Error(`le module ${SCRIPT} ne se charge pas`);
  },
});
beforeAll(async () => {
  try {
    mod = (await import(/* @vite-ignore */ SCRIPT)) as Garde;
  } catch {
    // The proxy above fails each test that calls the guard.
  }
});
const GARDE = 'titres-de-tests';
const REGLE = 'titre-nommant-un-ticket';
const jugerLesTitres = (...a: unknown[]) => mod.jugerLesTitres(...a);
const prefixe = (...a: unknown[]) => mod.prefixe(...a);
const renommesDuLot = (...a: unknown[]) => mod.renommesDuLot(...a);
const titresNommantUnTicket = (...a: unknown[]) => mod.titresNommantUnTicket(...a);
const verifier = (...a: unknown[]) => mod.verifier(...a);

const DEPOT = path.resolve(__dirname, '../../../../../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'titres-de-tests-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const forme = (f: string) =>
  readFileSync(path.join(__dirname, '../../../formes/titres', f), 'utf8');
const TITRES = forme('titres.txt');
const SANS_TICKET = forme('sans-ticket.txt');
const DEUX_TITRES = forme('deux-titres.txt');
const RUST_PYTHON = forme('rust-python.txt');

// The lines of <texte> that end with the mark `// compté`, 1-based.
const lignesMarquees = (texte: string) =>
  texte.split('\n').flatMap((l, i) => (l.trimEnd().endsWith('// compté') ? [i + 1] : []));

const lignesVues = (texte: string, prefixe: string) =>
  (titresNommantUnTicket(texte, prefixe) as { titre: string; ligne: number }[]).map(t => t.ligne);

describe('the titles that name a ticket or a « critère N », read from the text of a test', () => {
  it('counts the titles of describe, it, test and their variants that name a ticket or a critère, each once', () => {
    expect(lignesVues(TITRES, 'tck')).toEqual(lignesMarquees(TITRES));
  });

  it('counts a title that names both a ticket and a critère once', () => {
    const vus = lignesVues(TITRES, 'tck');
    const ligne = TITRES.split('\n').findIndex(l => l.includes('les deux')) + 1;
    expect(vus.filter(l => l === ligne)).toHaveLength(1);
  });

  it('counts no title that names neither', () => {
    expect(lignesVues(SANS_TICKET, 'tck')).toEqual([]);
  });

  it('reads the prefix of the project: the ticket of another prefix is no ticket, a critère still counts', () => {
    const attendues = TITRES.split('\n').flatMap((l, i) =>
      l.includes('// compté') && /critères?\s+\d/i.test(l) ? [i + 1] : []
    );
    expect(lignesVues(TITRES, 'autre')).toEqual(attendues);
  });

  it('does not see a title carried by a variable, nor one in a comment', () => {
    const texte = "const nom = 'tck-1';\nit(nom, () => {});\n// it('tck-2 commenté', () => {});\n";
    expect(lignesVues(texte, 'tck')).toEqual([]);
  });

  it('sees the fixed parts of a template and the format of an each', () => {
    const texte =
      "it(`tck-4 ${a} fin`, () => {});\nit.each([1])('critère 5 %s', () => {});\ndescribe.each([1])('tck-6 $a', () => {});\n";
    expect(lignesVues(texte, 'tck')).toEqual([1, 2, 3]);
  });
});

// A trial repository whose files are <fichiers>, git's listing taking them (tracked or not).
function depot(fichiers: Record<string, string>) {
  const r = mkdtempSync(path.join(ESSAIS, 'depot-'));
  spawnSync('git', ['init', '-q', r]);
  writeFileSync(path.join(r, '.gitignore'), 'node_modules/\n');
  for (const [f, t] of Object.entries(fichiers)) {
    mkdirSync(path.dirname(path.join(r, f)), { recursive: true });
    writeFileSync(path.join(r, f), t);
  }
  return r;
}

const comptes = (constats: Constat[]) => {
  const out: Record<string, number> = {};
  for (const c of constats) {
    out[c.fichier] = (out[c.fichier] ?? 0) + 1;
  }
  return out;
};

describe('the count of the project, file by file', () => {
  it('counts per file the titles of the Vitest files of every component, the night tests included', () => {
    const r = depot({
      'tests/a.test.ts': DEUX_TITRES,
      'tests/b.spec.ts': SANS_TICKET,
      'packages/x/tests/c.nuit.test.ts': DEUX_TITRES,
      'packages/y/src/d.spec.js': DEUX_TITRES,
      'node_modules/z/e.test.ts': DEUX_TITRES,
    });
    const constats = verifier(r, 'tck');
    expect(comptes(constats)).toEqual({
      'tests/a.test.ts': 2,
      'packages/x/tests/c.nuit.test.ts': 2,
      'packages/y/src/d.spec.js': 2,
    });
    expect(new Set(constats.map(c => c.regle))).toEqual(new Set([REGLE]));
  });

  it('leaves the Rust and Python tests out of the count: their titles are function names', () => {
    const r = depot({
      'crates/k/tests/e_nuit.rs': RUST_PYTHON,
      'pkg/tests/test_k.py': RUST_PYTHON,
      'pkg/tests/k_test.py': RUST_PYTHON,
    });
    expect(verifier(r, 'tck')).toEqual([]);
  });

  it('gives each finding its file, its line and a message that names the behavior', () => {
    const r = depot({ 'tests/a.test.ts': DEUX_TITRES });
    const constats = verifier(r, 'tck');
    expect(constats.map(c => c.ligne)).toEqual([3, 4]);
    expect(constats[0]?.message).toMatch(/comportement qu'il prouve/);
    expect(constats[0]?.message).toMatch(/message du commit/);
  });
});

describe('the files a lot moves or renames', () => {
  const valider = (r: string) => {
    spawnSync('git', ['-C', r, 'add', '-A']);
    spawnSync('git', ['-C', r, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'x']);
  };

  it('gives the former name of a test file renamed in the working copy, its content kept', () => {
    const r = depot({ 'tests/ancien.test.ts': DEUX_TITRES, 'tests/autre.test.ts': SANS_TICKET });
    valider(r);
    mkdirSync(path.join(r, 'tests/sous'));
    renameSync(path.join(r, 'tests/ancien.test.ts'), path.join(r, 'tests/sous/neuf.test.ts'));
    expect(renommesDuLot(r)).toEqual({ 'tests/sous/neuf.test.ts': 'tests/ancien.test.ts' });
  });

  it('gives nothing for a lot that renames no file', () => {
    const r = depot({ 'tests/a.test.ts': DEUX_TITRES });
    valider(r);
    writeFileSync(path.join(r, 'tests/b.test.ts'), SANS_TICKET);
    expect(renommesDuLot(r)).toEqual({});
  });
});

const dette = (parFichier: Record<string, number>) => ({
  [GARDE]: Object.fromEntries(
    Object.entries(parFichier).map(([f, count]) => [f, { [REGLE]: { count } }])
  ),
});
const constatsDe = (parFichier: Record<string, number>): Constat[] =>
  Object.entries(parFichier).flatMap(([fichier, n]) =>
    Array.from({ length: n }, (_, i) => ({
      fichier,
      ligne: i + 1,
      regle: REGLE,
      message: 'titre',
    }))
  );
const juger = (inscrit: Record<string, number>, trouve: Record<string, number>, renommes = {}) =>
  jugerLesTitres(dette(inscrit), constatsDe(trouve), renommes);

describe('the debt inscribed file by file', () => {
  it('passes a count equal to the debt of its file', () => {
    expect(juger({ 'tests/a.test.ts': 3 }, { 'tests/a.test.ts': 3 })).toEqual([]);
  });

  it('refuses by name a file whose count rises above its debt', () => {
    const refus = juger(
      { 'tests/a.test.ts': 3, 'tests/b.test.ts': 1 },
      {
        'tests/a.test.ts': 4,
        'tests/b.test.ts': 1,
      }
    );
    expect(refus.map(r => r.fichier)).toEqual(['tests/a.test.ts']);
  });

  it('refuses by name a file absent from the debt that counts a title', () => {
    const refus = juger(
      { 'tests/a.test.ts': 1 },
      { 'tests/a.test.ts': 1, 'tests/neuf.test.ts': 1 }
    );
    expect(refus.map(r => r.fichier)).toEqual(['tests/neuf.test.ts']);
  });

  it('passes a file absent from the debt that counts none', () => {
    expect(juger({ 'tests/a.test.ts': 1 }, { 'tests/a.test.ts': 1 })).toEqual([]);
  });

  it('refuses a debt above the real count, by the name of its file, so that the lot lowers it', () => {
    const refus = juger({ 'tests/a.test.ts': 3 }, { 'tests/a.test.ts': 2 });
    expect(refus.map(r => r.fichier)).toEqual(['tests/a.test.ts']);
    expect(refus[0]?.message).toMatch(/dette/);
  });

  it('refuses a debt inscribed for a file that counts none any more', () => {
    const refus = juger({ 'tests/a.test.ts': 2, 'tests/b.test.ts': 1 }, { 'tests/a.test.ts': 2 });
    expect(refus.map(r => r.fichier)).toEqual(['tests/b.test.ts']);
  });

  it('lets a file moved or renamed take the debt of its former name, its count not risen', () => {
    const renommes = { 'tests/neuf.test.ts': 'tests/ancien.test.ts' };
    expect(juger({ 'tests/ancien.test.ts': 3 }, { 'tests/neuf.test.ts': 3 }, renommes)).toEqual([]);
  });

  it('refuses by name a file moved or renamed whose count rose above its former debt', () => {
    const renommes = { 'tests/neuf.test.ts': 'tests/ancien.test.ts' };
    const refus = juger({ 'tests/ancien.test.ts': 3 }, { 'tests/neuf.test.ts': 4 }, renommes);
    expect(refus.map(r => r.fichier)).toEqual(['tests/neuf.test.ts']);
  });

  it('refuses a file moved or renamed whose former debt stays above its lowered count', () => {
    const renommes = { 'tests/neuf.test.ts': 'tests/ancien.test.ts' };
    const refus = juger({ 'tests/ancien.test.ts': 3 }, { 'tests/neuf.test.ts': 2 }, renommes);
    expect(refus.map(r => r.fichier)).toEqual(['tests/neuf.test.ts']);
  });

  it('judges a debt that does not hold the guard as no debt at all', () => {
    const refus = jugerLesTitres({}, constatsDe({ 'tests/a.test.ts': 1 }), {});
    expect(refus.map(r => r.fichier)).toEqual(['tests/a.test.ts']);
  });

  it('says in each refusal to name the test by the behavior it proves, the ticket going to the commit message', () => {
    const refus = juger({}, { 'tests/a.test.ts': 1 });
    expect(refus[0]?.message).toMatch(/comportement qu'il prouve/);
    expect(refus[0]?.message).toMatch(/message du commit/);
  });

  it('writes in each refusal that the Rust and Python tests are out of the count', () => {
    const refus = juger({}, { 'tests/a.test.ts': 1 });
    expect(refus[0]?.message).toMatch(/Rust/);
    expect(refus[0]?.message).toMatch(/Python/);
  });
});

const CONFIG_BEADS = '.beads/config.yaml';
// A directory with <contenu> as the file of Beads (none when <contenu> is null).
const racineBeads = (contenu: string | null) => {
  const r = mkdtempSync(path.join(ESSAIS, 'beads-'));
  if (contenu !== null) {
    mkdirSync(path.join(r, '.beads'));
    writeFileSync(path.join(r, CONFIG_BEADS), contenu);
  }
  return r;
};
// Runs <f> with a PATH that holds no `bd`, then puts the PATH back.
const sansBd = <T>(f: () => T): T => {
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
  symlinkSync(process.execPath, path.join(bin, 'node'));
  const avant = process.env.PATH;
  process.env.PATH = `${bin}:/usr/bin:/bin`;
  try {
    return f();
  } finally {
    process.env.PATH = avant;
  }
};

describe('the prefix of the tickets, read from the committed file of Beads, never from `bd`', () => {
  it('reads the prefix of the key `issue-prefix`, quoted or not', () => {
    expect(prefixe(racineBeads('issue-prefix: "tck"\n'))).toBe('tck');
    expect(prefixe(racineBeads("issue-prefix: 'tck'\n"))).toBe('tck');
    expect(prefixe(racineBeads('no-db: false\nissue-prefix: tck # le projet\n'))).toBe('tck');
  });

  it('answers the same with `bd` absent from the PATH as with it present', () => {
    const r = racineBeads('issue-prefix: "tck"\n');
    expect(sansBd(() => prefixe(r))).toBe(prefixe(r));
  });

  it('counts the same titles of Grillhouse with `bd` absent from the PATH as with it present', () => {
    const compter = () => verifier(DEPOT, prefixe(DEPOT)).length;
    const avec = compter();
    expect(avec).toBeGreaterThan(0);
    expect(sansBd(compter)).toBe(avec);
  });

  it('says by its name that the file is missing, and counts nothing by halves', () => {
    expect(() => prefixe(racineBeads(null))).toThrow(CONFIG_BEADS);
  });

  it('says by its name that the key `issue-prefix` is missing, a commented line not being the key', () => {
    expect(() => prefixe(racineBeads('# issue-prefix: "tck"\nno-db: false\n'))).toThrow(
      'issue-prefix'
    );
  });
});

describe('the prefix committed in Grillhouse', () => {
  it('is `grillhouse` in the file of Beads of the repository', () => {
    expect(readFileSync(path.join(DEPOT, CONFIG_BEADS), 'utf8')).toMatch(
      /^issue-prefix:\s*["']?grillhouse["']?\s*$/m
    );
  });
});

describe('the guard in Grillhouse and in each project', () => {
  it('is in the one list of the frame’s guards, which `verifier --gardes` plays', () => {
    const script = path.resolve(
      __dirname,
      '../../../../scripts/langages/typescript/titres-de-tests.mjs'
    );
    expect(gardesDuCadre(DEPOT).map(([f]) => f)).toContain(script);
    expect(commandeDe(GARDE, DEPOT)?.script).toBe(script);
  });

  it('passes on Grillhouse with its current state inscribed in the debt', () => {
    const constats = verifier(DEPOT, 'grillhouse');
    expect(constats.length).toBeGreaterThan(0);
    expect(jugerLesTitres(lireDette(DEPOT), constats, renommesDuLot(DEPOT))).toEqual([]);
  });
});
