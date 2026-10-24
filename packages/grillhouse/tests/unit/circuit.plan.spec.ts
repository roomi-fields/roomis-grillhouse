import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import {
  ARRETS,
  CIRCUIT,
  CODE_JUSTE,
  DESCRIPTION,
  ECRIT_ROUGE,
  circuitEssai,
  ecrire,
  json,
  sortie,
} from './circuit-essai.js';

// grillhouse-3uv.95.5 (decision 4 of 3uv.95): the plan of a ticket, step 1 of its circuit, as an
// RFC: its author writes it after surveying what exists, a review reads it once, the author answers
// once, and what stays open goes to who decides. The explorateur, launched by the circuit out of
// the envelope, writes the plan in its sheet (its criteria, the packages to touch, its open
// questions), which the circuit writes at the ticket: the packages end its title, the list the
// envelope of every later session writes. The questionneur reads the plan once; on its
// questions, the explorateur answers once, CHANGE or GARDE by question, its session resumed; what
// stays open goes up to the supervisor (scripts/etapes.mjs, MONTEES), else the circuit goes to the
// tests. Witness: BP 320.9, 132 rounds of questions, 29 criteria of which 2 were useful, and the
// useful questions (who builds what, the order, the grammar) never asked: they belonged to an
// exploration before the plan.
// The trial repository and its stand-ins: ./circuit-essai.ts.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-plan-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const {
  BEADS,
  REPO,
  revenirAuDebut,
  ticket,
  scenario,
  circuit,
  essai,
  sessions,
  args,
  etat,
  ordre,
  commentaires,
  entrees,
} = circuitEssai(ESSAIS);

const EXPLORATEUR = 'explorateur';
const QUESTIONNEUR = 'questionneur';
// A scenario's sheet, its quotes escaped for the shell.
const fiche = (f: Record<string, unknown>) =>
  `fiche '${JSON.stringify(f).replaceAll("'", "'\\''")}'\n`;
// The plan of the trial tickets as an explorateur writes it in its sheet: the criteria it adds to
// those the ticket holds.
const plan = (o: Record<string, unknown> = {}) => ({
  criteres: [],
  paquets: ['000-forms'],
  questions: [],
  ...o,
});
const questions = (...q: string[]) => ({
  issue: 'QUESTIONS',
  questions: q.map(question => ({ question, vise: 'flou', piece: 'CLAUDE.md:9' })),
});
const valeur = (a: string[], option: string) =>
  a.includes(option) ? a[a.indexOf(option) + 1] : undefined;
// The ticket as the stand-in bd holds it.
const leTicket = (id: string) =>
  (
    JSON.parse(readFileSync(path.join(BEADS, `${id}.json`), 'utf8')) as {
      title: string;
      description: string;
    }[]
  )[0];
// The lines of the plan and of its questioning at the ticket.
const echange = (id: string) => commentaires(id).filter(t => / · (plan|questionnement) : /.test(t));
const questionnements = (id: string) =>
  entrees(id).flatMap(e => (e.questionnement ? [e.questionnement as Record<string, unknown>] : []));
const METACADRE = readFileSync(
  path.resolve(__dirname, '../../../../mods/grillhouse/METACADRE.md'),
  'utf8'
);

describe.runIf(canWrap)('the plan, step 1 of the circuit', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);

  it('critère 1 — the explorateur writes the plan: its criteria and packages at the ticket, the packages the list the envelope writes', () => {
    const id = 'demo-plan-ecrit';
    ticket(id, '000-forms');
    scenario(
      id,
      EXPLORATEUR,
      fiche(
        plan({
          criteres: ['030-binder lit le double.'],
          paquets: ['000-forms', '030-binder'],
        })
      )
    );
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    // One session of its own, out of the envelope, before any testwriter.
    expect(sessions(id, EXPLORATEUR)).toBe(1);
    const a = args(id, EXPLORATEUR, 1);
    expect(a.slice(0, 3)).toEqual(['-p', '--agent', EXPLORATEUR]);
    expect(valeur(a, '--session-id')).toBeTruthy();
    expect(essai(id, `${EXPLORATEUR}-1.paquets`)).toBe('');
    // Its instruction carries the ticket and the survey it leans on.
    const c = essai(id, `${EXPLORATEUR}-1.prompt`);
    expect(c).toContain(`TON TICKET : ${id}`);
    expect(c).toContain('1. `mesure` rend le double de sa valeur.');
    expect(c).toContain(`npx grillhouse composants-affectes ${id}`);
    // The circuit writes the plan at the ticket: the packages in the title, the criteria in the
    // description, the rest of it kept.
    const t = leTicket(id);
    expect(t.title).toBe(`${id} — La mesure — 000-forms, 030-binder`);
    expect(t.description).toContain('La mesure vit dans chaque composant.');
    expect(t.description).toContain(
      "## Critères d'acceptation\n\n1. `mesure` rend le double de sa valeur.\n2. 030-binder lit le double."
    );
    expect(echange(id)[0]).toMatch(/^Circuit · plan : /);
    // The questionneur reads the plan the explorateur wrote: its title with its packages, its
    // criterion added.
    const q = essai(id, `${QUESTIONNEUR}-1.prompt`);
    expect(q).toContain(`« ${id} — La mesure — 000-forms, 030-binder »`);
    expect(q).toContain('2. 030-binder lit le double.');
    // The packages of the plan are the list the envelope of each session writes.
    expect(essai(id, 'testwriter-1.paquets')).toBe(
      ['packages/forms', 'packages/binder'].join(path.delimiter)
    );
    // One testwriter and one developpeur for the whole plan (grillhouse-3uv.95.6).
    expect(ordre(id)).toEqual(['testwriter', 'developpeur', 'relecteur']);
  });

  it('critère 2 — one pass of questions: the explorateur answers once, CHANGE or GARDE by question, and the plan with nothing open goes to the tests', () => {
    const id = 'demo-plan-reponse';
    ticket(id, '000-forms');
    scenario(
      id,
      QUESTIONNEUR,
      fiche(questions('Que rend `mesure` de 0 ?', 'Pourquoi le double, pas le triple ?'))
    );
    scenario(
      id,
      `${EXPLORATEUR}-2`,
      fiche(
        plan({
          criteres: ['`mesure(0)` rend 0.'],
          reponses: [
            { numero: '1', reponse: 'CHANGE', texte: 'Le critère 2 nomme `mesure(0)`.' },
            { numero: '2', reponse: 'GARDE', texte: 'Le format publié est le double.' },
          ],
        })
      )
    );
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, QUESTIONNEUR)).toBe(1);
    expect(sessions(id, EXPLORATEUR)).toBe(2);
    // The answer resumes the explorateur's session, its instruction the numbered questions.
    expect(valeur(args(id, EXPLORATEUR, 2), '--resume')).toBe(
      valeur(args(id, EXPLORATEUR, 1), '--session-id')
    );
    const c = essai(id, `${EXPLORATEUR}-2.prompt`);
    expect(c).toContain('1. Que rend `mesure` de 0 ?');
    expect(c).toContain('2. Pourquoi le double, pas le triple ?');
    // The changed plan at the ticket, each answer in the exchange.
    expect(leTicket(id).description).toContain(
      '1. `mesure` rend le double de sa valeur.\n2. `mesure(0)` rend 0.'
    );
    expect(echange(id).some(t => t.includes('1. CHANGE — Le critère 2 nomme `mesure(0)`.'))).toBe(
      true
    );
    expect(echange(id).some(t => t.includes('2. GARDE — Le format publié est le double.'))).toBe(
      true
    );
    expect(questionnements(id)).toEqual([
      expect.objectContaining({
        objet: 'plan',
        questions: 2,
        change: true,
        issue: 'QUESTIONS',
        ouvertes: 0,
      }),
    ]);
    expect(ordre(id, { plan: true })).toEqual([
      EXPLORATEUR,
      QUESTIONNEUR,
      EXPLORATEUR,
      'testwriter',
      'developpeur',
      'relecteur',
    ]);
  });

  it('critère 2 — what stays open after the answer goes up to the supervisor, whose resumption lets the plan pass, questioned no more', () => {
    const id = 'demo-plan-ouvert';
    ticket(id, '000-forms');
    scenario(
      id,
      QUESTIONNEUR,
      fiche(questions('Que rend `mesure` de 0 ?', 'Qui lit la mesure publiée ?'))
    );
    scenario(
      id,
      `${EXPLORATEUR}-2`,
      fiche(
        plan({
          reponses: [{ numero: '1', reponse: 'GARDE', texte: '0, le double de 0.' }],
          questions: [{ question: 'Le format publié change-t-il ?', piece: 'CLAUDE.md:7' }],
        })
      )
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS.questionnement);
    expect(sessions(id, 'testwriter')).toBe(0);
    const e = etat(id) as unknown as {
      raison: string;
      question: { arret: string; piece: string; qui: string };
    };
    expect(e.raison).toBe('questionnement');
    expect(e.question).toMatchObject({ arret: 'questionnement', qui: 'superviseur' });
    // The explorateur's open question with its piece, and the question it left unanswered.
    expect(e.question.piece).toContain('Le format publié change-t-il ? (CLAUDE.md:7)');
    expect(e.question.piece).toContain('Qui lit la mesure publiée ?');
    expect(e.question.piece).not.toContain('Que rend `mesure` de 0 ?');
    // The open questions stand in the plan at the ticket.
    expect(leTicket(id).description).toContain(
      '## Questions ouvertes\n\n1. Le format publié change-t-il ? (CLAUDE.md:7)'
    );
    expect(questionnements(id).at(-1)).toMatchObject({ questions: 2, change: false, ouvertes: 2 });
    // The supervisor keeps the plan and resumes: it passes, neither written nor questioned again.
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const s = circuit([id, '--reprendre']);
    expect(s.status, sortie(s)).toBe(0);
    expect(sessions(id, EXPLORATEUR)).toBe(2);
    expect(sessions(id, QUESTIONNEUR)).toBe(1);
    expect(echange(id).at(-1)).toMatch(
      /le plan passe tel qu’il est, sur la reprise du superviseur/
    );
  });

  it('critère 2 — a disagreement is one question the explorateur answers; left open, it goes up', () => {
    const id = 'demo-plan-desaccord';
    ticket(id, '000-forms');
    scenario(
      id,
      QUESTIONNEUR,
      fiche({ issue: 'DÉSACCORD', desaccord: 'Le plan corrige le symptôme, la cause reste.' })
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS.questionnement);
    expect(sessions(id, EXPLORATEUR)).toBe(2);
    expect(essai(id, `${EXPLORATEUR}-2.prompt`)).toContain(
      '1. Le plan corrige le symptôme, la cause reste.'
    );
    expect(etat(id)?.question?.piece).toContain('Le plan corrige le symptôme, la cause reste.');
    expect(questionnements(id).at(-1)).toMatchObject({ questions: 1, issue: 'DÉSACCORD' });
  });

  it('critère 2 — a plan without question from the questionneur needs no answer; its own open questions go up', () => {
    const id = 'demo-plan-aucune';
    ticket(id, '000-forms');
    scenario(
      id,
      EXPLORATEUR,
      fiche(
        plan({ questions: [{ question: 'Le format publié change-t-il ?', piece: 'CLAUDE.md:7' }] })
      )
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS.questionnement);
    expect(sessions(id, EXPLORATEUR)).toBe(1);
    expect(sessions(id, QUESTIONNEUR)).toBe(1);
    expect(etat(id)?.question?.piece).toContain('Le format publié change-t-il ? (CLAUDE.md:7)');
    expect(questionnements(id).at(-1)).toMatchObject({
      questions: 0,
      issue: 'AUCUNE',
      ouvertes: 1,
    });
    expect(questionnements(id).at(-1)).not.toHaveProperty('tours');
  });

  it('critère 1 — a package the repository does not hold makes the sheet out of conformity', () => {
    const id = 'demo-plan-inconnu';
    ticket(id, '000-forms');
    scenario(id, EXPLORATEUR, fiche(plan({ paquets: ['999-absent'] })));
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS['sans-fiche']);
    expect(sessions(id, EXPLORATEUR)).toBe(2);
    expect(sessions(id, QUESTIONNEUR)).toBe(0);
    expect(
      commentaires(id).some(t => t.includes('sans fiche conforme') && t.includes('999-absent'))
    ).toBe(true);
    expect(leTicket(id).title).toBe(`${id} — La mesure — 000-forms`);
  });

  it('critère 1 — one package named twice, by its name and by its path, makes the sheet out of conformity', () => {
    const id = 'demo-plan-double';
    ticket(id, '000-forms');
    scenario(id, EXPLORATEUR, fiche(plan({ paquets: ['000-forms', 'packages/forms'] })));
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS['sans-fiche']);
    expect(sessions(id, QUESTIONNEUR)).toBe(0);
    expect(
      commentaires(id).some(t => t.includes('sans fiche conforme') && t.includes('packages/forms'))
    ).toBe(true);
  });

  it('critère 1 — the criteria written at the ticket stay as they are, followed by those of the explorateur’s last sheet alone', () => {
    const id = 'demo-plan-critere';
    ticket(id, '000-forms');
    scenario(id, `${EXPLORATEUR}-1`, fiche(plan({ criteres: ['Ajout X.'] })));
    scenario(id, QUESTIONNEUR, fiche(questions('Pourquoi X ?')));
    scenario(
      id,
      `${EXPLORATEUR}-2`,
      fiche(
        plan({
          criteres: ['Ajout Y.'],
          reponses: [{ numero: '1', reponse: 'CHANGE', texte: 'Y à la place de X.' }],
          questions: [{ question: 'Le format publié change-t-il ?', piece: 'CLAUDE.md:7' }],
        })
      )
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS.questionnement);
    const d = leTicket(id).description;
    expect(d).toContain(
      "## Critères d'acceptation\n\n1. `mesure` rend le double de sa valeur.\n2. Ajout Y.\n\n## Questions ouvertes"
    );
    expect(d).not.toContain('Ajout X.');
  });

  it('critère 3 — the questionneur reads the plan and the frame that orients it, read-only; the circuit plays no survey again', () => {
    const id = 'demo-plan-consigne';
    ticket(id, '000-forms');
    // A criterion names a package the plan misses: no stop of the circuit any more.
    ecrire(
      path.join(BEADS, `${id}.json`),
      json([
        {
          id,
          title: `${id} — La mesure — 000-forms`,
          description: `${DESCRIPTION}\n2. 030-binder lit la mesure, inchangé.\n`,
        },
      ])
    );
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id)).toEqual(['testwriter', 'developpeur', 'relecteur']);
    expect(existsSync(path.join(REPO, '.claude/worktrees', `${id}.composants.json`))).toBe(false);
    const c = essai(id, `${QUESTIONNEUR}-1.prompt`);
    expect(c).toContain(`TON TICKET : ${id}`);
    expect(c).toContain(METACADRE.trim().split('\n').at(-1));
    expect(c).toContain('Un tableur mûr calcule chaque mesure une fois.');
    expect(c).toContain('Le format publié de la mesure.');
    expect(c).not.toContain('## Commandes');
    expect(c).toContain('2. 030-binder lit la mesure, inchangé.');
    expect(c).not.toContain('**Composants relevés**');
    expect(echange(id).at(-1)).toMatch(/aucune question/);
    // Read-only: no tool of writing, no write at the ticket.
    const a = args(id, QUESTIONNEUR, 1);
    expect(valeur(a, '--tools')?.split(',')).not.toEqual(expect.arrayContaining(['Edit']));
    const reglages = JSON.parse(valeur(a, '--settings') ?? '{}') as {
      permissions: { deny: string[] };
    };
    expect(reglages.permissions.deny).toEqual(
      expect.arrayContaining(['Bash(bd comments add*)', 'Bash(bd update*)'])
    );
  });
});

describe('critère 3 — the rounds, the survey played again and the referent are gone', () => {
  it('the circuit names neither the survey of its components nor rounds of questions', () => {
    const c = readFileSync(CIRCUIT, 'utf8');
    for (const nom of ['composantsManquants', 'verifierLeTitre', 'changerLePlan', 'TOURS']) {
      expect(c, nom).not.toContain(nom);
    }
    expect(ARRETS).not.toHaveProperty('composants-manquants');
  });

  it('the explorateur has two templates of its own: the plan, and its one answer', () => {
    const gabarit = readFileSync(
      path.resolve(
        __dirname,
        '../../../../mods/grillhouse/skills/pitmaster/references/consigne-agent.md'
      ),
      'utf8'
    );
    const blocs = [...gabarit.matchAll(/\n## ([^\n]+)\n+```text\n([\s\S]*?)\n```/g)]
      .filter(m => m[1].startsWith('Explorateur'))
      .map(m => ({ titre: m[1], texte: m[2] }));
    expect(blocs.map(b => b.titre)).toEqual([
      'Explorateur, sur le plan (rempli par le circuit)',
      'Explorateur, sur les questions du plan (rempli par le circuit)',
    ]);
    for (const champ of ['ticket', 'titre', 'description', 'contexte']) {
      expect(blocs[0].texte, champ).toContain(`{{${champ}}}`);
    }
    expect(blocs[0].texte).toContain('npx grillhouse composants-affectes {{ticket}}');
    expect(blocs[1].texte).toContain('{{questions}}');
    expect(blocs[1].texte).toContain('une seule fois');
  });
});
