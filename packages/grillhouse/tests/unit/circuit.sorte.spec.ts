// A gesture without new behaviour leaves the circuit of code (grillhouse-sos, the owner's
// decisions of 2026-11-01): as Google's large-scale changes (Rosie, ClangMR) let a tool make the
// change and a verification and a review judge it, with no new test, the explorateur judges at the
// plan whether the ticket is mechanical, with its reason and the command it names; a mechanical
// ticket skips the testwriter, the proof of the red and the developpeur, the explorateur plays the
// command in the copy (1.1), then the checks, the final pass, the review and the integration
// follow. Under a plan « comportement inchangé » (decision 3, amended by the owner on 2026-11-01),
// the proof accepts every green and the developpeur works the lot (a reorganisation has code),
// then the checks and the review; out of that case, a proof without a red goes to the checks
// without a session of the developpeur, as before. A sort absent or unreadable is « comportement »:
// the whole circuit. Witnesses: BPScript 320.16 (38 tools moved by mv, 117 comments), 322.11.1
// (Vitest on 31 packages), 320.40.1 (an unused variable, 4 sessions), si61.8 (a threshold 77 → 95,
// 2 sessions « aucun code à livrer »).
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import * as circuit from '../../scripts/circuit.mjs';
import { gesteDe, SUITE } from '../../scripts/etapes.mjs';
import { lireFiche, schemaDeFiche, sorteDuPlan } from '../../scripts/resultats.mjs';

const RACINE = path.resolve(__dirname, '../../../..');
const lire = (f: string) => readFileSync(path.join(RACINE, f), 'utf8');
const plat = (f: string) => lire(f).replace(/\s+/g, ' ');

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'circuit-mecanique-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

interface Sorte {
  genre: string;
  raison: string | null;
  commande?: string;
  inchange?: boolean;
}
interface Arret {
  nom: string;
  rapport: string;
  piece: string | null;
  question: string | null;
}
interface Ctx {
  fiches: string;
  sorte: Sorte;
  depuis?: string | null;
  paquets: string[];
}
const etapeApresLePlan = circuit.etapeApresLePlan as (o: {
  sorte: Sorte;
  depuis?: string | null;
  sansTests: boolean;
}) => string;
const apresLaPreuve = circuit.apresLaPreuve as (o: {
  rouges: number;
  pourLeDeveloppeur: boolean;
  inchange: boolean;
}) => string;
const preuveReussie = circuit.preuveReussie as (
  compte: {
    fichiers: number;
    rouges: number;
    casses: number;
    nommes: number;
    nonNommes: number;
    anciens: number;
  },
  options: { inchange: boolean }
) => boolean;
const cheminMecanique = circuit.cheminMecanique as (ctx: Ctx) => boolean;
const arretDuGesteMecanique = circuit.arretDuGesteMecanique as (
  ctx: Ctx,
  texte: string
) => Arret | null;
const decrireLePlan = circuit.decrireLePlan as (
  description: string,
  criteres: string[],
  questions: object[],
  sorte?: Sorte | null
) => string;
const sorte = sorteDuPlan as (fiche: object) => Sorte;

const MECANIQUE = {
  genre: 'mécanique',
  raison: 'un renommage de fichiers, sans comportement neuf',
  commande: 'git mv packages/a/src/vieux.ts packages/a/src/neuf.ts',
};
const PLAN = { criteres: [], paquets: ['packages/a'], questions: [] };
const sortie = (fiche: object) =>
  JSON.stringify({ type: 'result', session_id: 's', structured_output: fiche });

describe('critère 1 — la fiche de l’explorateur porte une sorte, mécanique ou comportement, et sa raison', () => {
  const schema = schemaDeFiche('explorateur') as {
    required: string[];
    properties: Record<string, { properties: Record<string, { enum?: string[] }> }>;
  };

  it('the sheet of the plan carries `sorte`, its kind among mécanique and comportement, its reason and the command of a mechanical ticket', () => {
    const s = schema.properties.sorte;
    expect(s).toBeDefined();
    expect(s.properties.genre.enum).toEqual(['mécanique', 'comportement']);
    expect(Object.keys(s.properties)).toEqual(
      expect.arrayContaining(['genre', 'raison', 'commande', 'comportement'])
    );
    expect(s.properties.comportement.enum).toEqual(['changé', 'inchangé']);
  });

  it('a sheet with its sort is read, and the sort with it', () => {
    const lu = lireFiche('explorateur', sortie({ ...PLAN, sorte: MECANIQUE }));
    expect(lu).toMatchObject({ fiche: { sorte: MECANIQUE } });
    expect(sorte({ ...PLAN, sorte: MECANIQUE })).toEqual({
      genre: 'mécanique',
      raison: MECANIQUE.raison,
      commande: MECANIQUE.commande,
    });
  });

  it('a mechanical ticket skips the testwriter, the proof of the red and the developpeur: after the plan, the gesture (1.1)', () => {
    expect(
      etapeApresLePlan({ sorte: sorte({ ...PLAN, sorte: MECANIQUE }), sansTests: false })
    ).toBe('geste');
    expect(etapeApresLePlan({ sorte: sorte({ ...PLAN, sorte: MECANIQUE }), sansTests: true })).toBe(
      'geste'
    );
    const geste = SUITE.find(e => e.etat === 'geste');
    expect(geste).toMatchObject({ numero: '1.1', titre: 'Geste mécanique', qui: ['explorateur'] });
    expect(gesteDe('mecanique')?.geste).toMatch(
      /ni testwriter, ni preuve du rouge, ni développeur/
    );
  });

  it('a comportement ticket follows the circuit of today: the testwriter, or the developpeur when the plan carries no test', () => {
    const comportement = sorte({
      ...PLAN,
      sorte: { genre: 'comportement', raison: 'un calcul neuf' },
    });
    expect(etapeApresLePlan({ sorte: comportement, sansTests: false })).toBe('testwriter');
    expect(etapeApresLePlan({ sorte: comportement, sansTests: true })).toBe('developpeur');
  });

  // The relecteur of 2c54260: an answer to the questionneur without `sorte` lost the sort.
  it('the sort survives the answer to the questionneur: an answer that says none keeps the plan’s', () => {
    const ficheDuPlan = circuit.ficheDuPlan as (
      plans: { fiche: object; reponse?: boolean }[],
      champ: string
    ) => object | null;
    const ficheDeLaSorte = (plans: { fiche: object; reponse?: boolean }[]) =>
      ficheDuPlan(plans, 'sorte');
    const premier = { ...PLAN, sorte: MECANIQUE };
    const reponse = { ...PLAN, reponses: [{ numero: '1', reponse: 'GARDE', texte: 't' }] };
    expect(sorte(ficheDeLaSorte([{ fiche: premier }, { fiche: reponse, reponse: true }])!)).toEqual(
      sorte(premier)
    );
    const change = { ...reponse, sorte: { genre: 'comportement', raison: 'un calcul neuf' } };
    expect(
      sorte(ficheDeLaSorte([{ fiche: premier }, { fiche: change, reponse: true }])!).genre
    ).toBe('comportement');
    // A new plan without its sort, not an answer, is comportement.
    expect(sorte(ficheDeLaSorte([{ fiche: premier }, { fiche: PLAN }])!).genre).toBe(
      'comportement'
    );
    expect(ficheDeLaSorte([])).toBeNull();
  });

  it('the circuit writes the sort and its reason in the plan, and the command of a mechanical ticket', () => {
    const d = decrireLePlan(
      '## Architecture\n\nA.\n\n## Critères\n\n1. Un.',
      [],
      [],
      sorte({ ...PLAN, sorte: MECANIQUE })
    );
    expect(d).toContain('## Sorte');
    expect(d).toContain(`mécanique — ${MECANIQUE.raison}`);
    expect(d).toContain(`\`${MECANIQUE.commande}\``);
    // Written again from the description before the plan, one section only.
    const encore = decrireLePlan(
      d,
      [],
      [],
      sorte({ ...PLAN, sorte: { genre: 'comportement', raison: 'un calcul neuf' } })
    );
    expect(encore.match(/## Sorte/g)).toHaveLength(1);
    expect(encore).toContain('comportement — un calcul neuf');
    expect(encore).not.toContain(MECANIQUE.commande);
  });
});

describe('critère 2 — un ticket mécanique se mène dans sa copie par sa commande, puis la vérification, la relecture et la file', () => {
  const ctx = (entrees: object[], s: Sorte, depuis: string | null = null): Ctx => {
    const fiches = path.join(ESSAIS, `${Math.random().toString(36).slice(2)}.fiches.jsonl`);
    writeFileSync(fiches, entrees.map(e => `${JSON.stringify(e)}\n`).join(''));
    return { fiches, sorte: s, depuis, paquets: ['packages/a'] };
  };
  const meca = sorte({ ...PLAN, sorte: MECANIQUE });

  it('the gesture is the explorateur’s, at 1.1, in the copy; the checks follow it', () => {
    expect(SUITE.map(e => e.numero).slice(0, 3)).toEqual(['1', '1.1', '2']);
    const consigne = /```text\n([\s\S]*?)\n```/g;
    const blocs = [
      ...lire('mods/grillhouse/skills/pitmaster/references/consigne-agent.md').matchAll(consigne),
    ].map(m => m[1].replace(/\s+/g, ' '));
    const geste = blocs.find(b => b.includes('LA COMMANDE QUE LE PLAN NOMME'));
    expect(geste).toBeDefined();
    expect(geste).toContain('TON TICKET : {{ticket}}');
    expect(geste).toContain('{{commande}}');
    expect(geste).toMatch(/dans ta copie/);
  });

  it('the path stays mechanical while no testwriter nor developpeur has worked the lot since the plan', () => {
    const plan = { role: 'explorateur', fiche: { ...PLAN, sorte: MECANIQUE } };
    expect(cheminMecanique(ctx([plan], meca))).toBe(true);
    expect(
      cheminMecanique(ctx([plan, { role: 'explorateur', fiche: { statut: 'FAIT' } }], meca))
    ).toBe(true);
    // The supervisor sends the lot to the developpeur (`--depuis developpeur`): the circuit of code.
    expect(cheminMecanique(ctx([plan], meca, 'developpeur'))).toBe(false);
    expect(
      cheminMecanique(ctx([plan, { role: 'developpeur', fiche: { statut: 'FAIT' } }], meca))
    ).toBe(false);
    expect(
      cheminMecanique(
        ctx([plan], sorte({ ...PLAN, sorte: { genre: 'comportement', raison: 'un calcul neuf' } }))
      )
    ).toBe(false);
  });

  it('a RENDU on a mechanical lot sends it to no agent: it stops at relecture-arret, a question for the supervisor', () => {
    const plan = { role: 'explorateur', fiche: { ...PLAN, sorte: MECANIQUE } };
    const arret = arretDuGesteMecanique(ctx([plan], meca), 'le verdict');
    expect(arret?.nom).toBe('relecture-arret');
    expect(arret?.rapport).toContain('mécanique');
    expect(arret?.rapport).toContain('le verdict');
    expect(arret?.question).toContain('--depuis developpeur');
    expect(arret?.question).toContain('--arreter');
    expect(arretDuGesteMecanique(ctx([plan], meca, 'developpeur'), 'le verdict')).toBeNull();
  });

  it('the gesture of the circuit is named, with its rule', () => {
    const g = gesteDe('mecanique');
    expect(g?.regle).toMatch(/mécanique/);
    expect(g?.cas).toMatch(/BP 320\.16/);
  });
});

describe('critère 3 — sous « comportement inchangé », la preuve accepte chaque vert et le développeur travaille le lot ; hors de ce cas, une preuve sans rouge passe aux contrôles sans lui', () => {
  const compte = { fichiers: 0, rouges: 0, casses: 0, nommes: 0, nonNommes: 0, anciens: 0 };

  it('a proof without a red, with no finding open for the developpeur, goes to the checks', () => {
    expect(apresLaPreuve({ rouges: 0, pourLeDeveloppeur: false, inchange: false })).toBe(
      'controles'
    );
    expect(apresLaPreuve({ rouges: 2, pourLeDeveloppeur: false, inchange: false })).toBe(
      'developpeur'
    );
    expect(apresLaPreuve({ rouges: 0, pourLeDeveloppeur: true, inchange: false })).toBe(
      'developpeur'
    );
  });

  it('under « comportement inchangé », a proof without a red goes to the developpeur, who writes the code', () => {
    expect(apresLaPreuve({ rouges: 0, pourLeDeveloppeur: false, inchange: true })).toBe(
      'developpeur'
    );
  });

  it('a plan « comportement inchangé » reads its sort', () => {
    expect(
      sorte({
        ...PLAN,
        sorte: { genre: 'comportement', raison: 'un seuil relevé', comportement: 'inchangé' },
      })
    ).toEqual({ genre: 'comportement', raison: 'un seuil relevé', inchange: true });
  });

  it('under « comportement inchangé », nothing has to turn red and every green passes: only a broken file refuses the proof', () => {
    expect(preuveReussie(compte, { inchange: true })).toBe(true);
    expect(preuveReussie(compte, { inchange: false })).toBe(false);
    const vertSansVertAttendu = { ...compte, fichiers: 1, nommes: 1 };
    expect(preuveReussie(vertSansVertAttendu, { inchange: true })).toBe(true);
    expect(preuveReussie(vertSansVertAttendu, { inchange: false })).toBe(false);
    expect(preuveReussie({ ...compte, fichiers: 1, casses: 1 }, { inchange: true })).toBe(false);
    expect(preuveReussie({ ...compte, fichiers: 1, anciens: 1 }, { inchange: false })).toBe(false);
  });
});

describe('critère 4 — une sorte absente ou illisible vaut « comportement » : le circuit entier', () => {
  const comportement = { genre: 'comportement', raison: null, inchange: false };

  it('a sheet without its sort is read, and its sort is comportement', () => {
    expect(lireFiche('explorateur', sortie(PLAN))).toMatchObject({ fiche: PLAN });
    expect(sorte(PLAN)).toEqual(comportement);
    expect(etapeApresLePlan({ sorte: sorte(PLAN), sansTests: false })).toBe('testwriter');
  });

  it('a mechanical sort without its reason or its command is comportement', () => {
    expect(sorte({ ...PLAN, sorte: { genre: 'mécanique', raison: '', commande: 'x' } })).toEqual(
      comportement
    );
    expect(sorte({ ...PLAN, sorte: { genre: 'mécanique', raison: 'un renommage' } })).toEqual({
      ...comportement,
      raison: 'un renommage',
    });
    expect(sorte({ ...PLAN, sorte: { genre: 'mécanique', raison: 'r', commande: ' ' } })).toEqual({
      ...comportement,
      raison: 'r',
    });
  });

  it('a sort out of its kinds, or « inchangé » without its reason, is comportement, the whole circuit', () => {
    expect(sorte({ ...PLAN, sorte: { genre: 'autre', raison: 'r' } })).toEqual({
      ...comportement,
      raison: 'r',
    });
    expect(sorte({ ...PLAN, sorte: 'mécanique' })).toEqual(comportement);
    expect(
      sorte({ ...PLAN, sorte: { genre: 'comportement', raison: ' ', comportement: 'inchangé' } })
    ).toEqual(comportement);
  });
});

describe('critère 5 — la charte, les compétences, l’architecture et le CHANGELOG disent la règle', () => {
  it('the common charter: a gesture without new behaviour leaves the circuit of code', () => {
    const charte = plat('mods/grillhouse/charte.md');
    expect(charte).toMatch(/\*\*Un geste sans comportement neuf sort du circuit de code\*\*/);
    for (const geste of [
      'montée du cadre',
      'documents seuls',
      'renommage ou déplacement',
      'montée de dépendance',
      'configuration seule',
      'correction de style',
      'seuil relevé',
    ]) {
      expect(charte, geste).toContain(geste);
    }
    expect(charte).toMatch(/sans testwriter ni développeur/);
    expect(charte).toMatch(
      /Le texte qui accompagne un changement de comportement reste dans son lot/
    );
    expect(charte).toMatch(/Une configuration dont une garde mesure l'effet reste au circuit/);
    expect(charte).toMatch(/un doute va au circuit/);
    // Decision 3, amended on 2026-11-01: under « comportement inchangé », the developpeur writes.
    expect(charte).toMatch(
      /Sous un plan qui dit « comportement inchangé », la suite existante fait la preuve : elle accepte chaque vert, et le développeur écrit le code/
    );
  });

  it('the explorateur’s skill: he judges the sort at the plan, with its reason, and plays the gesture', () => {
    const explorateur = plat('mods/grillhouse/skills/explorateur/SKILL.md');
    expect(explorateur).toContain('`sorte`');
    expect(explorateur).toMatch(/un doute va au circuit/);
    expect(explorateur).toMatch(/comportement inchangé/);
    expect(explorateur).toContain('## Dans le circuit : le geste mécanique');
  });

  it('the supervisor’s skill cites 1.1 and the mechanical path', () => {
    const pitmaster = plat('mods/grillhouse/skills/pitmaster/SKILL.md');
    expect(pitmaster).toContain('1.1 Geste mécanique');
    expect(pitmaster).toMatch(/Un ticket mécanique/);
  });

  it('the reviewer’s skill: a mechanical lot asks no new test', () => {
    const relecteur = plat('mods/grillhouse/skills/relecteur/SKILL.md');
    expect(relecteur).toMatch(/Un lot mécanique/);
    expect(relecteur).toMatch(/aucun test neuf/);
  });

  it('the architecture of the package and the CHANGELOG say it', () => {
    expect(plat('packages/grillhouse/docs/ARCHITECTURE.md')).toMatch(
      /\*\*Un geste mécanique sort du circuit de code\*\*/
    );
    const changelog = lire('CHANGELOG.md');
    const unreleased = changelog.slice(0, changelog.indexOf('## [0.27.0]'));
    expect(unreleased).toContain('(grillhouse-sos)');
  });
});
