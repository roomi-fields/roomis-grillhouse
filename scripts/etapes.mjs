// The steps of a ticket, numbered one by one, the automatic ones included, as a pipeline of
// GitLab CI or Zuul numbers and names each of its stages, and the stops of its circuit: the one
// list, which the circuit (scripts/circuit.mjs), the board (scripts/tableau.mjs) and the texts
// read.
//
// - A step: its number, its title, who works there (`qui`: the role agents, or AUTOMATIQUE for a
//   step the circuit leads itself), whether it runs for each component of the ticket's title
//   (`parComposant`) or once, and the step of the circuit's state it is (`etat`: the `etape` of
//   `.claude/worktrees/<ticket>.circuit.json`, the final pass being the checks once `finale`),
//   null for a step out of the circuit.
// - The arbitrage has two roles: the technical referent settles a design question, the regulator
//   a stop of the circuit.
// - The questioning (2.1), a sub-step of the arbitrage, numbers no step again: the questionneur
//   asks its questions of the ticket's plan, before step 3, and of a decision of the regulator,
//   inside step 2, as Amazon's bar raiser, the challenge and response of a cockpit and the devil's
//   advocate of a design review; it decides nothing, and its rounds with the author are a bounded
//   loop of their own (`tour n/4`), apart from the arbitrage's (`arrêt n/3`).
// - A step that runs a bounded loop declares it (`boucle`: its label and its maximum, the pass
//   that stops it): the testeur's sessions after a refused proof, the developpeur's sessions, the
//   reviews, the same stop come back after a RELANCE of the regulator. The circuit stops each loop
//   at its maximum and writes its count in its state (`boucles`, by step number); the board shows
//   « <label> <n>/<max> » on the ticket's line from the second pass.
// - The stops of the circuit, each by its name and its exit code (ARRETS): the circuit ends on one
//   with its code, and its header says when.
// - The table of the stops (TABLE_DES_ARRETS, below): each kind of stop and its gesture.
import { A_REPASSER } from './vitest-config/pression.mjs';

// Who works at a step the circuit leads itself, with no agent.
export const AUTOMATIQUE = 'automatique';

export const ETAPES = [
  { numero: 1, titre: 'Exploration', qui: ['explorateur'], parComposant: false, etat: null },
  {
    numero: 2,
    titre: 'Arbitrage',
    qui: ['referent-technique', 'regulateur'],
    parComposant: false,
    etat: null,
    boucle: { libelle: 'arrêt', max: 3 },
  },
  {
    numero: 2.1,
    titre: 'Questionnement',
    qui: ['questionneur'],
    parComposant: false,
    etat: null,
    boucle: { libelle: 'tour', max: 4 },
  },
  {
    numero: 3,
    titre: 'Tests',
    qui: ['testeur'],
    parComposant: true,
    etat: 'testeur',
    boucle: { libelle: 'essai', max: 3 },
  },
  { numero: 4, titre: 'Preuve du rouge', qui: [AUTOMATIQUE], parComposant: true, etat: 'preuve' },
  {
    numero: 5,
    titre: 'Code',
    qui: ['developpeur'],
    parComposant: true,
    etat: 'developpeur',
    boucle: { libelle: 'essai', max: 3 },
  },
  { numero: 6, titre: 'Contrôles', qui: [AUTOMATIQUE], parComposant: true, etat: 'controles' },
  {
    numero: 7,
    titre: 'Passe finale',
    qui: [AUTOMATIQUE],
    parComposant: false,
    etat: 'controles',
    finale: true,
  },
  {
    numero: 8,
    titre: 'Relecture',
    qui: ['relecteur'],
    parComposant: false,
    etat: 'relecture',
    boucle: { libelle: 'tour', max: 3 },
  },
  { numero: 9, titre: 'Intégration', qui: [AUTOMATIQUE], parComposant: false, etat: 'integration' },
  {
    numero: 10,
    titre: 'File : main, poussée, CI',
    qui: [AUTOMATIQUE],
    parComposant: false,
    etat: 'file',
  },
];

// The exit code of each stop of the circuit.
export const ARRETS = {
  lancement: 10,
  bloqué: 11,
  'sans-fiche': 12,
  preuve: 13,
  controles: 14,
  'sans-livraison': 15,
  'relecture-arret': 16,
  integration: 17,
  question: 18,
  'hors-portee': 19,
  besoin: 20,
  'composants-manquants': 21,
  questionnement: 22,
  'a-repasser': A_REPASSER,
};

// The role that settles a stop of the circuit.
export const REGULATEUR = 'regulateur';

// A role in words.
const NOMS = {
  'referent-technique': 'référent technique',
  regulateur: 'régulateur',
  developpeur: 'développeur',
};
export const nomDuRole = role => NOMS[role] ?? role;

// The step <e> in words, « 5 Code ».
export const libelle = e => `${e.numero} ${e.titre}`;

// The step of a circuit's state (`etape`, `finale`), or null (« integre », an unknown step).
export const etapeDuCircuit = ({ etape, finale }) =>
  ETAPES.find(
    e => e.etat === etape && Boolean(e.finale) === (etape === 'controles' && finale === true)
  ) ?? null;

// The step where the role agent <role> works, or null for any other agent.
export const etapeDuRole = role =>
  role === AUTOMATIQUE ? null : (ETAPES.find(e => e.qui.includes(role)) ?? null);

// The step where the technical referent and the regulator work.
export const ARBITRAGE = ETAPES.find(e => e.qui.includes(REGULATEUR));

// The role that questions a plan or a decision, and its step.
export const QUESTIONNEUR = 'questionneur';
export const QUESTIONNEMENT = ETAPES.find(e => e.qui.includes(QUESTIONNEUR));

// Whether the role agent <role> judges a plan or a stop (the arbitrage, the questioning), and so
// delivers nothing to the lot.
export const juge = role => [ARBITRAGE, QUESTIONNEMENT].includes(etapeDuRole(role));

// The table of the stops and their gesture: the written policy of the circuit's stops, as Zuul
// and GitHub's merge queue write their bounded retries and their failure policy, and as the
// sheriffs of Chromium quarantine a flaky test by a rule, not by a judgement. The circuit
// (scripts/circuit.mjs) tries its lines in their order on each stop, and on the regulator's
// decision: a gesture the table names, it applies itself, with no regulator; the regulator is
// launched for what no line settles, and for the line that sends to him. Each line: `genre`, the
// kind of stop as the circuit reads it in its structured results and its state; `geste`, what
// follows; `cas`, the case of BPScript 320.3 (2026-10-20) it would have settled, by its stop (A)
// or its decision (D) in the analysis of that ticket. The gestures (GESTES):
// - `superviseur`: the circuit ends on the stop, its reason saying why, for the supervisor;
// - `a-repasser`: the circuit ends at 75, which the supervisor plays again at rest;
// - `regulateur`: a session of the regulator settles the stop;
// - `developpeur-du-composant`: the red goes to the developpeur of the component that owns it,
//   never to the one under way: it waits for that component's checks, or, at the final pass, the
//   circuit relaunches that developpeur (the checks of scripts/circuit.mjs);
// - `testeur`: the circuit plays the component again from its testeur.
export const GESTES = [
  'superviseur',
  'a-repasser',
  'regulateur',
  'developpeur-du-composant',
  'testeur',
];

export const TABLE_DES_ARRETS = [
  {
    // The same stop (its name, step and component) after a RELANCE, the copy and the ticket's
    // description unchanged since that decision.
    genre: 'meme-arret-sans-fait-nouveau',
    geste: 'superviseur',
    cas: 'A8 → A9 : RELANCE --reprendre sans contexte, le même arrêt sur la même copie (D9) ; A11 → A13 : le même rouge de la passe finale trois fois (D13, D14)',
  },
  {
    // Checks whose failures all depend on a duration under load (verifier's 75), the integration
    // at 75, or the branch kept in the queue.
    genre: 'a-repasser',
    geste: 'a-repasser',
    cas: 'A12, A17, A18 : un vrai rouge pris pour la charge du processeur (D14, D20, D21) ; seul le code 75 du vérificateur dit la charge',
  },
  {
    // A red whose findings are all to settle (SARIF `genre` a-arbitrer), which no developpeur
    // settles.
    genre: 'a-arbitrer',
    geste: 'regulateur',
    cas: 'A16 : la garde consommateurs-arbitres attend un arbitrage, que seul le régulateur écrit (D19, juste)',
  },
  {
    // A red that belongs to another component of the title than the one whose checks run.
    genre: 'rouge-d-un-autre-composant',
    geste: 'developpeur-du-composant',
    cas: 'A4, A6, A8–A10 : la garde des mots de 030-binder rendue aux développeurs de 050, 130 et 900 (D5, D7, D9–D11)',
  },
  {
    // A developpeur's sheet whose `renvoi` names the testeur of a component of the title up to
    // his own.
    genre: 'renvoi-au-testeur',
    geste: 'testeur',
    cas: 'A5, A7 : « Agent : testeur » non lu, les tests périmés de 050 et de 130 (D6, D8) ; A2 (D2)',
  },
  {
    // On the supervisor's answer to a question, a component the title gained since the stop.
    genre: 'composant-ajoute',
    geste: 'testeur',
    cas: 'A3 : 020-loader mis au titre, puis RELANCE testeur 020-loader (D4) ; A14 : 040-checker, puis testeur 040-checker (D17)',
  },
  {
    // The ticket's description changed while the stop was settled, a criterion added: the circuit
    // then admits only a RELANCE from a testeur.
    genre: 'critere-neuf',
    geste: 'testeur',
    cas: 'D15 : une consigne neuve sur le fond donnée au développeur de 030-binder sans test (A14), rendue au testeur de 040-checker (D17)',
  },
];

// The line of the table for the kind of stop <genre>, or null.
export const gesteDe = genre => TABLE_DES_ARRETS.find(l => l.genre === genre) ?? null;
