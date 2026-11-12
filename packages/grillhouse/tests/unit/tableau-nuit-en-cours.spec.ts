// La nuit en cours sur le panneau (scripts/tableau.mjs) : la nuit que joue le déroulé des nuits de
// la machine (src/temporal/nuits/, `enCours` et `depuis` de sa requête `etatDesNuits`) charge la
// machine ; une ligne d'AGENTS, sous celle des places, la montre, « 🌙 nuit · <projet> · depuis
// <durée> ». Le panneau reçoit la nuit lue dans `nuit` ; une lecture qui échoue ne montre aucune
// nuit, et le reste du panneau se lit.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { assembler, LARGEUR, lignes, tableau, TONS } from '../../scripts/tableau.mjs';
import { nuitDuServeur } from '../../scripts/circuits-du-serveur.mjs';
import { aucunCircuit } from './tableau-essai.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tableau-nuit-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const MIN = 60_000;
const MAINTENANT = Date.parse('2026-11-12T02:00:00Z');

interface Ligne {
  texte: string;
  ton?: string;
  section?: string;
}
const colonnes = (s: string) => [...s].length + (s.match(/[🔒⏳💤🌙]/gu)?.length ?? 0);

const PLACES = {
  prises: 1,
  plafond: 3,
  charge: 11.2,
  coeurs: 12,
  memoireGo: 9,
  memoireTotaleGo: 30,
  attentes: [],
};
const plateau = (o: { nuit?: object | null; places?: object | null } = {}) =>
  assembler({
    tous: [],
    prefix: 'demo',
    registre: [],
    vivants: [],
    circuits: [],
    maintenant: MAINTENANT,
    jour: MAINTENANT - 2 * 60 * MIN,
    machine: null,
    places: o.places === undefined ? PLACES : o.places,
    nuit: o.nuit ?? null,
  } as Parameters<typeof assembler>[0]);
const agents = (p: ReturnType<typeof plateau>) =>
  (lignes(p, 'depot') as Ligne[]).filter(l => l.section === 'agents');
const tete = (a: Ligne[]) => a.slice(a.findIndex(x => x.texte.startsWith('AGENTS')) + 1);

describe('la nuit en cours dans AGENTS', () => {
  it('« 🌙 nuit · <projet> · depuis <durée> », juste sous la ligne des places', () => {
    const nuit = { racine: '/home/x/dev/bpscript', depuis: MAINTENANT - 42 * MIN };
    const [places, ligne] = tete(agents(plateau({ nuit })));
    expect(places.texte).toMatch(/^Places /);
    expect(ligne.texte).toBe('🌙 nuit · bpscript · depuis 42 min');
    expect(ligne.ton).toBe(TONS.nuitEnCours);
    expect(TONS.nuitEnCours).toBe('actif');
  });

  it('une nuit de plus d’une heure dit ses heures', () => {
    const nuit = { racine: '/d/kanopi', depuis: MAINTENANT - 75 * MIN };
    expect(tete(agents(plateau({ nuit })))[1].texte).toBe('🌙 nuit · kanopi · depuis 1 h 15');
  });

  it('sans les places, la nuit tient la tête d’AGENTS', () => {
    const nuit = { racine: '/d/kanopi', depuis: MAINTENANT - 5 * MIN };
    expect(tete(agents(plateau({ nuit, places: null })))[0].texte).toBe(
      '🌙 nuit · kanopi · depuis 5 min'
    );
  });

  it('sans nuit en cours, aucune ligne de nuit', () => {
    expect(agents(plateau()).some(l => l.texte.startsWith('🌙 nuit'))).toBe(false);
  });

  it('la ligne tient dans la largeur du panneau, un nom de projet long compris', () => {
    const nuit = { racine: `/d/${'un-projet-au-nom-tres-long-'.repeat(3)}`, depuis: MAINTENANT };
    const ligne = agents(plateau({ nuit })).find(l => l.texte.startsWith('🌙 nuit'));
    expect(ligne).toBeDefined();
    expect(colonnes(ligne!.texte), ligne!.texte).toBeLessThanOrEqual(LARGEUR);
  });
});

describe('la lecture de la nuit par le tableau', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  // A fake `bd` on the PATH that gives no ticket, and an empty register.
  const faux = () => {
    const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
    writeFileSync(
      path.join(bin, 'bd'),
      `#!/bin/sh\ncase "$1" in\n  config) echo demo ;;\n  *) echo '[]' ;;\nesac\n`,
      { mode: 0o755 }
    );
    writeFileSync(path.join(bin, 'registre.jsonl'), '');
    vi.stubEnv('PATH', `${bin}:${process.env.PATH}`);
    vi.stubEnv('GRILLHOUSE_REGISTRE', path.join(bin, 'registre.jsonl'));
  };
  const lire = async (nuitDe: () => Promise<unknown>) => {
    faux();
    return (await tableau(mkdtempSync(path.join(ESSAIS, 'depot-')), {
      home: mkdtempSync(path.join(ESSAIS, 'home-')),
      circuitsDe: aucunCircuit,
      nuitDe,
    })) as unknown as { lignes: Ligne[] };
  };

  it('la nuit lue sur le serveur a sa ligne', async () => {
    const vu = await lire(() =>
      Promise.resolve({ racine: '/d/bpscript', depuis: Date.now() - 3 * MIN })
    );
    expect(vu.lignes.some(l => /^🌙 nuit · bpscript · depuis [34] min$/.test(l.texte))).toBe(true);
  });

  it('une lecture qui échoue ne casse pas le panneau : aucune ligne de nuit, AGENTS se lit', async () => {
    const vu = await lire(() => Promise.reject(new Error('Temporal ne répond pas')));
    expect(vu.lignes.some(l => l.texte.startsWith('AGENTS'))).toBe(true);
    expect(vu.lignes.some(l => l.texte.startsWith('🌙 nuit'))).toBe(false);
  });
});

describe('la nuit sans son début', () => {
  it('un déroulé qui ne donne pas son début montre la nuit sans durée', () => {
    const nuit = { racine: '/d/kanopi', depuis: null };
    expect(tete(agents(plateau({ nuit })))[1].texte).toBe('🌙 nuit · kanopi');
  });
});

describe('la lecture de la nuit sur le serveur', () => {
  it('hors du serveur de la machine (la CI), elle rend aucune nuit sans appeler le serveur', async () => {
    expect(await nuitDuServeur({ CI: '1' })).toBeNull();
  });
});
