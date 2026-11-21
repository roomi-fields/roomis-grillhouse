// The board shows a start of the CI of main that GitHub refused as an alert of its own (the fault
// kept by the queue in `.claude/worktrees/ci-de-main-declenchee.json`, read by
// `fauteDeDeclenchement` of scripts/ci-de-main.mjs, said by `alerteDeDeclenchement`), apart from
// « CI de main non lue », and shows nothing when no start was refused.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { tableau } from '../../scripts/tableau.mjs';
import { aucunCircuit } from './tableau-essai.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tableau-ci-non-declenchee-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// A fake `bd` that lists no ticket, so the board reads a project with nothing in it.
const faux = () => {
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
  writeFileSync(path.join(bin, 'bd'), `#!/bin/sh\necho '[]'\n`, { mode: 0o755 });
  writeFileSync(path.join(bin, 'registre.jsonl'), '');
  vi.stubEnv('PATH', `${bin}:${process.env.PATH}`);
  vi.stubEnv('GRILLHOUSE_REGISTRE', path.join(bin, 'registre.jsonl'));
};

const projet = (faute?: string) => {
  const d = mkdtempSync(path.join(ESSAIS, 'depot-'));
  mkdirSync(path.join(d, '.beads'));
  writeFileSync(path.join(d, '.beads/config.yaml'), 'issue-prefix: "demo"\n');
  if (faute !== undefined) {
    mkdirSync(path.join(d, '.claude', 'worktrees'), { recursive: true });
    writeFileSync(
      path.join(d, '.claude', 'worktrees', 'ci-de-main-declenchee.json'),
      `${JSON.stringify({ declenche: null, entree: true, faute })}\n`
    );
  }
  return d;
};

const alertes = async (racine: string) =>
  (
    (await tableau(racine, {
      home: mkdtempSync(path.join(ESSAIS, 'home-')),
      circuitsDe: aucunCircuit,
      nuitDe: () => null,
      ciDeMainDe: () => ({ etat: 'verte', vert: 'abc1234', lots: [] }),
    })) as unknown as { alertes: { texte: string }[] }
  ).alertes.map(a => a.texte);

describe('the alert of a start of the CI of main that GitHub refused', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is on the board, with the reason of gh, while the fault is kept', async () => {
    faux();
    const textes = await alertes(projet('gh: HTTP 403: Resource not accessible'));
    const ligne = textes.find(t => /n'a pas pu être déclenchée/.test(t));
    expect(ligne).toContain('HTTP 403');
  });

  it('is absent from the board when no start was refused', async () => {
    faux();
    const textes = await alertes(projet());
    expect(textes.some(t => /pas pu être déclenchée/.test(t))).toBe(false);
  });
});
