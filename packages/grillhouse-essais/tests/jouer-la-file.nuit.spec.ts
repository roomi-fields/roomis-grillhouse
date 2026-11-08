// The queue of a trial played by ./jouer-la-file.mjs, on a server of trial (./temporal-essai.ts):
// a queue not started yet gave no issue, whatever error the reading of its history raises for a
// workflow the server does not hold. A test medium: a local server, the script in its process.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CADRE } from './cadre.js';
import { ouvrirLeBanc } from './temporal-essai.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'jouer-la-file-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const JOUER_LA_FILE = path.join(__dirname, 'jouer-la-file.mjs');
// The server of the trial: its address, and how to close it with its worker.
let adresse = '';
let fermer: () => Promise<void> = () => Promise.resolve();

beforeAll(async () => {
  const vide = mkdtempSync(path.join(ESSAIS, 'serveur-'));
  const ENV: Record<string, string | undefined> = { ...process.env };
  const banc = await ouvrirLeBanc(ESSAIS, { REPO: vide, ENV, journal: () => '' }, 'file');
  adresse = banc.adresse;
  fermer = () => banc.fermer([]);
}, 120_000);
// Registered after the removal of the root, it runs before it (the hooks of Vitest run as a stack).
afterAll(() => fermer(), 120_000);

describe('the queue of a trial, played by its script', () => {
  it('a queue not started yet gave no issue: the script without tickets exits 0, { issues: 0 }', () => {
    const journal = path.join(ESSAIS, 'travailleur.log');
    writeFileSync(journal, 'prêt essai-vide\n');
    const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
    const r = spawnSync(process.execPath, [JOUER_LA_FILE, CADRE, racine, 'essai-vide', journal], {
      encoding: 'utf8',
      env: { ...process.env, TEMPORAL_ADDRESS: adresse },
      timeout: 120_000,
    });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ issues: 0 });
  }, 150_000);
});
