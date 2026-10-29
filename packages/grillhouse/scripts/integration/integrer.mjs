#!/usr/bin/env node
// The mechanical steps of one integration, run by the circuit of the ticket (scripts/circuit.mjs)
// once the reviewer has accepted the lot, which the circuit builds from the ticket's copy. It
// commits the lot on the branch of the ticket, or refuses it with the full output of the step that
// refused. The branch then waits for the queue (scripts/integration/file.mjs), which brings it onto
// main. Run from any working tree of the repository, it works on the main tree, found from git's
// common directory.
//
//   npx grillhouse integrer --ticket <id>
//        [--tests <patch>] [--code <patch>] --message <file> [--references <file>]
//
// One delivery is one ticket: the ticket gives its branch `agent/<ticket>` and its copy
// (`.claude/worktrees/<ticket>`, the one the lot was written in, when it exists); a second
// --ticket is a usage error, named. In order, each step refusing stops the run:
//  1. the verdict: the ticket has `ACCEPTÉ` as its last reviewer verdict (`ACCEPTÉ` or
//     `RENDU` at the start of a comment of the author `relecteur`; another author's is none) and, when labelled `arbitrage`, each arbitrage
//     (`estArbitrage`: a « ## Arbitrage » comment, the supervisor's) is settled
//     (`arbitrageTranche`: `### Verdict — tranché`, or a « ## Réponse du
//     responsable » comment after it): `refusArbitrage`, the one rule of the label, which the
//     circuit plays too at its launch and at each resumption (scripts/circuit.mjs);
//  2. the lots: the tests lot touches only what the testwriter writes (`estUnTest` of the module
//     of the language: test files and the shared test material), the code lot none of it;
//  3. the main tree: every file of the lots is unmodified there; the ticket's copy is on its
//     branch and carries the lot and nothing else: a modified or untracked file outside the lot
//     refuses, named (what an ignored folder such as node_modules holds is not work);
//  4. a clean integration copy (`.claude/worktrees/integration`) on HEAD, made ready by the
//     replay (scripts/integration/rejeu.mjs: submodules by scripts/sous-modules.sh, dependencies
//     in agreement with the lock file and the manifests, mounts);
//  5. the lots, applied in three ways in the copy, tests first, without the files a reference
//     writes in full; the files of the lot in the
//     ticket's copy are compared with the copy's own base plus the lot, not with the integration
//     copy. Once the lots are in the copy, the replay makes the dependencies agree with the lock
//     file and the manifests the lot leaves (`npm ci`, as the continuous integration runs it); an
//     install that fails refuses the lot, « Les dépendances de la copie ne s'installent pas. »;
//     then the references regenerate (below);
//  6. the tests: `npm run verifier` in the copy, one command (Turborepo: the build, then the
//     guards, the frame's and the project's own (its root script `gardes`), and every test of the
//     day beside each other, each task replayed from the cache of the
//     main tree when its inputs are unchanged). Green is required: main stays green, and nothing is compared with a base. A test
//     known red is put in quarantine in the test itself (`it.skip` or `it.fails`, with its
//     ticket), as a mature continuous integration does; the integration admits none. A
//     `npm run verifier` « à repasser » (75: a failure of duration under load, which found no rest
//     in its bound, scripts/langages/typescript/verifier.mjs) is neither green nor red: the run stops there, exit 75,
//     nothing committed and nothing refused, the lot where it was, for the same command again;
//     any other code than 0 refuses;
//  7. the commit in the copy, its hooks included, under GRILLHOUSE_INTEGRATION=1: a pre-commit
//     hook that plays the guards skips them, as step 6 just played them; the commit validated is
//     the commit that enters;
//  8. the branch `agent/<ticket>` is set on that commit, the ticket's copy follows it and is
//     removed by `scripts/retirer-copie.sh` (no `--jetable`; `--garder-travail`: the working
//     directory of the ticket's circuit, `<copie>.travail`, stays for the circuit that still runs,
//     and the queue removes it at the ticket's closure): a refusal, a locked copy for
//     example, is written to the ticket, the commit stands. The ticket is labelled
//     `en-file` and the branch takes its place at the end of the queue
//     (scripts/integration/file-attente.mjs). main does not move here.
//
// The references are the circuit's (`--references`, a JSON file the circuit writes from its one
// list, `lesReferences` of scripts/circuit.mjs): each `{ nom, commande, fichiers, entiers, cadre }`,
// `entiers` the files of `fichiers` its command writes in full (paths, directories or glob
// patterns, as `couvertPar` reads them). As a genrule of Bazel writes its output again on the
// merged tree, and npm install writes package-lock.json again after a merge, a file of the lot a
// reference writes in full is not applied: the reference that writes it plays in the copy, on main
// of the moment, after the install and before the tests, through the mounts, and what it writes
// enters the commit (BPScript 320.30: refused twice for the one conflict on the index of the
// interfaces, which another ticket had regenerated on main in the meantime). A command of the
// project at another code than 0, one of the frame on a real failure (126, 127, a signal), or a
// file it changes that its `fichiers` do not cover, refuses the lot. A conflict on any other file
// refuses it, as the three-way application says.
//
// What steps 2, 3 and 5 read of a lot is its files: each file added, modified or deleted, a
// rename counting its source and its destination (named as the file is, not as git quotes it in
// the patch), a copy its destination only. Step 2 judges them against the testwriter's files, step 3
// against the main tree and the ticket's copy, and step 5 compares them with the copy's own base
// plus the lot.
//
// The main tree is not touched. The duration is written at the end.
// One integration runs at a time (`.git/integration.lock`): another waits for the end of the
// running one; a lock whose process is gone is taken over. Exit code: 0 committed, 1 refused,
// 2 usage, 75 à repasser.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { arbitrageTranche, estArbitrage } from '../arbitrages.mjs';
import { langageDe } from '../langages.mjs';
import { lacherVerrou, prendreVerrou } from '../verrou-de-fichier.mjs';
import { dossierCommun, inscrireEntree } from './file-attente.mjs';
import { ouvrirCopie, RETIRER_COPIE } from './rejeu.mjs';
import { verdictDe } from './verdict.mjs';
import { A_REPASSER } from '../mesure/pression.mjs';
import { ouvrirBase } from '../mesure/base-de-passe.mjs';

// A file name as git writes it in a patch: a name with a character outside ASCII, a quote, a
// backslash or a control character comes between quotes with C escapes (`\303\251` for `é`).
// Returns the name itself.
function nomDeGit(ecrit) {
  if (!ecrit.startsWith('"')) return ecrit;
  const octets = [];
  const echappes = { n: 10, t: 9, r: 13, a: 7, b: 8, f: 12, v: 11 };
  const corps = Buffer.from(ecrit.slice(1, -1), 'utf8');
  for (let i = 0; i < corps.length; i++) {
    if (corps[i] !== 0x5c) {
      octets.push(corps[i]);
      continue;
    }
    const suite = String.fromCharCode(corps[i + 1]);
    const octal = /^[0-7]{3}/.exec(corps.subarray(i + 1, i + 4).toString('latin1'));
    if (octal) {
      octets.push(Number.parseInt(octal[0], 8));
      i += 3;
    } else {
      octets.push(echappes[suite] ?? corps[i + 1]);
      i += 1;
    }
  }
  return Buffer.from(octets).toString('utf8');
}

// Whether one of <motifs> covers the file <fichier>, both from the root of the copy, as the
// inputs of Turborepo read them: a path names that file, a directory every file under it, a glob
// pattern (`*`, `**`) the files it matches (`path.matchesGlob` of Node).
export function couvertPar(motifs, fichier) {
  return motifs.some(m => {
    const dossier = m.replace(/\/+$/, '');
    return fichier === dossier || fichier.startsWith(`${dossier}/`) || path.matchesGlob(fichier, m);
  });
}

// The refusal for the verdicts of one ticket, or null. `ticket` and `comments` are Beads' JSON.
export function refusVerdicts(ticket, comments) {
  const id = ticket.id;
  const dernier = comments.filter(c => verdictDe(c)).at(-1);
  if (verdictDe(dernier) !== 'ACCEPTÉ') {
    return `${id} n'a pas le verdict ACCEPTÉ du relecteur pour dernier verdict.`;
  }
  return refusArbitrage(ticket, comments);
}

// The refusal for the arbitrage of one ticket, or null: a ticket labelled `arbitrage` holds a
// « ## Arbitrage » comment, and each one is settled or answered by the owner. The one rule of the
// label, which the integration plays after the verdict and the circuit at its launch and at each
// resumption (scripts/circuit.mjs), as a CI refuses a pull request without its required label
// before it runs a job. `ticket` and `comments` are Beads' JSON.
export function refusArbitrage(ticket, comments) {
  if (!(ticket.labels ?? []).includes('arbitrage')) return null;
  const id = ticket.id;
  const arbitrages = comments.filter(c => estArbitrage(c.text));
  if (arbitrages.length === 0)
    return `${id} est étiqueté arbitrage sans commentaire « Arbitrage ».`;
  for (const a of arbitrages) {
    if (!arbitrageTranche(comments, a)) {
      const titre = a.text.trim().split('\n')[0];
      return `${id} : « ${titre} » n'est ni tranché ni répondu par le responsable.`;
    }
  }
  return null;
}

// The refusal for the files of the lots, or null. The files are relative to the repository root
// <racine>; the tests lot holds only what the testwriter writes, the code lot none of it.
export function refusLots(tests, code, racine) {
  const langage = langageDe(racine);
  const testwriter = f => langage.estUnTest(f, racine) !== null;
  const horsTests = tests.filter(f => !testwriter(f));
  if (horsTests.length) return `Le lot de tests touche du code : ${horsTests.join(', ')}.`;
  const duTestwriter = code.filter(testwriter);
  if (duTestwriter.length)
    return `Le lot de code touche des fichiers du testwriter (tests ou matière de test partagée) : ${duTestwriter.join(', ')}.`;
  return null;
}

// The options, or { faute } for a usage error.
function lire(argv) {
  const o = { ticket: null, tests: null, code: null, message: null, references: null };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i + 1];
    switch (argv[i]) {
      case '--ticket':
        if (o.ticket !== null)
          return {
            faute: `un seul --ticket : ${v} en est un second, et une livraison est un ticket.`,
          };
        o.ticket = v;
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
      case '--references':
        o.references = v;
        i++;
        break;
      default:
        return { faute: null };
    }
  }
  if (!o.ticket || !o.message || !(o.tests || o.code)) return { faute: null };
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

// The regeneration of the references <refs> in the integration copy <copie>, each command run by
// the shell at its root through the mounts (`monter`), its output written; then every file they
// changed staged. Null, or the refusal: a command of the project at another code than 0, one of
// the frame on a real failure (126, 127, a signal, 128 + its number), a file changed that their
// `fichiers` do not cover.
function regenerer(copie, refs, monter, dansCopie) {
  for (const r of refs) {
    const x = spawnSync('bash', monter('sh', '-c', r.commande), {
      cwd: copie,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
    process.stdout.write(`${x.stdout ?? ''}${x.stderr ?? ''}`);
    const code = x.status ?? 1;
    const panne =
      x.signal !== null || x.error !== undefined || code === 126 || code === 127 || code > 128;
    if (panne || (!r.cadre && code !== 0)) {
      return `La référence « ${r.nom} » (\`${r.commande}\`) rend le code ${code} dans la copie d'intégration.`;
    }
  }
  const etat = dansCopie('status', '--porcelain=v1', '-z', '-uall', '--no-renames');
  if (etat.status !== 0) return "L'état de la copie d'intégration ne se lit pas.";
  const ecrits = etat.stdout
    .split('\0')
    .filter(l => l && (l[1] !== ' ' || l.startsWith('??')))
    .map(l => l.slice(3));
  const horsDeclaration = ecrits.filter(f => !refs.some(r => couvertPar(r.fichiers, f)));
  if (horsDeclaration.length) {
    return `La régénération des références change des fichiers qu'aucune n'écrit :\n${horsDeclaration.map(f => `  ${f}`).join('\n')}`;
  }
  if (ecrits.length && dansCopie('add', '-A', '--', ...ecrits).status !== 0) {
    return "Les fichiers des références ne s'ajoutent pas au commit.";
  }
  return null;
}

function main(argv) {
  const o = lire(argv);
  if ('faute' in o) {
    process.stderr.write(
      'usage: integrer.mjs --ticket <id> [--tests <patch>] [--code <patch>] --message <file> [--references <file>]\n' +
        (o.faute ? `⛔ ${o.faute}\n` : '')
    );
    return 2;
  }
  // The main tree, from git's common directory: run from a copy, the integration still works on it.
  const racine = path.dirname(
    spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      encoding: 'utf8',
    }).stdout.trim()
  );
  const git = (...args) => spawnSync('git', ['-C', racine, ...args], { encoding: 'utf8' });
  const bd = (...a) =>
    spawnSync('bd', a, { cwd: racine, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
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
  // The working directory of the integration: a base of its own, removed at its end, swept by the
  // next one to open a base when the integration is killed (../mesure/base-de-passe.mjs).
  const base = ouvrirBase('integration');
  const tmp = base.dossier;
  try {
    // 1. The verdict.
    const show = bd('show', o.ticket, '--json');
    const comments = bd('comments', o.ticket, '--json');
    if (show.status !== 0 || comments.status !== 0)
      return refuser(`Ticket ${o.ticket} illisible : ${show.stderr}${comments.stderr}`);
    const r1 = refusVerdicts(JSON.parse(show.stdout)[0], JSON.parse(comments.stdout || '[]'));
    if (r1) return refuser(r1);
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
      const sources = [...readFileSync(p, 'utf8').matchAll(/^rename from (.+)$/gm)].map(m =>
        nomDeGit(m[1])
      );
      return [...destinations, ...sources];
    };
    const tests = o.tests ? fichiersDe(absolu(o.tests)) : [];
    const code = o.code ? fichiersDe(absolu(o.code)) : [];
    if (!tests || !code) return refuser('Un patch du lot est illisible.');
    const r2 = refusLots(tests, code, racine);
    if (r2) return refuser(r2);
    const fichiers = [...new Set([...tests, ...code])];
    dire(`✓ lots : ${fichiers.length} fichiers`);
    let references = [];
    if (o.references) {
      try {
        references = JSON.parse(readFileSync(absolu(o.references), 'utf8'));
      } catch (e) {
        return refuser(`Les références ${o.references} ne se lisent pas : ${e.message}`);
      }
    }
    // The files of the lot a reference writes in full, and the references that write them.
    const entiers = fichiers.filter(f => references.some(r => couvertPar(r.entiers, f)));
    const aRegenerer = references.filter(r => entiers.some(f => couvertPar(r.entiers, f)));

    // 3. The main tree: the lots' files are free there, so the queue can bring them. The ticket's
    // copy holds the lot and nothing else.
    const tenus = git('status', '--porcelain', '--', ...fichiers).stdout.trim();
    if (tenus) return refuser(`Des fichiers du lot sont modifiés dans l'arbre :\n${tenus}`);
    dire('✓ arbre principal libre');
    const branche = `agent/${o.ticket}`;
    const copieTicket = path.join(racine, '.claude', 'worktrees', o.ticket);
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
    // are kept only while the lock file and the manifests are the same (a CI cache keyed by them).
    const copie = path.join(racine, '.claude', 'worktrees', 'integration');
    const ouverte = ouvrirCopie({ racine, copie, ref: 'HEAD', dire });
    if (ouverte.refus) return refuser(ouverte.refus);
    const { dansCopie, monter, installer, tester } = ouverte;

    // 5. The lots, applied in the copy without the files a reference writes in full, then
    // installed, then the references regenerated.
    const sansEntiers = entiers.map(f => `--exclude=${f}`);
    for (const p of lots) {
      const r = dansCopie('apply', '--3way', '--index', ...sansEntiers, p);
      if (r.status !== 0) return refuser(`Le lot ${p} ne s'applique pas :\n${r.stdout}${r.stderr}`);
    }
    const divergents = avecCopie ? differents(copieTicket, lots, fichiers, tmp) : [];
    if (divergents.length) {
      return refuser(
        `Des fichiers du lot diffèrent dans la copie du ticket :\n${divergents.map(f => `  ${f}`).join('\n')}`
      );
    }
    dire('✓ lots appliqués');
    const installation = installer();
    if (installation) return refuser(installation);
    if (aRegenerer.length) {
      const refus = regenerer(copie, aRegenerer, monter, dansCopie);
      if (refus) return refuser(refus);
      dire(`✓ références régénérées sur main à jour : ${aRegenerer.map(r => r.nom).join(', ')}`);
    }

    // 6. The tests: the build, the guards and every test of the day, green required.
    dire('— npm run verifier (construction, gardes, tests)');
    const verdict = tester().status;
    if (verdict === A_REPASSER) {
      dire(
        `⏱ À repasser (code ${A_REPASSER}) : un échec de durée sous charge, sans repos dans la borne. Le lot n'est ni commis ni refusé ; relance la même commande.`
      );
      return A_REPASSER;
    }
    if (verdict !== 0) return refuser('Les tests refusent le lot (sortie ci-dessus).');
    dire('✓ tests');

    // 7. The commit, in the copy: the commit validated is the commit that enters.
    // The guards have just run (in `npm run verifier`): a pre-commit hook that plays them skips them under
    // GRILLHOUSE_INTEGRATION=1; commit-msg (a closed ticket refuses a second commit, a reopened one takes its corrections) runs as always.
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

    // 8. The branch of the ticket takes the commit; the ticket's copy follows it (it carried the
    // lot, which the commit now holds) and is removed; the ticket waits in the queue.
    const pose = git('update-ref', `refs/heads/${branche}`, commit);
    if (pose.status !== 0) {
      return refuser(`La branche ${branche} ne prend pas ${commit.slice(0, 7)} :\n${pose.stderr}`);
    }
    if (avecCopie) {
      spawnSync('git', ['-C', copieTicket, 'reset', '-q', '--hard', commit], { encoding: 'utf8' });
    }
    bd('update', o.ticket, '--add-label', 'en-file');
    dire(`✓ commit ${commit.slice(0, 7)} sur ${branche}`);
    const retrait = avecCopie
      ? spawnSync('bash', [RETIRER_COPIE, '--garder-travail', copieTicket], {
          cwd: racine,
          encoding: 'utf8',
        })
      : { status: 0, stderr: '' };
    if (retrait.status !== 0) {
      const raison = `La copie ${copieTicket} n'est pas retirée après le commit de ${branche} : ${retrait.stderr.trim()}\nLa branche reste en file.`;
      bd('comments', 'add', o.ticket, raison);
      dire(`⚠ ${raison}`);
    }
    inscrireEntree(racine, branche, o.ticket);
    dire('✓ en file');
    const duree = Math.round((Date.now() - debut) / 100) / 10;
    dire(`⏱ ${duree} s`);
    return 0;
  } finally {
    base.fermer();
    lacherVerrou(verrou);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main(process.argv.slice(2));
}
