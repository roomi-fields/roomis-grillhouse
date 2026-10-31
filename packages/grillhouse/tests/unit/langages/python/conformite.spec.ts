// grillhouse-ziy — the module python answers the join: the suite of conformity
// (scripts/conformite.mjs) finds no fault in it, on its entries (scripts/langages/python/
// exemples.mjs), against the fake uv first on the PATH (./faux-uv.ts). Each case has a defective
// entry that finds something, but `matieres`: Python has no shared test material. Beside the suite:
// `verifier`, which plays the packages the changes since the last green touch, and keeps it;
// `verifier --gardes`, the project's guards alone; the index of the interfaces, its entries, its
// check, and `index-interfaces --publie` in a project of Python alone, which the launcher reads
// before every session (scripts/enveloppe/lancer.sh).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cas, echecs } from '../../../../scripts/conformite.mjs';
import module from '../../../../scripts/langages/python/index.mjs';
import lesExemples, { INDEX } from '../../../../scripts/langages/python/exemples.mjs';
import typescript from '../../../../scripts/langages/typescript/index.mjs';
import { installerFauxUv } from './faux-uv.js';

type Langage = Parameters<typeof cas>[0];
const python = module as unknown as Langage;
const exemples = lesExemples as unknown as Parameters<typeof cas>[1];
const BIN = path.resolve(__dirname, '../../../../bin/grillhouse.mjs');

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'conformite-python-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const JOURNAL = path.join(ESSAIS, 'journal');
let PATH = '';
let avant: string | undefined;
beforeAll(() => {
  avant = process.env.PATH;
  PATH = `${installerFauxUv(ESSAIS)}${path.delimiter}${process.env.PATH ?? ''}`;
  process.env.PATH = PATH;
});
afterAll(() => {
  process.env.PATH = avant;
});

type Depots = Record<'projet' | 'change' | 'lot' | 'enRetard' | 'vide', string>;

// Runs <script> <args> in <racine>, the fake uv first on the PATH, the lock of the machine of the
// trial: `{ code, stdout, stderr, appels, verdict }`, `appels` the calls of uv (`args`, `cwd`).
function lancer(racine: string, script: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  writeFileSync(JOURNAL, '');
  const resultats = mkdtempSync(path.join(ESSAIS, 'resultats-'));
  const r = spawnSync(process.execPath, [script, ...args], {
    cwd: racine,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH,
      GRILLHOUSE_RESULTATS: resultats,
      GRILLHOUSE_VERROU_MACHINE: path.join(ESSAIS, 'machine.lock'),
      FAUX_UV_JOURNAL: JOURNAL,
      ...env,
    },
  });
  const appels = readFileSync(JOURNAL, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(l => JSON.parse(l) as { args: string[]; cwd: string });
  return {
    code: r.status,
    stdout: r.stdout,
    stderr: r.stderr,
    appels,
    verdict: python.verdict(resultats),
  };
}
const commande = (racine: string, nom: string) => python.commandes(racine)[nom];
const taches = (v: ReturnType<typeof lancer>) =>
  v.verdict.taches.map(t => `${t.paquet}#${t.script} ${t.code}`);

describe('grillhouse-ziy — le module python passe la suite de conformité', () => {
  it('it exports every member of the join, as the module typescript does', () => {
    expect(Object.keys(python).sort()).toEqual(Object.keys(typescript).sort());
  });

  it('the suite finds no fault in it', () => {
    expect(echecs(python, exemples, { dans: ESSAIS })).toEqual([]);
  });

  it('each case has a defective entry with faults, but the shared test material', () => {
    const vides = cas(python, exemples, { dans: ESSAIS })
      .filter(c => c.attendu.length === 0)
      .map(c => c.nom);
    expect(vides).toEqual(['matieres']);
  });
});

describe('grillhouse-ziy — verifier, depuis le dernier vert', () => {
  it('green, it keeps the last green; then it plays the packages the changes since touch', () => {
    const dans = mkdtempSync(path.join(ESSAIS, 'vert-'));
    const { projet } = (exemples.preparer(dans) as { depots: Depots }).depots;
    const c = commande(projet, 'verifier');
    const premier = lancer(projet, c.script, c.args);
    expect(premier.code, premier.stderr).toBe(0);
    expect(taches(premier)).toEqual(['outil#compileall 0', 'site#compileall 0', 'site#pytest 0']);
    writeFileSync(path.join(projet, 'outil/outil.py'), 'def outil():\n    return 2\n');
    const second = lancer(projet, c.script, c.args);
    expect(second.code, second.stderr).toBe(0);
    expect(taches(second)).toEqual(['outil#compileall 0']);
    const t = commande(projet, 'tester');
    const tests = lancer(projet, t.script, t.args, { GRILLHOUSE_DEPUIS_LE_VERT: '1' });
    expect(tests.code, tests.stderr).toBe(0);
    expect(tests.appels).toEqual([]);
    writeFileSync(path.join(projet, 'site/pages/generer.py'), 'def generer():\n    return 2\n');
    const site = lancer(projet, t.script, t.args, { GRILLHOUSE_DEPUIS_LE_VERT: '1' });
    expect(taches(site)).toEqual(['site#pytest 0']);
  });

  it('a red test makes verifier red, and keeps no green', () => {
    const { projet } = (
      exemples.preparer(mkdtempSync(path.join(ESSAIS, 'rouge-'))) as {
        depots: Depots;
      }
    ).depots;
    const c = commande(projet, 'verifier');
    const r = lancer(projet, c.script, c.args, { FAUX_UV_CODES: JSON.stringify({ pytest: 1 }) });
    expect(r.code).toBe(1);
    const encore = lancer(projet, c.script, c.args);
    expect(taches(encore)).toContain('site#pytest 0');
  });

  it('verifier --gardes plays the project’s guards alone, no test', () => {
    const { projet } = (
      exemples.preparer(mkdtempSync(path.join(ESSAIS, 'gardes-'))) as {
        depots: Depots;
      }
    ).depots;
    writeFileSync(
      path.join(projet, 'package.json'),
      JSON.stringify({
        name: 'essai',
        scripts: { 'grillhouse:gardes': 'exit 0', gardes: 'exit 3' },
      })
    );
    const c = commande(projet, 'verifier');
    const r = lancer(projet, c.script, [...c.args, '--gardes']);
    expect(r.code).toBe(1);
    expect(taches(r)).toEqual(['//#grillhouse:gardes 0', '//#gardes 3']);
    expect(r.appels).toEqual([]);
  });
});

describe('grillhouse-ziy — l’index des interfaces d’un projet Python', () => {
  it('its entries, the root’s included, give the index; its check judges it', () => {
    const { projet, enRetard } = (exemples.preparer(ESSAIS) as { depots: Depots }).depots;
    expect(python.entreesDeLIndex(projet).map(e => e.rel)).toEqual([
      'docs/INTERFACE.md',
      'site/docs/INTERFACE.md',
    ]);
    const c = commande(projet, 'index-interfaces');
    expect(lancer(projet, c.script, ['--verifier']).code).toBe(0);
    expect(lancer(enRetard, c.script, ['--verifier']).code).toBe(1);
    expect(readFileSync(path.join(projet, 'docs/agents/index-des-interfaces.md'), 'utf8')).toBe(
      INDEX
    );
  });

  it('grillhouse index-interfaces --publie <paquet>, in a project of Python alone, prints nothing, code 0', () => {
    const { projet } = (exemples.preparer(ESSAIS) as { depots: Depots }).depots;
    const r = lancer(projet, BIN, ['index-interfaces', '--publie', 'site']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toBe('');
  });
});
