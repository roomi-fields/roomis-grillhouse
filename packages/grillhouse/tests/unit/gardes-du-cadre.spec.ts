// `grillhouse:gardes` (scripts/gardes-du-cadre.mjs): every guard of the frame plays, in the order of
// its list, a red one included; each red is named, and the exit code is non-zero when one guard is
// red. Witness: BPScript, where the red check of the interfaces stopped the `&&` chain, and the
// dead-code guard never judged.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { GARDES_DU_CADRE, jouerLesGardes } from '../../scripts/gardes-du-cadre.mjs';

const DEPOT = path.resolve(__dirname, '../../../..');
const SCRIPT = path.join(DEPOT, 'packages/grillhouse/scripts/gardes-du-cadre.mjs');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'gardes-du-cadre-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// A repository of trial whose guards are <codes>: guard i exits with codes[i] after writing its
// mark, `joue-<i>`. Returns its directory and its list of guards.
function depotDeGardes(codes: number[]) {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  mkdirSync(path.join(racine, 'scripts'));
  const gardes = codes.map((code, i) => {
    const f = `scripts/garde-${i}.mjs`;
    writeFileSync(
      path.join(racine, f),
      `import { writeFileSync } from 'node:fs';\nwriteFileSync('joue-${i}', process.argv.slice(2).join(' '));\nprocess.exit(${code});\n`
    );
    return [f, `--a${i}`];
  });
  return { racine, gardes };
}

describe('grillhouse:gardes — a red guard does not stop the others', () => {
  it('a red guard first: the next ones still play, each red is named, and the code is non-zero', () => {
    const { racine, gardes } = depotDeGardes([1, 0, 3]);
    const lignes: string[] = [];
    const code = jouerLesGardes({ racine, gardes, dire: (l: string) => lignes.push(l) });
    expect(code).not.toBe(0);
    for (let i = 0; i < 3; i++) {
      expect(existsSync(path.join(racine, `joue-${i}`)), `garde ${i}`).toBe(true);
      expect(readFileSync(path.join(racine, `joue-${i}`), 'utf8')).toBe(`--a${i}`);
    }
    const texte = lignes.join('\n');
    expect(texte).toMatch(/grillhouse garde-0 --a0.*code 1/);
    expect(texte).toMatch(/grillhouse garde-2 --a2.*code 3/);
    expect(texte).not.toMatch(/garde-1\.mjs/);
  });
  it('every guard green: the code is 0', () => {
    const { racine, gardes } = depotDeGardes([0, 0]);
    expect(jouerLesGardes({ racine, gardes, dire: () => {} })).toBe(0);
  });
  it('the guards receive the environment of the run (GRILLHOUSE_DETTE, the known debt)', () => {
    const racine = mkdtempSync(path.join(ESSAIS, 'env-'));
    writeFileSync(
      path.join(racine, 'g.mjs'),
      `import { writeFileSync } from 'node:fs';\nwriteFileSync('mode', process.env.GRILLHOUSE_DETTE ?? '');\n`
    );
    const env = { ...process.env, GRILLHOUSE_DETTE: 'inscrire' };
    expect(jouerLesGardes({ racine, gardes: [['g.mjs']], env, dire: () => {} })).toBe(0);
    expect(readFileSync(path.join(racine, 'mode'), 'utf8')).toBe('inscrire');
  });
  it('the command plays the list of the frame in its working directory, and exits non-zero on a red', () => {
    // An empty directory: the index of the interfaces it lacks is red, named by its subcommand.
    const racine = mkdtempSync(path.join(ESSAIS, 'vide-'));
    const r = spawnSync(process.execPath, [SCRIPT], { cwd: racine, encoding: 'utf8' });
    expect(r.status).not.toBe(0);
    expect(r.stdout).toContain('⛔ garde rouge : grillhouse index-interfaces --verifier');
  });
});

describe('grillhouse:gardes — one list of the guards', () => {
  it('the npm script of the frame calls the script, and holds no list of its own', () => {
    const pkg = JSON.parse(readFileSync(path.join(DEPOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['grillhouse:gardes']).toBe('grillhouse gardes-du-cadre');
  });
  it('each guard of the list is a script of the frame, which the update installs', () => {
    const liste = readFileSync(path.join(DEPOT, '.claude/grillhouse/fichiers.txt'), 'utf8')
      .split('\n')
      .map(l => l.trim());
    expect(liste).toContain('packages/grillhouse/scripts/gardes-du-cadre.mjs');
    for (const [f] of GARDES_DU_CADRE) {
      expect(existsSync(f), f).toBe(true);
      expect(liste, f).toContain(path.relative(DEPOT, f));
    }
  });
});
