// The act `ouvrir` of a direct ticket (scripts/faits-du-circuit.mjs): the ticket and the memory it
// gives the workflow carry the circuit, which the later acts take back. A test of size medium: a
// trial git repository, the act played in this process on it as its main tree, bd a stand-in.
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as faits from '../../scripts/faits-du-circuit.mjs';
import { monde } from './seance-d-essai.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'direct-memoire-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const { jouerLActe, laMemoireReprise } = faits as unknown as {
  jouerLActe: (acte: string, entree: object) => Promise<unknown>;
  laMemoireReprise: (memoire: object) => { circuit?: string };
};
interface Ouvert {
  ouverture?: { ticket: { circuit?: string }; memoire: { circuit?: string } };
}

// The act `ouvrir` at the first launch of the ticket labelled `labels`.
async function ouvrir(labels: string[]) {
  const m = monde();
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
  const ticket = JSON.stringify([
    {
      title: 'demo-1 — La mesure — packages/forms',
      description: '## Architecture\n\nx',
      notes: '',
      labels,
    },
  ]);
  writeFileSync(path.join(bin, 'ticket.json'), ticket);
  writeFileSync(
    path.join(bin, 'bd'),
    `#!/bin/sh\nif [ "$1" = show ]; then cat '${bin}/ticket.json'; else echo '[]'; fi\n`
  );
  chmodSync(path.join(bin, 'bd'), 0o755);
  vi.stubEnv('PATH', `${bin}${path.delimiter}${process.env.PATH}`);
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  // git reads the trial repository as the main tree of the act: a worker cannot change its folder.
  vi.stubEnv('GIT_DIR', path.join(m.ctx.racine, '.git'));
  return (await m.jouer(() =>
    jouerLActe('ouvrir', { ticket: 'demo-1', memoire: {}, reponse: null, arrete: null })
  )) as Ouvert;
}

describe('l’acte d’ouverture rend le circuit au déroulé', () => {
  it('d’un ticket direct : au ticket de l’ouverture comme à la mémoire', async () => {
    const { ouverture } = await ouvrir(['direct']);
    expect(ouverture?.ticket.circuit).toBe('direct');
    expect(ouverture?.memoire.circuit).toBe('direct');
  });

  it('et l’acte suivant le reprend de cette mémoire', async () => {
    const { ouverture } = await ouvrir(['direct']);
    expect(laMemoireReprise(ouverture!.memoire).circuit).toBe('direct');
  });
});
