// The decisions of the circuit of a ticket (scripts/circuit.mjs), with no input nor output, as a
// workflow of Temporal decides on the results of its activities and a reducer of Redux on its
// actions: from the state of the run, the circuit's memory and the facts read so far, the step
// that follows. The circuit reads the facts and interprets what this module returns; this module
// reads no file, launches no process and imports no module that does (a guard holds it:
// tests/unit/transitions.spec.ts).
//
// `transition({ etat, memoire, ticket, reprend, faits, marqueurs })`:
//
// - `etat`, the run at its step: `{ etape, tentative, rapport, finale, relanceSurLeRefus }`;
// - `memoire`, what the circuit keeps between steps (`controlesRouges`, `renvoiAuTestwriter`,
//   `refus`, `rienALivrer`, `regeneration`, `regenereSur`, `aRegenerer`, `verifie`,
//   `toursDeLaPasseFinale`, `constats`);
// - `ticket`, `{ id, paquets, sorte, copie }`;
// - `reprend`, whether this step is the first of a `--reprendre`;
// - `faits`, the facts read for this step, by their name;
// - `marqueurs`, the markers of the workflow of a ticket (`patched`), each true when the run
//   carries it: `attributionAvantSansLivraison`, without which red checks after a developpeur who
//   had nothing to deliver stop before any attribution, as a run recorded before it replays.
//
// It returns either the next fact to read, `{ besoin: { fait, ...parametres }, effets, memoire }` (a
// session, a pass, a reading of the copy), which the circuit reads and gives back in `faits` with
// the same call, `effets` and `memoire` what the step decided before it, so that an engine applies
// them before the fact and loses none when the fact fails; or the decision: `{ suivant, memoire, effets, arret, fin, usage }`, `suivant` the state of
// the next step, `memoire` what changes in the circuit's memory, `effets` in their order (a line
// at the ticket `{ genre: 'commenter', etape, texte }`, a gesture `{ genre: 'geste', nom }`, a
// report `{ genre: 'rapport', etape, texte, resultat, rapport }`, a result kept
// `{ genre: 'inscrire', entree, evenement }`, its event named), then a stop `arret` (its name `nom` and its `rapport`, with the
// options of an Arret of the circuit: `piece`, `question`, `qui`, `rouges`, `motif`, `resultat`,
// `etape`; or `{ nom, statut: { role, tentative, fiche } }` and `{ nom, horsDuPlan: { tentative,
// fiche } }`, which the circuit builds with the agent's handover), the end of the run `fin`, or a
// step the list does not hold `usage`. Each call is played again from the start of its step with
// the facts read so far, as Temporal replays a workflow on its history: the same facts give the
// same decision.
import { ARRETS, boucle, RESPONSABLE, SUITE } from './etapes.mjs';
import { attribuerLeRouge, departDepuis } from './reprise.mjs';

// What the circuit keeps between steps, which the decisions read and change: the one list the
// opening reads back (scripts/faits-du-circuit.mjs `GARDEE`) and the memo of a circuit keeps
// (src/temporal/circuit/contrat.ts `etatPourLeMemo`).
export const MEMOIRE = [
  'controlesRouges',
  'renvoiAuTestwriter',
  'refus',
  'rienALivrer',
  'regeneration',
  'regenereSur',
  'aRegenerer',
  'verifie',
  'toursDeLaPasseFinale',
  'constats',
  'verts',
  'reprise',
  'relancesTestwriter',
  'conflitsRelances',
  'fichiersDuConflit',
  'retourDuConflit',
  'testwriterDemande',
];

// The mark « the supervisor asked the testwriter » after a start: set by `--depuis testwriter`, kept
// by a `--reprendre` without `--depuis`, dropped by any other start (a new plan, no `--depuis`, a
// `--depuis` of another step). As an operator replays a named step whatever the automatic rule
// would have chosen.
export const testwriterDemande = ({ depuis, reprendre, marque }) =>
  depuis === 'testwriter' || Boolean(!depuis && reprendre && marque);

// The steps of the circuit's state, read from the list of the steps.
const etatDe = n => SUITE.find(e => e.numero === n).etat;
export const [
  GESTE,
  TESTS,
  PREUVE,
  CODE,
  CONTROLES,
  REFERENCES,
  RELECTURE,
  INTEGRATION,
  EN_FILE,
  TRI,
] = ['1.1', '2', '2.1', '3', '3.1', '4.2', '4.3', '5.1', '5.2', '5.3'].map(etatDe);

// The bounded loops, each declared with its step (scripts/etapes.mjs, `boucles`): the testwriter is
// relaunched twice at most after a failed proof (three sessions); the developpeur has three
// sessions, the last on the strong model; the third RENDU of one ticket stops the circuit.
export const RELANCES_TESTWRITER = boucle('tests').max - 1;
export const SEANCES_DEVELOPPEUR = boucle('code').max;
export const RELECTURES = boucle('relecture').max;
// The tours of the cycle ACCEPTÉ → final pass → review the circuit plays before it stops on a
// question: a lot whose tree never settles between the final pass and the review (a
// non-deterministic build artifact of the copy, a build output no task declares) would replay
// the pass and the reviewer without end, so after this many the circuit goes up to the supervisor.
export const TOURS_DE_LA_PASSE_FINALE = 2;

// What changed for a developpeur relaunched on the integration's refusal of the lot he left as it was.
export const CHANGE_DU_REFUS =
  'l’intégration refuse ton lot, et ta séance n’a changé aucun fichier du plan : son refus, dans le rapport ci-dessous, est le rouge à lever';

// The developpeur's report on the integration's refusal <refus>: the red to lift, which the checks
// of the copy, green, do not see.
export const rapportDuRefus = refus =>
  `L’intégration refuse ce lot : son refus, ci-dessous, est le rouge à lever ; les contrôles de ta copie, verts, ne le voient pas, et le lot ne repasse à l’intégration qu’avec un changement.\n\n${refus.rapport}`;

// The stop of a ticket the queue reopens on its issue `{ raison, conflit }`, as it gives the circuit
// (`direLIssue` of scripts/integration/file.mjs): `motif`, whose first line, the
// fact of the question gone up, says why (the first line of the reason that is not a title), the
// whole reason after it; `question`, for a branch that does not replay on main (its conflict), the
// answer that serves, null for any other reason.
export function refusDeLaFile({ raison, conflit = false } = {}) {
  const texte = String(raison ?? '').trim();
  const pourquoi = texte.split('\n').find(l => l.trim() && !l.startsWith('#'));
  return {
    motif: `La file rouvre le ticket${pourquoi ? ` : ${pourquoi.trim()}` : '.'}\n\n${texte}`,
    question: conflit
      ? 'La branche ne se replace pas sur main : `--depuis developpeur` remet son lot en travail local sur main, où le développeur le replace ; `--reprendre` renverrait la même branche.'
      : null,
  };
}

// The step after the plan of sort <sorte> (null when the path is not mechanical): the gesture of
// a mechanical ticket (1.1), in place of the testwriter, the proof and the developpeur; the
// developpeur of a plan without tests (<sansTests>) or of a plan whose `comportement` is inchangé
// (a gesture written by hand: no test can turn red, the existing suite proves it); else the
// testwriter, for changé and tests-adaptés alike.
// The supervisor's `--depuis testwriter` (<demande>) wins over `inchangé`: the testwriter plays.
export const etapeApresLePlan = ({ sorte, sansTests, demande = false }) =>
  sorte?.genre === 'mécanique'
    ? GESTE
    : sansTests || (sorte?.comportement === 'inchangé' && !demande)
      ? CODE
      : TESTS;

// The step after a proof that passes: the developpeur on a red (<rouges>), on a finding of the
// reviewer still open for him (<pourLeDeveloppeur>), or under a plan « comportement
// tests-adaptés » (<inchange>), whose lot has code to write though nothing turns red, as a reorganisation does
// (decision 3, amended by the owner on 2026-11-01); else the checks, a lot of tests alone, with
// no session of the developpeur.
export const apresLaPreuve = ({ rouges, pourLeDeveloppeur, inchange }) =>
  rouges > 0 || pourLeDeveloppeur || inchange ? CODE : CONTROLES;

// What follows a red of the reading of the copy after the session <tentative> of <role>: the agent
// again, one attempt used as a red build uses it, or, the attempts used up, the stop « controles »
// as the red checks.
export function suiteDuRougeDeLecture(role, tentative) {
  const max = boucle(role === 'testwriter' ? 'tests' : 'code').max;
  return tentative < max ? { etape: role, tentative: tentative + 1 } : { arret: 'controles' };
}

// The findings of the reviewer open for <role> among <constats>, in their order.
export const ouverts = (constats, role) => (constats ?? []).filter(c => c.role === role);

// The stop for the findings open (<constats>) that go to the testwriter when the plan skips him
// (<sansTests>), or null: no new pass treats them, as a CI fails fast on a step it cannot run
// (grillhouse-26x). A stop `relecture-arret` whose report names each finding, the role skipped
// and why, then the verdict <texte>; its piece, the findings' pieces; its question, declare the
// tests of the package or settle the finding.
export function arretDuTestwriterSaute({ constats, sansTests, paquets }, texte) {
  const auTestwriter = ouverts(constats, 'testwriter');
  if (!auTestwriter.length || !sansTests) {
    return null;
  }
  const titres = auTestwriter.map(c => `« ${c.titre} »`).join(', ');
  const plan = paquets.join(', ');
  return {
    nom: 'relecture-arret',
    rapport: `Le relecteur adresse au testwriter ${titres}, quand le plan saute le testwriter : aucun paquet du plan ne joue de tests (${plan}).\n\nLe verdict :\n\n${texte}`,
    piece: auTestwriter.map(c => c.piece ?? c.titre).join('\n'),
    question: `Le constat ${titres} va au testwriter, que le plan (${plan}) saute : déclarer les tests du paquet au cadre, puis \`--reprendre\`, ou trancher le constat (\`--depuis developpeur --contexte\`, ou \`--arreter\`).`,
  };
}

// The stop for a RENDU of a mechanical lot (<mecanique>), or null: no testwriter nor developpeur
// wrote it, so no relaunch treats its findings (<constats>). A stop `relecture-arret`, the verdict
// <texte> in its report, the findings' pieces as its piece; its question, have the lot corrected
// by the developpeur or stop the circuit.
export function arretDuGesteMecanique({ constats, mecanique, sorte }, texte) {
  if (!mecanique) {
    return null;
  }
  const pieces = (constats ?? []).map(c => c.piece ?? c.titre).join('\n');
  return {
    nom: 'relecture-arret',
    rapport: `Le relecteur rend un lot mécanique (${sorte.raison}), que la commande du plan a fait sans testwriter ni développeur : le circuit ne relance personne.\n\nLe verdict :\n\n${texte}`,
    piece: pieces || null,
    question: `Le lot mécanique est rendu : le faire corriger par le développeur (\`--depuis developpeur --contexte\`), ou arrêter le circuit (\`--arreter\`) et changer le plan.`,
  };
}

// Whether the reviewer's sheet <fiche> sends the lot of the short circuit back to 2 Tests: its
// motif « comportement-change », on a ticket mechanical or written by hand under a plan
// « comportement inchangé » (<sorte>).
const basculeDuCircuitCourt = ({ fiche, sorte }) =>
  fiche?.motif === 'comportement-change' &&
  (sorte?.genre === 'mécanique' || sorte?.comportement === 'inchangé');

// The last <n> lines of <t>, a text the circuit gives without its colours.
const fin = (t, n) =>
  String(t ?? '')
    .split('\n')
    .slice(-n)
    .join('\n');

// A fact the decision has not read yet: its name and what reads it.
class Besoin {
  constructor(fait, parametres) {
    this.fait = fait;
    this.parametres = parametres;
  }
}

// The plan of a ticket, its decisions as the circuit and the workflow of a ticket take them
// (grillhouse-4nr.6.3): the step of the plan that follows its state <e> (`{ plan, lu, posees,
// reponse }`, the explorateur's sheet, the questionneur's, the questions put, the explorateur's
// answer): `explorateur`, `questionneur`, `reponse` (questions were put), then `conclure`.
export const pasDuPlan = e =>
  !e.plan
    ? 'explorateur'
    : !e.lu
      ? 'questionneur'
      : e.posees.length && !e.reponse
        ? 'reponse'
        : 'conclure';

// The questions the explorateur answers in the questionneur's sheet <lu>: its questions, or its
// disagreement as one; none for « AUCUNE ».
export const questionsPosees = lu =>
  lu.issue === 'AUCUNE'
    ? []
    : lu.issue === 'DÉSACCORD'
      ? [lu.desaccord]
      : lu.questions.map(q => q.question);

// What stays open of the plan <plan> once the explorateur answered <reponses> to the questions
// <posees>: the plan's own questions, then each question put left without its answer.
// A question whose correction the circuit refused (<refusees>, their numbers) stays open.
export const ouvertesDuPlan = (plan, posees, reponses, refusees = []) => [
  ...plan.questions,
  ...posees.flatMap((question, i) => {
    if (!reponses.some(r => Number(r.numero) === i + 1)) {
      return [{ question, piece: 'question du questionneur, sans réponse' }];
    }
    return refusees.includes(i + 1)
      ? [
          {
            question,
            piece: 'question du questionneur, correction refusée : la pièce ne la prouve pas',
          },
        ]
      : [];
  }),
];

// The pieces `<fichier>:<ligne>` or `<fichier>:<ligne>-<fin>` of the file:line form, as
// `{ fichier, de, a }`; null for a command piece (`$ …`), a piece of the ticket or any other form.
const adresseDeLaPiece = piece => {
  const texte = String(piece).trim();
  // The first word of the piece is its address.
  const mot = texte.split(' ')[0].split('\t')[0].split('\n')[0];
  const deuxPoints = mot.lastIndexOf(':');
  if (deuxPoints <= 0 || mot.startsWith('$') || mot.slice(0, deuxPoints).includes(':')) {
    return null;
  }
  const nombres = mot
    .slice(deuxPoints + 1)
    .split('-')
    .map(Number);
  if (nombres.length > 2 || nombres.some(n => !Number.isInteger(n) || n < 1 || n >= 1e9)) {
    return null;
  }
  return { fichier: mot.slice(0, deuxPoints), de: nombres[0], a: nombres[1] ?? nombres[0] };
};

// The corrections of criteria the explorateur's answers <reponses> give to the questions <questions>
// (`{ question, vise, piece }`, numbered from 1): a correction (`{ critere, texte, piece, extrait }`)
// is accepted when its question aims at a criterion, its piece is the question's, a file:line piece
// (a command is never played again), and its extract stands on a line the piece cites, as
// <lireLigne>(file, line) reads it in the copy (null when absent). Any other is refused, and its
// question stays open.
export const correctionsDuPlan = (questions, reponses, lireLigne) => {
  const acceptees = [];
  const refusees = [];
  for (const r of reponses) {
    const c = r.correction;
    if (!c) {
      continue;
    }
    const numero = Number(r.numero);
    const q = questions[numero - 1];
    const adresse = q && c.piece === q.piece ? adresseDeLaPiece(q.piece) : null;
    const extrait = String(c.extrait ?? '').trim();
    let prouvee = false;
    if (q?.vise === 'critère' && adresse && extrait) {
      for (let n = adresse.de; n <= adresse.a && !prouvee; n += 1) {
        prouvee = (lireLigne(adresse.fichier, n) ?? '').includes(extrait);
      }
    }
    if (prouvee) {
      acceptees.push({
        numero,
        critere: c.critere,
        texte: c.texte,
        piece: c.piece,
        extrait: c.extrait,
      });
    } else {
      refusees.push(numero);
    }
  }
  return { acceptees, refusees };
};

// The effects <effets> an act gave back as the workflow plays them (scripts/effets.mjs), in their
// order: a state followed by another state is not played, since the state is written whole and
// nothing reads it between the two.
export const effetsAJouer = effets =>
  effets.filter((e, i) => !(e.genre === 'etat' && effets[i + 1]?.genre === 'etat'));

// The text <t> without the escape sequences of a terminal (colours, ECMA-48 CSI and OSC), as
// `stripVTControlCharacters` of node:util removes them; written here, since the workflow of a
// ticket imports this module and a workflow imports no module of node.
const SEQUENCES = new RegExp(
  String.raw`\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)|[@-Z\\-_])`,
  'g'
);
const sansLesCodes = t => String(t ?? '').replace(SEQUENCES, '');

// The stop « inattendu » at the step <etat> that no act could write at the ticket (the act of the
// stop itself failed, its message <message>), as the workflow of a ticket under Temporal publishes
// it in its memo alone (src/temporal/circuit/deroule.ts): `{ code, nom, question, etat }`. Its
// question names the cause, the first line of <message>, since it is all the supervisor reads;
// the codes of colour of a command's output go (`sansLesCodes`).
export const arretSansActe = (etat, message, ou) => ({
  code: ARRETS.inattendu,
  nom: 'inattendu',
  question: {
    arret: 'inattendu',
    fait: `L'arrêt de l'étape « ${etat.etape} » ne s'écrit pas au ticket : ${sansLesCodes(message)}`,
    piece: ou,
    question: `L'arrêt de l'étape « ${etat.etape} » ne s'écrit pas au ticket : ${
      sansLesCodes(message)
        .split('\n')
        .find(l => l.trim())
        ?.trim() ?? 'sans message'
    }. Lever la cause, puis reprendre le circuit (--reprendre) ou l’arrêter (--arreter).`,
    qui: 'superviseur',
  },
  etat: { ...etat, raison: 'inattendu' },
});

// The stop « limite-d-usage » of a session the usage limit cuts, at the step <etat>: no question
// (the circuit reports itself to <limite>.reprise, the hour the usage returns, or one hour on when
// <limite>.lisible is false), the comment the act writes at the ticket, and the state of the step
// with its reason, which the memo of the circuit keeps for the board.
export const arretDeLaLimiteDUsage = (etat, { reprise, lisible }) => ({
  code: ARRETS['limite-d-usage'],
  nom: 'limite-d-usage',
  question: null,
  etat: { ...etat, raison: 'limite-d-usage' },
  commentaire: `reporté pour la limite d'usage : reprise de l'étape à ${new Date(reprise).toISOString()}${lisible ? '' : " (aucune heure lisible : une heure d'attente)"}.`,
});

// The step of a run of the workflow of a ticket from its opening to its plan passed
// (src/temporal/circuit/deroule.ts): no step of the table of transitions.
export const AU_PLAN = 'plan';

// The state a stop at <etat> is written at and resumed from: a run at its plan (AU_PLAN) stands at
// the state the plan writes (scripts/circuit.mjs `etatDuPlan`: the testwriter's first attempt, the
// work on the plan named), from which the opening plays the plan again
// (scripts/circuit.mjs `ouvrirJusquAuPlan`), as a Temporal resumption replays from the step it
// stopped at; any other state as it is.
export const etatDeReprise = etat =>
  etat.etape === AU_PLAN
    ? {
        ...etat,
        etape: TESTS,
        tentative: 1,
        finale: false,
        questionnement: { objet: 'plan' },
      }
    : etat;

// Where the run starts, from the command's options and the state of the stop: `{ suivant, memoire }`
// (the state the run starts at, the memory it changes), or `{ usage }`, a refusal. After a stop
// « integration », on --depuis developpeur, the developpeur, the refusal (`refus`) as his report,
// the session so launched marked (`lance`), as a merge queue sends the lot back to its author with
// the log of its check; else the step a --depuis names (the testwriter's, which makes the lot
// again, the refusal dropped, or the developpeur's), the step of the state `etat` (null without
// one) on --reprendre, the integration or the queue played again on the same lot after their stop,
// as bors retries, else the testwriter, the run starting over.
export function depart({ depuis = null, reprendre = false, marque = false, etat, refus, ticket }) {
  // The supervisor's command wins over the sort of the plan: the mark of his `--depuis testwriter`.
  const memoire = {
    testwriterDemande: testwriterDemande({ depuis, reprendre: Boolean(reprendre), marque }),
  };
  // A --depuis plays its step and the ones after it, no result read back: no fingerprint kept, no
  // resumption at a red, no attribution counted.
  if (depuis) {
    Object.assign(memoire, { verts: {}, reprise: null, relancesTestwriter: null });
  }
  if (depuis === 'developpeur' && etat?.raison === 'integration' && refus) {
    memoire.refus = { ...refus, lance: true, relance: false };
    return {
      suivant: { etape: CODE, tentative: 1, rapport: rapportDuRefus(memoire.refus), finale: false },
      memoire,
    };
  }
  if (depuis === 'testwriter') {
    memoire.refus = null;
  }
  if (depuis) {
    const { etape, tentative, rapport, finale } = departDepuis(depuis);
    return { suivant: { etape, tentative, rapport, finale }, memoire };
  }
  if (!reprendre) {
    // The run starts over: no lot verified, no finding of a review open, no refusal, no checks played.
    Object.assign(memoire, {
      verts: null,
      reprise: null,
      relancesTestwriter: null,
      verifie: null,
      toursDeLaPasseFinale: null,
      constats: [],
      refus: null,
      controlesRouges: null,
    });
    return { suivant: { etape: TESTS, tentative: 1, rapport: null, finale: false }, memoire };
  }
  if (!etat) {
    return { usage: `rien à reprendre : le circuit de ${ticket} n'a aucun état d'arrêt.` };
  }
  if (etat.etape === 'integre') {
    return { usage: `rien à reprendre : le lot de ${ticket} est intégré.` };
  }
  return {
    suivant: {
      etape: etat.etape,
      tentative: etat.etape === CONTROLES ? 0 : 1,
      rapport: etat.rapport,
      finale: etat.finale === true,
    },
    memoire,
  };
}

// The sending to the testwriter in the developpeur's sheet <fiche> (its `renvoi`): what the
// testwriter receives, the sending, the developpeur's handover <passation> (null: « aucune »), then
// the red output of the last checks <controlesRouges> when checks ran since the testwriter's
// session; null without a sending. <fichiersRouges> lists, in one go, every test file the lot
// breaks, the plan's and the extended readers' (`fichiersDeTestRouges`).
export function renvoiDe({ fiche, passation, controlesRouges, fichiersRouges = [] }) {
  if (!fiche.renvoi) {
    return null;
  }
  const raison = fiche.raison ? ` : ${fiche.raison}` : '';
  const fichiers = fichiersRouges.length
    ? `\n\nLes fichiers de test rouges, tous à lever en une séance : ${fichiersRouges.join(', ')}.`
    : '';
  const controles = controlesRouges
    ? `\n\nLa sortie rouge des derniers contrôles :\n\n${controlesRouges}`
    : '';
  return `Le développeur renvoie le rouge qui reste aux tests du lot${raison}.${fichiers}\n\nSa passation :\n\n${passation ?? 'aucune'}${controles}`;
}

// The test files the red output <controlesRouges> of checks names (its lines `- test <fichier> › …`
// and `- test <fichier> — …`), each once, in order.
export function fichiersDeTestRouges(controlesRouges) {
  const vus = new Set();
  for (const ligne of String(controlesRouges ?? '').split('\n')) {
    if (!ligne.startsWith('- test ')) {
      continue;
    }
    const mot = ligne.slice('- test '.length).split(' ')[0];
    const suite = ligne.slice('- test '.length + mot.length).trimStart();
    if (mot && (suite.startsWith('›') || suite.startsWith('—'))) {
      vus.add(mot);
    }
  }
  return [...vus];
}

// The context `--etendre` gives the sessions of the run it resumes on the stop <question>: the
// supervisor's answer (the packages <etendus> the plan gains, the plan <plan> as it is now), then his own text <contexte>. The stop's fact
// and piece stay out of it: they say the plan as it was and tell a session to stop (a lock's
// message), and a session reads its context as the supervisor's word. Without a question, his
// text alone, or null.
export function contexteDeLExtension({ question, etendus, plan, contexte }) {
  const reponse = question
    ? `Le superviseur a étendu le plan à ${etendus.join(', ')} ; le plan du ticket est maintenant : ${plan}.`
    : null;
  return [reponse, contexte].filter(Boolean).join('\n\n') || null;
}

// Where the circuit resumes when the supervisor extends the plan: without a state <etat>, it starts
// on the plan extended (`suivant` null); else it resumes the step under way, as `--reprendre`
// does, the supervisor's answer to the stop as the context of its sessions; a stop
// « sans-livraison » whose developpeur's last sheet sends the red to the testwriter (<renvoi>)
// resumes at the step of the testwriter, as a retry plays the job that failed.
export function etendre({ etat, etendus, plan, contexte, renvoi }) {
  if (!etat) {
    return { suivant: null };
  }
  const suite = contexteDeLExtension({ question: etat.question, etendus, plan, contexte });
  const auTestwriter =
    etat.etape === CODE && etat.raison === 'sans-livraison' && renvoi?.role === 'testwriter';
  return {
    suivant: auTestwriter ? { ...etat, etape: TESTS } : etat,
    contexte: suite,
    reprend: true,
  };
}

// The decision of the step of <entree> (see the header), or the next fact it needs.
export function transition(entree) {
  const faits = entree.faits ?? {};
  const lire = (fait, parametres = {}) => {
    if (fait in faits) {
      return faits[fait];
    }
    throw new Besoin(fait, parametres);
  };
  // What the step decided before the fact it needs.
  const partiel = { effets: [], maj: {} };
  try {
    return decider(entree, lire, partiel);
  } catch (e) {
    if (e instanceof Besoin) {
      return {
        besoin: { fait: e.fait, ...e.parametres },
        effets: [...partiel.effets],
        memoire: { ...partiel.maj },
      };
    }
    throw e;
  }
}

function decider({ etat, memoire = {}, ticket, reprend = false, marqueurs = {} }, lire, partiel) {
  let { etape, tentative, rapport, finale } = etat;
  let relanceSurLeRefus = Boolean(etat.relanceSurLeRefus);
  const maj = {};
  // The memory as this decision leaves it so far.
  const m = cle => (cle in maj ? maj[cle] : (memoire[cle] ?? null));
  const effets = [];
  partiel.effets = effets;
  partiel.maj = maj;
  const commenter = (lieu, texte) => effets.push({ genre: 'commenter', etape: lieu, texte });
  const geste = nom => effets.push({ genre: 'geste', nom });
  const ecrireRapport = (lieu, texte, resultat, r = texte) =>
    effets.push({ genre: 'rapport', etape: lieu, texte, resultat, rapport: r });
  const inscrire = (entree, evenement) => effets.push({ genre: 'inscrire', entree, evenement });
  // The last green of a step (`verts`: the fingerprint of its inputs, its duration, what it
  // needs to be read back) kept in the memory, or dropped (<vert> null): only a step green keeps
  // one, as a task of Turborepo caches only its success.
  const garderLeVert = (nom, vert) => {
    const verts = { ...(m('verts') ?? {}) };
    if (vert) {
      verts[nom] = vert;
    } else {
      delete verts[nom];
    }
    maj.verts = verts;
  };
  // A step whose inputs are those of its last green: its result is read back, its duration
  // (<ms>) the one the bilan counts as not replayed (scripts/bilan.mjs).
  const releve = (nom, ms) => {
    const lieu = nom === 'passe-finale' ? 'controles' : nom;
    commenter(
      lieu,
      `${nom} relue sans se rejouer : ses entrées (fichiers, commande) sont celles de son dernier vert.`
    );
    inscrire({ etape: nom, relue: { ms: ms ?? 0 } }, 'relue');
  };
  const decision = (extra = {}) => ({
    suivant: { etape, tentative, rapport, finale, relanceSurLeRefus },
    memoire: maj,
    effets,
    ...extra,
  });
  const arreter = (nom, r, options = {}) => decision({ arret: { nom, rapport: r, ...options } });
  // A session relaunched on a conflict of the copy's advance (the gesture `conflit-de-l-avance`,
  // `retourDuConflit`) comes back to the pass that met it, not to the step that follows its role:
  // the pass prepares the copy again, and relaunches the other role while one of its files keeps
  // its marks. Whether the decision went back to it.
  const auRetourDuConflit = role => {
    const retour = m('retourDuConflit');
    if (!retour) {
      return false;
    }
    maj.retourDuConflit = null;
    commenter(
      role,
      `séance ${tentative} finie sur le conflit de l'avance : le circuit revient à la passe.`
    );
    ({ etape, tentative, rapport, finale } = retour);
    relanceSurLeRefus = Boolean(retour.relanceSurLeRefus);
    return true;
  };
  const plan = ticket.paquets.join(', ');

  // After the plan: the gesture of a mechanical ticket, the developpeur of a plan without tests,
  // else the testwriter.
  const route =
    etape === TESTS
      ? etapeApresLePlan({
          sorte:
            lire('mecanique') || ticket.sorte?.comportement === 'inchangé' ? ticket.sorte : null,
          sansTests: lire('sansTests'),
          demande: Boolean(m('testwriterDemande')),
        })
      : null;
  const demandeDuSuperviseur =
    Boolean(m('testwriterDemande')) && ticket.sorte?.comportement === 'inchangé';
  if (etape === TESTS && route === TESTS && demandeDuSuperviseur) {
    commenter(
      'testwriter',
      'plan « comportement inchangé » : le superviseur a demandé la séance du testwriter (`--depuis testwriter`), qui l’emporte sur la sorte du plan.'
    );
  }
  if (route === GESTE) {
    geste('mecanique');
    etape = GESTE;
    tentative = 1;
    return decision();
  }
  if (etape === GESTE) {
    if (reprend && lire('livreAvant')) {
      // The copy already carries the gesture (the supervisor played the command himself).
      commenter(
        'mecanique',
        'la copie porte déjà un changement du plan : le geste ne rejoue pas, aux contrôles.'
      );
    } else {
      const fiche = lire('seanceDuGeste');
      if (fiche.statut !== 'FAIT') {
        return decision({
          arret: { nom: nomDuStatut(fiche), statut: { role: 'explorateur', tentative, fiche } },
        });
      }
      if (!lire('livre')) {
        return arreter(
          'sans-livraison',
          `Le geste mécanique ne change aucun fichier du plan (${plan}) : la commande du plan, \`${ticket.sorte.commande}\`, n'a rien changé dans la copie.`,
          { piece: `$ ${ticket.sorte.commande}\naucun fichier du plan changé dans ${ticket.copie}` }
        );
      }
      commenter('mecanique', 'la commande du plan a joué dans la copie : aux contrôles.');
    }
    etape = CONTROLES;
    tentative = 0;
    return decision();
  }
  if (route === CODE) {
    const ecritALaMain = ticket.sorte?.comportement === 'inchangé';
    commenter(
      'testwriter',
      ecritALaMain
        ? 'plan « comportement inchangé » (geste écrit à la main) : aucun test honnête ne peut rougir, ni testwriter ni preuve, le développeur directement.'
        : 'aucun test dans le plan (aucun paquet qui joue des tests ne le tient) : ni testwriter ni preuve, le développeur directement.'
    );
    rapport = [
      ecritALaMain
        ? `Le plan (${plan}) dit « comportement inchangé » : le circuit te lance sans testwriter ni preuve. Tu écris le geste d'après les critères du ticket ; la suite existante, qui reste verte, et la relecture font la preuve.`
        : `Le plan (${plan}) ne porte aucun test (aucun paquet qui joue des tests ne le tient) : le circuit te lance sans testwriter ni preuve. Tu écris le ticket d'après ses critères ; les contrôles suivent ta séance.`,
      rapport,
    ]
      .filter(Boolean)
      .join('\n\n');
    etape = CODE;
    tentative = 1;
    return decision();
  }
  if (etape === TESTS) {
    const reprise = m('reprise');
    const fiche = lire('seance', {
      role: 'testwriter',
      tentative,
      rapport,
      derniere: tentative > RELANCES_TESTWRITER,
      ...(reprise ? { fichiers: reprise.fichiers } : {}),
    });
    // A testwriter who declares himself blocked or in need of an answer goes up to the supervisor.
    if (fiche.statut !== 'FAIT') {
      return decision({
        arret: { nom: nomDuStatut(fiche), statut: { role: 'testwriter', tentative, fiche } },
      });
    }
    // No checks have run since this session.
    maj.controlesRouges = null;
    commenter('testwriter', `séance ${tentative} finie, sa fiche lue.`);
    // A copy the module of the language no longer reads is a red of the testwriter.
    const illisible = lire('lecture');
    if (illisible) {
      const suite = suiteDuRougeDeLecture('testwriter', tentative);
      if (suite.arret) {
        return arreter(suite.arret, illisible.rapport);
      }
      commenter(
        'testwriter',
        `la copie ne se lit plus ; testwriter relancé (séance ${suite.tentative}).\n\n${illisible.rapport}`
      );
      etape = TESTS;
      tentative = suite.tentative;
      rapport = illisible.rapport;
      return decision();
    }
    if (auRetourDuConflit('testwriter')) {
      return decision();
    }
    etape = PREUVE;
    return decision();
  }
  if (etape === PREUVE) {
    const reprise = m('reprise');
    // A finding of the reviewer still open for the developpeur launches him, red or not.
    const pourLui = ouverts(m('constats'), 'developpeur').length > 0;
    const inchange = ticket.sorte?.comportement === 'tests-adaptés';
    const vert = m('verts')?.preuve;
    if (vert && !reprise && lire('empreinteEtape', { etape: 'preuve' }) === vert.empreinte) {
      // The proof's inputs are those of its last green: its result is read back, not played.
      releve('preuve', vert.ms);
      rapport = vert.texte ?? null;
      const auDeveloppeur =
        apresLaPreuve({ rouges: vert.rouges, pourLeDeveloppeur: pourLui, inchange }) === CODE;
      etape = auDeveloppeur ? CODE : CONTROLES;
      tentative = auDeveloppeur ? 1 : 0;
      return decision();
    }
    const p = lire('preuve', reprise ? { fichiers: reprise.fichiers } : {});
    rapport = p.texte;
    if (p.ok) {
      // Resumed at a red, a proof restricted to the file the red names goes to the checks.
      const auDeveloppeur = reprise
        ? false
        : apresLaPreuve({ rouges: p.rouges, pourLeDeveloppeur: pourLui, inchange }) === CODE;
      const suite = reprise
        ? 'reprise à un rouge : aux contrôles'
        : p.rouges
          ? 'au développeur'
          : pourLui
            ? 'aucun rouge ; au développeur, que nomme un constat du relecteur'
            : inchange
              ? 'aucun rouge : le plan dit « tests-adaptés », au développeur'
              : 'aucun rouge : un lot de tests seul, aux contrôles';
      ecrireRapport('preuve', `${p.resume} ; ${suite}.\n\n${p.texte}`, p.resultat);
      if (!reprise && p.empreinte) {
        garderLeVert('preuve', {
          empreinte: p.empreinte,
          rouges: p.rouges,
          ms: p.ms,
          texte: p.texte,
        });
      }
      etape = auDeveloppeur ? CODE : CONTROLES;
      tentative = auDeveloppeur ? 1 : 0;
      return decision();
    }
    garderLeVert('preuve', null);
    if (tentative <= RELANCES_TESTWRITER) {
      ecrireRapport(
        'preuve',
        `${p.resume} ; testwriter relancé (séance ${tentative + 1}).\n\n${p.texte}`,
        p.resultat
      );
      etape = TESTS;
      tentative++;
      return decision();
    }
    return arreter('preuve', p.texte, { resultat: p.resultat });
  }
  if (etape === CODE) {
    return code();
  }
  if (etape === CONTROLES) {
    return controles();
  }
  if (etape === REFERENCES) {
    return references();
  }
  if (etape === RELECTURE) {
    return relecture();
  }
  if (etape === INTEGRATION) {
    const r = lire('integration');
    if (r.nom) {
      // The resumption stops under a name (`lot-absent`, `copie-gardee`), at the code of the
      // integration stop (17, scripts/etapes.mjs), its piece the output.
      return arreter(r.nom, fin(r.sortie, 60), { piece: fin(r.sortie, 30) });
    }
    if (r.code !== 0) {
      return refuser(
        `Le script d'intégration refuse le lot (code ${r.code}).\n\n${fin(r.sortie, 60)}`,
        `$ ${r.commande}\n${fin(r.sortie, 30)}`
      );
    }
    maj.refus = null;
    if (r.deja && !r.enFile) {
      // The lot is already on main: nothing waits for the queue, the ticket goes straight to its
      // tri of discoveries and finishes at integre, as a merge queue closes an entry already merged.
      commenter(
        'integration',
        'le commit est déjà sur main ; la copie et son dossier de travail sont retirés.'
      );
      lire('tri');
      return decision({ fin: { code: 0 } });
    }
    const branche = `agent/${ticket.id}`;
    const commit = lire('commit');
    commenter(
      'integration',
      `${commit ? `commit ${commit} sur ${branche}` : 'lot commité'} ; la branche est en file.`
    );
    etape = EN_FILE;
    return decision();
  }
  if (etape === EN_FILE) {
    const f = lire('file');
    if (f.etat === 'ferme') {
      commenter('file', `${f.raison}.`);
      etape = TRI;
      return decision();
    }
    if (f.etat === 'en-file') {
      return arreter('a-repasser', f.raison);
    }
    const refus = refusDeLaFile(f);
    return refuser(refus.motif, f.raison, refus.question);
  }
  if (etape === TRI) {
    // The lot is on main: the tri of its discoveries, which neither stops nor undoes it.
    lire('tri');
    return decision({ fin: { code: 0 } });
  }
  return decision({ usage: `étape inconnue dans l'état : ${etape}` });

  // The stop « integration » of the motive <motif> and the piece <piece>, the refusal of the lot
  // kept in the memory (`refus`: `{ rapport, piece, empreinte, lance, relance }`, the fingerprint
  // of the plan refused, whether a --depuis developpeur launched the developpeur on it, and whether
  // a session so launched already left it unchanged once), which --depuis developpeur gives the
  // developpeur; <question>, the stop's own, before the one of its kind.
  function refuser(motif, piece, question = null) {
    maj.refus = {
      rapport: motif,
      piece,
      empreinte: lire('empreinte'),
      lance: false,
      relance: false,
    };
    return arreter('integration', motif, question ? { piece, question } : { piece });
  }

  function code() {
    const fort = tentative >= SEANCES_DEVELOPPEUR;
    const avant = lire('empreinteAvant');
    const fiche = lire('seance', {
      role: 'developpeur',
      tentative,
      rapport,
      fort,
      derniere: fort,
      change: relanceSurLeRefus ? CHANGE_DU_REFUS : undefined,
    });
    relanceSurLeRefus = false;
    const fortement = fort ? ' (opus)' : '';
    // A question goes up to the supervisor; a red out of reach, to the testwriter its sheet sends
    // it to, else up to the supervisor.
    if (fiche.statut === 'BESOIN') {
      return decision({
        arret: { nom: 'besoin', statut: { role: 'developpeur', tentative, fiche } },
      });
    }
    const renvoi = lire('renvoi');
    if (renvoi) {
      // The red that remains lies in the tests of the lot: the gesture `renvoi-au-testwriter`,
      // the testwriter, the sending and the handover as its report, then the proof and the
      // developpeur. `renvoiAuTestwriter` keeps the red output of the checks the sending before
      // carried ('' for none), null after green checks: the same output twice in a row is a
      // round trip without a new fact.
      const sortie = m('controlesRouges') ?? '';
      if (m('renvoiAuTestwriter') === sortie) {
        if (lire('empreinte') === avant) {
          inscrire({ etape: CODE, inchange: true }, 'inchange');
        }
        return arreter(
          'sans-livraison',
          `La fiche de la séance ${tentative} du développeur renvoie une deuxième fois de suite au testwriter, sur la même sortie rouge des contrôles que le premier renvoi (aucune, ou la même), sans contrôles verts entre eux : le testwriter n'a pas levé ce rouge.\n\n${renvoi}`
        );
      }
      maj.renvoiAuTestwriter = sortie;
      if (m('retourDuConflit')) {
        // The testwriter the sending relaunches goes on to the proof, not back to a pass.
        maj.retourDuConflit = null;
      }
      commenter(
        'developpeur',
        `séance ${tentative}${fortement} finie ; sa fiche renvoie le rouge au testwriter : le circuit relance le testwriter, puis la preuve et le développeur.`
      );
      geste('renvoi-au-testwriter');
      etape = TESTS;
      tentative = 1;
      rapport = renvoi;
      finale = false;
      return decision();
    }
    if (fiche.statut === 'BLOQUÉ') {
      return decision({
        arret: { nom: 'hors-portee', statut: { role: 'developpeur', tentative, fiche } },
      });
    }
    if (fiche.hors_plan?.length) {
      return decision({ arret: { nom: 'hors-portee', horsDuPlan: { tentative, fiche } } });
    }
    // A copy the module of the language no longer reads is a red of the developpeur.
    const illisible = lire('lecture');
    if (illisible) {
      const suite = suiteDuRougeDeLecture('developpeur', tentative);
      if (suite.arret) {
        return arreter(suite.arret, illisible.rapport);
      }
      commenter(
        'developpeur',
        `séance ${tentative} finie ; la copie ne se lit plus, développeur relancé (séance ${suite.tentative}).\n\n${illisible.rapport}`
      );
      tentative = suite.tentative;
      rapport = illisible.rapport;
      return decision();
    }
    const inchangee = lire('empreinte') === avant;
    const refus = m('refus');
    if (inchangee && refus?.lance && refus.empreinte === avant) {
      // The lot the integration refused, unchanged: as a merge queue lets a lot pass again only
      // with a change, neither the gesture `rien-a-livrer` nor the checks of the copy, which
      // the refusal does not see; the developpeur relaunched once with the refusal, then the
      // stop goes up.
      inscrire({ etape: CODE, inchange: true }, 'inchange');
      if (refus.relance) {
        return arreter(
          'sans-livraison',
          `La séance ${tentative} du développeur ne change aucun fichier du plan (${plan}), une seconde fois sur le lot que l'intégration refuse.\n\n${refus.rapport}`,
          { piece: refus.piece }
        );
      }
      maj.refus = { ...refus, relance: true };
      commenter(
        'developpeur',
        `séance ${tentative}${fortement} finie sans changement, sur le lot que l'intégration refuse : le circuit le relance une fois, le refus comme rapport.`
      );
      tentative++;
      rapport = rapportDuRefus(refus);
      relanceSurLeRefus = true;
      return decision();
    }
    if (inchangee && reprend && lire('livre')) {
      // A resumed developpeur that finds the lot delivered: the checks judge it.
      commenter(
        'developpeur',
        `séance ${tentative} reprise sans changement, le plan garde la livraison d'avant : aux contrôles.`
      );
      inscrire({ etape: CODE, inchange: true }, 'inchange');
    } else if (inchangee) {
      // Nothing to deliver: the gesture `rien-a-livrer`, the checks judge the lot; red, the
      // stop goes up.
      geste('rien-a-livrer');
      inscrire({ etape: CODE, inchange: true }, 'inchange');
      maj.rienALivrer = `La séance ${tentative} du développeur ne change aucun fichier du plan (${plan}), et les contrôles restent rouges. Sa passation au ticket dit pourquoi :\n\n${lire('passation') ?? 'aucune'}`;
    }
    if (auRetourDuConflit('developpeur')) {
      return decision();
    }
    commenter('developpeur', `séance ${tentative}${fortement} finie, sa fiche lue.`);
    etape = CONTROLES;
    return decision();
  }

  function controles() {
    const passeFinale = finale;
    // The final pass: after a regeneration of the references, restricted to what it changed,
    // the reds of the pass before it carried (none plays when it changed nothing); else the band
    // of the lot, its base and its dependents. The checks of the plan after a
    // regeneration that changed nothing: none plays, the reds of the checks before standing.
    const regeneration = m('regeneration');
    maj.regeneration = null;
    const nomEtape = passeFinale ? 'passe-finale' : 'controles';
    const reprise = m('reprise');
    const vert = m('verts')?.[nomEtape];
    if (
      vert &&
      !reprise &&
      !regeneration &&
      lire('empreinteEtape', { etape: nomEtape }) === vert.empreinte
    ) {
      // The step's inputs are those of its last green: its result is read back, not played.
      releve(nomEtape, vert.ms);
      maj.controlesRouges = null;
      if (!passeFinale) {
        etape = CONTROLES;
        tentative = 0;
        finale = true;
        return decision();
      }
      maj.verifie = vert.arbre;
      etape = lire('lotAccepte', { arbre: vert.arbre }) ? INTEGRATION : RELECTURE;
      return decision();
    }
    const passe = !passeFinale
      ? { arbre: null, restreinte: null }
      : regeneration
        ? { arbre: lire('arbreAvant'), restreinte: regeneration.restreinte }
        : lire('passeFinale');
    const k = lire('controles', {
      finale: passeFinale,
      restreinte: passe.restreinte,
      reportes: regeneration?.reportes ?? null,
      ...(reprise ? { fichiers: reprise.fichiers } : {}),
    });
    if (k.rouge || k.aRepasser) {
      garderLeVert(nomEtape, null);
    }
    // The output of these checks, red, which a sending to the testwriter carries.
    maj.controlesRouges = k.rouge ? k.texte : null;
    // The outcome the bilan reads (scripts/bilan.mjs): with the reds, each its place and its
    // text, by which it knows two checks that measured the same thing.
    const resultat = issue => ({
      issue,
      finale: passeFinale,
      rouges: k.rouges.map(r => `${r.paquet} : ${r.texte}`),
    });
    rapport = k.texte;
    // A developpeur who had nothing to deliver before these checks.
    const rien = m('rienALivrer');
    maj.rienALivrer = null;
    // A stop of the checks: <phrase>, then the report, its reds also kept apart, as its piece;
    // the stop kept at the checks keeps their outcome.
    const arret = (nom, phrase, lieu = null) => {
      const avant = phrase ? `${phrase}\n\n` : '';
      return arreter(nom, `${avant}${k.complet}`, {
        rouges: k.rouges,
        motif: `${avant}${k.sansListe}`,
        etape: lieu,
        resultat: lieu ? null : resultat(nom === 'a-repasser' ? 'a-repasser' : 'rouge'),
        // A « à repasser » that is a wait for a place, the lock or room plays again without limit.
        ...(nom === 'a-repasser' && k.attente ? { attente: true } : {}),
      });
    };
    const suivante = tentative + 1;
    const regenereSur = m('regenereSur');
    // A final pass with a red of a reference, mixed with others or not, or a debt the lot
    // lowers: their regeneration, once for this pass, but for a reference the checks had
    // regenerated on this same tree, whose inputs have not changed since; the reds that remain
    // then go each to its owner.
    const dejaRegenerees = regenereSur && regenereSur.arbre === passe.arbre ? regenereSur.noms : [];
    const aRegenerer =
      passeFinale && !regeneration && (k.rouge || k.notes.length > 0)
        ? lire('referencesDesRouges', { lieux: k.lieux, aElaguer: k.notes.length > 0 }).filter(
            r => !dejaRegenerees.includes(r.nom)
          )
        : [];
    // The checks of the plan with a red of a reference, mixed with others or not: its
    // regeneration before any red goes to the developpeur, as Bazel builds a genrule before the
    // tests that read it, but for a reference regenerated on this same tree; mixed with other
    // reds, the checks of the plan play again on the regenerated tree, which judges a test
    // that reads the reference; alone, the final pass that is due (BPScript 320.6.5: a test
    // that reads the turbo.json, red beside their guard, sent to the developpeur, who could not
    // write them).
    // The debt the lot lowers, seen at the checks of the plan by its notes (`a-elaguer`), is the
    // red of a reference too: regenerated before the checks judge the lot again, whether the
    // developpeur delivered or not (the regeneration only lowers the keys noted, it hides no
    // defect).
    const dette =
      !passeFinale && k.notes.length > 0
        ? lire('referencesDesRouges', { lieux: [], aElaguer: true })
        : [];
    const regenereesAuxControles =
      !passeFinale &&
      (k.references.length || k.notes.length) &&
      regenereSur?.arbre === lire('arbreApres')
        ? regenereSur.noms
        : [];
    const avantLesControles = passeFinale
      ? []
      : [...k.references, ...dette.filter(d => !k.references.some(r => r.nom === d.nom))].filter(
          r => !regenereesAuxControles.includes(r.nom)
        );
    if (avantLesControles.length) {
      const noms = avantLesControles.map(r => r.nom);
      const deLaDette = dette.some(d => noms.includes(d.nom));
      const meles = k.rouge || k.aRepasser || deLaDette;
      geste('regeneration');
      const phrase = `${k.resume} ; ${deLaDette ? 'la dette des gardes baisse, ou des rouges sont ceux de références' : 'des rouges sont ceux de références'} (${noms.join(', ')}) : à leur régénération, puis ${meles ? 'les contrôles du plan' : 'la passe finale'}.`;
      ecrireRapport(
        'controles',
        phrase,
        resultat(meles ? 'rouge' : 'vert'),
        meles ? `${k.texte}${k.avertissements}` : `${phrase}${k.avertissements}`
      );
      // Mixed, the developpeur who had nothing to deliver, for the checks of the plan that
      // follow; green, the final pass, its sessions counted apart, which a developpeur with
      // nothing to deliver before green checks does not concern.
      if (meles) {
        maj.rienALivrer = rien;
      } else {
        maj.renvoiAuTestwriter = null;
        tentative = 0;
      }
      // The report of the reds of the plan, which go to the developpeur when a command of the
      // project refuses the lot, as at the final pass (BPScript 320.10).
      maj.aRegenerer = {
        noms,
        notes: k.notes,
        suite: meles ? 'controles' : 'passe',
        rouges: meles ? k.tous : [],
        auDeveloppeur: meles && k.auDeveloppeur && !k.arbitrer ? k.texte : null,
      };
      etape = REFERENCES;
      finale = true;
      return decision();
    }
    if (aRegenerer.length) {
      const noms = aRegenerer.map(r => r.nom);
      geste('regeneration');
      ecrireRapport(
        'controles',
        `${k.resume} ; ${k.rouge ? 'des rouges sont ceux de références' : 'la dette des gardes baisse'} (${noms.join(', ')}) : à leur régénération.`,
        resultat(k.rouge ? 'rouge' : 'vert'),
        `${k.texte}${k.avertissements}`
      );
      // The report of the reds of the plan, which go to the developpeur when a command of the
      // project refuses the lot.
      maj.aRegenerer = {
        noms,
        rouges: k.tous,
        notes: k.notes,
        auDeveloppeur: k.auDeveloppeur && !k.arbitrer ? k.texte : null,
      };
      etape = REFERENCES;
      finale = true;
      return decision();
    }
    // A red in a component the plan set apart from the survey: the plan extends to it, without a
    // stop, and the red goes on as the plan's (the circuit writes the extension, with its piece, at
    // the ticket).
    if (k.rouge && k.ecartesRouges?.length) {
      lire('etendreAuxEcartes', { composants: k.ecartesRouges, rouges: k.tous });
    }
    // The reds of a reader package out of the plan that all lie in test files: the plan extends to
    // those tests alone, without a stop, and the testwriter, who alone writes them, is relaunched
    // by the attribution below (the circuit writes the extension, with its piece, at the ticket).
    if (k.rouge && k.testsLecteurs?.length) {
      lire('etendreAuxTests', { composants: k.testsLecteurs, rouges: k.tous });
    }
    if (k.rouge && passeFinale && k.horsTitre.length) {
      return arret(
        'controles',
        `La passe finale est rouge dans ${k.horsTitre.join(', ')}, hors du plan du ticket (${plan}) : le développeur n'est pas relancé. Le superviseur étend le plan à ce paquet (\`--etendre\`), le rouge allant ensuite au développeur, ou fait corriger le lot (\`--depuis developpeur\`, le rouge en \`--contexte\`).`
      );
    }
    if (k.rouge && !k.auDeveloppeur) {
      return arret(
        'controles',
        `Aucun paquet du plan (${plan}) ne tient ce rouge de la passe finale (un rouge de la racine, ou que rien ne situe).`
      );
    }
    if (k.rouge && k.arbitrer) {
      return arret(
        'controles',
        'Les rouges du plan sont des constats à arbitrer : aucun développeur ne les tranche.'
      );
    }
    if (k.rouge && lire('mecanique')) {
      // A mechanical lot: no testwriter nor developpeur lifts the red of its command.
      return arret(
        'controles',
        `Le ticket est mécanique (${ticket.sorte.raison}) : ni testwriter ni développeur ne lève ce rouge du lot de sa commande. Le superviseur fait corriger le lot (\`--depuis developpeur\`, le rouge en \`--contexte\`), corrige le geste dans la copie puis \`--reprendre\`, ou arrête le circuit (\`--arreter\`).`
      );
    }
    // A run recorded before the marker `attribution-avant-sans-livraison` of the workflow of a
    // ticket (src/temporal/circuit/deroule.ts) keeps the former order: the stop of a developpeur
    // who had nothing to deliver before any attribution, the fact « portes » not read, as its
    // history replays. This path leaves once those runs have ended (grillhouse-3uv.177).
    if (k.rouge && rien && !marqueurs.attributionAvantSansLivraison) {
      return arret('sans-livraison', rien, CODE);
    }
    // The red goes back to the step that carries it, by the files it names (scripts/reprise.mjs).
    const portes =
      k.rouge && suivante <= SEANCES_DEVELOPPEUR ? lire('portes', { lieux: k.lieux }) : null;
    const a = portes ? attribuerLeRouge({ lieux: k.lieux, portes }) : null;
    // A developpeur who had nothing to deliver stops the circuit on a red that is his: the stop
    // stands at his step, which a resumption plays again. A red that names a test file of the lot
    // is the testwriter's, who is relaunched: the developpeur had nothing to write for it.
    if (k.rouge && rien && a?.etape !== 'testwriter') {
      return arret('sans-livraison', rien, CODE);
    }
    if (a) {
      if (!a.etape) {
        return arret('controles', `Le rouge n'est attribué à aucune étape : ${a.motif}.`);
      }
      if (a.etape === 'testwriter') {
        const relances = (m('relancesTestwriter') ?? 0) + 1;
        if (relances > RELANCES_TESTWRITER + 1) {
          return arret('controles', null);
        }
        maj.relancesTestwriter = relances;
        // The final pass red in one test file alone: that file is replayed, then the checks and
        // the final pass restricted to what it reaches, with no session for the rest of the lot.
        maj.reprise =
          passeFinale && a.fichiers.length === 1 && portes.tests.includes(a.fichiers[0])
            ? { fichiers: a.fichiers }
            : null;
        ecrireRapport(
          'controles',
          `${k.resume} ; le rouge nomme ${a.fichiers.join(', ')} : testwriter relancé (séance 1).`,
          resultat('rouge'),
          `${k.texte}${k.avertissements}`
        );
        etape = TESTS;
        tentative = 1;
        finale = false;
        return decision();
      }
      maj.reprise = null;
      ecrireRapport(
        'controles',
        `${k.resume} ; développeur relancé (séance ${suivante}).`,
        resultat('rouge'),
        `${k.texte}${k.avertissements}`
      );
      etape = CODE;
      tentative = suivante;
      return decision();
    }
    if (k.rouge) {
      return arret('controles', null);
    }
    if (k.aRepasser) {
      return arret('a-repasser', null);
    }
    ecrireRapport('controles', `${k.resume}.`, resultat('vert'), `${k.resume}.${k.avertissements}`);
    // Green checks: a sending of the developpeur to the testwriter may come again.
    maj.renvoiAuTestwriter = null;
    maj.relancesTestwriter = 0;
    const entierement = !reprise && !regeneration;
    if (!passeFinale) {
      if (entierement && k.empreinte) {
        garderLeVert('controles', { empreinte: k.empreinte, ms: k.ms });
      }
      // The checks green: the final pass, its sessions counted apart.
      etape = CONTROLES;
      tentative = 0;
      finale = true;
      return decision();
    }
    // The whole pass green on this lot; the lot the last review accepted goes to the
    // integration, any other to the review.
    // A final pass green on the band of the lot (after a regeneration, on what it changed, or not
    // played when it changed nothing) verifies its tree: the lot accepted on it goes to the
    // integration.
    if (passe.arbre) {
      maj.verifie = passe.arbre;
    }
    if (entierement && k.empreinte) {
      garderLeVert('passe-finale', { empreinte: k.empreinte, arbre: passe.arbre, ms: k.ms });
    }
    if (reprise) {
      // The restricted pass is green: the resumption ends.
      maj.reprise = null;
    }
    etape = lire('lotAccepte', { arbre: passe.arbre }) ? INTEGRATION : RELECTURE;
    return decision();
  }

  function references() {
    // The references to regenerate and the reds of the pass before, kept in the state from
    // the pass that called for them (the checks of the plan, `suite`, or the final pass), so
    // that a regeneration resumed knows them.
    const a = m('aRegenerer');
    if (!a) {
      return arreter(
        'references',
        "L'état du circuit ne garde pas les références à régénérer : la passe finale les redonne (`--depuis developpeur`)."
      );
    }
    // A command of the project that refuses beside reds of the plan, within the developpeur's
    // sessions: the copy restored, those reds go to him with its output, then the pass that
    // called for the regeneration, the checks of the plan or the final pass.
    const suivante = tentative + 1;
    const auLot = Boolean(a.auDeveloppeur) && suivante <= SEANCES_DEVELOPPEUR;
    const g = lire('regeneration', {
      noms: a.noms,
      notes: a.notes,
      suite: a.suite ?? null,
      refusAuLot: auLot,
    });
    if (g.refus) {
      const texte = [
        `La régénération des références refuse le lot ; la copie est rendue telle qu'avant elle, et les rouges du plan vont au développeur (séance ${suivante}).`,
        '',
        ...g.refus,
      ].join('\n');
      ecrireRapport('references', texte, { regenerees: [], fichiers: [] });
      rapport = `${texte}\n\n${a.auDeveloppeur}`;
      maj.aRegenerer = null;
      maj.rienALivrer = null;
      etape = CODE;
      tentative = suivante;
      finale = a.suite !== 'controles';
      return decision();
    }
    ecrireRapport('references', g.texte, { regenerees: g.regenerees, fichiers: g.fichiers });
    // After the checks, the pass that judges the regenerated tree, which does not regenerate
    // again the references just regenerated on it: beside other reds, the checks of the plan
    // again (none plays when the regeneration changed nothing, the reds of the checks before
    // standing); without, the final pass that is due. After a final pass, the pass restricted
    // to what the regeneration changed, with the reds of the pass before.
    maj.regenereSur = a.suite ? { arbre: lire('arbreApres'), noms: a.noms } : null;
    maj.regeneration =
      a.suite === 'passe'
        ? null
        : a.suite === 'controles'
          ? g.fichiers.length
            ? null
            : { reportes: { rouges: a.rouges, rejouee: false } }
          : {
              restreinte: g.restreinte,
              reportes: { rouges: a.rouges, rejouee: g.fichiers.length > 0 },
            };
    maj.aRegenerer = null;
    etape = CONTROLES;
    finale = a.suite !== 'controles';
    return decision();
  }

  function relecture() {
    const v = lire('relecture');
    // A question for the owner: nothing is committed nor relaunched before his answer.
    if (v.fiche.question) {
      return arreter(
        'besoin',
        `Le relecteur attend une réponse : ${v.fiche.question}\n\nLe verdict :\n\n${v.texte}`,
        {
          piece: v.fiche.piece,
          question: `Le relecteur demande : ${v.fiche.question}`,
          qui: RESPONSABLE,
        }
      );
    }
    if (v.verdict === 'ACCEPTÉ') {
      // The review that accepts the lot closes every finding, each one it judged lifted
      // (`suiviDesConstats`).
      maj.constats = [];
      // A green final pass stands behind this lot (`verifie`, set by the pass that routed to this
      // review, with no session changing the copy since): the reviewer accepted the lot the final
      // pass verified, so it goes to the integration, as a merge queue merges the commit it tested
      // (bors, Zuul). The decision reads `verifie` as that fact, never re-hashing the live working
      // tree, whose non-deterministic build artifact would differ between the pass and the review
      // and keep the lot out of the integration for ever. A lot the review kept none of (`!v.arbre`,
      // git could not commit it) goes there too.
      if (!v.arbre || m('verifie')) {
        maj.toursDeLaPasseFinale = null;
        commenter('relecture', 'ACCEPTÉ ; le lot va à l’intégration.');
        etape = INTEGRATION;
        return decision();
      }
      // No final pass has verified this lot (a resumption, or git could not hash the copy): its
      // band plays once, then the integration. The cycle is bounded — after
      // `TOURS_DE_LA_PASSE_FINALE` tours without reaching the integration, the circuit stops on a
      // question to the supervisor naming the probable cause, instead of replaying the pass and the
      // reviewer without end.
      const tours = (m('toursDeLaPasseFinale') ?? 0) + 1;
      if (tours > TOURS_DE_LA_PASSE_FINALE) {
        return arreter(
          'relecture-arret',
          `Le relecteur rend ACCEPTÉ, mais ${TOURS_DE_LA_PASSE_FINALE} passes finales n’ont pas mené le lot à l’intégration : l’arbre de la copie ne se stabilise pas entre la passe finale et la relecture.\n\nLe verdict :\n\n${v.texte}`,
          {
            piece: v.fiche.piece,
            question:
              'Un artefact de construction non déterministe dans la copie, ou une sortie de construction qu’aucune tâche ne déclare, empêche l’arbre de la copie de se stabiliser entre la passe finale et la relecture : qu’est-ce qui le déstabilise, et se lève-t-il pour reprendre ?',
          }
        );
      }
      maj.toursDeLaPasseFinale = tours;
      commenter(
        'relecture',
        'ACCEPTÉ ; la passe finale sur la bande du lot (sa base et ses dépendants), qui n’a pas joué sur ce lot, puis l’intégration.'
      );
      etape = CONTROLES;
      tentative = 0;
      finale = true;
      return decision();
    }
    // The reviews since the last ACCEPTÉ: a lot the queue sent back starts a new count.
    const rendus = lire('rendus');
    if (rendus >= RELECTURES) {
      return arreter(
        'relecture-arret',
        `${rendus} relectures ont rendu le lot : le circuit s'arrête à la troisième.\n\nLe dernier verdict :\n\n${v.texte}`
      );
    }
    // The findings still open once the sheet is read (`constatsOuverts` of scripts/circuit.mjs),
    // or its stop for a finding without a valid recipient.
    const lus = lire('constats');
    if (lus.arret) {
      return decision({ arret: lus.arret });
    }
    maj.constats = lus.constats;
    // A lot of the short circuit (mechanical, or written by hand under a plan « comportement
    // inchangé ») that the reviewer renders for a changed behaviour (`comportement-change`) goes
    // back to 2 Tests on the same plan, its sort turned to comportement with the verdict as its
    // reason: a test now can turn red. It counts among the RENDU above, so the third stops the
    // circuit and a ticket turned both ways does not loop.
    if (basculeDuCircuitCourt({ fiche: v.fiche, sorte: ticket.sorte })) {
      effets.push({
        genre: 'sorte',
        sorte: { genre: 'comportement', raison: v.texte, comportement: 'changé' },
      });
      etape = TESTS;
      tentative = 1;
      rapport = null;
      finale = false;
      maj.verifie = null;
      maj.toursDeLaPasseFinale = null;
      commenter(
        'relecture',
        `RENDU (relecture ${rendus}) : le lot du circuit court change un comportement ; la sorte du ticket devient comportement, le plan reste, et le circuit reprend à 2 Tests.`
      );
      return decision();
    }
    const saute =
      arretDuTestwriterSaute(
        {
          constats: lus.constats,
          sansTests: ouverts(lus.constats, 'testwriter').length > 0 && lire('sansTests'),
          paquets: ticket.paquets,
        },
        v.texte
      ) ??
      arretDuGesteMecanique(
        { constats: lus.constats, mecanique: lire('mecanique'), sorte: ticket.sorte },
        v.texte
      );
    if (saute) {
      return decision({ arret: saute });
    }
    const auTestwriter = ouverts(lus.constats, 'testwriter').length > 0;
    etape = auTestwriter ? TESTS : CODE;
    tentative = 1;
    rapport = null;
    finale = false;
    // Relaunching a role reworks the lot: its earlier final pass no longer verifies it, and the
    // tours of the ACCEPTÉ ↔ final pass cycle start over.
    maj.verifie = null;
    maj.toursDeLaPasseFinale = null;
    commenter(
      'relecture',
      `RENDU (relecture ${rendus}) ; le circuit relance ${auTestwriter ? 'le testwriter' : 'le développeur'}, ses ${lus.constats.length} constat(s) ouvert(s) dans la consigne de chaque séance, puis la passe finale sur la bande du lot (sa base et ses dépendants), et le relecteur sur la différence.`
    );
    return decision();
  }
}

// The name of the stop of an agent's sheet that is not FAIT: « besoin » for a question, else
// « hors-portee ».
const nomDuStatut = fiche => (fiche.statut === 'BESOIN' ? 'besoin' : 'hors-portee');
