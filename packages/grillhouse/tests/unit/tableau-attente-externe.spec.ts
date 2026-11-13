/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
// Le tableau d'un projet nomme ce qu'attend un ticket bloqué par un autre projet : un ticket qui
// dépend de `external:<projet>:<capacité>` est « bloqué » et sa ligne dit « attend <projet>:<capacité> »,
// tant que le fournisseur n'a pas livré la capacité (un ticket fermé portant `provides:<capacité>`,
// lu dans `externes`, les tickets de chaque projet fournisseur par son nom). Livrée, le ticket est
// en attente de départ, non bloqué. Un projet fournisseur que la configuration ne résout pas
// (absent de `externes`) laisse le ticket bloqué, l'attente nommée.
import { describe, expect, it } from 'vitest';
import { assembler, lignes } from '../../scripts/tableau.mjs';

const MAINTENANT = Date.parse('2026-11-12T12:00:00Z');
const JOUR = Date.parse('2026-11-12T00:00:00Z');

const T = (id: string, o: object = {}) => ({
  id,
  title: `${id.slice(5)} — Sujet ${id.slice(5)} — packages/x`,
  status: 'open',
  priority: 2,
  issue_type: 'task',
  labels: ['circuit'],
  parent: 'demo-e',
  ...o,
});
// Les tickets d'un projet se rangent sous un chantier (une épique en cours, que le tableau déplie).
const EPIQUE = {
  id: 'demo-e',
  title: 'e — Le chantier',
  status: 'in_progress',
  priority: 2,
  issue_type: 'epic',
  labels: ['circuit'],
};
const attend = (...cibles: string[]) =>
  cibles.map(c => ({ type: 'blocks', depends_on_id: `external:${c}` }));
const fournisseur = (labels: string[], status = 'closed') => ({
  id: 'ob-1',
  status,
  labels,
  priority: 2,
  issue_type: 'task',
});

const plateau = (tous: object[], externes?: object) =>
  assembler({
    tous: [EPIQUE, ...tous],
    prefix: 'demo',
    registre: [],
    vivants: [],
    maintenant: MAINTENANT,
    jour: JOUR,
    ...(externes === undefined ? {} : { externes }),
  });
// La ligne du ticket <id> dans l'arbre du chantier, chaque groupe replié déplié sur place.
const ligneDe = (t: unknown, id: string) => {
  type L = { texte: string; ticket?: string; groupe?: string };
  const groupes: Record<string, L[]> = {};
  const vue = (lignes(t, 'demo', 52, groupes) as L[]).flatMap(l =>
    l.groupe ? groupes[l.groupe] : [l]
  );
  return vue.find(l => l.ticket === id);
};
const bloques = (t: { global: { compteurs: { bloques: number } } }) => t.global.compteurs.bloques;

describe('le tableau nomme ce qu’un ticket attend d’un autre projet', () => {
  it('un ticket dont la capacité n’est pas livrée est bloqué : « attend <projet>:<capacité> »', () => {
    const t = plateau([T('demo-1', { dependencies: attend('osc-bridge:X') })], {
      'osc-bridge': [fournisseur(['export:X'])],
    });
    expect(bloques(t as never)).toBe(1);
    expect(ligneDe(t, 'demo-1')?.texte).toContain('attend osc-bridge:X');
  });

  it('un fournisseur dont le ticket n’est pas fermé : la capacité reste attendue', () => {
    const t = plateau([T('demo-1', { dependencies: attend('osc-bridge:X') })], {
      'osc-bridge': [fournisseur(['export:X', 'provides:X'], 'open')],
    });
    expect(ligneDe(t, 'demo-1')?.texte).toContain('attend osc-bridge:X');
  });

  it('une capacité livrée (provides:) ne bloque plus : le ticket n’est plus compté bloqué', () => {
    const t = plateau([T('demo-1', { dependencies: attend('osc-bridge:X') })], {
      'osc-bridge': [fournisseur(['export:X', 'provides:X'])],
    });
    expect(bloques(t as never)).toBe(0);
    expect(ligneDe(t, 'demo-1')?.texte ?? '').not.toContain('attend osc-bridge:X');
  });

  it('plusieurs capacités attendues : chacune est nommée', () => {
    const t = plateau([T('demo-1', { dependencies: attend('osc-bridge:X', 'osd:Y') })], {
      'osc-bridge': [],
      osd: [],
    });
    const texte = ligneDe(t, 'demo-1')?.texte ?? '';
    expect(texte).toContain('osc-bridge:X');
    expect(texte).toContain('osd:Y');
  });

  it('une seule capacité livrée sur deux : l’autre reste nommée, la livrée disparaît', () => {
    const t = plateau([T('demo-1', { dependencies: attend('osc-bridge:X', 'osd:Y') })], {
      'osc-bridge': [fournisseur(['export:X', 'provides:X'])],
      osd: [],
    });
    const texte = ligneDe(t, 'demo-1')?.texte ?? '';
    expect(texte).toContain('osd:Y');
    expect(texte).not.toContain('osc-bridge:X');
  });

  it('un projet que la configuration ne résout pas : le ticket est bloqué, l’attente nommée', () => {
    const t = plateau([T('demo-1', { dependencies: attend('osc-bridge:X') })], {});
    expect(bloques(t as never)).toBe(1);
    expect(ligneDe(t, 'demo-1')?.texte).toContain('attend osc-bridge:X');
  });

  it('sans `externes` donné, une dépendance externe bloque aussi, jamais un départ en silence', () => {
    const t = plateau([T('demo-1', { dependencies: attend('osc-bridge:X') })]);
    expect(bloques(t as never)).toBe(1);
    expect(ligneDe(t, 'demo-1')?.texte).toContain('attend osc-bridge:X');
  });

  it('une dépendance interne ouverte se dit toujours par son numéro', () => {
    const t = plateau([
      T('demo-1'),
      T('demo-2', { dependencies: [{ type: 'blocks', depends_on_id: 'demo-1' }] }),
    ]);
    expect(ligneDe(t, 'demo-2')?.texte).toContain('attend 1');
  });
});
