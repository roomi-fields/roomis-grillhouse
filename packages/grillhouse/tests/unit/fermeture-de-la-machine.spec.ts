// Les deux commandes qui ferment et rouvrent la machine (scripts/fermeture-de-la-machine.mjs),
// comme `cordon` et `uncordon` de kubectl : la décision de chacune sur la réservation en place, et
// les lignes qu'elle dit, ce qui tourne encore par projet et par ticket (séances : places du
// déroulé ; passes : parts), « la machine est vide » quand rien ne joue, et depuis quand dure la
// fermeture. Petits tests : fonctions pures, sans serveur ni processus.
import { describe, expect, it } from 'vitest';
import {
  decisionDeFermeture,
  decisionDeReouverture,
  direCeQuiTourne,
  direLaFermeture,
} from '../../scripts/fermeture-de-la-machine.mjs';

const H = 3_600_000;
const MAINTENANT = Date.parse('2026-11-21T10:00:00Z');
const FERMEE = { auteur: 'superviseur', jeton: 'j-sup', depuis: MAINTENANT - 3 * H };
const NUIT = { auteur: 'nuit', jeton: 'j-nuit', depuis: 1, battement: 1 };

describe('la décision de fermer la machine', () => {
  it('sans réservation : fermer', () => {
    expect(decisionDeFermeture(null)).toBe('fermer');
    expect(decisionDeFermeture(undefined)).toBe('fermer');
  });

  it('déjà fermée par le superviseur : réussit sans effet', () => {
    expect(decisionDeFermeture(FERMEE)).toBe('deja-fermee');
  });

  it('la nuit tient la machine : pas de seconde réservation', () => {
    expect(decisionDeFermeture(NUIT)).toBe('nuit-tient');
  });

  it('une réservation sans auteur est celle de la nuit', () => {
    expect(decisionDeFermeture({ jeton: 'j', depuis: 1, battement: 1 })).toBe('nuit-tient');
  });
});

describe('la décision de rouvrir la machine', () => {
  it('fermée par le superviseur : rouvrir', () => {
    expect(decisionDeReouverture(FERMEE)).toBe('rouvrir');
  });

  it('une machine ouverte : réussit sans effet', () => {
    expect(decisionDeReouverture(null)).toBe('deja-ouverte');
    expect(decisionDeReouverture(undefined)).toBe('deja-ouverte');
  });

  it('la réouverture ne lève jamais la réservation d’une nuit', () => {
    expect(decisionDeReouverture(NUIT)).toBe('nuit-tient');
    expect(decisionDeReouverture({ jeton: 'j', depuis: 1, battement: 1 })).toBe('nuit-tient');
  });
});

describe('ce qui tourne encore, par projet et par ticket', () => {
  const prises = [
    { id: 'a', ticket: 'demo-1', racine: '/depots/alpha' },
    { id: 'b', ticket: 'demo-2', racine: '/depots/alpha' },
    { id: 'c', ticket: 'bp-9', racine: '/depots/beta' },
  ];
  const parts = [
    { id: 'p1', projet: '/depots/alpha', ticket: 'demo-1', sorte: 'verifier', etat: 'tient' },
    { id: 'p2', projet: '/depots/gamma', ticket: 'g-3', sorte: 'tests', etat: 'attend' },
  ];

  it('nomme chaque projet et chaque ticket qui tourne, séances et passes comprises', () => {
    const t = direCeQuiTourne({ prises, parts }).join('\n');
    for (const x of ['alpha', 'beta', 'demo-1', 'demo-2', 'bp-9']) {
      expect(t).toContain(x);
    }
    expect(t).toMatch(/séance/);
    expect(t).toMatch(/passe/);
    expect(t).not.toMatch(/machine est vide/);
  });

  it('une passe qui attend sa part ne tourne pas : elle n’est pas comptée', () => {
    expect(direCeQuiTourne({ prises: [], parts }).join('\n')).not.toContain('g-3');
  });

  it('une séance seule suffit à dire que la machine n’est pas vide', () => {
    const t = direCeQuiTourne({ prises: [prises[2]!], parts: [] }).join('\n');
    expect(t).toContain('bp-9');
    expect(t).not.toMatch(/machine est vide/);
  });

  it('rien ne joue : « la machine est vide »', () => {
    expect(direCeQuiTourne({ prises: [], parts: [] })).toEqual(['la machine est vide']);
    expect(direCeQuiTourne({ prises: [], parts: [{ ...parts[1]! }] }).join('\n')).toMatch(
      /la machine est vide/
    );
  });
});

describe('ce que dit la commande de fermeture', () => {
  const prises = [{ id: 'a', ticket: 'demo-1', racine: '/depots/alpha' }];
  const dire = (issue: string, o: object = {}) =>
    direLaFermeture({
      issue,
      reservation: FERMEE,
      prises,
      parts: [],
      maintenant: MAINTENANT,
      ...o,
    } as Parameters<typeof direLaFermeture>[0]).join('\n');

  it('fermée à l’instant : le dit, puis ce qui tourne encore', () => {
    const t = dire('fermee', { reservation: { ...FERMEE, depuis: MAINTENANT } });
    expect(t).toMatch(/machine fermée/);
    expect(t).toContain('demo-1');
  });

  it('machine fermée et vide : « la machine est vide »', () => {
    expect(dire('fermee', { prises: [] })).toMatch(/la machine est vide/);
  });

  it('déjà fermée : le dit, depuis quand, et relit ce qui tourne', () => {
    const t = dire('deja-fermee');
    expect(t).toMatch(/déjà fermée/);
    expect(t).toMatch(/depuis 180 min|depuis 3 h/);
    expect(t).toContain('demo-1');
  });

  it('la nuit tient la machine : le dit, donne ce qui tourne, ne dit pas fermée par le superviseur', () => {
    const t = dire('nuit-tient', { reservation: NUIT });
    expect(t).toMatch(/la nuit tient la machine/);
    expect(t).toContain('demo-1');
    expect(t).not.toMatch(/fermée par le superviseur/);
  });
});

describe('ce que dit la commande de réouverture', () => {
  const dire = (issue: string) =>
    direLaFermeture({
      issue,
      reservation: issue === 'nuit-tient' ? NUIT : null,
      prises: [],
      parts: [],
      maintenant: MAINTENANT,
    } as Parameters<typeof direLaFermeture>[0]).join('\n');

  it('rouverte : le dit', () => {
    expect(dire('rouverte')).toMatch(/machine rouverte/);
  });

  it('déjà ouverte : le dit, sans effet', () => {
    expect(dire('deja-ouverte')).toMatch(/déjà ouverte/);
  });

  it('une nuit tient la machine : la réouverture le dit et ne la lève pas', () => {
    expect(dire('nuit-tient')).toMatch(/la nuit tient la machine/);
  });
});
