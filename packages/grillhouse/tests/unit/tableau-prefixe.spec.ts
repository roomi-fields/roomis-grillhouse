// The board reads each project's ticket prefix once, from Beads (`bd config get issue_prefix`):
// a prefix that reads gives its label whatever the time Beads takes, and a prefix that does not
// read is named under the head with its cause, never replaced in silence by the folder's name.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { rmSync } from 'node:fs';
import { tableau } from '../../scripts/tableau.mjs';
import { aucunCircuit } from './tableau-essai.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tableau-prefixe-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const TICKET = {
  id: 'demo-5',
  title: 'demo-5 — le sujet — grillhouse',
  status: 'open',
  priority: 2,
  issue_type: 'task',
  labels: ['circuit'],
  created_at: '2026-10-11T08:00:00Z',
  updated_at: '2026-10-11T08:00:00Z',
};

// A fake `bd` on the PATH: the folders whose name holds « echec » fail to read their prefix with
// code 3 and the message « boom », those holding « lent » answer after a second, the others at once.
const faux = (config: string) => {
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
  writeFileSync(path.join(bin, 'tous.json'), JSON.stringify([TICKET]));
  writeFileSync(
    path.join(bin, 'bd'),
    `#!/bin/sh\ncase "$1" in\n  config) ${config} ;;\n  list) cat '${bin}/tous.json' ;;\n  *) echo '[]' ;;\nesac\n`,
    { mode: 0o755 }
  );
  writeFileSync(path.join(bin, 'registre.jsonl'), '');
  vi.stubEnv('PATH', `${bin}:${process.env.PATH}`);
  vi.stubEnv('GRILLHOUSE_REGISTRE', path.join(bin, 'registre.jsonl'));
};
const SELON_LE_DOSSIER =
  'case "$PWD" in *echec*) echo boom >&2; exit 3;; *lent*) sleep 1; echo demo;; *) echo demo;; esac';
const dossier = (nom: string) => mkdtempSync(path.join(ESSAIS, `${nom}-`));

interface Vu {
  lignes: { texte: string; ton?: string }[];
  alertes: { texte: string }[];
}
const lire = async (racine: string, projets: string[] = []) =>
  (await tableau(racine, {
    home: dossier('home'),
    projets,
    circuitsDe: aucunCircuit,
  })) as unknown as Vu;
const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('the label of a project on the board of several projects', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('a prefix that reads gives the label whether Beads answers at once or late', async () => {
    faux(SELON_LE_DOSSIER);
    const vite = await lire(dossier('depot'), [dossier('autre')]);
    const lente = await lire(dossier('depot'), [dossier('lent')]);
    expect(vite.lignes[1]?.texte).toMatch(/^\[demo\]\s+▶ /);
    expect(vite.lignes[2]?.texte).toMatch(/^\[demo\]\s+▶ /);
    expect(lente.lignes[1]?.texte).toMatch(/^\[demo\]\s+▶ /);
    expect(lente.lignes[2]?.texte).toMatch(/^\[demo\]\s+▶ /);
    expect(lente.lignes[0]?.texte).toMatch(/\+ DEMO$/);
  });

  it('a prefix that does not read leaves its project on the board by its folder, with an alert naming the exit code', async () => {
    faux(SELON_LE_DOSSIER);
    const racine = dossier('depot');
    const echec = dossier('echec');
    const nom = path.basename(echec);
    const vu = await lire(racine, [echec]);
    expect(
      vu.lignes.some(x => new RegExp(`^\\[${echapper(nom)}\\]\\s+▶ \\d+ en cours`).test(x.texte))
    ).toBe(true);
    expect(
      vu.lignes.some(x => new RegExp(`^\\[${echapper(nom)}\\]\\s+demo-5\\b`).test(x.texte))
    ).toBe(true);
    const alerte = vu.lignes.find(x => /Préfixe des tickets illisible/.test(x.texte));
    expect(alerte?.texte).toContain(`[${nom}]`);
    // The panel line is cut to the width of the panel: the full cause stands in the alert.
    expect(
      vu.alertes.some(x => /Préfixe des tickets illisible : .*(\b3\b|boom)/.test(x.texte))
    ).toBe(true);
  });

  it('the alert of a prefix that does not read stands under the head, with the project lines above it', async () => {
    faux(SELON_LE_DOSSIER);
    const echec = dossier('echec');
    const vu = await lire(dossier('depot'), [echec]);
    const i = vu.lignes.findIndex(x => /Préfixe des tickets illisible/.test(x.texte));
    // Head: the title, one line per project, then the discoveries line (grillhouse-3uv.96); the
    // alert stands under them.
    expect(i).toBe(4);
    expect(vu.lignes[i]?.ton).not.toBeUndefined();
  });

  it('a prefix that does not read because Beads does not start names the cause of the launch', async () => {
    const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
    writeFileSync(path.join(bin, 'bd'), '#!/nonexistent/interprete\n', { mode: 0o755 });
    // The PATH holds the fake `bd` alone: another `bd` further on would be tried after the ENOENT.
    vi.stubEnv('PATH', bin);
    vi.stubEnv('GRILLHOUSE_REGISTRE', path.join(bin, 'absent.jsonl'));
    const vu = await lire(dossier('depot'), [dossier('autre')]);
    expect(vu.alertes.some(x => /Préfixe des tickets illisible : .*ENOENT/.test(x.texte))).toBe(
      true
    );
  });
});

describe('the board of the session’s project alone', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('a prefix that does not read gives the same alert, naming the exit code', async () => {
    faux(SELON_LE_DOSSIER);
    const vu = await lire(dossier('echec'));
    const alerte = vu.alertes.find(x => /Préfixe des tickets illisible/.test(x.texte));
    expect(alerte?.texte).toMatch(/illisible : .*(\b3\b|boom)/);
    expect(vu.lignes.some(x => /Préfixe des tickets illisible/.test(x.texte))).toBe(true);
  });

  it('a prefix that reads raises no alert', async () => {
    faux(SELON_LE_DOSSIER);
    const vu = await lire(dossier('depot'));
    expect(vu.alertes.some(x => /Préfixe/.test(x.texte))).toBe(false);
  });
});
