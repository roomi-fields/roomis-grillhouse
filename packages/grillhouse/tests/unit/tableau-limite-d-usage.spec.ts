// Le tableau d'un circuit reporté pour la limite d'usage (scripts/tableau.mjs) : la raison gardée
// du report dans la mémoire du circuit (`report: { raison: 'limite-d-usage', reprise }`, l'heure de
// reprise en ms, lue sur le circuit comme le serveur le donne) se montre, « limite d'usage » et
// l'heure de reprise, sur la ligne du circuit ; un circuit sans report garde sa ligne, et un
// ticket reporté à une heure par une personne (`deferred`) garde son affichage. Tests petits.
import { describe, expect, it } from 'vitest';
import { assembler, lignes } from '../../scripts/tableau.mjs';
import { circuitLu } from './tableau-essai.js';

const MAINTENANT = Date.parse('2026-11-19T22:00:00Z');
const REPRISE = Date.parse('2026-11-20T01:00:00Z');

interface Ligne {
  texte: string;
  ticket?: string;
  groupe?: string;
}
const T = (id: string, o: object = {}) => ({
  id,
  title: `${id.slice(5)} — Le sujet — packages/demo`,
  status: 'in_progress',
  priority: 2,
  issue_type: 'task',
  started_at: '2026-11-19T20:00:00Z',
  labels: ['circuit'],
  ...o,
});
const plateau = (tous: object[], circuits: object[]) =>
  assembler({
    tous,
    prefix: 'demo',
    registre: [],
    vivants: [],
    circuits,
    maintenant: MAINTENANT,
    jour: MAINTENANT - 24 * 3_600_000,
  });
const ligneDe = (t: unknown, id: string) => {
  const groupes: Record<string, Ligne[]> = {};
  const vue = (lignes(t, 'demo', 120, groupes) as Ligne[]).flatMap(l =>
    l.groupe ? (groupes[l.groupe] ?? []) : [l]
  );
  return vue.find(l => l.ticket === id)?.texte ?? '';
};

// L'heure de reprise en heure locale de la machine, formatée comme le tableau : le test ne
// dépend pas du fuseau.
const heureLocale = (ms: number) =>
  new Date(ms).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
const REPRISE_B = Date.parse('2026-11-20T05:30:00Z');

describe('le circuit reporté pour la limite d’usage sur le tableau', () => {
  it('montre « limite d’usage » et l’heure de reprise', () => {
    const circuit = circuitLu('demo-5', {
      vivant: true,
      report: { raison: 'limite-d-usage', reprise: REPRISE },
    });
    const texte = ligneDe(plateau([T('demo-5')], [circuit]), 'demo-5');
    expect(texte).toMatch(/limite d['’]usage/);
    expect(texte).toContain(heureLocale(REPRISE));
  });

  it('montre l’heure de reprise de chaque circuit reporté, la sienne', () => {
    const a = circuitLu('demo-5', {
      vivant: true,
      report: { raison: 'limite-d-usage', reprise: REPRISE },
    });
    const b = circuitLu('demo-6', {
      vivant: true,
      report: { raison: 'limite-d-usage', reprise: REPRISE_B },
    });
    const t = plateau([T('demo-5'), T('demo-6')], [a, b]);
    expect(ligneDe(t, 'demo-5')).toContain(heureLocale(REPRISE));
    expect(ligneDe(t, 'demo-6')).toContain(heureLocale(REPRISE_B));
    expect(ligneDe(t, 'demo-6')).not.toContain(heureLocale(REPRISE));
  });

  it('ne dit rien de la limite d’un circuit sans report', () => {
    const circuit = circuitLu('demo-5', { vivant: true });
    const texte = ligneDe(plateau([T('demo-5')], [circuit]), 'demo-5');
    expect(texte).not.toMatch(/limite d['’]usage/);
  });
});

describe('un report à une heure demandé par une personne', () => {
  it('garde son affichage : aucune limite d’usage', () => {
    const t = plateau(
      [T('demo-7', { status: 'deferred', defer_until: '2026-11-20T08:00:00Z' })],
      [circuitLu('demo-7', { vivant: false })]
    );
    expect(ligneDe(t, 'demo-7')).not.toMatch(/limite d['’]usage/);
  });
});
