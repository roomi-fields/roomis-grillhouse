// `npx grillhouse circuit <ticket>` puts the ticket in the queue of the tickets of the project
// (src/temporal/circuit/client.ts, `mettreEnFile`, which the command's module wires): it is refused,
// by its reason, when a circuit already runs on the ticket (it carries the ticket to its end,
// `--arreter` stops it), when the last run stopped on the supervisor's word (`--reprendre`,
// `--depuis` or `--recommencer` reopen it) and when the ticket is not one a circuit can start on.
// A refusal puts nothing in the queue and writes nothing at the ticket. A test of size medium: the
// project is a trial directory and Beads a program of trial on the PATH; Temporal is a client whose
// only answers are the ones the refusals read.
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Client } from '@temporalio/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { architecture } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as client from '../../src/temporal/circuit/client.js';
import { idDuCircuit } from '../../src/temporal/circuit/contrat.js';

const mettreEnFile = (
  client as unknown as {
    mettreEnFile: (
      c: Client,
      racine: string,
      ticket: string,
      recommence?: boolean
    ) => Promise<string>;
  }
).mettreEnFile;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'mettre-en-file-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ecrire = (rel: string, texte: string) => {
  mkdirSync(path.dirname(path.join(RACINE, rel)), { recursive: true });
  writeFileSync(path.join(RACINE, rel), texte);
};
const RACINE = path.join(ESSAIS, 'projet');
const BIN = path.join(ESSAIS, 'bin');
const JOURNAL = path.join(ESSAIS, 'bd.log');
const DESCRIPTION =
  '## Architecture\n\nLe paquet forms.\n\n## Critères\n\n1. La mesure rend le double.';

// Beads of trial: shows the ticket, notes every call in its log.
let ticketLu = { id: 'demo-1', title: '1 — mesure — packages/forms', description: DESCRIPTION };
const ecrireBd = () =>
  writeFileSync(
    path.join(BIN, 'bd'),
    `#!/bin/sh\necho "$*" >> ${JOURNAL}\nif [ "$1" = show ]; then cat <<'EOF'\n${JSON.stringify([ticketLu])}\nEOF\nfi\n`
  );
const appelsDeBd = () => {
  try {
    return readFileSync(JOURNAL, 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
};

const PATH_AVANT = process.env.PATH;
beforeAll(() => {
  ecrire('package.json', JSON.stringify({ name: 'essai', workspaces: ['packages/*'] }));
  ecrire('docs/ARCHITECTURE.md', architecture());
  ecrire(
    'packages/forms/package.json',
    JSON.stringify({ name: '@essai/forms', scripts: { 'test:unit': 'vitest run' } })
  );
  mkdirSync(BIN);
  ecrireBd();
  chmodSync(path.join(BIN, 'bd'), 0o755);
  process.env.PATH = `${BIN}:${PATH_AVANT ?? ''}`;
});
afterEach(() => {
  rmSync(JOURNAL, { force: true });
  ticketLu = { id: 'demo-1', title: '1 — mesure — packages/forms', description: DESCRIPTION };
  ecrireBd();
});
afterAll(() => {
  process.env.PATH = PATH_AVANT;
});

// A Temporal client: the circuit of <ticket> in the state <etat>, its result <resultat>.
function temporal(etat: string, resultat: unknown = null) {
  const demarrer = vi.fn();
  const c = {
    workflow: {
      start: demarrer,
      getHandle: vi.fn((id: string) => ({
        id,
        describe: () => Promise.resolve({ status: { name: etat } }),
        result: () => Promise.resolve(resultat),
      })),
    },
  } as unknown as Client;
  return { c, demarrer };
}

describe('mettre un ticket en file devant un circuit qui tourne', () => {
  it('est refusé, le circuit en cours nommé : il mène le ticket à sa fin, --arreter l’arrête', async () => {
    const { c } = temporal('RUNNING');
    await expect(mettreEnFile(c, RACINE, 'demo-1')).rejects.toMatchObject({
      name: 'ReponseRefusee',
      message:
        "un circuit tourne déjà sur demo-1 : il mène le ticket à sa fin, `--arreter` l'arrête.",
    });
  });

  it('interroge le circuit de ce ticket, sous l’identifiant de son projet', async () => {
    const { c } = temporal('RUNNING');
    await mettreEnFile(c, RACINE, 'demo-1').catch(() => undefined);
    const getHandle = (c.workflow as unknown as { getHandle: { mock: { calls: string[][] } } })
      .getHandle;
    expect(getHandle.mock.calls[0]).toEqual([idDuCircuit(RACINE, 'demo-1')]);
  });

  it('ne met rien en file et n’écrit rien au ticket', async () => {
    const { c, demarrer } = temporal('RUNNING');
    await mettreEnFile(c, RACINE, 'demo-1').catch(() => undefined);
    expect(demarrer).not.toHaveBeenCalled();
    expect(appelsDeBd().filter(l => l.startsWith('update'))).toEqual([]);
  });
});

describe('mettre un ticket en file après d’autres refus', () => {
  it('un circuit arrêté sur le mot du superviseur n’est pas relancé à neuf : les trois sorties sont nommées', async () => {
    const { c, demarrer } = temporal('COMPLETED', { raison: 'arrete' });
    const refus = mettreEnFile(c, RACINE, 'demo-1');
    await expect(refus).rejects.toThrow(
      /arrêté sur le mot du superviseur.*--reprendre.*--depuis.*--recommencer/s
    );
    await expect(refus).rejects.toBeInstanceOf(client.ReponseRefusee);
    expect(demarrer).not.toHaveBeenCalled();
    expect(appelsDeBd().filter(l => l.startsWith('update'))).toEqual([]);
  });

  it('un ticket sans section Architecture est refusé à la porte, par sa raison', async () => {
    ticketLu = { ...ticketLu, description: 'Une description sans section.' };
    ecrireBd();
    const { c, demarrer } = temporal('RUNNING');
    const refus = mettreEnFile(c, RACINE, 'demo-1');
    await expect(refus).rejects.toThrow("n'a pas sa section « ## Architecture »");
    await expect(refus).rejects.toBeInstanceOf(client.ReponseRefusee);
    expect(demarrer).not.toHaveBeenCalled();
    expect(appelsDeBd().filter(l => l.startsWith('update'))).toEqual([]);
  });
});
