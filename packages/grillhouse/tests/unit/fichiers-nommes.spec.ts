// Un fichier que la description d'un ticket nomme (scripts/fichiers-nommes.mjs) : son chemin écrit
// depuis la racine dans la section « Architecture » ou dans un critère d'acceptation, entre accents
// graves ou nu. Il rend sa pièce (« ticket, § Architecture » ou « ticket, critère N »), ou null :
// un dossier parent, un nom de base seul, une autre section, un ARCHITECTURE.md, un CADRE.md ou un
// INTERFACE.md (qui reviennent au responsable) ne sont pas nommés. Tests petits.
import { describe, expect, it } from 'vitest';
import { fichierNommeAuTicket } from '../../scripts/fichiers-nommes.mjs';

const nomme = fichierNommeAuTicket as (
  description: string,
  chemin: string
) => { piece: string } | null;

const DESCRIPTION = `Demande du responsable.

## Architecture

- Modèle mûr : la charte commune.
- Adresse : \`mods/grillhouse/hooks/register.tsx\`, puis packages/grillhouse/scripts/circuit.mjs.

## Critères d'acceptation

1. Une écriture hors du plan étend le plan sans arrêt.
2. Le gabarit \`templates/projet/CLAUDE.md\` dit la règle,
   et le test packages/grillhouse/tests/nuit/essai.nuit.test.ts la prouve.
3. Un critère sans fichier.

## Notes

Voir \`docs/notes/seul.md\` et le dossier packages/grillhouse/scripts.
`;

describe('un fichier que la description du ticket nomme', () => {
  it('nommé entre accents graves dans la section Architecture : sa pièce est cette section', () => {
    expect(nomme(DESCRIPTION, 'mods/grillhouse/hooks/register.tsx')).toEqual({
      piece: 'ticket, § Architecture',
    });
  });

  it('nommé nu dans la section Architecture, suivi d’un point : sa pièce est cette section', () => {
    expect(nomme(DESCRIPTION, 'packages/grillhouse/scripts/circuit.mjs')).toEqual({
      piece: 'ticket, § Architecture',
    });
  });

  it('nommé dans un critère : sa pièce est le numéro du critère', () => {
    expect(nomme(DESCRIPTION, 'templates/projet/CLAUDE.md')).toEqual({
      piece: 'ticket, critère 2',
    });
  });

  it('nommé sur la ligne qui continue un critère : sa pièce est ce critère', () => {
    expect(nomme(DESCRIPTION, 'packages/grillhouse/tests/nuit/essai.nuit.test.ts')).toEqual({
      piece: 'ticket, critère 2',
    });
  });
});

describe('un fichier que la description du ticket ne nomme pas', () => {
  it('ne figure que par son dossier parent', () => {
    expect(nomme(DESCRIPTION, 'packages/grillhouse/scripts/seances.mjs')).toBeNull();
    expect(nomme(DESCRIPTION, 'mods/grillhouse/hooks/autre.tsx')).toBeNull();
  });

  it('ne figure que par son nom de base', () => {
    expect(nomme(DESCRIPTION, 'circuit.mjs')).toBeNull();
    expect(nomme(DESCRIPTION, 'register.tsx')).toBeNull();
  });

  it('ne figure que par un chemin plus long qui le contient à la fin', () => {
    expect(nomme(DESCRIPTION, 'scripts/circuit.mjs')).toBeNull();
    expect(nomme(DESCRIPTION, 'grillhouse/hooks/register.tsx')).toBeNull();
  });

  it('ne figure que dans une autre section (Notes)', () => {
    expect(nomme(DESCRIPTION, 'docs/notes/seul.md')).toBeNull();
  });

  it('a pour dossier un dossier nommé', () => {
    expect(nomme(DESCRIPTION, 'packages/grillhouse/scripts')).toBeNull();
  });

  it('n’est pas dans une description vide', () => {
    expect(nomme('', 'mods/grillhouse/hooks/register.tsx')).toBeNull();
  });
});

describe('un ARCHITECTURE.md, un CADRE.md ou un INTERFACE.md', () => {
  const NOMMES = `## Architecture

- \`packages/grillhouse/docs/ARCHITECTURE.md\`, \`docs/CADRE.md\`.

## Critères d'acceptation

1. L'interface \`packages/grillhouse/docs/INTERFACE.md\` le dit.
`;

  it.each([
    'packages/grillhouse/docs/ARCHITECTURE.md',
    'docs/CADRE.md',
    'packages/grillhouse/docs/INTERFACE.md',
  ])('%s, même nommé au ticket, n’est pas nommé', chemin => {
    expect(nomme(NOMMES, chemin)).toBeNull();
  });
});
