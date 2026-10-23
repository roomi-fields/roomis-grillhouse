// The steps of a ticket, the tree of its circuit, as a pipeline of GitLab CI shows its stages and
// their jobs and GitHub Actions its jobs and their steps, and the stops of its circuit: the one
// list, which the circuit (scripts/circuit.mjs), the board (scripts/tableau.mjs), the bilan
// (scripts/bilan.mjs) and the texts read.
//
// - A step (ETAPES): its number (« 2 », « 2.3 »), its title, who works there (`qui`: the role
//   agents, or AUTO for a step the circuit leads itself; none for a step that only holds its
//   sub-steps), whether it runs for each component of the ticket's title (`parComposant`), its
//   sub-steps (`sous`), and the step of the circuit's state it is (`etat`: the `etape` of
//   `.claude/worktrees/<ticket>.circuit.json`, the final pass being the checks once `finale`).
//   A step that runs only for a project that declares it names the key of that declaration under
//   `grillhouse` of the project's package.json (`declaration`): the board shows it only there.
//   The opening reads its sub-steps elsewhere in the state: the survey of the components by its
//   start while it runs (`releve`) and by its stop (`arrets`), the questioning of the plan by the
//   questioning under way (`questionnement`) and by its stop. SUITE is the tree in its order, each
//   step before its sub-steps.
// - A step carries as many bounded loops as it needs (`boucles`): each its key (`cle`, which
//   keys its count in the state's `boucles`), its label, its maximum (`max`, the pass that stops
//   it; null for the components, whose number is the title's) and the sub-steps it spans (`sur`;
//   the step and all its sub-steps without it): the components of the title, the testwriter's
//   sessions after a refused proof, the developpeur's sessions with their checks, the reviews. The
//   circuit stops each loop at its maximum and writes its count in its state; the board shows
//   « <label> <n>/<max> » on the ticket's line from the second pass.
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
        releve: true,
        arrets: ['composants-manquants'],
      },
      {
        numero: '1.2',
        titre: 'Questionnement',
        qui: ['questionneur'],
        etat: null,
        questionnement: 'plan',
        arrets: ['questionnement'],
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
      {
        numero: '2.1',
        titre: 'Tests',
        qui: ['testwriter'],
        parComposant: true,
        etat: 'testwriter',
      },
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
  {
    numero: '3',
    titre: 'Passe finale',
    qui: [AUTO],
    etat: 'controles',
    finale: true,
    sous: [
      {
        numero: '3.1',
        titre: 'Régénération des références',
        qui: [AUTO],
        etat: 'references',
        declaration: 'references',
        arrets: ['references'],
      },
    ],
  },
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

// The bounded loop of key <cle>.
export const boucle = cle => SUITE.flatMap(e => e.boucles ?? []).find(b => b.cle === cle) ?? null;

// The loops that run at the step <etape>: those of each step that spans it, itself or its parent.
export const bouclesDe = etape => {
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
  'hors-portee': 19,
  besoin: 20,
  'composants-manquants': 21,
  questionnement: 22,
  references: 23,
  'hors-plan': 24,
  'a-repasser': A_REPASSER,
};

// The role that questions a plan.
export const QUESTIONNEUR = 'questionneur';

// A role in words.
const NOMS = { developpeur: 'développeur' };
export const nomDuRole = role => NOMS[role] ?? role;

// Who works at the step <e>, in words: its roles' names.
export const quiDe = e => e.qui.map(nomDuRole).join(' ⇄ ');

// The step <e> in words, « 2.3 Code ».
export const libelle = e => `${e.numero} ${e.titre}`;

// The step of a circuit's state (`etape`, `finale`, its stop `raison`, its questioning under way
// `questionnement`, an object or its `objet`, the start of its survey of the components under way
// `releve`), or null (« integre », an unknown step): the step
// whose stop or questioning it is, else the step of its `etape`.
export const etapeDuCircuit = ({ etape, finale, raison, questionnement, releve }) => {
  const objet = questionnement?.objet ?? questionnement ?? null;
  return (
    SUITE.find(
      e =>
        (raison && e.arrets?.includes(raison)) ||
        (objet && e.questionnement === objet) ||
        (!raison && !objet && releve && e.releve)
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
// `Circuit · <composant> · geste : <genre> → <geste> (règle : <regle>)`, and the same line in the
// ticket's log.
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
    genre: 'rouge-d-un-autre-composant',
    geste: 'au développeur du composant qui possède le rouge',
    regle:
      'un rouge appartient au composant qui tient son fichier ; il attend ses contrôles, ou à la passe finale va à son développeur',
    cas: 'A4, A6, A8–A10 : la garde des mots de 030-binder rendue aux développeurs de 050, 130 et 900 (D5, D7, D9–D11)',
  },
  {
    genre: 'renvoi-au-testwriter',
    geste: 'au testwriter du composant que la fiche du développeur nomme',
    regle:
      'le rouge qui reste est dans les tests d’un composant du titre, le sien ou un d’avant (`renvoi` de sa fiche)',
    cas: 'A5, A7 : « Agent : testwriter » non lu, les tests périmés de 050 et de 130 (D6, D8) ; A2 (D2)',
  },
  {
    genre: 'regeneration',
    geste: 'à la régénération des références (3.1), puis la passe finale restreinte',
    regle:
      'chaque rouge de la passe finale est celui d’une référence que le projet déclare (`grillhouse.references`)',
    cas: 'BP 320.9 : 163 min d’attente pour régénérer à la main l’index des interfaces, le plafond et l’empreinte',
  },
  {
    genre: 'rien-a-livrer',
    geste: 'aux contrôles du composant, qui jugent son lot',
    regle:
      'un développeur qui ne change aucun fichier de son composant n’a rien à livrer quand ses contrôles sont verts ; rouges, l’arrêt monte (sans-livraison)',
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
  'Le superviseur répond par une commande du circuit : `--reprendre` (avec `--contexte`) ou `--depuis <testwriter|developpeur> <composant> --contexte`, `--etendre <composant>` (le plan gagne ce composant), ou `--arreter`.';

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
      'Un rouge reste, que le circuit ne rend à aucun développeur, ou que trois séances n’ont pas levé : quel composant le lève, avec quel contexte, ou le plan doit-il s’étendre ?',
    'sans-livraison':
      'Le développeur ne change rien et le rouge reste : quel composant le lève, avec quel contexte, ou le plan doit-il changer ?',
    'relecture-arret':
      'La relecture ne rend pas le lot à un agent du titre (un constat sans destinataire valide, un critère en cause, ou la troisième relecture rendue) : que devient le plan, et qui reprend ?',
    integration:
      'L’intégration refuse le lot, ou la file rouvre le ticket : que corrige le lot, et qui le reprend ?',
    'hors-portee':
      'L’agent se dit bloqué hors de sa portée : le plan s’étend-il au composant qu’il nomme, ou un autre agent lève-t-il le reste ?',
    besoin: 'Une réponse manque pour avancer : laquelle ?',
    'composants-manquants':
      'Le relevé trouve des composants que le titre ne nomme pas : le plan les gagne-t-il (`--etendre`), ou restent-ils hors du titre (`npx grillhouse composants-affectes <ticket> --admettre <composant> --raison <texte>`, puis `--reprendre`) ?',
    questionnement:
      'Le questionneur questionne le plan : le plan change-t-il (`bd update`), ou reste-t-il tel quel ? `--reprendre` le fait passer tel qu’il est alors.',
    references:
      'La régénération des références change une référence ou un fichier que le plan ne nomme pas, ou ne lève pas leurs rouges : le plan les nomme-t-il, ou qui corrige le lot ?',
    'hors-plan':
      'La séance écrit hors du plan du ticket : le plan s’étend-il à ce paquet (`--etendre`), ou l’écriture est-elle refusée (`--reprendre` avec son contexte) ?',
  }).map(([arret, question]) => [arret, { question: `${question} ${REPONSES}`, qui: SUPERVISEUR }])
);

// The question of the stop <arret>, `{ question, qui }`, or null for a gesture.
export const monteeDe = arret => MONTEES[arret] ?? null;
