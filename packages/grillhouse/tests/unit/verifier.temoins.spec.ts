// grillhouse-3uv.89, L5 — the time witnesses play alone (scripts/verifier.mjs,
// scripts/vitest-config/cibles.mjs), as Bazel plays a test tagged `exclusive` after the others,
// with nothing beside it. Witness: BPScript 320.3, where the final pass played 66 tasks side by side
// and a time witness measured under the load of its own pass: 9 passes « à repasser », ~25 min of
// waiting and of tasks replayed whole.
//
// A time witness is a test file that marks its tests as measures of time (`mesurerAuRepos`, imported
// from `@roomi-fields/grillhouse/vitest-config/mesure`). `npm run verifier` plays every other test first, then the
// witnesses in a pass of their own, one task at a time, one file at a time.
//
// Each case plays the real Turborepo and the real Vitest of the repository in a repository of trial
// with two packages; the pressure is read from the file GRILLHOUSE_PRESSION_CPU names.
import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const DEPOT = path.resolve(__dirname, '../../../..');
const SCRIPT = path.join(DEPOT, 'packages/grillhouse/scripts/verifier.mjs');
const BASE = path.join(DEPOT, 'packages/grillhouse/scripts/vitest-config/base.mjs');
const MESURE = path.join(DEPOT, 'packages/grillhouse/scripts/vitest-config/mesure.mjs');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'verifier-temoins-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const pression = (some: number) =>
  `some avg10=${some.toFixed(2)} avg60=0.00 avg300=0.00 total=1\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=0\n`;
const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;

// An ordinary test that writes « <nom> » to the trace.
const ordinaire = (trace: string, nom: string) =>
  "import { appendFileSync } from 'node:fs';\n" +
  "import { it } from 'vitest';\n" +
  `it('${nom}', () => { appendFileSync(${JSON.stringify(trace)}, '${nom}\\n'); });\n`;
// A time witness that writes « <nom> début », waits 300 ms, writes « <nom> fin »; with <uneFois>,
// it fails the first time it plays, inside its measure of time.
const temoin = (trace: string, nom: string, marque?: string) =>
  "import { appendFileSync, existsSync, writeFileSync } from 'node:fs';\n" +
  "import { it, expect } from 'vitest';\n" +
  `import { mesurerAuRepos } from ${JSON.stringify(MESURE)};\n` +
  `it('${nom}', ctx => mesurerAuRepos(ctx, async () => {\n` +
  `  appendFileSync(${JSON.stringify(trace)}, '${nom} début\\n');\n` +
  '  await new Promise(r => setTimeout(r, 300));\n' +
  `  appendFileSync(${JSON.stringify(trace)}, '${nom} fin\\n');\n` +
  (marque
    ? `  if (!existsSync(${JSON.stringify(marque)})) { writeFileSync(${JSON.stringify(marque)}, ''); expect(400).toBeLessThan(100); }\n`
    : '') +
  '}));\n';

// A repository of packages `a` and `b`: each has an ordinary test; <temoins> gives a package its
// time witness (`temps.test.mjs`), failing once when `uneFois`.
function depot(temoins: Partial<Record<'a' | 'b', { uneFois?: boolean }>>, some: number) {
  const r = mkdtempSync(path.join(ESSAIS, 'depot-'));
  symlinkSync(path.join(DEPOT, 'node_modules'), path.join(r, 'node_modules'), 'dir');
  const trace = path.join(r, 'joues.txt');
  const ecrire = (f: string, t: string) => {
    mkdirSync(path.dirname(path.join(r, f)), { recursive: true });
    writeFileSync(path.join(r, f), t);
  };
  ecrire(
    'package.json',
    json({ name: 'essai', private: true, workspaces: ['packages/*'], packageManager: 'npm@10.9.8' })
  );
  ecrire(
    'turbo.json',
    json({
      $schema: 'https://turborepo.com/schema.json',
      globalPassThroughEnv: ['GRILLHOUSE_PRESSION_CPU', 'GRILLHOUSE_VERROU_MACHINE'],
      tasks: {
        build: { outputs: [] },
        'grillhouse:gardes': { dependsOn: ['build'], outputs: [] },
        gardes: { dependsOn: ['build'], outputs: [] },
        'test:vitest': { dependsOn: ['build'], env: ['GRILLHOUSE_TESTS'], outputs: [] },
      },
    })
  );
  for (const nom of ['a', 'b'] as const) {
    ecrire(
      `packages/${nom}/package.json`,
      json({ name: nom, type: 'module', scripts: { 'test:vitest': 'vitest run' } })
    );
    ecrire(
      `packages/${nom}/vitest.config.mjs`,
      `import base from ${JSON.stringify(BASE)};\nexport default base;\n`
    );
    ecrire(`packages/${nom}/test/x.test.mjs`, ordinaire(trace, nom));
    const t = temoins[nom];
    if (t) {
      ecrire(
        `packages/${nom}/test/temps.test.mjs`,
        temoin(trace, `${nom}-temoin`, t.uneFois ? path.join(r, `${nom}.deja`) : undefined)
      );
    }
  }
  ecrire('.gitignore', 'node_modules\n.turbo/\n');
  const fichierPression = path.join(r, 'pression');
  writeFileSync(fichierPression, pression(some));
  const env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST') && k !== 'NODE_OPTIONS')
    ),
    PATH: `${path.join(DEPOT, 'node_modules/.bin')}${path.delimiter}${process.env.PATH ?? ''}`,
    TURBO_TELEMETRY_DISABLED: '1',
    DO_NOT_TRACK: '1',
    GRILLHOUSE_PRESSION_CPU: fichierPression,
    GRILLHOUSE_VERROU_MACHINE: path.join(r, 'mesure.lock'),
  };
  const joues = () =>
    existsSync(trace) ? readFileSync(trace, 'utf8').split('\n').filter(Boolean) : [];
  const ecrirePression = (s: number) => writeFileSync(fichierPression, pression(s));
  return { racine: r, env, joues, ecrirePression };
}

// The script run as `npm run verifier -- <args>` runs it; <auPremierAttente> runs when its first
// wait line comes out.
function lancer(
  d: ReturnType<typeof depot>,
  auPremierAttente?: () => void,
  args: string[] = []
): Promise<{ status: number | null; sortie: string }> {
  return new Promise(resolve => {
    const p = spawn(process.execPath, [SCRIPT, ...args], { cwd: d.racine, env: d.env });
    let sortie = '';
    let vu = false;
    const lire = (b: Buffer) => {
      sortie += b.toString();
      if (!vu && auPremierAttente && sortie.includes('⏳')) {
        vu = true;
        auPremierAttente();
      }
    };
    p.stdout.on('data', lire);
    p.stderr.on('data', lire);
    p.on('close', status => resolve({ status, sortie }));
  });
}

describe('grillhouse-3uv.89 — les témoins de temps jouent seuls', { timeout: 180_000 }, () => {
  it('chaque témoin joue une fois, après tous les autres tests, et la passe est verte', async () => {
    const d = depot({ a: {} }, 1);
    const r = await lancer(d);
    expect(r.status, r.sortie).toBe(0);
    const j = d.joues();
    expect(j.filter(l => l.startsWith('a-temoin'))).toEqual(['a-temoin début', 'a-temoin fin']);
    expect(j.slice(0, 2).sort()).toEqual(['a', 'b']);
    expect(j.slice(2)).toEqual(['a-temoin début', 'a-temoin fin']);
  });

  it('les témoins jouent une tâche après l’autre, jamais côte à côte', async () => {
    const d = depot({ a: {}, b: {} }, 1);
    const r = await lancer(d);
    expect(r.status, r.sortie).toBe(0);
    const temoins = d.joues().filter(l => l.includes('-temoin'));
    expect(temoins).toHaveLength(4);
    // Each witness ends before the next one starts.
    for (let i = 0; i < 4; i += 2) {
      expect(temoins[i]).toMatch(/ début$/);
      expect(temoins[i + 1]).toBe(temoins[i].replace(' début', ' fin'));
    }
  });

  it('un témoin en échec sous une charge qui n’est pas la passe se rejoue seul au repos, sans rejouer les autres tests', async () => {
    const d = depot({ a: { uneFois: true } }, 90);
    const r = await lancer(d, () => d.ecrirePression(1));
    expect(r.status, r.sortie).toBe(0);
    expect(r.sortie).toContain('↻ a#test:vitest');
    const j = d.joues();
    expect(j.filter(l => l === 'a')).toEqual(['a']);
    expect(j.filter(l => l === 'b')).toEqual(['b']);
    expect(j.filter(l => l === 'a-temoin début')).toHaveLength(2);
  });

  // grillhouse-3uv.89, L3: the circuit restricts a final pass to what a fix touches
  // (`--filter=...[<avant>...<après>]`); the witnesses' pass keeps that choice.
  it('une passe restreinte par --filter ne joue que les témoins des paquets qu’elle choisit', async () => {
    const d = depot({ a: {}, b: {} }, 1);
    const r = await lancer(d, undefined, ['--filter=a']);
    expect(r.status, r.sortie).toBe(0);
    expect(d.joues()).toEqual(['a', 'a-temoin début', 'a-temoin fin']);
  });

  it('un dépôt sans témoin ne joue aucune passe de témoins', async () => {
    const d = depot({}, 1);
    const r = await lancer(d);
    expect(r.status, r.sortie).toBe(0);
    expect(d.joues().sort()).toEqual(['a', 'b']);
    expect(r.sortie).not.toMatch(/témoins de temps/);
  });
});
