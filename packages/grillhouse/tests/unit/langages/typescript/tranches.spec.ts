// The tranches of a pass (`npm run verifier -- --tranche i/n`, scripts/langages/typescript/
// verifier.mjs and tranches.mjs): the reading of the option, the tasks a tranche plays, the
// variable of the tests that carries it, Vitest's split recorded by the sequencer, and the merge
// that refuses a file of the pass missing or played twice.
//
// Small tests: the functions, by import, without a repository or a run of Turborepo.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { BaseSequencer } from 'vitest/node';
import * as verifierMjs from '../../../../scripts/langages/typescript/verifier.mjs';
import * as tranchesMjs from '../../../../scripts/langages/typescript/tranches.mjs';

type Tranche = { index: number; count: number };
type Demandes = {
  gardesSeules: boolean;
  sansTests: boolean;
  tranche?: Tranche;
  tout: boolean;
  base?: string;
  args: string[];
  erreur?: string;
};
type Enregistrement = { paquet: string; tranche: string; passe: string[]; joues: string[] };
const verifier = verifierMjs as unknown as {
  lireLesDemandes: (d: string[]) => Demandes;
  tachesDeLaPasse: (d: Partial<Demandes>, controles: string[]) => string[];
  testsDeLaTranche: (t: Tranche, racine: string) => Record<string, string>;
  poserLeVert: (o: {
    code: number;
    etat: unknown;
    args: string[];
    env: Record<string, string>;
    garder: (etat: unknown) => void;
    partielle?: boolean;
  }) => void;
  verifier: (o: {
    racine: string;
    args: string[];
    env: Record<string, string>;
    dire: (l: string) => void;
  }) => number;
};
const tranches = tranchesMjs as unknown as {
  RAPPORTS: string;
  lireLaTranche: (t: unknown) => Tranche | null;
  enregistreur: (
    Parent: typeof BaseSequencer,
    o: { fichier: string; racine: string; paquet: string; tranche: string }
  ) => typeof BaseSequencer;
  trancher: (
    config: { root?: string },
    test: Record<string, unknown>,
    v: { tranche: string; rapports: string }
  ) => Promise<void>;
  controlerLesTranches: (e: Enregistrement[]) => string[];
  fusionDesTranches: (o: {
    racine: string;
    dire: (l: string) => void;
    fusionner: (blobs: string, racine: string) => number | null;
  }) => number;
};

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tranches-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const CONTROLES = ['format:check', 'lint', '//#format:check', '//#lint'];

describe('the option --tranche of verifier', () => {
  it('reads --tranche i/n and --tranche=i/n, left out of the arguments of the tasks', () => {
    expect(verifier.lireLesDemandes(['--tranche', '2/3', '--filter=a'])).toMatchObject({
      tranche: { index: 2, count: 3 },
      args: ['--filter=a'],
    });
    expect(verifier.lireLesDemandes(['--tranche=3/3']).tranche).toEqual({ index: 3, count: 3 });
    expect(verifier.lireLesDemandes(['--tranche=1/3']).erreur).toBeUndefined();
  });

  it('combines with --tout and --base, which keep their meaning', () => {
    const d = verifier.lireLesDemandes(['--tranche', '1/3', '--tout', '--base', 'abc1234']);
    expect(d).toMatchObject({ tranche: { index: 1, count: 3 }, tout: true, base: 'abc1234' });
    expect(d.args).toEqual([]);
  });

  for (const faute of ['0/3', '4/3', 'a/b', '1/0', '1/', '/3', '1/3/5', '-1/3', '']) {
    it(`refuses the tranche « ${faute} », naming the form i/n`, () => {
      const d = verifier.lireLesDemandes(faute ? ['--tranche', faute] : ['--tranche']);
      expect(d.tranche).toBeUndefined();
      expect(d.erreur).toMatch(/i\/n/);
    });
  }

  it('refuses a tranche given with --gardes or --sans-tests', () => {
    expect(verifier.lireLesDemandes(['--gardes', '--tranche', '1/3']).erreur).toMatch(/--gardes/);
    expect(verifier.lireLesDemandes(['--sans-tests', '--tranche', '1/3']).erreur).toMatch(
      /--sans-tests/
    );
  });

  it('refuses a malformed tranche with code 1 before any work, the line said', () => {
    const dites: string[] = [];
    const code = verifier.verifier({
      racine: path.join(ESSAIS, 'absent'),
      args: ['--tranche', '4/3'],
      env: {},
      dire: l => dites.push(l),
    });
    expect(code).toBe(1);
    expect(dites).toHaveLength(1);
    expect(dites[0]).toMatch(/--tranche attend la forme i\/n/);
  });

  it('plays the tasks of tests alone in a tranche, with no guard, typing, format or lint', () => {
    const d = verifier.lireLesDemandes(['--tranche', '1/3']);
    expect(verifier.tachesDeLaPasse(d, CONTROLES)).toEqual(['test:unit']);
  });

  it('plays every task but the tests with --sans-tests, with no measure', () => {
    const d = verifier.lireLesDemandes(['--sans-tests', '--base', 'abc1234']);
    expect(d.base).toBeUndefined();
    expect(verifier.tachesDeLaPasse(d, CONTROLES)).toEqual([
      'grillhouse:gardes',
      'gardes',
      'typecheck',
      ...CONTROLES,
    ]);
  });

  it('plays together, with the tranches and --sans-tests, every task of the complete pass once', () => {
    const complete = verifier.tachesDeLaPasse(verifier.lireLesDemandes([]), CONTROLES);
    const sans = verifier.tachesDeLaPasse(verifier.lireLesDemandes(['--sans-tests']), CONTROLES);
    const tranche = verifier.tachesDeLaPasse(
      verifier.lireLesDemandes(['--tranche', '1/3']),
      CONTROLES
    );
    expect([...sans, ...tranche].sort()).toEqual([...complete].sort());
  });

  it('keeps the guards alone as before with --gardes', () => {
    expect(verifier.tachesDeLaPasse(verifier.lireLesDemandes(['--gardes']), CONTROLES)).toEqual([
      'grillhouse:gardes',
      'gardes',
      ...CONTROLES,
    ]);
  });

  it('never keeps the tree of a tranche or of a pass without tests as the last green, green or not', () => {
    const gardes: unknown[] = [];
    const garder = (e: unknown) => gardes.push(e);
    verifier.poserLeVert({ code: 0, etat: 'arbre', args: [], env: {}, garder, partielle: true });
    verifier.poserLeVert({ code: 1, etat: 'arbre', args: [], env: {}, garder, partielle: true });
    expect(gardes).toEqual([]);
    verifier.poserLeVert({ code: 0, etat: 'arbre', args: [], env: {}, garder });
    expect(gardes).toEqual(['arbre']);
  });

  it('carries the tranche in the variable of the tests, which differs from one tranche to another', () => {
    const racine = path.join(ESSAIS, 'projet');
    const un = verifier.testsDeLaTranche({ index: 1, count: 3 }, racine);
    const deux = verifier.testsDeLaTranche({ index: 2, count: 3 }, racine);
    expect(un).toMatchObject({ tranche: '1/3', rapports: path.join(racine, '.vitest-reports') });
    expect(deux.tranche).toBe('2/3');
    expect(un.rejouer).toEqual(expect.any(String));
    expect(JSON.stringify({ ...un, rejouer: '' })).not.toBe(
      JSON.stringify({ ...deux, rejouer: '' })
    );
  });

  it('the variable of the tests enters the hash of the tasks of tests of the repository', () => {
    const turbo = JSON.parse(
      readFileSync(path.resolve(__dirname, '../../../../../../turbo.json'), 'utf8')
    ) as { tasks: Record<string, { env?: string[] }> };
    expect(turbo.tasks['test:unit'].env).toContain('GRILLHOUSE_TESTS');
  });
});

// Vitest's split of <n> test files of a package rooted at <racine> in <count> tranches, each run
// through the recording sequencer: the records written.
async function decouper(n: number, count: number, racine: string): Promise<Enregistrement[]> {
  const specs = Array.from({ length: n }, (_, i) => ({
    moduleId: path.join(racine, 'tests', `f${String(i).padStart(2, '0')}.spec.ts`),
  }));
  const records: Enregistrement[] = [];
  for (let index = 1; index <= count; index++) {
    const fichier = path.join(ESSAIS, `decoupe-${n}-${count}`, `${index}.json`);
    const Classe = tranches.enregistreur(BaseSequencer, {
      fichier,
      racine,
      paquet: '@p/a',
      tranche: `${index}/${count}`,
    });
    const ctx = { config: { shard: { index, count }, root: racine } };
    // The sequencer is called once per pool: two pools of the same run.
    const s = new Classe(ctx as never);
    await s.shard(specs.slice(0, 3) as never);
    await s.shard(specs.slice(3) as never);
    records.push(JSON.parse(readFileSync(fichier, 'utf8')) as Enregistrement);
  }
  return records;
}

describe("the record of Vitest's split", () => {
  it('records the files of the pass and those of the tranche, relative to the package', async () => {
    const [premier] = await decouper(5, 2, path.join(ESSAIS, 'p'));
    expect(premier.paquet).toBe('@p/a');
    expect(premier.tranche).toBe('1/2');
    expect(premier.passe).toEqual([0, 1, 2, 3, 4].map(i => `tests/f0${i}.spec.ts`));
    expect(premier.joues.length).toBeGreaterThan(0);
    expect(premier.joues.every(f => premier.passe.includes(f))).toBe(true);
  });

  it('the n tranches together play exactly the files of the complete pass, with no duplicate', async () => {
    for (const [n, count] of [
      [17, 3],
      [4, 3],
      [2, 3],
      [40, 4],
    ]) {
      const records = await decouper(n, count, path.join(ESSAIS, `q${n}-${count}`));
      const joues = records.flatMap(r => r.joues);
      expect(new Set(joues).size).toBe(joues.length);
      expect([...joues].sort()).toEqual(records[0].passe);
      expect(tranches.controlerLesTranches(records)).toEqual([]);
    }
  });

  it('applies the tranche to the test options: the shard, a blob beside the reporters, the sequencer', async () => {
    const test: Record<string, unknown> = { reporters: ['default', '/r/duree.mjs'] };
    const rapports = path.join(ESSAIS, 'rapports');
    await tranches.trancher({ root: path.join(ESSAIS, 'paquet') }, test, {
      tranche: '2/3',
      rapports,
    });
    expect(test.shard).toBe('2/3');
    expect(test.reporters).toEqual([
      'default',
      '/r/duree.mjs',
      ['blob', { outputFile: path.join(rapports, 'blobs', 'paquet-2-3.json') }],
    ]);
    const Sequenceur = (test.sequence as { sequencer: typeof BaseSequencer }).sequencer;
    expect(Sequenceur.prototype).toBeInstanceOf(BaseSequencer);
  });
});

const rec = (tranche: string, passe: string[], joues: string[], paquet = '@p/a') => ({
  paquet,
  tranche,
  passe,
  joues,
});
const PASSE = ['a.spec.ts', 'b.spec.ts', 'c.spec.ts'];

describe('the control of the tranches before their merge', () => {
  it('accepts tranches that play each file of the pass once', () => {
    expect(
      tranches.controlerLesTranches([
        rec('1/3', PASSE, ['a.spec.ts']),
        rec('2/3', PASSE, ['b.spec.ts', 'c.spec.ts']),
        rec('3/3', PASSE, []),
      ])
    ).toEqual([]);
  });

  it('refuses a file of the pass that no tranche plays, named', () => {
    const f = tranches.controlerLesTranches([
      rec('1/2', PASSE, ['a.spec.ts']),
      rec('2/2', PASSE, ['b.spec.ts']),
    ]);
    expect(f.join('\n')).toMatch(/c\.spec\.ts n'est joué par aucune tranche/);
  });

  it('refuses a file played by two tranches, named with both', () => {
    const f = tranches.controlerLesTranches([
      rec('1/2', PASSE, ['a.spec.ts', 'b.spec.ts']),
      rec('2/2', PASSE, ['b.spec.ts', 'c.spec.ts']),
    ]);
    expect(f.join('\n')).toMatch(/b\.spec\.ts est joué par plusieurs tranches \(1\/2, 2\/2\)/);
  });

  it('refuses a missing tranche of a package, named', () => {
    const f = tranches.controlerLesTranches([
      rec('1/3', PASSE, ['a.spec.ts']),
      rec('3/3', PASSE, ['b.spec.ts', 'c.spec.ts']),
    ]);
    expect(f.join('\n')).toMatch(/@p\/a : la tranche 2\/3 manque/);
  });

  it('refuses tranches that split different files of the pass', () => {
    const f = tranches.controlerLesTranches([
      rec('1/2', PASSE, ['a.spec.ts']),
      rec('2/2', ['a.spec.ts', 'b.spec.ts'], ['b.spec.ts']),
    ]);
    expect(f.join('\n')).toMatch(/ne découpent pas les mêmes fichiers/);
  });

  it('refuses tranches of different counts', () => {
    const f = tranches.controlerLesTranches([rec('1/2', PASSE, PASSE), rec('2/3', PASSE, [])]);
    expect(f.join('\n')).toMatch(/même nombre/);
  });

  it('checks each package on its own', () => {
    const f = tranches.controlerLesTranches([
      rec('1/2', PASSE, ['a.spec.ts']),
      rec('2/2', PASSE, ['b.spec.ts', 'c.spec.ts']),
      rec('1/2', ['x.spec.ts'], [], '@p/b'),
    ]);
    expect(f).toEqual([
      '⛔ @p/b : la tranche 2/2 manque.',
      "⛔ @p/b : x.spec.ts n'est joué par aucune tranche.",
    ]);
  });
});

describe('the merge of the tranches', () => {
  // A project whose reports hold <records> and, when <blob>, one blob.
  async function projet(nom: string, records: Enregistrement[], blob = true) {
    const racine = path.join(ESSAIS, nom);
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const rapports = path.join(racine, tranches.RAPPORTS);
    mkdirSync(path.join(rapports, 'fichiers'), { recursive: true });
    for (const r of records) {
      writeFileSync(
        path.join(
          rapports,
          'fichiers',
          `${r.paquet.replace(/\W+/g, '_')}-${r.tranche.replace('/', '-')}.json`
        ),
        JSON.stringify(r)
      );
    }
    if (blob) {
      mkdirSync(path.join(rapports, 'blobs'), { recursive: true });
      writeFileSync(path.join(rapports, 'blobs', 'p-1-2.json'), '[]');
    }
    return racine;
  }

  it('is green when the tranches hold and the merged report is green, merged from the blobs', async () => {
    const racine = await projet('vert', [
      rec('1/2', PASSE, ['a.spec.ts']),
      rec('2/2', PASSE, ['b.spec.ts', 'c.spec.ts']),
    ]);
    const appels: string[] = [];
    const code = tranches.fusionDesTranches({
      racine,
      dire: () => {},
      fusionner: blobs => {
        appels.push(blobs);
        return 0;
      },
    });
    expect(code).toBe(0);
    expect(appels).toEqual([path.join(racine, '.vitest-reports', 'blobs')]);
  });

  it('is red, the fault named, when a file of the pass is missing, the merged report green', async () => {
    const racine = await projet('manque', [
      rec('1/2', PASSE, ['a.spec.ts']),
      rec('2/2', PASSE, ['b.spec.ts']),
    ]);
    const dites: string[] = [];
    expect(
      tranches.fusionDesTranches({ racine, dire: l => dites.push(l), fusionner: () => 0 })
    ).toBe(1);
    expect(dites.join('\n')).toMatch(/c\.spec\.ts/);
  });

  it('is red when the merged report is red', async () => {
    const racine = await projet('rouge', [rec('1/1', PASSE, PASSE)]);
    expect(tranches.fusionDesTranches({ racine, dire: () => {}, fusionner: () => 1 })).toBe(1);
  });

  it('is green with nothing to merge when the pass has no test file', async () => {
    const racine = await projet('vide', [], false);
    let appele = false;
    const code = tranches.fusionDesTranches({
      racine,
      dire: () => {},
      fusionner: () => {
        appele = true;
        return 0;
      },
    });
    expect(code).toBe(0);
    expect(appele).toBe(false);
  });

  it('is red when blobs lie without any file of tranche', async () => {
    const racine = await projet('sans-fichier', [], true);
    expect(tranches.fusionDesTranches({ racine, dire: () => {}, fusionner: () => 0 })).toBe(1);
  });

  it('reads a tranche only of the form i/n with 1 ≤ i ≤ n', () => {
    expect(tranches.lireLaTranche('2/3')).toEqual({ index: 2, count: 3 });
    for (const f of ['0/3', '4/3', 'a/b', '1/0', 3, null]) {
      expect(tranches.lireLaTranche(f)).toBeNull();
    }
  });
});
