// The opening of a run (scripts/circuit.mjs, `ouvrirJusquAuPlan`): a ticket labelled `arbitrage`
// whose arbitrage the integration would refuse (`refusArbitrage`, the one rule) does not start, nor
// resume: the opening stops before any session, a question to the supervisor at « 1 Plan », as a CI
// refuses a pull request without its required label before it runs a job.
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as circuit from '../../scripts/circuit.mjs';

interface Effet {
  genre: string;
  texte?: string;
  etat?: { question?: { arret: string; qui: string; question: string } };
}
const ouvrirJusquAuPlan = circuit.ouvrirJusquAuPlan as (
  ctx: object,
  e: object | null
) => Promise<{ code?: number; debut?: object }>;

afterEach(() => vi.restoreAllMocks());

const SANS_ARBITRAGE = /est étiqueté arbitrage sans commentaire « Arbitrage »/;
const OUVERT = '## Arbitrage — la mesure\n\n### Verdict — monte au responsable\n';

// A run's context on a ticket labelled <etiquettes> whose comments are <commentaires>.
const contexte = (commentaires: string[], etiquettes = ['arbitrage']) => ({
  rendus: [] as Effet[],
  ticket: 'demo-1',
  sujet: 'La mesure',
  paquets: ['packages/forms'],
  racine: '/nonexistent/depot',
  copie: '/nonexistent/copie',
  journal: '/nonexistent/journal',
  fiches: '/nonexistent/fiches.jsonl',
  resoudre: (c: string) => c,
  bd: (...a: string[]) =>
    a[0] === 'comments'
      ? {
          status: 0,
          stdout: JSON.stringify(commentaires.map(text => ({ author: 'superviseur', text }))),
          stderr: '',
        }
      : {
          status: 0,
          stdout: JSON.stringify([{ title: 'La mesure', description: '', labels: etiquettes }]),
          stderr: '',
        },
});
const question = (ctx: ReturnType<typeof contexte>) =>
  ctx.rendus.find(e => e.genre === 'etat')?.etat?.question;

describe('l’ouverture d’un ticket étiqueté arbitrage', () => {
  it('refuse de démarrer sans commentaire « Arbitrage » : l’arrêt monte au superviseur, au plan', async () => {
    const ctx = contexte([]);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const o = await ouvrirJusquAuPlan(ctx, null);
    expect(o.debut).toBeUndefined();
    expect(o.code).toBeGreaterThan(0);
    expect(question(ctx)).toMatchObject({ arret: 'besoin', qui: 'superviseur' });
    expect(question(ctx)?.question).toMatch(SANS_ARBITRAGE);
    expect(ctx.rendus.find(e => e.genre === 'commentaire')?.texte).toMatch(
      /^Circuit · question : besoin à 1 Plan — /
    );
  });

  it('refuse aussi la reprise tant que l’arbitrage reste ouvert', async () => {
    const ctx = contexte([OUVERT]);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const o = await ouvrirJusquAuPlan(
      { ...ctx, reprendre: true },
      { etape: 'tests', tentative: 1, rapport: null }
    );
    expect(o.code).toBeGreaterThan(0);
    expect(question(ctx)?.question).toMatch(/ni tranché ni répondu par le responsable/);
  });
});
