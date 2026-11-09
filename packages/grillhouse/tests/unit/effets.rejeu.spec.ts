// A line of the register played again under its key is written once, and the sorts of effect that
// take a key are those that do not replay without harm (scripts/effets.mjs).
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'effets-rejeu-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

type Effets = typeof import('../../scripts/effets.mjs');
type Reponse = { status: number; stdout: string; stderr: string };

// The module of the effects loaded over a register of its own (the register's path is read at load).
async function charger(): Promise<{ effets: Effets; registre: string }> {
  const registre = path.join(mkdtempSync(path.join(ESSAIS, 'r-')), 'registre.jsonl');
  vi.stubEnv('GRILLHOUSE_REGISTRE', registre);
  vi.resetModules();
  return { effets: await import('../../scripts/effets.mjs'), registre };
}

const lignes = (f: string) =>
  readFileSync(f, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(l => JSON.parse(l) as Record<string, unknown>);

describe('un effet rejoué sous la clé de son activité ne s’écrit qu’une fois', () => {
  it('a register line played twice under one key is one line, its key in it; two keys, two lines', async () => {
    const { effets, registre } = await charger();
    const ctx = {} as never;
    const e = { genre: 'registre', ligne: { agent: 'a1', fin: 'f1', role: 'testwriter' } };
    effets.jouerLEffet(ctx, e, 'k:1');
    effets.jouerLEffet(ctx, e, 'k:1');
    expect(lignes(registre)).toEqual([{ ...e.ligne, cle: 'k:1' }]);
    effets.jouerLEffet(ctx, { ...e, ligne: { agent: 'a2', fin: 'f2' } }, 'k:2');
    expect(lignes(registre).map(l => l.cle)).toEqual(['k:1', 'k:2']);
  });

  it('a register line played again under its key is skipped even when its agent and end differ', async () => {
    const { effets, registre } = await charger();
    const ctx = {} as never;
    effets.jouerLEffet(ctx, { genre: 'registre', ligne: { agent: 'a1', fin: 'f1' } }, 'k:1');
    effets.jouerLEffet(ctx, { genre: 'registre', ligne: { agent: 'a2', fin: 'f2' } }, 'k:1');
    expect(lignes(registre)).toEqual([{ agent: 'a1', fin: 'f1', cle: 'k:1' }]);
  });

  it('exactly the writings that do not replay without harm take a key', async () => {
    const { effets } = await charger();
    expect([...effets.AVEC_CLE].sort()).toEqual(
      ['bilan', 'commentaire', 'decouverte', 'fiche', 'registre', 'resume-du-tri'].sort()
    );
  });

  it('a label added and a ticket reopened write the same however often they are played', async () => {
    const { effets } = await charger();
    const appels: string[][] = [];
    let statut = 'closed';
    const ctx = {
      ticket: 'demo-1',
      bd: (...a: string[]): Reponse => {
        appels.push(a);
        if (a[0] === 'show') {
          return { status: 0, stdout: JSON.stringify([{ status: statut }]), stderr: '' };
        }
        if (a[0] === 'reopen') {
          statut = 'open';
        }
        return { status: 0, stdout: '', stderr: '' };
      },
    } as never;
    for (let i = 0; i < 2; i++) {
      effets.jouerLEffet(
        ctx,
        { genre: 'etiquettes', ticket: 'demo-2', etiquettes: ['x', 'y'] },
        `k:${i}`
      );
      effets.jouerLEffet(ctx, { genre: 'reouverture', ticket: 'demo-1' }, `k:${i}`);
    }
    expect(appels.filter(a => a[0] === 'update')).toEqual([
      ['update', 'demo-2', '--add-label', 'x', '--add-label', 'y'],
      ['update', 'demo-2', '--add-label', 'x', '--add-label', 'y'],
    ]);
    expect(appels.filter(a => a[0] === 'reopen')).toHaveLength(1);
  });
});
