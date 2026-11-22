// The context of one run of the circuit (scripts/circuit.mjs, `contexte`), built from a trial ticket
// the way an act of the workflow builds it: the main tree read from git's common directory, the
// copy and the working directory of the ticket beside it, the packages of its plan, the subject of
// its title, the delay of a motionless session, and a Beads whose comments pass the 1 MiB that a
// child process returns by default (the handover of a long ticket is read whole). Its fields are
// those the decisions of the circuit read: the packages, the copy, the logs, the delay. Git and
// Beads are stand-ins of the child process: git names the trial project as the main tree, Beads
// answers as a child process does, cutting an output past the `maxBuffer` it is given.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { architecture } from '@roomi-fields/grillhouse-matiere/test-fixtures';

const DESCRIPTION =
  '## Architecture\n\nLe paquet forms.\n\n## Critères\n\n1. La mesure rend le double.';
const COMMENTAIRES = JSON.stringify([{ author: 'testwriter', text: 'x'.repeat(1_200_000) }]);
const faux = vi.hoisted(() => ({ racine: '' }));

vi.mock('node:child_process', async importOriginal => {
  const reel = await importOriginal<typeof import('node:child_process')>();
  const spawnSync = (cmd: string, args: string[], options: { maxBuffer?: number } = {}) => {
    if (cmd === 'git' && args.includes('--git-common-dir')) {
      return { status: 0, stdout: `${faux.racine}/.git\n`, stderr: '' };
    }
    if (cmd === 'bd' && args[0] === 'show') {
      const ticket = {
        id: 'demo-1',
        title: '1 — la mesure — packages/forms, packages/binder',
        description: DESCRIPTION,
      };
      return { status: 0, stdout: JSON.stringify([ticket]), stderr: '' };
    }
    if (cmd === 'bd' && args[0] === 'comments') {
      // A child process that outputs more than its `maxBuffer` is killed: no status, ENOBUFS.
      return COMMENTAIRES.length > (options.maxBuffer ?? 1024 * 1024)
        ? { status: null, stdout: '', stderr: '', error: new Error('spawnSync bd ENOBUFS') }
        : { status: 0, stdout: COMMENTAIRES, stderr: '' };
    }
    return (reel.spawnSync as (c: string, a: string[], o: object) => unknown)(cmd, args, options);
  };
  return { ...reel, spawnSync };
});

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'circuit-contexte-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ecrire = (rel: string, texte: string) => {
  mkdirSync(path.dirname(path.join(faux.racine, rel)), { recursive: true });
  writeFileSync(path.join(faux.racine, rel), texte);
};

interface Ctx {
  racine: string;
  copie: string;
  ticket: string;
  sujet: string;
  paquets: string[];
  journal: string;
  fiches: string;
  tmp: string;
  immobileMs: number;
  ecartes: string[];
  base: { fermer: () => void };
  resoudre: (nom: string) => string;
  duTitre: (titre: string) => { sujet: string; plan: string[] };
  bd: (...a: string[]) => { status: number | null; stdout: string; error?: Error };
}
type Contexte = (o: { ticket: string }) => Ctx;
const construire = async (immobile = '') => {
  const avant = process.env.GRILLHOUSE_CIRCUIT_IMMOBILE_MS;
  process.env.GRILLHOUSE_CIRCUIT_IMMOBILE_MS = immobile;
  try {
    const { contexte } = (await import('../../scripts/circuit.mjs')) as unknown as {
      contexte: Contexte;
    };
    const ctx = contexte({ ticket: 'demo-1' });
    ctx.base.fermer();
    return ctx;
  } finally {
    if (avant === undefined) {
      delete process.env.GRILLHOUSE_CIRCUIT_IMMOBILE_MS;
    } else {
      process.env.GRILLHOUSE_CIRCUIT_IMMOBILE_MS = avant;
    }
  }
};

describe('le contexte d’une passe construit depuis un ticket d’essai', () => {
  let c: Ctx;
  beforeAll(async () => {
    faux.racine = path.join(ESSAIS, 'projet');
    ecrire('package.json', JSON.stringify({ name: 'essai', workspaces: ['packages/*'] }));
    ecrire('docs/ARCHITECTURE.md', architecture());
    ecrire(
      'packages/forms/package.json',
      JSON.stringify({ name: '@essai/forms', scripts: { 'test:unit': 'vitest run' } })
    );
    ecrire('packages/binder/package.json', JSON.stringify({ name: '@essai/binder' }));
    c = await construire();
  }, 60_000);

  it('place la copie et le dossier de travail du ticket à côté de l’arbre principal', () => {
    expect(c.racine).toBe(faux.racine);
    expect(c.copie).toBe(path.join(faux.racine, '.claude', 'worktrees', 'demo-1'));
    expect(c.tmp).toBe(`${c.copie}.travail`);
    expect(c.journal).toBe(`${c.copie}.log`);
    expect(c.fiches).toBe(`${c.copie}.fiches.jsonl`);
  });

  it('lit le plan et le sujet du titre : les paquets que chaque séance écrit', () => {
    expect(c.ticket).toBe('demo-1');
    expect(c.sujet).toBe('la mesure');
    expect(c.paquets).toEqual(['packages/forms', 'packages/binder']);
  });

  it('résout un composant par son nom ou son chemin et lit le titre d’un plan réécrit', () => {
    expect(c.resoudre('@essai/binder')).toBe('packages/binder');
    expect(c.resoudre('packages/binder')).toBe('packages/binder');
    expect(c.duTitre('2 — autre sujet — packages/binder')).toEqual({
      sujet: 'autre sujet',
      plan: ['packages/binder'],
    });
  });

  it('un plan que l’explorateur n’a pas écarté ne laisse aucun composant écarté', () => {
    expect(c.ecartes).toEqual([]);
  });

  it('attend vingt minutes d’immobilité d’une séance, que l’environnement règle', async () => {
    expect(c.immobileMs).toBe(20 * 60 * 1000);
    expect((await construire('15000')).immobileMs).toBe(15_000);
  });

  it('lit en entier les commentaires d’un ticket qui passent 1 Mio', () => {
    const lu = c.bd('comments', 'demo-1', '--json');
    expect(lu.error).toBeUndefined();
    expect(lu.status).toBe(0);
    expect(lu.stdout.length).toBeGreaterThan(1_200_000);
  });
});
