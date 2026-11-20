// Une écriture hors du plan dans un fichier que la description du ticket nomme (sa section
// « Architecture » ou un critère d'acceptation, `fichierNommeAuTicket`) étend le plan au paquet de
// ce fichier sans arrêt : `seanceLancee` rend l'extension `{ etendre: { paquet, chemin, piece } }`,
// que le circuit écrit au ticket avec sa pièce. Une écriture d'un fichier que le ticket ne nomme
// pas, d'un fichier de la racine du dépôt, ou d'un ARCHITECTURE.md, d'un CADRE.md ou d'un
// INTERFACE.md monte comme avant : l'arrêt « hors-plan ». Tests petits.
import { describe, expect, it } from 'vitest';
import { seanceLancee } from '../../scripts/seances.mjs';

interface Ecriture {
  chemin: string;
  paquet: string;
  racine: boolean;
}
const lancee = seanceLancee as (ctx: object, role: string, r: object) => unknown;

const DESCRIPTION = `## Architecture

- Adresse : \`mods/grillhouse/hooks/register.tsx\`, \`package.json\`, \`packages/grillhouse/docs/ARCHITECTURE.md\`.

## Critères d'acceptation

1. Le gabarit \`templates/projet/CLAUDE.md\` le dit.

## Notes

Voir \`packages/web/src/notes.ts\`.
`;

const contexte = (description = DESCRIPTION) => ({
  rendus: [] as object[],
  paquets: ['packages/autre'],
  ticket: 'x-1',
  journal: '/nonexistent',
  bd: () => ({ status: 0, stdout: JSON.stringify([{ description }]), stderr: '' }),
});
const ecriture = (chemin: string, paquet: string): Ecriture => ({
  chemin,
  paquet,
  racine: paquet === 'la racine du dépôt',
});
const marque = (e: Ecriture) =>
  `⛔ hors-plan — ${e.chemin} est dans ${e.paquet}, hors des paquets du plan (packages/autre).`;
const jouer = (e: Ecriture, description?: string) => {
  try {
    return {
      rendu: lancee(contexte(description), 'testwriter', { horsPlan: marque(e), ecriture: e }),
    };
  } catch (arret) {
    return { arret: arret as { nom: string } };
  }
};

describe('une écriture hors du plan dans un fichier que le ticket nomme', () => {
  it('étend le plan au paquet du fichier, avec la pièce de la section Architecture, sans arrêt', () => {
    const { rendu, arret } = jouer(
      ecriture('mods/grillhouse/hooks/register.tsx', 'mods/grillhouse')
    );
    expect(arret).toBeUndefined();
    expect(rendu).toMatchObject({
      etendre: {
        paquet: 'mods/grillhouse',
        chemin: 'mods/grillhouse/hooks/register.tsx',
        piece: 'ticket, § Architecture',
      },
    });
  });

  it('étend le plan avec la pièce du critère qui nomme le fichier', () => {
    const { rendu, arret } = jouer(ecriture('templates/projet/CLAUDE.md', 'templates/projet'));
    expect(arret).toBeUndefined();
    expect(rendu).toMatchObject({
      etendre: { paquet: 'templates/projet', piece: 'ticket, critère 1' },
    });
  });
});

describe('une écriture hors du plan que le circuit ne règle pas seul', () => {
  it('monte dans un fichier que le ticket ne nomme pas', () => {
    const { arret } = jouer(ecriture('mods/grillhouse/hooks/autre.tsx', 'mods/grillhouse'));
    expect(arret).toMatchObject({ nom: 'hors-plan' });
  });

  it('monte dans un fichier que le ticket ne nomme que dans ses Notes', () => {
    const { arret } = jouer(ecriture('packages/web/src/notes.ts', 'packages/web'));
    expect(arret).toMatchObject({ nom: 'hors-plan' });
  });

  it('monte dans un fichier nommé que tient la racine du dépôt', () => {
    const { arret } = jouer(ecriture('package.json', 'la racine du dépôt'));
    expect(arret).toMatchObject({ nom: 'hors-plan' });
  });

  it('monte dans un ARCHITECTURE.md, même nommé au ticket', () => {
    const { arret } = jouer(
      ecriture('packages/grillhouse/docs/ARCHITECTURE.md', 'packages/grillhouse')
    );
    expect(arret).toMatchObject({ nom: 'hors-plan' });
  });
});

describe('une séance sans écriture hors du plan', () => {
  it('ne rend aucune extension', () => {
    expect(lancee(contexte(), 'testwriter', { seance: 0, code: 0 })).toBeUndefined();
  });
});
