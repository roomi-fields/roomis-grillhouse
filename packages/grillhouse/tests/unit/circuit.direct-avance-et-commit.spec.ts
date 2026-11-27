// The conflict of the advance of a direct circuit (scripts/circuit.mjs, `avantLaPasse`) and the
// message of its commit (scripts/activites.mjs, `integrer`). A test of size medium: real git in a
// trial repository.
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import * as activites from '../../scripts/activites.mjs';
import { avantLaPasse, suiteDuConflit } from '../../scripts/circuit.mjs';
import { monde } from './seance-d-essai.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'circuit-direct-avance-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

interface Avance {
  arret?: { nom: string; rapport: string };
  conflit?: { fichiers: string[]; roles: string[]; rapport: string };
}
const avant = avantLaPasse as unknown as (
  ctx: object,
  etape: string,
  regeneration: unknown,
  env: NodeJS.ProcessEnv,
  o: { estUnTest: (f: string) => unknown }
) => Avance;
const suite = suiteDuConflit as unknown as (
  ctx: object,
  etat: object,
  conflit: object
) => { role: string };
const integrer = activites.integrer as unknown as (ctx: object) => unknown;
const estUnTest = (f: string) => (f.endsWith('.spec.txt') ? {} : null);

const git = (dossier: string, ...args: string[]) => {
  const r = spawnSync('git', ['-C', dossier, ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
  }
};
const lignes = (d: string) => `l1\n${d}\nl3\nl4\nl5\nl6\nl7\n`;
function copieEnConflit(fichiers: string[]) {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  git(racine, 'init', '-q', '-b', 'main');
  git(racine, 'config', 'user.email', 'essai@example.com');
  git(racine, 'config', 'user.name', 'essai');
  writeFileSync(path.join(racine, '.gitignore'), '.claude/worktrees/\n');
  for (const f of fichiers) {
    writeFileSync(path.join(racine, f), lignes('base'));
  }
  git(racine, 'add', '-A');
  git(racine, 'commit', '-q', '-m', 'base');
  const copie = path.join(racine, '.claude/worktrees/demo-1');
  git(racine, 'worktree', 'add', '-q', '-b', 'agent/demo-1', copie, 'HEAD');
  for (const f of fichiers) {
    writeFileSync(path.join(racine, f), lignes('MAIN'));
  }
  git(racine, 'commit', '-qam', 'main');
  for (const f of fichiers) {
    writeFileSync(path.join(copie, f), lignes('COPIE'));
  }
  return { racine, copie, ticket: 'demo-1', journal: `${copie}.log`, circuit: 'direct' };
}

describe('le conflit de l’avance d’un circuit direct', () => {
  it('donne à l’agent direct, en une séance, les fichiers de test comme de code', () => {
    const ctx = copieEnConflit(['x.spec.txt', 'src.txt']);
    const r = avant(ctx, 'controles', null, process.env, { estUnTest });
    expect(r.arret).toBeUndefined();
    expect(r.conflit?.roles).toEqual(['direct']);
    expect([...(r.conflit?.fichiers ?? [])].sort()).toEqual(['src.txt', 'x.spec.txt']);
    expect(r.conflit?.rapport).toContain('x.spec.txt');
    expect(r.conflit?.rapport).toContain('src.txt');
    expect(r.conflit?.rapport).not.toMatch(/autre rôle/);
    expect(suite(ctx, { etape: 'controles' }, r.conflit!).role).toBe('direct');
  });

  it('un fichier de test seul va à l’agent direct, jamais au testwriter', () => {
    const ctx = copieEnConflit(['x.spec.txt']);
    const r = avant(ctx, 'controles', null, process.env, { estUnTest });
    expect(r.conflit?.roles).toEqual(['direct']);
  });

  it('un conflit qu’une deuxième séance ne lève pas monte au superviseur', () => {
    const ctx = copieEnConflit(['x.spec.txt', 'src.txt']);
    const r = avant({ ...ctx, conflitsRelances: ['direct'] }, 'controles', null, process.env, {
      estUnTest,
    });
    expect(r.conflit).toBeUndefined();
    expect(r.arret?.nom).toBe('lancement');
  });
});

describe('le message du commit d’un circuit direct', () => {
  it('porte les écarts de la fiche de l’agent direct', () => {
    const m = monde({ copie: true });
    const fichier = path.join(m.ctx.copie, 'packages/forms/src/index.mjs');
    mkdirSync(path.dirname(fichier), { recursive: true });
    writeFileSync(fichier, 'export const mesure = x => 2 * x;\n');
    Object.assign(m.ctx, { circuit: 'direct', type: 'task', base: { dossier: m.ctx.tmp } });
    for (const [role, fiche] of [
      ['direct', { statut: 'FAIT', ecarts: [{ sujet: 'Le plafond', texte: 'abaissé de 5 à 4' }] }],
      [
        'relecteur',
        { verdict: 'ACCEPTÉ', ecarts: [{ sujet: 'La référence', texte: 'régénérée' }] },
      ],
    ] as const) {
      appendFileSync(
        m.ctx.fiches,
        `${JSON.stringify({ date: '2026-11-25T00:00:00Z', role, fiche })}\n`
      );
    }
    integrer(m.ctx);
    const message = readFileSync(path.join(m.ctx.tmp, 'message'), 'utf8');
    expect(message).toContain('Le plafond : abaissé de 5 à 4');
    expect(message).toContain('La référence : régénérée');
  });
});
