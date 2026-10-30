// Tickets grillhouse-3dr.3.2 and grillhouse-3dr.3.3: the tests of the frame's chain, its circuit
// first, then the night, the integration and its queue, the launcher, the session start, the
// update and the init, live in a package of their own and play at night, as Nx keeps its end-to-end projects apart from the projects they
// test; their shared material is a package of its own, which imports none
// (@roomi-fields/grillhouse-matiere, the convention of BPScript's corpus).
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const PAQUET = path.resolve(__dirname, '..');
const RACINE = path.resolve(PAQUET, '../..');
// The frame's package, in the same tree (never main's, which its name reaches from a copy
// without its own install).
const CADRE = path.join(RACINE, 'packages/grillhouse');

// The test options of the frame's Vitest configuration <fichier> (from the package), read in a
// process as Vitest loads it.
function optionsDe(fichier: string): { include: string[]; exclude: string[] } {
  const config = pathToFileURL(path.join(CADRE, fichier)).href;
  const r = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const { default: c } = await import(${JSON.stringify(config)});
process.stdout.write(JSON.stringify(c.test));`,
    ],
    { encoding: 'utf8' }
  );
  expect(r.status, r.stderr).toBe(0);
  return JSON.parse(r.stdout) as { include: string[]; exclude: string[] };
}
// The fields of a package.json these tests read.
type Paquet = {
  private?: boolean;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  exports: Record<string, unknown>;
  scripts: Record<string, string>;
};
const lireJson = (f: string) => JSON.parse(readFileSync(f, 'utf8')) as Paquet;
// The modules a source <t> imports or re-exports: its statements at the start of a line, not the
// text of a file of trial it writes inside a string.
const importsDe = (t: string) =>
  [...t.matchAll(/^(?:import|export)\b[^;]*? from '([^']+)'/gm)].map(m => m[1] as string);

// The counts of `it` and of `expect` of each file moved from packages/grillhouse/tests/unit, read
// on main before the move (23dd5ba).
const AVANT: Record<string, [number, number]> = {
  // grillhouse-nt4: one more expect, the guard that names the trial directory the test leaves.
  'base-de-passe': [10, 55],
  'circuit.arbitrage': [2, 15],
  'circuit.avancement': [1, 6],
  'circuit.bilan': [2, 20],
  'circuit.conformite': [4, 22],
  'circuit.consigne': [3, 25],
  'circuit.construction': [3, 21],
  'circuit.fiche': [11, 52],
  'circuit.gestes': [6, 49],
  'circuit.machine': [1, 7],
  'circuit.montee': [5, 33],
  circuit: [7, 22],
  'circuit.passe-finale': [3, 19],
  'circuit.plan': [18, 124],
  'circuit.preuve': [10, 49],
  'circuit.references': [26, 173],
  'circuit.refus': [3, 22],
  'circuit.registre': [1, 9],
  'circuit.rejeu': [7, 51],
  'circuit.relance': [3, 10],
  'circuit.relecture': [12, 105],
  'circuit.reprise': [5, 58],
  'circuit.sessions': [18, 107],
  'circuit.statut': [10, 66],
  'circuit.tests-de-head': [5, 22],
  'circuit.ticket': [10, 71], // main 23dd5ba [9, 68], plus the test grillhouse-pkl.2 added (a7cb14d)
  'circuit.tri': [8, 78],
  'circuit.vert-par-fichier': [8, 28],
  // grillhouse-3dr.3.3: the other tests of the chain, read on main before the move (255b40d).
  nuit: [73, 318],
  'sous-modules': [24, 95],
  'commandes-en-enveloppe': [23, 76],
  'retirer-copie': [48, 124],
  'tests-de-nuit.script-de-nuit': [14, 40],
  'integrer.dependances': [13, 40],
  'sous-modules.adresses': [29, 119],
  'file-integration': [21, 92],
  'lancer-modele': [39, 115],
  'file-integration.renvois': [15, 85],
  integrer: [63, 217],
  'integrer.commandes': [18, 61],
  'sous-modules.montage': [14, 86],
  'sous-modules.partage': [23, 124],
  'file-integration.dependances': [7, 40],
  'session-start': [45, 98],
  'grillhouse-maj': [141, 329],
  'enveloppe.lanceur': [26, 66],
  'pre-push-nuit': [16, 63],
  'greffons-du-cadre': [63, 170],
  'file-integration.ci': [15, 68],
  'crochets-du-cadre': [25, 58],
  'integrer.references': [4, 18],
  'nouveau-projet': [15, 37],
  superviseur: [7, 26],
};
// The counts of `it` and of `expect` of each file of packages/grillhouse/tests/unit split by
// grillhouse-3dr.3.6 and grillhouse-3dr.3.7: its cases that a large test alone proves, moved as they are; its other
// cases rewritten by day, in its file of the same name. Read once moved.
const SCINDES: Record<string, [number, number]> = {
  avancement: [4, 19],
  enveloppe: [28, 64],
  'enveloppe.enceinte': [8, 22],
  'enveloppe.maison': [19, 60],
  'enveloppe.matiere-de-test': [9, 35],
  'enveloppe.paquet': [4, 13],
  'git-des-tests': [2, 3],
  'ligne-etat': [2, 2],
  'registre-fin': [1, 3],
  'tests-cibles': [11, 27],
  'tests-de-nuit': [14, 38],
  'verifier.depuis-le-vert': [6, 31],
  // grillhouse-3dr.3.7: the last five; the hook, the guard or the command run in a git repository,
  // and Turborepo's own graph and hashes.
  'consommateurs-arbitres': [5, 11],
  'turbo-des-paquets-donnees': [17, 75],
  'un-commit-par-ticket': [5, 10],
  verrous: [8, 20],
  version: [1, 6],
};
const IT = /(?<![\w.])it(?:\.\w+(?:\([^()]*\))?)*\(/g;
const EXPECT = /(?<![\w.])expect(?:\.\w+)?\(/g;
const compte = (t: string, re: RegExp) => (t.match(re) ?? []).length;
const DE_NUIT = readdirSync(path.join(PAQUET, 'tests')).filter(n => n.endsWith('.nuit.spec.ts'));

describe('grillhouse-3dr.3.2 — the package of the tests of the chain', () => {
  it('critère 4: the package is private, depends on the frame and on the shared material, and has its three documents', () => {
    const pkg = lireJson(path.join(PAQUET, 'package.json'));
    expect(pkg.private).toBe(true);
    expect(pkg.dependencies).toEqual({ '@roomi-fields/grillhouse': '*' });
    expect(pkg.devDependencies).toEqual({ '@roomi-fields/grillhouse-matiere': '*' });
    expect(readdirSync(path.join(PAQUET, 'docs')).sort()).toEqual([
      'ARCHITECTURE.md',
      'CADRE.md',
      'INTERFACE.md',
    ]);
  });

  it('critère 4: the shared material is private, imports no package, and exports ./test-fixtures alone', () => {
    const dir = path.join(RACINE, 'packages/grillhouse-matiere');
    const pkg = lireJson(path.join(dir, 'package.json'));
    expect(pkg.private).toBe(true);
    expect(Object.keys(pkg.exports)).toEqual(['./test-fixtures']);
    expect(pkg.dependencies ?? {}).toEqual({});
    for (const f of readdirSync(path.join(dir, 'src'))) {
      const t = readFileSync(path.join(dir, 'src', f), 'utf8');
      expect(
        importsDe(t).filter(i => !i.startsWith('node:') && !i.startsWith('./')),
        f
      ).toEqual([]);
    }
    expect(
      lireJson(path.join(RACINE, 'packages/grillhouse/package.json')).devDependencies
    ).toMatchObject({ '@roomi-fields/grillhouse-matiere': '*' });
  });

  it('critère 4: the reading of the material sees an import and a re-export of a package, not the text of a file of trial it writes', () => {
    const source = [
      "import { a } from 'paquet-importe';",
      "export * from '@roomi-fields/grillhouse';",
      'export {',
      '  b,',
      "} from 'paquet-reexporte';",
      "const essai = `import { test } from 'vitest';\\n`;",
      '',
    ].join('\n');
    expect(importsDe(source)).toEqual([
      'paquet-importe',
      '@roomi-fields/grillhouse',
      'paquet-reexporte',
    ]);
  });

  it('critère 5: each moved file keeps its it and its expect, and the frame keeps none of them', () => {
    const apres = Object.fromEntries(
      DE_NUIT.map(n => {
        const t = readFileSync(path.join(PAQUET, 'tests', n), 'utf8');
        return [n.replace('.nuit.spec.ts', ''), [compte(t, IT), compte(t, EXPECT)]];
      })
    );
    expect(apres).toEqual({ ...AVANT, ...SCINDES });
    const restes = readdirSync(path.join(RACINE, 'packages/grillhouse/tests/unit'));
    for (const nom of Object.keys(AVANT)) {
      expect(restes).not.toContain(`${nom}.spec.ts`);
    }
    for (const banc of [
      'circuit-essai.ts',
      'integration-essai.ts',
      'file-integration-essai.ts',
      'sous-modules-essai.ts',
    ]) {
      expect(restes).not.toContain(banc);
    }
  });

  it('critère 6: the day leaves every moved file out, and a file named plays it', () => {
    const pkg = lireJson(path.join(PAQUET, 'package.json'));
    // npm test -- <path> plays a path in a package that has a test:unit script.
    expect(pkg.scripts['test:unit']).toBe('vitest run');
    const exclusions = optionsDe('scripts/langages/typescript/vitest-config/base.mjs').exclude;
    for (const n of DE_NUIT) {
      expect(
        exclusions.some(e => path.matchesGlob(`tests/${n}`, e)),
        n
      ).toBe(true);
    }
  });

  it('critère 6: the night configuration, played from the root of the copy, plays every moved file', () => {
    const { include, exclude } = optionsDe('scripts/langages/typescript/vitest.nuit.config.mjs');
    expect(DE_NUIT).toHaveLength(Object.keys({ ...AVANT, ...SCINDES }).length);
    for (const n of DE_NUIT) {
      const f = `packages/grillhouse-essais/tests/${n}`;
      expect(
        include.some(e => path.matchesGlob(f, e)),
        f
      ).toBe(true);
      expect(
        exclude.some(e => path.matchesGlob(f, e)),
        f
      ).toBe(false);
    }
  });
});
