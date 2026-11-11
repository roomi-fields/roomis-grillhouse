// grillhouse-4nr.9: the activities of the queue of the tickets of a project
// (src/temporal/tickets/activites.ts), on a project of trial: its package.json and Beads, a
// stand-in on the PATH. The tickets that start and the setting of the project are read as written:
// a package.json that does not parse, or a Beads that fails, is a fault named by its name, never a
// key absent nor an empty list. The circuits the server holds are ./tickets.nuit.spec.ts's.
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ticketsAPartir } from '../../src/temporal/tickets/activites.js';
import { dossier } from './essai.js';

const avant = process.env.PATH;
afterEach(() => {
  process.env.PATH = avant;
});

// A project of trial whose package.json is <paquet> (none when undefined), its Beads a stand-in
// that gives <tickets>, or fails when <tickets> is null.
function projet(paquet: string | undefined, tickets: object[] | null) {
  const racine = dossier('projet');
  if (paquet !== undefined) {
    writeFileSync(path.join(racine, 'package.json'), paquet);
  }
  const bin = path.join(racine, 'bin');
  mkdirSync(bin);
  const bd = path.join(bin, 'bd');
  writeFileSync(
    bd,
    tickets === null
      ? "#!/bin/sh\necho 'bd : base illisible' >&2\nexit 3\n"
      : `#!/bin/sh\ncat <<'FIN'\n${JSON.stringify(tickets)}\nFIN\n`
  );
  chmodSync(bd, 0o755);
  process.env.PATH = `${bin}:${avant}`;
  return racine;
}
const T = (id: string) => ({
  id,
  status: 'open',
  priority: 2,
  labels: ['circuit'],
  description: '## Architecture\n\n- Adresse.',
});

describe('les activités de la file des tickets', () => {
  it('reads the setting and the tickets that start', async () => {
    const racine = projet(JSON.stringify({ grillhouse: { circuits: 2 } }), [T('d-1'), T('d-2')]);
    expect(await ticketsAPartir({ racine, enCours: ['d-2'] })).toEqual({
      partir: ['d-1'],
      max: 2,
      faute: null,
    });
  });

  it('without a package.json, one circuit at a time', async () => {
    const racine = projet(undefined, [T('d-1')]);
    expect(await ticketsAPartir({ racine, enCours: [] })).toMatchObject({ max: 1, faute: null });
  });

  it('a package.json that does not parse is a fault named, not a key absent', async () => {
    const racine = projet('{ "grillhouse": ', [T('d-1')]);
    const r = await ticketsAPartir({ racine, enCours: [] });
    expect(r.max).toBeNull();
    expect(r.faute).toMatch(/package\.json/);
  });

  it('a Beads that fails is a fault named, not an empty list', async () => {
    const racine = projet('{}', null);
    const r = await ticketsAPartir({ racine, enCours: [] });
    expect(r.partir).toEqual([]);
    expect(r.faute).toMatch(/bd list/);
    expect(r.faute).toMatch(/base illisible/);
  });
});
