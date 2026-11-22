// Ce que l'extension aux tests d'un lecteur ne change pas : un rouge sans lecteur à étendre aux
// tests ne demande aucune extension, le rouge de code d'un paquet hors du plan arrête la passe
// finale, et la liste des tests étendus ne fait pas entrer le lecteur dans le titre d'un plan
// réécrit.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { architecture } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as circuit from '../../scripts/circuit.mjs';
import * as transitions from '../../scripts/transitions.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'lecteur-hors-plan-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

interface Etat {
  etape: string;
  tentative: number;
  rapport: string | null;
  finale: boolean;
}
interface Decision {
  besoin?: { fait: string };
  arret?: { nom: string };
}
const transition = transitions.transition as (e: {
  etat: Etat;
  ticket: object;
  faits: Record<string, unknown>;
}) => Decision;
const CONTROLES = (transitions as unknown as Record<string, string>).CONTROLES as string;
const avecLesEtendus = circuit.avecLesEtendus as (ctx: object, paquets: string[]) => string[];

const TICKET = { id: 'essai-1', paquets: ['packages/a'], sorte: null, copie: '/copie' };
const ROUGE = {
  rouge: true,
  aRepasser: false,
  arbitrer: false,
  auDeveloppeur: true,
  texte: 'texte',
  complet: 'complet',
  sansListe: 'sans liste',
  avertissements: '',
  rouges: [{ paquet: 'b', texte: 'rouge' }],
  resume: 'résumé',
  horsTitre: [] as string[],
  ecartesRouges: [] as string[],
  testsLecteurs: [] as string[],
  lieux: [{ fichier: 'packages/b/x.ts', gardes: [] }],
  references: [],
  tous: [{ paquet: 'b', texte: 'rouge' }],
  notes: [],
};
function jouer(k: object, finale: boolean) {
  const lus: Record<string, unknown> = {};
  const faits: Record<string, unknown> = {
    controles: k,
    mecanique: false,
    portes: { tests: [], code: ['packages/b/x.ts'], lecteurs: [] },
    etendreAuxEcartes: null,
    etendreAuxTests: null,
    ...(finale ? { passeFinale: { arbre: 'T', restreinte: null }, referencesDesRouges: [] } : {}),
  };
  const demandes: string[] = [];
  const etat = { etape: CONTROLES, tentative: 1, rapport: null, finale };
  for (let i = 0; i < 50; i++) {
    const d = transition({ etat, ticket: TICKET, faits: lus });
    if (!d.besoin) {
      return { d, demandes };
    }
    demandes.push(d.besoin.fait);
    lus[d.besoin.fait] = faits[d.besoin.fait];
  }
  throw new Error('trop de faits');
}

describe('l’extension aux tests d’un lecteur laisse le reste du circuit comme avant', () => {
  it('un rouge sans lecteur à étendre aux tests ne demande aucune extension', () => {
    const { demandes } = jouer(ROUGE, false);
    expect(demandes).not.toContain('etendreAuxTests');
  });

  it('le rouge de code d’un lecteur hors du plan arrête toujours la passe finale', () => {
    const { d, demandes } = jouer(
      { ...ROUGE, auDeveloppeur: false, horsTitre: ['packages/z'] },
      true
    );
    expect(d.arret?.nom).toBe('controles');
    expect(demandes).not.toContain('etendreAuxTests');
  });

  it('la liste des tests étendus ne fait pas entrer le lecteur dans le titre du plan réécrit', () => {
    const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
    for (const [rel, texte] of Object.entries({
      'package.json': JSON.stringify({ name: 'essai', workspaces: ['packages/*'] }),
      'docs/ARCHITECTURE.md': architecture(),
      'packages/a/package.json': JSON.stringify({ name: '@essai/a' }),
      'packages/b/package.json': JSON.stringify({ name: '@essai/b' }),
      'fiches.jsonl': JSON.stringify({
        role: 'circuit',
        plan: { empreinte: 'e', testsEtendus: ['packages/b'] },
      }),
    })) {
      mkdirSync(path.dirname(path.join(racine, rel)), { recursive: true });
      writeFileSync(path.join(racine, rel), texte);
    }
    const ctx = {
      ticket: 'demo-1',
      racine,
      copie: racine,
      fiches: path.join(racine, 'fiches.jsonl'),
      rendus: [],
    };
    expect(avecLesEtendus(ctx, ['packages/a'])).toEqual(['packages/a']);
  });
});
