// The plan of a ticket is written once, questioned once, answered once (scripts/circuit.mjs): the
// circuit holds no round of questions nor a survey of its components played again, and the
// explorateur has four templates of its own in the skill of the supervisor.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARRETS } from '../../scripts/etapes.mjs';

const RACINE = path.resolve(__dirname, '../../../..');
const CIRCUIT = readFileSync(path.join(RACINE, 'packages/grillhouse/scripts/circuit.mjs'), 'utf8');

describe('les tours de questions, le relevé rejoué et le référent ont disparu du circuit', () => {
  it('le circuit ne nomme ni le relevé de ses composants rejoué, ni des tours de questions', () => {
    for (const nom of ['composantsManquants', 'verifierLeTitre', 'changerLePlan']) {
      expect(CIRCUIT, nom).not.toContain(nom);
    }
    // The rounds of questions, by their own name: the bound of the final pass
    // (`TOURS_DE_LA_PASSE_FINALE`) is another.
    expect(CIRCUIT).not.toMatch(/\bTOURS\b/);
    expect(ARRETS).not.toHaveProperty('composants-manquants');
  });
});

describe('les gabarits de l’explorateur', () => {
  // The fourth, the mechanical gesture of a ticket its plan judges mechanical.
  it('en a quatre à lui : le plan, sa réponse unique, le tri, et le geste mécanique', () => {
    const gabarit = readFileSync(
      path.join(RACINE, 'mods/grillhouse/skills/pitmaster/references/consigne-agent.md'),
      'utf8'
    );
    const blocs = [...gabarit.matchAll(/\n## ([^\n]+)\n+```text\n([\s\S]*?)\n```/g)]
      .filter(m => m[1].startsWith('Explorateur'))
      .map(m => ({ titre: m[1], texte: m[2] }));
    expect(blocs.map(b => b.titre)).toEqual([
      'Explorateur, sur le plan (rempli par le circuit)',
      'Explorateur, sur les questions du plan (rempli par le circuit)',
      'Explorateur, sur le tri des découvertes (rempli par le circuit)',
      'Explorateur, sur le geste mécanique (rempli par le circuit)',
    ]);
    for (const champ of ['ticket', 'titre', 'description', 'contexte']) {
      expect(blocs[0].texte, champ).toContain(`{{${champ}}}`);
    }
    expect(blocs[0].texte).toContain('npx grillhouse composants-affectes {{ticket}}');
    expect(blocs[1].texte).toContain('{{questions}}');
    expect(blocs[1].texte).toContain('une seule fois');
    expect(blocs[3].texte).toContain('{{commande}}');
  });
});
