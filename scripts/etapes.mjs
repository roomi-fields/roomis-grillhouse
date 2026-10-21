// The steps of a ticket, the tree of its circuit, as a pipeline of GitLab CI shows its stages and
// their jobs and GitHub Actions its jobs and their steps, and the stops of its circuit: the one
// list, which the circuit (scripts/circuit.mjs), the board (scripts/tableau.mjs), the bilan
// (scripts/bilan.mjs) and the texts read.
//
// - A step (ETAPES): its number (« 2 », « 2.3 »), its title, who works there (`qui`: the role
//   agents, or AUTO for a step the circuit leads itself; none for a step that only holds its
//   sub-steps), its short form on the board's line where the roles' names do not hold in its
//   width (`quiCourt`, the roles keeping their whole name everywhere else), whether it runs for each component of the ticket's title (`parComposant`), its
//   sub-steps (`sous`), and the step of the circuit's state it is (`etat`: the `etape` of
//   `.claude/worktrees/<ticket>.circuit.json`, the final pass being the checks once `finale`).
//   The opening reads its sub-steps elsewhere in the state: the survey of the components by its
//   stop (`arrets`), the questioning of the plan by the questioning under way (`questionnement`)
//   and by its stop. SUITE is the tree in its order, each step before its sub-steps.
// - A step carries as many bounded loops as it needs (`boucles`): each its key (`cle`, which
//   keys its count in the state's `boucles`), its label, its maximum (`max`, the pass that stops
//   it; null for the components, whose number is the title's) and the sub-steps it spans (`sur`;
//   the step and all its sub-steps without it): the components of the title, the testeur's
//   sessions after a refused proof, the developpeur's sessions with their checks, the rounds of
//   a questioning, the reviews, the same stop come back after a RELANCE of the regulator. The
//   circuit stops each loop at its maximum and writes its count in its state; the board shows
//   « <label> <n>/<max> » on the ticket's line from the second pass.
// - The arbitrage of a stop (ARBITRAGE) stands out of the sequence, under the stopped step: the
//   regulator settles the stop, and the questionneur asks its questions of his decision before it
//   is applied, as Amazon's bar raiser and a cockpit's challenge and response; it has no number.
// - The stops of the circuit, each by its name and its exit code (ARRETS): the circuit ends on one
//   with its code, and its header says when.
// - The table of the stops (TABLE_DES_ARRETS, below): each kind of stop and its gesture.
import { A_REPASSER } from './vitest-config/pression.mjs';

// Who works at a step the circuit leads itself, with no agent.
export const AUTO = 'auto';

// The rounds of a questioning, of the plan at 1.2 and of a decision at the arbitrage.
const TOURS = { cle: 'questionnement', libelle: 'tour', max: 4 };

export const ETAPES = [
  { numero: '0', titre: 'Exploration', qui: ['explorateur'], etat: null },
  {
    numero: '1',
    titre: 'Ouverture',
    qui: [],
    etat: null,
    sous: [
      {
        numero: '1.1',
        titre: 'Relevé des composants',
        qui: [AUTO],
        etat: null,
        arrets: ['composants-manquants'],
      },
      {
        numero: '1.2',
        titre: 'Questionnement',
        qui: ['questionneur', 'referent-technique'],
        quiCourt: 'questionneur ⇄ référent',
        etat: null,
        questionnement: 'plan',
        arrets: ['questionnement'],
        boucles: [TOURS],
      },
    ],
  },
  {
    numero: '2',
    titre: 'Composants',
    qui: [],
    parComposant: true,
    etat: null,
    boucles: [
      { cle: 'composant', libelle: 'composant', max: null },
      { cle: 'tests', libelle: 'essai', max: 3, sur: ['2.1', '2.2'] },
      { cle: 'code', libelle: 'essai', max: 3, sur: ['2.3', '2.4'] },
    ],
    sous: [
      { numero: '2.1', titre: 'Tests', qui: ['testeur'], parComposant: true, etat: 'testeur' },
      { numero: '2.2', titre: 'Preuve du rouge', qui: [AUTO], parComposant: true, etat: 'preuve' },
      {
        numero: '2.3',
        titre: 'Code',
        qui: ['developpeur'],
        parComposant: true,
        etat: 'developpeur',
      },
      { numero: '2.4', titre: 'Contrôles', qui: [AUTO], parComposant: true, etat: 'controles' },
    ],
  },
  { numero: '3', titre: 'Passe finale', qui: [AUTO], etat: 'controles', finale: true },
  {
    numero: '4',
    titre: 'Relecture',
    qui: ['relecteur'],
    etat: 'relecture',
    boucles: [{ cle: 'relecture', libelle: 'tour', max: 3 }],
  },
  {
    numero: '5',
    titre: 'Intégration',
    qui: [],
    etat: null,
    sous: [
      { numero: '5.1', titre: 'Commit', qui: [AUTO], etat: 'integration' },
      { numero: '5.2', titre: 'File : main, poussée, CI', qui: [AUTO], etat: 'file' },
    ],
  },
];

// Every step and sub-step, in the order of the tree.
export const SUITE = ETAPES.flatMap(e => [e, ...(e.sous ?? [])]);

// The arbitrage of a stop, out of the sequence, under the stopped step.
export const ARBITRAGE = {
  numero: null,
  titre: "Arbitrage de l'arrêt",
  qui: ['regulateur', 'questionneur'],
  etat: null,
  boucles: [{ cle: 'arret', libelle: 'arrêt', max: 3 }, TOURS],
};

// The bounded loop of key <cle>.
export const boucle = cle =>
  [...SUITE, ARBITRAGE].flatMap(e => e.boucles ?? []).find(b => b.cle === cle) ?? null;

// The loops that run at the step <etape>: those of the arbitrage at the arbitrage; else those of
// each step that spans it, itself or its parent.
export const bouclesDe = etape => {
  if (etape === ARBITRAGE) return ARBITRAGE.boucles;
  const parent = ETAPES.find(e => e === etape || e.sous?.includes(etape));
  return [...new Set([parent, etape])]
    .flatMap(e => e?.boucles ?? [])
    .filter(b => (b.sur ? b.sur.includes(etape.numero) : true));
};

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

// The role that settles a stop of the circuit, and the one that questions a plan or a decision.
export const REGULATEUR = 'regulateur';
export const QUESTIONNEUR = 'questionneur';

// A role in words.
const NOMS = {
  'referent-technique': 'référent technique',
  regulateur: 'régulateur',
  developpeur: 'développeur',
};
export const nomDuRole = role => NOMS[role] ?? role;

// Who works at the step <e>, in words, « questionneur ⇄ référent »: its short form, else its
// roles' names.
export const quiDe = e => e.quiCourt ?? e.qui.map(nomDuRole).join(' ⇄ ');

// The step <e> in words, « 2.3 Code ».
export const libelle = e => `${e.numero} ${e.titre}`;

// The step of a circuit's state (`etape`, `finale`, its stop `raison`, its questioning under way
// `questionnement`, an object or its `objet`), or null (« integre », an unknown step): the step
// whose stop or questioning it is, else the step of its `etape`.
export const etapeDuCircuit = ({ etape, finale, raison, questionnement }) => {
  const objet = questionnement?.objet ?? questionnement ?? null;
  return (
    SUITE.find(
      e => (raison && e.arrets?.includes(raison)) || (objet && e.questionnement === objet)
    ) ??
    SUITE.find(
      e =>
        e.etat !== null &&
        e.etat === etape &&
        Boolean(e.finale) === (etape === 'controles' && finale === true)
    ) ??
    null
  );
};

// The step where the role agent <role> works, the arbitrage for the regulator, or null for any
// other agent.
export const etapeDuRole = role =>
  role === AUTO ? null : ([...SUITE, ARBITRAGE].find(e => e.qui.includes(role)) ?? null);

// The step where a ticket's plan is questioned.
const QUESTIONNEMENT_DU_PLAN = SUITE.find(e => e.questionnement === 'plan');

// Whether the role agent <role> judges a plan or a stop (the questioning of the plan, the
// arbitrage), and so delivers nothing to the lot.
export const juge = role =>
  [QUESTIONNEMENT_DU_PLAN, ARBITRAGE].some(e => role !== AUTO && e.qui.includes(role));

// The table of the stops and their gesture: the written policy of the circuit's stops, as Zuul
// and GitHub's merge queue write their bounded retries and their failure policy, and as the
// sheriffs of Chromium quarantine a flaky test by a rule, not by a judgement. The circuit
// (scripts/circuit.mjs) tries its lines in their order on each stop, and on the regulator's
// decision: a gesture the table names, it applies itself, with no regulator; the regulator is
// launched for what no line settles, and for the line that sends to him. Each line: `genre`, the
// kind of stop as the circuit reads it in its structured results and its state; `geste`, what
// follows; `cas`, the case of BPScript 320.3 (2026-10-20) it would have settled, by its stop (A)
// or its decision (D) in the analysis of that ticket. The gestures (GESTES):
// - `superviseur`: the circuit ends on the stop, its reason saying why, for the supervisor, with
//   no regulator, and the board shows it under its step after « ⤷ Arrêt · superviseur »;
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
    // A component the survey of the ticket finds and its title misses (21): the circuit ends on
    // it at 1.1, before any session.
    genre: 'composants-manquants',
    geste: 'superviseur',
    cas: 'A3 : 020-loader mis au titre en cours de route ; A14 : 040-checker, nommé au critère 13 et absent du titre, rouge à la première passe finale',
  },
  {
    // A questioning of the plan that does not converge at 1.2 (22), a disagreement or a fourth
    // round still questioned.
    genre: 'questionnement',
    geste: 'superviseur',
    cas: 'A14 : 040-checker nommé au critère 13 et absent du titre, que le plan questionné aurait relevé ; D15 : une consigne neuve sur le fond, hors du plan',
  },
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
