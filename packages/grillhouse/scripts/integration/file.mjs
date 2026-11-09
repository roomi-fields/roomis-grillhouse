// The gestures of the queue, which brings the branches `agent/<ticket>` the integration committed
// onto main, one at a time: the workflow of the queue of a project (`file:<racine>`,
// src/temporal/file/deroule.ts) plays them, each in an act of its own (scripts/faits-du-circuit.mjs),
// for the entries the circuits of the tickets send it at their step 5.2, in their order of arrival.
//
// For each branch, against the main of the moment (`avancerMain`):
//  - main is an ancestor of the branch (main has not moved since its base): main moves forward onto
//    the branch (`merge --ff-only`), nothing replayed;
//  - main has moved: the branch is replaced on main in the queue's own copy
//    (`.claude/worktrees/file`, made ready by scripts/integration/rejeu.mjs), its dependencies made
//    to agree with the lock file and the manifests of the branch once replaced (an install that
//    fails makes the branch leave the queue, « Les dépendances de la copie ne s'installent pas. »,
//    its tests not played), and the same command as the integration's replays it there:
//    `npm run verifier` (Turborepo: the build, then the guards and every test of the day beside
//    each other, each task replayed from the cache of the main tree when its inputs are
//    unchanged), every command of the project run in the copy leaving its index up to date
//    (rejeu.mjs); main moves forward onto the replaced branch when `npm run verifier` is green.
//    A generated file the project declares (`grillhouse.engendres`, scripts/engendres.mjs, read
//    from the main tree, a faulty key keeping the branch in the queue, named) is never merged, as
//    npm writes package-lock.json again after a merge: a conflict on such files only takes main's
//    version, and once the branch is replaced and installed, the command of each one whose files,
//    or the files it reads, the branch touches writes it again, with the tools of the project,
//    and what it writes enters the branch's commit; a command that fails makes the branch leave
//    the queue, the command and its output named (OSC Bridge, 2026-10-31: four conflicts in one
//    day on the generated files of synthhub and open-synth-descriptors);
//  - a branch with nothing ahead of main does not enter: it leaves the queue, its ticket loses
//    `en-file` and takes a comment, and stays as it is;
//  - a branch that does not replace (the files in conflict) or whose `npm run verifier` is red once
//    replaced leaves the queue: its ticket loses `en-file`, reopens with a comment that
//    names the files or ends with the output of the tests, and the branch stays where it is, for
//    the resumption of its circuit;
//  - a branch whose replay cannot be done (the copy does not get ready, main does not take the
//    branch, the main tree holds a file of the lot), or whose `npm run verifier` is « à repasser »
//    once replaced (75: the wait for the lock of the machine reached its bound,
//    scripts/verrou-de-machine.mjs; neither green nor red), stays in the queue, the reason written to its
//    ticket, which is neither reopened nor closed, and the queue goes on; the circuit of the ticket
//    stops at « a-repasser », and its resumption sends the branch again. Any other code than 0 and
//    75 is red.
// At its entry on main, the branch's ticket closes « intégré : <commit> », loses `en-file`, and the
// branch is deleted; a branch git does not delete (its copy still in place) is written to the
// ticket, which closes all the same. The working directory of its circuit
// (`.claude/worktrees/<ticket>.travail`, scripts/circuit.mjs), which lives as long as the ticket
// and holds the progress the board reads, the CI's included, is removed when the queue is done
// with the ticket closed: its CI concluded, or its push not made (`retirerLeTravail`). Then main is pushed to origin, on the branch
// `grillhouse.poussee.commit` of main's package.json (`main` without the key); a refused push is
// written to the ticket and does not stop the queue.
// Once pushed, the queue reads the CI of the commit pushed, as a merge queue waits for its checks.
// As GitHub's required checks name what a merge waits for, a check that does not exist is not
// waited for: the queue first reads, in the commit pushed, the workflows that run on a push to the
// branch it pushes to (`fluxDeLaBranche`, the files `.github/workflows/*.yml` and `*.yaml`, their
// `on` and its filters as GitHub reads them); with none, the ticket is told in one line that
// there is no CI for that branch, and nothing is waited for. A workflow the queue cannot judge (a
// file it cannot read, a filter on the paths) counts as one that runs. With one, each reading
// (`lireUneFoisLaCI`) looks for its run (`gh run list --commit <sha> --json
// databaseId,status,conclusion`), then reads it (`gh run view <id> --json status,conclusion,jobs`),
// as `gh run watch` does; the workflow of the CI of the commit spaces the readings and bounds the
// search and the wait (`ciDuCommit`). Green on the conclusion `success`, red on any other. Under
// the circuit's progress directory (scripts/avancement.mjs), each reading writes there the steps
// of the run done over planned, which the board shows. A red CI reopens the ticket (`bd reopen`),
// its comment giving the address of the run (`gh run view <id> --json url`) and the end of `gh run
// view <id> --log-failed` (`conclureLaCI`). Without `gh`, without a run found, with `gh` refusing
// or past the wait, the ticket is told that the CI was not read, and why, and stays closed. The
// run is read at its current attempt (`gh run view <id>` without `--attempt`), as a merge queue
// judges the last attempt of a commit's checks: after a red CI, `--reprendre` reads again the CI
// of the ticket's commit on main (`situerLeLot`), once the supervisor had the failed jobs run
// again (`gh run rerun <id> --failed`); green, the ticket closes « intégré : <commit> », the run
// named at it; red or not read, it stays open, the reading at the ticket. A flaky test has no path
// of its own: the red comment gives the charter's rule, a test known red goes into quarantine in
// the test itself, with the ticket that fixes it.
// Every comment and change of the queue at a ticket is written under the author `file`, which bd
// reads in BEADS_ACTOR, as the circuit writes its own lines under `circuit`.
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { couvertPar, engendresDe, regenerer, touchesPar } from '../engendres.mjs';
import { avecLesDonnees, donneesDe } from '../donnees-cles.mjs';
import { avecLesOutils, outilsDe } from '../outils-cles.mjs';
import { lireCommit } from '../poussee-cles.mjs';
import { commitsDelivering, gitLog } from '../un-commit-par-ticket.mjs';
import { ouvrirCopie } from './rejeu.mjs';
import { A_REPASSER } from '../codes-de-sortie.mjs';
import { ecrireTache } from '../mesure/avancement.mjs';
import { ACTEUR, emettre } from '../effets.mjs';
import { enUneLigne } from '../ticket-du-circuit.mjs';

const ESSAIS_PAR_BRANCHE = 5;
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
// `tags` or `tags-ignore` alone run on no branch. A filter on the paths, or a form the queue does
// not judge, counts as one that runs.
function pousseeSurLaBranche(push, branche) {
  if (push === null || push === undefined) {
    return true;
  }
  if (typeof push !== 'object' || Array.isArray(push)) {
    return true;
  }
  if (push.paths || push['paths-ignore']) {
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

// The workflows of the commit <sha> of the repository <racine> that run on a push to <branche>:
// their paths.
function fluxDuCommit(racine, sha, branche) {
  const git = (...a) => spawnSync('git', ['-C', racine, ...a], { encoding: 'utf8' });
  const l = git('ls-tree', '--name-only', `${sha}:${DOSSIER_DES_FLUX}`);
  const noms = l.status === 0 ? l.stdout.split('\n').filter(n => EXTENSIONS_DES_FLUX.test(n)) : [];
  const fichiers = noms.map(n => {
    const chemin = `${DOSSIER_DES_FLUX}/${n}`;
    const f = git('show', `${sha}:${chemin}`);
    return { chemin, texte: f.status === 0 ? f.stdout : null };
  });
  return fluxDeLaBranche(fichiers, branche);
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
 * }` (gh absent, refusing, or its output unreadable). The run is read at its current attempt
 * (`gh run view <id>` without `--attempt`). A run found is read at once. It writes nothing to the
 * ticket: `conclureLaCI` does.
 */
export function lireUneFoisLaCI(o, { sha, branche, passage = null }) {
  const { gh } = o;
  let id = passage;
  if (id === null) {
    if (fluxDuCommit(o.racine, sha, branche).length === 0) {
      return { etat: SANS_CI };
    }
    const r = gh(['run', 'list', '--commit', sha, '--json', 'databaseId,status,conclusion']);
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
 * The CI of the commit <sha> of the ticket <ticket> concluded with the tools <o>, its verdict
 * <verdict> (VERTE, `rouge`, SANS_CI or NON_LUE), its run <passage> and the reason <raison> of a CI
 * not read, after the queue's entry, or read again (<relue>, on `--reprendre`): what is said to the
 * ticket and what becomes of it. No CI, the ticket is told so in one line; not read, it is told
 * why; red, its comment gives the address of the run and the end of its failed log, and the
 * queue's entry reopens it (read again, it stays open). Green or no CI read again, the ticket
 * closes « intégré : <commit> », its run named. `{ etat, raison }`: `ferme` or `rouvert`, as the
 * circuit reads the issue of the queue (src/temporal/file/deroule.ts); `ferme`, the working
 * directory of its circuit is removed (`retirerLeTravail`).
 */
export function conclureLaCI(
  o,
  { ticket, sha, branche, verdict, passage = null, raison = null, relue = false }
) {
  const court = sha.slice(0, 7);
  const commenter = texte => commenterAu(o, ticket, texte);
  if (verdict === SANS_CI) {
    const texte = `Aucune CI pour origin/${branche} : aucun flux de ${DOSSIER_DES_FLUX} de ${court} ne se lance sur la branche ${branche}, la file n'en attend pas.`;
    commenter(texte);
    o.dire(`✓ ${texte}`);
  } else if (verdict === NON_LUE) {
    commenter(`## CI non lue\n\nLa CI de ${court} n'a pas été lue : ${raison}`);
    o.dire(`⚠ CI de ${court} non lue : ${raison}`);
  } else if (verdict === VERTE) {
    o.dire(`✓ CI de ${court} verte (passage ${passage})`);
  } else {
    const { gh } = o;
    const url =
      gh(['run', 'view', passage, '--json', 'url', '--jq', '.url']).stdout?.trim() || passage;
    const journal = `${gh(['run', 'view', passage, '--log-failed']).stdout ?? ''}`
      .trim()
      .split('\n')
      .slice(-60)
      .join('\n');
    commenter(
      `## CI rouge\n\nLa CI de ${court} sur ${o.principale} est rouge : ${url}\n\nLa fin de gh run view ${passage} --log-failed :\n\n${journal}\n\nLe ticket est rouvert : sa correction entre sous son numéro. Un rejeu vert de la même CI (\`gh run rerun ${passage} --failed\`), puis \`--reprendre\` du circuit, le ferme ; un test connu instable se met en quarantaine dans le test, avec le ticket qui le corrige.`
    );
    o.dire(`✗ CI de ${court} rouge (passage ${passage}) : ${ticket} rouvert`);
    if (!relue) {
      o.bd('reopen', ticket);
    }
    return { etat: 'rouvert', raison: `La CI de ${court} est rouge : ${url}` };
  }
  if (!relue) {
    retirerLeTravail(o, ticket);
    return {
      etat: 'ferme',
      raison:
        verdict === NON_LUE ? `${INTEGRE}${court} ; CI non lue : ${raison}` : `${INTEGRE}${court}`,
    };
  }
  if (verdict === NON_LUE) {
    return { etat: 'rouvert', raison: `CI non relue : ${raison}` };
  }
  o.bd('close', ticket, '--reason', `${INTEGRE}${court}`);
  if (passage) {
    commenter(
      `## CI relue\n\nLa CI de ${court} sur ${o.principale} est verte au dernier essai du passage ${passage} : le ticket se ferme.`
    );
  }
  o.dire(`✓ ${ticket} fermé : ${court} est sur ${o.principale}`);
  retirerLeTravail(o, ticket);
  return { etat: 'ferme', raison: `${INTEGRE}${court}` };
}

/**
 * Where the lot of the ticket <ticket> stands, with the tools <o>: `{ statut, raison, aEntrer,
 * commit, branche, surOrigin, raisonOrigin, faute }`, its status in Beads and its reason of
 * closure, whether its branch `agent/<ticket>` holds a lot ahead of main (which enters by the
 * queue), the commit of main that delivers it (`lotSurMain`, null without one), the branch it was
 * pushed to (`grillhouse.poussee.commit`), whether that commit is on that branch of origin
 * (`surOrigin`: « oui », « non » for a closure that failed before its push, or « inconnu » when
 * origin does not answer, `raisonOrigin` its reason), and the fault of that key (null when it
 * reads).
 */
export function situerLeLot(o, ticket) {
  const show = o.bd('show', ticket, '--json');
  const t = show.status === 0 ? (JSON.parse(show.stdout)[0] ?? {}) : {};
  const git = (...a) => spawnSync('git', ['-C', o.racine, ...a], { encoding: 'utf8' });
  const paquet = git('show', `refs/heads/${o.principale}:package.json`);
  const { commit: branche, faute } = lireCommit(
    paquet.status === 0 ? JSON.parse(paquet.stdout) : null
  );
  const enAvance = git(
    'rev-list',
    '--count',
    `refs/heads/${o.principale}..refs/heads/agent/${ticket}`
  );
  const commit = lotSurMain(o, ticket);
  const origine =
    commit && !faute ? surOrigin(o, commit, branche) : { surOrigin: 'non', raison: null };
  return {
    statut: t.status ?? null,
    raison: t.close_reason ?? null,
    aEntrer: enAvance.status === 0 && Number(enAvance.stdout.trim()) > 0,
    commit,
    branche: faute ? null : branche,
    surOrigin: origine.surOrigin,
    raisonOrigin: origine.raison,
    faute: faute ?? null,
  };
}

// Whether the commit <commit> is on the branch <branche> of origin, with the tools <o>: « oui »,
// « non », or « inconnu » when origin does not answer (`git ls-remote`, without a prompt, as the
// push) or its tip is not known here (`merge-base --is-ancestor` neither 0 nor 1), its reason
// named: a place that does not read is never « not pushed ».
function surOrigin(o, commit, branche) {
  const ls = spawnSync(
    'git',
    ['-C', o.racine, 'ls-remote', '--heads', 'origin', `refs/heads/${branche}`],
    {
      encoding: 'utf8',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    }
  );
  if (ls.status !== 0) {
    const raison =
      `${ls.stderr ?? ''}`.trim().split('\n')[0] || ls.error?.message || `code ${ls.status}`;
    return { surOrigin: 'inconnu', raison: `git ls-remote origin ${branche} : ${raison}` };
  }
  const pointe = ls.stdout.split(/\s/)[0] ?? '';
  if (!pointe) {
    return { surOrigin: 'non', raison: null };
  }
  // `--is-ancestor` answers 0 (an ancestor) or 1 (not one); any other code (the tip of origin
  // unknown here, 128) does not say: « inconnu », its reason named.
  const git = (...a) => spawnSync('git', ['-C', o.racine, ...a], { encoding: 'utf8' });
  const ancetre = git('merge-base', '--is-ancestor', commit, pointe);
  if (ancetre.status === 0) {
    return { surOrigin: 'oui', raison: null };
  }
  if (ancetre.status === 1) {
    return { surOrigin: 'non', raison: null };
  }
  const raison =
    `${ancetre.stderr ?? ''}`.trim().split('\n')[0] ||
    ancetre.error?.message ||
    `code ${ancetre.status}`;
  return {
    surOrigin: 'inconnu',
    raison: `git merge-base --is-ancestor ${commit.slice(0, 7)} origin/${branche} : ${raison}`,
  };
}

// The commit of main that delivers the ticket <ticket> (its title line names it,
// `commitsDelivering` of ../un-commit-par-ticket.mjs, the prefix read from bd), the last one, in
// full; null without one.
function lotSurMain(o, ticket) {
  const git = (...a) => spawnSync('git', ['-C', o.racine, ...a], { encoding: 'utf8' });
  const prefixe = o.bd('config', 'get', 'issue_prefix').stdout?.trim() ?? '';
  return (
    commitsDelivering(ticket, prefixe, gitLog(o.racine))
      .map(c => git('rev-parse', '--verify', '-q', `${c}^{commit}`).stdout.trim())
      .find(
        c => c && git('merge-base', '--is-ancestor', c, `refs/heads/${o.principale}`).status === 0
      ) ?? null
  );
}

// The branch of <entree> replaced on the main <tete> in the queue's own copy, replayed, with the
// tools <o>: { nouveau } (the commit to move main onto), or { sortie: [titre, détail] } (it leaves
// the queue), or { garde } (it stays, the reason).
function rejouer(o, tip, tete, ticketRejoue = null) {
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
  const { dansCopie, monter, installer, tester } = ouverte;
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
  dire('— npm run verifier (construction, gardes, tests)');
  const t = tester({ sorte: 'File', ticket: ticketRejoue });
  if (t.status === A_REPASSER) {
    return {
      garde: `son \`npm run verifier\` est à repasser (code ${A_REPASSER}) une fois replacée : l'attente de la machine a atteint sa borne. Ni vert ni rouge ; la prochaine file la rejoue.`,
    };
  }
  if (t.status !== 0) {
    const fin = `${t.stdout}${t.stderr}`.trim().split('\n').slice(-40).join('\n');
    return { sortie: ['ses tests sont rouges une fois la branche replacée.', fin] };
  }
  return { nouveau: dansCopie('rev-parse', 'HEAD').stdout.trim() };
}

/**
 * Main moved onto the branch of <entree> (`{ ticket, branche }`) with the tools <o>, against the
 * main of the moment, without a word to the ticket: `{ entre: { commit } }`, main at <commit>;
 * `{ sortie: [titre, détail] }` (it leaves the queue: gone, not replaced, red once replaced);
 * `{ garde }` (it stays in the queue, the reason); `{ ecartee: true }` (nothing ahead of main). A
 * lot already on main (the branch points at the commit of main that delivers its ticket, or each
 * of its commits has its equivalent on main, or the branch is gone), as an attempt played again
 * after its worker died finds it, is entered: main does not move again.
 */
export function avancerMain(o, entree) {
  const git = (...args) => spawnSync('git', ['-C', o.racine, ...args], { encoding: 'utf8' });
  const refPrincipale = `refs/heads/${o.principale}`;
  const tip = git('rev-parse', '--verify', '-q', `refs/heads/${entree.branche}`).stdout.trim();
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
  for (let essai = 0; essai < ESSAIS_PAR_BRANCHE; essai++) {
    const tete = git('rev-parse', refPrincipale).stdout.trim();
    let nouveau = tip;
    if (git('merge-base', '--is-ancestor', tete, tip).status !== 0) {
      const r = rejouer(o, tip, tete, entree.ticket);
      if (!r.nouveau) {
        return r;
      }
      nouveau = r.nouveau;
    }
    if (nouveau !== tete) {
      const avance = git('merge', '-q', '--ff-only', nouveau);
      if (avance.status !== 0) {
        if (git('rev-parse', refPrincipale).stdout.trim() !== tete) {
          continue;
        }
        return {
          garde:
            `${o.principale} n'avance pas sur ${nouveau.slice(0, 7)} :\n${avance.stdout}${avance.stderr}`.trim(),
        };
      }
    }
    return { entre: { commit: nouveau } };
  }
  return { garde: `${o.principale} bouge sans cesse : cinq essais n'ont pas suffi.` };
}

/**
 * The ticket of <entree> (`{ ticket, branche, commit }`) entered on main at <commit>, with the
 * tools <o>: it closes « intégré : <commit> » and loses `en-file` (a ticket already closed is left
 * as it is), <apresLaFermeture> runs (the queue on its file removes its entry there), the branch is
 * deleted, then main is pushed to origin on the branch `grillhouse.poussee.commit` of main's
 * package.json; a push not made ends the queue's work on the ticket, and removes the working
 * directory of its circuit (`retirerLeTravail`), which the conclusion of its CI removes otherwise. Each of its gestures replays without
 * harm (a ticket closed is left closed, a branch gone stays gone, a commit pushed is pushed again
 * as it is), and never reopens the ticket; its comments are effects (`commenterAu`), which the
 * workflow of the queue writes once each. `{ poussee, raison }`: the branch pushed to, or null and
 * why, in one line (`enUneLigne`), its comment at the ticket whole.
 */
export function fermerLEntree(o, entree, apresLaFermeture = () => {}) {
  const { racine } = o;
  const git = (...args) => spawnSync('git', ['-C', racine, ...args], { encoding: 'utf8' });
  const court = entree.commit.slice(0, 7);
  const commenter = texte => commenterAu(o, entree.ticket, texte);
  const show = o.bd('show', entree.ticket, '--json');
  const statut = show.status === 0 ? (JSON.parse(show.stdout)[0]?.status ?? null) : null;
  if (statut !== 'closed') {
    o.bd('update', entree.ticket, '--remove-label', 'en-file');
    o.bd('close', entree.ticket, '--reason', `${INTEGRE}${court}`);
  }
  apresLaFermeture();
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
  const paquet = git('show', `refs/heads/${o.principale}:package.json`);
  const { commit, faute } = lireCommit(paquet.status === 0 ? JSON.parse(paquet.stdout) : null);
  if (faute) {
    const raison = `Poussée non faite : grillhouse.poussee.commit vaut ${faute}, pas un nom de branche.`;
    commenter(raison);
    retirerLeTravail(o, entree.ticket);
    return { poussee: null, raison: enUneLigne(raison) };
  }
  const pousse = spawnSync(
    'git',
    ['-C', racine, 'push', 'origin', `${entree.commit}:refs/heads/${commit}`],
    { encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }
  );
  if (pousse.status !== 0) {
    const raison = `La poussée de ${court} vers origin/${commit} (grillhouse.poussee.commit) est refusée :\n${pousse.stderr.trim()}`;
    commenter(raison);
    o.dire(`⚠ poussée de ${court} refusée`);
    retirerLeTravail(o, entree.ticket);
    return { poussee: null, raison: enUneLigne(raison) };
  }
  o.dire(`✓ poussée : ${court} est sur origin/${commit}`);
  return { poussee: commit, raison: null };
}

/**
 * What the outcome <r> of `avancerMain` for <entree> says to its ticket, with the tools <o>: a
 * branch out of the queue reopens it, its files or its red named; a branch set aside loses
 * `en-file`, the ticket left open; a branch kept, the reason. `{ etat, raison }`: `rouvert` or
 * `en-file`, as the circuit reads the queue.
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
