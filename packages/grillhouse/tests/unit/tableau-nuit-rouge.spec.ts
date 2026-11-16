// L'alerte « nuit rouge » du panneau (scripts/tableau.mjs) suit le verdict de la dernière nuit du
// projet (`verdictDeLaNuit` de `assembler` : `'rouge'`, `'vert'` ou null quand aucune nuit n'est
// connue ou que le verdict ne se lit pas), jamais la seule présence d'un ticket `nuit` ouvert.
// Chaque ticket `nuit` ouvert est nommé par l'alerte quand elle se pose.
import { describe, expect, it } from 'vitest';
import { assembler, ensemble, lignes } from '../../scripts/tableau.mjs';

const MIN = 60_000;
const MAINTENANT = Date.parse('2026-11-16T12:00:00Z');

interface Alerte {
  etat: string;
  texte: string;
  sujet?: string;
  numero?: string;
  id?: string;
}
interface Ligne {
  texte: string;
  ton?: string;
}

const nuit = (id: string, title: string, o: object = {}) => ({
  id,
  title,
  status: 'open',
  priority: 1,
  issue_type: 'bug',
  labels: ['nuit'],
  ...o,
});
const ROUGE = nuit('demo-87', '87 — La nuit est rouge depuis la nuit du 2026-10-17 — parent', {
  created_at: '2026-10-17T01:05:00Z',
});
const POUSSEE = nuit('demo-88', '88 — La poussée de la nuit est refusée sur def5678 — parent');

const plateau = (
  tous: object[],
  verdictDeLaNuit: 'rouge' | 'vert' | null | undefined,
  prefix = 'demo'
) =>
  assembler({
    tous,
    prefix,
    registre: [],
    vivants: [],
    maintenant: MAINTENANT,
    jour: MAINTENANT - 24 * 60 * MIN,
    ...(verdictDeLaNuit === undefined ? {} : { verdictDeLaNuit }),
  } as Parameters<typeof assembler>[0]) as { alertes: Alerte[] };
const nuitRouge = (t: { alertes: Alerte[] }) => t.alertes.filter(a => a.etat === 'nuitRouge');

describe('l’alerte « nuit rouge » suit le verdict de la dernière nuit', () => {
  it('un verdict rouge pose l’alerte, qui nomme le ticket nuit ouvert', () => {
    const a = nuitRouge(plateau([ROUGE], 'rouge'));
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({
      sujet: 'Nuit rouge depuis le 17/10',
      numero: '87',
      id: 'demo-87',
    });
    expect(a[0].texte).toBe('Nuit rouge depuis le 17/10 87');
  });

  it('un verdict vert fait tomber l’alerte même si un ticket nuit reste ouvert', () => {
    expect(nuitRouge(plateau([ROUGE], 'vert'))).toEqual([]);
  });

  it('un verdict vert fait tomber l’alerte de chaque ticket nuit ouvert, la poussée refusée comprise', () => {
    expect(nuitRouge(plateau([ROUGE, POUSSEE], 'vert'))).toEqual([]);
  });

  it('un verdict vert sans ticket nuit ne pose aucune alerte', () => {
    expect(nuitRouge(plateau([], 'vert'))).toEqual([]);
  });

  it('sans dernière nuit connue, aucune alerte, ticket nuit ouvert ou non', () => {
    expect(nuitRouge(plateau([ROUGE], null))).toEqual([]);
    expect(nuitRouge(plateau([ROUGE], undefined))).toEqual([]);
    expect(nuitRouge(plateau([], null))).toEqual([]);
  });

  it('le panneau ne ferme ni ne change le ticket nuit sur le vert : il reste ouvert, étiqueté', () => {
    const tous = [ROUGE];
    plateau(tous, 'vert');
    expect(tous[0]).toMatchObject({ status: 'open', labels: ['nuit'] });
  });
});

describe('le texte de l’alerte rouge', () => {
  it('chaque ticket nuit ouvert a son alerte, sujet puis numéro', () => {
    const a = nuitRouge(plateau([ROUGE, POUSSEE], 'rouge'));
    expect(a.map(x => x.texte)).toEqual([
      'Nuit rouge depuis le 17/10 87',
      expect.stringMatching(/^La poussée de la nuit est refusée sur def5678 88$/),
    ]);
    expect(a.map(x => x.id)).toEqual(['demo-87', 'demo-88']);
  });

  it('un ticket nuit fermé n’est pas nommé', () => {
    const a = nuitRouge(plateau([{ ...ROUGE, status: 'closed' }, POUSSEE], 'rouge'));
    expect(a.map(x => x.numero)).toEqual(['88']);
  });

  it('un ticket nuit en cours est nommé', () => {
    const a = nuitRouge(plateau([{ ...ROUGE, status: 'in_progress' }], 'rouge'));
    expect(a.map(x => x.numero)).toEqual(['87']);
  });

  it('un verdict rouge sans ticket nuit ouvert pose une alerte « Nuit rouge » sans ticket', () => {
    const a = nuitRouge(plateau([], 'rouge'));
    expect(a).toHaveLength(1);
    expect(a[0].texte).toBe('Nuit rouge');
    expect(a[0].id).toBeUndefined();
    expect(a[0].numero).toBeUndefined();
  });

  it('un verdict rouge avec seulement un ticket nuit fermé pose l’alerte sans ticket', () => {
    const a = nuitRouge(plateau([{ ...ROUGE, status: 'closed' }], 'rouge'));
    expect(a.map(x => x.texte)).toEqual(['Nuit rouge']);
  });

  it('l’alerte sans ticket s’affiche en rouge sur le panneau, signe 🌙', () => {
    const t = plateau([], 'rouge');
    const l = (lignes(t, 'demo') as Ligne[]).find(x => x.texte.startsWith('🌙'));
    expect(l?.texte.trimEnd()).toBe('🌙 Nuit rouge');
    expect(l?.ton).toBe('alerte');
  });

  it('un ticket sans étiquette nuit ne pose aucune alerte, même sur un verdict rouge', () => {
    const autre = nuit('demo-5', '5 — Un sujet — packages/x', { labels: ['circuit'] });
    expect(nuitRouge(plateau([autre], 'vert'))).toEqual([]);
    expect(nuitRouge(plateau([autre], 'rouge')).map(x => x.texte)).toEqual(['Nuit rouge']);
  });
});

describe('sur un panneau de plusieurs projets, chaque alerte suit le verdict de son projet', () => {
  const AA_ROUGE = expect.stringMatching(/^🌙 \[AA\] La nuit est rouge \S+$/) as string;
  const lignesDe = (a: object, b: object, inverse = false) =>
    (
      lignes(
        ensemble(
          (inverse
            ? [
                { etiquette: 'BB', t: b },
                { etiquette: 'AA', t: a },
              ]
            : [
                { etiquette: 'AA', t: a },
                { etiquette: 'BB', t: b },
              ]) as Parameters<typeof ensemble>[0]
        ),
        'aa + bb'
      ) as Ligne[]
    )
      .filter(l => l.texte.startsWith('🌙'))
      .map(l => l.texte.trimEnd().replace(/ +/g, ' '));

  it('un projet rouge et un projet vert, chacun avec un ticket nuit ouvert : seule l’alerte du rouge', () => {
    const aa = plateau([nuit('AA-1', '1 — La nuit est rouge — x')], 'rouge', 'AA');
    const bb = plateau([nuit('BB-2', '2 — La nuit est rouge — x')], 'vert', 'BB');
    expect(lignesDe(aa, bb)).toEqual([AA_ROUGE]);
    expect(lignesDe(aa, bb, true)).toEqual([AA_ROUGE]);
  });

  it('un projet rouge sans ticket nuit n’emprunte pas le ticket d’un projet vert', () => {
    const aa = plateau([], 'rouge', 'AA');
    const bb = plateau([nuit('BB-2', '2 — La nuit est rouge — x')], 'vert', 'BB');
    expect(lignesDe(aa, bb)).toEqual(['🌙 [AA] Nuit rouge']);
    expect(lignesDe(aa, bb, true)).toEqual(['🌙 [AA] Nuit rouge']);
  });

  it('un projet sans nuit connue ne prend pas le verdict de l’autre', () => {
    const aa = plateau([nuit('AA-1', '1 — La nuit est rouge — x')], 'rouge', 'AA');
    const bb = plateau([nuit('BB-2', '2 — La nuit est rouge — x')], null, 'BB');
    expect(lignesDe(aa, bb)).toEqual([AA_ROUGE]);
  });

  it('deux projets rouges : chacun son alerte', () => {
    const aa = plateau([nuit('AA-1', '1 — La nuit est rouge — x')], 'rouge', 'AA');
    const bb = plateau([], 'rouge', 'BB');
    expect(lignesDe(aa, bb)).toEqual([AA_ROUGE, '🌙 [BB] Nuit rouge']);
  });
});
