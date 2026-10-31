#!/usr/bin/env node
// The queue: brings the branches `agent/<ticket>` the integration committed onto main, one at a time,
// in their order of arrival (scripts/integration/file-attente.mjs). Run from the main tree by the
// circuit of a ticket (scripts/circuit.mjs), once it has put the ticket's branch in the queue, and
// by the supervisor by hand.
//
//   npx grillhouse file [--ci <ticket>]
//
// No argument, or `--ci <ticket>` (below; exit 2 and the usage otherwise). It takes the branches waiting one by one until none is
// left, then exits 0, whatever became of each branch. A queue launched while another runs exits 0 at
// once, refusing nothing: the running queue takes the branch that arrived (it reads the entries
// again before it lets go of its lock, `.git/file-integration.lock`).
//
// For each branch, against the main of the moment:
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
//    (rejeu.mjs); main moves forward onto the replaced branch when `npm run verifier` is green;
//  - a branch with nothing ahead of main does not enter: it leaves the queue, its ticket loses
//    `en-file` and takes a comment, and stays as it is;
//  - a branch that does not replace (the files in conflict) or whose `npm run verifier` is red once
//    replaced leaves the queue: its ticket loses `en-file`, reopens with a comment that
//    names the files or ends with the output of the tests, and the branch stays where it is, for
//    the relaunch of its ticket (scripts/enveloppe/lancer.sh);
//  - a branch whose replay cannot be done (the copy does not get ready, main does not take the
//    branch, the main tree holds a file of the lot), or whose `npm run verifier` is « à repasser »
//    once replaced (75: a failure of duration under load, which found no rest in its bound,
//    scripts/langages/typescript/verifier.mjs; neither green nor red), stays in the queue, the reason written to its
//    ticket, which is neither reopened nor closed, and the queue goes on; the next queue takes it
//    again. Any other code than 0 and 75 is red.
// At its entry on main, the branch's ticket closes « intégré : <commit> », loses `en-file`, the
// working directory of its circuit (`.claude/worktrees/<ticket>.travail`, scripts/circuit.mjs),
// which lives as long as the ticket, is removed, and the branch is deleted; a branch git does not delete (its copy still in place) is written to the
// ticket, which closes all the same. Then main is pushed to origin, on the branch
// `grillhouse.poussee.commit` of main's package.json (`main` without the key); a refused push is
// written to the ticket and does not stop the queue.
// Once pushed, the queue reads the CI of the commit pushed, as a merge queue waits for its checks.
// As GitHub's required checks name what a merge waits for, a check that does not exist is not
// waited for: the queue first reads, in the commit pushed, the workflows that run on a push to the
// branch it pushes to (`fluxDeLaBranche`, the files `.github/workflows/*.yml` and `*.yaml`, their
// `on` and its filters as GitHub reads them); with none, the ticket is told in one line that
// there is no CI for that branch, and nothing is waited for. A workflow the queue cannot judge (a
// file it cannot read, a filter on the paths) counts as one that runs. With one, it looks for its
// run (`gh run list --commit <sha> --json databaseId,status,conclusion`) for 2 min at most
// (GRILLHOUSE_CI_RECHERCHE_MS replaces it, in milliseconds), the time the CI takes to create it,
// then reads it (`gh run view <id> --json status,conclusion,jobs`) every 10 s
// (GRILLHOUSE_CI_PAS_MS), as `gh run watch` does, until it completes, for 30 min at most
// (GRILLHOUSE_CI_ATTENTE_MS): green on the conclusion `success`, red on any other. Under the
// circuit's progress directory (GRILLHOUSE_AVANCEMENT, scripts/avancement.mjs), each reading writes
// there the steps of the run done over planned, which the board shows; the queue's own runs of
// `npm run verifier` play out of it. A red CI reopens the ticket (`bd reopen`), its comment giving the
// address of the run (`gh run view <id> --json url`) and the end of `gh run view <id>
// --log-failed`. Without `gh`, without a run found, with `gh` refusing or past the 30 min, the
// ticket is told that the CI was not read, and why, and stays closed. The run is read at its current
// attempt (`gh run view <id>` without `--attempt`), as a merge queue judges the last attempt of a
// commit's checks.
// `--ci <ticket>` reads again the CI of a ticket a red CI reopened, which the circuit runs at 5.2
// on `--reprendre` (scripts/circuit.mjs, `argumentsDeLaFile`), once the supervisor had the failed
// jobs run again (`gh run rerun <id> --failed`): the commit of main that delivers the ticket, its
// CI read as above (`relireCI`); green, the ticket closes « intégré : <commit> », the run named at
// it; red or not read, it stays open, the reading at the ticket. A flaky test has no path of its
// own: the red comment gives the charter's rule, a test known red goes into quarantine in the test
// itself, with the ticket that fixes it. It takes no lock: it does not move main.
// Every comment and change of the queue at a ticket is written under the author `file`, which bd
// reads in BEADS_ACTOR, as the circuit writes its own lines under `circuit`.
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { lireCommit } from '../poussee-cles.mjs';
import { commitsDelivering, gitLog } from '../un-commit-par-ticket.mjs';
import { attendreUnPeu, lacherVerrou, prendreVerrou } from '../verrou-de-fichier.mjs';
import { dossierCommun, lireEntrees, retirerEntree } from './file-attente.mjs';
import { ouvrirCopie } from './rejeu.mjs';
import { A_REPASSER } from '../mesure/pression.mjs';
import { AVANCEMENT, ecrireTache } from '../mesure/avancement.mjs';

const ESSAIS_PAR_BRANCHE = 5;
// The variable in which bd reads the author of a comment, and the queue's author.
const ACTEUR = 'BEADS_ACTOR';
export const AUTEUR_DE_LA_FILE = 'file';
// The reason of the closure of a ticket the queue brought onto main, before its commit, which the
// circuit reads to name that commit (scripts/circuit.mjs, the tri of the discoveries).
export const INTEGRE = 'intégré : ';
// How long the queue looks for the run of the CI, then waits for it.
const RECHERCHE_CI_MS = 2 * 60 * 1000;
const ATTENTE_CI_MS = 30 * 60 * 1000;
// The gap between two readings of the run, as `gh run watch` reads it again.
const PAS_CI_MS = 10 * 1000;
// The steps done over planned of the view <vue> of a run (`gh run view --json jobs`), written to
// the progress directory <avancement> as the record `etapes-de-la-ci`; nothing without one.
function ecrireLesEtapes(avancement, vue) {
  if (!avancement) return;
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

const delai = (variable, defaut) => {
  const v = Number(process.env[variable]);
  return Number.isFinite(v) && process.env[variable] !== '' && v >= 0 ? v : defaut;
};

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
      if (fin < 0) throw new Error(`motif sans fin : ${motif}`);
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
  if (push === null || push === undefined) return true;
  if (typeof push !== 'object' || Array.isArray(push)) return true;
  if (push.paths || push['paths-ignore']) return true;
  const { branches, 'branches-ignore': ignorees } = push;
  if (branches && ignorees) return true;
  const motifs = l => (Array.isArray(l) ? l : [l]).map(String);
  if (branches) {
    let dedans = false;
    for (const m of motifs(branches)) {
      const negatif = m.startsWith('!');
      if (motifDeGitHub(negatif ? m.slice(1) : m).test(branche)) dedans = !negatif;
    }
    return dedans;
  }
  if (ignorees) {
    const l = motifs(ignorees);
    if (l.some(m => m.startsWith('!'))) return true;
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
      if (texte === null) return true;
      try {
        // Loaded only for a workflow to read: a project without one, or before its `npm install`,
        // runs its queue without the library (which, absent, counts the workflow as one that runs).
        const require = createRequire(import.meta.url);
        const on = require('yaml').parse(texte)?.on;
        if (typeof on === 'string') return on === 'push';
        if (Array.isArray(on)) return on.includes('push');
        if (on && typeof on === 'object')
          return 'push' in on && pousseeSurLaBranche(on.push, branche);
        return false;
      } catch {
        return true;
      }
    })
    .map(({ chemin }) => chemin);
}

// The verdicts of a reading of the CI (`lireCI`).
const VERTE = 'verte';
const ROUGE = 'rouge';
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

// The CI of the commit <sha> pushed to <branche>, for the ticket <ticket>, read with the tools <o>
// (`{ racine, principale, bd, gh, dire, avancement }`: the main tree, its branch, bd, the GitHub
// CLI, a line of the output, the progress directory or null): `{ verdict, passage }`, the verdict
// VERTE, ROUGE, SANS_CI or NON_LUE, and the id of the run read. The run is read by `gh run view
// <id>`, which gives its current attempt: a run whose failed jobs were run again
// (`gh run rerun <id> --failed`) is judged on that attempt, as a merge queue judges the last
// attempt of a commit's checks. No CI, red or not read, the ticket is told so; green, nothing is
// written to it.
function lireCI(o, ticket, sha, branche) {
  const court = sha.slice(0, 7);
  const commenter = texte => o.bd('comments', 'add', ticket, texte);
  if (fluxDuCommit(o.racine, sha, branche).length === 0) {
    const texte = `Aucune CI pour origin/${branche} : aucun flux de ${DOSSIER_DES_FLUX} de ${court} ne se lance sur la branche ${branche}, la file n'en attend pas.`;
    commenter(texte);
    o.dire(`✓ ${texte}`);
    return { verdict: SANS_CI, passage: null };
  }
  const { gh } = o;
  const nonLue = raison => {
    commenter(`## CI non lue\n\nLa CI de ${court} n'a pas été lue : ${raison}`);
    o.dire(`⚠ CI de ${court} non lue : ${raison}`);
    return { verdict: NON_LUE, passage: null };
  };
  const recherche = delai('GRILLHOUSE_CI_RECHERCHE_MS', RECHERCHE_CI_MS);
  const debut = Date.now();
  let passage = null;
  for (;;) {
    const r = gh(['run', 'list', '--commit', sha, '--json', 'databaseId,status,conclusion']);
    if (r.error) return nonLue(`gh ne se lance pas (${r.error.code ?? r.error.message}).`);
    if (r.status !== 0) return nonLue(`gh run list refuse :\n${`${r.stderr}${r.stdout}`.trim()}`);
    let passages = [];
    try {
      passages = JSON.parse(r.stdout || '[]');
    } catch {
      return nonLue(`gh run list rend une sortie illisible :\n${r.stdout.trim()}`);
    }
    passage = passages.find(x => x?.databaseId);
    const reste = recherche - (Date.now() - debut);
    if (passage || reste <= 0) break;
    attendreUnPeu(Math.min(10_000, reste));
  }
  if (!passage) {
    return nonLue(`aucun passage de la CI pour ce commit en ${Math.round(recherche / 1000)} s.`);
  }
  const id = String(passage.databaseId);
  const attente = delai('GRILLHOUSE_CI_ATTENTE_MS', ATTENTE_CI_MS);
  const pas = delai('GRILLHOUSE_CI_PAS_MS', PAS_CI_MS);
  const limite = Date.now() + attente;
  let vue = null;
  for (;;) {
    const v = gh(['run', 'view', id, '--json', 'status,conclusion,jobs'], {
      timeout: 60_000,
      killSignal: 'SIGKILL',
    });
    if (v.error) return nonLue(`gh ne se lance pas (${v.error.code ?? v.error.message}).`);
    if (v.status !== 0) return nonLue(`gh run view refuse :\n${`${v.stderr}${v.stdout}`.trim()}`);
    try {
      vue = JSON.parse(v.stdout || '{}');
    } catch {
      return nonLue(`gh run view rend une sortie illisible :\n${v.stdout.trim()}`);
    }
    ecrireLesEtapes(o.avancement, vue);
    if (vue?.status === 'completed') break;
    const reste = limite - Date.now();
    if (reste <= 0) {
      return nonLue(`le passage ${id} n'a pas fini en ${Math.round(attente / 60_000)} min.`);
    }
    attendreUnPeu(Math.min(pas, reste));
  }
  if (vue.conclusion === 'success') {
    o.dire(`✓ CI de ${court} verte (passage ${id})`);
    return { verdict: VERTE, passage: id };
  }
  const url = gh(['run', 'view', id, '--json', 'url', '--jq', '.url']).stdout?.trim() || id;
  const journal = `${gh(['run', 'view', id, '--log-failed']).stdout ?? ''}`
    .trim()
    .split('\n')
    .slice(-60)
    .join('\n');
  commenter(
    `## CI rouge\n\nLa CI de ${court} sur ${o.principale} est rouge : ${url}\n\nLa fin de gh run view ${id} --log-failed :\n\n${journal}\n\nLe ticket est rouvert : sa correction entre sous son numéro. Un rejeu vert de la même CI (\`gh run rerun ${id} --failed\`), puis \`--reprendre\` du circuit, le ferme ; un test connu instable se met en quarantaine dans le test, avec le ticket qui le corrige.`
  );
  o.dire(`✗ CI de ${court} rouge (passage ${id}) : ${ticket} rouvert`);
  return { verdict: ROUGE, passage: id };
}

/**
 * The CI of the ticket's commit on main read again, with the tools <o> (`{ racine, principale,
 * ticket, bd, gh, dire, avancement }`, as `lireCI`), for a ticket a red CI reopened: as a merge
 * queue judges the last attempt of a commit's checks, a run whose failed jobs were run again green
 * is green. The commit is the last of main that delivers the ticket (its title line names it,
 * `commitsDelivering` of ../un-commit-par-ticket.mjs, the prefix read from bd); green, or no CI
 * for the branch pushed to, the ticket closes as an entry closes it (« intégré : <commit> »), its
 * run named at the ticket; red or not read, it stays open, the reading at the ticket. No commit of
 * main delivering it, or its branch `agent/<ticket>` still ahead of main (a lot not yet on main),
 * the ticket is told that the CI is not read again. Exit 0.
 */
export function relireCI(o) {
  const { racine, principale, ticket } = o;
  const git = (...a) => spawnSync('git', ['-C', racine, ...a], { encoding: 'utf8' });
  const nonRelue = raison => {
    o.bd('comments', 'add', ticket, `## CI non relue\n\n${raison}`);
    o.dire(`⚠ CI non relue : ${raison}`);
    return 0;
  };
  const refPrincipale = `refs/heads/${principale}`;
  const branche = `agent/${ticket}`;
  const enAvance = git('rev-list', '--count', `${refPrincipale}..refs/heads/${branche}`);
  if (enAvance.status === 0 && Number(enAvance.stdout.trim()) > 0) {
    return nonRelue(
      `La branche ${branche} a des commits hors de ${principale} : son lot n'est pas sur ${principale}, la file n'en relit pas la CI.`
    );
  }
  const prefixe = o.bd('config', 'get', 'issue_prefix').stdout?.trim() ?? '';
  const sha = commitsDelivering(ticket, prefixe, gitLog(racine))
    .map(c => git('rev-parse', '--verify', '-q', `${c}^{commit}`).stdout.trim())
    .find(c => c && git('merge-base', '--is-ancestor', c, refPrincipale).status === 0);
  if (!sha) {
    return nonRelue(
      `Aucun commit de ${principale} ne livre ${ticket} : la file n'a pas de CI à relire.`
    );
  }
  const court = sha.slice(0, 7);
  const paquet = git('show', `${refPrincipale}:package.json`);
  const { commit, faute } = lireCommit(paquet.status === 0 ? JSON.parse(paquet.stdout) : null);
  if (faute) {
    return nonRelue(`grillhouse.poussee.commit vaut ${faute}, pas un nom de branche.`);
  }
  const ci = lireCI(o, ticket, sha, commit);
  if (ci.verdict === VERTE || ci.verdict === SANS_CI) {
    o.bd('close', ticket, '--reason', `${INTEGRE}${court}`);
    if (ci.passage) {
      o.bd(
        'comments',
        'add',
        ticket,
        `## CI relue\n\nLa CI de ${court} sur ${principale} est verte au dernier essai du passage ${ci.passage} : le ticket se ferme.`
      );
    }
    o.dire(`✓ ${ticket} fermé : ${court} est sur ${principale}`);
  }
  return 0;
}

function main(argv) {
  const relecture = argv.length === 2 && argv[0] === '--ci' && argv[1] ? argv[1] : null;
  if (argv.length && !relecture) {
    process.stderr.write('usage: file.mjs [--ci <ticket>]\n');
    return 2;
  }
  // The progress directory of the circuit's step (scripts/avancement.mjs), where the queue writes
  // the steps of the CI; its own runs of `npm run verifier` play out of it, as measures of their
  // own.
  const avancement = process.env[AVANCEMENT] || null;
  delete process.env[AVANCEMENT];
  // The main tree, from git's common directory: launched from a copy, the queue still works on it.
  const racine = path.dirname(
    spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      encoding: 'utf8',
    }).stdout.trim()
  );
  const git = (...args) => spawnSync('git', ['-C', racine, ...args], { encoding: 'utf8' });
  // bd runs under the queue's author (BEADS_ACTOR), apart from the supervisor's and the owner's.
  const bd = (...a) => {
    const r = spawnSync('bd', a, {
      cwd: racine,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, [ACTEUR]: AUTEUR_DE_LA_FILE },
    });
    if (r.status !== 0) process.stderr.write(`bd ${a[0]} ${a[1] ?? ''} : ${r.stderr}`);
    return r;
  };
  const dire = s => process.stdout.write(`${s}\n`);
  const principale = git('symbolic-ref', '--short', '-q', 'HEAD').stdout.trim();
  if (!principale) {
    process.stderr.write("⛔ L'arbre principal n'est pas sur une branche.\n");
    return 1;
  }
  // The tools of the reading of the CI, the queue's and its reading again.
  const lecture = { racine, principale, bd, gh: ghDans(racine), dire, avancement };
  if (relecture) return relireCI({ ...lecture, ticket: relecture });
  const refPrincipale = `refs/heads/${principale}`;
  const copie = path.join(racine, '.claude', 'worktrees', 'file');
  const verrou = path.join(dossierCommun(racine), 'file-integration.lock');

  const commenter = (ticket, texte) => bd('comments', 'add', ticket, texte);
  // The branch leaves the queue and stays in place; its ticket reopens.
  const sortir = (entree, titre, detail) => {
    const texte = `## Sortie de la file\n\nLa branche ${entree.branche} ne peut pas entrer sur ${principale} : ${titre}\n${detail}\n\nLa branche reste en place ; la relance du ticket remet son lot en travail local sur ${principale}.`;
    bd('update', entree.ticket, '--status', 'open', '--remove-label', 'en-file');
    bd('comments', 'add', entree.ticket, texte);
    retirerEntree(entree);
    dire(`✗ ${entree.branche} sort de la file : ${titre}`);
  };
  // The branch has nothing ahead of main: it leaves the queue, its ticket stays as it is and loses
  // `en-file`.
  const ecarter = entree => {
    const texte = `## Sortie de la file\n\nLa branche ${entree.branche} n'a rien en avance sur ${principale} : elle n'entre pas, et le ticket reste ouvert.`;
    bd('update', entree.ticket, '--remove-label', 'en-file');
    bd('comments', 'add', entree.ticket, texte);
    retirerEntree(entree);
    dire(`⚠ ${entree.branche} n'a rien en avance sur ${principale} : elle sort de la file`);
  };
  // The branch stays in the queue, the reason written to its ticket.
  const garder = (entree, raison) => {
    commenter(
      entree.ticket,
      `## La file garde la branche\n\nLa branche ${entree.branche} reste en file : ${raison}`
    );
    dire(`⚠ ${entree.branche} reste en file : ${raison}`);
  };

  // The branch replaced on main, replayed: { nouveau } (the commit to move main onto), or
  // { sortie: [titre, détail] } (it leaves the queue), or { garde } (it stays, the reason).
  const rejouer = (tip, tete) => {
    if (existsSync(copie))
      spawnSync('git', ['-C', copie, 'rebase', '--abort'], { encoding: 'utf8' });
    const ouverte = ouvrirCopie({ racine, copie, ref: tete, dire });
    if (ouverte.refus) return { garde: ouverte.refus };
    const { dansCopie, installer, tester } = ouverte;
    if (dansCopie('checkout', '-q', '--detach', tip).status !== 0)
      return { garde: `la copie ne prend pas ${tip.slice(0, 7)}` };
    const rebase = dansCopie('rebase', tete);
    if (rebase.status !== 0) {
      const conflits = dansCopie('diff', '--name-only', '--diff-filter=U')
        .stdout.split('\n')
        .filter(Boolean);
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
    const installation = installer();
    if (installation) {
      return { sortie: [installation, "Le verrou de la branche replacée ne s'installe pas."] };
    }
    dire('— npm run verifier (construction, gardes, tests)');
    const t = tester();
    if (t.status === A_REPASSER) {
      return {
        garde: `son \`npm run verifier\` est à repasser (code ${A_REPASSER}) une fois replacée : un échec de durée sous charge, sans repos dans la borne. Ni vert ni rouge ; la prochaine file la rejoue.`,
      };
    }
    if (t.status !== 0) {
      const fin = `${t.stdout}${t.stderr}`.trim().split('\n').slice(-40).join('\n');
      return { sortie: ['ses tests sont rouges une fois la branche replacée.', fin] };
    }
    return { nouveau: dansCopie('rev-parse', 'HEAD').stdout.trim() };
  };

  // Main is at <nouveau>: the ticket closes, the branch is deleted, main is pushed.
  const entrer = (entree, nouveau) => {
    const court = nouveau.slice(0, 7);
    bd('update', entree.ticket, '--remove-label', 'en-file');
    bd('close', entree.ticket, '--reason', `${INTEGRE}${court}`);
    rmSync(path.join(racine, '.claude', 'worktrees', `${entree.ticket}.travail`), {
      recursive: true,
      force: true,
    });
    retirerEntree(entree);
    dire(`✓ ${entree.branche} entre sur ${principale} : ${court}`);
    const efface = git('branch', '-D', entree.branche);
    if (efface.status !== 0) {
      commenter(
        entree.ticket,
        `La branche ${entree.branche} reste en place après son entrée sur ${principale} (${efface.stderr.trim()}) : sa copie est encore en place. Le ticket est fermé.`
      );
      dire(`⚠ ${entree.branche} n'est pas effacée`);
    }
    const paquet = git('show', `${refPrincipale}:package.json`);
    const { commit, faute } = lireCommit(paquet.status === 0 ? JSON.parse(paquet.stdout) : null);
    if (faute) {
      commenter(
        entree.ticket,
        `Poussée non faite : grillhouse.poussee.commit vaut ${faute}, pas un nom de branche.`
      );
      return;
    }
    const pousse = spawnSync(
      'git',
      ['-C', racine, 'push', 'origin', `${nouveau}:refs/heads/${commit}`],
      { encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }
    );
    if (pousse.status !== 0) {
      commenter(
        entree.ticket,
        `La poussée de ${court} vers origin/${commit} (grillhouse.poussee.commit) est refusée :\n${pousse.stderr.trim()}`
      );
      dire(`⚠ poussée de ${court} refusée`);
    } else {
      dire(`✓ poussée : ${court} est sur origin/${commit}`);
      const ci = lireCI(lecture, entree.ticket, nouveau, commit);
      if (ci.verdict === ROUGE) bd('reopen', entree.ticket);
    }
  };

  // One branch of the queue, against the main of the moment.
  const traiter = entree => {
    const tip = git('rev-parse', '--verify', '-q', `refs/heads/${entree.branche}`).stdout.trim();
    if (!tip) return sortir(entree, "la branche n'existe plus.", '');
    if (Number(git('rev-list', '--count', `${refPrincipale}..${tip}`).stdout.trim()) === 0)
      return ecarter(entree);
    for (let essai = 0; essai < ESSAIS_PAR_BRANCHE; essai++) {
      const tete = git('rev-parse', refPrincipale).stdout.trim();
      let nouveau = tip;
      if (git('merge-base', '--is-ancestor', tete, tip).status !== 0) {
        const r = rejouer(tip, tete);
        if (r.sortie) return sortir(entree, ...r.sortie);
        if (r.garde) return garder(entree, r.garde);
        nouveau = r.nouveau;
      }
      if (nouveau !== tete) {
        const avance = git('merge', '-q', '--ff-only', nouveau);
        if (avance.status !== 0) {
          if (git('rev-parse', refPrincipale).stdout.trim() !== tete) continue;
          return garder(
            entree,
            `${principale} n'avance pas sur ${nouveau.slice(0, 7)} :\n${avance.stdout}${avance.stderr}`.trim()
          );
        }
      }
      return entrer(entree, nouveau);
    }
    return garder(entree, `${principale} bouge sans cesse : cinq essais n'ont pas suffi.`);
  };

  const vues = new Set();
  for (;;) {
    if (!prendreVerrou(verrou, { attendre: false })) return 0;
    try {
      for (;;) {
        const entree = lireEntrees(racine).find(e => !vues.has(e.fichier));
        if (!entree) break;
        vues.add(entree.fichier);
        traiter(entree);
      }
    } finally {
      lacherVerrou(verrou);
    }
    // An entry written while the lock was let go has no queue running to take it.
    if (!lireEntrees(racine).some(e => !vues.has(e.fichier))) return 0;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main(process.argv.slice(2));
}
