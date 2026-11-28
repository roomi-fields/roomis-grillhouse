// The questions of the circuits reach the session of supervision by a push of its greffon, not by a
// wait the supervisor launches again after each batch (scripts/superviseur.mjs). One function does
// the reading, the re-presentation and the file of the stops gone up (`relever`): the greffon calls
// it at each reading of the circuits of its project and submits what it gives, in one message
// (`texteDesQuestions`); a question that waits comes back every <rappelMs> ms until it is
// answered, a question answered leaves the file and never comes back. Every time is measured on an
// injected clock, with no real wait. Witness: on 2026-11-18, OSC Bridge's supervisor had not
// launched its wait again after a batch, and 7 questions of SyntHub stayed unanswered a morning.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import * as superviseur from '../../scripts/superviseur.mjs';
import { circuitLu } from './tableau-essai.js';

const { circuitsALOuverture, questionsEnAttente, texteDesQuestions } = superviseur;

interface Donnee {
  ticket: string;
  etape: string;
  question: string;
  qui: string;
  commande: string;
  cle: string;
  representee?: boolean;
  adresse?: string;
}
type Circuit = ReturnType<typeof circuitLu>;
interface Options {
  fermes: (racine: string, ids: string[]) => Set<string> | null;
  maintenant: number;
  rappelMs: number;
  toutes?: boolean;
  ciDeMain?: { cle: string; texte: string } | null;
}
// The reading is loaded from the namespace, so that a name not yet public fails its test, not the
// file's loading.
const relever = (racine: string, circuits: Circuit[], options: Options): Donnee[] =>
  (
    superviseur as unknown as {
      relever: (racine: string, circuits: Circuit[], options: Options) => Donnee[];
    }
  ).relever(racine, circuits, options);

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'releve-des-questions-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const MIN = 60_000;
const T0 = 10_000_000;
const aucun = () => new Set<string>();

const depot = () => {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  mkdirSync(path.join(racine, '.claude', 'worktrees'), { recursive: true });
  return racine;
};
const fichier = (racine: string) =>
  path.join(racine, '.claude', 'worktrees', 'questions-remontees.json');
interface Entree {
  cle: string;
  depuis: number;
  presentee: number;
}
const lireFichier = (racine: string) =>
  JSON.parse(readFileSync(fichier(racine), 'utf8')) as { remontees: Entree[] };

const arrete = (ticket: string, question: string, { run = `run-${ticket}`, numero = 1 } = {}) =>
  circuitLu(ticket, {
    etape: 'controles',
    code: 14,
    arret: 'controles',
    question,
    qui: 'superviseur',
    run,
    numero,
  });
const cle = (ticket: string, numero = 1) => `${ticket}:run-${ticket}:${numero}:controles`;
const tourne = (ticket: string) => circuitLu(ticket, { etape: 'controles', vivant: true });
const integre = (ticket: string, fin: number) =>
  circuitLu(ticket, { etape: 'integre', code: 0, arret: 'arrete', integre: true, fin });
const sansIssue = (ticket: string) =>
  circuitLu(ticket, {
    etape: 'preuve',
    interrompu: true,
    reponse: `npx grillhouse circuit ${ticket} --reprendre\` ou \`--depuis <testwriter|developpeur> --contexte <texte>`,
    question: 'Le déroulé du circuit a fini sans son issue (TERMINATED), aucun arrêt écrit.',
    qui: 'superviseur',
  });

// A reading of the circuits <circuits> of <racine> at <minutes> minutes after T0, <rappel> minutes
// of re-presentation (5 by default).
// The session reads at once what the reading sends (the reminder is counted from the reading: the
// cases of the reminder below read their questions as they come; the file `rappel-depuis-la-lecture`
// holds the cases where the reading comes later or never).
const lire = (racine: string, circuits: Circuit[], minutes: number, rappel = 5, extra = {}) => {
  const maintenant = T0 + minutes * MIN;
  const lot = relever(racine, circuits, {
    fermes: aucun,
    maintenant,
    rappelMs: rappel * MIN,
    ...extra,
  });
  (
    superviseur as unknown as {
      marquerLues: (racine: string, o: { lueA: number; envoyeesAvant: number }) => void;
    }
  ).marquerLues(racine, { lueA: maintenant, envoyeesAvant: maintenant });
  return lot;
};
const tickets = (lot: Donnee[]) => lot.map(q => q.ticket);

describe('the questions that wait for the supervisor, one source', () => {
  it('each one gives its ticket, its step, its question and the command that answers it', () => {
    const circuits = [
      arrete('demo-1', 'Quel paquet lève ce rouge ?'),
      sansIssue('demo-2'),
      circuitLu('demo-4', { code: 0, arret: 'arrete' }),
      tourne('demo-5'),
    ];
    const q = questionsEnAttente(depot(), circuits, { fermes: aucun });
    expect(q.map(x => x.ticket)).toEqual(['demo-1', 'demo-2']);
    expect(q[0]).toMatchObject({
      etape: '3.1 Contrôles',
      qui: 'superviseur',
      question: 'Quel paquet lève ce rouge ?',
    });
    expect(q[0]!.commande).toContain('npx grillhouse circuit demo-1 --reprendre');
    expect(q[1]).toMatchObject({ etape: '2.1 Preuve du rouge' });
    expect(
      questionsEnAttente(depot(), circuits, { fermes: () => new Set(['demo-1']) })
    ).toHaveLength(1);
  });

  it('a ticket that does not read gives no question waiting', () => {
    expect(questionsEnAttente(depot(), [arrete('demo-1', 'Q ?')], { fermes: () => null })).toEqual(
      []
    );
  });
});

describe('a new question is given once, in one reading', () => {
  it('is given at its first reading, never again by a repeated reading before its re-presentation', () => {
    const racine = depot();
    const circuits = [arrete('demo-1', 'Q1 ?')];
    const premier = lire(racine, circuits, 0);
    expect(tickets(premier)).toEqual(['demo-1']);
    expect(premier[0]).not.toHaveProperty('representee', true);
    for (const m of [0, 0, 1, 2, 4.9]) {
      expect(lire(racine, circuits, m)).toEqual([]);
    }
  });

  it('gives every question of the reading together, sorted by ticket', () => {
    const lot = lire(depot(), [arrete('demo-3', 'Q3 ?'), arrete('demo-1', 'Q1 ?')], 0);
    expect(tickets(lot)).toEqual(['demo-1', 'demo-3']);
  });

  it('gives only the new question when another one is already gone up', () => {
    const racine = depot();
    expect(tickets(lire(racine, [arrete('demo-1', 'Q1 ?')], 0))).toEqual(['demo-1']);
    const lot = lire(racine, [arrete('demo-1', 'Q1 ?'), arrete('demo-2', 'Q2 ?')], 1);
    expect(tickets(lot)).toEqual(['demo-2']);
  });

  it('gives no question for a circuit that runs, or that the supervisor stopped', () => {
    const lot = lire(
      depot(),
      [tourne('demo-1'), circuitLu('demo-2', { code: 0, arret: 'arrete' })],
      0
    );
    expect(lot).toEqual([]);
  });

  it('leaves out a question whose ticket is closed, and gives it once it waits again', () => {
    const racine = depot();
    const circuits = [arrete('demo-1', 'Q1 ?')];
    expect(lire(racine, circuits, 0, 5, { fermes: () => new Set(['demo-1']) })).toEqual([]);
    expect(tickets(lire(racine, circuits, 1))).toEqual(['demo-1']);
  });

  it('gives nothing while the tickets do not read, then what still waits once they do', () => {
    const racine = depot();
    const circuits = [arrete('demo-1', 'Q1 ?')];
    expect(lire(racine, circuits, 0, 5, { fermes: () => null })).toEqual([]);
    const lot = lire(racine, circuits, 1);
    expect(tickets(lot)).toEqual(['demo-1']);
    expect(lot[0]).not.toHaveProperty('representee', true);
  });

  it('a stop whose key changes is a new question, given at once with a new `depuis`', () => {
    const racine = depot();
    lire(racine, [arrete('demo-1', 'Q1 ?')], 0);
    const lot = lire(racine, [arrete('demo-1', 'Q1 bis ?', { numero: 2 })], 2);
    expect(lot[0]).toMatchObject({ ticket: 'demo-1', question: 'Q1 bis ?' });
    expect(lot[0]).not.toHaveProperty('representee', true);
    expect(lireFichier(racine).remontees).toEqual([
      { cle: cle('demo-1', 2), depuis: T0 + 2 * MIN, presentee: T0 + 2 * MIN, lue: T0 + 2 * MIN },
    ]);
    // Another run of its workflow, its first question: another stop.
    const autre = lire(racine, [arrete('demo-1', 'Q1 ?', { run: 'run-2', numero: 1 })], 3);
    expect(tickets(autre)).toEqual(['demo-1']);
  });
});

describe('a question that waits comes back until its answer', () => {
  it('after 5 minutes by default, never before, and again 5 minutes after each presentation', () => {
    const racine = depot();
    const circuits = [arrete('demo-1', 'Q1 ?')];
    expect(lire(racine, circuits, 0)).toHaveLength(1);
    expect(lire(racine, circuits, 4.9)).toEqual([]);
    const encore = lire(racine, circuits, 5);
    expect(tickets(encore)).toEqual(['demo-1']);
    expect(encore[0]!.representee).toBe(true);
    expect(lire(racine, circuits, 9)).toEqual([]);
    expect(tickets(lire(racine, circuits, 10))).toEqual(['demo-1']);
  });

  it('after the interval given, in minutes', () => {
    const racine = depot();
    const circuits = [arrete('demo-1', 'Q1 ?')];
    expect(lire(racine, circuits, 0, 2)).toHaveLength(1);
    expect(lire(racine, circuits, 1.9, 2)).toEqual([]);
    expect(tickets(lire(racine, circuits, 2, 2))).toEqual(['demo-1']);
    // Another interval at each reading: the one of the reading applies.
    expect(lire(racine, circuits, 8, 10)).toEqual([]);
    expect(tickets(lire(racine, circuits, 12, 10))).toEqual(['demo-1']);
  });

  it('gives three messages for a question answered 12 minutes after it, with a 5-minute re-presentation, none afterwards', () => {
    const racine = depot();
    const attend = [arrete('demo-1', 'Q1 ?')];
    const donnes: number[] = [];
    for (let m = 0; m <= 30; m++) {
      const circuits = m < 12 ? attend : [tourne('demo-1')];
      if (lire(racine, circuits, m).length) {
        donnes.push(m);
      }
    }
    expect(donnes).toEqual([0, 5, 10]);
  });

  it('is counted from its last presentation, whatever the number of readings between', () => {
    const racine = depot();
    const circuits = [arrete('demo-1', 'Q1 ?')];
    expect(lire(racine, circuits, 0)).toHaveLength(1);
    let donnes = 0;
    for (let m = 0.5; m <= 5; m += 0.5) {
      donnes += lire(racine, circuits, m).length;
    }
    expect(donnes).toBe(1);
  });

  it('only the questions whose interval has passed come back, each by its own last presentation', () => {
    const racine = depot();
    lire(racine, [arrete('demo-1', 'Q1 ?')], 0);
    const deux = [arrete('demo-1', 'Q1 ?'), arrete('demo-2', 'Q2 ?')];
    expect(tickets(lire(racine, deux, 3))).toEqual(['demo-2']);
    expect(tickets(lire(racine, deux, 5))).toEqual(['demo-1']);
    expect(tickets(lire(racine, deux, 8))).toEqual(['demo-2']);
  });

  it('is acknowledged by its answer alone: reading it or not changes nothing, the file keeps it', () => {
    const racine = depot();
    const circuits = [arrete('demo-1', 'Q1 ?')];
    lire(racine, circuits, 0);
    expect(lireFichier(racine).remontees.map(r => r.cle)).toEqual([cle('demo-1')]);
    lire(racine, circuits, 2);
    expect(lireFichier(racine).remontees.map(r => r.cle)).toEqual([cle('demo-1')]);
    expect(tickets(lire(racine, circuits, 5))).toEqual(['demo-1']);
  });

  it('no longer once answered: it leaves the file, and the next question of its circuit is new', () => {
    const racine = depot();
    lire(racine, [arrete('demo-1', 'Q1 ?')], 0);
    expect(lire(racine, [tourne('demo-1')], 30)).toEqual([]);
    expect(JSON.stringify(lireFichier(racine))).not.toContain('demo-1');
    const suivante = lire(racine, [arrete('demo-1', 'Q2 ?', { numero: 2 })], 31);
    expect(tickets(suivante)).toEqual(['demo-1']);
    expect(suivante[0]).not.toHaveProperty('representee', true);
  });
});

describe('the file of the stops gone up holds the state « presented at such a time »', () => {
  it('keeps the time of the first going up and of the last presentation of each stop', () => {
    const racine = depot();
    const circuits = [arrete('demo-1', 'Q1 ?')];
    lire(racine, circuits, 0);
    expect(lireFichier(racine).remontees).toEqual([
      { cle: cle('demo-1'), depuis: T0, presentee: T0, lue: T0 },
    ]);
    lire(racine, circuits, 5);
    expect(lireFichier(racine).remontees).toEqual([
      { cle: cle('demo-1'), depuis: T0, presentee: T0 + 5 * MIN, lue: T0 + 5 * MIN },
    ]);
  });

  it('a reading that gives nothing leaves the time of the last presentation as it was', () => {
    const racine = depot();
    const circuits = [arrete('demo-1', 'Q1 ?')];
    lire(racine, circuits, 0);
    lire(racine, circuits, 3);
    expect(lireFichier(racine).remontees[0]!.presentee).toBe(T0);
  });

  it('a restart of the greffon (a reading of a file already written) does not give a question whose re-presentation is not due', () => {
    const racine = depot();
    writeFileSync(
      fichier(racine),
      `${JSON.stringify({ remontees: [{ cle: cle('demo-1'), depuis: T0, presentee: T0, lue: T0 }] })}\n`
    );
    const circuits = [arrete('demo-1', 'Q1 ?')];
    expect(lire(racine, circuits, 4)).toEqual([]);
    expect(tickets(lire(racine, circuits, 5))).toEqual(['demo-1']);
  });

  it('an older file, a list of keys, reads without error: its stops take the time of the reading', () => {
    const racine = depot();
    writeFileSync(fichier(racine), `${JSON.stringify({ remontees: [cle('demo-1')] })}\n`);
    const circuits = [arrete('demo-1', 'Q1 ?')];
    expect(lire(racine, circuits, 0)).toEqual([]);
    expect(tickets(lire(racine, circuits, 5))).toEqual(['demo-1']);
    expect(lireFichier(racine).remontees).toEqual([
      { cle: cle('demo-1'), depuis: T0, presentee: T0 + 5 * MIN, lue: T0 + 5 * MIN },
    ]);
  });

  it('gives every question at once when asked for all of them, as the opening does', () => {
    const racine = depot();
    const circuits = [arrete('demo-1', 'Q1 ?'), arrete('demo-2', 'Q2 ?')];
    lire(racine, circuits, 0);
    const toutes = lire(racine, circuits, 1, 5, { toutes: true });
    expect(tickets(toutes)).toEqual(['demo-1', 'demo-2']);
    expect(toutes.every(q => !q.representee)).toBe(true);
    expect(lire(racine, circuits, 2)).toEqual([]);
  });
});

describe('a circuit integrated gives the reading nothing: it is read on the board alone', () => {
  // The file the reading kept of the ends of circuits it gave.
  const integrations = (racine: string) =>
    path.join(racine, '.claude', 'worktrees', 'integrations-rendues.json');

  it('gives nothing of a circuit integrated since the last reading, nor at a later reading', () => {
    const racine = depot();
    lire(racine, [tourne('demo-1')], 0);
    for (const m of [2, 3, 60]) {
      expect(lire(racine, [integre('demo-1', T0 + 1 * MIN)], m), `à ${m} min`).toEqual([]);
    }
  });

  it('gives only the question of a reading that holds a circuit integrated too', () => {
    const racine = depot();
    lire(racine, [tourne('demo-2')], 0);
    const lot = lire(racine, [arrete('demo-1', 'Q1 ?'), integre('demo-2', T0 + 1 * MIN)], 2);
    expect(tickets(lot)).toEqual(['demo-1']);
    expect(texteDesQuestions(lot)).not.toMatch(/demo-2|Intégré/);
  });

  it('gives nothing of a circuit integrated even when every question is asked for', () => {
    const racine = depot();
    lire(racine, [], 0);
    expect(lire(racine, [integre('demo-1', T0 + 1 * MIN)], 2, 5, { toutes: true })).toEqual([]);
  });

  it('gives the alert of the CI of main beside a circuit integrated, and nothing else', () => {
    const racine = depot();
    lire(racine, [], 0);
    const lot = lire(racine, [integre('demo-1', T0 + 1 * MIN)], 2, 5, {
      ciDeMain: { cle: 'rouge 9', texte: 'CI de main rouge : CI, passage 9.' },
    });
    expect(tickets(lot)).toEqual(['CI de main']);
  });

  it('writes no file of the integrations', () => {
    const racine = depot();
    lire(racine, [tourne('demo-1')], 0);
    lire(racine, [integre('demo-1', T0 + 1 * MIN)], 2);
    expect(existsSync(integrations(racine))).toBe(false);
  });

  it('leaves a file of the integrations an older version wrote as it is', () => {
    const racine = depot();
    const ancien = `${JSON.stringify({ depuis: T0, rendues: [] })}\n`;
    writeFileSync(integrations(racine), ancien);
    expect(lire(racine, [integre('demo-1', T0 + 1 * MIN)], 2)).toEqual([]);
    expect(readFileSync(integrations(racine), 'utf8')).toBe(ancien);
  });

  it('the supervisor stop (« arrete ») of a circuit not integrated gives nothing', () => {
    const racine = depot();
    lire(racine, [tourne('demo-1')], 0);
    expect(lire(racine, [circuitLu('demo-1', { code: 0, arret: 'arrete' })], 2)).toEqual([]);
  });
});

describe('the alert of the CI of main is given once per passage, and clears at the next green', () => {
  const ALERTE = {
    cle: 'rouge 9',
    texte:
      'CI de main rouge : Machine vierge, passage 9 (commit abc1234). Lots entrés depuis le dernier vert : demo-1, demo-2.',
  };
  const AUTRE = { cle: 'rouge 10', texte: 'CI de main rouge : CI, passage 10 (commit def5678).' };

  it('is given to the supervisor as a question that carries its text', () => {
    const lot = lire(depot(), [], 0, 5, { ciDeMain: ALERTE });
    expect(lot).toHaveLength(1);
    expect(lot[0]).toMatchObject({ etape: '5 Intégration', qui: 'superviseur' });
    const texte = texteDesQuestions(lot);
    expect(texte).toContain('CI de main rouge');
    expect(texte).toContain('demo-1, demo-2');
  });

  it('is given once while it stands, and again for another passage', () => {
    const racine = depot();
    expect(lire(racine, [], 0, 5, { ciDeMain: ALERTE })).toHaveLength(1);
    expect(lire(racine, [], 1, 5, { ciDeMain: ALERTE })).toEqual([]);
    expect(lire(racine, [], 2, 5, { ciDeMain: AUTRE })).toHaveLength(1);
  });

  it('clears at the next green (null): the same alert coming back is given again', () => {
    const racine = depot();
    lire(racine, [], 0, 5, { ciDeMain: ALERTE });
    expect(lire(racine, [], 1, 5, { ciDeMain: null })).toEqual([]);
    expect(lire(racine, [], 2, 5, { ciDeMain: ALERTE })).toHaveLength(1);
  });

  it('a reading not made (undefined) keeps the alert given: it is not given again', () => {
    const racine = depot();
    lire(racine, [], 0, 5, { ciDeMain: ALERTE });
    expect(lire(racine, [], 1, 5, {})).toEqual([]);
    expect(lire(racine, [], 2, 5, { ciDeMain: ALERTE })).toEqual([]);
  });

  it('the CI of main not read is an alert too, never silence', () => {
    const lot = lire(depot(), [], 0, 5, {
      ciDeMain: { cle: 'non-lue', texte: 'CI de main non lue : gh ne se lance pas.' },
    });
    expect(texteDesQuestions(lot)).toContain('CI de main non lue');
  });

  it('comes with the questions of the circuits in one reading', () => {
    const lot = lire(depot(), [arrete('demo-1', 'Q1 ?')], 0, 5, { ciDeMain: ALERTE });
    expect(lot).toHaveLength(2);
  });
});

describe('the one message of a reading', () => {
  const q = (ticket: string, extra = {}) => ({
    ticket,
    etape: '3.1 Contrôles',
    question: `Question de ${ticket} ?`,
    qui: 'superviseur',
    commande: `npx grillhouse circuit ${ticket} --reprendre`,
    ...extra,
  });

  it('gives a question in three lines: its head, its question, the command that answers it', () => {
    expect(texteDesQuestions([q('demo-1', { arret: 'controles' })])).toBe(
      'Question · demo-1 · 3.1 Contrôles · controles\nQuestion de demo-1 ?\n→ npx grillhouse circuit demo-1 <réponse>'
    );
  });

  it('leaves the list of the answers out of the question, and names who answers when it is not the supervisor', () => {
    const texte = texteDesQuestions([
      q('demo-1', {
        qui: 'responsable',
        question:
          'Quel mot ? Le superviseur répond par une commande du circuit : `--reprendre` ou `--arreter`.',
      }),
    ]);
    expect(texte).toBe(
      'Question · demo-1 · 3.1 Contrôles · au responsable\nQuel mot ?\n→ npx grillhouse circuit demo-1 <réponse>'
    );
  });

  it('keeps the command of a question of no circuit as it is', () => {
    const texte = texteDesQuestions([
      q('CI de main', { etape: '5 Intégration', commande: 'gh run list --branch main' }),
    ]);
    expect(texte).toContain('→ gh run list --branch main');
  });

  it('bears the sigle of another project, and plays its command in its folder', () => {
    const texte = texteDesQuestions([q('SH-1'), q('SH-2', { representee: true })], {
      sigle: 'SH',
      dossier: '/projets/synthhub',
    });
    expect(texte).toBe(
      [
        '[SH] Question · SH-1 · 3.1 Contrôles',
        'Question de SH-1 ?',
        '→ env -C /projets/synthhub npx grillhouse circuit SH-1 <réponse>',
        '[SH] Toujours sans réponse · SH-2 · 3.1 Contrôles',
        '→ env -C /projets/synthhub npx grillhouse circuit SH-2 <réponse> ou --chez-le-responsable',
      ].join('\n')
    );
  });

  it('groups the questions of one reading in one text', () => {
    const texte = texteDesQuestions([q('demo-1'), q('demo-2')]);
    expect(texte).toContain('Question · demo-1 · 3.1 Contrôles');
    expect(texte).toContain('Question · demo-2 · 3.1 Contrôles');
  });

  it('says that a question presented again still waits for an answer, and names the answer « chez le responsable » beside the command of the circuit', () => {
    const q1 = q('demo-1');
    expect(texteDesQuestions([{ ...q1, representee: true }])).toBe(
      'Toujours sans réponse · demo-1 · 3.1 Contrôles\n→ npx grillhouse circuit demo-1 <réponse> ou --chez-le-responsable'
    );
    expect(texteDesQuestions([q1])).not.toMatch(/sans réponse/i);
  });

  it('keeps the lines of a question on several lines', () => {
    const texte = texteDesQuestions([q('demo-1', { question: 'Ligne 1\nLigne 2' })]);
    expect(texte).toContain('Ligne 1\nLigne 2\n→ ');
  });

  it('asks the session to launch no wait: the greffon pushes the questions and the answer acknowledges them', () => {
    const texte = texteDesQuestions([q('demo-1'), q('demo-2')]);
    expect(texte).not.toContain('--attendre');
    expect(texte).not.toMatch(/relance l'attente/i);
    expect(texte).not.toContain('run_in_background');
  });

  it('a wait that is no more: no name of the old wait is published', () => {
    for (const nom of ['attendreUneQuestion', 'verrouDeLAttente', 'RELANCE']) {
      expect(nom in superviseur, nom).toBe(false);
    }
    expect(typeof (superviseur as Record<string, unknown>).relever).toBe('function');
  });
});

describe('the opening of the session of supervision', () => {
  const ouvrir = (racine: string, circuits: Circuit[]) =>
    circuitsALOuverture(racine, {
      fermes: aucun,
      circuitsDe: () => Promise.resolve(circuits),
      ticketsDe: () => [],
    });

  it('does not say to launch a wait: the greffon pushes the questions and the answer acknowledges them', async () => {
    const texte = await ouvrir(depot(), []);
    expect(texte).not.toContain('--attendre');
    expect(texte).not.toContain('run_in_background');
    expect(texte).not.toContain('Relance-la');
    expect(texte).toMatch(/greffon/);
    expect(texte).toMatch(/réponse/);
  });

  it('lists every question that waits, those already pushed included, with its question and its answer', async () => {
    const racine = depot();
    const circuits = [arrete('demo-1', 'Q1 ?'), arrete('demo-2', 'Q2 ?')];
    lire(racine, circuits, 0);
    const texte = await ouvrir(racine, circuits);
    for (const t of ['demo-1', 'demo-2']) {
      expect(texte).toContain(t);
      expect(texte).toContain(`→ npx grillhouse circuit ${t} <réponse>`);
    }
    expect(texte).toContain('Q1 ?');
    expect(texte).toContain('Q2 ?');
  });

  it('writes the questions with the lines of the shared rendering of the questions', async () => {
    const circuits = [arrete('demo-1', 'Quel paquet lève ce rouge ?')];
    const texte = await ouvrir(depot(), circuits);
    const message = texteDesQuestions(questionsEnAttente(depot(), circuits, { fermes: aucun }));
    expect(message).toBe(
      'Question · demo-1 · 3.1 Contrôles · controles\nQuel paquet lève ce rouge ?\n→ npx grillhouse circuit demo-1 <réponse>'
    );
    expect(texte).toContain(message);
  });

  it('names a circuit ended without its issue with the command that resumes it', async () => {
    const texte = await ouvrir(depot(), [sansIssue('demo-2')]);
    expect(texte).toMatch(
      /demo-2 a fini sans son issue .*2\.1 Preuve du rouge.*`npx grillhouse circuit demo-2 --reprendre`/
    );
  });

  it('counts the questions it lists as presented: the next reading gives none before the re-presentation', async () => {
    const racine = depot();
    const circuits = [arrete('demo-1', 'Q1 ?')];
    await ouvrir(racine, circuits);
    const presentee = lireFichier(racine).remontees[0]!.presentee;
    expect(lireFichier(racine).remontees.map(r => r.cle)).toEqual([cle('demo-1')]);
    expect(
      relever(racine, circuits, { fermes: aucun, maintenant: presentee + 1, rappelMs: 5 * MIN })
    ).toEqual([]);
  });

  it('names no circuit integrated, writes no file of the integrations, and the next reading gives none', async () => {
    const racine = depot();
    const fini = [integre('demo-1', Date.now() - 1000)];
    const texte = await ouvrir(racine, fini);
    expect(texte).not.toContain('demo-1');
    expect(
      relever(racine, fini, { fermes: aucun, maintenant: Date.now() + 1000, rappelMs: 5 * MIN })
    ).toEqual([]);
    expect(existsSync(path.join(racine, '.claude', 'worktrees', 'integrations-rendues.json'))).toBe(
      false
    );
  });
});
