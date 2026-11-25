// The steps of a ticket, the tree of its circuit, and the stops of its circuit: the one list,
// which the circuit (scripts/circuit.mjs), the board (scripts/tableau.mjs), the bilan
// (scripts/bilan.mjs) and the texts read. The list of the steps is told here and at circuit.md
// §5.1 alone; the gestures and the stops, at §5.4 and §5.5. The code today holds the long and the
// short circuits; of the direct one, it holds the steps and their rule.
//
// - A step (ETAPES): its number (« 2 », « 4.1 »), its title, the circuits that play it
//   (`circuits`: long, court, direct, `joue`), who works there (`qui`: the role agents, or AUTO for
//   a step the circuit leads itself; none for a step that only holds its sub-steps; a circuit whose
//   roles differ names them in `quiAuCircuit`, `rolesDe`), its sub-steps (`sous`), and the step of the circuit's state it is (`etat`: the
//   `etape` of the state the circuit writes, which the workflow of its ticket holds, the final pass being the checks once
//   `finale`). Every step runs once for the whole ticket, as a merge request has one author of
//   its tests and one of its code, one CI on the whole and one review: one session of the
//   testwriter (2) and one of the developpeur (3) carry the whole plan.
//   The plan (1) is read elsewhere in the state: by the work on the plan under way
//   (`questionnement`, the explorateur's or the questionneur's session) and by its stop (`arrets`).
//   The tri of the discoveries (5.3) is the explorateur's too, once the queue has brought the lot
//   onto main, as Chromium and Mozilla give each new report a verdict before it is filed; so is the
//   gesture of a mechanical ticket (1.1), the command its plan names played in the copy, as Rosie
//   and ClangMR let a tool make a large-scale change at Google; the role's own step stays the plan
//   (`etapeDuRole`).
//   SUITE is the tree in its order, each step before its sub-steps.
// - A step carries as many bounded loops as it needs (`boucles`), each spanning the step and its
//   sub-steps: each its key (`cle`, which keys its count in the state's `boucles`), its label and
//   its maximum (`max`, the pass that stops it): the testwriter's sessions after a refused proof,
//   the developpeur's sessions with their checks, the reviews. A loop a circuit alone runs at a
//   further step stands in `bouclesAuCircuit`: in a direct circuit, which plays no checks (3.1),
//   the sessions of the code still count at the final pass. The circuit stops each loop at its
//   maximum and writes its count in its state; the board shows « <label> <n>/<max> » on the
//   ticket's line from the second pass.
// - The stops of the circuit, each by its name and its exit code (ARRETS): the circuit ends on one
//   with its code, and its header says when.
// - The gestures of the circuit (GESTES, below): what it does itself on a stop a rule settles,
//   with no session.
// - The question of each other stop (MONTEES, below): what goes up to the supervisor, and who
//   must answer it.
import { A_REPASSER } from './codes-de-sortie.mjs';

// Who works at a step the circuit leads itself, with no agent.
export const AUTO = 'auto';

// The role that writes the plan and answers its questions once, and sorts the discoveries of the
// ticket once its lot is on main; the role that questions the plan.
export const EXPLORATEUR = 'explorateur';
// The author of the circuit's own lines, at a ticket and among its kept results.
export const AUTEUR_DU_CIRCUIT = 'circuit';
export const QUESTIONNEUR = 'questionneur';

// The circuits of a ticket: the paths through the list.
const TOUS = ['long', 'court', 'direct'];
const AVEC_PLAN = ['long', 'court'];

// The role of the agent who writes tests and code together in a direct circuit.
const DIRECT = 'direct';

// The sessions of the author of the code, with the passes that judge them.
const BOUCLE_DU_CODE = { cle: 'code', libelle: 'essai', max: 3 };

export const ETAPES = [
  {
    numero: '1',
    titre: 'Plan',
    circuits: AVEC_PLAN,
    qui: ['explorateur', 'questionneur'],
    etat: null,
    questionnement: 'plan',
    arrets: ['questionnement'],
    // The gesture of a mechanical ticket, in the copy, in place of the testwriter and the
    // developpeur.
    sous: [{ numero: '1.1', titre: 'Geste mécanique', circuits: ['court'], qui: [EXPLORATEUR], etat: 'geste' }],
  },
  {
    numero: '2',
    titre: 'Tests',
    circuits: ['long'],
    qui: ['testwriter'],
    etat: 'testwriter',
    boucles: [{ cle: 'tests', libelle: 'essai', max: 3 }],
    sous: [{ numero: '2.1', titre: 'Preuve du rouge', circuits: ['long'], qui: [AUTO], etat: 'preuve' }],
  },
  {
    numero: '3',
    titre: 'Code',
    circuits: TOUS,
    qui: ['developpeur'],
    quiAuCircuit: { direct: [DIRECT] },
    etat: 'developpeur',
    boucles: [BOUCLE_DU_CODE],
    sous: [{ numero: '3.1', titre: 'Contrôles', circuits: AVEC_PLAN, qui: [AUTO], etat: 'controles' }],
  },
  {
    numero: '4',
    titre: 'Passe finale et relecture',
    circuits: TOUS,
    qui: [],
    etat: null,
    sous: [
      {
        numero: '4.1',
        titre: 'Passe finale',
        circuits: TOUS,
        qui: [AUTO],
        etat: 'controles',
        finale: true,
        bouclesAuCircuit: { direct: [BOUCLE_DU_CODE] },
      },
      {
        numero: '4.2',
        titre: 'Régénération des références',
        circuits: TOUS,
        qui: [AUTO],
        etat: 'references',
        arrets: ['references'],
      },
      {
        numero: '4.3',
        titre: 'Relecture',
        circuits: TOUS,
        qui: ['relecteur'],
        etat: 'relecture',
        boucles: [{ cle: 'relecture', libelle: 'tour', max: 3 }],
      },
    ],
  },
  {
    numero: '5',
    titre: 'Intégration',
    circuits: TOUS,
    qui: [],
    etat: null,
    sous: [
      { numero: '5.1', titre: 'Commit', circuits: TOUS, qui: [AUTO], etat: 'integration' },
      { numero: '5.2', titre: 'File : passe finale, main', circuits: TOUS, qui: [AUTO], etat: 'file' },
      // The tri of the discoveries of the ticket, on the lot entered on main.
      { numero: '5.3', titre: 'Tri des découvertes', circuits: TOUS, qui: [EXPLORATEUR], etat: 'tri' },
    ],
  },
];

// Every step and sub-step, in the order of the tree.
export const SUITE = ETAPES.flatMap(e => [e, ...(e.sous ?? [])]);

// The bounded loop of key <cle>.
export const boucle = cle => SUITE.flatMap(e => e.boucles ?? []).find(b => b.cle === cle) ?? null;

// The loops that run at the step <etape> in the circuit <circuit>: its own, its parent's, and those
// the circuit alone runs there.
export const bouclesDe = (etape, circuit) => {
  const parent = ETAPES.find(e => e === etape || e.sous?.includes(etape));
  return [...new Set([parent, etape])].flatMap(e => [
    ...(e?.boucles ?? []),
    ...(e?.bouclesAuCircuit?.[circuit] ?? []),
  ]);
};

// Whether the circuit <circuit> plays the step of number <numero>.
export const joue = (numero, circuit) =>
  Boolean(SUITE.find(e => e.numero === numero)?.circuits.includes(circuit));

// The roles of the step <e> in the circuit <circuit> (the long one when none is said); none when
// the circuit does not play it.
export const rolesDe = (e, circuit) =>
  e.circuits.includes(circuit ?? 'long') ? (e.quiAuCircuit?.[circuit] ?? e.qui) : [];

// The roles of the step <e> in any circuit.
export const tousLesRolesDe = e => [
  ...new Set([...e.qui, ...Object.values(e.quiAuCircuit ?? {}).flat()]),
];

// The agent who writes the code (3) in the circuit <circuit>.
export const auteurDuCode = circuit =>
  rolesDe(
    SUITE.find(e => e.numero === '3'),
    circuit
  )[0];

// The agents who write the lot of a long or short circuit, the testwriter its tests and the
// developpeur its code.
export const AGENTS_DU_LOT = ['testwriter', 'developpeur'];

// The agents who write the lot of the circuit <circuit>: the roles a blocking finding of the
// reviewer names.
export const agentsDuLot = circuit =>
  circuit === DIRECT ? [auteurDuCode(circuit)] : AGENTS_DU_LOT;

// Every agent who writes the lot of a circuit.
export const AUTEURS_DE_LOT = [...AGENTS_DU_LOT, DIRECT];

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
  // The resumption of the integration of a lot already on main: a lot neither on main nor in the
  // copy (`lot-absent`), or a copy that does not get removed (`copie-gardee`); both at the code of
  // the integration stop.
  'lot-absent': 17,
  'copie-gardee': 17,
  'hors-portee': 19,
  besoin: 20,
  questionnement: 22,
  references: 23,
  'hors-plan': 24,
  inattendu: 25,
  // A session the usage limit stops: the circuit reports itself to the hour the usage returns and
  // resumes the step, no question gone up.
  'limite-d-usage': 26,
  'a-repasser': A_REPASSER,
};

// A role by its agent's name: an agent of the frame's plugin is named bare or scoped by the
// plugin (`grillhouse:<rôle>`), as Claude Code names a plugin's agents and the register writes
// them; the board and the bilan read a role this one way.
export const roleDeLAgent = nom =>
  typeof nom === 'string' ? nom.replace(/^grillhouse:/, '') : null;

// A role in words.
const NOMS = { developpeur: 'développeur' };
export const nomDuRole = role => NOMS[role] ?? role;

// A role as the subject of a sentence, « Le développeur », « L’agent direct ».
export const leRole = role => (role === DIRECT ? 'L’agent direct' : `Le ${nomDuRole(role)}`);

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
    regle: 'une commande des contrôles hors de la passe finale à 75 rejoue une fois avant l’arrêt',
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
      'à la régénération des références (4.2), puis la passe qui juge l’arbre régénéré : après les contrôles, les contrôles du plan encore quand d’autres rouges s’y mêlent, sinon la passe finale qui est due ; après une passe finale, la passe finale restreinte à ce qu’elle change',
    regle:
      'un rouge des contrôles du plan ou de la passe finale est celui d’une référence, même mêlé à d’autres : une que le projet déclare (`grillhouse.references`), ou un fichier que le cadre engendre (l’index des interfaces, les fichiers que le module du langage engendre) ; ou la passe abaisse la dette des gardes (`dette.mjs --abaisser`, depuis ses notes)',
    cas: 'BP 320.9 : 292 min autour des références, dont 163 min d’attente pour régénérer à la main l’index des interfaces, le plafond et l’empreinte, des rouges de références mêlés à d’autres ; BP 320.3.9 : le plafond rouge aux contrôles, laissé à une passe finale qui rejoue les mêmes tests sur le même arbre (6,1 min) ; BP 320.6.5 : un test qui lit les références des paquets, rouge à côté de leur garde, envoyé au développeur, qui n’a rien à livrer puis ne peut pas les écrire',
  },
  {
    genre: 'rejeu-des-engendres',
    geste:
      'avant la preuve du rouge, les contrôles et la passe finale, la commande de chaque fichier engendré (`grillhouse.engendres`) dont un motif `lit` couvre un fichier que le lot change, jouée dans la copie ; ses fichiers entrent au lot comme ceux de 4.2',
    regle:
      'un fichier engendré se construit avant les tests qui le lisent, et le graphe le rejoue quand ses entrées changent (Bazel, Nx, Turborepo) : aucun test du lot ne lit un fichier engendré périmé',
    cas: 'OSD-sf1.25.8 : un ticket qui ajoute des cas de conformité rougit au test qui lit les sommes engendrées, sans-livraison ; OSD-sf1.25.13 : la commande jouée à la main deux fois',
  },
  {
    genre: 'rien-a-livrer',
    geste: 'aux contrôles, qui jugent le lot',
    regle:
      'un développeur qui ne change aucun fichier du plan n’a rien à livrer quand les contrôles sont verts ; rouges, l’arrêt monte (sans-livraison), sauf le rouge d’une référence que le lot fait baisser, la dette des gardes, qui se régénère au lieu d’arrêter, et le rouge qui nomme un fichier de test du lot, qui va au testwriter ; sur le lot que l’intégration refuse, pour un développeur que --depuis developpeur lance, le geste ne joue pas : il est relancé une fois avec le refus',
    cas: 'BP 320.9 : 995-tools n’a rien à livrer, 4 montées et 49 min (B5)',
  },
  {
    genre: 'mecanique',
    geste:
      'ni testwriter, ni preuve du rouge, ni développeur : l’explorateur joue dans la copie la commande que le plan nomme (1.1), puis les contrôles, la passe finale, la relecture et l’intégration',
    regle:
      'le plan dit le ticket mécanique, avec sa raison et sa commande (`sorte` de la fiche de l’explorateur) : un geste sans comportement neuf ; tant qu’aucun testwriter ni développeur n’a travaillé le lot, un rouge des contrôles ou un RENDU monte, sans relancer personne',
    cas: 'BP 320.16 : 38 outils déplacés par mv, 117 commentaires ; BP 320.40.1 : une variable inutilisée, 4 séances ; BP 322.11.1 : l’outil de test monté sur 31 paquets',
  },
  {
    genre: 'conflit-de-l-avance',
    geste:
      'au rôle qui écrit les fichiers en conflit ou au lot gardé, les marques posées dans la copie : le testwriter pour un test ou la matière de test partagée, le développeur pour le code, le testwriter d’abord puis le développeur sur les fichiers des deux',
    regle:
      'l’avance d’une copie sur main laisse des fichiers en conflit ou un lot gardé : le rôle que `estUnTest` du module du langage désigne pour chacun les écrit ; un conflit que la seconde séance du rôle ne lève pas monte (lancement)',
    cas: 'SH-b52.2 : marques dans 2 fichiers de test, résolues à la main par le superviseur ; SH-br0.3 : 8 fichiers de test dans le lot gardé, la copie sur main sans eux',
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
export const REPONSES =
  'Le superviseur répond par une commande du circuit : `--reprendre` (avec `--contexte`) ou `--depuis <testwriter|developpeur>` (avec `--contexte`), `--depuis direct` dans un circuit direct (avec `--contexte`), `--mecanique [<commande>]` (avec `--contexte` : à l’arrêt du testwriter qui ne trouve aucun comportement à tester, ou de la preuve du rouge qui refuse le lot de tests, le ticket bascule en circuit court sur le même plan, vers 1.1 avec sa commande, vers le développeur sans elle), `--etendre <paquet>` (le plan gagne ce paquet, puis l’étape en cours reprend), `--reporter <heure>` (la question se tait jusqu’à l’heure, le circuit en attente), ou `--arreter`.';

// The question of each stop no gesture settles, as a CI calls a person only for what no rule
// settles (the approval of a review): every stop of ARRETS, « a-repasser » once the circuit has
// played it again as often as it may (a gesture until then). The
// circuit ends on the stop, its state carrying the question (`question`: `{ arret, fait, piece,
// question, qui }`: the fact, its piece, file:line or command and output, the question and who must
// answer it), for the supervisor, who answers by a command of the circuit and carries to the owner
// what is his (`qui` responsable: the reviewer's question on a real word of the language).
export const MONTEES = Object.fromEntries(
  Object.entries({
    'a-repasser':
      'L’étape à repasser (une passe sous charge, une CI non lue, une file qui n’avance pas) a été rejouée autant de fois que le circuit le fait, sans aboutir : sa cause se lève-t-elle, pour reprendre, ou le circuit s’arrête-t-il ?',
    lancement:
      'Le lanceur s’arrête avant la séance, ou la copie n’avance pas sur la pointe de main avant une passe : la machine ou la copie se répare-t-elle, pour reprendre ?',
    bloqué:
      'La séance n’a plus bougé, et le circuit l’a arrêtée : reprendre l’étape, ou arrêter le circuit ?',
    'sans-fiche':
      'La séance finit deux fois sans fiche conforme : reprendre l’étape, ou arrêter le circuit ?',
    preuve:
      'La troisième preuve du rouge refuse le lot de tests : quel contexte donner au testwriter, le lot n’a-t-il aucun comportement à prouver (`--mecanique`), ou le plan doit-il changer ?',
    controles:
      'Un rouge reste, que le circuit ne rend pas au développeur (hors du plan, sans fichier, à arbitrer, le lot d’un geste mécanique), ou que trois séances n’ont pas levé : avec quel contexte le lever, ou le plan doit-il s’étendre ?',
    'sans-livraison':
      'Le développeur ne change rien et le rouge reste, ou le geste mécanique ne change aucun fichier du plan : avec quel contexte le lever, ou le plan doit-il changer ?',
    'relecture-arret':
      'La relecture ne rend pas le lot à un agent (un constat sans destinataire valide, un constat au testwriter que le plan saute, un lot mécanique rendu, un critère en cause, ou la troisième relecture rendue) : que devient le plan, et qui reprend ?',
    integration:
      'L’intégration refuse le lot, ou la file rouvre le ticket : que corrige le lot, et qui le reprend ?',
    'lot-absent':
      'La reprise de l’intégration ne trouve le lot ni sur main ni dans la copie : que devient le lot, et qui le reprend ?',
    'copie-gardee':
      'Le lot est sur main, mais la copie ou son dossier de travail ne se retire pas : qu’est-ce qui la retient, et se lève-t-il pour reprendre ?',
    'hors-portee':
      'L’agent se dit bloqué hors de sa portée : le plan s’étend-il au paquet qu’il nomme, ou un autre agent lève-t-il le reste ?',
    besoin: 'Une réponse manque pour avancer : laquelle ?',
    questionnement:
      'Des questions du plan restent ouvertes après la réponse de l’explorateur : le plan change-t-il (`bd update`), ou reste-t-il tel quel ? `--reprendre` le fait passer tel qu’il est alors.',
    references:
      'La régénération des références change un fichier qu’aucune référence n’écrit, ou sa commande échoue (ses écarts ci-dessus) : qui corrige la référence ou le lot ?',
    'hors-plan':
      'La séance écrit hors du plan du ticket : le plan s’étend-il à ce paquet (`--etendre`), ou l’écriture est-elle refusée (`--reprendre` avec son contexte) ?',
    inattendu:
      'Une exception que le circuit ne prévoit pas (une lecture de la copie, une commande, un fichier illisible) l’a arrêté : sa cause se lève-t-elle, pour reprendre (`--reprendre`, qui écrit de nouveau cet arrêt si la cause reste), ou le circuit s’arrête-t-il ?',
    'limite-d-usage':
      'La limite d’usage arrête la séance : le circuit se reporte seul à l’heure de reprise et reprend l’étape, il ne monte que si le superviseur l’a interrompu ; reprendre avant l’heure, ou arrêter le circuit ?',
  }).map(([arret, question]) => [arret, { question: `${question} ${REPONSES}`, qui: SUPERVISEUR }])
);

// The question <question> of a stop without the list of the answers it ends with (`REPONSES`), which
// the session of supervision reads once, at its opening.
const AMORCE_DES_REPONSES = REPONSES.slice(0, REPONSES.indexOf(':') + 1);
export const sansLesReponses = question =>
  String(question ?? '')
    .split(AMORCE_DES_REPONSES)[0]
    .trim();

// The question of the stop <arret>, `{ question, qui }`, or null for a stop of no circuit.
export const monteeDe = arret => MONTEES[arret] ?? null;
