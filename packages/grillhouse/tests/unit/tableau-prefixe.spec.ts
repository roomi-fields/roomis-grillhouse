// The board reads each project's ticket prefix once, from the key `issue-prefix` of its
// `.beads/config.yaml` (`prefixe` of scripts/prefixe-des-tickets.mjs), never from `bd`: a prefix
// that reads gives its label, and a prefix that does not read is named under the head with the
// message of `prefixe` (the file or the key), never replaced in silence by the folder's name.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { rmSync } from 'node:fs';
import { prefixe } from '../../scripts/prefixe-des-tickets.mjs';
import { tableau } from '../../scripts/tableau.mjs';
import { circuitLu } from './tableau-essai.js';

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

// A fake `bd` on the PATH that fails on `config` (the prefix is no longer read there): the
// folders whose name holds « echec » have no `.beads/config.yaml`, those holding « sanscle » have
// one without the key, the others have the key `issue-prefix: "demo"`.
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
const SELON_LE_DOSSIER = 'echo "bd config appelé" >&2; exit 9';
const dossier = (nom: string) => {
  const d = mkdtempSync(path.join(ESSAIS, `${nom}-`));
  if (!nom.includes('echec')) {
    mkdirSync(path.join(d, '.beads'));
    writeFileSync(
      path.join(d, '.beads/config.yaml'),
      nom.includes('sanscle') ? '# issue-prefix: ""\n' : 'issue-prefix: "demo"\n'
    );
  }
  return d;
};
// The refusal of `prefixe` on <racine>: the message the alert carries.
const refus = (racine: string) => {
  try {
    prefixe(racine);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('prefixe a lu un préfixe');
};

interface Vu {
  lignes: { texte: string; ton?: string }[];
  alertes: { texte: string }[];
}
// Each project's server gives the stopped circuit of demo-5, whose line stands in AGENTS.
const lire = async (racine: string, projets: string[] = []) =>
  (await tableau(racine, {
    home: dossier('home'),
    projets,
    circuitsDe: () => Promise.resolve([circuitLu('demo-5')]),
  })) as unknown as Vu;
const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('the label of a project on the board of several projects', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('a prefix that reads in the file gives the label, bd never asked', async () => {
    faux(SELON_LE_DOSSIER);
    const vite = await lire(dossier('depot'), [dossier('autre')]);
    const lente = await lire(dossier('depot'), [dossier('lent')]);
    expect(lente.alertes.some(x => /Préfixe/.test(x.texte))).toBe(false);
    expect(vite.lignes[1]?.texte).toMatch(/^\[demo\]\s+toi : /);
    expect(vite.lignes[4]?.texte).toMatch(/^\[demo\]\s+toi : /);
    expect(lente.lignes[1]?.texte).toMatch(/^\[demo\]\s+toi : /);
    expect(lente.lignes[4]?.texte).toMatch(/^\[demo\]\s+toi : /);
    expect(lente.lignes[0]?.texte).toMatch(/\+ DEMO$/);
  });

  it('a prefix that does not read leaves its project on the board by its folder, with an alert naming the missing file', async () => {
    faux(SELON_LE_DOSSIER);
    const racine = dossier('depot');
    const echec = dossier('echec');
    const nom = path.basename(echec);
    const vu = await lire(racine, [echec]);
    expect(
      vu.lignes.some(x =>
        new RegExp(`^\\[${echapper(nom)}\\]\\s+toi : \\d+ sans go · \\d+ à valider · \\d+ qu`).test(
          x.texte
        )
      )
    ).toBe(true);
    expect(
      vu.lignes.some(x => new RegExp(`^\\[${echapper(nom)}\\]\\s+demo-5\\b`).test(x.texte))
    ).toBe(true);
    const alerte = vu.lignes.find(x => /Préfixe des tickets illisible/.test(x.texte));
    expect(alerte?.texte).toContain(`[${nom}]`);
    // The panel line is cut to the width of the panel: the full cause stands in the alert.
    expect(
      vu.alertes.some(x => x.texte === `Préfixe des tickets illisible : ${refus(echec)}`)
    ).toBe(true);
    expect(vu.alertes.every(x => !/code \d|boom/.test(x.texte))).toBe(true);
  });

  it('a file without the key names the key in the alert, its project labelled by its folder', async () => {
    faux(SELON_LE_DOSSIER);
    const sansCle = dossier('sanscle');
    const nom = path.basename(sansCle);
    const vu = await lire(dossier('depot'), [sansCle]);
    expect(
      vu.alertes.some(x => x.texte === `Préfixe des tickets illisible : ${refus(sansCle)}`)
    ).toBe(true);
    expect(refus(sansCle)).toContain('issue-prefix');
    expect(vu.lignes.some(x => new RegExp(`^\\[${echapper(nom)}\\]`).test(x.texte))).toBe(true);
  });

  it('the alert of a prefix that does not read stands under the head, with the project lines above it', async () => {
    faux(SELON_LE_DOSSIER);
    const echec = dossier('echec');
    const vu = await lire(dossier('depot'), [echec]);
    const i = vu.lignes.findIndex(x => /Préfixe des tickets illisible/.test(x.texte));
    // Head: the title, three lines per project, then the discoveries line (grillhouse-3uv.96); the
    // alert stands under them.
    expect(i).toBe(8);
    expect(vu.lignes[i]?.ton).not.toBeUndefined();
  });
});

describe('the board of the session’s project alone', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('a prefix that does not read gives the same alert, the message of prefixe', async () => {
    faux(SELON_LE_DOSSIER);
    const racine = dossier('echec');
    const vu = await lire(racine);
    const alerte = vu.alertes.find(x => /Préfixe des tickets illisible/.test(x.texte));
    expect(alerte?.texte).toBe(`Préfixe des tickets illisible : ${refus(racine)}`);
    expect(vu.lignes.some(x => /Préfixe des tickets illisible/.test(x.texte))).toBe(true);
  });

  it('a prefix that reads raises no alert', async () => {
    faux(SELON_LE_DOSSIER);
    const vu = await lire(dossier('depot'));
    expect(vu.alertes.some(x => /Préfixe/.test(x.texte))).toBe(false);
  });
});
