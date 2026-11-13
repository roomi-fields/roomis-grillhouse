// The gestures of the queue, which brings the branches `agent/<ticket>` the integration committed
// onto main, one at a time, each judged by the CI of its branch before main moves, as bors and
// Zuul gate a merge on the CI of the tree that enters: the workflow of the queue of a project
// (`file:<racine>`, src/temporal/file/deroule.ts) plays them, each in an act of its own
// (scripts/faits-du-circuit.mjs), for the entries the circuits of the tickets send it at their
// step 5.2, in their order of arrival. Nothing is verified on the machine: the CI judges.
//
// For each branch (`preparerLaBranche`), against the main of the moment:
//  - main is an ancestor of the branch (main has not moved since its base): the branch is the
//    candidate as it is;
//  - main has moved: the branch is replaced on main in the queue's own copy
//    (`.claude/worktrees/file`, made ready by scripts/integration/rejeu.mjs, its dependencies made
//    to agree with the lock file and the manifests: an install that fails makes the branch leave
//    the queue, « Les dépendances de la copie ne s'installent pas. »), and `agent/<ticket>` takes
//    the replaced commit, the candidate. A generated file the project declares
//    (`grillhouse.engendres`, scripts/engendres.mjs, read from the main tree, a faulty key keeping
//    the branch in the queue, named) is never merged, as npm writes package-lock.json again after
//    a merge: a conflict on such files only takes main's version, and once the branch is replaced
//    and installed, the command of each one whose files, or the files it reads, the branch touches
//    writes it again, with the tools of the project, and what it writes enters the branch's
//    commit; a command that fails makes the branch leave the queue, the command and its output
//    named (OSC Bridge, 2026-10-31: four conflicts in one day on the generated files of synthhub
//    and open-synth-descriptors);
//  - the candidate is pushed to origin on `agent/<ticket>` (forced: the queue owns that branch,
//    and a replay rewrites it), a push refused keeping the branch in the queue, its reason named;
//  - a branch with nothing ahead of main does not enter: it leaves the queue, its ticket loses
//    `en-file` and takes a comment, and stays as it is;
//  - a branch that does not replace (the files in conflict) leaves the queue: its ticket loses
//    `en-file`, reopens with a comment that names the files, and the branch stays where it is, for
//    the resumption of its circuit;
//  - a branch whose replay cannot be done (the copy does not get ready, the branch does not take
//    its replaced commit) stays in the queue, the reason written to its ticket, which is neither
//    reopened nor closed, and the queue goes on; the circuit of the ticket stops at
//    « a-repasser », and its resumption sends the branch again.
// Then the queue reads the CI of the candidate on its branch, the run of `agent/<ticket>` whatever
// runs it (GitHub's runners or the project's own: the queue reads the run, not the machine). As
// bors refuses a merge without its required status, the queue first reads, in the candidate, the
// workflows that run on a push to its branch (`fluxDeLaBranche`, the files `.github/workflows/*.yml`
// and `*.yaml`, their `on` and its filters as GitHub reads them); with none, no run is looked for,
// and the branch stays in the queue, the ticket told that the CI of the project must listen to
// `agent/**`. A workflow the queue cannot judge (a file it cannot read, a filter on the paths)
// counts as one that runs. With one, each reading (`lireUneFoisLaCI`) looks for its run
// (`gh run list --commit <sha> --branch <branche> --json databaseId,status,conclusion`), then
// reads it (`gh run view <id> --json status,conclusion,jobs`), as `gh run watch` does; the
// workflow of the CI of the commit spaces the readings and bounds the search and the wait
// (`ciDuCommit`). Green on the conclusion `success`, red on any other. Under the circuit's progress
// directory (scripts/avancement.mjs), each reading writes there the steps of the run done over
// planned, which the board shows. The run is read at its current attempt (`gh run view <id>`
// without `--attempt`), as a merge queue judges the last attempt of a commit's checks.
// The CI concluded (`conclureLaCI`):
//  - green: main moves forward onto the candidate (`avancerMain`, `merge
//    --ff-only`), the tree the CI judged; main moved meanwhile (the candidate no longer on top of
//    it), the workflow replaces the branch again and its CI is played again;
//  - red: the ticket loses `en-file` and reopens, its comment giving the address of the run (`gh
//    run view <id> --json url`) and the end of `gh run view <id> --log-failed`; main does not
//    move, and the branch stays, here and on origin. After the supervisor had the failed jobs run
//    again (`gh run rerun <id> --failed`), `--reprendre` sends the branch again, whose CI is read
//    at its last attempt. A flaky test has no path of its own: the red comment gives the charter's
//    rule, a test known red goes into quarantine in the test itself, with the ticket that fixes it;
//  - no CI for the branch, or not read (without `gh`, without a run found, with `gh` refusing or
//    past the wait): no green, no entry; the branch stays in the queue, the ticket told why,
//    neither reopened nor closed.
// At its entry on main (`fermerLEntree`), the branch's ticket closes « intégré : <commit> », loses
// `en-file`, and the branch is deleted; a branch git does not delete (its copy still in place) is
// written to the ticket, which closes all the same. Then main is pushed to origin, on the branch
// `grillhouse.poussee.commit` of main's package.json (`main` without the key), and the branch is
// deleted on origin; a refused push is written to the ticket and does not stop the queue. The
// working directory of its circuit (`.claude/worktrees/<ticket>.travail`, scripts/circuit.mjs),
// which lives as long as the ticket and holds the progress the board reads, the CI's included, is
// removed then (`retirerLeTravail`).
// Every comment and change of the queue at a ticket is written under the author `file`, which bd
// reads in BEADS_ACTOR, as the circuit writes its own lines under `circuit`.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { couvertPar, engendresDe, regenerer, touchesPar } from '../engendres.mjs';
import { avecLesDonnees, donneesDe } from '../donnees-cles.mjs';
import { avecLesOutils, outilsDe } from '../outils-cles.mjs';
import { lireCommit } from '../poussee-cles.mjs';
import { ouvrirCopie } from './rejeu.mjs';
import { lotSurMain } from './integrer.mjs';
import { ecrireTache } from '../mesure/avancement.mjs';
import { ACTEUR, emettre } from '../effets.mjs';
import { enUneLigne } from '../ticket-du-circuit.mjs';

// The queue's author.
export const AUTEUR_DE_LA_FILE = 'file';

// The comment <texte> at <ticket> with the tools <o>, by the queue: the effect `commentaire`
// (../effets.mjs), written at once by the queue on its file, gathered by an act of the queue under
// Temporal, which the workflow writes in an activity of its own, under its key.
const commenterAu = (o, ticket, texte) =>
  emettre(o, { genre: 'commentaire', ticket, texte, auteur: AUTEUR_DE_LA_FILE });
// The reason of the closure of a ticket the queue brought onto main, before its commit, which the
// circuit reads to name that commit (scripts/circuit.mjs, the tri of the discoveries).
export const INTEGRE = 'intégré : ';
// The steps done over planned of the view <vue> of a run (`gh run view --json jobs`), written to
// the progress directory <avancement> as the record `etapes-de-la-ci`; nothing without one.
function ecrireLesEtapes(avancement, vue) {
  if (!avancement) {
    return;
  }
  const etapes = (Array.isArray(vue?.jobs) ? vue.jobs : []).flatMap(j =>
    Array.isArray(j?.steps) ? j.steps : []
  );
  try {
    ecrireTache(avancement, 'etapes-de-la-ci', {
      faits: etapes.filter(e => e?.status === 'completed').length,
      prevus: etapes.length,
    });
  } catch {
    // A directory that does not write leaves the queue going, without its progress.
  }
}

// The directory of the workflows GitHub reads, and the extensions it reads in it.
const DOSSIER_DES_FLUX = '.github/workflows';
const EXTENSIONS_DES_FLUX = /\.ya?ml$/;

// The regular expression of a filter pattern of GitHub (« Filter pattern cheat sheet »): `*` any
// characters but `/`, `**` any characters, `?` zero or one and `+` one or more of the preceding
// character, `[…]` one character of the set, `\` escaping the next.
function motifDeGitHub(motif) {
  let re = '';
  for (let i = 0; i < motif.length; i++) {
    const c = motif[i];
    if (c === '\\' && i + 1 < motif.length) {
      re += motif[++i].replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    } else if (c === '*') {
      if (motif[i + 1] === '*') {
        re += '.*';
        i++;
      } else {
        re += '[^/]*';
      }
    } else if (c === '?' || c === '+') {
      re += c;
    } else if (c === '[') {
      const fin = motif.indexOf(']', i + 1);
      if (fin < 0) {
        throw new Error(`motif sans fin : ${motif}`);
      }
      re += motif.slice(i, fin + 1);
      i = fin;
    } else {
      re += c.replace(/[.^${}()|\]\\/]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

// Whether the `on.push` of a workflow <push> runs on a push to <branche>, as GitHub reads its
// filters: none runs on every branch; `branches` in its order, a `!` pattern taking out what the
// ones before took in, the last match deciding; `branches-ignore` takes out what it matches;
// `tags` or `tags-ignore` alone run on no branch. GitHub asks both filters: a branch the branch
// filter leaves out never runs, whatever the paths; a filter on the paths leaves a branch it takes
// in counted as one that runs, as does a form the queue does not judge.
function pousseeSurLaBranche(push, branche) {
  if (push === null || push === undefined) {
    return true;
  }
  if (typeof push !== 'object' || Array.isArray(push)) {
    return true;
  }
  const { branches, 'branches-ignore': ignorees } = push;
  if (branches && ignorees) {
    return true;
  }
  const motifs = l => (Array.isArray(l) ? l : [l]).map(String);
  if (branches) {
    let dedans = false;
    for (const m of motifs(branches)) {
      const negatif = m.startsWith('!');
      if (motifDeGitHub(negatif ? m.slice(1) : m).test(branche)) {
        dedans = !negatif;
      }
    }
    return dedans;
  }
  if (ignorees) {
    const l = motifs(ignorees);
    if (l.some(m => m.startsWith('!'))) {
      return true;
    }
    return !l.some(m => motifDeGitHub(m).test(branche));
  }
  return !(push.tags || push['tags-ignore']);
}

// The workflows of <fichiers> (`{ chemin, texte }`, `texte` null for a file git does not give)
// that run on a push to <branche>: their paths. A file the queue cannot read or judge counts as
// one that runs.
export function fluxDeLaBranche(fichiers, branche) {
  return fichiers
    .filter(({ texte }) => {
      if (texte === null) {
        return true;
      }
      try {
        // Loaded only for a workflow to read: a project without one, or before its `npm install`,
        // runs its queue without the library (which, absent, counts the workflow as one that runs).
        const require = createRequire(import.meta.url);
        const on = require('yaml').parse(texte)?.on;
        if (typeof on === 'string') {
          return on === 'push';
        }
        if (Array.isArray(on)) {
          return on.includes('push');
        }
        if (on && typeof on === 'object') {
          return 'push' in on && pousseeSurLaBranche(on.push, branche);
        }
        return false;
      } catch {
        return true;
      }
    })
    .map(({ chemin }) => chemin);
}

// The verdicts of a reading of the CI (`lireUneFoisLaCI`, then the workflow `ciDuCommit`).
const VERTE = 'verte';
const SANS_CI = 'sans-ci';
const NON_LUE = 'non-lue';

// The name GitHub gives the workflow of the file <texte>: its `name` key, its path <chemin> without
// one (or when the file is not given or its YAML not read).
function nomDuFlux(chemin, texte) {
  if (texte === null) {
    return chemin;
  }
  try {
    const require = createRequire(import.meta.url);
    const nom = require('yaml').parse(texte)?.name;
    return typeof nom === 'string' && nom !== '' ? nom : chemin;
  } catch {
    return chemin;
  }
}

/**
 * The workflows of the commit <sha> of the repository <racine> that run on a push to <branche>,
 * in the order of the files of their directory: `{ chemin, nom }`, the path and the name GitHub
 * gives the workflow (`workflowName` of `gh run list`).
 */
export function fluxDuCommit(racine, sha, branche) {
  const git = (...a) => spawnSync('git', ['-C', racine, ...a], { encoding: 'utf8' });
  const l = git('ls-tree', '--name-only', `${sha}:${DOSSIER_DES_FLUX}`);
  const noms = l.status === 0 ? l.stdout.split('\n').filter(n => EXTENSIONS_DES_FLUX.test(n)) : [];
  const fichiers = noms.map(n => {
    const chemin = `${DOSSIER_DES_FLUX}/${n}`;
    const f = git('show', `${sha}:${chemin}`);
    return { chemin, texte: f.status === 0 ? f.stdout : null };
  });
  const attendus = new Set(fluxDeLaBranche(fichiers, branche));
  return fichiers
    .filter(({ chemin }) => attendus.has(chemin))
    .map(({ chemin, texte }) => ({ chemin, nom: nomDuFlux(chemin, texte) }));
}

/**
 * The workflows of the commit <sha> that run on a push to <main> and not on a push to the branch of
 * the ticket <brancheDuTicket>: `{ chemin, nom }`, in the order of the files. The one the CI of the
 * branch already judged is any workflow of the second set, found by its path.
 * @param {string} racine
 * @param {string} sha
 * @param {string} main
 * @param {string} brancheDuTicket
 * @returns {{ chemin: string, nom: string }[]}
 */
export function fluxDeMainAbsentsDeLaBranche(racine, sha, main, brancheDuTicket) {
  const jugés = new Set(fluxDuCommit(racine, sha, brancheDuTicket).map(f => f.chemin));
  return fluxDuCommit(racine, sha, main).filter(f => !jugés.has(f.chemin));
}

// The file of the readings due of the workflows of main, in the main tree <racine>.
const lecturesDues = racine => path.join(racine, '.claude', 'worktrees', 'flux-de-main-dus.json');

/** The readings due of the workflows of main of <racine>: `{ ticket, commit, branche, flux, poussee }`. */
export function lecturesDuesDe(racine) {
  try {
    const lu = JSON.parse(readFileSync(lecturesDues(racine), 'utf8'));
    return Array.isArray(lu) ? lu : [];
  } catch {
    return [];
  }
}

// The readings due <dues> written whole, atomically.
function ecrireLesLecturesDues(racine, dues) {
  const f = lecturesDues(racine);
  mkdirSync(path.dirname(f), { recursive: true });
  const provisoire = `${f}.${process.pid}`;
  writeFileSync(provisoire, `${JSON.stringify(dues, null, 2)}\n`);
  renameSync(provisoire, f);
}

/**
 * After the push of the commit <sha> of the ticket <ticket> to <branche> (main) at <poussee> ms, the
 * reading of its workflows of main recorded as due, with the tools <o>: nothing is read, nothing
 * waited for; none is due when every workflow of main is one the CI of <brancheDuTicket> judged.
 * A reading of the same ticket and commit is replaced.
 */
export function inscrireLesFluxDeMain(o, { ticket, sha, branche, brancheDuTicket, poussee }) {
  const flux = fluxDeMainAbsentsDeLaBranche(o.racine, sha, branche, brancheDuTicket);
  if (flux.length === 0) {
    return;
  }
  const autres = lecturesDuesDe(o.racine).filter(l => !(l.ticket === ticket && l.commit === sha));
  ecrireLesLecturesDues(o.racine, [...autres, { ticket, commit: sha, branche, flux, poussee }]);
}

// The conclusion of the run <id> read by <gh>: `{ fini, conclusion }`, or `{ raison }`.
function lireUnPassage(gh, id) {
  const v = gh(['run', 'view', id, '--json', 'status,conclusion,jobs'], {
    timeout: 60_000,
    killSignal: 'SIGKILL',
  });
  if (v.error) {
    return { raison: `gh ne se lance pas (${v.error.code ?? v.error.message}).` };
  }
  if (v.status !== 0) {
    return { raison: `gh run view refuse :\n${`${v.stderr}${v.stdout}`.trim()}` };
  }
  try {
    const vue = JSON.parse(v.stdout || '{}');
    return { fini: vue?.status === 'completed', conclusion: vue?.conclusion ?? null };
  } catch {
    return { raison: `gh run view rend une sortie illisible :\n${v.stdout.trim()}` };
  }
}

// The runs of the commit <sha> on <branche> read by <gh>: the list, or `{ raison }`.
function lirePassagesDe(gh, sha, branche) {
  const r = gh([
    'run',
    'list',
    '--commit',
    sha,
    '--branch',
    branche,
    '--json',
    'databaseId,status,conclusion,workflowName',
  ]);
  if (r.error) {
    return { raison: `gh ne se lance pas (${r.error.code ?? r.error.message}).` };
  }
  if (r.status !== 0) {
    return { raison: `gh run list refuse :\n${`${r.stderr}${r.stdout}`.trim()}` };
  }
  try {
    const l = JSON.parse(r.stdout || '[]');
    return { passages: Array.isArray(l) ? l : [] };
  } catch {
    return { raison: `gh run list rend une sortie illisible :\n${r.stdout.trim()}` };
  }
}

/** The label a ticket reopened by a red workflow of main bears, which the wait of the supervisor reads. */
export const FLUX_ROUGE = 'flux-rouge';
/** The title of the comment that gives the address of the red run, whose second paragraph is that address. */
export const TITRE_DU_FLUX_ROUGE = '## Flux de main rouge';

/**
 * Each reading due of the workflows of main read once, without waiting, with the tools <o> at
 * <maintenant> ms and the bounds <ci> (`rechercheMs`, `attenteMs`, from the push of main). A workflow
 * red (any conclusion but `success`) reopens the ticket of the commit pushed under the label
 * `flux-rouge`, a comment giving the address of the run, and closes the reading; green, it says
 * nothing; with no run past the search bound, a run unfinished past the wait bound, or `gh`
 * failing, a comment names the workflow and why, nothing is reopened. A reading with a workflow
 * still to come stays due. `{ dues }`: the readings still due.
 */
export function relireLesLecturesDues(o, { maintenant, ci }) {
  const toutes = lecturesDuesDe(o.racine);
  if (toutes.length === 0) {
    return { dues: 0 };
  }
  const restantes = [];
  for (const l of toutes) {
    const court = l.commit.slice(0, 7);
    const ecoule = maintenant - l.poussee;
    const nonJuge = (nom, pourquoi) => {
      commenterAu(
        o,
        l.ticket,
        `## Flux de main non jugé\n\nLe flux ${nom} de ${court} sur ${l.branche} n'a pas été jugé : ${pourquoi}\n\nLa file ne le tient pas pour rouge : le superviseur le lit à la main.`
      );
      o.dire(`⚠ flux ${nom} de ${court} non jugé : ${pourquoi}`);
    };
    const lus = lirePassagesDe(o.gh, l.commit, l.branche);
    if (lus.raison) {
      for (const f of l.flux) {
        nonJuge(f.nom, lus.raison);
      }
      continue;
    }
    const encore = [];
    let rouge = null;
    for (const f of l.flux) {
      const p = lus.passages
        .filter(x => x?.databaseId && x.workflowName === f.nom)
        .reduce((m, x) => (m === null || x.databaseId > m.databaseId ? x : m), null);
      if (p === null) {
        if (ecoule > ci.rechercheMs) {
          nonJuge(f.nom, `aucun passage trouvé en ${Math.round(ci.rechercheMs / 60_000)} min.`);
        } else {
          encore.push(f);
        }
        continue;
      }
      const id = String(p.databaseId);
      const v = lireUnPassage(o.gh, id);
      if (v.raison) {
        nonJuge(f.nom, v.raison);
      } else if (!v.fini) {
        if (ecoule > ci.attenteMs) {
          nonJuge(
            f.nom,
            `le passage ${id} n'est pas fini après ${Math.round(ci.attenteMs / 60_000)} min.`
          );
        } else {
          encore.push(f);
        }
      } else if (v.conclusion !== 'success') {
        rouge = { nom: f.nom, id };
        break;
      }
    }
    if (rouge) {
      const url =
        o.gh(['run', 'view', rouge.id, '--json', 'url', '--jq', '.url']).stdout?.trim() || rouge.id;
      commenterAu(
        o,
        l.ticket,
        `${TITRE_DU_FLUX_ROUGE}\n\n${rouge.nom} : ${url} (commit ${court})\n\nLe flux ${rouge.nom} de ${court} est rouge sur ${l.branche}, après l'entrée du lot : le ticket est rouvert, le superviseur juge la cause.`
      );
      o.bd('update', l.ticket, '--status', 'open', '--add-label', FLUX_ROUGE);
      o.dire(`✗ flux ${rouge.nom} de ${court} rouge sur ${l.branche} : ${l.ticket} rouvert`);
      continue;
    }
    if (encore.length > 0) {
      restantes.push({ ...l, flux: encore });
    }
  }
  ecrireLesLecturesDues(o.racine, restantes);
  return { dues: restantes.length };
}

// The GitHub CLI run in the main tree <racine>.
const ghDans =
  racine =>
  (args, options = {}) =>
    spawnSync('gh', args, {
      cwd: racine,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      ...options,
    });

/**
 * The tools of the queue on the main tree <racine>, its lines said by <dire>: `{ racine,
 * principale, bd, gh, dire, avancement }`, bd run under the queue's author (BEADS_ACTOR), the
 * branch of the main tree (null when it is on none).
 */
export function outilsDeLaFile(racine, dire, avancement = null) {
  const bd = (...a) => {
    const r = spawnSync('bd', a, {
      cwd: racine,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, [ACTEUR]: AUTEUR_DE_LA_FILE },
    });
    if (r.status !== 0) {
      process.stderr.write(`bd ${a[0]} ${a[1] ?? ''} : ${r.stderr}`);
    }
    return r;
  };
  const principale =
    spawnSync('git', ['-C', racine, 'symbolic-ref', '--short', '-q', 'HEAD'], {
      encoding: 'utf8',
    }).stdout.trim() || null;
  return { racine, principale, bd, gh: ghDans(racine), dire, avancement };
}

/**
 * One reading of the CI of the commit <sha> pushed to <branche>, with the tools <o> (`outilsDeLaFile`),
 * the run <passage> found by a reading before (null while it is looked for): `{ etat: 'sans-ci' }`
 * (no workflow runs on a push to the branch), `{ etat: 'cherche' }` (no run yet), `{ etat:
 * 'en-cours', passage }`, `{ etat: 'finie', passage, conclusion }`, or `{ etat: 'non-lue', raison
 * }` (gh absent, refusing, or its output unreadable). The run is the one of <sha> on <branche>,
 * read at its current attempt (`gh run view <id>` without `--attempt`). A run found is read at
 * once. It writes nothing to the ticket: `conclureLaCI` does.
 */
export function lireUneFoisLaCI(o, { sha, branche, passage = null }) {
  const { gh } = o;
  let id = passage;
  if (id === null) {
    if (fluxDuCommit(o.racine, sha, branche).length === 0) {
      // (the reading of before the CI of every workflow, kept for the replay of `lireLaCI`)
      return { etat: SANS_CI };
    }
    const r = gh([
      'run',
      'list',
      '--commit',
      sha,
      '--branch',
      branche,
      '--json',
      'databaseId,status,conclusion',
    ]);
    if (r.error) {
      return { etat: NON_LUE, raison: `gh ne se lance pas (${r.error.code ?? r.error.message}).` };
    }
    if (r.status !== 0) {
      return { etat: NON_LUE, raison: `gh run list refuse :\n${`${r.stderr}${r.stdout}`.trim()}` };
    }
    let passages = [];
    try {
      passages = JSON.parse(r.stdout || '[]');
    } catch {
      return {
        etat: NON_LUE,
        raison: `gh run list rend une sortie illisible :\n${r.stdout.trim()}`,
      };
    }
    const trouve = passages.find(x => x?.databaseId);
    if (!trouve) {
      return { etat: 'cherche' };
    }
    id = String(trouve.databaseId);
  }
  const v = gh(['run', 'view', id, '--json', 'status,conclusion,jobs'], {
    timeout: 60_000,
    killSignal: 'SIGKILL',
  });
  if (v.error) {
    return { etat: NON_LUE, raison: `gh ne se lance pas (${v.error.code ?? v.error.message}).` };
  }
  if (v.status !== 0) {
    return { etat: NON_LUE, raison: `gh run view refuse :\n${`${v.stderr}${v.stdout}`.trim()}` };
  }
  let vue;
  try {
    vue = JSON.parse(v.stdout || '{}');
  } catch {
    return { etat: NON_LUE, raison: `gh run view rend une sortie illisible :\n${v.stdout.trim()}` };
  }
  ecrireLesEtapes(o.avancement, vue);
  if (vue?.status === 'completed') {
    return { etat: 'finie', passage: id, conclusion: vue.conclusion ?? null };
  }
  return { etat: 'en-cours', passage: id };
}

/**
 * One reading of the CI of the commit <sha> pushed to <branche>, every expected workflow
 * (`fluxDuCommit`) read together, with the tools <o>: `{ etat: 'sans-ci' }`; `{ etat: 'non-lue',
 * raison }` (gh absent, refusing, or its output unreadable); `{ etat: 'rouge', passage, flux }`, the
 * first workflow in the order of the files whose run is not a success, whatever the others still
 * do; `{ etat: 'verte', passage }`, every workflow green, `passage` the first workflow's; or `{
 * etat: 'en-cours', flux: [{ nom, passage, fini }] }`, each workflow with its run (null while it
 * is looked for). A run joins its workflow by its name (`workflowName`); one of no expected name
 * does not count, the latest run (the greatest id) of a name decides, and workflows of one name count
 * for one, which `gh run list` does not tell apart. Each run is read at its current attempt (`gh
 * run view <id>` without `--attempt`). Nothing is kept from one reading to the next; nothing is
 * written to the ticket: `conclureLaCI` does.
 */
export function lireLesPassagesDeLaCI(o, { sha, branche }) {
  const { gh } = o;
  const attendus = [...new Set(fluxDuCommit(o.racine, sha, branche).map(f => f.nom))];
  if (attendus.length === 0) {
    return { etat: SANS_CI };
  }
  const r = gh([
    'run',
    'list',
    '--commit',
    sha,
    '--branch',
    branche,
    '--json',
    'databaseId,status,conclusion,workflowName',
  ]);
  if (r.error) {
    return { etat: NON_LUE, raison: `gh ne se lance pas (${r.error.code ?? r.error.message}).` };
  }
  if (r.status !== 0) {
    return { etat: NON_LUE, raison: `gh run list refuse :\n${`${r.stderr}${r.stdout}`.trim()}` };
  }
  let passages;
  try {
    passages = JSON.parse(r.stdout || '[]');
  } catch {
    return {
      etat: NON_LUE,
      raison: `gh run list rend une sortie illisible :\n${r.stdout.trim()}`,
    };
  }
  const recent = nom =>
    (Array.isArray(passages) ? passages : [])
      .filter(x => x?.databaseId && x.workflowName === nom)
      .reduce((m, x) => (m === null || x.databaseId > m.databaseId ? x : m), null);
  const lus = [];
  for (const nom of attendus) {
    const p = recent(nom);
    if (p === null) {
      lus.push({ nom, passage: null, fini: false });
      continue;
    }
    const id = String(p.databaseId);
    const v = gh(['run', 'view', id, '--json', 'status,conclusion,jobs'], {
      timeout: 60_000,
      killSignal: 'SIGKILL',
    });
    if (v.error) {
      return { etat: NON_LUE, raison: `gh ne se lance pas (${v.error.code ?? v.error.message}).` };
    }
    if (v.status !== 0) {
      return { etat: NON_LUE, raison: `gh run view refuse :\n${`${v.stderr}${v.stdout}`.trim()}` };
    }
    let vue;
    try {
      vue = JSON.parse(v.stdout || '{}');
    } catch {
      return {
        etat: NON_LUE,
        raison: `gh run view rend une sortie illisible :\n${v.stdout.trim()}`,
      };
    }
    const fini = vue?.status === 'completed';
    if (!fini) {
      ecrireLesEtapes(o.avancement, vue);
    }
    if (fini && vue.conclusion !== 'success') {
      return { etat: 'rouge', passage: id, flux: nom };
    }
    lus.push({ nom, passage: id, fini });
  }
  if (lus.every(f => f.fini)) {
    return { etat: VERTE, passage: lus[0].passage };
  }
  return { etat: 'en-cours', flux: lus };
}

/**
 * The working directory of the circuit of <ticket> in the main tree of <o> removed, once the queue
 * is done with the ticket closed: as the workspace of a pipeline, it lives as long as the ticket.
 */
export function retirerLeTravail(o, ticket) {
  rmSync(path.join(o.racine, '.claude', 'worktrees', `${ticket}.travail`), {
    recursive: true,
    force: true,
  });
}

/**
 * The CI of the candidate <sha> of the ticket <ticket> on its branch <branche> concluded with the
 * tools <o>, its verdict <verdict> (VERTE, `rouge`, SANS_CI or NON_LUE), its run <passage> and the
 * reason <raison> of a CI not read: what is said to the ticket and what becomes of the entry.
 * `{ avancer: true }`: green, main moves onto the candidate; `{ issue }`, the issue for the circuit
 * (src/temporal/file/deroule.ts): red, `rouvert`, its comment giving the address of the run and
 * the end of its failed log, the ticket reopened without `en-file`; no CI for the branch, or not
 * read, `en-file`, the ticket told why: no green, no entry.
 */
export function conclureLaCI(o, { ticket, sha, branche, verdict, passage = null, raison = null }) {
  const court = sha.slice(0, 7);
  const commenter = texte => commenterAu(o, ticket, texte);
  if (verdict === VERTE) {
    o.dire(`✓ CI de ${court} sur ${branche} verte (passage ${passage})`);
    return { avancer: true };
  }
  if (verdict === SANS_CI) {
    const texte = `## Aucune CI ne juge ${branche}\n\nAucun flux de ${DOSSIER_DES_FLUX} de ${court} ne se lance sur un push vers ${branche} : la CI du projet doit écouter agent/** (\`npx grillhouse maj\` l'ajoute à son flux). ${o.principale} n'avance pas sans son vert ; la branche reste en file, et la reprise du circuit la renvoie.`;
    commenter(texte);
    o.dire(`⚠ aucune CI ne juge ${branche} : la CI du projet doit écouter agent/**`);
    return {
      issue: {
        etat: 'en-file',
        raison: `aucune CI ne juge ${branche} : la CI du projet doit écouter agent/**`,
      },
    };
  }
  if (verdict === NON_LUE) {
    const texte = `## CI non lue\n\nLa CI de ${court} sur ${branche} n'a pas été lue : ${raison}\n\n${o.principale} n'avance pas sans son vert ; la branche reste en file, et la reprise du circuit la renvoie.`;
    commenter(texte);
    o.dire(`⚠ CI de ${court} non lue : ${raison}`);
    return { issue: { etat: 'en-file', raison: texte } };
  }
  const { gh } = o;
  const url =
    gh(['run', 'view', passage, '--json', 'url', '--jq', '.url']).stdout?.trim() || passage;
  const journal = `${gh(['run', 'view', passage, '--log-failed']).stdout ?? ''}`
    .trim()
    .split('\n')
    .slice(-60)
    .join('\n');
  commenter(
    `## CI rouge\n\nLa CI de ${court} sur ${branche} est rouge : ${url}\n\nLa fin de gh run view ${passage} --log-failed :\n\n${journal}\n\n${o.principale} n'avance pas et le ticket est rouvert : sa correction entre sous son numéro. Un rejeu vert de la même CI (\`gh run rerun ${passage} --failed\`), puis \`--reprendre\` du circuit, renvoie la branche, que la file juge au dernier essai ; un test connu instable se met en quarantaine dans le test, avec le ticket qui le corrige.`
  );
  o.bd('update', ticket, '--status', 'open', '--remove-label', 'en-file');
  o.dire(`✗ CI de ${court} sur ${branche} rouge (passage ${passage}) : ${ticket} rouvert`);
  return {
    issue: { etat: 'rouvert', raison: `La CI de ${court} sur ${branche} est rouge : ${url}` },
  };
}

/**
 * Where the lot of the ticket <ticket> stands, with the tools <o>: `{ statut, raison }`, its status
 * in Beads and its reason of closure.
 */
export function situerLeLot(o, ticket) {
  const show = o.bd('show', ticket, '--json');
  const t = show.status === 0 ? (JSON.parse(show.stdout)[0] ?? {}) : {};
  return { statut: t.status ?? null, raison: t.close_reason ?? null };
}

// The branch at <tip> replaced on the main <tete> in the queue's own copy, with the tools <o>:
// { nouveau } (the replaced commit), or { sortie: [titre, détail] } (it leaves the queue), or
// { garde } (it stays, the reason).
function remplacer(o, tip, tete) {
  const { racine, dire } = o;
  const copie = path.join(racine, '.claude', 'worktrees', 'file');
  if (existsSync(copie)) {
    spawnSync('git', ['-C', copie, 'rebase', '--abort'], { encoding: 'utf8' });
  }
  // The keys of the project, before any work: its generated files and its tools.
  let engendres;
  let env;
  try {
    engendres = engendresDe(racine);
    env = avecLesDonnees(donneesDe(racine), avecLesOutils(outilsDe(racine), process.env));
  } catch (e) {
    return { garde: `une clé grillhouse du package.json est refusée :\n${e.message}` };
  }
  const ouverte = ouvrirCopie({ racine, copie, ref: tete, dire });
  if (ouverte.refus) {
    return { garde: ouverte.refus };
  }
  const { dansCopie, monter, installer } = ouverte;
  if (dansCopie('checkout', '-q', '--detach', tip).status !== 0) {
    return { garde: `la copie ne prend pas ${tip.slice(0, 7)}` };
  }
  // A conflict on generated files the project declares only is no conflict: main's version is
  // taken, and their command writes them again once the branch is replaced (below).
  let rebase = dansCopie('rebase', tete);
  let tours = Number(dansCopie('rev-list', '--count', `${tete}..${tip}`).stdout.trim()) || 1;
  while (rebase.status !== 0) {
    const conflits = dansCopie('diff', '--name-only', '--diff-filter=U')
      .stdout.split('\n')
      .filter(Boolean);
    const engendresSeuls =
      tours-- > 0 &&
      conflits.length > 0 &&
      conflits.every(f => engendres.some(e => couvertPar(e.entiers, f))) &&
      dansCopie('checkout', '--ours', '--', ...conflits).status === 0 &&
      dansCopie('add', '--', ...conflits).status === 0;
    if (!engendresSeuls) {
      dansCopie('rebase', '--abort');
      return {
        sortie: [
          'elle ne se replace pas sur main.',
          conflits.length
            ? `Fichiers en conflit :\n${conflits.map(f => `  ${f}`).join('\n')}`
            : `Sortie de git :\n${rebase.stdout}${rebase.stderr}`,
        ],
      };
    }
    rebase = dansCopie('-c', 'core.editor=true', 'rebase', '--continue');
  }
  const installation = installer();
  if (installation) {
    return { sortie: [installation, "Le verrou de la branche replacée ne s'installe pas."] };
  }
  const touches = touchesPar(
    engendres,
    dansCopie('diff', '--name-only', '--no-renames', '-z', tete, 'HEAD')
      .stdout.split('\0')
      .filter(Boolean)
  );
  if (touches.length) {
    const refus = regenerer({
      refs: touches.map(e => ({ ...e, cadre: false })),
      dansCopie,
      lancer: commande =>
        spawnSync('bash', monter('sh', '-c', commande), {
          cwd: copie,
          encoding: 'utf8',
          maxBuffer: 256 * 1024 * 1024,
          env,
        }),
    });
    if (refus) {
      return { sortie: ['ses fichiers engendrés ne se régénèrent pas sur main.', refus] };
    }
    if (dansCopie('diff', '--cached', '--quiet').status !== 0) {
      const corrige = dansCopie('commit', '-q', '--amend', '--no-edit', '--no-verify');
      if (corrige.status !== 0) {
        return {
          garde: `ses fichiers régénérés n'entrent pas dans son commit :\n${corrige.stderr}`,
        };
      }
    }
    dire(`✓ fichiers engendrés régénérés sur main : ${touches.map(e => e.nom).join(', ')}`);
  }
  return { nouveau: dansCopie('rev-parse', 'HEAD').stdout.trim() };
}

/**
 * The branch of <entree> (`{ ticket, branche }`) made the candidate the CI judges, with the tools
 * <o>, against the main of the moment, without a word to the ticket: `{ candidat: { commit } }`,
 * the branch on top of main (replaced when main moved) and pushed to origin; `{ entre: { commit }
 * }`, a lot already on main (the branch points at the commit of main that delivers its ticket, or
 * each of its commits has its equivalent on main, or the branch is gone), as an attempt played
 * again after its worker died finds it: main does not move again; `{ sortie: [titre, détail] }`
 * (it leaves the queue: gone, not replaced); `{ garde }` (it stays in the queue, the reason);
 * `{ ecartee: true }` (nothing ahead of main).
 */
export function preparerLaBranche(o, entree) {
  const git = (...args) => spawnSync('git', ['-C', o.racine, ...args], { encoding: 'utf8' });
  const refPrincipale = `refs/heads/${o.principale}`;
  const refBranche = `refs/heads/${entree.branche}`;
  const tip = git('rev-parse', '--verify', '-q', refBranche).stdout.trim();
  const livre = lotSurMain(o, entree.ticket);
  // A lot on main whose branch is gone (a closure that failed after its deletion) is entered.
  if (!tip) {
    return livre ? { entre: { commit: livre } } : { sortie: ["la branche n'existe plus.", ''] };
  }
  const enAvance = Number(git('rev-list', '--count', `${refPrincipale}..${tip}`).stdout.trim());
  // The lot is on main when the branch points at the commit of main that delivers the ticket
  // (main moved onto it by fast-forward), or when each commit of the branch has its equivalent on
  // main (the same patch, git cherry), the replay a rebase wrote: a lot of before of a ticket
  // reopened is neither, its branch at main's or ahead of it by new commits.
  if (livre) {
    const cerise = git('cherry', refPrincipale, tip).stdout.split('\n').filter(Boolean);
    const rejeu = enAvance > 0 && cerise.length > 0 && cerise.every(l => l.startsWith('- '));
    if (tip === livre || rejeu) {
      return { entre: { commit: livre } };
    }
  }
  if (enAvance === 0) {
    return { ecartee: true };
  }
  const tete = git('rev-parse', refPrincipale).stdout.trim();
  let candidat = tip;
  if (git('merge-base', '--is-ancestor', tete, tip).status !== 0) {
    const r = remplacer(o, tip, tete);
    if (!r.nouveau) {
      return r;
    }
    const pose = git('update-ref', refBranche, r.nouveau, tip);
    if (pose.status !== 0) {
      return {
        garde: `${entree.branche} ne prend pas ${r.nouveau.slice(0, 7)} :\n${pose.stderr}`.trim(),
      };
    }
    candidat = r.nouveau;
  }
  const pousse = spawnSync(
    'git',
    ['-C', o.racine, 'push', '-q', '--force', 'origin', `${candidat}:${refBranche}`],
    { encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }
  );
  if (pousse.status !== 0) {
    return {
      garde: `la poussée de ${candidat.slice(0, 7)} vers origin/${entree.branche} est refusée :\n${pousse.stderr.trim()}`,
    };
  }
  o.dire(`✓ ${entree.branche} poussée en ${candidat.slice(0, 7)} : sa CI la juge`);
  return { candidat: { commit: candidat } };
}

/**
 * Main moved forward onto the candidate <commit> of <entree> (`{ ticket, branche, commit }`) once
 * its CI judged it, with the tools <o>, by fast-forward: the tree that enters is the tree the CI
 * judged. `{ entre: { commit } }`, main at <commit> (or <commit> already on main, an attempt
 * played again); `{ bouge: true }`, main moved meanwhile and the candidate is no longer on top of
 * it, which the workflow replaces and judges again; `{ garde }`, main does not move, the reason.
 */
export function avancerMain(o, entree) {
  const git = (...args) => spawnSync('git', ['-C', o.racine, ...args], { encoding: 'utf8' });
  const refPrincipale = `refs/heads/${o.principale}`;
  // The candidate already on main: an attempt played again after main moved onto it.
  if (git('merge-base', '--is-ancestor', entree.commit, refPrincipale).status === 0) {
    return { entre: { commit: entree.commit } };
  }
  const tete = git('rev-parse', refPrincipale).stdout.trim();
  if (git('merge-base', '--is-ancestor', tete, entree.commit).status !== 0) {
    return { bouge: true };
  }
  const avance = git('merge', '-q', '--ff-only', entree.commit);
  if (avance.status !== 0) {
    if (git('rev-parse', refPrincipale).stdout.trim() !== tete) {
      return { bouge: true };
    }
    return {
      garde:
        `${o.principale} n'avance pas sur ${entree.commit.slice(0, 7)} :\n${avance.stdout}${avance.stderr}`.trim(),
    };
  }
  return { entre: { commit: entree.commit } };
}

// The capabilities of the ticket <ticket> (its `labels`, `export:<capability>` each) delivered by
// `bd ship <capability>`, which sets `provides:<capability>`, the signal that the queue of another
// project reads. A `bd ship` that fails is a fault named, never ignored: its comment at the
// ticket says it whole, `livraison` in one line (the capability and Beads' reason), the other
// capabilities still delivered; null without a fault.
function livrerLesCapacites(o, ticket, labels) {
  const fautes = [];
  for (const cap of labels.filter(l => l.startsWith('export:')).map(l => l.slice(7))) {
    const r = o.bd('ship', cap);
    if (r.status !== 0) {
      const raison = `${r.stderr ?? ''}`.trim() || `${r.stdout ?? ''}`.trim() || `code ${r.status}`;
      commenterAu(
        o,
        ticket,
        `La livraison de la capacité ${cap} n'est pas faite : \`bd ship ${cap}\` échoue :\n${raison}\n\nLe ticket est fermé ; la capacité reste à livrer.`
      );
      o.dire(`⚠ bd ship ${cap} échoue`);
      fautes.push(`bd ship ${cap} échoue : ${enUneLigne(raison)}`);
    }
  }
  return { livraison: fautes.length > 0 ? fautes.join(' ; ') : null };
}

/**
 * The ticket of <entree> (`{ ticket, branche, commit }`) entered on main at <commit>, with the
 * tools <o>: it closes « intégré : <commit> » and loses `en-file` (a ticket already closed is left
 * as it is), the branch is deleted, then main is pushed to origin on the branch
 * `grillhouse.poussee.commit` of main's package.json and the branch deleted on origin; the queue
 * is then done with the ticket, and removes the working directory of its circuit
 * (`retirerLeTravail`). Each of its gestures replays without harm (a ticket closed is left closed,
 * a branch gone stays gone, a commit pushed is pushed again as it is), and never reopens the
 * ticket; its comments are effects (`commenterAu`), which the workflow of the queue writes once
 * each. `{ poussee, raison }`: the branch pushed to, or null and why, in one line (`enUneLigne`),
 * its comment at the ticket whole.
 */
export function fermerLEntree(o, entree) {
  const { racine } = o;
  const git = (...args) => spawnSync('git', ['-C', racine, ...args], { encoding: 'utf8' });
  const court = entree.commit.slice(0, 7);
  const commenter = texte => commenterAu(o, entree.ticket, texte);
  const show = o.bd('show', entree.ticket, '--json');
  const lu = show.status === 0 ? (JSON.parse(show.stdout)[0] ?? null) : null;
  if ((lu?.status ?? null) !== 'closed') {
    o.bd('update', entree.ticket, '--remove-label', 'en-file');
    o.bd('close', entree.ticket, '--reason', `${INTEGRE}${court}`);
  }
  // The capabilities the ticket exports (`export:<capability>`) are delivered once it is closed.
  const ferme = livrerLesCapacites(o, entree.ticket, lu?.labels ?? []);
  o.dire(`✓ ${entree.branche} entre sur ${o.principale} : ${court}`);
  if (git('rev-parse', '--verify', '-q', `refs/heads/${entree.branche}`).status === 0) {
    const efface = git('branch', '-D', entree.branche);
    if (efface.status !== 0) {
      commenter(
        `La branche ${entree.branche} reste en place après son entrée sur ${o.principale} (${efface.stderr.trim()}) : sa copie est encore en place. Le ticket est fermé.`
      );
      o.dire(`⚠ ${entree.branche} n'est pas effacée`);
    }
  }
  retirerLeTravail(o, entree.ticket);
  const paquet = git('show', `refs/heads/${o.principale}:package.json`);
  const { commit, faute } = lireCommit(paquet.status === 0 ? JSON.parse(paquet.stdout) : null);
  if (faute) {
    const raison = `Poussée non faite : grillhouse.poussee.commit vaut ${faute}, pas un nom de branche.`;
    commenter(raison);
    return { poussee: null, raison: enUneLigne(raison), ...ferme };
  }
  const sansInvite = { encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } };
  const pousse = spawnSync(
    'git',
    ['-C', racine, 'push', 'origin', `${entree.commit}:refs/heads/${commit}`],
    sansInvite
  );
  if (pousse.status !== 0) {
    const raison = `La poussée de ${court} vers origin/${commit} (grillhouse.poussee.commit) est refusée :\n${pousse.stderr.trim()}`;
    commenter(raison);
    o.dire(`⚠ poussée de ${court} refusée`);
    return { poussee: null, raison: enUneLigne(raison), ...ferme };
  }
  o.dire(`✓ poussée : ${court} est sur origin/${commit}`);
  // The branch the CI judged leaves origin with its entry; one already gone is no fault.
  const distante = spawnSync(
    'git',
    ['-C', racine, 'push', '-q', 'origin', '--delete', `refs/heads/${entree.branche}`],
    sansInvite
  );
  if (distante.status !== 0) {
    o.dire(`⚠ origin/${entree.branche} n'est pas effacée : ${distante.stderr.trim()}`);
  }
  return { poussee: commit, raison: null, ...ferme };
}

/**
 * What the outcome <r> of `preparerLaBranche` or `avancerMain` for <entree> says to its ticket,
 * with the tools <o>: a branch out of the queue reopens it, its files named; a branch set aside
 * loses `en-file`, the ticket left open; a branch kept, the reason. `{ etat, raison }`: `rouvert`
 * or `en-file`, as the circuit reads the queue.
 */
export function direLIssue(o, entree, r) {
  const commenter = texte => commenterAu(o, entree.ticket, texte);
  if (r.sortie) {
    const [titre, detail] = r.sortie;
    const texte = `## Sortie de la file\n\nLa branche ${entree.branche} ne peut pas entrer sur ${o.principale} : ${titre}\n${detail}\n\nLa branche reste en place ; la relance du ticket remet son lot en travail local sur ${o.principale}.`;
    o.bd('update', entree.ticket, '--status', 'open', '--remove-label', 'en-file');
    commenter(texte);
    o.dire(`✗ ${entree.branche} sort de la file : ${titre}`);
    return { etat: 'rouvert', raison: texte };
  }
  if (r.ecartee) {
    const texte = `## Sortie de la file\n\nLa branche ${entree.branche} n'a rien en avance sur ${o.principale} : elle n'entre pas, et le ticket reste ouvert.`;
    o.bd('update', entree.ticket, '--remove-label', 'en-file');
    commenter(texte);
    o.dire(`⚠ ${entree.branche} n'a rien en avance sur ${o.principale} : elle sort de la file`);
    return { etat: 'rouvert', raison: texte };
  }
  const texte = `## La file garde la branche\n\nLa branche ${entree.branche} reste en file : ${r.garde}`;
  commenter(texte);
  o.dire(`⚠ ${entree.branche} reste en file : ${r.garde}`);
  return { etat: 'en-file', raison: texte };
}
