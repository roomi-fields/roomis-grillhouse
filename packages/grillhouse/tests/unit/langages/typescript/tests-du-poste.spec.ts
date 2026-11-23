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
  REGLE_EQUIPEE,
  verifier,
} from '../../../../scripts/langages/typescript/tests-du-poste.mjs';
import {
  nuit,
  porteLEtiquetteDuPoste,
  porteLEtiquetteEquipee,
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
const ETIQUETTE = "// @poste: la session de l'utilisateur\n";
const EQUIPEE = "// @equipee: l'enveloppe bwrap\n";
const BD = "it.runIf(hasBd)('b', () => {});\n";
const TEMPORAL = "spawn(t, ['server', 'start-dev']);\n";

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

  it('names the envelope for its night tests played by their name, and the binaries of the module cargo for the template of a project of Rust', () => {
    const lire = lecteur({
      'a.nuit.spec.ts':
        "const L = ['enveloppe.lanceur', 'verrous'].map(f => `tests/${f}.nuit.spec.ts`);\n",
      'b.nuit.spec.ts':
        "const G = JSON.parse(readFileSync(path.join(RACINE, 'templates/cargo/package.json'), 'utf8'));\n",
      'c.nuit.spec.ts': "const S = ['tests/unit/enveloppe.spec.ts', 'templates/typescript'];\n",
    });
    expect(dependancesDu('/p/a.nuit.spec.ts', lire, '/p')).toEqual(["l'enveloppe bwrap"]);
    expect(dependancesDu('/p/b.nuit.spec.ts', lire, '/p')).toEqual([
      'les binaires du module cargo',
    ]);
    expect(dependancesDu('/p/c.nuit.spec.ts', lire, '/p')).toEqual([]);
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
    const r = projet({ 'tests/a.nuit.spec.ts': BD, 'tests/b.nuit.spec.ts': SIMPLE });
    expect(verifier(r)).toEqual([
      expect.objectContaining({ fichier: 'tests/a.nuit.spec.ts', regle: REGLE }),
    ]);
    expect(verifier(r)[0]?.message).toContain('le bd réel');
    const { code, lignes } = rapport(r, {});
    expect(code).toBe(1);
    expect(lignes[0]).toMatch(/^⛔ tests\/a\.nuit\.spec\.ts : /);
  });

  it('passes a tagged night test, a tag without a mark, and a day test with a mark', () => {
    const r = projet({
      'tests/a.nuit.spec.ts': `${EQUIPEE}${ENVELOPPE}`,
      'tests/b.nuit.spec.ts': `${ETIQUETTE}${SIMPLE}`,
      'tests/c.spec.ts': ENVELOPPE,
      'tests/d.nuit.spec.ts': `${ETIQUETTE}${BD}`,
    });
    const { code, lignes } = rapport(r, {});
    expect(code).toBe(0);
    expect(lignes.at(-1)).toContain('3 test(s) de nuit');
  });
});

describe('the tag @equipee of a night test that needs the equipment of a machine', () => {
  it('a line « // @equipee » before the first line of code tags the file, beside @poste', () => {
    expect(porteLEtiquetteEquipee(`${EQUIPEE}${SIMPLE}`)).toBe(true);
    expect(porteLEtiquetteEquipee(`${ETIQUETTE}${EQUIPEE}${SIMPLE}`)).toBe(true);
    expect(porteLEtiquetteDuPoste(`${ETIQUETTE}${EQUIPEE}${SIMPLE}`)).toBe(true);
  });

  it('a file without the line, or with it after its first line of code, is not tagged', () => {
    expect(porteLEtiquetteEquipee(SIMPLE)).toBe(false);
    expect(porteLEtiquetteEquipee(`${SIMPLE}${EQUIPEE}`)).toBe(false);
    expect(porteLEtiquetteEquipee('// @equipeement: rien\n')).toBe(false);
    expect(porteLEtiquetteEquipee(`${ETIQUETTE}${SIMPLE}`)).toBe(false);
  });

  it('is not the tag @poste: a file tagged @equipee alone does not bear @poste', () => {
    expect(porteLEtiquetteDuPoste(`${EQUIPEE}${SIMPLE}`)).toBe(false);
  });

  it('is asked for the envelope, a Temporal server, sccache and the binaries of the module cargo', () => {
    const r = projet({
      'tests/a.nuit.spec.ts': ENVELOPPE,
      'tests/b.nuit.spec.ts': TEMPORAL,
      'tests/c.nuit.spec.ts': "spawnSync('sccache', ['--show-stats']);\n",
      'tests/d.nuit.spec.ts': "const G = path.join(RACINE, 'templates/cargo/package.json');\n",
    });
    const constats = verifier(r);
    expect(constats.map(c => c.fichier).sort()).toEqual([
      'tests/a.nuit.spec.ts',
      'tests/b.nuit.spec.ts',
      'tests/c.nuit.spec.ts',
      'tests/d.nuit.spec.ts',
    ]);
    for (const c of constats) {
      expect(c.regle).toBe(REGLE_EQUIPEE);
      expect(c.message).toContain('@equipee');
    }
  });

  it('is not asked for the real bd, systemd, the keyring, the session of the user or a session of claude, which ask @poste', () => {
    const r = projet({
      'tests/a.nuit.spec.ts': BD,
      'tests/b.nuit.spec.ts': "spawnSync('systemctl', ['status']);\n",
      'tests/c.nuit.spec.ts': "const K = '~/.local/share/keyrings';\n",
      'tests/d.nuit.spec.ts': "const S = '/run/user/1000/bus';\n",
      'tests/e.nuit.spec.ts': "spawnSync('claude', ['-p', 'bonjour']);\n",
    });
    const constats = verifier(r);
    expect(constats).toHaveLength(5);
    for (const c of constats) {
      expect(c.regle).toBe(REGLE);
      expect(c.message).toContain('@poste');
    }
  });

  it('accepts the tag @equipee for what needs equipment, and refuses the tag @poste alone', () => {
    const r = projet({
      'tests/a.nuit.spec.ts': `${EQUIPEE}${ENVELOPPE}`,
      'tests/b.nuit.spec.ts': `${ETIQUETTE}${ENVELOPPE}`,
    });
    expect(verifier(r)).toEqual([
      expect.objectContaining({ fichier: 'tests/b.nuit.spec.ts', regle: REGLE_EQUIPEE }),
    ]);
  });

  it('a test of both classes needs both tags, and each missing tag is its own finding', () => {
    const texte = `${ENVELOPPE}${BD}`;
    const r = projet({
      'tests/a.nuit.spec.ts': `${ETIQUETTE}${EQUIPEE}${texte}`,
      'tests/b.nuit.spec.ts': `${ETIQUETTE}${texte}`,
      'tests/c.nuit.spec.ts': `${EQUIPEE}${texte}`,
      'tests/d.nuit.spec.ts': texte,
    });
    const constats = verifier(r).map(c => `${c.fichier} ${c.regle}`);
    expect(constats.sort()).toEqual(
      [
        `tests/b.nuit.spec.ts ${REGLE_EQUIPEE}`,
        `tests/c.nuit.spec.ts ${REGLE}`,
        `tests/d.nuit.spec.ts ${REGLE}`,
        `tests/d.nuit.spec.ts ${REGLE_EQUIPEE}`,
      ].sort()
    );
  });

  it('follows the marks of the test material the test imports', () => {
    const r = projet({
      'tests/a.nuit.spec.ts': "import { banc } from './banc.js';\nbanc();\n",
      'tests/banc.ts': `export const banc = () => { ${TEMPORAL} };\n`,
    });
    expect(verifier(r)).toEqual([
      expect.objectContaining({ fichier: 'tests/a.nuit.spec.ts', regle: REGLE_EQUIPEE }),
    ]);
  });

  it('refuses the finding through the guard’s report, and passes once the tag is written', () => {
    const r = projet({ 'tests/a.nuit.spec.ts': TEMPORAL });
    expect(rapport(r, {}).code).toBe(1);
    const bon = projet({ 'tests/a.nuit.spec.ts': `${EQUIPEE}${TEMPORAL}` });
    expect(rapport(bon, {}).code).toBe(0);
  });
});

describe('the night picks its tests by tag', () => {
  const duDepot = () =>
    projet({
      'tests/libre.nuit.spec.ts': SIMPLE,
      'tests/poste.nuit.spec.ts': `${ETIQUETTE}${BD}`,
      'tests/equipee.nuit.spec.ts': `${EQUIPEE}${ENVELOPPE}`,
      'tests/les-deux.nuit.spec.ts': `${ETIQUETTE}${EQUIPEE}${ENVELOPPE}${BD}`,
    });
  const jouer = async (choix: string) => {
    const r = duDepot();
    const config: { root: string; test?: { include?: string[]; exclude?: string[] } } = {
      root: r,
    };
    await nuit({ GRILLHOUSE_TESTS_DE_NUIT: choix }).config(config);
    return config.test ?? {};
  };

  it('the night of an equipped runner plays everything but @poste, the tests tagged @equipee included', async () => {
    const test = await jouer('hors-poste');
    expect(test.include).toEqual(['**/*.nuit.{test,spec}.?(c|m)[jt]s?(x)']);
    expect(test.exclude).toEqual(
      expect.arrayContaining(['tests/poste.nuit.spec.ts', 'tests/les-deux.nuit.spec.ts'])
    );
    expect(test.exclude).not.toContain('tests/equipee.nuit.spec.ts');
    expect(test.exclude).not.toContain('tests/libre.nuit.spec.ts');
  });

  it('the night of a runner without equipment plays everything but @poste and @equipee', async () => {
    const test = await jouer('hors-poste-sans-equipement');
    expect(test.include).toEqual(['**/*.nuit.{test,spec}.?(c|m)[jt]s?(x)']);
    expect(test.exclude).toEqual(
      expect.arrayContaining([
        'tests/poste.nuit.spec.ts',
        'tests/equipee.nuit.spec.ts',
        'tests/les-deux.nuit.spec.ts',
      ])
    );
    expect(test.exclude).not.toContain('tests/libre.nuit.spec.ts');
  });

  it('the night of the poste plays the tests tagged @poste alone', async () => {
    const test = await jouer('du-poste');
    expect([...(test.include ?? [])].sort()).toEqual([
      'tests/les-deux.nuit.spec.ts',
      'tests/poste.nuit.spec.ts',
    ]);
  });

  it('the choice of the night’s complete play (nuit) still plays every night test', async () => {
    const test = await jouer('nuit');
    expect(test.include).toEqual(['**/*.nuit.{test,spec}.?(c|m)[jt]s?(x)']);
    expect(test.exclude ?? []).not.toContain('tests/equipee.nuit.spec.ts');
    expect(test.exclude ?? []).not.toContain('tests/poste.nuit.spec.ts');
  });

  it('runs: --sans-equipement and --du-poste are runs of their own, the measures alone another', () => {
    const r = duDepot();
    const avecBanc = projet({
      'tests/a.nuit.spec.ts': SIMPLE,
      'tests/temps.budget.test.ts': SIMPLE,
    });
    expect(runsDeLaNuit(r, { horsDuPoste: true, sansEquipement: true })).toEqual([
      'hors-poste-sans-equipement',
    ]);
    expect(runsDeLaNuit(r, { duPoste: true })).toEqual(['du-poste']);
    expect(runsDeLaNuit(avecBanc, { duPoste: true })).toEqual(['mesures']);
    expect(runsDeLaNuit(avecBanc, { mesuresSeules: true })).toEqual(['mesures']);
    expect(runsDeLaNuit(r, { mesuresSeules: true })).toEqual([]);
  });

  it('reads --sans-equipement beside --hors-du-poste, --du-poste and --mesures alone', () => {
    expect(
      lireLesArguments(['--hors-du-poste', '--sans-equipement', '--tranche', '1/3'])
    ).toMatchObject({ horsDuPoste: true, sansEquipement: true, tranche: { index: 1, count: 3 } });
    expect(lireLesArguments(['--du-poste'])).toMatchObject({ duPoste: true });
    expect(lireLesArguments(['--mesures'])).toMatchObject({ mesuresSeules: true });
    expect(lireLesArguments(['--du-poste']).erreur).toBeUndefined();
    expect(lireLesArguments(['--mesures']).erreur).toBeUndefined();
  });

  it('refuses --sans-equipement without --hors-du-poste, and --du-poste with it', () => {
    expect(lireLesArguments(['--sans-equipement']).erreur).toContain('--hors-du-poste');
    expect(lireLesArguments(['--du-poste', '--hors-du-poste']).erreur).toBeTruthy();
    expect(lireLesArguments(['--mesures', '--hors-du-poste']).erreur).toBeTruthy();
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
    expect(lireLesArguments(['--hors-du-poste', '--tranche', '2/3'])).toMatchObject({
      horsDuPoste: true,
      tranche: { index: 2, count: 3 },
    });
    expect(lireLesArguments(['--tranche=1/3', '--hors-du-poste']).tranche).toEqual({
      index: 1,
      count: 3,
    });
    expect(lireLesArguments([])).toMatchObject({ horsDuPoste: false });
    expect(lireLesArguments([]).tranche).toBeUndefined();
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
    const r = projet({ 'tests/a.nuit.spec.ts': BD, 'tests/b.nuit.spec.ts': SIMPLE });
    const lignes = migration.migrer(r);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatch(new RegExp(`^${FICHIER} : 1 test`));
    expect(lire(r)).toEqual({ [GARDE]: { 'tests/a.nuit.spec.ts': { [REGLE]: { count: 1 } } } });
    expect(juger(lire(r), GARDE, verifier(r)).refus).toEqual([]);
    expect(readFileSync(path.join(r, 'tests/a.nuit.spec.ts'), 'utf8')).toBe(BD);
    expect(migration.migrer(r)).toEqual([]);
  });
});
