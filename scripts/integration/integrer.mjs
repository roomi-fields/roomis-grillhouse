#!/usr/bin/env node
// The mechanical steps of one integration, run by the integrateur agent once it has judged the
// lot. It commits the lot on the branch of the ticket, or refuses it with the full output of the
// step that refused. The branch then waits for the queue (scripts/integration/file.mjs), which
// brings it onto main.
//
//   node scripts/integration/integrer.mjs --ticket <id> [--ticket <id>…]
//        [--tests <patch>] [--code <patch>] --message <file> [--admettre "<test name>"…]
//
// The first ticket named gives its branch `agent/<ticket>` and its copy
// (`.claude/worktrees/<ticket>`, the one the lot was written in, when it exists); the other tickets
// ride on that branch. In order, each step refusing stops the run:
//  1. the verdicts: each --ticket has `ACCEPTÉ` as its last reviewer verdict (`ACCEPTÉ` or
//     `RENDU` at the start of a comment) and, when labelled `arbitrage`, each « ## Arbitrage »
//     comment is `### Verdict — tranché`, or a « ## Réponse du responsable » comment follows it;
//  2. the lots: the tests lot touches only what the testeur writes (`isTesterFile`: test files
//     and the shared test material), the code lot none of it;
//  3. the main tree: every file of the lots is unmodified there; the ticket's copy is on its
//     branch and carries the lot and nothing else: a modified or untracked file outside the lot
//     refuses, named (what an ignored folder such as node_modules holds is not work);
//  4. a clean integration copy (`.claude/worktrees/integration`) on HEAD, made ready by the
//     replay (scripts/integration/rejeu.mjs: submodules by scripts/sous-modules.sh, dependencies,
//     mounts); it builds nothing;
//  5. the base: the project's suites (`npm run integration:suites -- <scope>`) on HEAD. Each suite
//     keeps its verdict under the fingerprint of its content (scripts/integration/suites-vitest.mjs):
//     a suite whose fingerprint has a trace is not replayed, so the base of a HEAD already
//     measured costs nothing. The project chooses at its installation (`grillhouse.integration` in
//     package.json): `impactes` (the default) replays the components that hold a file of the lot and
//     those that depend on them (the graph of the dependencies), whatever the nature of the file; every suite
//     for a lot that touches the lock file or a root path the project declares read
//     (`grillhouse.lusParLesSuites`); the root suite for a lot of test helpers outside every
//     component; the test files alone for a lot made only of test files; no suite (the guards
//     alone, step 8) for any other file outside every component, a document, a hook, a script no
//     declaration names. Every suite runs once a night (`scripts/nuit.sh`); `complet` replays every
//     suite at each integration. The project is built after the lots, as soon as a suite or a guard
//     reads the build (main, only when one of its suites plays), through the one entry point that
//     builds (scripts/integration/constructions.mjs): a build whose fingerprint is in the store is
//     restored, not done again; suites that fail without naming a test leave nothing to compare,
//     and refuse;
//  6. the lots, applied in three ways in the copy, tests first; the files of the lot in the
//     ticket's copy are compared with the copy's own base plus the lot, not with the integration
//     copy;
//  7. the suites again, with the lot (the project built after the lots, as soon as a suite or a guard
//     reads the build; the lot's own content is built beside the base's, none overwrites the other);
//  8. the project's guards (`npm run integration:gardes`, when present); every control plays. The
//     project is built after the lots: by step 7 when a suite plays, else here when a control
//     of `grillhouse:gardes` follows its build step (it reads the build);
//  9. the comparison: a failing test that the base did not have and --admettre does not name
//     refuses the lot, compared name by name;
// 10. the commit in the copy, its hooks included, under GRILLHOUSE_INTEGRATION=1: a pre-commit
//     hook that plays the guards skips them, as step 8 just played them; the commit validated is
//     the commit that enters;
// 11. the branch `agent/<ticket>` is set on that commit, the ticket's copy follows it and is
//     removed by `scripts/retirer-copie.sh` (no `--jetable`): a refusal, a locked copy for
//     example, is written to the first ticket, the commit stands. Every ticket named is labelled
//     `en-file` and the branch takes its place at the end of the queue
//     (scripts/integration/file-attente.mjs). main does not move here.
//
// What the base and the suites read of a lot is its files: each file added, modified or
// deleted, a rename counting its source and its destination, a copy its destination only.
//
// The main tree is not touched. The suites command receives `--tous` for every suite, the
// components' directories to replay (`packages/a src/parser`), `--racine`, or `--tests <files>`,
// never nothing, and writes the names of its failing tests, one per line, to the file named by the
// ROUGES variable.
// The budget of an integration that touches one leaf component: 15 s, measured on the template
// (12.8 s with its first `npm ci`, 8.6 s after). A project sets its own, measured on its code
// (`npm pkg set grillhouse.budgetIntegration=<seconds>`). The duration is written at the end,
// with a warning past the budget.
// One integration runs at a time (`.git/integration.lock`): another waits for the end of the
// running one; a lock whose process is gone is taken over. Exit code: 0 committed, 1 refused,
// 2 usage.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isTesterFile } from '../verrous/verrou.mjs';
import { lacherVerrou, prendreVerrou } from '../verrou-de-fichier.mjs';
import { dossierCommun, inscrireEntree } from './file-attente.mjs';
import { lireJsonSiPresent, nouveauxRouges, ouvrirCopie, RETIRER_COPIE } from './rejeu.mjs';

// The refusal for the verdicts of one ticket, or null. `ticket` and `comments` are Beads' JSON.
export function refusVerdicts(ticket, comments) {
  const id = ticket.id;
  const verdicts = comments.filter(c => /^\s*(ACCEPTÉ|RENDU)(?![\p{L}\d])/u.test(c.text));
  const dernier = verdicts.at(-1);
  if (!dernier || !/^\s*ACCEPTÉ/.test(dernier.text)) {
    return `${id} n'a pas le verdict ACCEPTÉ du relecteur pour dernier verdict.`;
  }
  if ((ticket.labels ?? []).includes('arbitrage')) {
    const arbitrages = comments.filter(c => /^\s*## Arbitrage\b/.test(c.text));
    if (arbitrages.length === 0)
      return `${id} est étiqueté arbitrage sans commentaire « Arbitrage ».`;
    for (const a of arbitrages) {
      const tranche = /^### Verdict\s*—\s*tranché/m.test(a.text);
      const repondu = comments
        .slice(comments.indexOf(a) + 1)
        .some(c => /^\s*## Réponse du responsable\b/.test(c.text));
      if (!tranche && !repondu) {
        const titre = a.text.trim().split('\n')[0];
        return `${id} : « ${titre} » n'est ni tranché ni répondu par le responsable.`;
      }
    }
  }
  return null;
}

// The refusal for the files of the lots, or null. The files are relative to the repository root
// <racine>; the tests lot holds only what the testeur writes, the code lot none of it.
export function refusLots(tests, code, racine) {
  const testeur = f => isTesterFile(f, racine);
  const horsTests = tests.filter(f => !testeur(f));
  if (horsTests.length) return `Le lot de tests touche du code : ${horsTests.join(', ')}.`;
  const duTesteur = code.filter(testeur);
  if (duTesteur.length)
    return `Le lot de code touche des fichiers du testeur (tests ou matière de test partagée) : ${duTesteur.join(', ')}.`;
  return null;
}

// The scope of the suites and the comparison of failing tests live in the replay, shared with the
// queue.
export { nouveauxRouges, perimetre } from './rejeu.mjs';

const BUDGET_FEUILLE_S = 15;

function lire(argv) {
  const o = { tickets: [], tests: null, code: null, message: null, admettre: [] };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i + 1];
    switch (argv[i]) {
      case '--ticket':
        o.tickets.push(v);
        i++;
        break;
      case '--tests':
        o.tests = v;
        i++;
        break;
      case '--code':
        o.code = v;
        i++;
        break;
      case '--message':
        o.message = v;
        i++;
        break;
      case '--admettre':
        o.admettre.push(v);
        i++;
        break;
      default:
        return null;
    }
  }
  if (!o.tickets.length || !o.message || !(o.tests || o.code)) return null;
  return o;
}

// The files of the ticket's copy that are not the lot: every modified, deleted or untracked file
// (ignored ones do not count) the lot does not name.
function horsLot(copieTicket, fichiers) {
  const r = spawnSync(
    'git',
    ['-C', copieTicket, 'status', '--porcelain=v1', '-z', '-uall', '--no-renames'],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) return null;
  const dans = new Set(fichiers);
  return r.stdout
    .split('\0')
    .filter(Boolean)
    .map(l => l.slice(3))
    .filter(f => !dans.has(f));
}

// The files of the lot whose content in the ticket's copy differs from its own base plus the lot:
// the lots are applied to the copy's HEAD in a temporary index, which the copy's files are compared
// to. Every file of the lot differs when the lots do not apply to that base.
function differents(copieTicket, lots, fichiers, tmp) {
  const index = path.join(tmp, 'index-copie');
  const env = { ...process.env, GIT_INDEX_FILE: index };
  const dansCopie = (...args) =>
    spawnSync('git', ['-C', copieTicket, ...args], { encoding: 'utf8', env });
  if (dansCopie('read-tree', 'HEAD').status !== 0) return fichiers;
  for (const p of lots) if (dansCopie('apply', '--cached', p).status !== 0) return fichiers;
  const r = dansCopie('diff', '--name-only', '--no-renames', '-z', '--', ...fichiers);
  if (r.status !== 0) return fichiers;
  return r.stdout.split('\0').filter(Boolean);
}

function main(argv) {
  const o = lire(argv);
  if (!o) {
    process.stderr.write(
      'usage: integrer.mjs --ticket <id>… [--tests <patch>] [--code <patch>] --message <file> [--admettre "<test>"]…\n'
    );
    return 2;
  }
  const racine = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  }).stdout.trim();
  const git = (...args) => spawnSync('git', ['-C', racine, ...args], { encoding: 'utf8' });
  const bd = (...a) => spawnSync('bd', a, { cwd: racine, encoding: 'utf8' });
  const dire = s => process.stdout.write(`${s}\n`);
  const refuser = s => {
    process.stdout.write(`⛔ ${s}\nLe lot retourne à son agent avec cette sortie.\n`);
    return 1;
  };
  const absolu = p => path.resolve(p);

  // One integration at a time: a second waits for the end of the first; a lock whose process is
  // gone is taken over.
  const verrou = path.join(dossierCommun(racine), 'integration.lock');
  prendreVerrou(verrou, { attendre: true });
  const debut = Date.now();
  const tmp = mkdtempSync(path.join(tmpdir(), 'integration-'));
  try {
    // 1. The verdicts.
    for (const id of o.tickets) {
      const show = bd('show', id, '--json');
      const comments = bd('comments', id, '--json');
      if (show.status !== 0 || comments.status !== 0)
        return refuser(`Ticket ${id} illisible : ${show.stderr}${comments.stderr}`);
      const r = refusVerdicts(JSON.parse(show.stdout)[0], JSON.parse(comments.stdout || '[]'));
      if (r) return refuser(r);
    }
    dire('✓ verdicts');

    // 2. The lots.
    const lots = [o.tests, o.code].filter(Boolean).map(absolu);
    const fichiersDe = p => {
      const r = git('apply', '--numstat', '-z', p);
      if (r.status !== 0) return null;
      const destinations = r.stdout
        .split('\0')
        .map(l => l.split('\t')[2])
        .filter(Boolean);
      // A rename names its source too (numstat names only the destination); a copy leaves its
      // source intact, so only its destination counts.
      const sources = [...readFileSync(p, 'utf8').matchAll(/^rename from (.+)$/gm)].map(m => m[1]);
      return [...destinations, ...sources];
    };
    const tests = o.tests ? fichiersDe(absolu(o.tests)) : [];
    const code = o.code ? fichiersDe(absolu(o.code)) : [];
    if (!tests || !code) return refuser('Un patch du lot est illisible.');
    const r2 = refusLots(tests, code, racine);
    if (r2) return refuser(r2);
    const fichiers = [...new Set([...tests, ...code])];
    dire(`✓ lots : ${fichiers.length} fichiers`);

    // 3. The main tree: the lots' files are free there, so the queue can bring them. The ticket's
    // copy holds the lot and nothing else.
    const tenus = git('status', '--porcelain', '--', ...fichiers).stdout.trim();
    if (tenus) return refuser(`Des fichiers du lot sont modifiés dans l'arbre :\n${tenus}`);
    dire('✓ arbre principal libre');
    const premier = o.tickets[0];
    const branche = `agent/${premier}`;
    const copieTicket = path.join(racine, '.claude', 'worktrees', premier);
    // A ticket without a copy (none was made, or it is gone) has nothing to check nor to remove.
    const avecCopie = existsSync(copieTicket);
    if (avecCopie) {
      const surBranche = spawnSync(
        'git',
        ['-C', copieTicket, 'rev-parse', '--abbrev-ref', 'HEAD'],
        { encoding: 'utf8' }
      );
      if (surBranche.stdout.trim() !== branche) {
        return refuser(`La copie du ticket ${copieTicket} n'est pas sur la branche ${branche}.`);
      }
      const autres = horsLot(copieTicket, fichiers);
      if (autres === null) return refuser(`L'état de la copie ${copieTicket} ne se lit pas.`);
      if (autres.length) {
        return refuser(
          `La copie du ticket porte autre chose que le lot :\n${autres.map(f => `  ${f}`).join('\n')}`
        );
      }
      dire('✓ copie du ticket : le lot seul');
    }

    // 4. The integration copy: detached on HEAD, without any untracked file; its dependencies
    // are kept only while the lock file is the same (a CI cache keyed by the lock file).
    const copie = path.join(racine, '.claude', 'worktrees', 'integration');
    const ouverte = ouvrirCopie({ racine, copie, ref: 'HEAD', tmp, dire });
    if (ouverte.refus) return refuser(ouverte.refus);
    const { dansCopie, monter, portee, suites, gardes } = ouverte;
    const { champ, message } = portee(fichiers);
    dire(message);

    // 5. The base (no suite replays for a lot no suite reads: nothing to compare).
    let base = [];
    if (champ.mode !== 'aucun') {
      dire('— les suites sur HEAD (la base)');
      base = suites(champ, 'base');
      if (base.some(n => n.startsWith('(les suites sortent'))) {
        return refuser(
          'La base ne se mesure pas : les suites échouent sur HEAD sans nommer de test.'
        );
      }
      dire(`✓ base : ${base.length} rouges`);
    }

    // 6. The lots, applied in the copy, then built.
    for (const p of lots) {
      const r = dansCopie('apply', '--3way', '--index', p);
      if (r.status !== 0) return refuser(`Le lot ${p} ne s'applique pas :\n${r.stdout}${r.stderr}`);
    }
    const divergents = avecCopie ? differents(copieTicket, lots, fichiers, tmp) : [];
    if (divergents.length) {
      return refuser(
        `Des fichiers du lot diffèrent dans la copie du ticket :\n${divergents.map(f => `  ${f}`).join('\n')}`
      );
    }
    dire('✓ lots appliqués');

    // 7. The suites with the lot (the build when a suite or a guard reads it).
    let apres = [];
    if (champ.mode !== 'aucun') {
      dire('— les suites avec le lot');
      apres = suites(champ, 'apres');
    }

    // 8. The guards.
    if (gardes().status !== 0) return refuser('Les gardes refusent (sortie ci-dessus).');
    dire('✓ gardes');

    // 9. The suites compared to the base.
    if (champ.mode !== 'aucun') {
      const nouveaux = nouveauxRouges(base, apres, o.admettre);
      if (nouveaux.length)
        return refuser(`Rouges nouveaux :\n${nouveaux.map(n => `  ✗ ${n}`).join('\n')}`);
      for (const a of o.admettre) dire(`⚠ admis par l'intégrateur : ${a}`);
      dire('✓ suites');
    }

    // 10. The commit, in the copy: the commit validated is the commit that enters.
    // The guards have just run: a pre-commit hook that plays them skips them under
    // GRILLHOUSE_INTEGRATION=1; commit-msg (one ticket, one commit) runs as always.
    const c = spawnSync(
      'bash',
      monter('git', '-C', copie, 'commit', '-q', '-F', absolu(o.message)),
      {
        encoding: 'utf8',
        env: { ...process.env, GRILLHOUSE_INTEGRATION: '1' },
      }
    );
    if (c.status !== 0) return refuser(`Le commit est refusé :\n${c.stdout}${c.stderr}`);
    const commit = dansCopie('rev-parse', 'HEAD').stdout.trim();

    // 11. The branch of the ticket takes the commit; the ticket's copy follows it (it carried the
    // lot, which the commit now holds) and is removed; the tickets wait in the queue.
    const pose = git('update-ref', `refs/heads/${branche}`, commit);
    if (pose.status !== 0) {
      return refuser(`La branche ${branche} ne prend pas ${commit.slice(0, 7)} :\n${pose.stderr}`);
    }
    if (avecCopie) {
      spawnSync('git', ['-C', copieTicket, 'reset', '-q', '--hard', commit], { encoding: 'utf8' });
    }
    for (const id of o.tickets) bd('update', id, '--add-label', 'en-file');
    dire(`✓ commit ${commit.slice(0, 7)} sur ${branche}`);
    const retrait = avecCopie
      ? spawnSync('bash', [RETIRER_COPIE, copieTicket], { cwd: racine, encoding: 'utf8' })
      : { status: 0, stderr: '' };
    if (retrait.status !== 0) {
      const raison = `La copie ${copieTicket} n'est pas retirée après le commit de ${branche} : ${retrait.stderr.trim()}\nLa branche reste en file.`;
      bd('comments', 'add', premier, raison);
      dire(`⚠ ${raison}`);
    }
    inscrireEntree(racine, branche, o.tickets);
    dire('✓ en file');
    const duree = Math.round((Date.now() - debut) / 100) / 10;
    const budget =
      lireJsonSiPresent(path.join(racine, 'package.json'))?.grillhouse?.budgetIntegration ??
      BUDGET_FEUILLE_S;
    dire(`⏱ ${duree} s (budget d'une feuille : ${budget} s)`);
    if (champ.mode === 'composants' && champ.composants.length === 1 && duree > budget) {
      dire(`⚠ au-delà du budget : ${duree} s pour un seul composant.`);
    }
    return 0;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    lacherVerrou(verrou);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(main(process.argv.slice(2)));
}
