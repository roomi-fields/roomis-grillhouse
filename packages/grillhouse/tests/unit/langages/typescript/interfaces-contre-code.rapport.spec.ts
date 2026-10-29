import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  refus,
  FIN,
  DEBUT,
  TSCONFIG,
  DUREE,
  interfacesEssai,
} from './interfaces-contre-code-essai.js';

// The check of each interface text against its component's code
// (scripts/langages/typescript/interfaces-contre-code.mjs, npm run api) and the index of the interfaces
// (scripts/langages/typescript/index-interfaces.mjs). This file: the report of API Extractor beside each interface,
// judged against the built API (grillhouse-3uv.60).
// The projects of trial and their checks: ./interfaces-contre-code-essai.ts.

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'interfaces-contre-code-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { projet, ecrit } = interfacesEssai(ESSAIS);

// grillhouse-3uv.60: the check names the command that writes a report — npm run api, after the
// build — when the report is missing (critère 2) and when the API changed without it (critère 6).
// Each project below is otherwise up to date (TSDoc, generated parts written by npm run api), so
// the report is the only thing it lacks.
const PACKAGE_B = {
  'packages/b/package.json': JSON.stringify({ name: 'b', types: './dist/index.d.ts' }),
  'packages/b/tsconfig.json': TSCONFIG,
  'packages/b/dist/index.d.ts': '/** Un nombre. */\nexport declare const b: number;\n',
  'packages/b/docs/INTERFACE.md': `# b\n\nB.\n\n${DEBUT}\n${FIN}\n`,
};
const RAPPORT_A = 'src/a/docs/INTERFACE.api.md';
const RAPPORT_B = 'packages/b/docs/INTERFACE.api.md';
const NOMME_API = /npm run api/;
const NOMME_CONSTRUCTION = /constru/i;
// `duree` with another parameter type: a changed API.
const DUREE_CHANGEE = DUREE.replace('x: number)', 'x: string)');
// `duree` and a second export, `tempo`.
const DUREE_ET_TEMPO = DUREE + '/** Un tempo. */\nexport declare const tempo: number;\n';
// The refusals of a run as one text.
const refusTexte = (stderr: string) => refus(stderr).join('\n');
const pose = (p: { dir: string }, files: Record<string, string>) => {
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(p.dir, rel)), { recursive: true });
    writeFileSync(path.join(p.dir, rel), text);
  }
};
// A project written by npm run api, then the report of module a removed.
const sansRapport = (files: Record<string, string> = {}) => {
  const p = ecrit(files);
  rmSync(path.join(p.dir, RAPPORT_A));
  return p;
};
// A project whose module a has its report, with package b written by npm run api, then the report
// of b removed.
const avecPaquetSansRapport = (b: Record<string, string> = {}) => {
  const p = ecrit({});
  pose(p, { ...PACKAGE_B, ...b });
  p.run('--ecrire');
  rmSync(path.join(p.dir, RAPPORT_B));
  return p;
};
// A project whose code changed and whose interfaces npm run api rewrote, the report of module a
// put back to the one of the former code: the API changed without its report.
const sansSonRapport = (files: Record<string, string>, change: Record<string, string>) => {
  const p = ecrit(files);
  const ancien = p.lire(RAPPORT_A);
  pose(p, change);
  p.run('--ecrire');
  writeFileSync(path.join(p.dir, RAPPORT_A), ancien);
  return p;
};
// Module a's API changed without its report, and package b without its report.
const deuxRapportsPerimes = () => {
  const p = ecrit({});
  const ancien = p.lire(RAPPORT_A);
  pose(p, { ...PACKAGE_B, 'dist/a/index.d.ts': DUREE_CHANGEE });
  p.run('--ecrire');
  writeFileSync(path.join(p.dir, RAPPORT_A), ancien);
  rmSync(path.join(p.dir, RAPPORT_B));
  return p;
};

describe('grillhouse-3uv.60 critère 2 — a missing report names npm run api, after the build', () => {
  it('critère 2: a built module with its interface and no report is refused as a missing report', () => {
    const r = sansRapport().run();
    expect(r.status).toBe(1);
    expect(refusTexte(r.stderr)).toMatch(/src\/a/);
    expect(refusTexte(r.stderr)).toMatch(/INTERFACE\.api\.md/);
    expect(refusTexte(r.stderr)).toMatch(/manque/);
    expect(refusTexte(r.stderr)).not.toMatch(/a changé/);
  });
  it('critère 2: the refusal of a missing report names npm run api and the build', () => {
    const r = sansRapport().run();
    expect(refusTexte(r.stderr)).toMatch(NOMME_API);
    expect(refusTexte(r.stderr)).toMatch(NOMME_CONSTRUCTION);
  });
  it('critère 2: a built package with its interface and no report is refused the same way', () => {
    const r = avecPaquetSansRapport().run();
    expect(r.status).toBe(1);
    const lignes = refus(r.stderr).filter(l => l.includes('packages/b'));
    expect(lignes.join('\n')).toMatch(/manque/);
    expect(lignes.join('\n')).toMatch(NOMME_API);
    expect(lignes.join('\n')).not.toMatch(/a changé/);
    expect(refusTexte(r.stderr)).not.toMatch(/src\/a/);
  });
  it('critère 2: --ecrire writes the missing report, and the check then passes', () => {
    const p = projet({});
    expect(p.run('--ecrire').status).toBe(0);
    expect(existsSync(path.join(p.dir, RAPPORT_A))).toBe(true);
    const r = p.run();
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
});

describe('grillhouse-3uv.60 critère 6 — an API changed without its report names npm run api', () => {
  it('critère 6: the refusal of a changed API names npm run api', () => {
    const r = sansSonRapport({}, { 'dist/a/index.d.ts': DUREE_CHANGEE }).run();
    expect(r.status).toBe(1);
    expect(refusTexte(r.stderr)).toMatch(/l'API a changé sans son rapport/);
    expect(refusTexte(r.stderr)).toMatch(NOMME_API);
    expect(refusTexte(r.stderr)).not.toMatch(/manque/);
  });
  it('critère 6: an export added without its report names npm run api too', () => {
    const r = sansSonRapport({}, { 'dist/a/index.d.ts': DUREE_ET_TEMPO }).run();
    expect(r.status).toBe(1);
    expect(refusTexte(r.stderr)).toMatch(/a changé/);
    expect(refusTexte(r.stderr)).toMatch(NOMME_API);
  });
});

// grillhouse-3uv.60 critère 10: npm run api replaces the former command in the check's messages.
const ANCIENNE_COMMANDE = /--ecrire|interfaces-contre-code\.mjs/;

describe('grillhouse-3uv.60 critère 10 — the messages no longer name the former command', () => {
  it('critère 10: the refusal of a missing report names neither --ecrire nor the script', () => {
    const r = sansRapport().run();
    expect(r.status).toBe(1);
    expect(refusTexte(r.stderr), 'a refusal is written').toMatch(/src\/a/);
    expect(r.stderr).not.toMatch(ANCIENNE_COMMANDE);
  });
  it('critère 10: the refusal of a changed API names neither --ecrire nor the script', () => {
    const r = sansSonRapport({}, { 'dist/a/index.d.ts': DUREE_CHANGEE }).run();
    expect(r.status).toBe(1);
    expect(refusTexte(r.stderr), 'a refusal is written').toMatch(/src\/a/);
    expect(r.stderr).not.toMatch(ANCIENNE_COMMANDE);
  });
  it('critère 10: the refusal of a package missing its report names neither --ecrire nor the script', () => {
    const r = avecPaquetSansRapport().run();
    expect(r.status).toBe(1);
    expect(refusTexte(r.stderr), 'a refusal is written').toMatch(/packages\/b/);
    expect(r.stderr).not.toMatch(ANCIENNE_COMMANDE);
  });
  it('critère 10: each refusal of a run with several reports out of date names npm run api, never the former command', () => {
    const r = deuxRapportsPerimes().run();
    const lignes = refus(r.stderr).filter(l => /manque|a changé/.test(l));
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
    const r = sansRapport().run();
    expect(r.status).toBe(1);
    expect(refusTexte(r.stderr), 'the refusal is written').toMatch(/src\/a.*INTERFACE\.api\.md/);
    expect(signaux(r.stderr)).not.toMatch(AVERTISSEMENT_DU_RAPPORT);
    expect(r.stderr).not.toMatch(AVERTISSEMENT_DU_RAPPORT);
  });
  it('critère 11: the run names no temporary report file', () => {
    const r = sansRapport().run();
    expect(r.status).toBe(1);
    expect(r.stderr).not.toMatch(CHEMIN_DE_RAPPORT);
  });
  it('critère 11: a package missing its report is refused, without the warning on that report', () => {
    const r = avecPaquetSansRapport().run();
    expect(r.status).toBe(1);
    expect(refusTexte(r.stderr), 'the refusal is written').toMatch(/packages\/b/);
    expect(r.stderr).not.toMatch(AVERTISSEMENT_DU_RAPPORT);
  });
  it('critère 11: an API changed without its report is refused, without the warning on that report', () => {
    const r = sansSonRapport({}, { 'dist/a/index.d.ts': DUREE_CHANGEE }).run();
    expect(r.status).toBe(1);
    expect(refusTexte(r.stderr), 'the refusal is written').toMatch(/a changé/);
    expect(r.stderr).not.toMatch(AVERTISSEMENT_DU_RAPPORT);
  });
  it('critère 11: an export added without its report is refused, without the warning on that report', () => {
    const r = sansSonRapport({}, { 'dist/a/index.d.ts': DUREE_ET_TEMPO }).run();
    expect(r.status).toBe(1);
    expect(refusTexte(r.stderr), 'the refusal is written').toMatch(/a changé/);
    expect(r.stderr).not.toMatch(AVERTISSEMENT_DU_RAPPORT);
  });
  it('critère 11: a run with one report missing and another changed relays neither warning', () => {
    const r = deuxRapportsPerimes().run();
    expect(r.status).toBe(1);
    const lignes = refus(r.stderr).filter(l => /INTERFACE\.api\.md/.test(l));
    expect(lignes.length, 'two refusals, one per component').toBe(2);
    expect(r.stderr).not.toMatch(AVERTISSEMENT_DU_RAPPORT);
  });
  it("critère 11: the check's other signals stay, next to a refused report", () => {
    const r = sansRapport({ 'src/b/index.ts': 'export const b = 1;\n' }).run();
    expect(r.status).toBe(1);
    expect(refusTexte(r.stderr), 'the refusal is written').toMatch(/src\/a.*INTERFACE\.api\.md/);
    expect(signaux(r.stderr)).toMatch(/src\/b n'a pas d'interface/);
    expect(r.stderr).not.toMatch(AVERTISSEMENT_DU_RAPPORT);
  });
});

// grillhouse-3uv.60 critère 12: when the report is missing or changed, the interface is judged
// against the built API, never against the report in the repository. Its tests of the former
// rule (an element described that the code does not export, an export the interface does not
// describe) left with that rule (grillhouse-3uv.64, critère 7).
describe('grillhouse-3uv.60 critère 12 — the interface is judged against the built API', () => {
  it('critère 12: a module without its report, its generated part up to date, gets the missing-report refusal only', () => {
    const r = sansRapport({ 'dist/a/index.d.ts': DUREE_ET_TEMPO }).run();
    const lignes = refus(r.stderr);
    expect(lignes.length, r.stderr).toBe(1);
    expect(lignes[0]).toMatch(/manque/);
  });
  it('critère 12: an export added to the code and the generated part without its report gets the changed-API refusal only', () => {
    const r = sansSonRapport({}, { 'dist/a/index.d.ts': DUREE_ET_TEMPO }).run();
    const lignes = refus(r.stderr);
    expect(lignes.length, r.stderr).toBe(1);
    expect(lignes[0]).toMatch(/a changé/);
    expect(lignes[0]).not.toMatch(/\btempo\b/);
  });
  it('critère 12: the comparison to the built API leaves the report in the repository untouched', () => {
    const p = sansRapport();
    p.run();
    expect(existsSync(path.join(p.dir, RAPPORT_A))).toBe(false);
  });
  it('critère 12: a changed API leaves the former report in the repository untouched', () => {
    const p = sansSonRapport({}, { 'dist/a/index.d.ts': DUREE_CHANGEE });
    const ancien = p.lire(RAPPORT_A);
    p.run();
    expect(p.lire(RAPPORT_A)).toBe(ancien);
  });
});
