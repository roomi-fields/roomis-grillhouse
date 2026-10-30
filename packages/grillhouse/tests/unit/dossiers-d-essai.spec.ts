import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Ticket grillhouse-3uv.34: each run of the tests has its own trial directory, made by mkdtemp
// and removed at its end, never a fixed path shared between sessions. Two sessions that run the
// same tests at once (an integration and a review) then never touch each other's files.
// The package of the frame's tests.
const DEPOT = path.resolve(__dirname, '../..');
const MOI = path.relative(DEPOT, __filename);

// Every test file of the repository: tests/ and src/, .spec and .test, ts, js and mjs; and those of
// the package of the trials, where the night tests that mount a trial repository live
// (grillhouse-3dr.3.2, grillhouse-3dr.3.3), as paths from this package.
function fichiersDeTest(): string[] {
  const out: string[] = [];
  const parcourir = (rel: string) => {
    for (const e of readdirSync(path.join(DEPOT, rel), { withFileTypes: true })) {
      const r = path.join(rel, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'node_modules') {
          parcourir(r);
        }
      } else if (/\.(spec|test)\.(c|m)?[jt]sx?$/.test(e.name)) {
        out.push(r);
      }
    }
  };
  for (const racine of ['tests', 'src', '../grillhouse-essais/tests']) {
    try {
      parcourir(racine);
    } catch {
      // A repository without this root has no test there.
    }
  }
  return out.filter(f => f !== MOI);
}

// The calls of the home directory of the session: `homedir()` and `os.homedir()`. The real home
// read through `userInfo().homedir` has no parentheses and is not one of them.
const APPEL_MAISON = /\b(?:os\.)?homedir\(\)/g;

// The statement that holds an offset: from the end of the previous statement (`;`, `{` or `}`
// at the end of a line) to the next `;` at the end of a line.
function instruction(source: string, i: number): string {
  const avant = source.slice(0, i);
  const debut = Math.max(
    avant.lastIndexOf(';\n'),
    avant.lastIndexOf('{\n'),
    avant.lastIndexOf('}\n'),
    0
  );
  const fin = source.indexOf(';\n', i);
  return source.slice(debut, fin < 0 ? source.length : fin + 1);
}

// The calls of the temp directory of the session: `tmpdir()` and `os.tmpdir()`.
const APPEL_TEMP = /\b(?:os\.)?tmpdir\(\)/g;

// The roots of trial of a file, at the start of a line: `const NAME = mkdtempSync(...)` made in
// the temp directory, and `const NAME = racineSousLaMaison('prefix-')`, the root under the home
// of packages/grillhouse-matiere/src/machine.ts. Every other trial directory lives inside one of them.
function racines(source: string) {
  const out: { nom: string; ligne: number; prefixe: string | null; horsTemp: boolean }[] = [];
  for (const m of source.matchAll(/^const (\w+) = racineSousLaMaison\('([^']*)'\);$/gm)) {
    out.push({
      nom: m[1] ?? '',
      ligne: source.slice(0, m.index).split('\n').length,
      prefixe: m[2] ?? null,
      horsTemp: true,
    });
  }
  for (const m of source.matchAll(/^const (\w+) = mkdtempSync\(([^\n]*)$/gm)) {
    const fin = source.indexOf(';\n', m.index);
    const stmt = source.slice(m.index, fin < 0 ? source.length : fin + 1);
    if (!/\b(?:os\.)?tmpdir\(\)/.test(stmt)) {
      continue;
    }
    const litteraux = [...stmt.matchAll(/'([^']*)'/g)].map(x => x[1]);
    out.push({
      nom: m[1],
      ligne: source.slice(0, m.index).split('\n').length,
      prefixe: litteraux.at(-1) ?? null,
      horsTemp: false,
    });
  }
  return out;
}

const racinesHorsTemp = (source: string) => racines(source).filter(r => r.horsTemp);

// The roots of a file made by mkdtemp straight under the home, as « line: statement »: mkdtemp
// does not create the parent, so they fail to load on a machine without ~/.cache
// (grillhouse-3uv.50). The root under the home goes through racineSousLaMaison, which creates it.
function racinesSansParent(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/^const \w+ = mkdtempSync\(/gm)) {
    const fin = source.indexOf(';\n', m.index);
    const stmt = source.slice(m.index, fin < 0 ? source.length : fin + 1);
    if (/\b(?:os\.)?homedir\(\)/.test(stmt)) {
      out.push(`${source.slice(0, m.index).split('\n').length}: ${stmt}`);
    }
  }
  return out;
}

// The calls of racineSousLaMaison on the real home of the session, as their lines: a call with
// one argument, the prefix. A call that names its home (a second argument) works in a fresh home.
function appelsSurLaMaison(source: string): number[] {
  const out: number[] = [];
  for (const m of source.matchAll(/\bracineSousLaMaison\(/g)) {
    let profondeur = 1;
    let virgules = 0;
    for (let i = m.index + m[0].length; i < source.length && profondeur > 0; i++) {
      const c = source[i];
      if (c === '(' || c === '[' || c === '{') {
        profondeur++;
      } else if (c === ')' || c === ']' || c === '}') {
        profondeur--;
      } else if (c === ',' && profondeur === 1) {
        virgules++;
      }
    }
    if (virgules === 0) {
      out.push(source.slice(0, m.index).split('\n').length);
    }
  }
  return out;
}

// The lines of a file that make a trial directory in the temp directory or under the real home
// outside a root of the file: a mkdtemp there, or a call of racineSousLaMaison on the real home.
function horsRacine(source: string): number[] {
  const lignesRacines = new Set(racines(source).map(r => r.ligne));
  const out = new Set<number>();
  for (const appel of [APPEL_TEMP, APPEL_MAISON]) {
    for (const m of source.matchAll(appel)) {
      const ligne = source.slice(0, m.index).split('\n').length;
      if (/\bmkdtempSync\(/.test(instruction(source, m.index)) && !lignesRacines.has(ligne)) {
        out.add(ligne);
      }
    }
  }
  for (const ligne of appelsSurLaMaison(source)) {
    if (!lignesRacines.has(ligne)) {
      out.add(ligne);
    }
  }
  return [...out].sort((a, b) => a - b);
}

// The calls that write a file or a directory.
const ECRITURE =
  /\b(?:mkdirSync|writeFileSync|appendFileSync|cpSync|copyFileSync|symlinkSync|renameSync|createWriteStream)\(/;

// The fixed paths a source names, as « line: statement », one per statement: a call of the home
// directory, of the temp directory or its variable `TMPDIR`, outside a mkdtemp; a literal path
// under /tmp in a statement that writes.
function cheminsFixes(source: string): string[] {
  const vus = new Map<number, string>();
  const noter = (i: number) => {
    const stmt = instruction(source, i);
    const debut = source.indexOf(stmt);
    if (!vus.has(debut)) {
      vus.set(debut, `${source.slice(0, i).split('\n').length}: ${stmt.trim()}`);
    }
  };
  for (const appel of [APPEL_MAISON, APPEL_TEMP, /\bprocess\.env\.TMPDIR\b/g]) {
    for (const m of source.matchAll(appel)) {
      if (!/\bmkdtempSync\(/.test(instruction(source, m.index))) {
        noter(m.index);
      }
    }
  }
  for (const m of source.matchAll(/['"`]\/tmp(?:\/|['"`])/g)) {
    if (ECRITURE.test(instruction(source, m.index))) {
      noter(m.index);
    }
  }
  return [...vus.values()];
}

describe('critère 6 — the guard sees a fixed path under the temp directory, as under the home', () => {
  const imports = "import os, { homedir, tmpdir } from 'node:os';\nimport path from 'node:path';\n";
  for (const [cas, ligne] of [
    [
      'a directory made in the temp directory',
      "mkdirSync(path.join(tmpdir(), 'grillhouse-fixe'));",
    ],
    ['a path kept in a constant, through os', "const D = path.join(os.tmpdir(), 'essais', 'a');"],
    [
      'a file written in the temp directory',
      "writeFileSync(path.join(tmpdir(), 'trace.txt'), 'x');",
    ],
    [
      'the variable of the temp directory',
      "const T = path.join(process.env.TMPDIR ?? '/tmp', 'x');",
    ],
    [
      'a literal path under /tmp, written',
      "mkdirSync('/tmp/grillhouse-fixe', { recursive: true });",
    ],
    ['a literal path under /tmp, in a template', "writeFileSync(`/tmp/grillhouse-${n}/a`, 'x');"],
    ['a fixed path under the home', "mkdirSync(path.join(homedir(), '.cache', 'fixe'));"],
  ] as const) {
    it(`critère 6: flags ${cas}`, () => {
      const source = `${imports}${ligne}\n`;
      expect(cheminsFixes(source), ligne).toHaveLength(1);
      expect(cheminsFixes(source)[0], ligne).toMatch(/^3: /);
    });
  }
  for (const [cas, ligne] of [
    [
      'a root made by mkdtemp in the temp directory',
      "const ESSAIS = mkdtempSync(path.join(tmpdir(), 'f-'));",
    ],
    ['a root made by mkdtemp through os', "const R = mkdtempSync(path.join(os.tmpdir(), 'g-'));"],
    [
      'a literal /tmp passed as a value, never written',
      "const args = construire({ scratchpads: '/tmp/claude-1/-wt' });",
    ],
    ['a path inside the root of the file', "mkdirSync(path.join(ESSAIS, 'grillhouse-fixe'));"],
  ] as const) {
    it(`critère 6: leaves ${cas}`, () => {
      expect(cheminsFixes(`${imports}${ligne}\n`), ligne).toEqual([]);
    });
  }
});

describe('grillhouse-3uv.50, critère 1 — a root under the home creates its parent, in one way', () => {
  const imports = "import { homedir } from 'node:os';\nimport path from 'node:path';\n";
  it('critère 1: flags a root made by mkdtemp straight under the home', () => {
    const ligne = "const R = mkdtempSync(path.join(homedir(), '.cache', 'grillhouse-essais-x-'));";
    expect(racinesSansParent(`${imports}${ligne}\n`)).toEqual([`3: ${ligne}`]);
  });
  it('critère 1: takes the root of packages/grillhouse-matiere/src/machine.ts for a root under the home, with its prefix', () => {
    const source = `${imports}// reason\nconst R = racineSousLaMaison('grillhouse-essais-x-');\n`;
    expect(racinesSansParent(source)).toEqual([]);
    expect(cheminsFixes(source)).toEqual([]);
    expect(racinesHorsTemp(source)).toEqual([
      { nom: 'R', ligne: 4, prefixe: 'grillhouse-essais-x-', horsTemp: true },
    ]);
  });
  it('critère 1: takes a root made by mkdtemp under the home for no root: racineSousLaMaison replaces it', () => {
    const source = `${imports}// reason\nconst R = mkdtempSync(path.join(homedir(), '.cache', 'grillhouse-essais-x-'));\n`;
    expect(racinesHorsTemp(source)).toEqual([]);
    expect(horsRacine(source)).toEqual([4]);
  });
  for (const [cas, lignes, attendu] of [
    [
      'a call indented in a describe',
      "describe('x', () => {\n  const R = racineSousLaMaison('grillhouse-essais-x-');\n});",
      [4],
    ],
    [
      'a call in an arrow function, one root per call',
      "const essai = () => racineSousLaMaison('grillhouse-essais-x-');",
      [3],
    ],
    [
      'a call in the body of a function',
      "function essai() {\n  return racineSousLaMaison('grillhouse-essais-x-');\n}",
      [4],
    ],
    [
      'a call inside an expression of a root line',
      "const R = path.join(racineSousLaMaison('grillhouse-essais-x-'), 'a');",
      [3],
    ],
    ['a call whose prefix is a variable', 'const R = racineSousLaMaison(PREFIXE);', [3]],
  ] as const) {
    it(`critère 1: flags ${cas} on the real home, outside a root of the file`, () => {
      expect(horsRacine(`${imports}${lignes}\n`), lignes).toEqual(attendu);
    });
  }
  for (const [cas, lignes] of [
    ['the root of the file', "const R = racineSousLaMaison('grillhouse-essais-x-');"],
    [
      'a call that names its home, in a fresh home',
      "it('a', () => {\n  const r = racineSousLaMaison('grillhouse-essais-x-', maison);\n});",
    ],
  ] as const) {
    it(`critère 1: leaves ${cas}`, () => {
      expect(horsRacine(`${imports}${lignes}\n`), lignes).toEqual([]);
    });
  }
  it('critère 1: still flags a parent made by hand under the home, a fixed path', () => {
    const ligne = "mkdirSync(path.join(homedir(), '.cache'), { recursive: true });";
    expect(cheminsFixes(`${imports}${ligne}\n`), ligne).toHaveLength(1);
    expect(cheminsFixes(`${imports}${ligne}\n`)[0], ligne).toMatch(/^3: /);
  });
});

describe('the trial directories of the tests', () => {
  const fichiers = fichiersDeTest();
  const sources = fichiers.map(f => ({ f, s: readFileSync(path.join(DEPOT, f), 'utf8') }));

  it('critère 2 — the guard reads the test files of the envelope and of the locks', () => {
    expect(fichiers).toContain('tests/unit/enveloppe.spec.ts');
    expect(fichiers).toContain('tests/unit/verrous.spec.ts');
  });

  it('critère 2 — no test names a fixed directory under the home: every path there is made by mkdtemp', () => {
    const fixes = sources.flatMap(({ f, s }) => cheminsFixes(s).map(x => `${f}:${x}`));
    expect(fixes.filter(x => /homedir/.test(x))).toEqual([]);
  });

  it('grillhouse-3uv.50, critère 1 — every root under the home is made by racineSousLaMaison', () => {
    expect(sources.flatMap(({ f, s }) => racinesSansParent(s).map(x => `${f}:${x}`))).toEqual([]);
  });

  it('critère 6 — no test names a fixed directory under the temp directory: every path there is made by mkdtemp', () => {
    const fixes = sources.flatMap(({ f, s }) => cheminsFixes(s).map(x => `${f}:${x}`));
    expect(fixes).toEqual([]);
  });

  it('critère 2 — no test names a fixed directory grillhouse-essais-*: the name is a mkdtemp prefix', () => {
    const fixes: string[] = [];
    for (const { f, s } of sources) {
      for (const m of s.matchAll(/'(grillhouse-essais[^']*)'/g)) {
        const stmt = instruction(s, m.index);
        if (!m[1].endsWith('-') || !/\b(?:mkdtempSync|racineSousLaMaison)\(/.test(stmt)) {
          fixes.push(`${f}:${s.slice(0, m.index).split('\n').length}: '${m[1]}'`);
        }
      }
    }
    expect(fixes).toEqual([]);
  });

  it('critère 2 — every trial directory made in the temp directory or under the home is the root of its file', () => {
    expect(sources.flatMap(({ f, s }) => horsRacine(s).map(l => `${f}:${l}`))).toEqual([]);
  });

  it('critère 2 — each run removes the root of trial of each file, in the temp directory or outside it, at its end', () => {
    const restent: string[] = [];
    for (const { f, s } of sources) {
      for (const r of racines(s)) {
        const retrait = new RegExp(
          `afterAll\\(\\(\\) =>\\s*rmSync\\(${r.nom}, \\{ recursive: true, force: true \\}\\)\\)`
        );
        if (!retrait.test(s)) {
          restent.push(`${f}:${r.ligne}: ${r.nom}`);
        }
      }
    }
    expect(restent).toEqual([]);
    // The guard sees the roots in the temp directory too, as the one of the tests of the machine.
    const s = sources.find(x => x.f === 'tests/unit/machine.spec.ts')?.s ?? '';
    expect(racines(s).map(r => r.nom)).toEqual(['ESSAIS']);
  });

  it('critère 3 — a trial directory outside the temp directory carries a unique name and its written reason', () => {
    const fautes: string[] = [];
    let vues = 0;
    for (const { f, s } of sources) {
      const lignes = s.split('\n');
      for (const r of racinesHorsTemp(s)) {
        vues++;
        if (!r.prefixe?.startsWith('grillhouse-essais-') || !r.prefixe.endsWith('-')) {
          fautes.push(`${f}:${r.ligne}: prefix ${r.prefixe}`);
        }
        if (!/^\s*\/\//.test(lignes[r.ligne - 2] ?? '')) {
          fautes.push(`${f}:${r.ligne}: no comment gives the reason`);
        }
      }
    }
    expect(fautes).toEqual([]);
    // The envelope and the locks each need one: the envelope hides the temp directory, and the
    // hook command of the locks takes it for the scratchpad.
    expect(vues).toBeGreaterThanOrEqual(2);
  });
});
