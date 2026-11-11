// The night tests of the poste: a night test that depends on what a shared machine does not have
// bears the tag `@poste` at its head (scripts/langages/typescript/vitest-config/cibles.mjs), the
// guard refuses one without it (scripts/langages/typescript/tests-du-poste.mjs), the night of a
// shared machine leaves the tagged ones out and plays no measure of time
// (scripts/langages/typescript/tests-de-nuit.mjs), and the update inscribes the existing ones in the
// project's debt (migrations/0.33.0-tests-du-poste.mjs).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { FICHIER, juger, lire } from '../../../../scripts/dette.mjs';
import { migrationsDe } from '../../../../scripts/migrations.mjs';
import * as migration from '../../../../scripts/langages/typescript/migrations/0.33.0-tests-du-poste.mjs';
import {
  lireLesArguments,
  runsDeLaNuit,
} from '../../../../scripts/langages/typescript/tests-de-nuit.mjs';
import {
  dependancesDu,
  GARDE,
  rapport,
  REGLE,
  verifier,
} from '../../../../scripts/langages/typescript/tests-du-poste.mjs';
import {
  nuit,
  porteLEtiquetteDuPoste,
  testsDuPoste,
} from '../../../../scripts/langages/typescript/vitest-config/cibles.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tests-du-poste-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// A project of trial holding <fichiers>, out of git: the guard lists its files under its root.
function projet(fichiers: Record<string, string>) {
  const r = mkdtempSync(path.join(ESSAIS, 'projet-'));
  for (const [f, t] of Object.entries(fichiers)) {
    mkdirSync(path.dirname(path.join(r, f)), { recursive: true });
    writeFileSync(path.join(r, f), t);
  }
  return r;
}

// A reader of the files <fichiers>, absolute paths under /p.
const lecteur = (fichiers: Record<string, string>) => (f: string) =>
  fichiers[path.relative('/p', f)] ?? null;

const ENVELOPPE =
  "import { canWrap } from '@roomi-fields/grillhouse-matiere/test-fixtures';\ndescribe.runIf(canWrap)('x', () => {});\n";
const SIMPLE = "import { it } from 'vitest';\nit('a', () => {});\n";
const ETIQUETTE = "// @poste: l'enveloppe bwrap\n";

describe('the tag @poste lives in the comment at the head of the test', () => {
  it('a line « // @poste » before the first line of code tags the file', () => {
    expect(porteLEtiquetteDuPoste(`${ETIQUETTE}${SIMPLE}`)).toBe(true);
    expect(porteLEtiquetteDuPoste(`// The tests of x.\n//\n// @poste: bd\n\n${SIMPLE}`)).toBe(true);
  });

  it('a file without the line, or with it after its first line of code, is not tagged', () => {
    expect(porteLEtiquetteDuPoste(SIMPLE)).toBe(false);
    expect(porteLEtiquetteDuPoste(`${SIMPLE}${ETIQUETTE}`)).toBe(false);
    expect(porteLEtiquetteDuPoste('// @posteriori: rien\n')).toBe(false);
  });
});

describe('the marks of the poste a night test shows', () => {
  it('names the envelope, the real bd, a Temporal server, sccache and a session of claude', () => {
    const lire = lecteur({
      'a.nuit.spec.ts': ENVELOPPE,
      'b.nuit.spec.ts': "it.runIf(hasBd)('b', () => {});\n",
      'c.nuit.spec.ts': "spawn(t, ['server', 'start-dev', '--headless']);\n",
      'd.nuit.spec.ts': "spawnSync('sccache', ['--show-stats']);\n",
      'e.nuit.spec.ts': "spawnSync('claude', ['-p', 'bonjour']);\n",
      'f.nuit.spec.ts': "const L = path.join(CADRE, 'scripts/enveloppe/lancer.sh');\n",
    });
    expect(dependancesDu('/p/a.nuit.spec.ts', lire, '/p')).toEqual(["l'enveloppe bwrap"]);
    expect(dependancesDu('/p/b.nuit.spec.ts', lire, '/p')).toEqual(['le bd réel']);
    expect(dependancesDu('/p/c.nuit.spec.ts', lire, '/p')).toEqual(['un serveur Temporal']);
    expect(dependancesDu('/p/d.nuit.spec.ts', lire, '/p')).toEqual(['sccache']);
    expect(dependancesDu('/p/e.nuit.spec.ts', lire, '/p')).toEqual(['une séance de claude']);
    expect(dependancesDu('/p/f.nuit.spec.ts', lire, '/p')).toEqual(["l'enveloppe bwrap"]);
  });

  it('the command claude started for its plugins or its version, and a mark in a comment, are none', () => {
    const lire = lecteur({
      'a.nuit.spec.ts':
        "spawnSync('claude', ['plugin', 'list']);\nspawnSync('claude', ['--version']);\n",
      'b.nuit.spec.ts': `// it runs without bwrap, canWrap or sccache\n${SIMPLE}`,
    });
    expect(dependancesDu('/p/a.nuit.spec.ts', lire, '/p')).toEqual([]);
    expect(dependancesDu('/p/b.nuit.spec.ts', lire, '/p')).toEqual([]);
  });

  it('follows the test material the test imports by a relative path, from file to file', () => {
    const lire = lecteur({
      'tests/a.nuit.spec.ts': "import { banc } from './banc.js';\nbanc();\n",
      'tests/banc.ts': "import { serveur } from './serveur.js';\nexport const banc = serveur;\n",
      'tests/serveur.ts': "export const serveur = () => spawn(t, ['server', 'start-dev']);\n",
    });
    expect(dependancesDu('/p/tests/a.nuit.spec.ts', lire, '/p')).toEqual(['un serveur Temporal']);
  });
});

describe('the guard of the night tests of the poste', () => {
  it('refuses a night test that depends on the poste without the tag, naming its marks', () => {
    const r = projet({ 'tests/a.nuit.spec.ts': ENVELOPPE, 'tests/b.nuit.spec.ts': SIMPLE });
    expect(verifier(r)).toEqual([
      expect.objectContaining({ fichier: 'tests/a.nuit.spec.ts', regle: REGLE }),
    ]);
    expect(verifier(r)[0]?.message).toContain("l'enveloppe bwrap");
    const { code, lignes } = rapport(r, {});
    expect(code).toBe(1);
    expect(lignes[0]).toMatch(/^⛔ tests\/a\.nuit\.spec\.ts : /);
  });

  it('passes a tagged night test, a tag without a mark, and a day test with a mark', () => {
    const r = projet({
      'tests/a.nuit.spec.ts': `${ETIQUETTE}${ENVELOPPE}`,
      'tests/b.nuit.spec.ts': `${ETIQUETTE}${SIMPLE}`,
      'tests/c.spec.ts': ENVELOPPE,
    });
    const { code, lignes } = rapport(r, {});
    expect(code).toBe(0);
    expect(lignes.at(-1)).toContain('2 test(s) de nuit, 2 laissé(s) au poste');
  });
});

describe('the night of a shared machine', () => {
  it('leaves out the night tests tagged @poste, and plays the others', async () => {
    const r = projet({
      'tests/a.nuit.spec.ts': `${ETIQUETTE}${ENVELOPPE}`,
      'packages/x/tests/b.nuit.test.ts': SIMPLE,
      'packages/x/tests/c.nuit.test.ts': `${ETIQUETTE}${SIMPLE}`,
    });
    expect(testsDuPoste(r)).toEqual(['packages/x/tests/c.nuit.test.ts', 'tests/a.nuit.spec.ts']);
    const config: { root: string; test?: { include?: string[]; exclude?: string[] } } = { root: r };
    await nuit({ GRILLHOUSE_TESTS_DE_NUIT: 'hors-poste' }).config(config);
    expect(config.test?.include).toEqual(['**/*.nuit.{test,spec}.?(c|m)[jt]s?(x)']);
    expect(config.test?.exclude).toEqual(
      expect.arrayContaining(['packages/x/tests/c.nuit.test.ts', 'tests/a.nuit.spec.ts'])
    );
    expect(config.test?.exclude).not.toContain('packages/x/tests/b.nuit.test.ts');
  });

  it('plays the night tests alone, never a measure of time', () => {
    const r = projet({
      'tests/a.nuit.spec.ts': SIMPLE,
      'tests/temps.budget.test.ts': SIMPLE,
    });
    expect(runsDeLaNuit(r, { horsDuPoste: true })).toEqual(['hors-poste']);
    expect(runsDeLaNuit(r)).toEqual(['nuit', 'mesures']);
    const bancsSeuls = projet({ 'tests/temps.budget.test.ts': SIMPLE });
    expect(runsDeLaNuit(bancsSeuls, { horsDuPoste: true })).toEqual([]);
  });
});

describe('the night of a shared machine in tranches', () => {
  it('reads --tranche i/n beside --hors-du-poste, in both spellings', () => {
    expect(lireLesArguments(['--hors-du-poste', '--tranche', '2/3'])).toEqual({
      horsDuPoste: true,
      tranche: { index: 2, count: 3 },
    });
    expect(lireLesArguments(['--tranche=1/3', '--hors-du-poste']).tranche).toEqual({
      index: 1,
      count: 3,
    });
    expect(lireLesArguments([])).toEqual({ horsDuPoste: false, tranche: undefined });
  });

  it('refuses a tranche not of the form i/n, a tranche of the poste, and an unknown argument', () => {
    for (const t of ['0/3', '4/3', 'a/b', '1/0']) {
      expect(lireLesArguments(['--hors-du-poste', '--tranche', t]).erreur).toContain('i/n');
    }
    expect(lireLesArguments(['--tranche', '1/3']).erreur).toContain('--hors-du-poste');
    expect(lireLesArguments(['--zut']).erreur).toContain('« --zut »');
  });

  it('gives the run its tranche: the shard, a blob report and the files of its part', async () => {
    const r = projet({ 'tests/a.nuit.spec.ts': SIMPLE });
    const rapports = path.join(r, '.vitest-reports');
    const config: {
      root: string;
      test?: { shard?: string; reporters?: unknown[]; include?: string[] };
    } = { root: r };
    await nuit({
      GRILLHOUSE_TESTS_DE_NUIT: 'hors-poste',
      GRILLHOUSE_TRANCHE_DE_NUIT: JSON.stringify({ tranche: '2/3', rapports }),
    }).config(config);
    expect(config.test?.shard).toBe('2/3');
    expect(config.test?.include).toEqual(['**/*.nuit.{test,spec}.?(c|m)[jt]s?(x)']);
    expect(JSON.stringify(config.test?.reporters)).toContain(path.join(rapports, 'blobs'));
  });
});

describe('migration 0.33.0 — the night tests of the poste without the tag inscribed in the debt', () => {
  it('is the migration of 0.33.0, « tests du poste », in the list', () => {
    expect(migration.version).toBe('0.33.0');
    expect(migration.nom).toBe('tests du poste');
    const depot = path.resolve(__dirname, '../../../../../..');
    expect(
      migrationsDe(depot).some(m => m.version === migration.version && m.nom === migration.nom)
    ).toBe(true);
  });

  it('inscribes them once, rewrites no test, and the guard then refuses none', () => {
    const r = projet({ 'tests/a.nuit.spec.ts': ENVELOPPE, 'tests/b.nuit.spec.ts': SIMPLE });
    const lignes = migration.migrer(r);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatch(new RegExp(`^${FICHIER} : 1 test`));
    expect(lire(r)).toEqual({ [GARDE]: { 'tests/a.nuit.spec.ts': { [REGLE]: { count: 1 } } } });
    expect(juger(lire(r), GARDE, verifier(r)).refus).toEqual([]);
    expect(readFileSync(path.join(r, 'tests/a.nuit.spec.ts'), 'utf8')).toBe(ENVELOPPE);
    expect(migration.migrer(r)).toEqual([]);
  });
});
