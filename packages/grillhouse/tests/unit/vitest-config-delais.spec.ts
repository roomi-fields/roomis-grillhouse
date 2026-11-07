// The duration reporter of the base configuration (scripts/langages/typescript/vitest-config/
// duree.reporter.mjs): the report of a pass names the 20 slowest files and their share of the
// time, and the line of a test red for a delay past writes the size of its file and its delay.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import DureeReporter from '../../scripts/langages/typescript/vitest-config/duree.reporter.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'vitest-config-delais-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

const ecrire = (rel: string, texte: string) => {
  const f = path.join(ESSAIS, rel);
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, texte);
  return f;
};

// Runs the reporter on <files> and returns what it wrote to the output.
function rapport(files: unknown[]): string {
  const sorties: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((s: string | Uint8Array) => {
    sorties.push(String(s));
    return true;
  });
  const r = new DureeReporter();
  r.onInit();
  r.onFinished(files, []);
  return sorties.join('');
}

const fichierDe = (filepath: string, duration: number) => ({
  type: 'suite',
  name: path.basename(filepath),
  filepath,
  result: { state: 'pass', duration },
  tasks: [],
});

describe('rapport de durée — critère 3: the 20 slowest files and their share of the time', () => {
  // 25 files f01…f25: f01…f24 last 100 ms × n, f25 lasts 30 000 ms: the total is 60 000 ms and
  // f25 takes half of it.
  const fichiers = Array.from({ length: 25 }, (_, i) => {
    const n = i + 1;
    const nom = `f${String(n).padStart(2, '0')}.spec.ts`;
    return fichierDe(ecrire(`rapport/${nom}`, "it('a', () => {});\n"), n === 25 ? 30000 : n * 100);
  });

  it('critère 3: a pass with no failure still writes the report of the slowest files', () => {
    const sortie = rapport(fichiers);
    expect(sortie).toMatch(/20 fichiers les plus lents/);
  });

  it('critère 3: it names the 20 slowest, slowest first, and leaves the others out', () => {
    const sortie = rapport(fichiers);
    const place = (n: number) => sortie.indexOf(`f${String(n).padStart(2, '0')}.spec.ts`);
    for (let n = 6; n <= 25; n++) {
      expect(place(n)).toBeGreaterThanOrEqual(0);
    }
    for (let n = 1; n <= 5; n++) {
      expect(place(n)).toBe(-1);
    }
    for (let n = 6; n < 25; n++) {
      expect(place(n + 1)).toBeLessThan(place(n));
    }
  });

  it('critère 3: each line gives the file’s share of the total time', () => {
    const sortie = rapport(fichiers);
    const ligne = sortie.split('\n').find(l => l.includes('f25.spec.ts')) ?? '';
    expect(ligne).toMatch(/\b50(?:[.,]0)? ?%/);
    const l24 = sortie.split('\n').find(l => l.includes('f24.spec.ts')) ?? '';
    expect(l24).toMatch(/\b4(?:[.,]\d)? ?%/);
  });

  it('critère 3: fewer than 20 files are all named', () => {
    const sortie = rapport(fichiers.slice(0, 3));
    for (const n of ['f01', 'f02', 'f03']) {
      expect(sortie).toContain(`${n}.spec.ts`);
    }
  });
});

describe('rapport de durée — critère 9: a delay past names the size of its file and its delay', () => {
  const echec = (filepath: string, message: string) => {
    const f = fichierDe(filepath, 5000);
    const t = {
      type: 'test',
      name: 'dort trop',
      file: f,
      suite: f,
      result: { state: 'fail', errors: [{ message }] },
    };
    f.tasks = [t] as never[];
    f.result.state = 'fail';
    return f;
  };

  it('critère 9: a small file’s test past its delay is red, the line says « petit, 60 s »', () => {
    const f = ecrire('delai/p.spec.ts', "it('a', () => {});\n");
    process.exitCode = 1;
    const sortie = rapport([echec(f, 'Test timed out in 60000ms.')]);
    const ligne =
      sortie.split('\n').find(l => l.includes('p.spec.ts') && l.includes('dort trop')) ?? '';
    expect(ligne).toContain('petit, 60 s');
    expect(process.exitCode).toBe(1);
  });

  it('critère 9: a hook past its delay says the size and the delay of the file as well', () => {
    const f = ecrire('delai/h.spec.ts', "it('a', () => {});\n");
    process.exitCode = 1;
    const sortie = rapport([echec(f, 'Hook timed out in 60000ms.')]);
    const ligne =
      sortie.split('\n').find(l => l.includes('h.spec.ts') && l.includes('dort trop')) ?? '';
    expect(ligne).toContain('petit, 60 s');
    expect(process.exitCode).toBe(1);
  });

  it('critère 9: a day test past its delay under CPU load stays red (1), never « à repasser »', () => {
    const f = ecrire('delai/charge.spec.ts', "it('a', () => {});\n");
    const fichier = echec(f, 'Test timed out in 60000ms.');
    (fichier.tasks[0] as unknown as { meta: object }).meta = { pressionDebut: 99, pressionFin: 99 };
    process.exitCode = 1;
    const sortie = rapport([fichier]);
    const ligne =
      sortie.split('\n').find(l => l.includes('charge.spec.ts') && l.includes('dort trop')) ?? '';
    expect(ligne).toContain('petit, 60 s');
    expect(sortie).not.toContain('à repasser');
    expect(process.exitCode).toBe(1);
  });

  it('critère 9: a night test past its delay under CPU load stays « à repasser » (75), the line says « grand, 900 s »', () => {
    const f = ecrire('delai/charge.nuit.test.ts', "it('a', () => {});\n");
    const fichier = echec(f, 'Test timed out in 900000ms.');
    (fichier.tasks[0] as unknown as { meta: object }).meta = { pressionDebut: 99, pressionFin: 99 };
    process.exitCode = 1;
    const sortie = rapport([fichier]);
    const ligne =
      sortie.split('\n').find(l => l.includes('charge.nuit.test.ts') && l.includes('dort trop')) ??
      '';
    expect(ligne).toContain('grand, 900 s');
    expect(process.exitCode).toBe(75);
  });

  it('critère 9: a medium file’s test past its delay says « moyen, 300 s »', () => {
    ecrire('delai/src/a.ts', '');
    ecrire('delai/src/b.ts', '');
    const f = ecrire(
      'delai/tests/m.spec.ts',
      "import { a } from '../src/a.js';\nimport { b } from '../src/b.js';\nit('ab', () => a(b()));\n"
    );
    process.exitCode = 1;
    const sortie = rapport([echec(f, 'Test timed out in 300000ms.')]);
    const ligne =
      sortie.split('\n').find(l => l.includes('m.spec.ts') && l.includes('dort trop')) ?? '';
    expect(ligne).toContain('moyen, 300 s');
  });

  it('critère 5: a night test past its delay says its size and its delay, « grand, 900 s »', () => {
    const f = ecrire('delai/n.nuit.test.ts', "it('a', () => {});\n");
    process.exitCode = 1;
    const sortie = rapport([echec(f, 'Test timed out in 900000ms.')]);
    const ligne =
      sortie.split('\n').find(l => l.includes('n.nuit.test.ts') && l.includes('dort trop')) ?? '';
    expect(ligne).toContain('grand, 900 s');
  });
});
