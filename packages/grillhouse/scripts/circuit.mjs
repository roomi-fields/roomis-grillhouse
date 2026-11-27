// The circuit of one ticket: the functions of its acts, and the client of its workflow.
// Mechanism: docs/architecture/circuit.md §3.1, §4, §5; entree.md §5.1.
//
// The workflow of a ticket under Temporal (src/temporal/circuit/deroule.ts) leads the run and plays
// each act in a process of its own (scripts/faits-du-circuit.mjs), which calls the functions below
// (the opening, a step of the plan, the preparation of a pass, a fact, a stop, the end). The command
// `npx grillhouse circuit` is the client of that workflow (src/temporal/circuit/commande.ts): it
// queues a ticket, answers a stop (`--reprendre` with `--contexte`, `--depuis <testwriter|preuve|
// developpeur|direct|controles|passe-finale>`, `--etendre <paquet>[,<paquet>…]`) or stops it (`--arreter`).
// `--depuis` goes with no `--reprendre` and names no component (a second name is a second ticket,
// exit 2); `--etendre` refuses a package the repository does not hold (exit 2).
//
// Invariants the code holds:
// - Every step is one for the whole ticket: no component is a unit of the circuit.
// - The decisions of a step (next step, attempt, report, stop) are the functions without input nor
//   output of scripts/transitions.mjs; the circuit reads the facts they ask for and plays the
//   effects they return.
// - The circuit decides on structured results only (scripts/resultats.mjs: the sheet that ends each
//   session, the Turborepo summaries, the Vitest JSON reports, the guards' SARIF), never on a
//   comment, an answer or a log (guard: tests/unit/circuit-sans-texte-libre.spec.ts).
// - The plan is read in the ticket's title, after its last « — », and the ticket holds its
//   « ## Architecture » section (scripts/depart-du-ticket.mjs); the launch refuses a ticket that
//   does not, before any work.
// - The mechanical gestures (GESTES of scripts/etapes.mjs) play with no session; every other stop
//   goes up to the supervisor (`monter`) with its `question` { arret, fait, piece, question, qui }
//   (MONTEES of scripts/etapes.mjs), written at the ticket (`Circuit · question : …`).
// - Each session is a launch of scripts/enveloppe/lancer.sh in its own process group; its exit code
//   is the one lancer.sh writes to `.claude/worktrees/<ticket>.travail/seances/<id>/fin`
//   (`rangDeLaSeance`, scripts/seances.mjs), its result to `resultat.json` beside it. Its sheet is
//   read in `structured_output` (`lireFiche`), each file piece checked in the copy; a session with
//   no conforming sheet is resumed once (same session), a second one stops at « sans-fiche ».
// - A session whose transcripts and log stand still for 20 minutes (IMMOBILE_MS;
//   GRILLHOUSE_CIRCUIT_IMMOBILE_MS replaces it, in milliseconds) gets SIGTERM, then SIGKILL, to the
//   launcher's group.
// - Each comment at the ticket carries its author (BEADS_ACTOR): the role's name for a session,
//   `circuit`, `relecteur` for the verdict, `file` for the queue (AUTEUR_DE_LA_FILE of
//   scripts/integration/file.mjs); the rights of every session refuse `--actor`, `-a`/`--author`
//   and the variable itself (AUTEUR_FIXE of scripts/droits.mjs).
// - Each header of the log dates it in local time with its offset (ISO 8601).
// - Each pass (proof, checks, final pass, integration, queue) plays under its own results directory
//   (`GRILLHOUSE_RESULTATS`) and progress directory (`GRILLHOUSE_AVANCEMENT`), and under the
//   machine's budget (scripts/passe-de-la-machine.mjs); a wait that reaches its bound is the 75.
//   `npm test` in a package named whole carries `GRILLHOUSE_DEPUIS_LE_VERT`
//   (scripts/dernier-vert.mjs).
// - The proof plays `npm test -- --force <files of the lot>` per package, a module of a test
//   executable by the file that plays it (the whole package when the lot holds no test file); the
//   failure of a test it holds as main's is a red written
//   `rouge existant : <file> › <name> — <message>`; its
//   report goes to `.claude/worktrees/<ticket>.preuve-<n>.md`; the tests that carry the work are
//   those the testwriter's sheet names in `portent_le_travail`. A failed proof relaunches the
//   testwriter twice at most.
// - The developpeur has three sessions for the checks and three for the final pass, the third on
//   the strong model (`lancer.sh --modele opus`, the others `sonnet`). A session that changes no
//   file of the plan (`git status --porcelain` and the content of each file, before and after) is
//   the gesture `rien-a-livrer`; a `renvoi` to the testwriter is `renvoi-au-testwriter`, stopped at
//   « sans-livraison » on the same red output twice in a row (`controlesRouges`).
// - Before the checks and the final pass (SUR_LA_POINTE) the copy is prepared on the tip of main
//   (`avantLaPasse`, scripts/enveloppe/travail-de-la-copie.mjs `preparer`); a preparation that
//   fails stops at « lancement ».
// - The checks: `npm test -- <package>` per package of the plan, `npm test -- <test files of the
//   lot>`, `npm exec --no -- grillhouse construire --gardes`, then the guards
//   (`GRILLHOUSE_ENVELOPPE=<plan> npm run grillhouse:gardes`, and `npm run gardes` when the project
//   has it). A warning or a note of the SARIF is listed apart and given to no developpeur.
// - The final pass plays the band of the lot (`laPasseFinale`: the copy kept as a commit,
//   `npm run verifier -- --filter=...[<base>...<copie>] --filter=//`) and marks the lot verified
//   (`verifie`, read as a mark, never re-hashed).
// - The references (4.2) are the frame's (`referencesDuCadre`), the project's
//   (`grillhouse.references`: { nom, commande, fichiers, tests, gardes, lit }) and its generated
//   files (`grillhouse.engendres`, scripts/engendres.mjs); a command that fails, or a file changed
//   that no reference covers, stops at « references » (23) with the copy restored (`aRegenerer`).
// - The reviewer is `claude -p --agent relecteur --session-id <uuid>` (CLAUDE_BIN replaces claude)
//   on Sonnet; its sheet needs a `conformite` line per element of the lot (`conformiteDuLot`,
//   scripts/resultats.mjs); a blocking finding names its agent; the third RENDU since the last
//   ACCEPTÉ stops at « relecture-arret ». The ACCEPTÉ ↔ final pass cycle is bounded
//   (`TOURS_DE_LA_PASSE_FINALE`).
// - The integration builds the lot from the copy (the testwriter's files, `estUnTest`, in one
//   patch, the others in another; message `<type>(<paquets>): <sujet> (<ticket>)`, the type read
//   from the ticket's type: bug fix, chore, docs, else feat) and runs
//   scripts/integration/integrer.mjs: 0 commits on agent/<ticket> and labels the ticket `en-file`,
//   75 plays it once more (`rejeu`) then stops at « a-repasser », any other code is a refusal
//   (« integration »). The queue is the workflow `file:<racine>` (src/temporal/file/deroule.ts).
// - The tri of the discoveries (5.3, `trier`) never stops the circuit nor undoes the integration.
// - The working files live beside the copy: `.claude/worktrees/<ticket>.travail` (instructions,
//   results, errors, patches), `.log`, `.fiches.jsonl` (`{ date, role, fiche }`), `.bilan.json`
//   (scripts/bilan.mjs, written at each end).
// - The state (the effect `etat`, scripts/effets.mjs) is `{ etape, tentative, code, raison,
//   rapport, finale, relanceSurLeRefus, boucles, question, questionnement, paquets, constats,
//   verifie, mene, reprise, refus, aRegenerer, controlesRouges, rang, circuit, journal }`.
// - The circuit (`long`, `court` or `direct`) is fixed at the first opening, `direct` on the label
//   of the ticket, with no plan; a resumption keeps that of the stopped state, and the sort turns
//   `long` and `court` (`circuitSuivant` of scripts/transitions.mjs).
// - The plan writes `## Noms publiés` (`noms_publies` of the explorateur's last sheet; an empty list
//   erases the section, a sheet without the field keeps it) and `## Sorte` (`sorteDuPlan`,
//   scripts/resultats.mjs; absent or unreadable, comportement) in the description; a mechanical
//   ticket (`cheminMecanique`) plays the gesture `mecanique` at 1.1 (lancer.sh `--fiche geste`,
//   the schema `geste`); a copy that then holds no change of the plan stops at « sans-livraison ».
//   A plan with no test (`sansTests`) skips the testwriter and the proof.
//
// Codes of the stops (ARRETS), 0 at « integre »; the cause of each is in circuit.md §5.4:
//   10 lancement, 11 bloqué, 12 sans-fiche, 13 preuve, 14 controles, 15 sans-livraison,
//   16 relecture-arret, 17 integration (also lot-absent, copie-gardee), 19 hors-portee, 20 besoin,
//   22 questionnement, 23 references, 24 hors-plan, 25 inattendu (`arretInattendu`),
//   26 limite-d-usage (no question: the circuit reports itself to the hour the usage returns),
//   75 a-repasser (the gesture `a-repasser`).
// Every stop but 75 and 26 is a question for the supervisor.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  openSync,
  mkdirSync,
  appendFileSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { empreintesDe, outilsDe } from './outils-cles.mjs';
import { donneesDe } from './donnees-cles.mjs';
import { engendresDe } from './engendres.mjs';
import { matieresDeclareesDe } from './matieres-cles.mjs';
import { fluxDe } from './flux-des-paquets.mjs';
import {
  AGENTS_DU_LOT,
  AUTEURS_DE_LOT,
  agentsDuLot,
  auteurDuCode,
  leRole,
  ARRETS,
  AUTO,
  bouclesDe,
  etapeDuCircuit,
  EXPLORATEUR,
  libelle,
  monteeDe,
  QUESTIONNEUR,
  SUITE,
} from './etapes.mjs';
import {
  CONTROLES,
  PREUVE,
  circuitDeLaSorte,
  circuitSuivant,
  correctionsDuPlan,
  ouvertesDuPlan,
  pasDuPlan,
  questionsPosees,
  contexteDeLExtension,
  depart,
  etendre as reprendreEtendu,
  renvoiDe,
  fichiersDeTestRouges,
  TESTS,
} from './transitions.mjs';
import {
  arbreDeLaCopie,
  controles,
  empreinte,
  empreinteDeLEtape,
  environnementDeLaPasse,
  horsDeLEnveloppe,
  integrer,
  laPasseFinale,
  leLotAccepte,
  leLotGarde,
  lesReferences,
  livre,
  portesDuRouge,
  preuve,
  referencesDesRouges,
  regenerer,
  rejouerLesEngendres,
  relire,
  sansTests,
  testsDuLot,
  trier,
} from './activites.mjs';
import {
  ACTEUR,
  Arret,
  AUTEUR_DU_CIRCUIT,
  codeDejaPresent,
  commenter,
  composantsDe,
  derniereDe,
  entete,
  fichesDe,
  fin,
  geste,
  inscrire,
  lesCommentaires,
  lesFiches,
  leTicket,
  lire,
  nomsDe,
  passations,
  PREFIXE,
  premiereLigne,
  sansCouleurs,
} from './ticket-du-circuit.mjs';
import { emettre } from './effets.mjs';
import { heureLocale } from './journal-des-etats.mjs';
import {
  arretDuStatut,
  consigne,
  auLancement,
  idDeSeance,
  jusquALaFiche,
  rouleDeTest,
  seance,
} from './seances.mjs';
import { releve } from './composants-affectes.mjs';
import { ligneDEtape, transcriptionsDeLaCopie } from './registre.mjs';
import {
  bloquantsDeLaFiche,
  cleDuConstat,
  estUneBascule,
  estUnPlan,
  ficheDuPlan,
  reponsesAuxQuestions,
  sorteDesFiches,
  sorteDuPlan,
} from './resultats.mjs';

// The sheet of the plan that says a field, as scripts/resultats.mjs reads it.
export { ficheDuPlan };
import { preparer, rolesDuConflit } from './enveloppe/travail-de-la-copie.mjs';
import { refusArbitrage } from './integration/integrer.mjs';
import { prendreUnRang } from './places-de-la-machine.mjs';
import { langageDe, langageDeLaCopie } from './langages.mjs';
import { leTitre, ticketAuLancement } from './depart-du-ticket.mjs';
import { fichiersNommesAuTicket } from './fichiers-nommes.mjs';
import { ouvrirBase } from './mesure/base-de-passe.mjs';
import { GREFFON } from './cadre.mjs';
import { retirerLesCopiesDuDepot } from './copies-finies.mjs';
import { lesReponses, reponseMecanique } from './reponses-du-circuit.mjs';

// The time a session's transcripts may stand still before the circuit stops it.
export const IMMOBILE_MS = 20 * 60 * 1000;
// The exit code of each stop, from the list of the steps and stops.
export { ARRETS, codeDejaPresent };
// The steps the circuit leads itself, with no agent: each one counts in the ticket's working time.
const MENEES = new Set(SUITE.filter(e => e.qui.includes(AUTO) && e.etat).map(e => e.etat));

const ici = import.meta.dirname;
const PREPARER = path.join(ici, 'enveloppe', 'travail-de-la-copie.mjs');
// A malformed call: its message.
class Usage extends Error {}

// The stop « inattendu » of the exception <erreur> fallen at the step <etape> of the circuit of
// <ctx>: `{ code, nom, rapport, piece, question }`. As a scheduler writes a job's error as a
// result with its log (Zuul, Buildbot, GitLab CI) and does not die of it, the circuit ends on a
// written stop whose question carries the message, the stack, the step and the command that
// resumes. Only the supervisor resumes, once the cause is lifted.
export function arretInattendu(ctx, erreur, etape) {
  const message = String(erreur?.message ?? erreur);
  const pile = String(erreur?.stack ?? message);
  const reprise = `npx grillhouse circuit ${ctx.ticket} --reprendre`;
  return {
    code: ARRETS.inattendu,
    nom: 'inattendu',
    rapport: message,
    piece: `${message}\n${pile}`,
    question: `Une exception inattendue est tombée à l'étape « ${etape} » : ${message}\n\nPile :\n${pile}\n\nLa commande qui reprend, une fois la cause levée : \`${reprise}\`.`,
  };
}

// The red of the reading of the copy <ctx.copie> right after a session of the testwriter or the
// developpeur: the module of the language (`langageDe`, the common call) no longer reads its
// components (cargo metadata red), so the copy that agent left is a red build handed back to him
// with the tool's output, or null when the copy reads. The place makes the red, not the error: a
// reading that fails anywhere else is the stop « inattendu ».
export function rougeDeLecture(ctx) {
  try {
    composantsDe(ctx.copie);
    return null;
  } catch (e) {
    return {
      rapport: `La copie ne se lit plus : le module de langage ne lit pas ses composants.\n\n${sansCouleurs(e?.message ?? e)}`,
    };
  }
}

// The main tree, from git's common directory: run from a copy, the circuit still finds the others.
function arbrePrincipal() {
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw new Usage("le dossier courant n'est pas dans un dépôt git.");
  }
  return path.dirname(r.stdout.trim());
}

// The context of one run: the paths of the ticket, its plan, how the circuit speaks to bd.
export function contexte(o) {
  const racine = arbrePrincipal();
  const copie = path.join(racine, '.claude', 'worktrees', o.ticket);
  // The comments of a long ticket pass the 1 MiB that a child process returns by default. bd runs
  // under the author <qui>; `bd` under the circuit's.
  const bdSous = (qui, ...a) =>
    spawnSync('bd', a, {
      cwd: racine,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, [ACTEUR]: qui },
    });
  const bd = (...a) => bdSous(AUTEUR_DU_CIRCUIT, ...a);
  // The ticket, its architecture and its plan, read as the launch reads them
  // (scripts/depart-du-ticket.mjs); the plan of a title written again read by `duTitre`.
  const {
    ticket: t,
    resoudre,
    sujet,
    plan,
  } = ticketAuLancement(racine, o.ticket, {
    arreter: Boolean(o.arreter),
    bd,
    plan: o.paquets ?? null,
  });
  const duTitre = titre => leTitre(o.ticket, titre, resoudre);
  // The working directory of the circuit is the ticket's, `<copie>.travail` beside its copy: what
  // the circuit hands its sessions (their instructions, results and errors, the reviewer's
  // statements, the integration's patches and message), which a session out of the envelope reads
  // even when its circuit is killed. As the workspace of a pipeline (Jenkins, GitLab), it lives as
  // long as the ticket: no sweep touches it, a circuit relaunched takes it up again, each session
  // numbering its files after those it finds (`prochainNumero` of scripts/seances.mjs), and the queue removes it at the ticket's closure, or the removal of
  // the copy of a ticket closed without integration (scripts/retirer-copie.sh). The results and
  // the progress of the circuit's passes live in the base of its run
  // (scripts/mesure/base-de-passe.mjs), removed at its end, swept when the run is killed.
  const tmp = `${copie}.travail`;
  mkdirSync(tmp, { recursive: true });
  const baseDuRun = ouvrirBase('circuit');
  const ctx = {
    ...o,
    racine,
    copie,
    bd,
    bdSous,
    resoudre,
    duTitre,
    type: String(t.issue_type ?? ''),
    sujet,
    // The packages of the plan, the components of the title, which every session writes.
    paquets: plan,
    journal: `${copie}.log`,
    fiches: `${copie}.fiches.jsonl`,
    transcriptions: transcriptionsDeLaCopie(copie, os.homedir()),
    immobileMs: Number(process.env.GRILLHOUSE_CIRCUIT_IMMOBILE_MS) || IMMOBILE_MS,
    base: baseDuRun,
    tmp,
    ports: null,
  };
  // The extension of the plan a write out of the plan in a file the ticket names asks for.
  ctx.etendreEnVol = e => etendreEnVol(ctx, e);
  // The same for a write of the testwriter in a test file of a reader package out of the plan.
  ctx.etendreTestsEnVol = e => etendreTestsEnVol(ctx, e);
  // The reader packages the plan extended to their tests (kept among the circuit's sheets).
  ctx.testsEtendus = testsEtendusDuPlan(ctx, ctx.paquets);
  // The components the plan set apart from the survey, which the checks keep verifying.
  ctx.ecartes = ecartesDuPlan(fichesDuPlan(ctx), ctx.paquets, resoudre);
  return ctx;
}

// The sheets of the plan of the explorateur, in their order (`{ fiche, reponse }`).
const fichesDuPlan = ctx => lesFiches(ctx).filter(estUnPlan);

/**
 * The directories of the components the last sheet of the plan <plans> sets apart (`ecartes`, its
 * answer to the questionneur included: an answer that says none keeps those of the plan it answers),
 * less those the plan <paquets> holds now: a component that enters the plan, by the circuit or by
 * the supervisor, leaves the list. <resoudre> turns a name or a path into a directory.
 */
export function ecartesDuPlan(plans, paquets, resoudre) {
  const dedans = d => paquets.some(p => p === '.' || d === p || d.startsWith(`${p}/`));
  const dossiers = (ficheDuPlan(plans, 'ecartes')?.ecartes ?? []).flatMap(e => {
    try {
      return [resoudre(e.composant)];
    } catch {
      return [];
    }
  });
  return [...new Set(dossiers)].filter(d => !dedans(d));
}

// The plan of <ctx> extended, without a stop, to the components <composants> (directories) the plan
// had set apart and that a red of the checks or of the final pass holds: written to the title in
// the order of the plan and said at the ticket with its piece, the red and the reason of the
// setting apart that it belies; kept among the circuit's sheets (`etendus`) as `--etendre` keeps it.
function etendreAuxEcartes(ctx, { composants, rouges = [] }) {
  const gagnes = composants.filter(c => !ctx.paquets.includes(c));
  if (!gagnes.length) {
    return;
  }
  const raisons = new Map(
    (ficheDuPlan(fichesDuPlan(ctx), 'ecartes')?.ecartes ?? []).flatMap(e => {
      try {
        return [[ctx.resoudre(e.composant), e.raison]];
      } catch {
        return [];
      }
    })
  );
  const pieces = gagnes.map(c => {
    const rouge = rouges.find(r => r.ecarte === c)?.texte ?? 'un rouge';
    return `${c} : ${rouge} ; écarté du relevé pour « ${raisons.get(c) ?? 'sans raison écrite'} », ce que ce rouge dément`;
  });
  const { plan, lu } = planEtendu(ctx, ctx.paquets, gagnes);
  const titre = ecrireLePlan(ctx, plan);
  inscrire(ctx, {
    role: AUTEUR_DU_CIRCUIT,
    plan: { empreinte: empreinteDuPlan(leTicket(ctx)), etendus: gagnes },
  });
  commenter(
    ctx,
    'plan',
    `le circuit étend le plan à ${gagnes.join(', ')}, des composants que le plan avait écartés du relevé et que le rouge nomme : ${titre.split(' — ').at(-1)}${ORDRE_LU[lu]}.\n${pieces.map(p => `- ${p}`).join('\n')}`
  );
  ctx.paquets = [...plan];
  ctx.ecartes = ctx.ecartes.filter(d => !gagnes.includes(d));
}

// The test files <rouges> (the texts of reds) name inside the directory <dossier>, each once.
const fichiersRougesDe = (rouges, dossier) => [
  ...new Set(
    rouges
      .flatMap(r => [r.fichier, ...String(r.texte ?? '').split(' ')])
      .filter(t => typeof t === 'string' && t.startsWith(`${dossier}/`))
      .map(t => t.split(':')[0])
  ),
];

// The plan of <ctx> extended, without a stop, to the tests alone of the reader packages
// <composants> (directories) whose reds all lie in test files (`testsLecteurs` of the checks): the
// title of the plan does not change, the package does not enter the plan, and the testwriter alone
// writes those test files (the lock and the envelope read `ctx.testsEtendus`). Said at the ticket
// with its piece, the package, its red test files and, for one the plan set apart, the reason that
// the red belies; kept among the circuit's sheets (`testsEtendus`) as `etendus` is. A package
// already extended to its tests, or that the plan holds, is not extended again.
function etendreAuxTests(ctx, { composants, rouges = [] }) {
  const dedans = d => ctx.paquets.some(p => p === '.' || d === p || d.startsWith(`${p}/`));
  const gagnes = composants.filter(c => !(ctx.testsEtendus ?? []).includes(c) && !dedans(c));
  if (!gagnes.length) {
    return;
  }
  // The reasons of the last sheet of the explorateur that says `ecartes` (his answer to the
  // questionneur that says none leaves those of the plan it answers).
  const raisons = new Map(
    (
      lesFiches(ctx)
        .filter(e => e.role === EXPLORATEUR && Array.isArray(e.fiche?.ecartes))
        .at(-1)?.fiche.ecartes ?? []
    ).flatMap(e => {
      try {
        return [[ctx.resoudre(e.composant), e.raison]];
      } catch {
        return [];
      }
    })
  );
  const pieces = gagnes.map(c => {
    const fichiers = fichiersRougesDe(rouges, c);
    const rouge = fichiers.length ? fichiers.join(', ') : 'un rouge de test';
    return raisons.has(c)
      ? `${c} : ${rouge} ; écarté du relevé pour « ${raisons.get(c)} », ce que ce rouge dément`
      : `${c} : ${rouge} ; hors du titre du plan, que le plan n'a pas écarté`;
  });
  inscrire(ctx, {
    role: AUTEUR_DU_CIRCUIT,
    // No fingerprint: the plan has passed already, and the title does not change.
    plan: { testsEtendus: gagnes },
  });
  commenter(
    ctx,
    'plan',
    `le circuit étend le plan aux tests de ${gagnes.join(', ')}, des paquets lecteurs que le lot fait rougir : leurs fichiers de test seuls entrent au plan, pour le testwriter ; le code de ces paquets reste hors du plan, et ils n'entrent pas au titre (${ctx.paquets.join(', ')}).\n${pieces.map(p => `- ${p}`).join('\n')}`
  );
  ctx.testsEtendus = [...(ctx.testsEtendus ?? []), ...gagnes];
}

// The same extension for the package <paquet> of a test file <chemin> that the lock stopped the
// testwriter on (« hors-plan »), <piece> saying why: the session resumes.
function etendreTestsEnVol(ctx, { paquet, chemin, piece }) {
  if ((ctx.testsEtendus ?? []).includes(paquet)) {
    return;
  }
  inscrire(ctx, {
    role: AUTEUR_DU_CIRCUIT,
    plan: { testsEtendus: [paquet] },
  });
  commenter(
    ctx,
    'plan',
    `le circuit étend le plan aux tests de ${paquet} : ${chemin}, un fichier de test d'un paquet lecteur que le testwriter écrit (${piece}) ; le code de ${paquet} reste hors du plan.`
  );
  ctx.testsEtendus = [...(ctx.testsEtendus ?? []), paquet];
}

// The plan of <ctx> extended to the package <paquet>, the home of <chemin>, a file the ticket's
// description names (<piece>: « ticket, § Architecture » or « ticket, critère N »): the package
// enters the title in the order of `ordonnerLePlan`, written by bd and said at the ticket with its
// piece, and kept with the circuit's sheets (`etendus`) as `--etendre` keeps it. The step goes on.
function etendreEnVol(ctx, { paquet, chemin, piece }) {
  if (ctx.paquets.includes(paquet)) {
    return;
  }
  const { plan, lu } = planEtendu(ctx, ctx.paquets, [paquet]);
  const titre = ecrireLePlan(ctx, plan);
  inscrire(ctx, {
    role: AUTEUR_DU_CIRCUIT,
    plan: { empreinte: empreinteDuPlan(leTicket(ctx)), etendus: [paquet] },
  });
  commenter(
    ctx,
    'plan',
    `le circuit étend le plan à ${paquet} : ${chemin}, que le ticket nomme (${piece}) : ${titre.split(' — ').at(-1)}${ORDRE_LU[lu]}.`
  );
}

// The step of the circuit's state <etat> in words, « 3 Code » (scripts/etapes.mjs), or its
// `etape` when the list holds none.
const ouDansLeCircuit = etat => {
  const e = etapeDuCircuit(etat);
  return e ? libelle(e) : etat.etape;
};

// The report of a proof or of checks: its line at the ticket, and its report kept for the
// reviewer, <rapport> when the comment carries only its summary, beside its outcome <resultat>,
// which the bilan reads (scripts/bilan.mjs): for a proof `{ ok, rouges, justifies (non named greens), sans (named greens), casses,
// anciens, vide }`, for checks `{ issue, finale, rouges }`.
function ecrireRapport(ctx, etape, texte, resultat, rapport = texte) {
  commenter(ctx, etape, texte);
  inscrire(ctx, {
    role: AUTEUR_DU_CIRCUIT,
    etape,
    resultat,
    rapport: `${PREFIXE}${etape} : ${rapport}`,
  });
}

/**
 * The circuit of a run of <ctx> whose state and memory say none: that of the label `direct` for a
 * ticket no session has worked (an opening that failed before its state), else that of its sort
 * (a run in flight, opened without the field).
 */
export function circuitSansTrace(ctx) {
  const mene = lesFiches(ctx).some(e => estUnPlan(e) || AUTEURS_DE_LOT.includes(e.role));
  return !mene && leTicket(ctx).labels.includes('direct')
    ? 'direct'
    : circuitDeLaSorte(ctx.sorte ?? sorteDuTicket(ctx));
}

// The state of the run, written whole (`raison`, `boucles` and `question` null, `finale` and
// `relanceSurLeRefus` false unless <etat> sets them, `paquets`, `constats`, `verifie`, `reprise`,
// `aRegenerer`, `refus`, `controlesRouges`, `rang` and `circuit` the run's), kept as the run's current
// state and emitted (the effect `etat`), which the workflow of the ticket holds
// (src/temporal/circuit/deroule.ts).
export function ecrireEtat(ctx, etat) {
  ctx.courant = {
    raison: null,
    finale: false,
    relanceSurLeRefus: false,
    boucles: null,
    question: null,
    questionnement: null,
    mene: null,
    ...etat,
    circuit: ctx.circuit ?? circuitDeLaSorte(ctx.sorte),
    paquets: ctx.paquets,
    constats: ctx.constats ?? [],
    verifie: ctx.verifie ?? null,
    toursDeLaPasseFinale: ctx.toursDeLaPasseFinale ?? null,
    seanceReprise: ctx.seanceReprise ?? null,
    verts: ctx.verts ?? null,
    reprise: ctx.reprise ?? null,
    aRegenerer: ctx.aRegenerer ?? null,
    refus: ctx.refus ?? null,
    controlesRouges: ctx.controlesRouges ?? null,
    rang: ctx.rang ?? null,
  };
  emettre(ctx, { genre: 'etat', etat: { ...ctx.courant, journal: ctx.journal } });
  // The same transition, dated, in the journal of states (scripts/journal-des-etats.mjs): its
  // loop the first counted, its reason the stop's name or the cause of the return, empty for a
  // normal transition.
  emettre(ctx, {
    genre: 'trace',
    ligne: {
      ts: heureLocale(),
      genre: 'circuit',
      ticket: ctx.ticket,
      etape: etat.etape,
      boucle: Object.values(etat.boucles ?? {})[0] ?? null,
      place: null,
      raison: etat.raison ?? '',
    },
  });
}

// The register's line of the step <etape> the circuit led itself from <debut> (an ISO date) to
// now; a register it cannot write leaves the circuit going (`ecrireLEffet`).
function inscrireEtape(ctx, { etape, debut }) {
  emettre(ctx, {
    genre: 'registre',
    ligne: ligneDEtape({
      projet: ctx.racine,
      ticket: ctx.ticket,
      etape,
      debut,
      fin: new Date().toISOString(),
    }),
  });
}

// The steps whose pass judges the lot, 3.1 and 4.1 (one state, `finale` apart): the copy is
// prepared on the tip of main before each of them.
export const SUR_LA_POINTE = new Set([CONTROLES]);

// The generated files the lot feeds, played again before a pass that plays its tests
// (`rejouerLesEngendres`): `{}`, or `{ arret }`, the stop « references » of a command that fails.
function rejeuDesEngendres(ctx) {
  try {
    if (rejouerLesEngendres(ctx)) {
      geste(ctx, 'rejeu-des-engendres');
    }
    return {};
  } catch (e) {
    if (!(e instanceof Arret)) {
      throw e;
    }
    return { arret: { nom: e.nom, rapport: e.rapport, piece: e.piece, question: e.question } };
  }
}

// What the circuit does before the step <etape>, whose regeneration before it is <regeneration>
// (`ctx.regeneration`), as a merge queue plays its checks on the branch set on the tip of main: at a
// step of SUR_LA_POINTE, the copy prepared by the launcher's own preparation
// (scripts/enveloppe/travail-de-la-copie.mjs, `preparer`: the guard of its submodules, its advance
// to the main tree's HEAD, the pose of its submodules, their mount, the installation when the lock
// file is newer), its output in the ticket's log, with <env>. `{ avancee, regeneration }`: whether
// the copy's HEAD moved (a copy at the tip, or ahead of it, is not moved), and the regeneration the
// pass keeps, none once the copy moved, its tree new; at any other step, the regeneration as it is,
// the copy untouched. Or `{ arret }`, the stop « lancement » (its name, report, piece and
// question), the copy and its work as the preparation leaves them, each file in conflict named.
export function avantLaPasse(
  ctx,
  etape,
  regeneration,
  env = environnementDeLaPasse(ctx, process.env),
  { estUnTest = rouleDeTest(ctx) } = {}
) {
  if (!SUR_LA_POINTE.has(etape)) {
    return etape === PREUVE
      ? { avancee: false, regeneration, ...rejeuDesEngendres(ctx) }
      : { avancee: false, regeneration };
  }
  const tete = dossier =>
    spawnSync('git', ['-C', dossier, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  const cible = tete(ctx.racine);
  const avant = tete(ctx.copie);
  let r;
  if (cible.status === 0 && avant.status === 0) {
    entete(ctx, 'preparation');
    appendFileSync(
      ctx.journal,
      `$ node ${PREPARER} preparer ${ctx.copie} ${cible.stdout.trim()}\n`
    );
    const fd = openSync(ctx.journal, 'a');
    try {
      r = preparer(ctx.copie, cible.stdout.trim(), {
        env,
        sortie: fd,
        suspects: ctx.fichiersDuConflit ?? [],
      });
    } finally {
      closeSync(fd);
    }
  } else {
    r = { ok: false, message: `⛔ ${String(cible.stderr || avant.stderr).trim()}` };
  }
  if (r.ok) {
    const avancee = tete(ctx.copie).stdout.trim() !== avant.stdout.trim();
    // The generated files the lot's files feed play again on the copy as prepared.
    const rejeu = rejeuDesEngendres(ctx);
    return { avancee, regeneration: avancee ? null : regeneration, ...rejeu };
  }
  const fichiers = [...(r.conflits ?? []), ...(r.enAttente ?? [])];
  if (fichiers.length) {
    // The files in conflict, or kept in the lot, go to the role that writes them, the testwriter
    // first, all of them to the agent direct in a direct circuit, who writes tests and code; a
    // role already relaunched for them that left one of its files is not relaunched: the stop
    // goes up.
    const direct = ctx.circuit === 'direct';
    const parRole = direct ? { direct: fichiers } : rolesDuConflit(fichiers, estUnTest);
    const roles = direct ? ['direct'] : parRole.roles;
    const relances = ctx.conflitsRelances ?? [];
    const restants = roles.filter(role => !relances.includes(role));
    if (restants.length && restants.length === roles.length) {
      const deRestants = restants.flatMap(role => parRole[role]);
      const siens = parRole[restants[0]];
      const autres = direct ? '' : " Les fichiers de l'autre rôle restent à sa séance.";
      return {
        avancee: false,
        regeneration,
        conflit: {
          fichiers: deRestants,
          roles: restants,
          rapport: `${r.message}\n\nL'avance de la copie sur la pointe de main a laissé ces fichiers à ton rôle : ${siens.join(', ')}.\nLes marques de conflit sont dans la copie (\`<<<<<<<\`, \`=======\`, \`>>>>>>>\`) : tu résous chaque fichier, marques retirées ; un fichier du lot gardé (\`grillhouse-travail.patch\`, dans le dossier git de la copie) se reprend à la main dans la copie, un fichier supprimé par le lot se supprime.${autres}`,
        },
      };
    }
  }
  return {
    arret: {
      nom: 'lancement',
      rapport: `La copie ${ctx.copie} ne se prépare pas sur la pointe de main avant la passe qui juge le lot.\n\n${r.message}`,
      piece: `$ node ${PREPARER} preparer ${ctx.copie} ${cible.stdout.trim()}\n${r.message}`,
      question: `La copie ${ctx.copie} se remet en état à la main, comme la préparation le dit (chaque fichier en conflit résolu puis \`git add\`, le lot en attente repris, la branche ramenée sur main, ou le sous-module et l'installation réparés), sans perdre son travail ; puis \`npx grillhouse circuit ${ctx.ticket} --reprendre\`, qui prépare la copie et rejoue la passe.`,
    },
  };
}

/**
 * What the circuit keeps of the conflict <conflit> (`avantLaPasse`) its pass at the state <etat>
 * met: the role relaunched, the first of `conflit.roles`, and the memory: the roles relaunched,
 * the files of the conflict, whose marks the next advance looks for again (`fichiersDuConflit`),
 * and the state of the pass the role's session comes back to (`retourDuConflit`), not the step
 * that follows the role, so no build plays while a file carries marks.
 * @param {{ conflitsRelances?: string[] | null, fichiersDuConflit?: string[] | null }} ctx
 * @param {object} etat
 * @param {{ fichiers: string[], roles: string[] }} conflit
 */
export function suiteDuConflit(ctx, etat, conflit) {
  const [role] = conflit.roles;
  return {
    role,
    memoire: {
      conflitsRelances: [...(ctx.conflitsRelances ?? []), role],
      fichiersDuConflit: [...new Set([...(ctx.fichiersDuConflit ?? []), ...conflit.fichiers])],
      retourDuConflit: etat,
    },
  };
}

// The memory of a conflict once its pass prepares the copy without one: dropped.
export const SANS_CONFLIT = Object.freeze({
  conflitsRelances: null,
  fichiersDuConflit: null,
  retourDuConflit: null,
});

// The tools of the project whose main tree is <racine>, read at the launch of a run:
// `{ outils }`, or `{ arret }`, the stop « lancement » that goes up to the supervisor before any
// session (its code, name, report, piece and question), the faults of the key named.
export function outilsAuLancement(racine) {
  try {
    return { outils: outilsDe(racine), empreintes: empreintesDe(racine) };
  } catch (err) {
    const rapport = `La clé grillhouse.outils du package.json est refusée :\n${err.message}`;
    return {
      arret: {
        code: ARRETS.lancement,
        nom: 'lancement',
        rapport,
        piece: `$ npm pkg get grillhouse.outils\n${rapport}`,
        question: `${rapport}\nLa clé se corrige au package.json du projet, puis \`--reprendre\`.`,
      },
    };
  }
}

// The data of the project whose main tree is <racine> (`grillhouse.donnees`), read at the launch
// of a run: `{ donnees }`, or `{ arret }`, the stop « lancement » that goes up to the supervisor
// before any session, the faults of the key named.
export function donneesAuLancement(racine) {
  try {
    return { donnees: donneesDe(racine) };
  } catch (err) {
    const rapport = `La clé grillhouse.donnees du package.json est refusée :\n${err.message}`;
    return {
      arret: {
        code: ARRETS.lancement,
        nom: 'lancement',
        rapport,
        piece: `$ npm pkg get grillhouse.donnees\n${rapport}`,
        question: `${rapport}\nLa clé se corrige au package.json du consommateur, puis \`--reprendre\`.`,
      },
    };
  }
}

// The generated files the project declares (`grillhouse.engendres`, scripts/engendres.mjs), read
// at the launch of a run from its main tree: `{ engendres }`, or `{ arret }`, the stop « lancement »
// that goes up to the supervisor before any session, the faults of the key named.
export function engendresAuLancement(racine) {
  try {
    return { engendres: engendresDe(racine) };
  } catch (err) {
    const rapport = `La clé grillhouse.engendres du package.json est refusée :\n${err.message}`;
    return {
      arret: {
        code: ARRETS.lancement,
        nom: 'lancement',
        rapport,
        piece: `$ npm pkg get grillhouse.engendres\n${rapport}`,
        question: `${rapport}\nLa clé se corrige au package.json du projet, puis \`--reprendre\`.`,
      },
    };
  }
}

// The folders of test material the project declares (`grillhouse.matieres`,
// scripts/matieres-cles.mjs), read at the launch of a run from its main tree: `{ matieres }`, or
// `{ arret }`, the stop « lancement » that goes up to the supervisor before any session, the
// faults of the key named.
export function matieresAuLancement(racine) {
  try {
    return { matieres: matieresDeclareesDe(racine) };
  } catch (err) {
    const rapport = `La clé grillhouse.matieres du package.json est refusée :\n${err.message}`;
    return {
      arret: {
        code: ARRETS.lancement,
        nom: 'lancement',
        rapport,
        piece: `$ npm pkg get grillhouse.matieres\n${rapport}`,
        question: `${rapport}\nLa clé se corrige au package.json du projet, puis \`--reprendre\`.`,
      },
    };
  }
}

// The flows of the CI the project declares (`grillhouse.flux`, scripts/flux-des-paquets.mjs), read
// at the launch of a run from its main tree: `{ flux }`, or `{ arret }`, the stop « lancement »
// that goes up to the supervisor before any session, the faults of the key named.
export function fluxAuLancement(racine) {
  try {
    return { flux: fluxDe(racine) };
  } catch (err) {
    const rapport = `La clé grillhouse.flux du package.json est refusée :\n${err.message}`;
    return {
      arret: {
        code: ARRETS.lancement,
        nom: 'lancement',
        rapport,
        piece: `$ npm pkg get grillhouse.flux\n${rapport}`,
        question: `${rapport}\nLa clé se corrige au package.json du projet, puis \`--reprendre\`.`,
      },
    };
  }
}

// The stop « hors-portee » for the developpeur's sheet FAIT <fiche> of the session <tentative>
// that does not hold criteria out of the plan (`hors_plan`), as a required check keeps a merge
// from a change that does not pass it: each criterion and its package in the fact and in the
// question, the answers `--etendre <paquet>` or the criterion amended and `--reprendre`; their
// pieces as its piece, the handover after them.
function arretHorsDuPlan(ctx, tentative, fiche) {
  const role = auteurDuCode(ctx.circuit);
  const qui = leRole(role);
  const criteres = fiche.hors_plan.map(h => `critère ${h.critere} (${h.paquet})`).join(', ');
  const paquets = [...new Set(fiche.hors_plan.map(h => h.paquet))].join(',');
  const passation = derniereDe(ctx, role)?.text ?? 'aucune';
  return new Arret(
    'hors-portee',
    `${qui} dit FAIT sans tenir, hors du plan, ${criteres} (séance ${tentative}).\n\nSa passation :\n\n${passation}`,
    {
      piece: fiche.hors_plan.map(h => h.piece).join('\n'),
      question: `${qui} ne tient pas, hors du plan, ${criteres} : le plan s'étend (\`--etendre ${paquets}\`), ou le critère s'amende au ticket, puis \`--reprendre\`.`,
    }
  );
}

// The sending to the testwriter in the developpeur's sheet <fiche> (its `renvoi`), as the table of
// the transitions words it (`renvoiDe`) from the developpeur's last handover and the red output of
// the last checks (`ctx.controlesRouges`).
const renvoiDuTestwriter = (ctx, fiche) =>
  renvoiDe({
    fiche,
    passation: derniereDe(ctx, 'developpeur')?.text ?? null,
    controlesRouges: ctx.controlesRouges,
    fichiersRouges: fichiersDeTestRouges(ctx.controlesRouges),
  });

// The findings still open once the reviewer's sheet RENDU <fiche> is read, as the issues of a
// review stay open until the review that resolves them: each blocking finding of the sheet (a
// remark reaches the ticket, no agent; the sheet's schema gives a RENDU at least one), after each
// finding open before it that the sheet neither marks lifted (`suivi`, by its title) nor states
// again, which keeps its mark `enContexte` (`auLancement`), a finding the sheet states coming
// without it. Each one `{ titre, regle, role, corps, piece }`, its recipient the agent it names, one
// of those who write the lot of its circuit (`agentsDuLot`), without the developpeur's answer to the
// review before (`reponse`): his next sheet answers it again. Throws an Arret `relecture-arret` for a finding without a valid recipient or one
// that puts a criterion in question.
export function constatsOuverts(ctx, fiche, texte) {
  const arret = raison =>
    new Arret('relecture-arret', `${raison}\n\nLe verdict :\n\n${texte}`, { piece: raison });
  const neufs = bloquantsDeLaFiche(fiche).map(c => {
    if (c.critere_en_cause) {
      throw arret(`Le constat « ${c.titre} » met en cause un critère du ticket.`);
    }
    const agents = agentsDuLot(ctx.circuit);
    if (!agents.includes(c.role)) {
      throw arret(
        `Le constat « ${c.titre} » n'a pas de destinataire valide : il nomme ${c.role ? `« ${c.role} »` : 'personne'}, quand le rôle est ${agents.join(' ou ')}.`
      );
    }
    return { titre: c.titre, regle: c.regle, role: c.role, corps: c.corps, piece: c.piece };
  });
  const leves = new Set(
    (fiche.suivi ?? []).filter(s => s.etat === 'levé').map(s => cleDuConstat(s.titre))
  );
  const restes = (ctx.constats ?? [])
    .filter(c => !leves.has(c.titre) && !neufs.some(n => n.titre === c.titre))
    .map(c => Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'reponse')));
  return [...restes, ...neufs];
}

// The sort of the ticket of <ctx>, read from its kept results (`sorteDesFiches` of
// scripts/resultats.mjs).
const sorteDuTicket = ctx => sorteDesFiches(lesFiches(ctx));

// Whether a testwriter or a developpeur has worked the lot since the last sheet of the plan or the
// last turn of its sort.
function lotTravaille(ctx) {
  const tous = lesFiches(ctx);
  const depuis = Math.max(tous.findLastIndex(estUnPlan), tous.findLastIndex(estUneBascule));
  return tous.slice(depuis + 1).some(e => AGENTS_DU_LOT.includes(e.role));
}

// Whether the ticket of <ctx> goes the mechanical path, as Google's large-scale changes (Rosie,
// ClangMR) let a tool make the change that a verification and a review judge: its plan says it
// mechanical (`ctx.sorte`), no `--depuis` sends its lot to an agent, and no testwriter nor
// developpeur has worked it since the plan.
export const cheminMecanique = ctx =>
  ctx.sorte?.genre === 'mécanique' && !ctx.depuis && !lotTravaille(ctx);

// The RENDU verdicts since the ticket's last ACCEPTÉ: a lot the queue sent back starts a new count.
export function rendusDepuisAccepte(ctx) {
  const verdicts = fichesDe(ctx, 'relecteur').map(f => f.verdict);
  return verdicts.length - (verdicts.lastIndexOf('ACCEPTÉ') + 1);
}

// The counts of the bounded loops that run at the step <etape> under way, by their key
// (scripts/etapes.mjs, `boucles`): the session of the testwriter at its tests and its proof, of the
// developpeur at its code and its checks, the review; null at a step without one.
function boucles(ctx, etape, tentative, finale) {
  const compte = {
    tests: () => tentative,
    code: () => tentative,
    relecture: () => rendusDepuisAccepte(ctx) + 1,
  };
  const e = etapeDuCircuit({ etape, finale });
  const l = e ? bouclesDe(e, ctx.circuit).filter(b => compte[b.cle]) : [];
  return l.length ? Object.fromEntries(l.map(b => [b.cle, compte[b.cle]()])) : null;
}

// The circuit from <debut> (where `depart` starts it) to the entry of the lot in the queue: each
// step once for the whole ticket, its plan the packages of the title. Its decisions are those of
// scripts/transitions.mjs: at each step the circuit reads the facts it asks for (`lireLeFait`) and
// interprets the decision (`appliquer`), its memory changed, its effects played, then its stop,
// its end, or the step that follows.
// The start of the step <debut> of the run of <ctx>: its state, its loops counted, written; a step
// the circuit leads itself names its start in the state while it runs (`menee`), and writes its
// line to the register at its end (`finirLEtape`), whatever its outcome. `{ etat, menee }`.
export function commencerLEtape(ctx, { etape, tentative, rapport, finale }) {
  const etat = {
    etape,
    tentative,
    code: null,
    raison: null,
    rapport,
    finale,
    boucles: boucles(ctx, etape, tentative, finale),
  };
  const menee = MENEES.has(etape) ? { etape, debut: new Date().toISOString() } : null;
  ecrireEtat(ctx, { ...etat, mene: menee?.debut ?? null });
  return { etat, menee };
}

// The end of a step of the run of <ctx> the circuit led itself (<menee>, null for another): its
// line to the register.
export function finirLEtape(ctx, menee) {
  if (menee) {
    inscrireEtape(ctx, menee);
  }
}

// The stop <erreur> of the run of <ctx> at the step <etat>, written: any exception but an Arret is
// the stop « inattendu », at the step it fell. Its state, its result kept for the bilan, its line
// at the ticket and on the error output: the stop as `monter` takes it,
// `{ code, nom, rapport, rouges, motif, piece, question, qui, etat }`.
export function publierLArret(ctx, erreur, etat) {
  let e = erreur;
  if (!(e instanceof Arret)) {
    const a = arretInattendu(ctx, e, etat.etape);
    e = new Arret(a.nom, a.rapport, { piece: a.piece, question: a.question });
  }
  const code = ARRETS[e.nom];
  const lieu = e.etape ?? etat.etape;
  const arrete = { ...etat, etape: lieu };
  ecrireEtat(ctx, { ...arrete, code, raison: e.nom, rapport: e.rapport });
  // The stop kept with the circuit's results, which the bilan counts.
  inscrire(ctx, {
    role: AUTEUR_DU_CIRCUIT,
    etape: lieu,
    arret: e.nom,
    ...(lieu === CONTROLES && etat.finale ? { finale: true } : {}),
    // The hour a usage limit lifts is no outcome of a pass: the bilan reads none of it.
    ...(e.resultat && e.nom !== 'limite-d-usage' ? { resultat: e.resultat } : {}),
  });
  const ou = ouDansLeCircuit({ etape: lieu, finale: etat.finale && lieu === CONTROLES });
  commenter(
    ctx,
    lieu,
    `arrêt ${e.nom} à ${ou} — ${premiereLigne(e.rapport)} — journal ${ctx.journal}`
  );
  process.stderr.write(`⛔ Circuit de ${ctx.ticket} arrêté : ${e.nom}, à ${ou}.\n`);
  return {
    code,
    nom: e.nom,
    rapport: e.rapport,
    rouges: e.rouges,
    motif: e.motif,
    piece: e.piece,
    question: e.question,
    qui: e.qui,
    etat: arrete,
  };
}

// The fact <fait> of the circuit of <ctx>, with its <parametres>, the facts <faits> of the step
// read before it: a session, a pass, a reading of the copy or of the ticket.
export async function lireLeFait(ctx, fait, parametres, faits) {
  switch (fait) {
    case 'mecanique':
      return cheminMecanique(ctx);
    case 'sansTests':
      return sansTests(ctx);
    case 'livreAvant':
    case 'livre':
      return livre(ctx);
    case 'seanceDuGeste': {
      const { description } = leTicket(ctx);
      return jusquALaFiche(
        ctx,
        EXPLORATEUR,
        consigne(
          {
            depot: ctx.racine,
            ticket: ctx.ticket,
            sujet: ctx.sujet,
            paquets: ctx.paquets.join(', '),
            raison: ctx.sorte.raison,
            commande: ctx.sorte.commande,
            description: description.trim() || 'aucune',
          },
          8
        ),
        {
          signeDeVie: ctx.ports?.signeDeVie,
          id: idDeSeance(ctx, 'geste'),
          evenement: 'geste',
          fiche: 'geste',
          objet: 'geste',
        }
      );
    }
    case 'seance': {
      const { role, ...options } = parametres;
      // The session reads the findings and the session to resume the circuit keeps, and gives back
      // what the circuit keeps of them.
      const { fiche, constats } = await seance(ctx, role, {
        ...options,
        constats: ctx.constats ?? [],
        reprise: ctx.seanceReprise ?? null,
        retenir: reprise => {
          ctx.seanceReprise = reprise;
        },
        signeDeVie: ctx.ports?.signeDeVie,
        seanceId: idDeSeance(ctx, `neuve:${role}`),
        lectures: {
          lots: () => testsDuLot(ctx, langageDeLaCopie),
          references: () => lesReferences(ctx),
        },
      });
      ctx.constats = constats;
      return fiche;
    }
    case 'lecture':
      return rougeDeLecture(ctx);
    case 'preuve': {
      // The measure of the last proof, kept in the working directory of the ticket, which the next
      // proof on the same tree judges again without playing it: each act plays in a process of its
      // own, and a measure is too large for the memory of the workflow.
      const fichier = path.join(ctx.tmp, 'mesure-de-la-preuve.json');
      const derniere = existsSync(fichier) ? JSON.parse(readFileSync(fichier, 'utf8')) : null;
      const debut = Date.now();
      const { mesure, ...p } = preuve(ctx, { mesure: derniere, fichiers: parametres.fichiers });
      if (mesure) {
        writeFileSync(fichier, JSON.stringify(mesure));
      } else {
        rmSync(fichier, { force: true });
      }
      return { ...p, empreinte: empreinteDeLEtape(ctx, 'preuve'), ms: Date.now() - debut };
    }
    case 'empreinteEtape':
      return empreinteDeLEtape(ctx, parametres.etape);
    case 'portes':
      return portesDuRouge(ctx, parametres.lieux);
    case 'etendreAuxEcartes':
      etendreAuxEcartes(ctx, parametres);
      return true;
    case 'etendreAuxTests':
      etendreAuxTests(ctx, parametres);
      return true;
    case 'empreinteAvant':
    case 'empreinte':
      return empreinte(ctx);
    case 'renvoi':
      return renvoiDuTestwriter(ctx, faits.seance);
    case 'passation':
      return passations(ctx).at(-1)?.text ?? null;
    case 'arbreAvant':
    case 'arbreApres':
      return arbreDeLaCopie(ctx);
    case 'passeFinale':
      return laPasseFinale(ctx);
    case 'controles': {
      const debut = Date.now();
      const k = controles(
        ctx,
        parametres.finale,
        parametres.restreinte,
        parametres.reportes,
        parametres.fichiers
      );
      const ms = Date.now() - debut;
      // The fingerprint of a green step, which its next pass on the same inputs reads back.
      return {
        ...k,
        empreinte:
          k.rouge || k.aRepasser
            ? null
            : empreinteDeLEtape(ctx, parametres.finale ? 'passe-finale' : 'controles'),
        ms,
      };
    }
    case 'referencesDesRouges':
      return referencesDesRouges(ctx, parametres.lieux, parametres.aElaguer);
    case 'lotAccepte':
      return leLotAccepte(ctx, parametres.arbre);
    case 'regeneration':
      // The copy kept before it, which the regeneration restores first.
      return regenerer(ctx, { ...parametres, avant: leLotGarde(ctx).lot });
    case 'relecture':
      return relire(ctx, { constats: ctx.constats ?? [] });
    case 'rendus':
      return rendusDepuisAccepte(ctx);
    case 'constats':
      try {
        return { constats: constatsOuverts(ctx, faits.relecture.fiche, faits.relecture.texte) };
      } catch (e) {
        if (!(e instanceof Arret)) {
          throw e;
        }
        return { arret: { nom: e.nom, rapport: e.rapport, piece: e.piece } };
      }
    case 'integration': {
      const r = integrer(ctx);
      return {
        code: r.code,
        sortie: sansCouleurs(r.sortie),
        commande: r.commande,
      };
    }
    case 'commit':
      return spawnSync('git', ['-C', ctx.racine, 'rev-parse', '--short', `agent/${ctx.ticket}`], {
        encoding: 'utf8',
      }).stdout.trim();
    case 'tri':
      await trier(ctx);
      return true;
    default:
      throw new Error(`fait inconnu des décisions du circuit : ${fait}`);
  }
}

// The effect <e> of a decision of the circuit of <ctx>: a line at the ticket, a gesture, a report,
// a result kept.
export function appliquer(ctx, e) {
  if (e.genre === 'commenter') {
    commenter(ctx, e.etape, e.texte);
  } else if (e.genre === 'geste') {
    geste(ctx, e.nom);
  } else if (e.genre === 'rapport') {
    ecrireRapport(ctx, e.etape, e.texte, e.resultat, e.rapport);
  } else if (e.genre === 'inscrire') {
    inscrire(ctx, { role: AUTEUR_DU_CIRCUIT, ...e.entree });
  } else if (e.genre === 'sorte') {
    ecrireLaSorte(ctx, e.sorte);
  } else {
    throw new Error(`effet inconnu des décisions du circuit : ${e.genre}`);
  }
}

// The Arret of the stop <a> a decision of the circuit of <ctx> returns: an agent's sheet that is
// not FAIT (`statut`) or that does not hold criteria out of the plan (`horsDuPlan`), with its
// handover; else its name, its report and its options.
export function arretDe(ctx, a) {
  if (a.statut) {
    return arretDuStatut(ctx, a.statut.role, a.statut.tentative, a.statut.fiche);
  }
  if (a.horsDuPlan) {
    return arretHorsDuPlan(ctx, a.horsDuPlan.tentative, a.horsDuPlan.fiche);
  }
  const { nom, rapport, ...options } = a;
  return new Arret(nom, rapport, options);
}

// The stop <a> (`{ code, nom, rapport, motif, rouges, piece, question, qui, etat }`, `etat` the
// state of the step it stopped) gone up to the supervisor, as a CI calls a person only for what no
// rule settles: its question (`{ arret, fait, piece, question, qui }`: the fact, the first line of
// its motive or its report; its piece, the one it carries, else its reds with their file and line,
// else the end of the log; the question of its kind, scripts/etapes.mjs MONTEES, after the agent's
// own, or the agent's alone for a hors-plan stop, MONTEES' text its fallback when the stop carries
// none; who must answer it) kept in the state, written at the ticket and on the error output. Its
// exit code.
export function monter(ctx, a) {
  const m = monteeDe(a.nom);
  const fait = premiereLigne(a.motif ?? a.rapport) || a.nom;
  const rouges = (a.rouges ?? [])
    .map(r => [`- ${r.paquet} : ${r.texte}`, ...(r.detail ? ['', r.detail] : [])].join('\n'))
    .join('\n');
  const piece =
    String(a.piece ?? '').trim() ||
    rouges ||
    `Le journal du ticket, ${ctx.journal} (il se cite en pièce, \`${ctx.ticket}.log:<ligne>\`) :\n${fin(lire(ctx.journal), 20)}`;
  // A hors-plan stop carries its own question (the exact command for its path, or the refusal
  // alone for the repository root): the generic one would offer `--etendre` for any path.
  const question =
    a.question && a.nom === 'hors-plan'
      ? a.question
      : a.question
        ? `${a.question}\n\n${m.question}`
        : m.question;
  const qui = a.qui ?? m.qui;
  ecrireEtat(ctx, {
    ...a.etat,
    code: a.code,
    raison: a.nom,
    rapport: a.rapport,
    question: { arret: a.nom, fait, piece, question, qui },
  });
  const ou = ouDansLeCircuit({ ...a.etat, raison: a.nom });
  commenter(ctx, 'question', `${a.nom} à ${ou} — ${fait} — au ${qui} : ${question}`);
  process.stderr.write(laQuestion(ctx.ticket, { arret: a.nom, qui, ou, question }));
  return a.code;
}

// The line that says the question <question> of the circuit of <ticket> stopped at <ou> on
// <arret>, to <qui>, with the answers its running workflow accepts (`lesReponses`).
const laQuestion = (ticket, { arret, qui, ou, question }) =>
  `⛔ Circuit de ${ticket} : question au ${qui} (${arret}, à ${ou}) : ${String(question ?? '').trim()}\n\nLa réponse : \`${lesReponses(ticket, 'RUNNING', true)}\`.\n`;

// Where the run starts (`depart` of the table of the transitions): the memory it changes is applied
// to <ctx>, a refusal is a Usage; the state <e> (null without one) is the one of the stop.
function departDuCircuit(ctx, e) {
  const d = depart({
    depuis: ctx.depuis ?? null,
    reprendre: Boolean(ctx.reprendre),
    marque: Boolean(ctx.testwriterDemande),
    etat: e,
    refus: ctx.refus,
    ticket: ctx.ticket,
    circuit: ctx.circuit ?? null,
  });
  if (d.usage) {
    throw new Usage(d.usage);
  }
  Object.assign(ctx, d.memoire);
  return d.suivant;
}

// The end of the run, its exit code <code>: an end on a stop kept with the circuit's results
// (`montee`: its code, its stop and the supervisor's session that ran it, `superviseur`, the one
// the entry of the workflow carries, `ctx.superviseur`, when Claude Code named it to the command), from which the bilan measures the wait to the run that answers it, the
// owner's when he writes in that session meanwhile, then the ticket's bilan at the ticket
// (scripts/bilan.mjs); a bilan it cannot write leaves the code as it is. Then the removal of the
// finished copies of the repository (scripts/copies-finies.mjs), as a CI cleans its workspaces at
// the end of each pipeline, not only the night's: its lines added to the log and written on the
// error stream, each kept copy with the place it holds; it never changes the code.
// The next rank of arrival of the machine, null when its state does not write (the circuit then
// draws one at its first wait for a place).
function tirerLeRang() {
  try {
    return prendreUnRang();
  } catch {
    return null;
  }
}

export function aLaFin(ctx, code) {
  try {
    if (code !== 0) {
      const superviseur = ctx.superviseur ?? null;
      inscrire(ctx, {
        role: AUTEUR_DU_CIRCUIT,
        montee: {
          code,
          raison: ctx.courant?.raison ?? null,
          ...(superviseur ? { superviseur } : {}),
        },
      });
    }
    // The bilan is computed when it is written, once the effects before it are; one not written
    // is said, and the circuit ends (`ecrireLEffet`).
    emettre(ctx, {
      genre: 'bilan',
      ticket: ctx.ticket,
      fin: {
        etape: ctx.courant?.etape ?? null,
        raison: ctx.courant?.raison ?? null,
        code: ctx.courant?.code ?? null,
      },
    });
  } catch (e) {
    process.stderr.write(`⚠️  bilan non écrit au ticket : ${e.message}\n`);
  }
  try {
    const lignes = retirerLesCopiesDuDepot(ctx.racine);
    if (lignes.length) {
      appendFileSync(ctx.journal, `${lignes.join('\n')}\n`);
      process.stderr.write(`${lignes.join('\n')}\n`);
    }
  } catch (e) {
    process.stderr.write(`⚠️  copies finies non retirées : ${e.message}\n`);
  }
  return code;
}

// The questions <questions> of a questionneur's sheet, one per line, each with what it aims at.
const lignesDesQuestions = questions =>
  (questions ?? []).map((q, i) => `${i + 1}. (${q.vise}) ${q.question}`).join('\n');

// The corrections of criteria <corrections> the circuit accepted, one per line: the criterion, its
// corrected text, its piece and the extract that proves it.
export const lignesDesCorrections = corrections =>
  corrections
    .map(
      c =>
        `- critère ${c.critere} corrigé : « ${c.texte} » — pièce ${c.piece}, extrait « ${c.extrait} »`
    )
    .join('\n');

// The line <ligne> (from 1) of the file <fichier> of the copy, null when the file or the line is absent.
const ligneDeLaCopie = (ctx, fichier, ligne) => {
  const base = path.resolve(existsSync(ctx.copie) ? ctx.copie : ctx.racine);
  const chemin = path.resolve(base, fichier);
  if (!chemin.startsWith(`${base}${path.sep}`) || !existsSync(chemin)) {
    return null;
  }
  return readFileSync(chemin, 'utf8').split('\n')[ligne - 1] ?? null;
};

// The open questions <questions> of a plan (`{ question, motif, piece }`), one per line, each with
// why it goes up, when the explorateur wrote it, and its piece.
const lignesOuvertes = questions =>
  questions
    .map((q, i) => `${i + 1}. ${q.motif ? `(${q.motif}) ` : ''}${q.question} (${q.piece})`)
    .join('\n');

// The rubric « ## <titre> » of the project's charter (CLAUDE.md of the main tree), up to the next
// `##` heading, or what stands in its place.
function rubrique(ctx, titre) {
  const lignes = lire(path.join(ctx.racine, 'CLAUDE.md')).split('\n');
  const i = lignes.findIndex(l => l.trim() === `## ${titre}`);
  if (i < 0) {
    return 'absente de la charte du projet (CLAUDE.md)';
  }
  const fin = lignes.findIndex((l, j) => j > i && l.startsWith('## '));
  return (
    lignes
      .slice(i + 1, fin < 0 ? undefined : fin)
      .join('\n')
      .trim() || 'vide'
  );
}

// The meta-frame, the frame's plugin's, read at the plugin's root (scripts/cadre.mjs).
const METACADRE = path.join(GREFFON, 'METACADRE.md');

// The fingerprint of a plan, its title and its section of criteria, each line without its blank
// lines: the rest of the description (an answer of the supervisor, the open questions, its notes)
// is not the plan, as a CI replays a job only when its inputs move.
const empreinteDuPlan = ({ titre, description }) => {
  const criteres = sectionsDe(description)
    .filter(deCriteres)
    .flatMap(s => [s.tete, ...s.lignes])
    .map(l => l.trim())
    .filter(Boolean);
  return createHash('sha256')
    .update([titre, ...criteres].join('\n'))
    .digest('hex');
};

// Whether the plan of fingerprint <empreinte> has passed: a plan whose questioning left no
// question open, or the supervisor's resumption of its stop.
const planPasse = (ctx, empreinte) =>
  lesFiches(ctx).some(e => e.role === AUTEUR_DU_CIRCUIT && e.plan?.empreinte === empreinte);

// The heading of the section of the open questions in a plan's description.
const QUESTIONS_OUVERTES = '## Questions ouvertes';
// The heading of the section of the sort of the ticket in a plan's description.
const SORTE = '## Sorte';
// The heading of the section of the names the plan publishes in its description, the one that
// scripts/langages/typescript/consommateurs-arbitres.mjs reads.
const NOMS_PUBLIES = '## Noms publiés';

// The names <noms> a plan publishes (`noms_publies`), one line each, as the guard of the consumers
// reads them: the provider, the consumer and each name between backquotes.
const lignesDesNoms = noms =>
  noms
    .map(
      n =>
        `- \`${n.fournisseur}\` publie à \`${n.consommateur}\` : ${n.noms.map(x => `\`${x}\``).join(', ')}`
    )
    .join('\n');

// The sort <sorte> (`sorteDuPlan`) in words: its kind, then its reason.
const texteDeLaSorte = sorte =>
  sorte.raison
    ? `${sorte.genre}${sorte.comportement && sorte.comportement !== 'changé' ? ` ${sorte.comportement}` : ''} — ${sorte.raison}`
    : `${sorte.genre} — la fiche ne dit pas sa sorte lisiblement : le circuit entier`;

// The section « ## Sorte » of the sort <sorte>: its words, then the command of a mechanical ticket.
const sectionDeLaSorte = sorte => ({
  tete: SORTE,
  lignes: [
    '',
    texteDeLaSorte(sorte),
    ...(sorte.commande ? ['', `Commande : \`${sorte.commande}\``] : []),
    '',
  ],
});

// The description <description> with its section « ## Sorte » for the sort <sorte>, in place of the
// one it holds or else after its criteria; the rest of it as it was.
function redecrireLaSorte(description, sorte) {
  const sections = sectionsDe(description).filter(s => s.tete !== SORTE);
  const i = sections.findIndex(deCriteres);
  sections.splice(i < 0 ? sections.length : i + 1, 0, sectionDeLaSorte(sorte));
  return sections
    .flatMap(s => (s.tete ? [s.tete, ...s.lignes] : s.lignes))
    .join('\n')
    .trim();
}

// The sections of the description <description>: the text before its first `##` heading, then
// each heading with its lines.
function sectionsDe(description) {
  const sections = [{ tete: null, lignes: [] }];
  for (const l of description.trimEnd().split('\n')) {
    if (l.startsWith('## ')) {
      sections.push({ tete: l, lignes: [] });
    } else {
      sections.at(-1).lignes.push(l);
    }
  }
  return sections;
}

// Whether <section> is the section of criteria: a `##` heading that begins with « Critères », as
// scripts/composants-affectes.mjs reads it.
const deCriteres = section => Boolean(section.tete?.startsWith('## Critères'));

// The text of the numbered line <ligne> (« 2. Le critère. »), or null for any other line.
function numerotee(ligne) {
  const i = ligne.indexOf('. ');
  const numero = i > 0 ? ligne.slice(0, i).trim() : '';
  return numero && [...numero].every(c => c >= '0' && c <= '9') ? ligne.slice(i + 2).trim() : null;
}

// The ticket's description <description> as it was before the plan, with the criteria the plan adds
// <criteres> in its section of criteria (a section « ## Critères » at its end without one), the sort
// of the ticket <sorte> in its section after it, its reason and the command of a mechanical ticket
// (absent when the sheet says none), the names the plan publishes <noms> in their section after it
// (an empty list erases the section; a sheet without them, <noms> undefined, keeps the section the
// description holds, a supervisor's by hand included), and its open questions <questions> in their
// section after them, absent without one; the rest of it as it was. The criteria already written
// stay as they are, the decision of the owner: each criterion the plan adds follows them, numbered
// after them. Written again from the description before the plan, the description holds the
// criteria, the sort and the names of the explorateur's last sheet alone.
// A correction accepted (`{ critere, texte }`) replaces the text of the criterion it names, in place;
// one whose criterion the description does not hold changes nothing.
export function decrireLePlan(
  description,
  criteres,
  questions,
  sorte = null,
  noms = undefined,
  corrections = []
) {
  const gardees = sectionsDe(description).filter(
    s =>
      s.tete !== QUESTIONS_OUVERTES &&
      s.tete !== SORTE &&
      (noms === undefined || s.tete !== NOMS_PUBLIES)
  );
  let i = gardees.findIndex(deCriteres);
  if (i < 0) {
    gardees.at(-1).lignes.push('');
    gardees.push({ tete: '## Critères', lignes: [] });
    i = gardees.length - 1;
  }
  gardees[i] = {
    tete: gardees[i].tete,
    lignes: gardees[i].lignes.map(ligne => {
      const c =
        numerotee(ligne) === null
          ? undefined
          : corrections.find(k => ligne.trim().startsWith(`${k.critere}. `));
      return c ? `${c.critere}. ${c.texte.trim()}` : ligne;
    }),
  };
  const ecrits = gardees[i].lignes.map(numerotee).filter(c => c !== null);
  const ajouts = criteres.map(c => c.trim());
  const avant = [...gardees[i].lignes];
  while (avant.length && avant.at(-1).trim() === '') {
    avant.pop();
  }
  const liste = ajouts.map((c, n) => `${ecrits.length + n + 1}. ${c}`);
  gardees[i] = {
    tete: gardees[i].tete,
    lignes: [...(avant.length ? avant : ['']), ...liste, ''],
  };
  const apres = [
    ...(sorte ? [sectionDeLaSorte(sorte)] : []),
    ...(noms?.length ? [{ tete: NOMS_PUBLIES, lignes: ['', lignesDesNoms(noms), ''] }] : []),
    ...(questions.length
      ? [{ tete: QUESTIONS_OUVERTES, lignes: ['', lignesOuvertes(questions), ''] }]
      : []),
  ];
  gardees.splice(i + 1, 0, ...apres);
  return gardees
    .flatMap(s => (s.tete ? [s.tete, ...s.lignes] : s.lignes))
    .join('\n')
    .trim();
}

// The plan written at the ticket by the circuit: the packages <plan> (each a directory of the
// copy, `ctx.resoudre`) in its title, after its last « — », as a title names its components, and
// the description <description> when given, by one effect `plan` when either changes; the packages
// become the run's plan (`ctx.paquets`), the list the envelope of every later session writes. The
// title.
function ecrireLePlan(ctx, plan, description = null) {
  const t = leTicket(ctx);
  const parts = t.titre.split(' — ');
  const titre = [...parts.slice(0, -1), nomsDe(ctx, plan).join(', ')].join(' — ');
  const change = {
    titre: titre === t.titre ? null : titre,
    description: description === null || description === t.description ? null : description,
  };
  if (change.titre !== null || change.description !== null) {
    emettre(ctx, { genre: 'plan', ...change });
  }
  ctx.paquets = plan;
  return titre;
}

// The sort of the ticket turned to <sorte> on the same plan, whose packages and criteria stay: kept
// as a line of the circuit among the sheets (`sorteDuTicket` reads it after the last sheet of the
// plan), written in the description (« ## Sorte ») and said at the ticket (`Circuit · plan : …`).
function ecrireLaSorte(ctx, sorte) {
  ctx.sorte = sorte;
  ctx.circuit = circuitSuivant(ctx.circuit, sorte);
  inscrire(ctx, { role: AUTEUR_DU_CIRCUIT, sorte });
  ecrireLePlan(ctx, ctx.paquets, redecrireLaSorte(leTicket(ctx).description, sorte));
  commenter(ctx, 'plan', `la sorte du ticket devient ${texteDeLaSorte(sorte)} ; le plan reste.`);
}

// The `--mecanique` answer of <ctx> to the stop <e> of the testwriter or of the proof of the red
// (`reponseMecanique` of scripts/reponses-du-circuit.mjs, which refuses out of those stops, without a reason or on a
// ticket already mechanical: a Usage): the sort turned, the plan kept as it is, and the stop's
// state moved to the step the sort asks, 1.1 with a command, the developpeur without.
function basculer(ctx, e) {
  const r = reponseMecanique({
    etat: e,
    sorte: sorteDuTicket(ctx),
    commande: ctx.mecanique.commande,
    contexte: ctx.contexte,
  });
  if (r.refus) {
    throw new Usage(r.refus);
  }
  ecrireLaSorte(ctx, r.sorte);
  ctx.reprendre = true;
  ctx.verts = {};
  ctx.reprise = null;
  return { ...e, etape: r.suivant.etape, raison: null, question: null, rapport: null };
}

// The packages the plan of <ctx> gained by an extension (`etendus`, kept among the circuit's
// sheets), which the circuit keeps in the plan by itself (`avecLesEtendus`).
const etendusDuPlan = ctx => [
  ...new Set(
    lesFiches(ctx).flatMap(e => (e.role === AUTEUR_DU_CIRCUIT ? (e.plan?.etendus ?? []) : []))
  ),
];

/**
 * The directories of the reader packages the plan of <ctx> extended to their tests alone
 * (`testsEtendus`, kept among the circuit's sheets), less those the plan <paquets> holds: a package
 * that enters the plan leaves the list. A plan written again keeps it, and never reads it into
 * its title (`avecLesEtendus` reads `etendus` alone).
 */
export function testsEtendusDuPlan(ctx, paquets) {
  const dedans = d => paquets.some(p => p === '.' || d === p || d.startsWith(`${p}/`));
  return [
    ...new Set(
      lesFiches(ctx).flatMap(e =>
        e.role === AUTEUR_DU_CIRCUIT ? (e.plan?.testsEtendus ?? []) : []
      )
    ),
  ].filter(d => !dedans(d));
}

/**
 * The plan <paquets> the explorateur writes for <ctx>, with each package the supervisor gave the
 * plan (`--etendre`, kept among the sheets, `etendus`) that it leaves out, in its order
 * (`planEtendu`), said at the ticket: the supervisor's word on the plan stands until he changes
 * it, as a reviewer's requested change stays on a pull request its author pushes again, and a plan
 * written again (a description the responsable changed) does not send the developpeur back to the
 * stop « hors-plan » the extension had lifted. `--recommencer`, which removes the sheets, starts
 * the plan over without them.
 */
export function avecLesEtendus(ctx, paquets) {
  const gardes = etendusDuPlan(ctx).filter(c => !paquets.includes(c));
  if (!gardes.length) {
    return paquets;
  }
  commenter(
    ctx,
    'plan',
    `le plan garde ${nomsDe(ctx, gardes).join(', ')}, que le superviseur lui a donné (\`--etendre\`).`
  );
  return planEtendu(ctx, paquets, gardes).plan;
}

// What makes the packages of the sheet <fiche> of the explorateur out of conformity, or null: a
// package that names neither a package nor a path of the repository, one package named twice
// (by its name and by its path), or a component of the survey of the plan's description
// <description> (scripts/composants-affectes.mjs, `releve`, played by the circuit with no
// session, as it checks the packages) that the sheet neither puts in its packages nor sets apart
// with its reason (`ecartes`); or a component the title of the ticket named before the plan
// (<composants>, their directories; those an extension gave, which the circuit keeps by itself,
// left out) that the sheet neither keeps in its packages nor sets apart with its reason: the
// declared scope of a change bounds what it writes (the OWNERS of Chromium, the affected projects
// of Nx), and a plan narrows it by its word alone; or a component of the title set apart, its
// reason given or not, while the description names a file of it the packages do not hold
// (`fichiersNommesAuTicket`; a file of the root is one no component holds). <ecartes> are the
// components the sheet sets apart in effect: its own, or, for an answer to the questionneur that
// says none, those of the plan it answers. A session that writes one is resumed once
// (`jusquALaFiche`).
function fautesDesPaquets(ctx, fiche, description, composants, ecartes) {
  const dossier = p => {
    try {
      return ctx.resoudre(p);
    } catch {
      return null;
    }
  };
  const dossiers = fiche.paquets.map(dossier);
  const inconnus = fiche.paquets.filter((p, i) => dossiers[i] === null);
  if (inconnus.length) {
    return `paquets : ${inconnus.join(', ')} ne nomme ni un paquet ni un chemin du dépôt`;
  }
  const doubles = fiche.paquets.filter((p, i) => dossiers.indexOf(dossiers[i]) !== i);
  if (doubles.length) {
    return `paquets : ${doubles.join(', ')} nomme un paquet déjà nommé dans le plan`;
  }
  const aPart = ecartes.map(e => dossier(e.composant));
  const tenus = [...dossiers, ...aPart];
  const couvre = (d, c) => d === '.' || c === d || c.startsWith(`${d}/`);
  const tenu = d => tenus.some(t => t !== null && couvre(t, d));
  const etendus = etendusDuPlan(ctx);
  const duTitre = composants.filter(d => !etendus.includes(d) && !tenu(d));
  if (duTitre.length) {
    return `paquets : ${nomsDe(ctx, duTitre).join(', ')}, que le titre du ticket nomme, n'est ni dans les paquets ni dans les écartés (ecartes, avec sa raison)`;
  }
  const racine = existsSync(ctx.copie) ? ctx.copie : ctx.racine;
  const duTitreAPart = aPart.filter(d => d !== null && composants.includes(d));
  if (duTitreAPart.length) {
    const estUnFichier = c => statSync(path.join(racine, c), { throwIfNoEntry: false })?.isFile();
    const autres = composantsDe(racine)
      .map(c => c.dossier)
      .filter(d => d !== '.');
    // Whether the component <d> holds <f>: the root holds what no other component does.
    const porte = (d, f) =>
      d === '.' ? !autres.some(a => f.startsWith(`${a}/`)) : f.startsWith(`${d}/`);
    for (const { chemin, piece } of fichiersNommesAuTicket(description, estUnFichier)) {
      const d = dossiers.some(p => couvre(p, chemin))
        ? undefined
        : duTitreAPart.find(a => porte(a, chemin));
      if (d !== undefined) {
        return `ecartes : ${nomsDe(ctx, [d]).join('')}, que le titre du ticket nomme, porte ${chemin}, que le ticket nomme (${piece}) : il reste dans les paquets`;
      }
    }
  }
  const absents = releve(racine, description).composants.filter(c => {
    const d = dossier(c);
    return d !== null && !tenu(d);
  });
  return absents.length
    ? `paquets : ${absents.join(', ')}, que le relevé nomme, n'est ni dans les paquets ni dans les écartés (ecartes, avec sa raison)`
    : null;
}

// The sort the sheet of the plan <fiche> writes in the description: the one it says, read
// (`sorteDuPlan`), or none when the sheet says none.
const sorteEcrite = fiche => ('sorte' in fiche ? sorteDuPlan(fiche) : null);

// The components the sheet <fiche> of the explorateur sets apart, each with its reason, as the
// circuit writes them at the ticket; empty without one.
const ecartsDe = fiche =>
  (fiche.ecartes ?? []).length
    ? ` ; écartés : ${fiche.ecartes.map(e => `${e.composant} (${e.raison})`).join(' ; ')}`
    : '';

// The plan of the ticket (step 1 of scripts/etapes.mjs) before its testwriter, as an RFC: its
// author writes it after surveying what exists, a review reads it once,
// the author answers once, and what stays open goes to who decides. One session of the
// explorateur, out of the envelope, writes the plan in its sheet (its criteria, the packages to
// touch, its open questions), which the circuit writes at the ticket (`ecrireLePlan`); one session
// of the questionneur reads it once; on its questions (its disagreement as one), the explorateur's
// session, resumed, answers once, CHANGE or GARDE by question, its sheet the plan as it becomes; a
// sheet without a line by question put is asked again once of that session, and a question it
// still leaves without an answer stays open with its own. Each session's work is named in
// the state while it runs (`questionnement`); the exchange is written at the ticket and its end
// kept with the circuit's results (`questionnement`, which the bilan counts). A plan that has
// passed, its title and criteria unchanged since (`empreinteDuPlan`), passes. The workflow of a
// ticket plays each step of the plan in an activity of its own: one of
// `PAS_DU_PLAN` (`unPasDuPlan`), the one that follows decided by `pasDuPlan` of
// scripts/transitions.mjs, on the state of the plan (`{ avant, composants, plan, premier, seance,
// lu, posees, reponse }`), which `planAuDebut` starts.

/**
 * The state of the plan of <ctx> before its first session: the description it starts from, and the
 * components its title names (`composants`, their directories), which the plan keeps.
 */
export const planAuDebut = ctx => ({
  avant: leTicket(ctx).description,
  composants: leTitre(ctx.ticket, leTicket(ctx).titre, ctx.resoudre).plan,
  plan: null,
  premier: null,
  seance: null,
  lu: null,
  posees: [],
  reponse: null,
});

// The state of the run while the plan is written: the step of the testwriter, its first attempt.
const etatDuPlan = () => ({
  etape: TESTS,
  tentative: 1,
  code: null,
  raison: null,
  rapport: null,
});

// The session of <role> on the plan of <ctx>, its work named in the state while it runs: its
// sheet, and the session it ran (`seance`), which the answer resumes.
async function sessionDuPlan(ctx, role, texte, options) {
  ecrireEtat(ctx, {
    ...etatDuPlan(),
    questionnement: { objet: 'plan', role, seance: options.id },
  });
  let seance = options.id;
  const fiche = await jusquALaFiche(ctx, role, texte, {
    signeDeVie: ctx.ports?.signeDeVie,
    horsEnveloppe: true,
    surLaSeance: id => {
      seance = id;
    },
    ...options,
  });
  ecrireEtat(ctx, etatDuPlan());
  return { fiche, seance };
}

// The explorateur's options on the plan of <ctx> whose state is <e>: its description before the
// plan (`avant`), the components its title named then (`composants`), and the plan a sheet
// answers (`plan`, null before it), whose `ecartes` an answer that says none keeps
// (`ficheDuPlan`).
const optionsDeLExplorateur = (ctx, e) => ({
  droits: horsDeLEnveloppe(ctx, EXPLORATEUR, 'sonnet'),
  valider: f =>
    fautesDesPaquets(
      ctx,
      f,
      decrireLePlan(e.avant, f.criteres, f.questions),
      e.composants ?? [],
      ('ecartes' in f ? f.ecartes : e.plan?.ecartes) ?? []
    ),
});

/**
 * The step <pas> of the plan of <ctx> on its state <e> (`pasDuPlan`): `{ plan }` the state that
 * follows, `{ passe: true }` the plan passed, or `{ code }` the exit code of the question it goes
 * up with. After a session, the conclusion plays at once when it follows (`conclure`), so that the
 * plan is three sessions at most, the last ending it.
 */
export async function unPasDuPlan(ctx, pas, e) {
  try {
    const r = await PAS_DU_PLAN[pas](ctx, e);
    if (pas !== 'conclure' && r.plan && pasDuPlan(r.plan) === 'conclure') {
      return await PAS_DU_PLAN.conclure(ctx, r.plan);
    }
    return r;
  } catch (x) {
    // A session of the plan that cannot end goes up, before any testwriter.
    if (!(x instanceof Arret)) {
      throw x;
    }
    return {
      code: monter(ctx, {
        code: ARRETS[x.nom],
        nom: x.nom,
        rapport: x.rapport,
        piece: x.piece,
        etat: etatDuPlan(),
      }),
    };
  }
}

// The steps of the plan, each on <ctx> and the state of the plan <e>.
const PAS_DU_PLAN = {
  // The explorateur writes the plan, which the circuit writes at the ticket.
  async explorateur(ctx, e) {
    const t = leTicket(ctx);
    const { fiche: plan, seance } = await sessionDuPlan(
      ctx,
      EXPLORATEUR,
      consigne(
        {
          depot: ctx.racine,
          ticket: ctx.ticket,
          sujet: ctx.sujet,
          titre: t.titre,
          description: t.description.trim() || 'aucune',
          notes: t.notes.trim() || 'aucune',
          contexte: ctx.contexte || 'aucun',
        },
        5
      ),
      { ...optionsDeLExplorateur(ctx, e), id: idDeSeance(ctx, 'plan'), evenement: 'plan' }
    );
    ecrireLePlan(
      ctx,
      avecLesEtendus(ctx, plan.paquets.map(ctx.resoudre)),
      decrireLePlan(e.avant, plan.criteres, plan.questions, sorteEcrite(plan), plan.noms_publies)
    );
    const ouvertes = plan.questions.length ? `\n${lignesOuvertes(plan.questions)}` : 'aucune';
    commenter(
      ctx,
      'plan',
      `l'explorateur écrit le plan — paquets : ${plan.paquets.join(', ')}${ecartsDe(plan)} ; sorte : ${texteDeLaSorte(sorteDuPlan(plan))} ; ${plan.criteres.length} critère(s) ajouté(s) ; questions ouvertes : ${ouvertes}`
    );
    return { plan: { ...e, plan, premier: plan, seance } };
  },
  // The questionneur reads the plan once; its questions, or its disagreement as one.
  async questionneur(ctx, e) {
    const ecrit = leTicket(ctx);
    const { fiche: lu } = await sessionDuPlan(
      ctx,
      QUESTIONNEUR,
      consigne(
        {
          depot: ctx.racine,
          ticket: ctx.ticket,
          sujet: ctx.sujet,
          objet: 'le plan',
          proposition: `le plan du ticket, que l'explorateur a écrit : son titre, « ${ecrit.titre} », dont les composants sont les paquets à toucher, et sa description (LE TICKET, ci-dessous), ses critères et ses questions ouvertes.`,
          metacadre: lire(METACADRE).trim(),
          arbitrer: rubrique(ctx, 'Comment on arbitre'),
          monte: rubrique(ctx, 'Ce qui monte au superviseur'),
          description: ecrit.description.trim() || 'aucune',
        },
        4
      ),
      {
        droits: horsDeLEnveloppe(ctx, QUESTIONNEUR, 'sonnet'),
        id: idDeSeance(ctx, 'questionnement'),
        evenement: 'questionnement',
      }
    );
    commenter(
      ctx,
      'questionnement',
      lu.issue === 'AUCUNE'
        ? 'le plan — aucune question du questionneur.'
        : lu.issue === 'DÉSACCORD'
          ? `le plan — Le désaccord du questionneur : ${lu.desaccord}`
          : `le plan — Les questions du questionneur :\n${lignesDesQuestions(lu.questions)}`
    );
    return { plan: { ...e, lu, posees: questionsPosees(lu) } };
  },
  // The explorateur's session, resumed, answers the questions put once.
  async reponse(ctx, e) {
    const explorateur = optionsDeLExplorateur(ctx, e);
    const { fiche: plan } = await sessionDuPlan(
      ctx,
      EXPLORATEUR,
      consigne(
        {
          ticket: ctx.ticket,
          sujet: ctx.sujet,
          questions: e.posees.map((q, i) => `${i + 1}. ${q}`).join('\n'),
        },
        6
      ),
      {
        ...explorateur,
        id: e.seance,
        premiere: 'reprend',
        evenement: 'reponse',
        // The answer, apart from the plan it answers (`ficheDuPlan`).
        avec: { reponse: true },
        // A line of `reponses` by question put, asked again once; after it, a question without
        // its line stays open.
        valider: (f, essai) =>
          explorateur.valider(f) ?? (essai === 1 ? reponsesAuxQuestions(f, e.posees.length) : null),
      }
    );
    const lignes = (plan.reponses ?? [])
      .map(r => `${r.numero}. ${r.reponse} — ${r.texte}`)
      .join('\n');
    commenter(
      ctx,
      'questionnement',
      `la réponse de l'explorateur${ecartsDe(plan)} :\n${lignes || 'aucune'}`
    );
    return { plan: { ...e, plan, reponse: plan } };
  },
  // What stays open: the plan passes, or its question goes up.
  async conclure(ctx, e) {
    const { plan, premier, lu, posees } = e;
    const reponses = e.reponse?.reponses ?? [];
    const { acceptees, refusees } = correctionsDuPlan(
      lu.issue === 'QUESTIONS' ? lu.questions : [],
      reponses,
      (fichier, ligne) => ligneDeLaCopie(ctx, fichier, ligne)
    );
    const ouvertes = ouvertesDuPlan(plan, posees, reponses, refusees);
    if (posees.length) {
      const plans = [{ fiche: premier }, { fiche: plan, reponse: true }];
      ecrireLePlan(
        ctx,
        avecLesEtendus(ctx, plan.paquets.map(ctx.resoudre)),
        decrireLePlan(
          e.avant,
          plan.criteres,
          ouvertes,
          sorteEcrite(ficheDuPlan(plans, 'sorte')),
          ficheDuPlan(plans, 'noms_publies').noms_publies,
          acceptees
        )
      );
    }
    if (acceptees.length) {
      commenter(
        ctx,
        'questionnement',
        `corrections de critères acceptées, la pièce de la question les prouve :\n${lignesDesCorrections(acceptees)}`
      );
    }
    const empreinte = empreinteDuPlan(leTicket(ctx));
    inscrire(ctx, {
      role: AUTEUR_DU_CIRCUIT,
      questionnement: {
        objet: 'plan',
        questions: posees.length,
        change: reponses.some(r => r.reponse === 'CHANGE'),
        issue: lu.issue,
        ouvertes: ouvertes.length,
        empreinte,
      },
    });
    if (!ouvertes.length) {
      commenter(ctx, 'questionnement', 'le plan passe : aucune question ouverte.');
      inscrire(ctx, { role: AUTEUR_DU_CIRCUIT, plan: { empreinte } });
      return { passe: true };
    }
    const liste = lignesOuvertes(ouvertes);
    inscrire(ctx, { role: AUTEUR_DU_CIRCUIT, etape: TESTS, arret: 'questionnement' });
    return {
      code: monter(ctx, {
        code: ARRETS.questionnement,
        nom: 'questionnement',
        rapport: `Des questions du plan restent ouvertes après la réponse de l'explorateur.\n\n${liste}\n\nL'échange est au ticket (\`Circuit · … · questionnement\`).`,
        piece: liste,
        etat: etatDuPlan(),
      }),
    };
  },
};

// The circuit stopped on the supervisor's word (`--arreter`) at its state <e>, which the workflow
// holds, its session ended with the act the workflow cancelled: the state keeps its step, its stop
// « arrete », its question lifted, said at the ticket. Its exit code, 0.
export async function arreter(ctx, e) {
  const lu = e;
  ctx.circuit = ctx.circuit ?? lu.circuit;
  ctx.constats = [...(lu.constats ?? [])];
  ctx.verifie = lu.verifie ?? null;
  ctx.toursDeLaPasseFinale = lu.toursDeLaPasseFinale ?? null;
  ctx.seanceReprise = lu.seanceReprise ?? null;
  ctx.verts = lu.verts ?? null;
  ctx.reprise = lu.reprise ?? null;
  ctx.refus = lu.refus ?? null;
  ecrireEtat(ctx, {
    etape: lu.etape,
    tentative: lu.tentative,
    code: null,
    raison: 'arrete',
    rapport: ctx.contexte
      ? `Le superviseur arrête le circuit : ${ctx.contexte}`
      : (lu.rapport ?? null),
    finale: lu.finale === true,
  });
  const pourquoi = ctx.contexte ? ` : ${ctx.contexte}` : '.';
  commenter(ctx, 'arret', `le superviseur arrête le circuit${pourquoi}`);
  sortirDeLaFile(ctx);
  return 0;
}

// The label `circuit` is the ticket's place in the queue of the tickets of its project
// (scripts/file-des-tickets.mjs `enFile`), which starts every open ticket that holds it and whose
// circuit does not run. A circuit stopped on the supervisor's word leaves that queue, its label
// taken off, as a change whose approval is withdrawn leaves a merge queue (bors `r-`, Zuul's
// dequeue): Beads keeps the ticket from starting again until his word reopens it.
export const sortirDeLaFile = ctx =>
  emettre(ctx, { genre: 'etiquettes', ticket: ctx.ticket, etiquettes: [], retirees: ['circuit'] });

// The run of <ctx> that opens on the supervisor's answer to that stop (the state <e> it resumes
// from, its stop « arrete ») is in the circuit again: its label put back.
export function rentrerDansLaFile(ctx, e) {
  if (e?.raison === 'arrete') {
    emettre(ctx, { genre: 'etiquettes', ticket: ctx.ticket, etiquettes: ['circuit'] });
  }
}

// The plan <paquets> of the repository at <base>, each a directory relative to it, extended by
// <gagnes>: each one enters before the first package of the plan that reads it, as the module of
// the language reads its components (`lecteurs` of the join, its `lit` and its `parLesTests`: the
// imports of a package of TypeScript, its tests' included, the dependencies of a crate of cargo,
// of development included), else at its end, as Pants asks the order of the targets of its
// backends.
export function ordonnerLePlan(base, paquets, gagnes) {
  const langage = langageDe(base);
  const composants = langage.composants(base);
  const { lit, parLesTests } = langage.lecteurs(base, {
    composants,
    noms: [],
    texte: '',
    nommes: [],
  });
  const de = d => composants.find(c => (path.relative(base, c.dossier) || '.') === d);
  const litLe = (lecteur, fournisseur) => {
    const l = de(lecteur);
    const f = de(fournisseur);
    return Boolean(l && f && (lit.get(l)?.has(f) || parLesTests.get(l)?.has(f)));
  };
  const plan = [...paquets];
  for (const c of gagnes) {
    const i = plan.findIndex(x => litLe(x, c));
    plan.splice(i < 0 ? plan.length : i, 0, c);
  }
  return plan;
}

/**
 * The plan <paquets> of <ctx> extended by <gagnes>, in the order `ordonnerLePlan` reads: in the
 * ticket's copy; when the copy does not load (a manifest a session left broken: `cargo metadata`
 * refuses a workspace whose member names a dependency its root does not declare), in the main
 * tree; when neither loads, each gained package at the plan's end. The supervisor's answer to a
 * stopped circuit never fails on the tree it comes to repair, as a command that answers a workflow
 * does not need its working tree to build. `{ plan, lu }`: where the order was read, `copie`,
 * `principal`, or `aucun`.
 */
export function planEtendu(ctx, paquets, gagnes) {
  const bases = [
    ...(existsSync(ctx.copie) ? [['copie', ctx.copie]] : []),
    ['principal', ctx.racine],
  ];
  for (const [lu, base] of bases) {
    try {
      return { plan: ordonnerLePlan(base, paquets, gagnes), lu };
    } catch {
      // This tree does not load: the next one is read.
    }
  }
  return { plan: [...paquets, ...gagnes], lu: 'aucun' };
}

// What the line of the plan at the ticket says of the tree its order was read in, when the copy of
// the ticket exists and does not load.
const ORDRE_LU = {
  copie: '',
  principal: " (l'ordre du plan est lu dans l'arbre principal : la copie ne se charge pas)",
  aucun:
    " (le paquet gagné va en fin de plan : ni la copie ni l'arbre principal ne se chargent pour l'ordonner)",
};

export { contexteDeLExtension };

// The plan extended by the supervisor to the packages of `--etendre` (each a path or a package
// name of the repository, else a Usage): each one enters the title in the order of
// `ordonnerLePlan`, written by bd and said at the ticket. Where the run then resumes is the
// decision `etendre` of the table of the transitions. The state the run resumes from.
function etendre(ctx, e) {
  const gagnes = [...new Set(ctx.etendre.map(ctx.resoudre))].filter(c => !ctx.paquets.includes(c));
  const { plan, lu } = planEtendu(ctx, ctx.paquets, gagnes);
  const titre = ecrireLePlan(ctx, plan);
  // The plan the supervisor extends has passed: it is written, questioned no more. The packages
  // he gives it are kept with it (`etendus`): a plan the explorateur writes again keeps them
  // (`avecLesEtendus`).
  inscrire(ctx, {
    role: AUTEUR_DU_CIRCUIT,
    plan: {
      empreinte: empreinteDuPlan(leTicket(ctx)),
      etendus: [...new Set(ctx.etendre.map(ctx.resoudre))],
    },
  });
  commenter(
    ctx,
    'plan',
    `le superviseur étend le plan à ${ctx.etendre.join(', ')} : ${titre.split(' — ').at(-1)}${ORDRE_LU[lu]}.`
  );
  const d = reprendreEtendu({
    etat: e,
    etendus: ctx.etendre,
    plan: titre.split(' — ').at(-1),
    contexte: ctx.contexte,
    renvoi: fichesDe(ctx, 'developpeur').at(-1)?.renvoi ?? null,
  });
  if (d.reprend) {
    ctx.contexte = d.contexte;
    ctx.reprendre = true;
  }
  return d.suivant;
}

// The opening of <ctx> on <e> before its plan: `{ debut }`, or `{ code }`, a stop gone up.
async function avantLePlan(ctx, e) {
  rentrerDansLaFile(ctx, e);
  // The circuit is fixed at the first opening, read in the label of the ticket; a resumption
  // keeps that of the stopped state.
  if (e) {
    ctx.circuit = e.circuit ?? ctx.circuit ?? circuitSansTrace(ctx);
  } else {
    ctx.circuit = leTicket(ctx).labels.includes('direct') ? 'direct' : 'long';
  }
  if (ctx.etendre) {
    if (e?.etape === 'integre') {
      throw new Usage(`--etendre : le lot de ${ctx.ticket} est intégré.`);
    }
    e = etendre(ctx, e);
  }
  if (ctx.mecanique) {
    e = basculer(ctx, e);
  }
  // The findings open at the launch of a run with the supervisor's context (`--contexte`, or the
  // answer `--etendre` gives to the stop) are its sessions' context; without one, their task.
  ctx.constats = auLancement(ctx.contexte, ctx.constats);
  // The rank of the circuit's arrival among the machine's waits for a place: drawn at its
  // launch, kept by its state from one session to the next and across a resumption, so that a
  // circuit well advanced is not passed by a ticket that arrived after it.
  ctx.rang = e?.rang ?? tirerLeRang();
  // The supervisor's resumption of the questioning lets the plan pass as it is now.
  if (ctx.reprendre && e?.raison === 'questionnement') {
    commenter(ctx, 'questionnement', 'le plan passe tel qu’il est, sur la reprise du superviseur.');
    inscrire(ctx, { role: AUTEUR_DU_CIRCUIT, plan: { empreinte: empreinteDuPlan(leTicket(ctx)) } });
  }
  const d = departDuCircuit(ctx, e);
  // A direct circuit has no plan to write: the packages of its title, resolved, are its plan,
  // written at the ticket as one.
  if (!e && ctx.circuit === 'direct') {
    ecrireLePlan(ctx, ctx.paquets);
  }
  // A ticket labelled arbitrage starts and resumes only on the arbitrage its integration will
  // ask for: the integration's rule, before any session.
  const arbitrage = refusArbitrage({ id: ctx.ticket, ...leTicket(ctx) }, lesCommentaires(ctx));
  if (arbitrage) {
    return {
      code: monter(ctx, {
        code: ARRETS.besoin,
        nom: 'besoin',
        rapport: arbitrage,
        piece: `$ bd show ${ctx.ticket} --json ; bd comments ${ctx.ticket} --json\n${arbitrage}`,
        question: `${arbitrage} L'arbitrage s'écrit au ticket (« ## Arbitrage — … », tranché ou répondu par le responsable), puis \`--reprendre\`.`,
        // From the testwriter, the plan comes first: the stop is at « 1 Plan ».
        etat: d.etape === TESTS ? { ...d, questionnement: { objet: 'plan' } } : d,
      }),
    };
  }
  // The tools of the project, which every pass of the circuit plays with: a faulty key stops the
  // run before any session, by its name.
  const lancement = outilsAuLancement(ctx.racine);
  if (lancement.arret) {
    return { code: monter(ctx, { ...lancement.arret, etat: d }) };
  }
  ctx.outils = lancement.outils;
  ctx.empreintes = lancement.empreintes;
  const donnees = donneesAuLancement(ctx.racine);
  if (donnees.arret) {
    return { code: monter(ctx, { ...donnees.arret, etat: d }) };
  }
  ctx.donnees = donnees.donnees;
  // The generated files the project declares: references of the circuit, which 4.2 regenerates
  // only when a red of a pass lies in their files (`referencesDesRouges`); the integration
  // regenerates them whenever the lot touches their files or what they read.
  const engendres = engendresAuLancement(ctx.racine);
  if (engendres.arret) {
    return { code: monter(ctx, { ...engendres.arret, etat: d }) };
  }
  ctx.engendres = engendres.engendres;
  // The folders of test material the project declares: refused at the launch when the key is
  // faulty, before any session.
  const matieres = matieresAuLancement(ctx.racine);
  if (matieres.arret) {
    return { code: monter(ctx, { ...matieres.arret, etat: d }) };
  }
  // The flows of the CI, refused at the launch when their key is faulty: the reviewer's instruction
  // reads those the lot touches (`consigneDesFlux`).
  const flux = fluxAuLancement(ctx.racine);
  if (flux.arret) {
    return { code: monter(ctx, { ...flux.arret, etat: d }) };
  }
  return { debut: d };
}

/**
 * The opening of a run of <ctx> on its state <e> up to its plan (`ouvrir` without its plan), as
 * the workflow of a ticket plays the plan's steps itself: `{ code }`, a stop gone up; or
 * `{ debut, plan }`, the step it starts at and the state of the plan still to write
 * (`planAuDebut`), null when none is.
 */
export async function ouvrirJusquAuPlan(ctx, e) {
  const o = await avantLePlan(ctx, e);
  if ('code' in o) {
    return o;
  }
  const aEcrire =
    ctx.circuit !== 'direct' &&
    o.debut.etape === TESTS &&
    !planPasse(ctx, empreinteDuPlan(leTicket(ctx)));
  return { debut: o.debut, plan: aEcrire ? planAuDebut(ctx) : null };
}

/**
 * The end of the opening of <ctx> at the step <d>: the sort of the ticket, none for a direct
 * circuit, and the circuit that follows it. `{ debut }`.
 */
export function finirLOuverture(ctx, d) {
  // The sort of the ticket its plan says, which the run reads at each step.
  ctx.sorte = ctx.circuit === 'direct' ? null : sorteDuTicket(ctx);
  ctx.circuit = circuitSuivant(ctx.circuit, ctx.sorte);
  return { debut: d };
}
