// The opening of a run of a direct ticket (scripts/circuit.mjs, `ouvrirJusquAuPlan`) and the field
// `circuit` of the state it writes: the label says the circuit at the first opening, a resumption
// keeps the one of the stopped state, and the sort of the ticket turns `long` and `court`. A test
// of size medium: a trial git repository, claude and the launcher stand-ins (./seance-d-essai.ts).
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi, afterEach } from 'vitest';
import * as circuit from '../../scripts/circuit.mjs';
import { monde, type Monde } from './seance-d-essai.js';

interface Etat {
  etape: string;
  circuit?: string;
  raison?: string | null;
}
type Ouverture = { code?: number; debut?: { etape: string }; plan?: unknown };
const ouvrirJusquAuPlan = circuit.ouvrirJusquAuPlan as unknown as (
  ctx: object,
  e: object | null
) => Promise<Ouverture>;
const finirLOuverture = circuit.finirLOuverture as unknown as (ctx: object, d: object) => unknown;
const appliquer = circuit.appliquer as unknown as (ctx: object, e: object) => void;
const ecrireEtat = circuit.ecrireEtat as unknown as (ctx: object, e: object) => void;

afterEach(() => vi.restoreAllMocks());

const TITRE = 'demo-1 — La mesure — packages/forms';
// The ticket of the trial world, its labels &lt;labels&gt;.
function etiquete(m: Monde, labels: string[], titre = TITRE) {
  m.ticket({ titre });
  const bd = m.ctx.bd;
  m.ctx.bd = (...a: string[]) => {
    const r = bd(...a);
    return a[0] === 'show'
      ? { ...r, stdout: JSON.stringify([{ ...(JSON.parse(r.stdout) as object[])[0], labels }]) }
      : r;
  };
}
const ouvrir = (m: Monde, e: object | null = null) => {
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  return m.jouer(() => ouvrirJusquAuPlan(m.ctx, e));
};
const etats = (m: Monde) => m.ctx.rendus.filter(e => e.genre === 'etat').map(e => e.etat as Etat);
const dernierEtat = (m: Monde) => etats(m).at(-1) as Etat;
const sorteMecanique = { genre: 'mécanique', commande: 'npm run maj', raison: 'montée' };
const planDe = (m: Monde, sorte: object) =>
  appendFileSync(
    m.ctx.fiches,
    `${JSON.stringify({
      date: '2026-11-25T00:00:00Z',
      role: 'explorateur',
      fiche: { criteres: [], paquets: ['packages/forms'], questions: [], sorte },
    })}\n`
  );

describe('l’ouverture d’un ticket direct', () => {
  it.each([[['direct']], [['direct', 'circuit']], [['circuit', 'direct']]])(
    'étiqueté %j : un circuit direct, sans plan, qui part à 3 Code',
    async labels => {
      const m = monde();
      etiquete(m, labels);
      const o = await ouvrir(m);
      expect(o.code).toBeUndefined();
      expect(o.plan).toBeNull();
      expect(o.debut?.etape).toBe('developpeur');
      expect(m.ctx.circuit).toBe('direct');
      expect(m.appels()).toBe(0);
    }
  );

  it('écrit au ticket comme un plan les paquets de son titre, résolus', async () => {
    const m = monde();
    etiquete(m, ['direct'], 'demo-1 — La mesure — packages/forms, packages/binder');
    m.ctx.paquets = ['packages/forms', 'packages/binder'];
    await ouvrir(m);
    expect(m.planEcrit()?.titre).toBe('demo-1 — La mesure — 000-forms, 030-binder');
    expect(m.ctx.paquets).toEqual(['packages/forms', 'packages/binder']);
  });

  it('un ticket étiqueté circuit seul ouvre sur le plan, au testwriter', async () => {
    const m = monde();
    etiquete(m, ['circuit']);
    const o = await ouvrir(m);
    expect(o.debut?.etape).toBe('testwriter');
    expect(o.plan).not.toBeNull();
    expect(m.ctx.circuit).not.toBe('direct');
  });

  it('une ouverture sans état arrêté lit l’étiquette : --depuis direct part à 3 Code', async () => {
    const m = monde();
    etiquete(m, ['direct']);
    m.ctx.depuis = 'direct';
    m.ctx.contexte = 'le contexte';
    const o = await ouvrir(m);
    expect(o.debut?.etape).toBe('developpeur');
    expect(m.ctx.circuit).toBe('direct');
  });

  it('refuse --depuis testwriter sur une ouverture directe sans état', async () => {
    const m = monde();
    etiquete(m, ['direct']);
    m.ctx.depuis = 'testwriter';
    m.ctx.contexte = 'le contexte';
    await expect(ouvrir(m)).rejects.toThrow(/direct/);
  });

  it('un arrêt dès l’ouverture écrit un état direct, qu’une reprise depuis direct peut rouvrir', async () => {
    const m = monde();
    etiquete(m, ['direct']);
    writeFileSync(
      path.join(m.ctx.racine, 'package.json'),
      JSON.stringify({
        name: 'essai',
        workspaces: ['packages/*'],
        grillhouse: { outils: 'faute' },
      })
    );
    const o = await ouvrir(m);
    expect(o.code).toBeGreaterThan(0);
    expect(dernierEtat(m)).toMatchObject({ circuit: 'direct', etape: 'developpeur' });
  });
});

describe('le circuit d’un ticket se fixe à sa première ouverture', () => {
  const arret = (c: string) => ({
    etape: 'developpeur',
    tentative: 1,
    rapport: null,
    finale: false,
    circuit: c,
    raison: 'besoin',
  });

  it('une reprise garde le circuit direct de l’état arrêté, sans relire l’étiquette', async () => {
    const m = monde();
    etiquete(m, ['circuit']);
    m.ctx.reprendre = true;
    const o = await ouvrir(m, arret('direct'));
    expect(o.debut?.etape).toBe('developpeur');
    expect(m.ctx.circuit).toBe('direct');
  });

  it('une reprise garde le circuit long de l’état arrêté, même étiqueté direct', async () => {
    const m = monde();
    etiquete(m, ['direct']);
    m.ctx.reprendre = true;
    await ouvrir(m, arret('long'));
    expect(m.ctx.circuit).toBe('long');
  });
});

describe('l’état écrit porte le circuit', () => {
  const ETAT = { etape: 'developpeur', tentative: 1, code: null, rapport: null };

  it.each(['long', 'court', 'direct'])('celui du circuit, %s', c => {
    const m = monde();
    m.ctx.circuit = c;
    ecrireEtat(m.ctx, ETAT);
    expect(dernierEtat(m).circuit).toBe(c);
  });

  it.each([
    { nom: 'sans sorte', sorte: null, attendu: 'long' },
    { nom: 'd’un geste mécanique', sorte: sorteMecanique, attendu: 'court' },
    {
      nom: 'd’un comportement inchangé',
      sorte: { genre: 'comportement', comportement: 'inchangé', raison: 'r' },
      attendu: 'court',
    },
    {
      nom: 'd’un comportement aux tests adaptés',
      sorte: { genre: 'comportement', comportement: 'tests-adaptés', raison: 'r' },
      attendu: 'long',
    },
  ])('un circuit en vol sans le champ, $nom, se lit $attendu', ({ sorte, attendu }) => {
    const m = monde();
    m.ctx.sorte = sorte;
    ecrireEtat(m.ctx, ETAT);
    expect(dernierEtat(m).circuit).toBe(attendu);
  });
});

describe('le circuit suit la sorte du ticket', () => {
  it.each([
    ['un geste mécanique', sorteMecanique, 'long', 'court'],
    [
      'un comportement inchangé',
      { genre: 'comportement', comportement: 'inchangé', raison: 'r' },
      'long',
      'court',
    ],
    [
      'un comportement changé',
      { genre: 'comportement', comportement: 'changé', raison: 'r' },
      'court',
      'long',
    ],
    [
      'un comportement changé sur un direct',
      { genre: 'comportement', comportement: 'changé', raison: 'r' },
      'direct',
      'direct',
    ],
    ['un geste mécanique sur un direct', sorteMecanique, 'direct', 'direct'],
  ])('une bascule vers %s', (_nom, sorte, avant, apres) => {
    const m = monde();
    m.ctx.circuit = avant;
    appliquer(m.ctx, { genre: 'sorte', sorte });
    expect(m.ctx.circuit).toBe(apres);
    ecrireEtat(m.ctx, { etape: 'testwriter', tentative: 1, code: null, rapport: null });
    expect(dernierEtat(m).circuit).toBe(apres);
  });

  it('un plan écrit mécanique fait un circuit court à la fin de l’ouverture', () => {
    const m = monde();
    m.ctx.circuit = 'long';
    planDe(m, sorteMecanique);
    finirLOuverture(m.ctx, { etape: 'testwriter' });
    expect(m.ctx.circuit).toBe('court');
    expect(readFileSync(m.ctx.fiches, 'utf8')).toContain('mécanique');
  });

  it('un circuit direct le reste à la fin de son ouverture', () => {
    const m = monde();
    m.ctx.circuit = 'direct';
    finirLOuverture(m.ctx, { etape: 'developpeur' });
    expect(m.ctx.circuit).toBe('direct');
  });
});
