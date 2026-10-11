import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { declare, exportsDuRapport } from '../../scripts/interfaces-contre-code.mjs';

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'interfaces-contre-code-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const SCRIPT = path.resolve(__dirname, '../../scripts/interfaces-contre-code.mjs');
const MODULES = path.resolve(__dirname, '../../node_modules');

const TSCONFIG = JSON.stringify({ compilerOptions: { strict: true, skipLibCheck: true } });

// A one-package project whose module `a` is built in dist/a, with the given files on top.
function projet(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(ESSAIS, 'icc-'));
  const base = {
    'package.json': '{"name":"p","types":"dist/index.d.ts"}',
    'tsconfig.json': TSCONFIG,
    'src/a/index.ts': 'export function duree(x: number): number { return x; }\n',
    'dist/a/index.d.ts': 'export declare function duree(x: number): number;\n',
    'src/a/docs/INTERFACE.md': '# a\n\nA rend des durées.\n\n## `duree`(x)\n\nRend x.\n',
  };
  for (const [rel, text] of Object.entries({ ...base, ...files })) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  }
  symlinkSync(MODULES, path.join(dir, 'node_modules'));
  const run = (...args: string[]) =>
    spawnSync('node', [SCRIPT, ...args], { cwd: dir, encoding: 'utf8' });
  return { dir, run };
}
const apres = (files: Record<string, string>, change: Record<string, string> = {}) => {
  const p = projet(files);
  p.run('--ecrire');
  for (const [rel, text] of Object.entries(change)) {
    writeFileSync(path.join(p.dir, rel), text);
  }
  return p.run();
};

describe('declare', () => {
  it('reads the element titles and the fault codes, not the titles inside code', () => {
    const d = declare(
      '# a\n\n## `parse`(source)\n\n### `Lu`\n\n## Consommateurs\n\n```md\n## `faux`\n```\n\n## Les fautes\n\n```text\nPARSE_EXPECTED PARSE_LEFTOVER\n```\n'
    );
    expect([...d.elements]).toEqual(['parse', 'Lu']);
    expect([...d.fautes!]).toEqual(['PARSE_EXPECTED', 'PARSE_LEFTOVER']);
  });
  it('has no fault list without the section', () => {
    expect(declare('# a\n').fautes).toBeNull();
  });
});

describe('exportsDuRapport', () => {
  it('names every export of a report', () => {
    const r =
      'export function f(): void;\nexport const c: number;\nexport interface I {}\nexport type T = 1;\nexport class K {}\nexport enum E {}\nexport { x as y, z }\n';
    expect([...exportsDuRapport(r)].sort()).toEqual(['E', 'I', 'K', 'T', 'c', 'f', 'y', 'z']);
  });
});

describe('the check', () => {
  it('passes an interface that describes exactly the API', () => {
    const r = apres({});
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
  it('refuses an export the interface does not describe', () => {
    const r = apres({
      'dist/a/index.d.ts':
        'export declare function duree(x: number): number;\nexport declare const tempo: number;\n',
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/exporte tempo, que docs\/INTERFACE\.md ne décrit pas/);
  });
  it('refuses an element the code does not export', () => {
    const r = apres({
      'src/a/docs/INTERFACE.md': '# a\n\nA.\n\n## `duree`(x)\n\nR.\n\n## `vitesse`()\n\nV.\n',
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/décrit vitesse, que le code n'exporte pas/);
  });
  it('refuses an API changed without its report', () => {
    const r = apres(
      {},
      { 'dist/a/index.d.ts': 'export declare function duree(x: string): number;\n' }
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/l'API a changé sans son rapport/);
  });
  it('refuses a listed fault the code does not raise, and a raised fault not listed', () => {
    const r = apres({
      'src/a/docs/INTERFACE.md':
        '# a\n\nA.\n\n## `duree`(x)\n\nR.\n\n## Les fautes\n\n```text\nDUREE_NEGATIVE DUREE_ABSENTE\n```\n',
      'src/a/index.ts':
        "export function duree(x: number): number { if (x < 0) throw new Error('DUREE_NEGATIVE'); if (x > 9) throw new Error('DUREE_TROP_LONGUE'); return x; }\n",
      'src/a/index.spec.ts': "const t = 'DUREE_DE_TEST';\n",
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/DUREE_ABSENTE est listée, mais le code ne la produit pas/);
    expect(r.stderr).toMatch(/le code produit DUREE_TROP_LONGUE/);
    expect(r.stderr).not.toMatch(/DUREE_DE_TEST/);
  });
  it('reports a component without interface, without refusing', () => {
    const r = apres({ 'src/b/index.ts': 'export const b = 1;\n' });
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/src\/b n'a pas d'interface/);
  });
  it('refuses a component whose build is missing', () => {
    const q = projet({ 'package.json': '{"name":"p","types":"build/index.d.ts"}' });
    expect(q.run().stderr).toMatch(/construis d'abord/);
  });
  it("takes a package's main entry only, not its test material", () => {
    const r = apres({
      'packages/b/package.json': JSON.stringify({
        name: 'b',
        exports: {
          '.': { types: './dist/index.d.ts' },
          './test-fixtures': { types: './dist/fixtures.d.ts' },
        },
      }),
      'packages/b/tsconfig.json': TSCONFIG,
      'packages/b/dist/index.d.ts': 'export declare const b: number;\n',
      'packages/b/dist/fixtures.d.ts': 'export declare const cas: number;\n',
      'packages/b/docs/INTERFACE.md': '# b\n\nB.\n\n## `b`\n\nUn nombre.\n',
    });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
});

// grillhouse-3uv.60: the check names the command that writes a report — npm run api, after the
// build — when the report is missing (critère 2) and when the API changed without it (critère 6).
const PACKAGE_B = {
  'packages/b/package.json': JSON.stringify({ name: 'b', types: './dist/index.d.ts' }),
  'packages/b/tsconfig.json': TSCONFIG,
  'packages/b/dist/index.d.ts': 'export declare const b: number;\n',
  'packages/b/docs/INTERFACE.md': '# b\n\nB.\n\n## `b`\n\nUn nombre.\n',
};
const NOMME_API = /npm run api/;
const NOMME_CONSTRUCTION = /constru/i;
// The refusals of a run (⛔ lines), API Extractor's own warnings (⚠️) left aside.
const refus = (stderr: string) =>
  stderr
    .split('\n')
    .filter(l => l.startsWith('⛔'))
    .join('\n');

describe('grillhouse-3uv.60 critère 2 — a missing report names npm run api, after the build', () => {
  it('critère 2: a built module with its interface and no report is refused as a missing report', () => {
    const r = projet({}).run();
    expect(r.status).toBe(1);
    expect(refus(r.stderr)).toMatch(/src\/a/);
    expect(refus(r.stderr)).toMatch(/INTERFACE\.api\.md/);
    expect(refus(r.stderr)).toMatch(/manque/);
    expect(refus(r.stderr)).not.toMatch(/a changé/);
  });
  it('critère 2: the refusal of a missing report names npm run api and the build', () => {
    const r = projet({}).run();
    expect(refus(r.stderr)).toMatch(NOMME_API);
    expect(refus(r.stderr)).toMatch(NOMME_CONSTRUCTION);
  });
  it('critère 2: a built package with its interface and no report is refused the same way', () => {
    const p = projet({});
    p.run('--ecrire');
    for (const [rel, text] of Object.entries(PACKAGE_B)) {
      mkdirSync(path.dirname(path.join(p.dir, rel)), { recursive: true });
      writeFileSync(path.join(p.dir, rel), text);
    }
    const r = p.run();
    expect(r.status).toBe(1);
    const lignes = refus(r.stderr)
      .split('\n')
      .filter(l => l.includes('packages/b'));
    expect(lignes.join('\n')).toMatch(/manque/);
    expect(lignes.join('\n')).toMatch(NOMME_API);
    expect(lignes.join('\n')).not.toMatch(/a changé/);
    expect(refus(r.stderr)).not.toMatch(/src\/a/);
  });
  it('critère 2: --ecrire writes the missing report, and the check then passes', () => {
    const p = projet({});
    expect(p.run('--ecrire').status).toBe(0);
    expect(existsSync(path.join(p.dir, 'src/a/docs/INTERFACE.api.md'))).toBe(true);
    const r = p.run();
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
});

describe('grillhouse-3uv.60 critère 6 — an API changed without its report names npm run api', () => {
  it('critère 6: the refusal of a changed API names npm run api', () => {
    const r = apres(
      {},
      { 'dist/a/index.d.ts': 'export declare function duree(x: string): number;\n' }
    );
    expect(r.status).toBe(1);
    expect(refus(r.stderr)).toMatch(/l'API a changé sans son rapport/);
    expect(refus(r.stderr)).toMatch(NOMME_API);
    expect(refus(r.stderr)).not.toMatch(/manque/);
  });
  it('critère 6: an export added without its report names npm run api too', () => {
    const r = apres(
      { 'src/a/docs/INTERFACE.md': '# a\n\nA.\n\n## `duree`(x)\n\nR.\n\n## `tempo`\n\nT.\n' },
      {
        'dist/a/index.d.ts':
          'export declare function duree(x: number): number;\nexport declare const tempo: number;\n',
      }
    );
    expect(r.status).toBe(1);
    expect(refus(r.stderr)).toMatch(/a changé/);
    expect(refus(r.stderr)).toMatch(NOMME_API);
  });
});

// grillhouse-3uv.60 critère 10: npm run api replaces the former command in the check's messages.
const ANCIENNE_COMMANDE = /--ecrire|interfaces-contre-code\.mjs/;

describe('grillhouse-3uv.60 critère 10 — the messages no longer name the former command', () => {
  it('critère 10: the refusal of a missing report names neither --ecrire nor the script', () => {
    const r = projet({}).run();
    expect(r.status).toBe(1);
    expect(refus(r.stderr), 'a refusal is written').toMatch(/src\/a/);
    expect(refus(r.stderr)).not.toMatch(ANCIENNE_COMMANDE);
    expect(r.stderr).not.toMatch(ANCIENNE_COMMANDE);
  });
  it('critère 10: the refusal of a changed API names neither --ecrire nor the script', () => {
    const r = apres(
      {},
      { 'dist/a/index.d.ts': 'export declare function duree(x: string): number;\n' }
    );
    expect(r.status).toBe(1);
    expect(refus(r.stderr), 'a refusal is written').toMatch(/src\/a/);
    expect(refus(r.stderr)).not.toMatch(ANCIENNE_COMMANDE);
    expect(r.stderr).not.toMatch(ANCIENNE_COMMANDE);
  });
  it('critère 10: the refusal of a package missing its report names neither --ecrire nor the script', () => {
    const p = projet({});
    p.run('--ecrire');
    for (const [rel, text] of Object.entries(PACKAGE_B)) {
      mkdirSync(path.dirname(path.join(p.dir, rel)), { recursive: true });
      writeFileSync(path.join(p.dir, rel), text);
    }
    const r = p.run();
    expect(r.status).toBe(1);
    expect(refus(r.stderr), 'a refusal is written').toMatch(/packages\/b/);
    expect(r.stderr).not.toMatch(ANCIENNE_COMMANDE);
  });
  it('critère 10: each refusal of a run with several reports out of date names npm run api, never the former command', () => {
    const p = projet({});
    p.run('--ecrire');
    for (const [rel, text] of Object.entries(PACKAGE_B)) {
      mkdirSync(path.dirname(path.join(p.dir, rel)), { recursive: true });
      writeFileSync(path.join(p.dir, rel), text);
    }
    writeFileSync(
      path.join(p.dir, 'dist/a/index.d.ts'),
      'export declare function duree(x: string): number;\n'
    );
    const r = p.run();
    const lignes = refus(r.stderr)
      .split('\n')
      .filter(l => /manque|a changé/.test(l));
    expect(lignes.length, 'two refusals, one per component').toBe(2);
    for (const l of lignes) {
      expect(l).toMatch(NOMME_API);
      expect(l).not.toMatch(ANCIENNE_COMMANDE);
    }
  });
});

// grillhouse-3uv.60 critère 11: when the check refuses a missing or changed report, it does not
// relay API Extractor's warning on that same report (« Please copy the file /tmp/… or perform a
// local build ») — its refusal alone says what to do.
const AVERTISSEMENT_DU_RAPPORT =
  /API report file is missing|changed the API signature|Please copy the file|perform a local build/;
// An absolute path to a report file (API Extractor's temporary report, or the report it asks to
// copy it to): the run names its reports relatively, by docs/INTERFACE.api.md.
const CHEMIN_DE_RAPPORT = /(?:^|[\s"'(])\/[^\s"']*INTERFACE\.api\.md/m;
// The signals of a run (⚠️ lines).
const signaux = (stderr: string) =>
  stderr
    .split('\n')
    .filter(l => l.startsWith('⚠️'))
    .join('\n');

describe("grillhouse-3uv.60 critère 11 — a refused report comes without API Extractor's warning on it", () => {
  it('critère 11: a module missing its report is refused, without the warning on that report', () => {
    const r = projet({}).run();
    expect(r.status).toBe(1);
    expect(refus(r.stderr), 'the refusal is written').toMatch(/src\/a.*INTERFACE\.api\.md/);
    expect(signaux(r.stderr)).not.toMatch(AVERTISSEMENT_DU_RAPPORT);
    expect(r.stderr).not.toMatch(AVERTISSEMENT_DU_RAPPORT);
  });
  it('critère 11: the run names no temporary report file', () => {
    const r = projet({}).run();
    expect(r.status).toBe(1);
    expect(r.stderr).not.toMatch(CHEMIN_DE_RAPPORT);
  });
  it('critère 11: a package missing its report is refused, without the warning on that report', () => {
    const p = projet({});
    p.run('--ecrire');
    for (const [rel, text] of Object.entries(PACKAGE_B)) {
      mkdirSync(path.dirname(path.join(p.dir, rel)), { recursive: true });
      writeFileSync(path.join(p.dir, rel), text);
    }
    const r = p.run();
    expect(r.status).toBe(1);
    expect(refus(r.stderr), 'the refusal is written').toMatch(/packages\/b/);
    expect(r.stderr).not.toMatch(AVERTISSEMENT_DU_RAPPORT);
  });
  it('critère 11: an API changed without its report is refused, without the warning on that report', () => {
    const r = apres(
      {},
      { 'dist/a/index.d.ts': 'export declare function duree(x: string): number;\n' }
    );
    expect(r.status).toBe(1);
    expect(refus(r.stderr), 'the refusal is written').toMatch(/a changé/);
    expect(r.stderr).not.toMatch(AVERTISSEMENT_DU_RAPPORT);
  });
  it('critère 11: an export added without its report is refused, without the warning on that report', () => {
    const r = apres(
      { 'src/a/docs/INTERFACE.md': '# a\n\nA.\n\n## `duree`(x)\n\nR.\n\n## `tempo`\n\nT.\n' },
      {
        'dist/a/index.d.ts':
          'export declare function duree(x: number): number;\nexport declare const tempo: number;\n',
      }
    );
    expect(r.status).toBe(1);
    expect(refus(r.stderr), 'the refusal is written').toMatch(/a changé/);
    expect(r.stderr).not.toMatch(AVERTISSEMENT_DU_RAPPORT);
  });
  it('critère 11: a run with one report missing and another changed relays neither warning', () => {
    const p = projet({});
    p.run('--ecrire');
    for (const [rel, text] of Object.entries(PACKAGE_B)) {
      mkdirSync(path.dirname(path.join(p.dir, rel)), { recursive: true });
      writeFileSync(path.join(p.dir, rel), text);
    }
    writeFileSync(
      path.join(p.dir, 'dist/a/index.d.ts'),
      'export declare function duree(x: string): number;\n'
    );
    const r = p.run();
    expect(r.status).toBe(1);
    const lignes = refus(r.stderr)
      .split('\n')
      .filter(l => /INTERFACE\.api\.md/.test(l));
    expect(lignes.length, 'two refusals, one per component').toBe(2);
    expect(r.stderr).not.toMatch(AVERTISSEMENT_DU_RAPPORT);
  });
  it("critère 11: the check's other signals stay, next to a refused report", () => {
    const r = projet({ 'src/b/index.ts': 'export const b = 1;\n' }).run();
    expect(r.status).toBe(1);
    expect(refus(r.stderr), 'the refusal is written').toMatch(/src\/a.*INTERFACE\.api\.md/);
    expect(signaux(r.stderr)).toMatch(/src\/b n'a pas d'interface/);
    expect(r.stderr).not.toMatch(AVERTISSEMENT_DU_RAPPORT);
  });
});

// grillhouse-3uv.60 critère 12: when the report is missing or changed, docs/INTERFACE.md is
// compared to the built API — an element the code exports gets no « que le code n'exporte pas »
// refusal, and an export the interface does not describe gets its own.
const NON_EXPORTE = (nom: string) => new RegExp(`décrit ${nom}, que le code n'exporte pas`);
const NON_DECRIT = (nom: string) =>
  new RegExp(`exporte ${nom}, que docs/INTERFACE\\.md ne décrit pas`);
const DUREE_ET_TEMPO =
  'export declare function duree(x: number): number;\nexport declare const tempo: number;\n';
const IFACE_DUREE_ET_TEMPO = '# a\n\nA.\n\n## `duree`(x)\n\nR.\n\n## `tempo`\n\nT.\n';
// A project whose module `a` has its report, with package b added afterwards without its report.
const avecPaquetSansRapport = (b: Record<string, string> = {}) => {
  const p = projet({});
  p.run('--ecrire');
  for (const [rel, text] of Object.entries({ ...PACKAGE_B, ...b })) {
    mkdirSync(path.dirname(path.join(p.dir, rel)), { recursive: true });
    writeFileSync(path.join(p.dir, rel), text);
  }
  return p.run();
};

describe('grillhouse-3uv.60 critère 12', () => {
  it('critère 12: a module without its report gets no refusal for an element its code exports', () => {
    const r = projet({}).run();
    expect(r.status).toBe(1);
    expect(refus(r.stderr), 'the missing report is refused').toMatch(/src\/a.*manque/);
    expect(refus(r.stderr)).not.toMatch(NON_EXPORTE('duree'));
    expect(refus(r.stderr)).not.toMatch(/que le code n'exporte pas/);
  });
  it('critère 12: a module without its report, every exported element described, gets the missing-report refusal only', () => {
    const r = projet({
      'dist/a/index.d.ts': DUREE_ET_TEMPO,
      'src/a/docs/INTERFACE.md': IFACE_DUREE_ET_TEMPO,
    }).run();
    const lignes = refus(r.stderr).split('\n').filter(Boolean);
    expect(lignes.length, lignes.join('\n')).toBe(1);
    expect(lignes[0]).toMatch(/manque/);
  });
  it('critère 12: a module without its report gets the refusal of an export its interface does not describe', () => {
    const r = projet({ 'dist/a/index.d.ts': DUREE_ET_TEMPO }).run();
    expect(r.status).toBe(1);
    expect(refus(r.stderr)).toMatch(/src\/a.*manque/);
    expect(refus(r.stderr)).toMatch(NON_DECRIT('tempo'));
    expect(refus(r.stderr)).not.toMatch(NON_EXPORTE('duree'));
  });
  it('critère 12: a module without its report still gets the refusal of an element its code does not export', () => {
    const r = projet({
      'src/a/docs/INTERFACE.md': '# a\n\nA.\n\n## `duree`(x)\n\nR.\n\n## `vitesse`()\n\nV.\n',
    }).run();
    expect(refus(r.stderr)).toMatch(NON_EXPORTE('vitesse'));
    expect(refus(r.stderr)).not.toMatch(NON_EXPORTE('duree'));
  });
  it('critère 12: a package without its report gets no refusal for an element its code exports', () => {
    const r = avecPaquetSansRapport();
    expect(r.status).toBe(1);
    expect(refus(r.stderr), 'the missing report is refused').toMatch(/packages\/b.*manque/);
    expect(refus(r.stderr)).not.toMatch(NON_EXPORTE('b'));
    expect(refus(r.stderr)).not.toMatch(/que le code n'exporte pas/);
  });
  it('critère 12: a package without its report gets the refusal of an export its interface does not describe', () => {
    const r = avecPaquetSansRapport({
      'packages/b/dist/index.d.ts':
        'export declare const b: number;\nexport declare function mesure(): number;\n',
    });
    expect(r.status).toBe(1);
    expect(refus(r.stderr)).toMatch(/packages\/b.*manque/);
    expect(refus(r.stderr)).toMatch(NON_DECRIT('mesure'));
    expect(refus(r.stderr)).not.toMatch(NON_EXPORTE('b'));
  });
  it('critère 12: an export added to the code and the interface without regenerating the report gets no refusal on it', () => {
    const r = apres(
      { 'src/a/docs/INTERFACE.md': IFACE_DUREE_ET_TEMPO },
      { 'dist/a/index.d.ts': DUREE_ET_TEMPO }
    );
    expect(r.status).toBe(1);
    expect(refus(r.stderr), 'the changed API is refused').toMatch(/a changé/);
    expect(refus(r.stderr)).not.toMatch(NON_EXPORTE('tempo'));
    expect(refus(r.stderr)).not.toMatch(/que le code n'exporte pas/);
  });
  it('critère 12: an export added to the code only, report not regenerated, gets the refusal of an undescribed export', () => {
    const r = apres({}, { 'dist/a/index.d.ts': DUREE_ET_TEMPO });
    expect(r.status).toBe(1);
    expect(refus(r.stderr)).toMatch(/a changé/);
    expect(refus(r.stderr)).toMatch(NON_DECRIT('tempo'));
  });
  it('critère 12: an export removed from the code, report not regenerated, gets the refusal of the element still described', () => {
    const r = apres(
      {
        'dist/a/index.d.ts': DUREE_ET_TEMPO,
        'src/a/docs/INTERFACE.md': IFACE_DUREE_ET_TEMPO,
      },
      { 'dist/a/index.d.ts': 'export declare function duree(x: number): number;\n' }
    );
    expect(r.status).toBe(1);
    expect(refus(r.stderr)).toMatch(/a changé/);
    expect(refus(r.stderr)).toMatch(NON_EXPORTE('tempo'));
    expect(refus(r.stderr)).not.toMatch(NON_EXPORTE('duree'));
  });
  it('critère 12: the comparison to the built API leaves the report in the repository untouched', () => {
    const p = projet({});
    p.run();
    expect(existsSync(path.join(p.dir, 'src/a/docs/INTERFACE.api.md'))).toBe(false);
  });
});
