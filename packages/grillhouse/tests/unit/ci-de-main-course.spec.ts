// Two openings of the defect of the same red pass at once, from two processes (the queue and the
// supervisor's reading, or two readings), make one ticket: the search of a doublon and the creation
// are played under a file lock of the project (scripts/ci-de-main.mjs, scripts/verrou-de-fichier.mjs).
// Only a test with two processes and a slow creation shows the race.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { journalDe, poserLeFauxBd, ticketsDe } from './faux-bd.js';

const SCRIPT_CI = path.resolve(__dirname, '../../scripts/ci-de-main.mjs');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'ci-de-main-course-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// Each child opens the defect through the module itself, with the stand-in Beads, as the queue
// and the supervisor's reading do from their own processes.
const ENFANT = `
  const { spawnSync } = require('node:child_process');
  import(${JSON.stringify(pathToFileURL(SCRIPT_CI).href)}).then(m => {
    const bd = (...a) => spawnSync('bd', a, { cwd: process.argv[1], encoding: 'utf8' });
    const lecture = { etat: 'rouge', flux: 'Machine vierge', passage: '4242', commit: 'b'.repeat(40), vert: null };
    const r = m.ouvrirLeDefautDeMain({ racine: process.argv[1], bd }, lecture, []);
    process.stdout.write(JSON.stringify(r));
  });
`;

describe('l’ouverture simultanée du défaut d’un même passage rouge', () => {
  it('creates a single ticket when two processes open the same pass while the creation is slow', async () => {
    const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
    const { bin, etat } = poserLeFauxBd(ESSAIS);
    const env = {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      BD_ETAT: etat,
      BD_LENT: '600',
    };
    const lancer = () =>
      new Promise<{ code: number | null; sortie: string }>(resolve => {
        const p = spawn(process.execPath, ['-e', ENFANT, racine], { env });
        let sortie = '';
        p.stdout.on('data', (d: Buffer) => (sortie += d.toString()));
        p.on('close', code => resolve({ code, sortie }));
      });
    const [a, b] = await Promise.all([lancer(), lancer()]);
    expect([a.code, b.code]).toEqual([0, 0]);
    expect(journalDe(etat).filter(c => c.cmd === 'create')).toHaveLength(1);
    expect(ticketsDe(etat)).toHaveLength(1);
    const id = ticketsDe(etat)[0]!.id;
    const dit = (s: string) => (JSON.parse(s) as { ticket: string }).ticket;
    expect([dit(a.sortie), dit(b.sortie)]).toEqual([id, id]);
  }, 30_000);
});
