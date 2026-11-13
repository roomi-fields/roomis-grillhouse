// Le panneau de plusieurs projets étiquette chaque projet par son sigle (scripts/sigle-du-projet.mjs :
// la clé `grillhouse.sigle` de son package.json, sinon le `issue-prefix` de son .beads/config.yaml),
// au lieu du seul préfixe de tickets. Une clé fautive est dite en alerte par la clé, le préfixe
// restant le sigle ; deux projets affichés qui portent le même sigle sont dits en alerte, nommés.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { tableau } from '../../scripts/tableau.mjs';
import { circuitLu } from './tableau-essai.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tableau-sigle-'));
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

// Un faux `bd` sur le PATH, qui échoue sur `config` : le préfixe se lit dans .beads/config.yaml.
const fauxBd = () => {
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
  writeFileSync(path.join(bin, 'tous.json'), JSON.stringify([TICKET]));
  writeFileSync(
    path.join(bin, 'bd'),
    `#!/bin/sh\ncase "$1" in\n  config) exit 9 ;;\n  list) cat '${bin}/tous.json' ;;\n  *) echo '[]' ;;\nesac\n`,
    { mode: 0o755 }
  );
  writeFileSync(path.join(bin, 'registre.jsonl'), '');
  vi.stubEnv('PATH', `${bin}:${process.env.PATH}`);
  vi.stubEnv('GRILLHOUSE_REGISTRE', path.join(bin, 'registre.jsonl'));
};
// Un projet d'essai : son package.json (`pkg`) et son préfixe de tickets (.beads/config.yaml).
const projet = (nom: string, o: { pkg?: unknown; prefixe?: string } = {}) => {
  const d = mkdtempSync(path.join(ESSAIS, `${nom}-`));
  writeFileSync(path.join(d, 'package.json'), JSON.stringify(o.pkg ?? { name: nom }));
  if (o.prefixe) {
    mkdirSync(path.join(d, '.beads'));
    writeFileSync(path.join(d, '.beads', 'config.yaml'), `issue-prefix: "${o.prefixe}"\n`);
  }
  return d;
};
const sigle = (v: unknown) => ({ grillhouse: { sigle: v } });

interface Vu {
  lignes: { texte: string; ton?: string }[];
  alertes: { texte: string }[];
}
const lire = async (racine: string, projets: string[] = []) =>
  (await tableau(racine, {
    home: mkdtempSync(path.join(ESSAIS, 'home-')),
    projets,
    circuitsDe: () => Promise.resolve([circuitLu('demo-5')]),
  })) as unknown as Vu;
const etiquettes = (vu: Vu) =>
  vu.lignes.map(l => /^\[([^\]]+)\]\s+▶ /.exec(l.texte)?.[1]).filter(Boolean);

describe('le panneau de plusieurs projets étiquette chaque projet par son sigle', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('le sigle déclaré par la clé du package.json étiquette le projet, et son nom dans l’en-tête', async () => {
    fauxBd();
    const vu = await lire(projet('depot', { prefixe: 'demo' }), [
      projet('autre', { pkg: sigle('ZZ'), prefixe: 'zzzz' }),
    ]);
    expect(etiquettes(vu)).toEqual(['demo', 'ZZ']);
    expect(vu.lignes[0]?.texte).toMatch(/\+ ZZ$/);
  });

  it('le sigle de la session s’affiche de même', async () => {
    fauxBd();
    const vu = await lire(projet('depot', { pkg: sigle('SS'), prefixe: 'demo' }), [
      projet('autre', { prefixe: 'bb' }),
    ]);
    expect(etiquettes(vu)).toEqual(['SS', 'bb']);
  });

  it('sans clé, le issue-prefix de .beads/config.yaml étiquette le projet', async () => {
    fauxBd();
    const vu = await lire(projet('depot', { prefixe: 'demo' }), [
      projet('autre', { prefixe: 'abc' }),
    ]);
    expect(etiquettes(vu)).toEqual(['demo', 'abc']);
    expect(vu.lignes[0]?.texte).toMatch(/\+ ABC$/);
  });
});

describe('une clé grillhouse.sigle fautive se dit en alerte, le panneau ne se refuse pas', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('la clé est nommée dans l’alerte, et le préfixe des tickets reste le sigle', async () => {
    fauxBd();
    const vu = await lire(projet('depot', { prefixe: 'demo' }), [
      projet('autre', { pkg: sigle(3), prefixe: 'abc' }),
    ]);
    expect(vu.alertes.some(x => x.texte.includes('grillhouse.sigle'))).toBe(true);
    expect(etiquettes(vu)).toEqual(['demo', 'abc']);
  });

  it('le panneau d’un projet seul dit aussi la faute de sa clé', async () => {
    fauxBd();
    const vu = await lire(projet('depot', { pkg: sigle('a b'), prefixe: 'demo' }));
    expect(vu.alertes.some(x => x.texte.includes('grillhouse.sigle'))).toBe(true);
  });

  it('une clé qui se lit ne dit aucune alerte de sigle', async () => {
    fauxBd();
    const vu = await lire(projet('depot', { pkg: sigle('GH'), prefixe: 'demo' }), [
      projet('autre', { pkg: sigle('OB'), prefixe: 'abc' }),
    ]);
    expect(vu.alertes.some(x => /sigle/i.test(x.texte))).toBe(false);
  });
});

describe('deux projets affichés qui portent le même sigle se disent en alerte', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('l’alerte nomme les deux projets', async () => {
    fauxBd();
    const un = projet('depot', { pkg: sigle('XX'), prefixe: 'demo' });
    const deux = projet('autre', { pkg: sigle('XX'), prefixe: 'abc' });
    const vu = await lire(un, [deux]);
    const a = vu.alertes.find(x => /sigle/i.test(x.texte));
    expect(a?.texte).toContain(path.basename(un));
    expect(a?.texte).toContain(path.basename(deux));
    expect(a?.texte).toContain('XX');
  });

  it('un sigle qui est le préfixe d’un autre projet compte aussi', async () => {
    fauxBd();
    const un = projet('depot', { pkg: sigle('abc'), prefixe: 'demo' });
    const deux = projet('autre', { prefixe: 'abc' });
    const vu = await lire(un, [deux]);
    expect(vu.alertes.some(x => /sigle/i.test(x.texte))).toBe(true);
  });

  it('deux sigles distincts : aucune alerte', async () => {
    fauxBd();
    const vu = await lire(projet('depot', { pkg: sigle('XX'), prefixe: 'demo' }), [
      projet('autre', { pkg: sigle('YY'), prefixe: 'abc' }),
    ]);
    expect(vu.alertes.some(x => /sigle/i.test(x.texte))).toBe(false);
  });
});
