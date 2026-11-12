// FAITS AUJOURD'HUI dit la voie de chaque ticket fermé du jour, sa durée et ses jetons
// (scripts/tableau.mjs) : ● un circuit complet, ○ un circuit court (passé par 1.1 Geste mécanique),
// ✎ un ticket direct (étiquette `direct`, ou fermé sans aucun circuit). Chaque ligne porte
// « <durée> · <jetons> » ; un ticket direct compte sa durée de sa prise à sa fermeture, « — » sans
// prise. Les jetons sont ceux des agents que le registre rattache au ticket. Le total de l'en-tête
// reste le temps de travail des agents. La voie d'un circuit fini se lit dans ses résultats gardés
// (`.claude/worktrees/<ticket>.fiches.jsonl` de l'arbre principal) : le lancement de la séance du
// geste porte l'objet `geste`.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { assembler, LARGEUR, lignes, voiesDesCircuits } from '../../scripts/tableau.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tableau-faits-voies-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const MIN = 60_000;
const MAINTENANT = Date.parse('2026-11-12T12:00:00Z');
const JOUR = Date.parse('2026-11-12T00:00:00Z');

interface Ligne {
  texte: string;
  ton?: string;
  ticket?: string;
  section?: string;
}
const colonnes = (s: string) => [...s].length;

const T = (id: string, o: object = {}) => ({
  id,
  title: `${id.slice(5)} — Le sujet de ${id.slice(5)} — packages/x`,
  status: 'closed',
  priority: 2,
  issue_type: 'task',
  labels: [],
  started_at: '2026-11-12T09:00:00Z',
  closed_at: '2026-11-12T10:30:00Z',
  ...o,
});
const agent = (ticket: string, role: string, travail: number, jetons: number) => ({
  agent: `${ticket}-${role}`,
  ticket,
  role,
  fin: '2026-11-12T10:00:00Z',
  travail,
  jetons,
});
const plateau = (tous: object[], o: { registre?: object[]; voies?: object } = {}) =>
  assembler({
    tous,
    prefix: 'demo',
    registre: o.registre ?? [],
    vivants: [],
    circuits: [],
    maintenant: MAINTENANT,
    jour: JOUR,
    voies: o.voies ?? {},
  } as Parameters<typeof assembler>[0]);
const faits = (p: ReturnType<typeof plateau>) =>
  (lignes(p, 'depot') as Ligne[]).filter(l => l.section === 'faits');
const duTicket = (p: ReturnType<typeof plateau>, id: string) =>
  faits(p).find(l => l.ticket === id)!;

describe('le signe d’une ligne de FAITS AUJOURD’HUI dit la voie du ticket', () => {
  const REGISTRE = [agent('demo-1', 'testwriter', 20 * MIN, 120_000)];

  it('● pour un circuit complet', () => {
    const p = plateau([T('demo-1')], { registre: REGISTRE, voies: { 'demo-1': 'complet' } });
    expect(duTicket(p, 'demo-1').texte).toMatch(/^● 1 {2}Le sujet de 1 /);
  });

  it('○ pour un circuit court, passé par le geste mécanique', () => {
    const p = plateau([T('demo-2')], { voies: { 'demo-2': 'court' } });
    expect(duTicket(p, 'demo-2').texte).toMatch(/^○ 2 {2}Le sujet de 2 /);
  });

  it('✎ pour un ticket fermé sans aucun circuit', () => {
    const p = plateau([T('demo-3')]);
    expect(duTicket(p, 'demo-3').texte).toMatch(/^✎ 3 {2}Le sujet de 3 /);
  });

  it('✎ pour un ticket étiqueté `direct`, même passé par un circuit', () => {
    const p = plateau([T('demo-4', { labels: ['direct'] })], { voies: { 'demo-4': 'complet' } });
    expect(duTicket(p, 'demo-4').texte).toMatch(/^✎ 4 /);
  });

  it('une étape que le circuit a menée au registre suffit à dire un circuit complet', () => {
    const p = plateau([T('demo-5')], {
      registre: [{ ...agent('demo-5', 'circuit', 5 * MIN, 0), etape: 'controles' }],
    });
    expect(duTicket(p, 'demo-5').texte).toMatch(/^● 5 /);
  });
});

describe('chaque ligne porte « <durée> · <jetons> », les trois voies comprises', () => {
  it('un circuit : le temps de travail de ses agents et leurs jetons', () => {
    const p = plateau([T('demo-1')], {
      registre: [agent('demo-1', 'testwriter', 20 * MIN, 120_000)],
      voies: { 'demo-1': 'complet' },
    });
    expect(duTicket(p, 'demo-1').texte).toMatch(/ 20 min · 120 k$/);
  });

  it('un ticket direct : de sa prise à sa fermeture, et les jetons de ses agents', () => {
    const p = plateau([T('demo-3')], { registre: [agent('demo-3', 'explorateur', MIN, 4_000)] });
    expect(duTicket(p, 'demo-3').texte).toMatch(/ 1 h 30 · 4 k$/);
  });

  it('un ticket direct sans prise : « — », et 0 jeton sans agent', () => {
    const p = plateau([T('demo-3', { started_at: undefined })]);
    expect(duTicket(p, 'demo-3').texte).toMatch(/ — · 0$/);
  });

  it('un circuit sans temps ni jetons porte encore sa durée et ses jetons', () => {
    const p = plateau([T('demo-2')], { voies: { 'demo-2': 'court' } });
    expect(duTicket(p, 'demo-2').texte).toMatch(/ 0 min · 0$/);
  });

  it('le total du jour de l’en-tête reste le temps de travail des agents', () => {
    const p = plateau([T('demo-1'), T('demo-3')], {
      registre: [
        agent('demo-1', 'testwriter', 20 * MIN, 120_000),
        agent('demo-3', 'explorateur', MIN, 4_000),
      ],
      voies: { 'demo-1': 'complet' },
    });
    const titre = faits(p).find(l => l.texte.startsWith("FAITS AUJOURD'HUI"))!;
    expect(titre.texte).toMatch(/2 tickets · 21 min · 124 k$/);
  });

  it('chaque ligne tient dans la largeur du panneau', () => {
    const long = 'Un sujet très long qui déborde '.repeat(3);
    const p = plateau(
      [
        T('demo-1', { title: `1 — ${long} — x` }),
        T('demo-3', { title: `3 — ${long} — x`, started_at: undefined }),
      ],
      { voies: { 'demo-1': 'complet' } }
    );
    for (const l of faits(p)) {
      expect(colonnes(l.texte), l.texte).toBeLessThanOrEqual(LARGEUR);
    }
  });
});

// The main tree of trial, its kept results under .claude/worktrees/.
const RACINE = path.join(ESSAIS, 'depot');
const COPIES = path.join(RACINE, '.claude', 'worktrees');
mkdirSync(COPIES, { recursive: true });

describe('la voie d’un circuit fini se lit dans ses résultats gardés', () => {
  const garder = (ticket: string, lignesDuFichier: object[]) =>
    writeFileSync(
      path.join(COPIES, `${ticket}.fiches.jsonl`),
      lignesDuFichier.map(x => JSON.stringify(x)).join('\n') + '\n'
    );
  garder('demo-1', [
    { role: 'explorateur', lancement: { role: 'explorateur', seance: 's1' } },
    { role: 'testwriter', lancement: { role: 'testwriter', seance: 's2' } },
  ]);
  garder('demo-2', [
    { role: 'explorateur', lancement: { role: 'explorateur', seance: 's1' } },
    { role: 'explorateur', lancement: { role: 'explorateur', seance: 's3', objet: 'geste' } },
  ]);
  writeFileSync(path.join(COPIES, 'demo-6.fiches.jsonl'), 'pas du json\n');

  it('un lancement d’objet `geste` dit un circuit court, sinon le circuit est complet', () => {
    expect(voiesDesCircuits(RACINE, ['demo-1', 'demo-2', 'demo-3'])).toEqual({
      'demo-1': 'complet',
      'demo-2': 'court',
    });
  });

  it('une ligne illisible ne casse pas la lecture : le circuit reste complet', () => {
    expect(voiesDesCircuits(RACINE, ['demo-6'])).toEqual({ 'demo-6': 'complet' });
  });
});
