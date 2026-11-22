// The stop a sheet that is not FAIT makes (scripts/circuit.mjs, `arretDe`): a developpeur or a
// testwriter BLOQUÉ stops at « hors-portee », one BESOIN at « besoin », and a developpeur FAIT that
// does not hold criteria out of the plan (`hors_plan`) stops at « hors-portee » with the answers
// `--etendre` or an amended criterion. Each stop says its fact, its piece and its question for the
// supervisor, then the agent's last handover. A FAIT whose `hors_plan` is empty is no stop (the
// table of transitions, scripts/transitions.mjs).
import { describe, expect, it } from 'vitest';
import * as circuit from '../../scripts/circuit.mjs';
import * as transitions from '../../scripts/transitions.mjs';

interface Arret {
  nom: string;
  rapport: string;
  piece: string | null;
  question: string | null;
}
const arretDe = circuit.arretDe as (ctx: object, a: object) => Arret;
const transition = transitions.transition as (e: object) => {
  besoin?: { fait: string };
  suivant?: { etape: string };
  arret?: { nom: string };
};

// A ticket whose comments hold <passations>, `{ author, text }`.
const ctx = (passations: { author: string; text: string }[] = []) => ({
  ticket: 'essai-1',
  rendus: [],
  bd: () => ({ status: 0, stdout: JSON.stringify(passations), stderr: '' }),
});
const PASSATION = [{ author: 'developpeur', text: 'Le rouge vient de la matière partagée.' }];

describe('l’arrêt d’un agent BLOQUÉ ou BESOIN', () => {
  it('un développeur BLOQUÉ s’arrête à « hors-portee », sa raison et sa passation dans le rapport, sa pièce en pièce', () => {
    const fiche = {
      statut: 'BLOQUÉ',
      piece: 'packages/forms/src/index.mjs:1',
      raison: 'la matière de test partagée attend un autre type.',
    };
    const a = arretDe(ctx(PASSATION), {
      nom: 'hors-portee',
      statut: { role: 'developpeur', tentative: 2, fiche },
    });
    expect(a.nom).toBe('hors-portee');
    expect(a.rapport).toContain(
      'Le développeur se déclare bloqué (séance 2) : la matière de test partagée attend un autre type.'
    );
    expect(a.rapport).toContain('Le circuit ne le relance pas sur ce rouge');
    expect(a.rapport).toContain('Le rouge vient de la matière partagée.');
    expect(a.piece).toBe('packages/forms/src/index.mjs:1');
  });

  it('un développeur BESOIN s’arrête à « besoin », sa question dans le rapport et comme question au superviseur', () => {
    const fiche = {
      statut: 'BESOIN',
      piece: 'packages/forms/src/index.mjs:1',
      question: 'la mesure rend-elle le double ou le triple ?',
    };
    const a = arretDe(ctx(PASSATION), {
      nom: 'besoin',
      statut: { role: 'developpeur', tentative: 1, fiche },
    });
    expect(a.nom).toBe('besoin');
    expect(a.rapport).toContain(
      'Le développeur attend une réponse (séance 1) : la mesure rend-elle le double ou le triple ?'
    );
    expect(a.question).toBe(
      'Le développeur demande : la mesure rend-elle le double ou le triple ?'
    );
    expect(a.piece).toBe('packages/forms/src/index.mjs:1');
  });

  it('un testwriter BESOIN s’arrête à « besoin » avant sa preuve, sa passation à lui, aucune sans elle', () => {
    const fiche = {
      statut: 'BESOIN',
      piece: 'packages/forms/src/index.mjs:1',
      question: 'le critère 1 vaut-il pour une valeur négative ?',
    };
    const a = arretDe(ctx(PASSATION), {
      nom: 'besoin',
      statut: { role: 'testwriter', tentative: 1, fiche },
    });
    expect(a.rapport).toContain(
      'Le testwriter attend une réponse (séance 1) : le critère 1 vaut-il'
    );
    expect(a.rapport).toContain('Sa passation :\n\naucune');
  });
});

describe('l’arrêt d’un développeur FAIT qui ne tient pas un critère hors du plan', () => {
  const fiche = {
    statut: 'FAIT',
    hors_plan: [
      {
        critere: '1',
        paquet: '030-binder',
        piece: 'packages/forms/src/index.mjs:1 rend la mesure.',
      },
      { critere: '3', paquet: '060-sheet', piece: 'packages/forms/src/index.mjs:2' },
    ],
  };
  const a = arretDe(ctx(PASSATION), { nom: 'hors-portee', horsDuPlan: { tentative: 1, fiche } });

  it('nomme chaque critère et son paquet dans le rapport et la question', () => {
    expect(a.nom).toBe('hors-portee');
    expect(a.rapport).toContain('critère 1 (030-binder), critère 3 (060-sheet)');
    expect(a.question).toContain('critère 1 (030-binder), critère 3 (060-sheet)');
  });

  it('propose les réponses : étendre le plan aux paquets nommés, ou amender le critère puis reprendre', () => {
    expect(a.question).toContain('--etendre 030-binder,060-sheet');
    expect(a.question).toContain('--reprendre');
  });

  it('prend les pièces des critères pour pièce, la passation du développeur après le rapport', () => {
    expect(a.piece).toBe(
      'packages/forms/src/index.mjs:1 rend la mesure.\npackages/forms/src/index.mjs:2'
    );
    expect(a.rapport).toContain('Le rouge vient de la matière partagée.');
  });

  it('un paquet nommé par deux critères n’est étendu qu’une fois', () => {
    const deux = arretDe(ctx(), {
      nom: 'hors-portee',
      horsDuPlan: {
        tentative: 1,
        fiche: {
          hors_plan: [
            { critere: '1', paquet: '030-binder', piece: 'p:1' },
            { critere: '2', paquet: '030-binder', piece: 'p:2' },
          ],
        },
      },
    });
    expect(deux.question).toContain('`--etendre 030-binder`');
  });
});

describe('un développeur FAIT dont les critères hors du plan sont aucun', () => {
  const faits = (hors_plan: unknown[]) => ({
    empreinteAvant: 'A',
    seance: { statut: 'FAIT', hors_plan },
    renvoi: null,
    lecture: null,
    empreinte: 'B',
  });
  const etat = { etape: 'code', tentative: 1, rapport: null, finale: false };
  const decision = (hors_plan: unknown[]) =>
    transition({
      etat: { ...etat, etape: (transitions as unknown as { CODE: string }).CODE },
      ticket: { id: 'essai-1', paquets: ['packages/a'], sorte: null, copie: '/copie' },
      faits: faits(hors_plan),
    });

  it('hors_plan vide se lit comme l’absence de la clé : le lot livré va aux contrôles, aucun arrêt', () => {
    const d = decision([]);
    expect(d.arret).toBeUndefined();
    expect(d.suivant?.etape).toBe((transitions as unknown as { CONTROLES: string }).CONTROLES);
  });

  it('un critère hors du plan, lui, arrête à « hors-portee »', () => {
    expect(decision([{ critere: '1', paquet: 'p', piece: 'x:1' }]).arret?.nom).toBe('hors-portee');
  });
});
