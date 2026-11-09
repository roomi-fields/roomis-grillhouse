// The activities of the circuit of a ticket (scripts/circuit.mjs) beside its sessions
// (scripts/seances.mjs), as Temporal runs the activities of a workflow: the proof of the red
// (`preuve`), the checks and the final pass (`controles`), the regeneration of the references
// (`regenerer`), the integration (`integrer`), the review (`relire`), the tri of the discoveries
// (`trier`) and the readings of the copy (its tree, its lot kept, its fingerprint, what it
// delivers). Each receives its inputs (the run's context <ctx>, its paths and its ports, and what
// it reads of the circuit's memory) and returns its outcome; none reads nor writes the circuit's
// memory: the circuit keeps what it returns (grillhouse-4nr.4). The regeneration starts by
// restoring the copy it kept before it; the integration of a lot already committed, its branch in
// the queue, makes no second commit. The port of <ctx> (`ctx.ports.signeDeVie`, the sign of life
// of a session) is the caller's.
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  appendFileSync,
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { avecLAvancementDuTravail } from './avancement.mjs';
import { A_REPASSER } from './codes-de-sortie.mjs';
import { DEPUIS_LE_VERT } from './dernier-vert.mjs';
import { empreinteDEtape } from './empreinte-d-etape.mjs';
import { FICHIER as DETTE } from './dette.mjs';
import { commandesPermises, optionsDuRole } from './droits.mjs';
import { couvertPar } from './engendres.mjs';
import { ecrireLaListe, VARIABLE as VARIABLE_ENVELOPPE } from './enveloppe/paquets-du-plan.mjs';
import { etapeDuCircuit, EXPLORATEUR, SUITE } from './etapes.mjs';
import { nomsDesGardes } from './gardes-du-cadre.mjs';
import { INTEGRE } from './integration/file.mjs';
import { AUTEUR_DU_VERDICT } from './integration/verdict.mjs';
import { langageDe } from './langages.mjs';
import { avecUneLecture } from './lecture-unique.mjs';
import { AVANCEMENT } from './mesure/avancement.mjs';
import { avecLesOutils } from './outils-cles.mjs';
import { avecLesDonnees } from './donnees-cles.mjs';
import { consigneDesFlux } from './flux-des-paquets.mjs';
import { avecLaPasse, lancementDeLaPasse, passeLourde } from './passe-de-la-machine.mjs';
import {
  A_ELAGUER,
  bloquantsDeLaFiche,
  conformiteDuLot,
  conformiteDuTri,
  lireSarif,
  regleDeLaLigne,
  RESULTATS,
  suiviDesConstats,
  VERDICTS_DU_TRI,
  VERDICTS_ROUVERTS,
} from './resultats.mjs';
import { consigne, idDeSeance, jusquALaFiche } from './seances.mjs';
import {
  Arret,
  AUTEUR_DU_CIRCUIT,
  codeDejaPresent,
  commenter,
  composantsDe,
  entete,
  fichesDe,
  fin,
  geste,
  inscrire,
  lesFiches,
  leTicket,
  lire,
  lireJson,
  PREFIXE,
  premiereLigne,
  sansCouleurs,
} from './ticket-du-circuit.mjs';
import { emettre } from './effets.mjs';
import { PREUVE, TRI } from './transitions.mjs';
import { AttenteDeLaMachine, nommerLAvancement } from './verrou-de-machine.mjs';
import { avecLaMachineEtUnePlace } from './places-de-la-machine.mjs';

const ici = import.meta.dirname;
// The sessions out of the envelope (the reviewer, the explorateur and the questionneur, all on
// Sonnet), each in the
// ticket's copy, the main tree once the integration removed it, under the rights and the context
// of its role (scripts/droits.mjs: the commands its skill names, the refusal of a change of its
// author at the ticket), without a prompt: any call its rights do not permit is refused.
export const horsDeLEnveloppe = (ctx, role, modele) => [
  '--model',
  modele,
  '--permission-mode',
  'dontAsk',
  ...optionsDuRole(role, {
    racine: ctx.racine,
    copie: existsSync(ctx.copie) ? ctx.copie : ctx.racine,
    ticket: ctx.ticket,
  }),
];
const INTEGRER = path.join(ici, 'integration', 'integrer.mjs');
// A generator of the frame, beside this script, as the command of a reference.
const generateur = (script, ...args) =>
  [`node ${JSON.stringify(path.join(ici, script))}`, ...args].join(' ');
// The references of the circuit that no project declares (4.2), as Bazel's genrules: the files the
// module of the project's language generates (`fichiersEngendres`, scripts/jointure.d.ts), each
// judged by a guard of the frame and written again by its generator, whose
// code the circuit does not read (a real failure aside): what it writes, then the pass that
// follows, judge it; and the known debt of the guards, lowered from the notes of the final pass (`dette.mjs --abaisser`,
// `abaisser`: its command names the file of those notes). Each `{ nom, commande, fichiers, lit,
// gardes }`, `lit` the files of the copy it reads that another reference writes (as the
// prerequisites of a rule of make: the index reads the interfaces, whose generated part the API
// reports write), `gardes` the names the findings its regeneration lifts carry (their guard or
// their rule), `entiers` the files of `fichiers` its command writes in full, which the integration
// does not apply from the lot but regenerates on main of the moment
// (scripts/integration/integrer.mjs), as the module says of each of its own; not the debt, which
// reads the notes of a pass.
const referencesDuCadre = racine => [
  ...langageDe(racine)
    .fichiersEngendres(racine)
    .map(({ verifier: _verifier, ...reference }) => reference),
  {
    nom: 'la dette des gardes',
    commande: generateur('dette.mjs', '--abaisser', '<notes>'),
    fichiers: [DETTE],
    lit: [],
    gardes: [],
    entiers: [],
    abaisser: true,
  },
];

// The line CONTEXTE of a reviewer's session: the text of `--contexte` of the run; « aucun »
// without it.
const contexteDe = ctx => ctx.contexte || 'aucun';

// The discoveries the sheets of the ticket filed, `{ id, sujet }`, in their order.
const decouvertesDuTicket = ctx =>
  lesFiches(ctx)
    .filter(e => e.role === AUTEUR_DU_CIRCUIT && e.decouverte)
    .map(e => e.decouverte);

// The circuit's reports since the reviewer's last sheet: those of its proofs and checks (the final
// pass among them), as it wrote them at the ticket.
function rapportsDuCircuit(ctx) {
  const tous = lesFiches(ctx);
  const depuis = tous.findLastIndex(e => e.role === 'relecteur') + 1;
  return tous
    .slice(depuis)
    .filter(e => e.role === AUTEUR_DU_CIRCUIT && e.rapport)
    .map(e => e.rapport);
}

// The files of the lot, as the copy holds them against its HEAD: `{ tests, code }`, the
// testwriter's files (`estUnTest`: test files and the shared test material) and the others.
function fichiersDuLot(ctx) {
  const tests = [];
  const code = [];
  for (const { fichier } of changements(ctx)) {
    (duTestwriter(ctx, fichier) ? tests : code).push(fichier);
  }
  return { tests: tests.sort(), code: code.sort() };
}

// The blocking findings of a reviewer's sheet <fiche>, the ones that send the lot back: its
// blocking findings and each element it judges not conforming (scripts/resultats.mjs).
const bloquants = bloquantsDeLaFiche;

// The blocking findings <constats>, each under its heading, the criterion or rule it holds, its
// recipient (or the criterion in question), its body and its piece (an element judged not
// conforming carries it in its body), then the developpeur's answer to it, when he gave one: lines.
const lignesDesConstats = constats =>
  constats.flatMap((c, i) => [
    `### Constat ${i + 1} — ${c.titre}`,
    `Bloquant : ${c.regle}`,
    c.critere_en_cause ? `Critère en cause : ${c.critere_en_cause}` : `Agent : ${c.role ?? '?'}`,
    c.corps,
    ...(c.piece ? [`Pièce : ${c.piece}`] : []),
    ...(c.reponse
      ? [
          `Réponse du développeur : ${c.reponse.etat}${c.reponse.raison ? ` — ${c.reponse.raison}` : ''}`,
          `Pièce de la réponse : ${c.reponse.piece}`,
        ]
      : []),
    '',
  ]);

// The verdict the reviewer's sheet <fiche> carries, as the circuit writes it at the ticket for the
// human, its first word ACCEPTÉ or RENDU: after a bounded review, each finding before it lifted or
// not, with its proof; each blocking finding under its heading, what it holds, its recipient (or
// the criterion in question) and its body (an element judged not conforming among them); then the
// conformity of each element of the lot, its rule and its piece, the remarks (its findings of
// `genre` remarque), the question for the owner and the deviations to name at the commit.
export function texteDuVerdict(fiche) {
  const section = (titre, l) => (l?.length ? [`## ${titre}`, '', ...l.map(x => `- ${x}`), ''] : []);
  const suivi = (fiche.suivi ?? []).map(
    x => `${x.titre} : ${x.etat}${x.preuve ? ` — ${x.preuve}` : ''}`
  );
  return [
    fiche.verdict,
    '',
    ...section("Constats d'avant", suivi),
    ...lignesDesConstats(bloquants(fiche)),
    ...section(
      'Conformité',
      (fiche.conformite ?? []).map(
        l => `${l.element} : ${l.conforme} — ${regleDeLaLigne(l)} — ${l.piece}`
      )
    ),
    ...section(
      'Remarques',
      (fiche.constats ?? [])
        .filter(c => c.genre === 'remarque')
        .map(c => `${c.titre} — ${c.corps} (${c.piece})`)
    ),
    ...section(
      'Question au responsable',
      fiche.question ? [`${fiche.question} (${fiche.piece})`] : []
    ),
    ...section(
      'Écarts à nommer au commit',
      fiche.ecarts?.map(e => `${e.sujet} : ${e.texte}`)
    ),
  ]
    .join('\n')
    .trim();
}

// The review of the lot, the reviewer's session out of the envelope, from the second template:
// `{ verdict, fiche, texte, arbre }`, its sheet, the verdict the circuit writes at the ticket from
// it, under the reviewer's author, and the tree of the lot it read. The lot it reads is kept as a
// patch set (`leLotGarde`), on the lot the review before read set on the copy's HEAD, joined to
// its sheet's entry (`lot: { commit, arbre, base, fichiers }`); after a review sent back, the
// review reads the difference between the two and the findings before it (the bounded review), as
// Gerrit has the next review read the difference between two patch sets, each against its own
// base: the files of the lot that changed since, the command of the difference, the findings
// still open with their recipients.
export async function relire(ctx, { constats = [] } = {}) {
  const { tests, code } = fichiersDuLot(ctx);
  const rapports = rapportsDuCircuit(ctx);
  const precedents = fichesDe(ctx, 'relecteur').length;
  const { avant, depuis, lot } = leLotGarde(ctx);
  let lus = { tests, code };
  // The findings still open go to every review, bounded or whole.
  const ouvertsALaRelecture = constats.map(c => c.titre);
  let precedente = relectureEntiere(constats);
  if (avant && depuis && lot) {
    const dansLeLot = new Set([...tests, ...code, ...(avant.lot.fichiers ?? [])]);
    const changes = differenceDesLots(ctx, depuis, lot.commit).filter(f => dansLeLot.has(f));
    lus = {
      tests: changes.filter(f => duTestwriter(ctx, f)),
      code: changes.filter(f => !duTestwriter(ctx, f)),
    };
    precedente = [
      `la relecture ${precedents}, ${avant.fiche.verdict} : tu relis la différence du lot depuis elle et ses constats, selon ta compétence (« La relecture bornée »).`,
      '',
      `- La différence : \`git diff ${depuis} ${lot.commit}\`, dans la copie du ticket ; ses fichiers : ${changes.join(', ') || 'aucun'}.`,
      '- Les constats bloquants qui restent ouverts, chacun avec son destinataire :',
      '',
      ...lignesDesConstats(constats),
    ]
      .join('\n')
      .trim();
  }
  const affirmations = path.join(ctx.tmp, 'affirmations.md');
  writeFileSync(affirmations, leTicket(ctx).description);
  const liste = lot
    ? langageDe(ctx.copie).elementsDuLot(ctx.copie, { avant: 'HEAD', apres: lot.commit })
    : { etat: 'impossible', raison: 'le lot n’a pas pu être gardé', elements: [] };
  // A bounded review: the lines of the review before, and the elements the difference touches
  // (every one when it cannot be computed), as a review unticks « viewed » on the files changed
  // since.
  const touches =
    avant &&
    depuis &&
    lot &&
    langageDe(ctx.copie).elementsDuLot(ctx.copie, { avant: depuis, apres: lot.commit });
  const bornee = touches
    ? {
        touches: touches.etat === 'fait' ? new Set(touches.elements.map(e => e.id)) : null,
        lignes: new Map((avant.fiche.conformite ?? []).map(l => [l.element, l])),
      }
    : null;
  const valeurs = {
    depot: ctx.racine,
    ticket: ctx.ticket,
    sujet: ctx.sujet,
    paquets: ctx.paquets.join(', '),
    reprise: precedents
      ? `oui : ${precedents} relecture(s) d'avant ont rendu le lot, et le lot a repassé le circuit depuis`
      : 'non',
    lots: [
      ...(avant && depuis && lot ? ["ce que le lot change depuis la relecture d'avant"] : []),
      `le lot de tests : ${lus.tests.join(', ') || 'aucun fichier'}`,
      `le lot de code : ${lus.code.join(', ') || 'aucun fichier'}`,
    ].join(' ; '),
    precedente,
    affirmations,
    elements: texteDesElements(liste, bornee),
    flux: consigneDesFlux(ctx.racine, [...tests, ...code]),
    rapports: rapports.join('\n\n') || 'aucun',
    // The supervisor's context of a resumption, his answer to a question of the reviewer among them.
    contexte: contexteDe(ctx),
  };
  const fiche = await jusquALaFiche(ctx, 'relecteur', consigne(valeurs, 1), {
    signeDeVie: ctx.ports?.signeDeVie,
    id: idDeSeance(ctx, 'relecture'),
    evenement: 'relecture',
    horsEnveloppe: true,
    droits: horsDeLEnveloppe(ctx, 'relecteur', 'sonnet'),
    avec: lot ? { lot: { ...lot, fichiers: [...tests, ...code] } } : {},
    // Every review judges the findings still open, bounded or whole (`suiviDesConstats`).
    valider: f =>
      [conformiteDuLot(f, liste), suiviDesConstats(f, ouvertsALaRelecture)]
        .filter(Boolean)
        .join(' ; ') || null,
  });
  const texte = texteDuVerdict(fiche);
  emettre(ctx, {
    genre: 'commentaire',
    ticket: ctx.ticket,
    texte,
    auteur: AUTEUR_DU_VERDICT,
  });
  return { verdict: fiche.verdict, fiche, texte, arbre: lot?.arbre ?? null };
}

// The line « LA RELECTURE D'AVANT » of a whole review (no review before, the replay of the lot in
// conflict, or a review before without its base): with the findings <constats> still open, each
// with its recipient and the developpeur's answer under it, which it judges lifted or not in
// `suivi`, as Gerrit carries the unresolved comments to each new patch set whatever the form of
// the review.
export function relectureEntiere(constats) {
  if (!constats.length) {
    return 'aucune : tu relis le lot entier';
  }
  return [
    'aucune différence à lire : tu relis le lot entier, et tu juges chaque constat bloquant qui reste ouvert, levé ou non levé, dans `suivi`, selon ta compétence (« La relecture entière ») ; chacun, avec son destinataire :',
    '',
    ...lignesDesConstats(constats),
  ]
    .join('\n')
    .trim();
}

// The elements of the lot <liste> (`elementsDuLot` of the module of language) as the reviewer's instruction
// lists them: one line each, its id, its kind, its status, its export, its package and its place;
// in a bounded review (<bornee>: `{ touches, lignes }`, the ids the difference touches, null for
// every one, and the lines of the review before by element), each marked to judge again, or to
// take up with its line before; then the changed sources the language service does not read,
// whose elements he surveys himself, one line of conformity each as `<fichier>#<nom>`, and why.
function texteDesElements(liste, bornee = null) {
  if (liste.etat !== 'fait') {
    return `aucun : la liste n'a pas pu être calculée (${liste.raison}) ; tu relèves toi-même chaque élément du lot.`;
  }
  const marque = e => {
    if (!bornee) {
      return '';
    }
    const ligne = bornee.lignes.get(e.id);
    if (bornee.touches && !bornee.touches.has(e.id) && ligne) {
      return ` — reprise, la différence ne le touche pas : ${ligne.conforme} — ${regleDeLaLigne(ligne)} — ${ligne.piece}`;
    }
    return ligne ? ' — à rejuger : la différence le touche' : " — à rejuger : aucune ligne d'avant";
  };
  const lignes = liste.elements.map(
    e =>
      `- \`${e.id}\` : ${e.genre}, ${e.statut}, ${e.exporte ? 'exporté' : 'non exporté'}, paquet ${e.paquet}, ${e.fichier}:${e.ligne}${marque(e)}`
  );
  if (liste.horsDuService.length) {
    const pourquoi = liste.service
      ? `le service de langage n'a pas pu tourner : ${liste.service}`
      : 'aucun tsconfig.json ne les lit';
    lignes.push(
      `- Hors du service de langage (${pourquoi}), tu relèves toi-même leurs éléments, une ligne de conformité chacun, son élément \`<fichier>#<nom>\` : ${liste.horsDuService.join(', ')}.`
    );
  }
  return lignes.join('\n') || 'aucun : le lot ne change aucun élément du code.';
}

// The last review of the ticket and the lot it read: its sheet's entry (`{ fiche, lot: { commit,
// arbre, base, fichiers } }`), or null before any, without a copy, or when the lot or its base is
// not kept (the repository no longer holds one of them).
function relectureDAvant(ctx) {
  const e = lesFiches(ctx).findLast(x => x.role === 'relecteur');
  if (!e?.lot?.commit || !e.lot.base || !existsSync(ctx.copie)) {
    return null;
  }
  const tient = c =>
    spawnSync('git', ['-C', ctx.copie, 'cat-file', '-e', `${c}^{commit}`]).status === 0;
  return tient(e.lot.commit) && tient(e.lot.base) ? e : null;
}

// The tree of the copy as it stands, the copy's HEAD and index untouched: a fresh index of the
// circuit's, read from HEAD (no stat cache, so git hashes every file's content and a file changed
// within the second of the index, the racy case, is never missed), every file of the copy added to
// it (`git add -A`, the ignored files left out), written as a tree. Its id, or null when git fails.
export function arbreDeLaCopie(ctx) {
  const index = path.join(ctx.tmp, `index-${randomUUID().replaceAll('-', '')}`);
  const env = { ...process.env, GIT_INDEX_FILE: index };
  const git = (...a) => spawnSync('git', ['-C', ctx.copie, ...a], { encoding: 'utf8', env });
  try {
    if (git('read-tree', 'HEAD').status !== 0) {
      return null;
    }
    if (git('add', '-A').status !== 0) {
      return null;
    }
    const r = git('write-tree');
    return r.status === 0 ? r.stdout.trim() : null;
  } finally {
    rmSync(index, { force: true });
  }
}

// The copy's HEAD, the base of the lot as it stands (the tip of main of its time), or null.
function laBase(ctx) {
  const r = spawnSync('git', ['-C', ctx.copie, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

// The tree <arbre> kept as a commit on <parent> in the copy, under the circuit's author, with the
// message <message>: its id, or null when git fails.
function unCommit(ctx, arbre, parent, message) {
  const qui = { name: AUTEUR_DU_CIRCUIT, email: 'circuit@grillhouse.invalid' };
  const r = spawnSync('git', ['-C', ctx.copie, 'commit-tree', arbre, '-p', parent, '-m', message], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: qui.name,
      GIT_AUTHOR_EMAIL: qui.email,
      GIT_COMMITTER_NAME: qui.name,
      GIT_COMMITTER_EMAIL: qui.email,
    },
  });
  return r.status === 0 ? r.stdout.trim() : null;
}

// The lot of the copy kept as a commit on <parent> (a lot kept before, or HEAD), as Gerrit keeps
// each patch set of a change: `{ commit, arbre, base }`, its base the copy's HEAD, or null when git
// fails. Turborepo compares two of them (`--filter=...[<avant>...<après>]`, the merge base of the
// range being the first), and the reviewer reads their difference.
function garderLeLot(ctx, parent) {
  const arbre = arbreDeLaCopie(ctx);
  const base = laBase(ctx);
  if (!arbre || !base) {
    return null;
  }
  const commit = unCommit(ctx, arbre, parent ?? base, `lot de ${ctx.ticket}`);
  return commit ? { commit, arbre, base } : null;
}

// The lot <lot> kept before (`{ commit, base }`) as it reads on the copy's HEAD, as Gerrit compares
// two patch sets each against its own base: the lot itself while HEAD is its base; after an
// advance of the copy, what it changed since its base replayed on HEAD (`git merge-tree
// --write-tree --merge-base=<base> HEAD <lot>`), kept as a commit on HEAD, so that its difference
// with the next lot holds what the lot changed, never the commits of main. Null when the replay
// conflicts with what main changed, or git fails: nothing bounds the next review.
function leLotSurLaBase(ctx, lot) {
  const base = laBase(ctx);
  if (!base) {
    return null;
  }
  if (lot.base === base) {
    return lot.commit;
  }
  const r = spawnSync(
    'git',
    ['-C', ctx.copie, 'merge-tree', '--write-tree', `--merge-base=${lot.base}`, base, lot.commit],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) {
    return null;
  }
  const arbre = r.stdout.split('\n')[0].trim();
  return unCommit(ctx, arbre, base, `lot relu de ${ctx.ticket} sur ${base}`);
}

// The lot of the copy kept against the review before: `{ avant, depuis, lot }`, that review
// (`relectureDAvant`, null before any), the lot it read set on the copy's HEAD (`leLotSurLaBase`,
// null when nothing bounds), and the copy kept as a lot on it (on HEAD without it). The bounded
// review and its elements to judge again read the difference from `depuis` to `lot`; the final
// pass does not read it, it plays the band of the lot (`laPasseFinale`).
export function leLotGarde(ctx) {
  const avant = relectureDAvant(ctx);
  const depuis = avant ? leLotSurLaBase(ctx, avant.lot) : null;
  return { avant, depuis, lot: garderLeLot(ctx, depuis) };
}

// The tree of the commit <commit> in the copy, or null.
function arbreDuCommit(ctx, commit) {
  const r = spawnSync('git', ['-C', ctx.copie, 'rev-parse', `${commit}^{tree}`], {
    encoding: 'utf8',
  });
  return r.status === 0 ? r.stdout.trim() : null;
}

// Whether the last review accepted the lot whose tree is <arbre>: its lot, set on the copy's HEAD
// (`leLotSurLaBase`), is that tree, as Gerrit keeps the votes of a patch set across a trivial
// rebase; an advance of the copy that leaves the lot as it was sends it to no other review.
export function leLotAccepte(ctx, arbre) {
  const r = relectureDAvant(ctx);
  if (r?.fiche.verdict !== 'ACCEPTÉ' || !arbre) {
    return false;
  }
  if (r.lot.arbre === arbre) {
    return true;
  }
  const surLaBase = leLotSurLaBase(ctx, r.lot);
  return Boolean(surLaBase) && arbreDuCommit(ctx, surLaBase) === arbre;
}

// The files that differ between the lots kept <avant> and <apres>, relative to the copy, sorted.
function differenceDesLots(ctx, avant, apres) {
  const r = spawnSync('git', ['-C', ctx.copie, 'diff', '--name-only', '-z', avant, apres], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return r.status === 0 ? r.stdout.split('\0').filter(Boolean).sort() : [];
}

// The final pass the lot calls for: `{ arbre, restreinte }`, the tree of the copy and the band
// Turborepo plays (`{ avant, apres }`: the copy's HEAD, the base of the lot, and the copy kept as a
// commit on it), as Bazel and Nx `affected` play the reverse-dependency closure of a change: always
// the band of the lot, before any review, after one, on an accepted lot, main advanced or not,
// never the whole repository, which the night and the integration play. It throws, naming git,
// when git cannot keep the lot: a null band would be the whole repository.
export function laPasseFinale(ctx) {
  const arbre = arbreDeLaCopie(ctx);
  const lot = arbre ? garderLeLot(ctx, null) : null;
  if (!arbre || !lot) {
    throw new Error(`la passe finale ne peut borner le lot de ${ctx.ticket} : git ne le garde pas`);
  }
  return { arbre, restreinte: { avant: lot.base, apres: lot.commit } };
}

// The references of the circuit: those the project declares in the package.json of the copy
// (`grillhouse.references`), each `{ nom, commande, fichiers, tests, lit, gardes }` with a name, a
// command and files, `tests`, `lit` and `gardes` arrays when given, empty when not, `entiers` empty;
// then its generated files (`grillhouse.engendres`, read at the launch, `ctx.engendres`), each
// written in full (`entiers`), which the integration regenerates itself; then the frame's
// (`referencesDuCadre`, `cadre`), each but one whose first file a reference of the project covers,
// which replaces it.
export function lesReferences(ctx) {
  const l = lireJson(path.join(existsSync(ctx.copie) ? ctx.copie : ctx.racine, 'package.json'))
    ?.grillhouse?.references;
  const duProjet = (Array.isArray(l) ? l : [])
    .filter(
      r =>
        typeof r?.nom === 'string' &&
        typeof r.commande === 'string' &&
        Array.isArray(r.fichiers) &&
        r.fichiers.length > 0 &&
        (r.tests === undefined || Array.isArray(r.tests)) &&
        (r.lit === undefined || Array.isArray(r.lit)) &&
        (r.gardes === undefined || Array.isArray(r.gardes))
    )
    .map(r => ({
      ...r,
      tests: r.tests ?? [],
      lit: r.lit ?? [],
      gardes: r.gardes ?? [],
      entiers: [],
      cadre: false,
    }))
    .concat((ctx.engendres ?? []).map(e => ({ ...e, tests: [], cadre: false })));
  const duCadre = referencesDuCadre(existsSync(ctx.copie) ? ctx.copie : ctx.racine)
    .filter(c => !duProjet.some(r => couvertPar(r.fichiers, c.fichiers[0])))
    .map(c => ({ ...c, tests: [], cadre: true }));
  return [...duProjet, ...duCadre];
}

// The references a red of <lieux> is one of (each `{ fichier, gardes, dansLePlan }`, its file, the
// names its finding carries, and whether a path of the plan holds it), however many other reds
// stand beside it, as `--update-snapshots` updates the snapshots that fail and leaves the other
// failures: a finding of one of their `gardes`, a file of their `tests`, or a file their
// `fichiers` cover, the frame's by their `gardes` alone; with <aElaguer> (a guard wrote a key of
// the debt inscribed above what it finds), the reference that covers the debt's file too. A
// finding of a guard of a reference of the project on a file of the plan its `fichiers` do not
// cover is no output it generates, but the code of the lot: the developpeur's (BPScript 320.10,
// a word of library in the code of 030-binder).
export function referencesDesRouges(ctx, lieux, aElaguer = false) {
  const sien = (r, { fichier: f, gardes, dansLePlan: plan = false }) =>
    (gardes.some(g => r.gardes.includes(g)) &&
      (r.cadre || !f || !plan || couvertPar(r.fichiers, f))) ||
    (!r.cadre && Boolean(f) && (r.tests.includes(f) || couvertPar(r.fichiers, f)));
  return lesReferences(ctx).filter(
    r => lieux.some(l => sien(r, l)) || (aElaguer && couvertPar(r.fichiers, DETTE))
  );
}

// The regeneration of the references named <noms> (4.2), as make remakes a target and then the
// targets that depend on its outputs: the copy kept as a lot on the one the last review read (or
// HEAD), each command run on the whole copy, in their order; a reference that reads (`lit`) a file
// another one has just written runs after it, once for each reference whose writing calls for it;
// then the copy kept again on that lot. `{ texte, regenerees, fichiers, restreinte }`: the report,
// the names of the references changed, the files changed, and the range of the final pass that
// follows (null when nothing changed: no pass plays again, and the reds stand); <suite>, the
// regeneration the checks of the plan call for: `controles`, beside other reds, the checks of the
// plan follow, on the regenerated tree; `passe`, without, the final pass that is due follows,
// on the band of the lot; null after a final pass. A file a reference writes follows from the lot, as
// the output of a genrule, without a word of the plan, and the reviewer reads its difference; a
// file changed that none of the references run declares, or a command that fails (a reference of
// the project at another code than 0, one of the frame on a real failure alone) restores the copy
// as it was and stops at « references », each deviation in its question. With <refusAuLot>, the
// pass that called for it (the checks of the plan or the final pass) carries reds of the plan: a command of the project that refuses
// (another code than 0, no real failure), its only deviation, judges the lot, as a ceiling that
// never rises refuses a lot beyond it; the copy restored, `{ refus }` gives the report of each
// refusal with the end of its output, for the developpeur (BPScript 320.10).
export function regenerer(
  ctx,
  { noms, notes = [], suite = null, refusAuLot = false, avant: gardee = null }
) {
  // The notes of the debt, in a file of the run, which the command that lowers it reads.
  const fichierDesNotes = path.join(ctx.base.dossier, 'dette-a-abaisser.json');
  const toutes = lesReferences(ctx).map(r =>
    r.abaisser
      ? { ...r, commande: generateur('dette.mjs', '--abaisser', JSON.stringify(fichierDesNotes)) }
      : r
  );
  const aJouer = toutes.filter(r => noms.includes(r.nom));
  if (aJouer.some(r => r.abaisser)) {
    writeFileSync(fichierDesNotes, `${JSON.stringify(notes)}\n`);
  }
  // The copy kept before the regeneration (<gardee>, taken by its caller, or now): the regeneration
  // starts by restoring the copy to it, so that an attempt played again after one cut short
  // starts from the same copy.
  const avant = gardee ?? leLotGarde(ctx).lot;
  if (avant) {
    restaurerLaCopie(ctx, avant.commit);
  }
  if (!avant) {
    throw new Arret(
      'references',
      'Le circuit ne garde pas la copie avant la régénération des références (git échoue).'
    );
  }
  // The command of a reference of the frame is judged by what it writes, then by the pass that
  // follows, never by its code, which also judges the reds it leaves (`npm run api` refuses beside
  // them): a real failure alone counts; a reference of the project, by its code.
  const refs = [];
  const echecs = [];
  // The refusals of the commands of the project, each its line and the end of its output.
  const refus = [];
  const appelees = new Set();
  let arbre = avant.arbre;
  while (aJouer.length) {
    const r = aJouer.shift();
    const x = commandeDeReference(ctx, r.commande);
    if (!refs.includes(r)) {
      refs.push(r);
    }
    if (x.panne || (!r.cadre && x.code !== 0)) {
      const ligne = `- ${r.nom} : \`${r.commande}\` rend le code ${x.code}${x.panne ? ' (une panne)' : ''}.`;
      echecs.push(ligne);
      if (!x.panne) {
        refus.push([ligne, '', fin(x.sortie.trimEnd(), 30)].join('\n'));
      }
    }
    // The references that read a file this command wrote run after it.
    const suivant = arbreDeLaCopie(ctx);
    const ecrits = suivant ? differenceDesLots(ctx, arbre, suivant) : [];
    arbre = suivant ?? arbre;
    for (const s of toutes) {
      const appel = `${r.nom}\0${s.nom}`;
      if (s === r || appelees.has(appel) || !ecrits.some(f => couvertPar(s.lit, f))) {
        continue;
      }
      appelees.add(appel);
      if (!aJouer.includes(s)) {
        aJouer.push(s);
      }
    }
  }
  const apres = garderLeLot(ctx, avant.commit);
  const fichiers = apres ? differenceDesLots(ctx, avant.commit, apres.commit) : [];
  const siens = r => fichiers.filter(f => couvertPar(r.fichiers, f));
  const regenerees = refs.filter(r => siens(r).length);
  const horsDeclaration = fichiers.filter(f => !refs.some(r => couvertPar(r.fichiers, f)));
  const ecarts = [
    ...echecs,
    ...(!apres ? ['- Le circuit ne garde pas la copie après la régénération (git échoue).'] : []),
    ...horsDeclaration.map(f => `- ${f} change, et aucune référence régénérée ne l'écrit.`),
  ];
  if (ecarts.length) {
    restaurer(ctx, avant.commit, fichiers);
    if (refusAuLot && refus.length === ecarts.length) {
      return { refus };
    }
    const difference =
      apres && fichiers.length
        ? [
            `La différence, avant d'être rendue : \`git diff ${avant.commit} ${apres.commit}\`, dans la copie du ticket.`,
          ]
        : [];
    throw new Arret(
      'references',
      [
        `La régénération des références, sur la copie entière, s'arrête ; la copie est rendue telle qu'avant elle. Le superviseur fait corriger la référence ou le lot qui cause l'écart (\`--depuis developpeur --contexte <texte>\`), ou \`--reprendre\` une fois la cause levée.`,
        '',
        ...ecarts,
        '',
        ...difference,
        `Le journal du ticket : ${ctx.journal}`,
      ].join('\n'),
      {
        piece: [...ecarts, ...difference].join('\n'),
        question: `Les écarts de la régénération :\n${ecarts.join('\n')}`,
      }
    );
  }
  if (!fichiers.length) {
    return {
      texte: `La régénération (${refs.map(r => `${r.nom}, \`${r.commande}\``).join(' ; ')}) ne change aucun fichier : ${
        suite === 'passe'
          ? 'la passe finale juge le lot tel quel'
          : suite === 'controles'
            ? 'les contrôles ne rejouent pas, et leurs rouges restent, chacun à son propriétaire'
            : 'aucune passe ne rejoue, et les rouges de la passe finale restent, chacun à son propriétaire'
      }.`,
      regenerees: [],
      fichiers,
      restreinte: null,
    };
  }
  return {
    texte: [
      `Les références régénérées sur la copie entière : ${regenerees.map(r => r.nom).join(', ')} ; le lot porte leurs fichiers, puis ${
        suite === 'controles'
          ? "les contrôles du plan, sur l'arbre régénéré"
          : suite === 'passe'
            ? 'la passe finale'
            : "la passe finale restreinte à ce qu'elles changent"
      }.`,
      '',
      ...regenerees.map(r => `- ${r.nom} (\`${r.commande}\`) : ${siens(r).join(', ')}`),
      '',
      `La différence : \`git diff ${avant.commit} ${apres.commit}\`, dans la copie du ticket.`,
    ].join('\n'),
    regenerees: regenerees.map(r => r.nom),
    fichiers,
    restreinte: { avant: avant.commit, apres: apres.commit },
  };
}

// The copy of <ctx> restored to the commit <commit> of a lot kept: each file that differs between
// that commit and the copy as it stands (`arbreDeLaCopie`, its files git does not track included)
// takes its version there, or goes when the commit does not hold it. A copy that is that lot changes
// nothing.
export function restaurerLaCopie(ctx, commit) {
  const arbre = arbreDeLaCopie(ctx);
  if (arbre) {
    restaurer(ctx, commit, differenceDesLots(ctx, commit, arbre));
  }
}

// The environment of a pass of the circuit (the proof, the checks, the final pass, a command of a
// reference): <base>, the launcher's under the lock of the machine, with the tools of the project
// (`ctx.outils`, `grillhouse.outils`) and its data (`ctx.donnees`, `grillhouse.donnees`), read at
// the launch, whatever <base> holds, then <env>.
export const environnementDeLaPasse = (ctx, base, env = {}) => ({
  ...avecLesDonnees(ctx.donnees ?? {}, avecLesOutils(ctx.outils ?? {}, base)),
  ...env,
});

// One command of a reference, run by the shell at the root of the copy, out of the envelope,
// under the lock of the machine, its output added to the log: `{ code, panne, sortie }`, its exit
// code, whether it failed for real, whatever it judges (the command not found or not executable,
// 126, 127, as the shell says it; killed by a signal, the shell's 128 + its number; or the lock of
// the machine not taken), and what it wrote to the log. It runs in the environment of a pass
// (`environnementDeLaPasse`).
function commandeDeReference(ctx, commande) {
  entete(ctx, 'references');
  appendFileSync(ctx.journal, `$ ${commande}\n`);
  const debut = statSync(ctx.journal).size;
  const sortie = () => readFileSync(ctx.journal).subarray(debut).toString('utf8');
  const fd = openSync(ctx.journal, 'a');
  try {
    const r = avecLaMachineEtUnePlace(
      env =>
        spawnSync('sh', ['-c', commande], {
          cwd: ctx.copie,
          stdio: ['ignore', fd, fd],
          env: environnementDeLaPasse(ctx, env),
        }),
      {
        racine: ctx.copie,
        dire: l => appendFileSync(ctx.journal, `${l}\n`),
        ticket: ctx.ticket,
        sorte: etapeDuCircuit({ etape: 'references' }).titre,
      }
    );
    const code = r.status ?? 1;
    return {
      code,
      panne:
        r.signal !== null || r.error !== undefined || code === 126 || code === 127 || code > 128,
      sortie: sortie(),
    };
  } catch (e) {
    if (!(e instanceof AttenteDeLaMachine)) {
      throw e;
    }
    appendFileSync(ctx.journal, `${e.message}\n`);
    return { code: e.code, panne: true, sortie: sortie() };
  } finally {
    closeSync(fd);
  }
}

// The files <fichiers> of the copy as the lot kept <commit> holds them, a file it does not hold
// removed; the copy's index untouched.
function restaurer(ctx, commit, fichiers) {
  for (const f of fichiers) {
    const tient = spawnSync('git', ['-C', ctx.copie, 'cat-file', '-e', `${commit}:${f}`]);
    if (tient.status === 0) {
      spawnSync('git', ['-C', ctx.copie, 'restore', `--source=${commit}`, '--worktree', '--', f]);
    } else {
      rmSync(path.join(ctx.copie, f), { force: true });
    }
  }
}

// Whether a proof of the counts <compte> passes: no file of the lot that does not load, no green
// the sheet names in `portent_le_travail` (`nommes`), and at least one red (of the lot, existing
// or of a build); the greens the sheet does not name and the ones HEAD holds are accepted but prove
// nothing. Under a plan « comportement inchangé » (<inchange>), nothing has to turn red and every
// green passes: a proof passes with no file of the lot that does not load, its reds going to the
// developpeur.
// The files of the lot that only the night plays (<misDeCote>, `separerLesFichiersDuJour`) are no
// part of the proof: the red proves the behaviour the ticket develops, and a bench or a night test
// is neither required red nor a cause of refusal. A lot whose only test files are those passes.
// With the code of the behaviour already in the copy (<codePresent>, `codeDejaPresent`), no test
// can turn red: the proof abstains the same way, a lot that holds a red keeps its verdict.
export function preuveReussie(
  { fichiers, rouges, casses, nommes, misDeCote = 0 },
  { inchange, codePresent = false }
) {
  if (casses > 0) {
    return false;
  }
  if (inchange || codePresent) {
    return true;
  }
  if (nommes > 0) {
    return false;
  }
  if (fichiers === 0 && rouges === 0 && misDeCote > 0) {
    return true;
  }
  return rouges > 0;
}

// The files <fichiers> of the lot, in the copy, split into the ones the day plays (`jour`) and the
// ones only the night plays (`misDeCote`: a night test, a bench, a time witness), by each module's
// own definition (`horsDuJour` of the join); the order of the lot kept.
export function separerLesFichiersDuJour(ctx, fichiers) {
  const langage = langageDe(ctx.copie);
  const jour = [];
  const misDeCote = [];
  for (const f of fichiers) {
    (langage.horsDuJour(f, ctx.copie) ? misDeCote : jour).push(f);
  }
  return { jour, misDeCote };
}

// The lines of the section of the report of the proof that names the files <fichiers> put aside;
// none for none.
export const sectionMisDeCote = fichiers =>
  fichiers.length
    ? [
        `Mis de côté (joués par la nuit seule) (${fichiers.length}) :`,
        ...fichiers.map(f => `- ${f}`),
        '',
      ]
    : [];

// The integration of the lot: its two patches, its message and the references that write files in
// full (`--references`, from `lesReferences`, the one list), written from the copy, then
// scripts/integration/integrer.mjs from the main tree, its output added to the log. A run « à
// repasser » (75) plays once more, the gesture `rejeu`. `{ code, sortie, args }`.
export function integrer(ctx) {
  // A lot already committed: its ticket is labelled `en-file` (scripts/integration/integrer.mjs)
  // until the queue takes it off, as a job of a CI keyed by its commit is not run twice. The
  // integration plays again without a second commit.
  const branche = `agent/${ctx.ticket}`;
  const show = ctx.bd('show', ctx.ticket, '--json');
  const etiquettes = show.status === 0 ? (JSON.parse(show.stdout)[0]?.labels ?? []) : [];
  if (etiquettes.includes('en-file')) {
    const sortie = `la branche ${branche} est déjà en file : le lot est déjà commité, aucun second commit.\n`;
    appendFileSync(ctx.journal, sortie);
    return { code: 0, sortie, args: [], commande: `node ${INTEGRER}`, deja: true };
  }
  const { tests, code } = fichiersDuLot(ctx);
  const dansCopie = (...a) =>
    spawnSync('git', ['-C', ctx.copie, ...a], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  // Each file against HEAD, a new one against nothing: the index of the copy is not written.
  const patch = fichiers =>
    fichiers
      .map(f =>
        dansCopie('cat-file', '-e', `HEAD:${f}`).status === 0
          ? dansCopie('diff', '--binary', 'HEAD', '--', f).stdout
          : dansCopie('diff', '--no-index', '--binary', '/dev/null', f).stdout
      )
      .join('');
  const args = ['--ticket', ctx.ticket];
  for (const [option, fichiers] of [
    ['--tests', tests],
    ['--code', code],
  ]) {
    if (!fichiers.length) {
      continue;
    }
    const f = path.join(ctx.tmp, `${option.slice(2)}.patch`);
    writeFileSync(f, patch(fichiers));
    args.push(option, f);
  }
  const message = path.join(ctx.tmp, 'message');
  writeFileSync(message, messageDeCommit(ctx));
  args.push('--message', message);
  // The project's generated files, the integration reads from the main tree itself.
  const entieres = lesReferences(ctx)
    .filter(r => r.cadre && r.entiers.length)
    .map(({ nom, commande, fichiers, lit, entiers, cadre }) => ({
      nom,
      commande,
      fichiers,
      lit,
      entiers,
      cadre,
    }));
  if (entieres.length) {
    const f = path.join(ctx.tmp, 'references.json');
    writeFileSync(f, `${JSON.stringify(entieres)}\n`);
    args.push('--references', f);
  }
  let r;
  for (let essai = 1; essai <= 2; essai++) {
    entete(ctx, 'integration');
    appendFileSync(ctx.journal, `$ node ${INTEGRER} ${args.join(' ')}\n`);
    const x = avecLAvancementDuTravail(
      ctx.tmp,
      { racine: ctx.copie, genre: 'integration' },
      avancement =>
        spawnSync(process.execPath, [INTEGRER, ...args], {
          cwd: ctx.racine,
          encoding: 'utf8',
          maxBuffer: 256 * 1024 * 1024,
          env: { ...process.env, [AVANCEMENT]: avancement },
        })
    );
    r = {
      code: x.status ?? 1,
      sortie: `${x.stdout ?? ''}${x.stderr ?? ''}`,
      args,
      commande: `node ${INTEGRER} ${args.join(' ')}`,
    };
    appendFileSync(ctx.journal, r.sortie);
    if (r.code !== A_REPASSER) {
      break;
    }
    if (essai === 1) {
      geste(ctx, 'rejeu');
    }
  }
  return r;
}

// The tri of the discoveries of the ticket (step 5.3 of scripts/etapes.mjs), once the queue has
// brought its lot onto main, as Chromium and Mozilla give each new report a verdict before it is
// filed. Without a discovery, no session. Else one session of the explorateur out of the
// envelope, on Sonnet, in the main tree, under the rights of its role (reading, the build of a
// package, no pass), its instruction from the eighth template (the ticket, its commit on main, the
// one the queue names in the reason it closes the ticket with, `commitIntegre`, its discoveries,
// one per line, the commands its rights permit, `commandesPermises`), its sheet the tri's (`tri` of scripts/resultats.mjs): one line per discovery
// (`conformiteDuTri`), asked again once of the same session. Each verdict is written at the ticket
// of its discovery (`Circuit · tri : <verdict> — <texte> (<piece>)`), its label set there; an
// a-porter or a non-confirmee reopens under `a-valider`, the pane's list « à valider »; the others
// stay closed. The line of the tri at the ticket names each writing that failed (the verdict, the
// label, the reopening), with its error, and counts as reopened only what reopened. A tri that ends
// without a sheet that conforms leaves the discoveries as
// they are and says so at the ticket. Either way, its end is kept with the circuit's results
// (`tri`: the discoveries read, whether its sheet conformed, its verdicts by kind), which the bilan
// reads, and the working directory the queue removed at the closure, recreated for the session, is
// removed again.
export async function trier(ctx) {
  const decouvertes = decouvertesDuTicket(ctx);
  if (!decouvertes.length) {
    return;
  }
  const ids = decouvertes.map(d => d.id);
  const n = `${decouvertes.length} découverte${decouvertes.length > 1 ? 's' : ''}`;
  // The commit the queue brought onto main for this ticket, not main's last, another ticket's
  // once several circuits run.
  const show = ctx.bd('show', ctx.ticket, '--json');
  const fermeture = show.status === 0 ? (JSON.parse(show.stdout)[0]?.close_reason ?? null) : null;
  const integre = commitIntegre(fermeture);
  const commit = integre
    ? spawnSync('git', ['-C', ctx.racine, 'log', '-1', '--format=%h %s', integre], {
        encoding: 'utf8',
      }).stdout.trim()
    : '';
  mkdirSync(ctx.tmp, { recursive: true });
  let fiche = null;
  let faute = null;
  try {
    fiche = await jusquALaFiche(
      ctx,
      EXPLORATEUR,
      consigne(
        {
          depot: ctx.racine,
          ticket: ctx.ticket,
          sujet: ctx.sujet,
          commit: commit || 'inconnu',
          decouvertes: decouvertes.map(d => `- ${d.id} — ${d.sujet}`).join('\n'),
          commandes: commandesPermises(EXPLORATEUR),
        },
        7
      ),
      {
        signeDeVie: ctx.ports?.signeDeVie,
        horsEnveloppe: true,
        droits: horsDeLEnveloppe(ctx, EXPLORATEUR, 'sonnet'),
        id: idDeSeance(ctx, 'tri'),
        evenement: 'tri',
        fiche: 'tri',
        objet: 'tri',
        valider: f => conformiteDuTri(f, ids),
      }
    );
  } catch (x) {
    if (!(x instanceof Arret)) {
      throw x;
    }
    faute = premiereLigne(x.rapport);
  } finally {
    rmSync(ctx.tmp, { recursive: true, force: true });
  }
  if (!fiche) {
    inscrire(ctx, {
      role: AUTEUR_DU_CIRCUIT,
      etape: TRI,
      tri: { decouvertes: ids.length, conforme: false, verdicts: {} },
    });
    commenter(
      ctx,
      TRI,
      `le tri ne rend pas de fiche conforme (${faute}) : les ${n} restent telles quelles ; l'intégration tient.`
    );
    return;
  }
  // Each writing at a discovery's ticket: its verdict, its labels, its reopening. The line of the
  // tri, written after them, reads each one at the discovery when it is written
  // (`resume-du-tri`) and names one absent.
  const ecritures = [];
  for (const l of fiche.verdicts) {
    const rouvre = VERDICTS_ROUVERTS.includes(l.verdict);
    const verdict = `${PREFIXE}${TRI} : ${l.verdict} — ${l.texte.trim()}${l.piece ? ` (${l.piece.trim()})` : ''}${rouvre ? ' ; rouverte sous a-valider, pour le responsable.' : ''}`;
    const etiquettes = [l.verdict, ...(rouvre ? ['a-valider'] : [])];
    emettre(ctx, {
      genre: 'commentaire',
      ticket: l.decouverte,
      texte: verdict,
      auteur: AUTEUR_DU_CIRCUIT,
    });
    emettre(ctx, { genre: 'etiquettes', ticket: l.decouverte, etiquettes });
    if (rouvre) {
      emettre(ctx, { genre: 'reouverture', ticket: l.decouverte });
    }
    ecritures.push({ decouverte: l.decouverte, verdict, etiquettes, rouvre });
  }
  const verdicts = Object.fromEntries(
    VERDICTS_DU_TRI.map(v => [v, fiche.verdicts.filter(l => l.verdict === v).length]).filter(
      ([, k]) => k
    )
  );
  inscrire(ctx, {
    role: AUTEUR_DU_CIRCUIT,
    etape: TRI,
    tri: { decouvertes: ids.length, conforme: true, verdicts },
  });
  emettre(ctx, {
    genre: 'resume-du-tri',
    ticket: ctx.ticket,
    debut: `${PREFIXE}${TRI} : ${n} triée${decouvertes.length > 1 ? 's' : ''} — ${Object.entries(
      verdicts
    )
      .map(([v, k]) => `${k} ${v}`)
      .join(', ')}`,
    ecritures,
  });
}

// The commit the queue names in the reason of a ticket it closes (`intégré : <commit>`,
// scripts/integration/file.mjs), or null for another reason.
export function commitIntegre(raison) {
  const r = String(raison ?? '');
  return r.startsWith(INTEGRE) ? r.slice(INTEGRE.length).trim().split(' ')[0] || null : null;
}

// The type of a conventional commit for the ticket's type in Beads; `feat` for any other.
const TYPES_DE_COMMIT = { bug: 'fix', chore: 'chore', docs: 'docs' };

// The commit message of the lot: `<type>(<paquets>): <sujet> (<ticket>)`, the packages of the
// plan by their name; then the message the sheets of the developpeur and of the reviewer give, in
// their order, written once from the final state (`messageDuLot`).
function messageDeCommit(ctx) {
  const liste = composantsDe(existsSync(ctx.copie) ? ctx.copie : ctx.racine);
  const noms = ctx.paquets.flatMap(c => {
    const nom = liste.find(p => p.dossier === c)?.pkg.name;
    return nom ? [nom] : c === '.' ? [] : [path.basename(c)];
  });
  const type = TYPES_DE_COMMIT[ctx.type] ?? 'feat';
  const portee = noms.length ? `(${noms.join(',')})` : '';
  return messageDuLot({
    entete: `${type}${portee}: ${ctx.sujet} (${ctx.ticket})`,
    description: leTicket(ctx).description,
    fiches: lesFiches(ctx)
      .filter(e => e.role === 'developpeur' || e.role === 'relecteur')
      .map(e => e.fiche),
  });
}

// The commit message of a lot, written once from its final state, as a change merged on Gerrit
// carries the one description of its last patch set: <entete>, the title of the ticket; the
// section of the criteria of the plan <description> (its heading begins with « Critères »), what
// the lot changes; a paragraph per deviation the sheets <fiches> carry (`ecarts`), each subject
// once, in the order it first appears, with the value of the last sheet that carries it (a
// subject known again whatever its case and spacing); then the trailer.
export function messageDuLot({ entete, description, fiches }) {
  const criteres = [];
  let dedans = false;
  for (const ligne of String(description ?? '').split('\n')) {
    const m = /^##\s+(.*)$/.exec(ligne);
    if (m) {
      dedans = /^Critères\b/.test(m[1].trim());
    } else if (dedans) {
      criteres.push(ligne);
    }
  }
  const cle = sujet => sujet.toLocaleLowerCase('fr').replace(/\s+/g, ' ').trim();
  const ecarts = new Map();
  for (const e of fiches.flatMap(f => f.ecarts ?? [])) {
    const sujet = ecarts.get(cle(e.sujet))?.sujet ?? e.sujet.trim();
    ecarts.set(cle(e.sujet), { sujet, texte: e.texte.trim() });
  }
  return [
    entete,
    criteres.join('\n').trim(),
    ...[...ecarts.values()].map(e => `${e.sujet} : ${e.texte}`),
    'Co-Authored-By: Claude <noreply@anthropic.com>',
  ]
    .filter(Boolean)
    .join('\n\n')
    .concat('\n');
}

// The files the copy changes against its HEAD: [{ fichier, supprime }], relative to the copy.
function changements(ctx) {
  const r = spawnSync(
    'git',
    ['-C', ctx.copie, 'status', '--porcelain', '-z', '--untracked-files=all'],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) {
    return [];
  }
  const entrees = r.stdout.split('\0');
  const out = [];
  for (let i = 0; i < entrees.length; i++) {
    const e = entrees[i];
    if (e.length < 4) {
      continue;
    }
    const xy = e.slice(0, 2);
    out.push({ fichier: e.slice(3), supprime: xy.includes('D') });
    // A rename or a copy names its source next.
    if (xy.includes('R') || xy.includes('C')) {
      i++;
    }
  }
  return out;
}

// Whether the testwriter writes <fichier> of the copy: the rule of a test file of the module of its
// language (`estUnTest`, scripts/jointure.d.ts).
const duTestwriter = (ctx, fichier) => langageDe(ctx.copie).estUnTest(fichier, ctx.copie) !== null;

// The test files of the lot that the testwriter writes, present in the copy: in the packages of
// the plan and in the shared test material.
export function testsDuLot(ctx) {
  return changements(ctx)
    .filter(c => !c.supprime)
    .map(c => c.fichier)
    .filter(f => langageDe(ctx.copie).estUnTest(f, ctx.copie)?.joue)
    .sort();
}

// The package directory of the copy that holds <fichier>, or « . ».
function paquetDe(liste, fichier) {
  const p = liste.find(({ dossier }) => `${fichier}`.startsWith(`${dossier}${path.sep}`));
  return p ? p.dossier : '.';
}

// One npm command in the copy, under <env> added to the circuit's environment, its results written
// to a directory of its own (RESULTATS, scripts/resultats.mjs: the summaries of Turborepo, the
// JSON reports of Vitest, the SARIF of the guards), its output added to the log for the human:
// `{ code, dossier }`. The circuit reads its results, never its output. A heavy pass (the final
// pass, `npm run verifier`) holds the lock of the machine (scripts/verrou-de-machine.mjs) and
// passes it to the `npm run verifier` it runs, on a place of the machine taken first
// (`avecLaMachineEtUnePlace` of scripts/places-de-la-machine.mjs); a targeted one (the proof of the
// red, the checks on the tests of the ticket) takes a place like a session of an agent
// (scripts/passe-de-la-machine.mjs); its wait is written to the log. A wait that stops (its bound,
// 75; a lock held by an ancestor or a server of the places that does not answer, 1) is the
// command's code, its message in the log. Once it holds the lock, the pass plays under a
// progress directory of its own (`avancement`), of the kind `genreDeLaPasse` names. It plays in
// the environment of a pass (`environnementDeLaPasse`).
function npm(ctx, etape, args, env = {}, cwd = ctx.copie) {
  entete(ctx, etape);
  const dossier = mkdtempSync(path.join(ctx.base.dossier, 'resultats-'));
  const prefixe = Object.entries(env).map(([k, v]) => `${k}=${v} `);
  appendFileSync(ctx.journal, `$ ${prefixe.join('')}npm ${args.join(' ')}\n`);
  const fd = openSync(ctx.journal, 'a');
  try {
    const finale = etape === 'controles' && args[1] === 'verifier';
    const lourde = passeLourde({ etape, args });
    const r = avecLaPasse(
      envMachine =>
        avecLAvancementDuTravail(
          ctx.tmp,
          { racine: ctx.copie, genre: genreDeLaPasse(ctx, etape, args) },
          avancement => {
            const oublier = nommerLAvancement({ env: envMachine, dossier: avancement });
            try {
              // A targeted pass plays on its share of the cores under nice and ionice; a heavy one
              // keeps every core.
              const lancement = lancementDeLaPasse({
                lourde,
                cmd: 'npm',
                args,
                env: environnementDeLaPasse(ctx, envMachine, {
                  ...env,
                  [RESULTATS]: dossier,
                  [AVANCEMENT]: avancement,
                  ...(args[0] === 'test' ? { [DEPUIS_LE_VERT]: '1' } : {}),
                }),
              });
              return spawnSync(lancement.cmd, lancement.args, {
                cwd,
                stdio: ['ignore', fd, fd],
                env: lancement.env,
              });
            } finally {
              oublier();
            }
          }
        ),
      {
        lourde,
        env: process.env,
        racine: ctx.copie,
        dire: l => appendFileSync(ctx.journal, `${l}\n`),
        ticket: ctx.ticket,
        rang: ctx.rang ?? undefined,
        sorte: etapeDuCircuit({ etape, finale })?.titre ?? etape,
      }
    );
    return { code: r.status ?? 1, dossier };
  } catch (e) {
    if (!(e instanceof AttenteDeLaMachine)) {
      throw e;
    }
    appendFileSync(ctx.journal, `${e.message}\n`);
    return { code: e.code, dossier };
  } finally {
    closeSync(fd);
  }
}

// The kind of an automatic pass, by which its total is kept from one pass to the next
// (scripts/avancement.mjs): its step (the checks once final, the final pass) and its command
// without the test files and the filters, which move from one lot to the next.
function genreDeLaPasse(ctx, etape, args) {
  const commande = args.filter(
    a => !langageDe(ctx.copie).estUnTest(a, ctx.copie)?.joue && !a.startsWith('--filter=')
  );
  return etape === 'controles' && args[1] === 'verifier'
    ? ['passe finale', ...commande].join(' ')
    : [etape, ...commande].join(' ');
}

// Removes from the copy each sibling of HEAD's version a killed process left there, between its
// writing and its removal (`avecLesVersionsDAvant`): a file git does not track, the sibling, by
// the name the module of its language gives (`soeurDAvant` of the join, a file beside its own:
// TypeScript's alone, Rust and Python play HEAD's version in a tree), of a file of its folder that
// git tracks and that exists, each named in the ticket's log. A file git tracks, or whose file is
// absent, is left. What the module reads at a cost is read once for the sweep (`avecUneLecture`,
// ./lecture-unique.mjs), whatever the number of files. Returns the siblings removed, from the
// copy, sorted.
export function balayerLesSoeurs(ctx) {
  return avecUneLecture(() => balayer(ctx));
}

// The sibling of HEAD's version of <f> by the module of its language, null for a module that
// names none (Rust, Python).
function soeurDe(langage, f, racine) {
  return typeof langage.soeurDAvant === 'function' ? langage.soeurDAvant(f, racine) : null;
}

// Whether HEAD's version of <f> plays in a tree of its own, by the module of its language.
function arbreDe(langage, f, racine) {
  return typeof langage.arbreDAvant === 'function' && langage.arbreDAvant(f, racine) === true;
}

// The sweep of `balayerLesSoeurs`, in its scope of readings done once.
function balayer(ctx) {
  const git = (...a) =>
    spawnSync('git', ['-C', ctx.copie, ...a], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const r = git('ls-files', '-z', '--others', '--exclude-standard');
  if (r.status !== 0) {
    return [];
  }
  const parDossier = new Map();
  for (const f of r.stdout.split('\0').filter(Boolean)) {
    const d = path.posix.dirname(f);
    parDossier.set(d, [...(parDossier.get(d) ?? []), f]);
  }
  const langage = langageDe(ctx.copie);
  const retirees = [];
  for (const [dossier, nonSuivis] of parDossier) {
    const suivis = git('ls-files', '-z', ...(dossier === '.' ? [] : ['--', `${dossier}/`]));
    const soeurs = new Set(
      suivis.stdout
        .split('\0')
        .filter(f => f && path.posix.dirname(f) === dossier)
        .filter(f => existsSync(path.join(ctx.copie, f)))
        .map(f => soeurDe(langage, f, ctx.copie))
        .filter(n => n !== null)
    );
    for (const f of nonSuivis.filter(n => soeurs.has(n))) {
      rmSync(path.join(ctx.copie, f), { force: true });
      retirees.push(f);
      if (ctx.journal) {
        appendFileSync(ctx.journal, `sœur de la version de HEAD laissée, retirée : ${f}\n`);
      }
    }
  }
  return retirees.sort();
}

// What a tree of HEAD's version leaves out of the copy: the history, the builds, the installed
// dependencies, none of which a test reads as its own file.
const HORS_DE_L_ARBRE = new Set(['.git', 'target', 'node_modules', '.venv']);

// Removes from the temporary directory of the ticket each tree of HEAD's version (`avant-<pid>-*`)
// whose owner, the process that built it, no longer lives: a circuit killed between the building
// and the removal (`avecLesVersionsDAvant`) leaves one, no `finally` having played. A tree of a
// live process is left.
function balayerLesArbres(ctx) {
  if (!existsSync(ctx.tmp)) {
    return;
  }
  for (const nom of readdirSync(ctx.tmp)) {
    // The name is written by `batirLArbre`: `avant-`, the pid, `-`, the suffix of mkdtemp.
    const [prefixe, pid] = nom.split('-');
    if (prefixe !== 'avant' || !Number.isInteger(Number(pid)) || Number(pid) <= 0) {
      continue;
    }
    try {
      process.kill(Number(pid), 0);
      continue;
    } catch (e) {
      if (e.code === 'EPERM') {
        continue;
      }
    }
    rmSync(path.join(ctx.tmp, nom), { recursive: true, force: true });
  }
}

// Builds under the temporary directory of the ticket the tree of HEAD's version of <f>: the copy
// (the code of the lot included), without `.git`, `target`, `node_modules` and `.venv`, where <f>
// alone holds <texte>, HEAD's text, under its own name. Returns its root.
function batirLArbre(ctx, f, texte) {
  const racine = mkdtempSync(path.join(ctx.tmp, `avant-${process.pid}-`));
  try {
    cpSync(ctx.copie, racine, {
      recursive: true,
      filter: src =>
        src === ctx.copie ||
        (!HORS_DE_L_ARBRE.has(path.basename(src)) && path.resolve(src) !== path.resolve(ctx.tmp)),
    });
    writeFileSync(path.join(racine, f), texte);
  } catch (e) {
    rmSync(racine, { recursive: true, force: true });
    throw e;
  }
  return racine;
}

// Runs <jouer> with HEAD's version of each file of <fichiers> that HEAD holds, where the module
// of its language puts it: a sibling written beside the file in the copy (`soeurDAvant` of the
// join: TypeScript, whose tool plays it in the same run), swept first (`balayerLesSoeurs`) and
// removed after the run, a red included; or a tree of its own (`arbreDAvant` of the join: Rust,
// Python), the copy's with that file alone replaced by its version of HEAD, under its own name, in
// the temporary directory of the ticket (`batirLArbre`), removed after the run, a red included,
// the copy getting no file. <jouer> gets the Map file → sibling (from the copy), the Map file →
// names of the tests of HEAD's version, read without playing them, of each file its tool cannot
// play twice (`testsDeHead` of the join), and the Map file → `{ racine, env }`, the root of its
// tree and the environment it plays under (`envDArbre` of the join). With <sansArbres>, no tree
// is built: the names of HEAD's tests of each file that would have one are read too. Returns
// what <jouer> returns.
export function avecLesVersionsDAvant(ctx, fichiers, jouer, { sansArbres = false } = {}) {
  balayerLesSoeurs(ctx);
  balayerLesArbres(ctx);
  return avecUneLecture(() => {
    const avant = new Map();
    const lus = new Map();
    const arbres = new Map();
    const deHead = f => {
      const r = spawnSync('git', ['-C', ctx.copie, 'show', `HEAD:${f}`], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      });
      return r.status === 0 ? r.stdout : null;
    };
    try {
      const langage = langageDe(ctx.copie);
      for (const f of fichiers) {
        const soeur = soeurDe(langage, f, ctx.copie);
        if (soeur !== null) {
          const texte = deHead(f);
          if (texte === null) {
            continue;
          }
          writeFileSync(path.join(ctx.copie, soeur), texte);
          avant.set(f, soeur);
          continue;
        }
        if (arbreDe(langage, f, ctx.copie) && !sansArbres) {
          const texte = deHead(f);
          if (texte === null) {
            continue;
          }
          const env =
            typeof langage.envDArbre === 'function' ? langage.envDArbre(f, ctx.copie) : {};
          arbres.set(f, { racine: batirLArbre(ctx, f, texte), env });
          continue;
        }
        const noms = langage.testsDeHead(f, ctx.copie, deHead);
        if (noms !== null) {
          lus.set(f, noms);
        }
      }
      return jouer(avant, lus, arbres);
    } finally {
      for (const soeur of avant.values()) {
        rmSync(path.join(ctx.copie, soeur), { force: true });
      }
      for (const { racine } of arbres.values()) {
        rmSync(racine, { recursive: true, force: true });
      }
    }
  });
}

// The run of the files <groupe> of one package of the proof, HEAD's version of each beside it or
// in a tree (`avecLesVersionsDAvant`): `{ avant, lus, arbres, code, resultats, constructions }`,
// <jouer> given the files to play in the copy and the trees to play, and returning `{ code,
// resultats, constructions }`. A tree that does not compile is not a red of the lot (the owner's
// decision on grillhouse-3e2.2): when the build fails with trees, the package plays again without
// them, and when the lot alone builds, that run is kept, the names of HEAD's tests of those files
// read without playing them; a build the lot alone breaks stays a red, the first run kept.
export function jouerAvecLesVersionsDAvant(ctx, groupe, jouer) {
  const avecArbres = avecLesVersionsDAvant(ctx, groupe, (avant, lus, arbres) => ({
    avant,
    lus,
    arbres,
    ...jouer([...groupe, ...avant.values()], arbres),
  }));
  if (avecArbres.arbres.size === 0 || avecArbres.constructions.length === 0) {
    return avecArbres;
  }
  const sansArbres = avecLesVersionsDAvant(
    ctx,
    groupe,
    (avant, lus, arbres) => ({
      avant,
      lus,
      arbres,
      ...jouer([...groupe, ...avant.values()], arbres),
    }),
    { sansArbres: true }
  );
  return sansArbres.constructions.length === 0 ? sansArbres : avecArbres;
}

// The log of the task <t> of a summary of Turborepo, its file from the root of the copy: its path,
// and its first lines, the task's own output.
function journalDeTache(ctx, t) {
  if (!t.journal) {
    return { chemin: null, debut: '' };
  }
  const chemin = path.join(ctx.copie, t.journal);
  return { chemin, debut: sansCouleurs(lire(chemin)).trim().split('\n').slice(0, 80).join('\n') };
}

// Runs <jouer> with the installed dependencies of the copy (`node_modules` of its root) linked in
// the tree <racine>, which carries none, so that its tool (npm) starts there; the link goes after
// the run, a red included.
function avecLesDependancesDeLaCopie(ctx, racine, jouer) {
  const source = path.join(ctx.copie, 'node_modules');
  const lien = path.join(racine, 'node_modules');
  if (!existsSync(source) || existsSync(lien)) {
    return jouer();
  }
  symlinkSync(source, lien);
  try {
    return jouer();
  } finally {
    rmSync(lien, { force: true });
  }
}

// The measure of the proof of the red: one run per package, `npm test -- --force <files>` of the
// lot that lie in it, HEAD's version of each beside it or in a tree of its own, played again
// without the trees when they alone break the build (`jouerAvecLesVersionsDAvant`), or, with no
// file of the lot, `npm test -- <package>` for each package of the plan, played whole. Each run
// `{ groupe, entier, avant, lus, arbres, code, resultats, constructions }`. A measure on the same tree (the copy's fingerprint, `empreinte`) is
// not played again, as Turborepo replays a task whose inputs did not move: the last one, <derniere>,
// its caller keeps. `{ cle, runs }`, each map of a run (`avant`, `lus`, `arbres`) an object.
function mesureDeLaPreuve(ctx, liste, fichiers, derniere = null) {
  const cle = empreinte(ctx, ['.']);
  if (derniere?.cle === cle) {
    return derniere;
  }
  const entiers = fichiers.length ? [] : paquetsDuPlan(ctx, liste);
  const groupes = new Map(entiers.map(d => [d, []]));
  for (const f of fichiers) {
    const p = paquetDe(liste, f);
    groupes.set(p, [...(groupes.get(p) ?? []), f]);
  }
  const runs = [];
  for (const [dossier, groupe] of groupes) {
    const entier = entiers.includes(dossier);
    // The files of the lot play for real (`--force`): a run replayed from Turborepo's cache, the
    // checks' same command on the same inputs, writes no report of Vitest.
    const run = jouerAvecLesVersionsDAvant(ctx, groupe, (aJouer, arbres) => {
      // The copy plays the files of the lot; each tree plays its one file, HEAD's version, in its
      // own root, under its own environment, as the copy's tool plays it.
      const passes = [
        npm(ctx, 'preuve', ['test', '--', ...(entier ? [dossier] : ['--force']), ...aJouer]),
        ...[...arbres].map(([f, arbre]) =>
          avecLesDependancesDeLaCopie(ctx, arbre.racine, () =>
            npm(ctx, 'preuve', ['test', '--', '--force', f], arbre.env, arbre.racine)
          )
        ),
      ];
      return {
        code: passes.find(r => r.code !== 0)?.code ?? 0,
        resultats: passes.flatMap(r => langageDe(ctx.copie).verdict(r.dossier).rapports),
        // The builds of the plan's packages that failed: each one a red, not compiling is failing.
        constructions: passes.flatMap(r => constructionsEchouees(ctx, liste, r.dossier)),
      };
    });
    // Its maps as objects, so that the measure is a plain object, which its caller keeps.
    runs.push({
      groupe,
      entier,
      ...run,
      avant: Object.fromEntries(run.avant),
      lus: Object.fromEntries(run.lus),
      arbres: Object.fromEntries(run.arbres),
    });
  }
  return { cle, runs };
}

// The green tests of HEAD's version of the file <f> of the lot, by their full name: those of the
// report of its sibling (`avant`, file → sibling, from the copy <copie>) or of its tree (`arbres`,
// file → `{ racine }`, the file there at the same path: the copy's by the change of root alone)
// in the results <resultats> of the run (`verdict` of the join), or, for a file played in neither,
// the names of its tests read in HEAD's version (`lus`, file → names), each held green, as main
// stays green; empty for a file HEAD does not hold.
export function vertsDeHead(resultats, copie, f, avant, lus = new Map(), arbres = new Map()) {
  if (lus.has(f)) {
    return new Set(lus.get(f));
  }
  const soeur = avant.has(f)
    ? path.join(copie, avant.get(f))
    : arbres.has(f)
      ? path.join(arbres.get(f).racine, f)
      : null;
  return new Set(
    (resultats.find(t => soeur !== null && t.fichier === soeur)?.tests ?? [])
      .filter(a => a.etat === 'passed')
      .map(a => a.nom)
  );
}

// The full name of a test <nom> with each separator between a group and what it holds, « > » or
// « › » between blanks, read as the blank that Vitest's full name puts there.
const sansSeparateur = nom =>
  String(nom ?? '')
    .replace(/\s+[>›]\s+/g, ' ')
    .trim();

// The tests that carry the ticket's work, from the testwriter's sheets in their order: the list is
// replaced, not added. A sheet without the field keeps the list of the sheet before, a given list
// replaces it, and `[]` empties it (a rerun testwriter withdraws a name that way).
export const portentLeTravail = fiches =>
  fiches.filter(f => Array.isArray(f.portent_le_travail)).at(-1)?.portent_le_travail ?? [];

// The proof of the red, on every test of the lot: `{ ok, rouges, texte, resume }`, `texte` the
// report, written whole to its file beside the copy. A
// green test is a defect when the testwriter's sheets name it (`portent_le_travail`), read at
// each proof, and accepted when they do not; a test's full name is read whatever the
// separator between its group and its title, a blank, or « > » as Vitest prints it, or « › » as
// Jest and the report of the proof print it (`sansSeparateur`); the measure plays again only when
// the copy changed (`mesureDeLaPreuve`).
export function preuve(ctx, { mesure: derniere = null, fichiers: seuls = null } = {}) {
  // Only the files of the day are proved; the ones only the night plays are put aside, named.
  // Resumed at a red (<seuls>, the files it names), the proof plays these files alone and passes
  // when they load: a test fixed is green, not red.
  const { jour: fichiers, misDeCote } = separerLesFichiersDuJour(ctx, seuls ?? testsDuLot(ctx));
  const portent = portentLeTravail(fichesDe(ctx, 'testwriter'));
  // Whether the sheet names the test <a> of the file <f>, by its full name or by its whole file.
  const nomme = (f, a) =>
    portent.some(
      v =>
        v.fichier === f &&
        (!v.test || [a.nom, a.titre].some(n => sansSeparateur(v.test) === sansSeparateur(n)))
    );
  const rouges = [];
  // The reds of the files of the lot, apart from the existing ones and the builds.
  let rougesDuLot = 0;
  const nonNommes = [];
  const nommes = [];
  const casses = [];
  const liste = composantsDe(ctx.copie).filter(p => !p.hors);
  let anciens = 0;
  const reportes = [];
  // A lot of files put aside alone plays nothing, not the packages whole.
  const mesuree =
    fichiers.length || !misDeCote.length ? mesureDeLaPreuve(ctx, liste, fichiers, derniere) : null;
  const mesure = (mesuree?.runs ?? []).map(r => ({
    ...r,
    avant: new Map(Object.entries(r.avant)),
    lus: new Map(Object.entries(r.lus)),
    arbres: new Map(Object.entries(r.arbres)),
  }));
  // A plan « comportement inchangé »: every green of the lot is expected.
  const inchange = Boolean(ctx.sorte?.inchange);
  // The developpeur already ran after the last testwriter: the code is there, no test can turn red.
  const codePresent = codeDejaPresent(ctx);
  for (const { groupe, entier, avant, lus, arbres, code, resultats, constructions } of mesure) {
    for (const { nom, erreur } of constructions) {
      if (reportes.includes(nom)) {
        continue;
      }
      rouges.push(`construction de ${nom} — ${erreur}`);
      reportes.push(nom);
    }
    // The files of a package played whole, out of the lot, which HEAD holds green: a red of theirs
    // is a regression of the lot.
    if (entier) {
      for (const res of resultats) {
        const f = path.relative(ctx.copie, res.fichier);
        if (res.tests.length === 0 && res.etat === 'failed' && !constructions.length) {
          rouges.push(
            `rouge existant : ${f} — ne se charge pas : ${premiereLigne(res.message || res.etat)}`
          );
        }
        for (const a of res.tests.filter(x => x.etat === 'failed')) {
          rouges.push(`rouge existant : ${f} › ${a.nom} — ${premiereLigne(a.message)}`);
        }
      }
    }
    for (const f of groupe) {
      const res = resultats.find(t => t.fichier === path.join(ctx.copie, f));
      const tests = res?.tests ?? [];
      const deHead = vertsDeHead(resultats, ctx.copie, f, avant, lus, arbres);
      if (constructions.length && (!res || tests.length === 0)) {
        // It cannot load before the build: it plays at the checks.
      } else if (!res) {
        casses.push(
          `${f} — ne se charge pas : non joué (code ${code}) ; le journal du ticket : ${ctx.journal}`
        );
      } else if (tests.length === 0) {
        casses.push(`${f} — ne se charge pas : ${premiereLigne(res.message || res.etat)}`);
      }
      for (const a of tests) {
        if (a.etat === 'failed') {
          rouges.push(`${f} › ${a.nom} — ${premiereLigne(a.message)}`);
          rougesDuLot++;
        } else if (a.etat === 'passed' && deHead.has(a.nom)) {
          anciens++;
        } else if (a.etat === 'passed') {
          (nomme(f, a) ? nommes : nonNommes).push(`${f} › ${a.nom}`);
        }
      }
    }
  }
  const section = (titre, l) =>
    l.length ? [`${titre} (${l.length}) :`, ...l.map(x => `- ${x}`), ''] : [];
  const ok = seuls
    ? casses.length === 0
    : preuveReussie(
        {
          fichiers: fichiers.length,
          rouges: rouges.length,
          casses: casses.length,
          nommes: nommes.length,
          nonNommes: nonNommes.length,
          anciens,
          misDeCote: misDeCote.length,
        },
        { inchange, codePresent }
      );
  const resume = `${rouges.length} rouge(s), ${nommes.length} vert(s) nommé(s) qui portent le travail, ${nonNommes.length} vert(s) non nommé(s), ${casses.length} fichier(s) qui ne se charge(nt) pas, ${anciens} test(s) vert(s) que HEAD tient déjà, laissé(s) de côté`;
  const ecrit = (...sections) =>
    [
      `${SUITE.find(e => e.etat === PREUVE).titre} : ${resume}.`,
      ...[...new Set(reportes)].map(
        nom => `Les tests de ${nom} se jouent aux contrôles, après le développeur.`
      ),
      '',
      ...(codePresent && !inchange && ok && rouges.length === 0
        ? ['Le code du développeur est déjà dans la copie : le rouge n’a rien à prouver.', '']
        : fichiers.length || rouges.length || misDeCote.length
          ? []
          : inchange
            ? [
                'Aucun fichier de test du lot : le plan dit « comportement inchangé », rien à prouver.',
                '',
              ]
            : ['Aucun fichier de test du lot dans le plan : rien ne prouve le rouge.', '']),
      ...section('Rouges', rouges),
      ...sections,
      ...(nommes.length
        ? [
            `Tests qui portent le travail, verts avant le code (${nommes.length}) :`,
            'Ta fiche les nomme dans `portent_le_travail` : un test qui porte le travail du ticket rougit d’abord ; nomme seulement ceux-là, ou écris-les pour qu’ils échouent sur le code présent.',
            ...nommes.map(x => `- ${x}`),
            '',
          ]
        : []),
      ...section('Fichiers qui ne prouvent rien', casses),
      ...sectionMisDeCote(misDeCote),
    ]
      .join('\n')
      .trim();
  let n = 1;
  while (existsSync(`${ctx.copie}.preuve-${n}.md`)) {
    n++;
  }
  const complet = `${ctx.copie}.preuve-${n}.md`;
  const texte = ecrit(
    `Le rapport entier : ${complet}`,
    '',
    ...section('Verts non nommés (acceptés sans justification)', nonNommes)
  );
  writeFileSync(complet, `${texte}\n`);
  return {
    ok,
    rouges: rouges.length,
    texte,
    resume,
    // A lot put aside alone measures nothing: the measure kept stays.
    mesure: mesuree ?? derniere,
    resultat: {
      ok,
      rouges: rouges.length,
      justifies: nonNommes.length,
      sans: nommes.length,
      casses: casses.length,
      anciens,
      vide: rougesDuLot + nonNommes.length + nommes.length + casses.length === 0,
    },
  };
}

// The builds that failed in the run whose results are under <dossier> (the summary of Turborepo,
// task `<package>#build`) of a package of the plan: `{ nom, erreur }`, `erreur` its log file and
// the beginning of its own output.
function constructionsEchouees(ctx, liste, dossier) {
  return langageDe(ctx.copie)
    .verdict(dossier)
    .taches.filter(t => t.script === 'build' && t.code !== null && t.code !== 0)
    .flatMap(t => {
      const p = liste.find(x => x.pkg.name === t.paquet);
      if (!p || !dansLePlan(ctx, p.dossier)) {
        return [];
      }
      const j = journalDeTache(ctx, t);
      return [{ nom: t.paquet, erreur: `son journal : ${j.chemin}\n\n${j.debut}\n` }];
    });
}

// The tasks of style, played per package (`<package>#lint`, `<package>#format:check`).
const STYLE = new Set(['lint', 'format:check']);

// Where <chemin> (from the root of the copy) lies: `{ dansLePlan, paquet, horsTitre }`, whether
// a path of the plan holds it, the name of the package of <liste> that holds it, and that name
// again when the plan does not hold it. A red with no path (null) is in the plan when the plan
// names « . », which holds the whole copy.
function situer(ctx, liste, chemin) {
  const dedans = chemin ? dansLePlan(ctx, chemin) : nommeLaRacine(ctx);
  const p = chemin ? liste.find(x => chemin.startsWith(`${x.dossier}/`)) : null;
  const paquet = p ? p.pkg.name : null;
  return { dansLePlan: dedans, paquet, horsTitre: dedans ? null : paquet };
}

// The reds of the check <c> (`{ args, env, code, dossier }`), read in its results: each failed
// test of the reports of Vitest, each finding of the guards' SARIF, each failed build, and each
// failed task none of those situates; a red check with none of them is one red of the command.
// Each red `{ texte, fichier, gardes, detail, dansLePlan, paquet, horsTitre, arbitrer, joue }`: the
// line that names it (test or finding, file, message), its file (null for a red of a task), the
// names its finding carries (its guard and its rule), the beginning of its task's log for a build,
// whether a path of the plan holds it (none for a red without a file), the package that holds it
// and that package again when it is out of the plan, whether it is a finding to settle
// (`a-arbitrer`), and the package whose task gave it, as Turborepo names it (« // » for the
// root's guards; null for a red of the command).
// As SARIF 2.1.0 and GitHub code scanning, a finding of level error fails, a warning or a note
// shows without failing: `{ rouges, avertissements }`, `avertissements` the lines of the findings
// of another level, which the report lists apart. A guards' task red without a finding of level
// error keeps its line of a red task, with its log.
function rougesDe(ctx, liste, c) {
  const lus = lireSarif(c.dossier).constats.filter(k => k.genre !== A_ELAGUER);
  const vert = c.code === 0 || c.code === A_REPASSER;
  const gardesDuCadre = nomsDesGardes(ctx.copie);
  const duCadre = k => gardesDuCadre.includes(k.garde);
  const rouge = k => k.niveau === 'error';
  const ligneDe = k => {
    const ou = k.fichier ? ` ${k.fichier}${k.ligne ? `:${k.ligne}` : ''}` : '';
    return `${k.garde}${ou} — ${k.message}${k.genre === 'a-arbitrer' ? ' (à arbitrer)' : ''}`;
  };
  const avertissements = lus.filter(k => !rouge(k)).map(k => `${k.niveau} ${ligneDe(k)}`);
  if (vert) {
    return { rouges: [], avertissements };
  }
  const out = [];
  const testes = new Set();
  for (const res of langageDe(ctx.copie).verdict(c.dossier).rapports) {
    const f = path.relative(ctx.copie, res.fichier);
    const lieu = situer(ctx, liste, f);
    if (res.tests.length === 0 && res.etat === 'failed') {
      out.push({
        texte: `test ${f} — ne se charge pas : ${premiereLigne(res.message)}`,
        fichier: f,
        ...lieu,
        joue: lieu.paquet,
      });
      testes.add(paquetDe(liste, f));
    }
    for (const a of res.tests.filter(x => x.etat === 'failed')) {
      out.push({
        texte: `test ${f} › ${a.nom} — ${premiereLigne(a.message)}`,
        fichier: f,
        ...lieu,
        joue: lieu.paquet,
      });
      testes.add(paquetDe(liste, f));
    }
  }
  // A key of the debt to lower (`a-elaguer`, scripts/dette.mjs) is a note, not a red.
  const constats = lus.filter(rouge);
  for (const k of constats) {
    out.push({
      texte: `constat ${ligneDe(k)}`,
      fichier: k.fichier ?? null,
      gardes: [k.garde, k.regle].filter(Boolean),
      ...situer(ctx, liste, k.fichier),
      arbitrer: k.genre === 'a-arbitrer',
      joue: '//',
    });
  }
  // The guards of the project wrote findings when one comes from a guard out of the frame's.
  const duProjet = constats.some(k => !duCadre(k));
  for (const t of langageDe(ctx.copie).verdict(c.dossier).taches) {
    if (t.code === null || t.code === 0 || t.code === A_REPASSER) {
      continue;
    }
    if (t.tests && testes.has(t.dossier)) {
      continue;
    }
    if (t.script === 'grillhouse:gardes' && constats.length) {
      continue;
    }
    if (t.script === 'gardes' && duProjet) {
      continue;
    }
    const p = liste.find(x => x.pkg.name === t.paquet);
    const lieu = p ? situer(ctx, liste, `${p.dossier}/`) : situer(ctx, liste, null);
    const j = journalDeTache(ctx, t);
    out.push({
      texte:
        t.script === 'build'
          ? `construction de ${t.paquet} — son journal : ${j.chemin}`
          : `tâche ${t.tache} rouge (code ${t.code}) — son journal : ${j.chemin}`,
      detail: t.script === 'build' ? j.debut : '',
      ...lieu,
      // A red task of style (`<package>#lint`, `<package>#format:check`) is named by its task, as
      // the plan's package that holds it: the one out of the plan reads `<package>#lint`.
      horsTitre: lieu.horsTitre && STYLE.has(t.script) ? t.tache : lieu.horsTitre,
      joue: t.paquet,
    });
  }
  if (out.length === 0) {
    out.push({
      texte: `${ligneDeCommande(c)} rouge (code ${c.code}), sans résultat qui situe son rouge — le journal du ticket : ${ctx.journal}`,
      ...situer(ctx, liste, null),
    });
  }
  return { rouges: out, avertissements };
}

const ligneDeCommande = c =>
  `${Object.entries(c.env ?? {})
    .map(([k, v]) => `${k}=${v} `)
    .join('')}npm ${c.args.join(' ')}`;

// The checks after the developpeur: those of the plan (3.1), or, when <finale>, `npm run
// verifier`, what the integration plays (4.1), restricted by <restreinte> (`{ avant, apres }`, two
// lots kept) to the packages that changed from one to the other and their dependents, with the
// root's tasks, the guards (`--filter=...[<avant>...<apres>] --filter=//`). After a regeneration,
// <reportes> (`{ rouges, rejouee }`) carries the reds of the pass before it, the final pass or the
// checks of the plan: each one in a package the pass after the regeneration does not play again
// stands, as a CI keeps the verdict of a job it does not run again; when the regeneration changes
// nothing (`rejouee` false), no command plays, and they all stand. `{ rouge, aRepasser, arbitrer, auDeveloppeur,
// texte, complet, resume, horsTitre, lieux, tous, notes, avertissements }`: `texte` the report for
// the developpeur, his reds first; `complet` every red, for a stop, and the warnings;
// `avertissements` the section of the warnings and notes of the guards, which are no reds, for the
// report of the checks (empty without one); `auDeveloppeur` whether a red lies
// in a package of the plan; `horsTitre` the packages out of the plan that hold a red; `arbitrer`
// when every red of the plan is a finding to settle; `lieux` the place of each red, `{ fichier,
// gardes, dansLePlan }`, its file (null for a red without one), the names its finding carries
// (none for a test or a task), and whether a path of the plan holds it; `references`, out of the final pass, the references whose reds the checks saw,
// which their regeneration lifts before the checks judge the lot again, or before the final pass; `tous` every red as it was read; `notes`,
// at the final pass, each key of the debt a guard wrote inscribed above what it finds, `{ garde,
// fichier, regle, trouve }`.
export function controles(ctx, finale, restreinte = null, reportes = null, fichiers = null) {
  const liste = composantsDe(ctx.copie).filter(p => !p.hors);
  // Resumed at a red in the test files <fichiers>: the final pass plays their packages alone (the
  // graph of packages of Turborepo, the root's tasks beside), the checks of the plan their tests
  // alone (Vitest plays what the files import) and the guards.
  const duReprise = fichiers
    ? [...new Set(fichiers.map(f => liste.find(p => f.startsWith(`${p.dossier}/`))?.pkg.name))]
        .filter(Boolean)
        .sort()
    : null;
  const filtres = duReprise
    ? ['--', ...duReprise.map(n => `--filter=${n}`), '--filter=//']
    : restreinte
      ? ['--', `--filter=...[${restreinte.avant}...${restreinte.apres}]`, '--filter=//']
      : [];
  const commandes =
    reportes && !reportes.rejouee
      ? []
      : finale
        ? [{ args: ['run', 'verifier', ...filtres] }]
        : commandesDuPlan(ctx, liste, fichiers);
  const resultats = commandes.map(({ args, env }) => {
    let r = npm(ctx, 'controles', args, env);
    // The 75 of verifier is final (its wait for the lock reached its bound); a command of the
    // checks plays once more, the gesture `rejeu`.
    if (r.code === A_REPASSER && !finale) {
      geste(ctx, 'rejeu');
      r = npm(ctx, 'controles', args, env);
    }
    const c = { args, env, ...r };
    return { ...c, ...rougesDe(ctx, liste, c) };
  });
  // The packages the commands played (the root's tasks under « // »), whose reds are read again.
  const joues = new Set(
    resultats.flatMap(r =>
      langageDe(ctx.copie)
        .verdict(r.dossier)
        .taches.map(t => t.paquet)
    )
  );
  const tous = [
    ...resultats.flatMap(r => r.rouges),
    ...(reportes?.rouges ?? []).filter(
      r => !reportes.rejouee || (Boolean(r.joue) && !joues.has(r.joue))
    ),
  ];
  // Out of the final pass, the reds of the plan are the developpeur's; a red of a reference goes to
  // its regeneration (4.2), before any red goes to him; the others (the root, a red no file situates, a
  // package out of the plan) wait for the final pass.
  const lieu = r => ({
    fichier: r.fichier ?? null,
    gardes: r.gardes ?? [],
    dansLePlan: Boolean(r.dansLePlan),
  });
  const deReference = r => referencesDesRouges(ctx, [lieu(r)]).length > 0;
  const siens = r => finale || (r.dansLePlan && !deReference(r));
  const rouges = tous.filter(siens);
  const references = finale
    ? []
    : referencesDesRouges(ctx, tous.filter(r => !siens(r) && deReference(r)).map(lieu));
  const laisses = tous.filter(r => !siens(r) && (finale || !deReference(r)));
  const aRepasser = resultats.filter(r => r.code === A_REPASSER);
  const nommer = r => `${ligneDeCommande(r)} (code ${r.code})`;
  const enEchec = resultats.filter(r => r.code !== 0 && r.code !== A_REPASSER);
  const a = rouges.filter(r => r.dansLePlan);
  const autres = rouges.filter(r => !r.dansLePlan);
  const resume = rouges.length
    ? `rouge : ${rouges.length} rouge(s) — ${
        commandes.length
          ? enEchec.map(nommer).join(' ; ')
          : `ceux ${finale ? "de la passe finale d'avant" : "des contrôles d'avant"}, que la régénération ne change pas`
      }`
    : aRepasser.length
      ? `à repasser : ${aRepasser.map(nommer).join(' ; ')}`
      : `verts : ${commandes.length ? resultats.map(ligneDeCommande).join(' ; ') : finale ? "la passe finale d'avant" : "les contrôles d'avant"}${
          laisses.length
            ? ` ; laissés à la passe finale, ${laisses.length} rouge(s) hors du plan`
            : ''
        }`;
  // Where the checks played: the final pass out of the envelope, on the band of the lot (its base
  // and its dependents); the checks of the plan, its tests and packages, its guards in its
  // envelope.
  const ou = !finale
    ? 'Contrôles du plan, ses tests et ses paquets, ses gardes dans son enveloppe'
    : 'Contrôles de la passe finale, hors enveloppe, sur la bande du lot (sa base et ses dépendants)';
  const ligne = r => [`- ${r.texte}`, ...(r.detail ? ['', r.detail, ''] : [])];
  const nomDuPaquet = r => r.paquet ?? 'hors des paquets';
  const journal = `Le journal du ticket, pour le détail des commandes : ${ctx.journal}`;
  // The warnings and notes of the guards, apart from the reds: shown, given to no one to correct.
  const signales = resultats.flatMap(r => r.avertissements);
  const avertissements = signales.length
    ? [
        `Les avertissements (${signales.length}), qui ne sont pas des rouges :`,
        ...signales.map(l => `- ${l}`),
        '',
      ]
    : [];
  const texte = [
    `${ou} : ${resume}.`,
    '',
    ...(a.length ? [`Tes rouges (${a.length}) :`, ...a.flatMap(ligne), ''] : []),
    ...(aRepasser.length && !rouges.length
      ? [`À repasser (${aRepasser.length}) : ${aRepasser.map(nommer).join(' ; ')}`, '']
      : []),
    ...(autres.length
      ? [`Les autres rouges (${autres.length}), hors du plan, montent au superviseur.`, '']
      : []),
    ...(laisses.length && !finale
      ? [`Laissés à la passe finale (${laisses.length}) :`, ...laisses.map(r => `- ${r.texte}`), '']
      : []),
    journal,
  ].join('\n');
  const sansListe = [`${ou} : ${resume}.`, '', journal].join('\n');
  const complet = [
    `${ou} : ${resume}.`,
    '',
    ...(rouges.length
      ? [
          `Les rouges (${rouges.length}) :`,
          ...rouges.flatMap(r => ligne({ ...r, texte: `${nomDuPaquet(r)} : ${r.texte}` })),
          '',
        ]
      : []),
    ...avertissements,
    journal,
  ].join('\n');
  return {
    rouge: rouges.length > 0,
    aRepasser: aRepasser.length > 0,
    arbitrer: a.length > 0 && a.every(r => r.arbitrer),
    auDeveloppeur: a.length > 0,
    texte,
    complet,
    sansListe,
    avertissements: avertissements.length ? `\n\n${avertissements.join('\n').trimEnd()}` : '',
    // The reds of the stop, each with where it lies: the plan's, or at the final pass all of them;
    // never those left to the final pass.
    rouges: rouges.map(r => ({ paquet: nomDuPaquet(r), texte: r.texte, detail: r.detail })),
    resume,
    horsTitre: [...new Set(rouges.map(r => r.horsTitre).filter(Boolean))].sort(),
    lieux: rouges.map(lieu),
    references,
    tous,
    notes: finale
      ? resultats.flatMap(r =>
          lireSarif(r.dossier)
            .constats.filter(k => k.genre === A_ELAGUER)
            .map(({ garde, fichier, regle, trouve }) => ({ garde, fichier, regle, trouve }))
        )
      : [],
  };
}

// The checks of the plan, out of the final pass: `npm test -- <package>` for each package of the
// plan and each the lot touches in it, `npm test -- <test files of the lot>` that none of them
// holds (the shared test material's out of the plan), each test played once, then the guards in
// the envelope of the plan, whose findings on its files alone count.
function commandesDuPlan(ctx, liste, seuls = null) {
  const lot = changements(ctx);
  const touches = liste.length
    ? [...new Set(lot.map(c => paquetDe(liste, c.fichier)).filter(d => d !== '.'))].sort()
    : ['.'];
  // Resumed at a red (<seuls>, the test files it names): these tests alone, no package whole.
  const entiers = seuls
    ? []
    : [
        ...new Set([...touches.filter(d => dansLePlan(ctx, d)), ...paquetsDuPlan(ctx, liste)]),
      ].sort();
  const tests = (seuls ?? testsDuLot(ctx)).filter(
    f => !entiers.some(d => d === '.' || f.startsWith(`${d}/`))
  );
  const scripts = lireJson(path.join(ctx.copie, 'package.json'))?.scripts ?? {};
  const enveloppe = { [VARIABLE_ENVELOPPE]: ecrireLaListe(ctx.paquets) };
  return [
    ...(tests.length ? [{ args: ['test', '--', ...tests] }] : []),
    ...entiers.map(d => ({ args: d === '.' ? ['test'] : ['test', '--', d] })),
    ...['grillhouse:gardes', 'gardes']
      .filter(s => s in scripts)
      .map(s => ({ args: ['run', s], env: enveloppe })),
  ];
}

// Whether the package <p> of the repository at <racine> (an entry of `paquets`) plays tests, as the
// module of its language answers.
const joueDesTests = (racine, p) =>
  langageDe(racine).joueDesTests(racine, {
    dossier: path.join(racine, p.dossier),
    nom: path.basename(p.dossier),
    paquet: p.pkg.name ?? null,
  });

// The directories of the packages of <liste> that play tests (`joueDesTests`) and that the plan
// holds; sorted.
function paquetsDuPlan(ctx, liste) {
  return liste
    .filter(p => dansLePlan(ctx, p.dossier) && joueDesTests(ctx.copie, p))
    .map(p => p.dossier)
    .sort();
}

// Whether the plan carries no test: in a repository of packages, no package of the frame that
// plays tests (`joueDesTests`) lies in a path of the plan or holds it, as `npm test -- <chemin>`
// refuses a path out of every package or in a package without tests. A repository without
// packages plays its tests at its root: each plan has them.
export function sansTests(ctx) {
  const racine = existsSync(ctx.copie) ? ctx.copie : ctx.racine;
  const liste = composantsDe(racine).filter(p => !p.hors);
  if (liste.length === 0) {
    return false;
  }
  const touche = (c, d) => c === '.' || d === c || d.startsWith(`${c}/`) || c.startsWith(`${d}/`);
  return !liste.some(p => ctx.paquets.some(c => touche(c, p.dossier)) && joueDesTests(racine, p));
}

// Whether the copy holds a change of the plan against its HEAD.
export function livre(ctx) {
  const r = spawnSync(
    'git',
    ['-C', ctx.copie, 'status', '--porcelain', '--untracked-files=all', '--', ...ctx.paquets],
    { encoding: 'utf8' }
  );
  return String(r.stdout ?? '').trim() !== '';
}

// The fingerprint of the files of <chemins> in the copy (the plan by default): `git status
// --porcelain` of them and the content of each file it lists.
export function empreinte(ctx, chemins = ctx.paquets) {
  const r = spawnSync(
    'git',
    ['-C', ctx.copie, 'status', '--porcelain', '-z', '--untracked-files=all', '--', ...chemins],
    { encoding: 'utf8' }
  );
  const statut = String(r.stdout ?? '');
  const h = createHash('sha256').update(statut);
  for (const e of statut.split('\0')) {
    if (e.length < 4) {
      continue;
    }
    const f = path.join(ctx.copie, e.slice(3));
    try {
      if (statSync(f).isFile()) {
        h.update(e).update(readFileSync(f));
      }
    } catch {
      // A file removed: its line in the status is its trace.
    }
  }
  return h.digest('hex');
}

// The fingerprint of the step <etape> (`preuve`, `controles`, `passe-finale`) on the copy
// (scripts/reprise.mjs `empreinteDEtape`): its command and the hashes of what it reads, each
// package of the plan and its dependents by the hash of its test task in the plan of Turborepo
// (`turbo run test:unit --filter=...<package> --dry=json`: the hash of the inputs of a task), the
// files of the plan in the copy (`empreinte`), and the configuration at the root of the copy by
// its content. Null when Turborepo does not give its plan: nothing is then read back.
export function empreinteDeLEtape(ctx, etape) {
  const liste = composantsDe(ctx.copie).filter(p => !p.hors);
  const commande =
    etape === 'preuve'
      ? `preuve ${testsDuLot(ctx).join(' ')}`
      : etape === 'controles'
        ? JSON.stringify(commandesDuPlan(ctx, liste))
        : 'npm run verifier';
  const noms = liste
    .filter(p => dansLePlan(ctx, p.dossier))
    .map(p => p.pkg.name)
    .filter(Boolean)
    .sort();
  const empreintes = langageDe(ctx.copie).empreintes(ctx.copie, noms);
  if (!empreintes) {
    return null;
  }
  const hashes = { plan: empreinte(ctx), ...empreintes };
  const racine = createHash('sha256');
  for (const f of readdirSync(ctx.copie).sort()) {
    const chemin = path.join(ctx.copie, f);
    if (statSync(chemin, { throwIfNoEntry: false })?.isFile()) {
      racine.update(f).update(readFileSync(chemin));
    }
  }
  hashes['//'] = racine.digest('hex');
  return empreinteDEtape({ commande, hashes });
}

// The test files and the files of code a red lies in (<lieux>, the places of the red as the
// checks name them) that the testwriter and the developpeur carry (scripts/reprise.mjs
// `attribuerLeRouge`): `{ tests, code }`. The testwriter carries the test files of the lot; the
// developpeur, every other file of a path of the plan.
export function portesDuRouge(ctx, lieux) {
  const dulot = new Set(
    changements(ctx)
      .filter(c => !c.supprime && duTestwriter(ctx, c.fichier))
      .map(c => c.fichier)
  );
  const nommes = [...new Set((lieux ?? []).map(l => l.fichier).filter(Boolean))];
  return {
    tests: nommes.filter(f => dulot.has(f)),
    code: nommes.filter(f => !dulot.has(f) && dansLePlan(ctx, f)),
  };
}

// Whether the plan names `.`, which holds the whole copy.
function nommeLaRacine(ctx) {
  return ctx.paquets.includes('.');
}

// Whether a path of the plan holds <chemin> (relative to the copy), `.` holding every path.
function dansLePlan(ctx, chemin) {
  return ctx.paquets.some(c => c === '.' || chemin === c || chemin.startsWith(`${c}/`));
}
