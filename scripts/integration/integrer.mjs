#!/usr/bin/env node
// The mechanical steps of one integration, run by the integrateur agent once it has judged the
// lot. It commits the lot, or refuses it with the full output of the step that refused.
//
//   node scripts/integration/integrer.mjs --ticket <id> [--ticket <id>…]
//        [--tests <patch>] [--code <patch>] --message <file> [--admettre "<test name>"…]
//
// In order, each step refusing stops the run:
//  1. the verdicts: each --ticket has `ACCEPTÉ` as its last reviewer verdict (`ACCEPTÉ` or
//     `RENDU` at the start of a comment) and, when labelled `arbitrage`, each « ## Arbitrage »
//     comment is `### Verdict — tranché`, or a « ## Réponse du responsable » comment follows it;
//  2. the lots: the tests lot touches test files only, the code lot no test file;
//  3. the tree: the index is empty and every file of the lots is unmodified in the work tree;
//  4. the base: the project's suites (`npm run integration:suites -- <packages>`) on HEAD; suites
//     that fail without naming a test leave nothing to compare, and refuse;
//  5. the lots, applied in three ways to the index and the work tree, tests first;
//  6. the project's guards (`npm run integration:gardes`, when present);
//  7. the suites again: a failing test that the base did not have and --admettre does not name
//     refuses the lot, compared name by name;
//  8. the commit of the lots' files with the message, its hooks included, then an empty index.
//
// The suites command receives the touched packages (`packages/<x>`) as arguments and writes the
// names of its failing tests, one per line, to the file named by the ROUGES variable.
// One integration runs at a time (`.git/integration.lock`). A refusal after step 5 restores the
// lots' files to HEAD. Exit code: 0 committed, 1 refused, 2 usage or another integration running.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isTestFile } from '../verrous/verrou.mjs';

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

// The refusal for the files of the lots, or null.
export function refusLots(tests, code) {
  const horsTests = tests.filter(f => !isTestFile(f));
  if (horsTests.length) return `Le lot de tests touche du code : ${horsTests.join(', ')}.`;
  const tests2 = code.filter(isTestFile);
  if (tests2.length) return `Le lot de code touche des tests : ${tests2.join(', ')}.`;
  return null;
}

// The failing tests after the lot that the base did not have and that are not admitted.
export function nouveauxRouges(base, apres, admis = []) {
  const connus = new Set([...base, ...admis]);
  return [...new Set(apres)].filter(n => !connus.has(n));
}

// The packages a list of files touches: `packages/<x>`, in order.
export function paquets(fichiers) {
  const out = new Set();
  for (const f of fichiers) {
    const m = /^packages\/[^/]+/.exec(f);
    if (m) out.add(m[0]);
  }
  return [...out].sort();
}

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
  const dire = s => process.stdout.write(`${s}\n`);
  const refuser = s => {
    process.stdout.write(`⛔ ${s}\nLe lot retourne à son agent avec cette sortie.\n`);
    return 1;
  };
  const absolu = p => path.resolve(p);

  // One integration at a time; a lock whose process is gone is taken over.
  const verrou = path.join(
    spawnSync('git', ['-C', racine, 'rev-parse', '--path-format=absolute', '--git-common-dir'], {
      encoding: 'utf8',
    }).stdout.trim(),
    'integration.lock'
  );
  if (existsSync(verrou)) {
    const pid = Number(readFileSync(verrou, 'utf8'));
    let vivant = false;
    try {
      process.kill(pid, 0);
      vivant = true;
    } catch {
      vivant = false;
    }
    if (vivant) {
      process.stderr.write(`⛔ Une intégration tourne déjà (processus ${pid}).\n`);
      return 2;
    }
  }
  writeFileSync(verrou, String(process.pid));
  const tmp = mkdtempSync(path.join(tmpdir(), 'integration-'));
  try {
    // 1. The verdicts.
    for (const id of o.tickets) {
      const bd = (...a) => spawnSync('bd', a, { cwd: racine, encoding: 'utf8' });
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
      return r.stdout
        .split('\0')
        .map(l => l.split('\t')[2])
        .filter(Boolean);
    };
    const tests = o.tests ? fichiersDe(absolu(o.tests)) : [];
    const code = o.code ? fichiersDe(absolu(o.code)) : [];
    if (!tests || !code) return refuser('Un patch du lot est illisible.');
    const r2 = refusLots(tests, code);
    if (r2) return refuser(r2);
    const fichiers = [...new Set([...tests, ...code])];
    dire(`✓ lots : ${fichiers.length} fichiers`);

    // 3. The tree.
    if (git('diff', '--cached', '--name-only').stdout.trim())
      return refuser("L'index n'est pas vide.");
    const tenus = git('status', '--porcelain', '--', ...fichiers).stdout.trim();
    if (tenus) return refuser(`Des fichiers du lot sont modifiés dans l'arbre :\n${tenus}`);
    dire('✓ arbre propre');

    const touches = paquets(fichiers);
    const suites = nom => {
      const rouges = path.join(tmp, nom);
      writeFileSync(rouges, '');
      const r = spawnSync('npm', ['run', '--silent', 'integration:suites', '--', ...touches], {
        cwd: racine,
        encoding: 'utf8',
        env: { ...process.env, ROUGES: rouges },
      });
      process.stdout.write(r.stdout + r.stderr);
      const noms = readFileSync(rouges, 'utf8')
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean);
      if (r.status !== 0 && noms.length === 0)
        noms.push(`(les suites sortent en ${r.status} sans test nommé)`);
      return noms;
    };

    // 4. The base.
    dire('— les suites sur HEAD (la base)');
    const base = suites('base');
    if (base.some(n => n.startsWith('(les suites sortent'))) {
      return refuser(
        'La base ne se mesure pas : les suites échouent sur HEAD sans nommer de test.'
      );
    }
    dire(`✓ base : ${base.length} rouges`);

    // From here on, a refusal restores the lots' files to HEAD.
    const restaurer = () => {
      git('reset', '-q', '--', ...fichiers);
      for (const f of fichiers) {
        const existe = git('cat-file', '-e', `HEAD:${f}`).status === 0;
        if (existe) git('checkout', 'HEAD', '--', f);
        else if (existsSync(path.join(racine, f))) unlinkSync(path.join(racine, f));
      }
    };
    const refuserEtRestaurer = s => {
      restaurer();
      return refuser(s);
    };

    // 5. The lots, applied.
    for (const p of lots) {
      const r = git('apply', '--3way', '--index', p);
      if (r.status !== 0)
        return refuserEtRestaurer(`Le lot ${p} ne s'applique pas :\n${r.stdout}${r.stderr}`);
    }
    dire('✓ lots appliqués');

    // 6. The guards.
    const gardes = spawnSync('npm', ['run', '--silent', '--if-present', 'integration:gardes'], {
      cwd: racine,
      encoding: 'utf8',
    });
    if (gardes.status !== 0)
      return refuserEtRestaurer(`Les gardes refusent :\n${gardes.stdout}${gardes.stderr}`);
    dire('✓ gardes');

    // 7. The suites, compared to the base.
    dire('— les suites avec le lot');
    const nouveaux = nouveauxRouges(base, suites('apres'), o.admettre);
    if (nouveaux.length)
      return refuserEtRestaurer(`Rouges nouveaux :\n${nouveaux.map(n => `  ✗ ${n}`).join('\n')}`);
    for (const a of o.admettre) dire(`⚠ admis par l'intégrateur : ${a}`);
    dire('✓ suites');

    // 8. The commit.
    const c = git('commit', '-q', '-F', absolu(o.message));
    if (c.status !== 0) return refuserEtRestaurer(`Le commit est refusé :\n${c.stdout}${c.stderr}`);
    const reste = git('diff', '--cached', '--name-only').stdout.trim();
    if (reste) return refuser(`L'index n'est pas vide après le commit :\n${reste}`);
    dire(`✓ commit ${git('rev-parse', '--short', 'HEAD').stdout.trim()}`);
    return 0;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(verrou, { force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(main(process.argv.slice(2)));
}
