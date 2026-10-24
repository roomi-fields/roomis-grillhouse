// The steps of a ticket, the tree of its circuit, as a pipeline of GitLab CI shows its stages and
// their jobs and GitHub Actions its jobs and their steps, and the stops of its circuit: the one
// list, which the circuit (scripts/circuit.mjs), the board (scripts/tableau.mjs), the bilan
// (scripts/bilan.mjs) and the texts read.
//
// - A step (ETAPES): its number (« 2 », « 4.1 »), its title, who works there (`qui`: the role
//   agents, or AUTO for a step the circuit leads itself; none for a step that only holds its
//   sub-steps), its sub-steps (`sous`), and the step of the circuit's state it is (`etat`: the
//   `etape` of `.claude/worktrees/<ticket>.circuit.json`, the final pass being the checks once
//   `finale`). Every step runs once for the whole ticket, as a merge request has one author of
//   its tests and one of its code, one CI on the whole and one review: one session of the
//   testwriter (2) and one of the developpeur (3) carry the whole plan.
//   The plan (1) is read elsewhere in the state: by the work on the plan under way
//   (`questionnement`, the explorateur's or the questionneur's session) and by its stop (`arrets`).
//   SUITE is the tree in its order, each step before its sub-steps.
// - A step carries as many bounded loops as it needs (`boucles`), each spanning the step and its
//   sub-steps: each its key (`cle`, which keys its count in the state's `boucles`), its label and
//   its maximum (`max`, the pass that stops it): the testwriter's sessions after a refused proof,
//   the developpeur's sessions with their checks, the reviews. The circuit stops each loop at its
//   maximum and writes its count in its state; the board shows « <label> <n>/<max> » on the
//   ticket's line from the second pass.
// - The stops of the circuit, each by its name and its exit code (ARRETS): the circuit ends on one
//   with its code, and its header says when.
// - The gestures of the circuit (GESTES, below): what it does itself on a stop a rule settles,
//   with no session.
// - The question of each other stop (MONTEES, below): what goes up to the supervisor, and who
//   must answer it.
import { A_REPASSER } from './vitest-config/pression.mjs';

// Who works at a step the circuit leads itself, with no agent.
export const AUTO = 'auto';

export const ETAPES = [
  {
    numero: '1',
    titre: 'Plan',
    qui: ['explorateur', 'questionneur'],
    etat: null,
    questionnement: 'plan',
    arrets: ['questionnement'],
  },
  {
    numero: '2',
    titre: 'Tests',
    qui: ['testwriter'],
    etat: 'testwriter',
    boucles: [{ cle: 'tests', libelle: 'essai', max: 3 }],
    sous: [{ numero: '2.1', titre: 'Preuve du rouge', qui: [AUTO], etat: 'preuve' }],
  },
  {
    numero: '3',
    titre: 'Code',
    qui: ['developpeur'],
    etat: 'developpeur',
    boucles: [{ cle: 'code', libelle: 'essai', max: 3 }],
    sous: [{ numero: '3.1', titre: 'Contrôles', qui: [AUTO], etat: 'controles' }],
  },
  {
    numero: '4',
    titre: 'Passe finale et relecture',
    qui: [],
    etat: null,
    sous: [
      { numero: '4.1', titre: 'Passe finale', qui: [AUTO], etat: 'controles', finale: true },
      {
        numero: '4.2',
        titre: 'Régénération des références',
        qui: [AUTO],
        etat: 'references',
        arrets: ['references'],
      },
      {
        numero: '4.3',
        titre: 'Relecture',
        qui: ['relecteur'],
        etat: 'relecture',
        boucles: [{ cle: 'relecture', libelle: 'tour', max: 3 }],
      },
    ],
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

// The bounded loop of key <cle>.
export const boucle = cle => SUITE.flatMap(e => e.boucles ?? []).find(b => b.cle === cle) ?? null;

// The loops that run at the step <etape>: its own and its parent's.
export const bouclesDe = etape => {
  const parent = ETAPES.find(e => e === etape || e.sous?.includes(etape));
  return [...new Set([parent, etape])].flatMap(e => e?.boucles ?? []);
};

// The agents who write the lot, the testwriter its tests and the developpeur its code: the roles a
// blocking finding of the reviewer names.
export const AGENTS_DU_LOT = ['testwriter', 'developpeur'];

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
  'hors-portee': 19,
  besoin: 20,
  questionnement: 22,
  references: 23,
  'hors-plan': 24,
  'a-repasser': A_REPASSER,
};

// The role that writes the plan and answers its questions once, and the role that questions it.
export const EXPLORATEUR = 'explorateur';
export const QUESTIONNEUR = 'questionneur';

// A role in words.
const NOMS = { developpeur: 'développeur' };
export const nomDuRole = role => NOMS[role] ?? role;

// Who works at the step <e>, in words: its roles' names.
export const quiDe = e => e.qui.map(nomDuRole).join(' ⇄ ');

// The step <e> in words, « 3 Code ».
export const libelle = e => `${e.numero} ${e.titre}`;

// The step of a circuit's state (`etape`, `finale`, its stop `raison`, the work on its plan under
// way `questionnement`, an object or its `objet`), or null (« integre », an unknown step): the step
// whose stop or work on the plan it is, else the step of its `etape`.
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

// The step where the role agent <role> works, or null for any other agent.
export const etapeDuRole = role =>
  role === AUTO ? null : (SUITE.find(e => e.qui.includes(role)) ?? null);

// The gestures of the circuit: what it does itself on a stop a rule settles, as a CI applies its
// rules (retry, regenerate, skip a job without object) without asking anyone, and as the sheriffs
// of Chromium quarantine a flaky test by a rule, not by a judgement. Each gesture: `genre`, its
// name as the circuit writes it at the ticket and in the log; `geste`, what the circuit does;
// `regle`, the rule that settles it; `cas`, the case of BPScript it settles (the analysis of 320.3,
// its stop A or its decision D, or that of 320.9). On each one, the circuit writes at the ticket
// `Circuit · geste : <genre> → <geste> (règle : <regle>)`, and the same line in the ticket's log.
export const GESTES = [
  {
    genre: 'a-repasser',
    geste: 'le circuit finit à 75, que le superviseur rejoue au repos par --reprendre',
    regle: 'seul le code 75 du vérificateur dit la charge de la machine',
    cas: 'A12, A17, A18 : un vrai rouge pris pour la charge du processeur (D14, D20, D21)',
  },
  {
    genre: 'rejeu',
    geste: 'la commande joue une seconde fois',
    regle:
      'une commande des contrôles hors de la passe finale, ou l’intégration, à 75 rejoue une fois avant l’arrêt',
    cas: 'A12 : un contrôle à 75, rejoué avant de conclure à la charge',
  },
  {
    genre: 'renvoi-au-testwriter',
    geste: 'au testwriter, que la fiche du développeur nomme, puis la preuve et le développeur',
    regle: 'le rouge qui reste est dans les tests du lot (`renvoi` de sa fiche)',
    cas: 'A5, A7 : « Agent : testwriter » non lu, les tests périmés de 050 et de 130 (D6, D8) ; A2 (D2)',
  },
  {
    genre: 'regeneration',
    geste:
      'à la régénération des références (4.2), puis la passe finale restreinte à ce qu’elle change',
    regle:
      'un rouge de la passe finale est celui d’une référence, même mêlé à d’autres : une que le projet déclare (`grillhouse.references`), ou un fichier que le cadre engendre (l’index des interfaces, les turbo.json, les rapports d’API) ; ou la passe abaisse la dette des gardes (`dette.mjs --abaisser`, depuis ses notes)',
    cas: 'BP 320.9 : 292 min autour des références, dont 163 min d’attente pour régénérer à la main l’index des interfaces, le plafond et l’empreinte, des rouges de références mêlés à d’autres',
  },
  {
    genre: 'rien-a-livrer',
    geste: 'aux contrôles, qui jugent le lot',
    regle:
      'un développeur qui ne change aucun fichier du plan n’a rien à livrer quand les contrôles sont verts ; rouges, l’arrêt monte (sans-livraison)',
    cas: 'BP 320.9 : 995-tools n’a rien à livrer, 4 montées et 49 min (B5)',
  },
];

// The gesture of name <genre>, or null.
export const gesteDe = genre => GESTES.find(g => g.genre === genre) ?? null;

// Who answers a question of the circuit: the supervisor, or the owner, whose question the
// supervisor carries.
export const SUPERVISEUR = 'superviseur';
export const RESPONSABLE = 'responsable';

// The commands by which the supervisor answers a question (scripts/circuit.mjs): resume, extend
// the plan, stop.
const REPONSES =
  'Le superviseur répond par une commande du circuit : `--reprendre` (avec `--contexte`) ou `--depuis <testwriter|developpeur>` (avec `--contexte`), `--etendre <paquet>` (le plan gagne ce paquet, puis l’étape en cours reprend), ou `--arreter`.';

// The question of each stop no gesture settles, as a CI calls a person only for what no rule
// settles (the approval of a review): every stop of ARRETS but « a-repasser », a gesture. The
// circuit ends on the stop, its state carrying the question (`question`: `{ arret, fait, piece,
// question, qui }`: the fact, its piece, file:line or command and output, the question and who must
// answer it), for the supervisor, who answers by a command of the circuit and carries to the owner
// what is his (`qui` responsable: the reviewer's question on a real word of the language).
export const MONTEES = Object.fromEntries(
  Object.entries({
    lancement:
      'Le lanceur s’arrête avant la séance : la machine se répare-t-elle, pour reprendre ?',
    bloqué:
      'La séance n’a plus bougé, et le circuit l’a arrêtée : reprendre l’étape, ou arrêter le circuit ?',
    'sans-fiche':
      'La séance finit deux fois sans fiche conforme : reprendre l’étape, ou arrêter le circuit ?',
    preuve:
      'La troisième preuve du rouge refuse le lot de tests : quel contexte donner au testwriter, ou le plan doit-il changer ?',
    controles:
      'Un rouge reste, que le circuit ne rend pas au développeur (hors du plan, sans fichier, à arbitrer), ou que trois séances n’ont pas levé : avec quel contexte le lever, ou le plan doit-il s’étendre ?',
    'sans-livraison':
      'Le développeur ne change rien et le rouge reste : avec quel contexte le lever, ou le plan doit-il changer ?',
    'relecture-arret':
      'La relecture ne rend pas le lot à un agent (un constat sans destinataire valide, un critère en cause, ou la troisième relecture rendue) : que devient le plan, et qui reprend ?',
    integration:
      'L’intégration refuse le lot, ou la file rouvre le ticket : que corrige le lot, et qui le reprend ?',
    'hors-portee':
      'L’agent se dit bloqué hors de sa portée : le plan s’étend-il au paquet qu’il nomme, ou un autre agent lève-t-il le reste ?',
    besoin: 'Une réponse manque pour avancer : laquelle ?',
    questionnement:
      'Des questions du plan restent ouvertes après la réponse de l’explorateur : le plan change-t-il (`bd update`), ou reste-t-il tel quel ? `--reprendre` le fait passer tel qu’il est alors.',
    references:
      'La régénération des références change une référence du projet que le plan ne nomme pas, un fichier qu’aucune référence n’écrit, ou sa commande échoue : le plan les nomme-t-il, ou qui corrige le lot ?',
    'hors-plan':
      'La séance écrit hors du plan du ticket : le plan s’étend-il à ce paquet (`--etendre`), ou l’écriture est-elle refusée (`--reprendre` avec son contexte) ?',
  }).map(([arret, question]) => [arret, { question: `${question} ${REPONSES}`, qui: SUPERVISEUR }])
);

// The question of the stop <arret>, `{ question, qui }`, or null for a gesture.
export const monteeDe = arret => MONTEES[arret] ?? null;
