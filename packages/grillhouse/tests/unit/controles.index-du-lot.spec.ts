// The checks and the final pass of a circuit (`controles`, scripts/activites.mjs) judge the tree
// of the lot, new files included: during each of their commands, the index of the copy holds the
// lot (`git add -A`, the ignored files left out), so a guard that reads the index (`git ls-files`)
// judges a file git does not track yet as a tracked one, as bors and GitHub's merge queue judge
// the tree of the candidate commit. After the command, the index is as before it; the index saved
// in the git directory of the copy is put back before the next gesture that reads it, when the
// process of the circuit is killed.
//
// Medium tests: the real git in a repository of trial, and a fake npm that writes what
// `git ls-files` lists in the copy and exits 1 when it lists the file a guard forbids.
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as activites from '../../scripts/activites.mjs';
import * as circuit from '../../scripts/circuit.mjs';
import * as travail from '../../scripts/enveloppe/travail-de-la-copie.mjs';
import { copieEssai, type Ctx } from './preuve-essai.js';

type Plan = Ctx & { ecartes: string[]; rendus: { genre: string; texte?: string }[] };
const controles = activites.controles as (
  ctx: Plan,
  finale: boolean
) => { rouge: boolean; aRepasser: boolean; texte: string };
const avancer = travail.avancer as unknown as (
  copie: string,
  cible: string,
  o: { ecrit?: (f: string) => boolean; duCadre?: () => unknown[]; dire?: (t: string) => void }
) => { ok: boolean; message: string; conflits?: string[] };
const marquesRestantes = travail.marquesRestantes as (copie: string) => string[];
const lireLeFait = circuit.lireLeFait as (
  ctx: Plan,
  fait: string,
  parametres: Record<string, unknown>,
  faits: Record<string, unknown>
) => Promise<unknown>;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'controles-index-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const journalNpm = path.join(ESSAIS, 'journal-npm');
const compteur = path.join(ESSAIS, 'compteur');
const VARIABLES = [
  'FAUX_NPM_JOURNAL',
  'FAUX_NPM_COMPTEUR',
  'FAUX_NPM_CODES',
  'FAUX_NPM_INTERDIT',
  'FAUX_NPM_SABOTAGE',
  'FAUX_NPM_PHOTO',
];
const chemin = process.env.PATH;

// The fake npm. `FAUX_NPM_CODES`: the code of each call in turn (the last one repeats), or
// `SIGKILL`, the command killed. `FAUX_NPM_INTERDIT`: a file whose presence in the index makes the
// command red, its finding written in SARIF. `FAUX_NPM_SABOTAGE`: a file the command turns into a directory, so that the next
// write of the circuit to it fails. `FAUX_NPM_PHOTO`: where the command copies the git directory
// of the copy as it stands while it plays.
beforeAll(() => {
  const bin = path.join(ESSAIS, 'bin');
  mkdirSync(bin);
  const npm = path.join(bin, 'npm');
  writeFileSync(
    npm,
    `#!/usr/bin/env node
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const liste = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\\0').filter(Boolean);
const fichiers = [...new Set(liste)].sort();
fs.appendFileSync(process.env.FAUX_NPM_JOURNAL, JSON.stringify({ args: process.argv.slice(2), fichiers }) + '\\n');
if (process.env.FAUX_NPM_PHOTO) {
  fs.cpSync('.git', process.env.FAUX_NPM_PHOTO, { recursive: true, preserveTimestamps: true });
}
const n = fs.existsSync(process.env.FAUX_NPM_COMPTEUR)
  ? Number(fs.readFileSync(process.env.FAUX_NPM_COMPTEUR, 'utf8'))
  : 0;
fs.writeFileSync(process.env.FAUX_NPM_COMPTEUR, String(n + 1));
const sabotage = process.env.FAUX_NPM_SABOTAGE;
if (sabotage) {
  fs.rmSync(sabotage, { force: true, recursive: true });
  fs.mkdirSync(sabotage);
}
const codes = (process.env.FAUX_NPM_CODES || '0').split(',');
const code = codes[Math.min(n, codes.length - 1)];
if (code === 'SIGKILL') process.kill(process.pid, 'SIGKILL');
const interdit = process.env.FAUX_NPM_INTERDIT;
if (fichiers.includes(interdit)) {
  // The finding of the guard, in SARIF, as a guard of the project writes it.
  const dossier = require('node:path').join(process.env.GRILLHOUSE_RESULTATS, 'sarif');
  fs.mkdirSync(dossier, { recursive: true });
  const location = { physicalLocation: { artifactLocation: { uri: interdit }, region: { startLine: 1 } } };
  fs.writeFileSync(require('node:path').join(dossier, 'domaine.sarif'), JSON.stringify({
    version: '2.1.0',
    runs: [{ tool: { driver: { name: 'domaine' } }, results: [{ ruleId: 'domaine', level: 'error', message: { text: 'refusé' }, locations: [location] }] }],
  }));
  process.exit(1);
}
process.exit(Number(code));
`
  );
  chmodSync(npm, 0o755);
  process.env.PATH = `${bin}${path.delimiter}${chemin ?? ''}`;
  process.env.FAUX_NPM_JOURNAL = journalNpm;
  process.env.FAUX_NPM_COMPTEUR = compteur;
});
afterEach(() => {
  rmSync(journalNpm, { force: true });
  rmSync(compteur, { force: true });
  delete process.env.FAUX_NPM_CODES;
  delete process.env.FAUX_NPM_INTERDIT;
  delete process.env.FAUX_NPM_SABOTAGE;
  delete process.env.FAUX_NPM_PHOTO;
});
afterAll(() => {
  process.env.PATH = chemin;
  for (const v of VARIABLES) {
    delete process.env[v];
  }
});

const git = (copie: string, args: string[], input?: string) => {
  const r = spawnSync('git', ['-C', copie, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    encoding: 'utf8',
    input,
  });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
  }
  return r.stdout;
};
const ecrire = (copie: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(copie, f)), { recursive: true });
  writeFileSync(path.join(copie, f), texte);
};

const NEUF = 'packages/forms/src/neuf.mjs';
const PROFOND = 'packages/forms/src/sous/dossier/profond.mjs';
const SUPPRIME = 'packages/forms/src/supprime.mjs';
const MODIFIE = 'packages/forms/src/index.mjs';
const IGNORE = 'packages/forms/src/sortie.log';

/**
 * A copy whose plan is the package forms: committed, `index.mjs` and `supprime.mjs`; the lot, two
 * new files git does not track, a file modified, a file deleted, and a file git ignores. With
 * `gardes`, the root holds a guard script, so the checks play three commands.
 */
function copie({ gardes = false } = {}): Plan {
  const ctx = copieEssai(ESSAIS);
  declarerLesLangages(ctx.copie, { 'packages/forms': 'typescript' });
  ecrire(
    ctx.copie,
    'packages/forms/package.json',
    JSON.stringify({ name: '000-forms', type: 'module', scripts: { 'test:unit': 'vitest run' } })
  );
  if (gardes) {
    const f = path.join(ctx.copie, 'package.json');
    const pkg = JSON.parse(readFileSync(f, 'utf8')) as { scripts?: Record<string, string> };
    writeFileSync(
      f,
      JSON.stringify({ ...pkg, scripts: { ...pkg.scripts, 'grillhouse:gardes': 'true' } })
    );
  }
  ecrire(ctx.copie, '.gitignore', '*.log\n');
  ecrire(ctx.copie, MODIFIE, 'export const mesure = x => x;\n');
  ecrire(ctx.copie, SUPPRIME, 'export const parti = 1;\n');
  git(ctx.copie, ['add', '-A']);
  git(ctx.copie, ['commit', '-q', '-m', 'les paquets']);
  ecrire(ctx.copie, MODIFIE, 'export const mesure = x => 2 * x;\n');
  rmSync(path.join(ctx.copie, SUPPRIME));
  ecrire(ctx.copie, NEUF, 'export const neuf = 1;\n');
  ecrire(ctx.copie, PROFOND, 'export const profond = 1;\n');
  ecrire(ctx.copie, IGNORE, 'une sortie\n');
  return { ...ctx, paquets: ['packages/forms'], ecartes: [], rendus: [] };
}

interface Appel {
  args: string[];
  fichiers: string[];
}
const appels = (): Appel[] =>
  existsSync(journalNpm)
    ? readFileSync(journalNpm, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(l => JSON.parse(l) as Appel)
    : [];

/** The index of the copy: each entry with its stage, and what git says of each file against it. */
const index = (c: Plan) => ({
  entrees: git(c.copie, ['ls-files', '--stage', '-z']),
  statut: git(c.copie, ['status', '--porcelain', '-z', '--untracked-files=all']),
});

const voitLeLot = (a: Appel) => {
  expect(a.fichiers).toContain(NEUF);
  expect(a.fichiers).toContain(PROFOND);
  expect(a.fichiers).toContain(MODIFIE);
  expect(a.fichiers).not.toContain(SUPPRIME);
  expect(a.fichiers).not.toContain(IGNORE);
};

const CONFLIT = 'packages/forms/src/conflit.mjs';
const MARQUES = '<<<<<<< ours\nexport const a = 1;\n=======\nexport const a = 2;\n>>>>>>> theirs\n';

/** Leaves `CONFLIT` unmerged in the index of the copy (stages 1, 2 and 3), its marks in the file. */
function enConflit(c: Plan) {
  const blob = (texte: string) => git(c.copie, ['hash-object', '-w', '--stdin'], texte).trim();
  const etages = ['0', '1', '2'].map(
    (n, i) => `100644 ${blob(`export const a = ${n};\n`)} ${i + 1}\t${CONFLIT}\n`
  );
  git(c.copie, ['update-index', '--index-info'], etages.join(''));
  ecrire(c.copie, CONFLIT, MARQUES);
}

/** A file a session put in the index, then wrote again: its index differs from HEAD and the disk. */
const MIS = 'packages/forms/src/mis.mjs';
function misALIndex(c: Plan) {
  ecrire(c.copie, MIS, 'export const mis = 1;\n');
  git(c.copie, ['add', '--', MIS]);
  ecrire(c.copie, MIS, 'export const mis = 2;\n');
}

describe('the index of the copy during the commands of the checks and of the final pass', () => {
  it.each([
    ['the checks of the plan', false],
    ['the final pass', true],
  ])('%s list the new files of the lot, not the deleted nor the ignored ones', (_, finale) => {
    const c = copie();
    controles(c, finale);
    expect(appels()).toHaveLength(1);
    voitLeLot(appels()[0]!);
  });

  it('each command of the checks lists the lot, the build and the guards included', () => {
    const c = copie({ gardes: true });
    controles(c, false);
    expect(appels().length).toBeGreaterThanOrEqual(3);
    appels().forEach(voitLeLot);
  });

  it('the replay of a command at 75 lists the lot as the first run did', () => {
    process.env.FAUX_NPM_CODES = '75,0';
    const c = copie();
    controles(c, false);
    expect(appels()).toHaveLength(2);
    appels().forEach(voitLeLot);
  });

  it.each([
    ['the checks of the plan', false],
    ['the final pass', true],
  ])('%s are red on a new file a guard reading the index refuses', (_, finale) => {
    process.env.FAUX_NPM_INTERDIT = NEUF;
    const r = controles(copie(), finale);
    expect(r.rouge).toBe(true);
    expect(r.texte).toContain(`domaine ${NEUF}`);
  });

  it.each([
    ['the checks of the plan', false],
    ['the final pass', true],
  ])('when git cannot add the lot, %s play no command and stop naming git', (_, finale) => {
    const c = copie();
    const avant = git(c.copie, ['ls-files', '--stage']);
    const verrou = path.join(c.copie, '.git', 'index.lock');
    writeFileSync(verrou, '');
    expect(() => controles(c, finale)).toThrow(/\bgit\b/);
    expect(appels()).toEqual([]);
    expect(existsSync(verrou)).toBe(true);
    rmSync(verrou);
    expect(git(c.copie, ['ls-files', '--stage'])).toBe(avant);
  });
});

describe('the index of the copy after a command of the checks or of the final pass', () => {
  it.each([
    ['green, checks', false, '0'],
    ['green, final pass', true, '0'],
    ['red, checks', false, '1'],
    ['red, final pass', true, '1'],
    ['killed by a signal, checks', false, 'SIGKILL'],
    ['killed by a signal, final pass', true, 'SIGKILL'],
    ['at 75 then green on its replay', false, '75,0'],
    ['at 75 twice', false, '75,75'],
  ])('is as before it, unresolved conflicts included (%s)', (_, finale, codes) => {
    process.env.FAUX_NPM_CODES = codes;
    const c = copie();
    misALIndex(c);
    enConflit(c);
    const avant = index(c);
    controles(c, finale);
    expect(appels()[0]!.fichiers).toContain(NEUF);
    expect(index(c)).toEqual(avant);
  });

  it('is as before it when a fault interrupts the circuit after the command', () => {
    const c = copie();
    misALIndex(c);
    enConflit(c);
    const avant = index(c);
    // The journal of the ticket turned into a directory: the note of the replay cannot be written.
    process.env.FAUX_NPM_CODES = '75';
    process.env.FAUX_NPM_SABOTAGE = c.journal;
    expect(() => controles(c, false)).toThrow();
    expect(appels()[0]!.fichiers).toContain(NEUF);
    expect(index(c)).toEqual(avant);
  });
});

/**
 * Leaves the copy of `c` as a circuit killed during a command of its checks leaves it: the git
 * directory as it was while the command played, the index the circuit filled and whatever it saved
 * there to put it back, and nothing of what it ran after the command.
 */
function circuitTue(c: Plan): Appel[] {
  const photo = path.join(mkdtempSync(path.join(ESSAIS, 'photo-')), 'git');
  const depot = path.join(c.copie, '.git');
  process.env.FAUX_NPM_PHOTO = photo;
  controles(c, false);
  delete process.env.FAUX_NPM_PHOTO;
  const joues = appels();
  expect(joues[0]?.fichiers).toContain(NEUF);
  rmSync(journalNpm, { force: true });
  rmSync(depot, { recursive: true, force: true });
  cpSync(photo, depot, { recursive: true, preserveTimestamps: true });
  return joues;
}

const QUITTE = 'packages/ancien/src/deplace.mjs';
const ARRIVE = 'packages/forms/src/deplace.mjs';

/**
 * A copy whose lot also moves a tracked file out of a package of the plan that plays no test: the
 * checks play that package for the file it lost alone, which an index holding the lot hides, git
 * reading the move as a rename.
 */
function copieAvecDeplacement(): Plan {
  const c = copie();
  declarerLesLangages(c.copie, {
    'packages/ancien': 'typescript',
    'packages/forms': 'typescript',
  });
  ecrire(c.copie, 'packages/ancien/package.json', JSON.stringify({ name: '001-ancien' }));
  ecrire(c.copie, QUITTE, 'export const deplace = 1;\n'.repeat(5));
  git(c.copie, ['add', '--', 'packages/ancien']);
  git(c.copie, ['commit', '-q', '-m', 'le paquet quitté', '--', 'packages/ancien']);
  renameSync(path.join(c.copie, QUITTE), path.join(c.copie, ARRIVE));
  return { ...c, paquets: ['packages/forms', 'packages/ancien'] };
}

describe('the index of a copy whose circuit was killed during a command', () => {
  it('is put back by the next pass: after it, the index is the one before the kill', () => {
    const c = copie();
    misALIndex(c);
    enConflit(c);
    const avant = index(c);
    circuitTue(c);
    controles(c, false);
    voitLeLot(appels()[0]!);
    expect(index(c)).toEqual(avant);
  });

  it('is put back before the next pass reads the lot: it plays the commands of the pass before the kill', () => {
    const c = copieAvecDeplacement();
    const joues = circuitTue(c).map(a => a.args);
    expect(joues).toContainEqual(['test', '--', 'packages/ancien']);
    controles(c, false);
    expect(appels().map(a => a.args)).toEqual(joues);
  });

  it('is put back before the proof of the red reads the copy, even when it plays no command', () => {
    const c = copie();
    misALIndex(c);
    enConflit(c);
    const avant = index(c);
    circuitTue(c);
    // Resumed at a red that names no test: the proof has nothing to play.
    (activites.preuve as (ctx: Plan, o: { fichiers: string[] }) => unknown)(c, { fichiers: [] });
    expect(appels()).toEqual([]);
    expect(index(c)).toEqual(avant);
  });

  it('is put back before a fact of the circuit reads the copy', async () => {
    const c = copie();
    misALIndex(c);
    enConflit(c);
    const avant = index(c);
    circuitTue(c);
    await lireLeFait(c, 'sansTests', {}, {});
    expect(index(c)).toEqual(avant);
  });

  it('is put back before the advance of the copy reads it: a file the circuit added is none a session put there', () => {
    const c = copie();
    // A new file of the lot whose lines look like the marks of a conflict.
    ecrire(c.copie, 'packages/forms/src/marques.txt', MARQUES);
    const avant = index(c);
    circuitTue(c);
    const a = avancer(c.copie, 'HEAD', { duCadre: () => [], dire: () => {} });
    expect(a.ok, a.message).toBe(true);
    expect(index(c)).toEqual(avant);
    expect(marquesRestantes(c.copie)).toEqual([]);
  });

  it('is put back before the advance of the copy: a conflict the circuit added is not resolved', () => {
    const c = copie();
    enConflit(c);
    const avant = index(c);
    circuitTue(c);
    const a = avancer(c.copie, 'HEAD', {
      ecrit: () => true,
      duCadre: () => [],
      dire: () => {},
    });
    expect(a.conflits).toEqual([CONFLIT]);
    expect(index(c)).toEqual(avant);
  });

  it('leaves the new files of the lot untracked once the copy moved forward on main', () => {
    const c = copie();
    // main one commit ahead of the copy, on a file the lot does not touch.
    const arbre = git(c.copie, ['rev-parse', 'HEAD^{tree}']).trim();
    const suite = git(c.copie, ['commit-tree', arbre, '-p', 'HEAD', '-m', 'main avance']).trim();
    circuitTue(c);
    const a = avancer(c.copie, suite, { duCadre: () => [], dire: () => {} });
    expect(a.ok, a.message).toBe(true);
    expect(git(c.copie, ['rev-parse', 'HEAD']).trim()).toBe(suite);
    expect(git(c.copie, ['diff', '--cached', '--name-only'])).toBe('');
    const libres = git(c.copie, ['ls-files', '--others', '--exclude-standard']).split('\n');
    expect(libres).toContain(NEUF);
    expect(readFileSync(path.join(c.copie, NEUF), 'utf8')).toBe('export const neuf = 1;\n');
  });
});
