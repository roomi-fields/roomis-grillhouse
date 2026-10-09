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
//  3. the main tree: every file of the lots is unmodified there;
//  4. a clean integration copy (`.claude/worktrees/integration`): detached on HEAD, every
//     untracked file removed, its dependencies installed again when `package-lock.json` changes
//     (`npm ci`), then built (`npm run build`, when present);
//  5. the base: the project's suites (`npm run integration:suites -- <components>`) on HEAD. The
//     project chooses at its installation (`grillhouse.integration` in package.json):
//     `impactes` (the default) replays the touched components and those that depend on them (the
//     consumers' graph), a lot without code of a component no suite, and every suite runs once a
//     night (`scripts/nuit.sh`); `complet` replays every suite at each integration;
//     suites that fail without naming a test leave nothing to compare, and refuse;
//  6. the lots, applied in three ways in the copy, tests first, then built;
//  7. the project's guards (`npm run integration:gardes`, when present);
//  8. the suites again: a failing test that the base did not have and --admettre does not name
//     refuses the lot, compared name by name;
//  9. the commit in the copy, its hooks included, under GRILLHOUSE_INTEGRATION=1: a pre-commit
//     hook that plays the guards skips them, as step 7 just played them; the commit validated is
//     the commit that enters;
// 10. main moves forward onto it (`merge --ff-only`); main moved in the meantime refuses.
//
// The main tree is touched by the fast-forward only: the supervisor's own files stay as they are.
// The suites command receives the components' directories to replay (`packages/a src/parser`),
// none for every suite (the night), and writes the names of its failing tests, one per line, to the file
// named by the ROUGES variable.
// The budget of an integration that touches one leaf component: 15 s, measured on the template
// (12.8 s with its first `npm ci`, 8.6 s after). A project sets its own, measured on its code
// (`npm pkg set grillhouse.budgetIntegration=<seconds>`). The duration is written at the end,
// with a warning past the budget.
// One integration runs at a time (`.git/integration.lock`). Exit code: 0 committed, 1 refused,
// 2 usage or another integration running.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { composants as lesComposants, utilise } from '../consommateurs.mjs';
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

export const BUDGET_FEUILLE_S = 15;

const lireJsonSiPresent = p => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);

const CODE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|svelte|vue)$/;

// What the suites replay for a lot. `composants` are the components' directories relative to the
// root; `consommateurs` maps a component's directory to the directories of those that use it.
// - no code file of a component: nothing (the guards only);
// - otherwise: the touched components and, transitively, those that depend on them, in order.
// The full suites run once a night (`scripts/nuit.sh`), never during an integration.
export function perimetre(fichiers, composants, consommateurs) {
  const touches = new Set();
  for (const f of fichiers.filter(f => CODE.test(f))) {
    const c = composants.find(d => f.startsWith(`${d}/`));
    if (c) touches.add(c);
  }
  if (touches.size === 0) return { mode: 'aucun', composants: [] };
  const file = [...touches];
  while (file.length) {
    for (const d of consommateurs.get(file.pop()) ?? []) {
      if (!touches.has(d)) {
        touches.add(d);
        file.push(d);
      }
    }
  }
  return { mode: 'composants', composants: [...touches].sort() };
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
  const debut = Date.now();
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

    // 3. The main tree: the lots' files are free there, so the fast-forward can bring them.
    const tenus = git('status', '--porcelain', '--', ...fichiers).stdout.trim();
    if (tenus) return refuser(`Des fichiers du lot sont modifiés dans l'arbre :\n${tenus}`);
    dire('✓ arbre principal libre');

    // 4. The integration copy: detached on HEAD, without any untracked file; its dependencies
    // are kept only while the lock file is the same (a CI cache keyed by the lock file).
    const tete = git('rev-parse', 'HEAD').stdout.trim();
    const copie = path.join(racine, '.claude', 'worktrees', 'integration');
    const dansCopie = (...args) => spawnSync('git', ['-C', copie, ...args], { encoding: 'utf8' });
    const prete = existsSync(copie)
      ? dansCopie('checkout', '-q', '--detach', '--force', tete).status === 0 &&
        dansCopie('clean', '-q', '-f', '-d', '-x', '-e', 'node_modules').status === 0
      : git('worktree', 'add', '-q', '--detach', copie, tete).status === 0;
    if (!prete) return refuser(`La copie d'intégration ${copie} ne se prépare pas.`);
    const npm = (args, env = {}) => {
      const r = spawnSync('npm', args, {
        cwd: copie,
        encoding: 'utf8',
        env: { ...process.env, ...env },
      });
      process.stdout.write(r.stdout + r.stderr);
      return r;
    };
    const verrouNpm = path.join(copie, 'package-lock.json');
    if (existsSync(verrouNpm)) {
      const cle = path.join(copie, 'node_modules', '.integration-lock');
      const empreinte = readFileSync(verrouNpm, 'utf8');
      if (!existsSync(cle) || readFileSync(cle, 'utf8') !== empreinte) {
        if (npm(['ci', '--no-audit', '--no-fund', '--silent']).status !== 0) {
          return refuser("Les dépendances de la copie d'intégration ne s'installent pas.");
        }
        writeFileSync(cle, empreinte);
      }
    }
    const construire = () => npm(['run', '--silent', '--if-present', 'build']).status === 0;
    if (!construire()) return refuser('HEAD ne se construit pas.');
    dire(`✓ copie d'intégration propre sur ${tete.slice(0, 7)}`);

    // What the suites replay: the touched components and those that depend on them.
    const comps = lesComposants(copie);
    const dirDe = new Map(comps.map(c => [c.nom, path.relative(copie, c.dir)]));
    const consommateurs = new Map();
    for (const [fournisseur, parConsommateur] of utilise(copie, comps)) {
      consommateurs.set(
        dirDe.get(fournisseur),
        [...parConsommateur.keys()].map(n => dirDe.get(n))
      );
    }
    // The project chooses at its installation (grill): `complet` replays every suite at each
    // integration; `impactes`, the default, the touched components, every suite once a night.
    const reglage = lireJsonSiPresent(path.join(copie, 'package.json'))?.grillhouse?.integration;
    const champ =
      reglage === 'complet'
        ? { mode: 'tous', composants: [] }
        : perimetre(fichiers, [...dirDe.values()], consommateurs);
    const touches = champ.composants;
    dire(
      champ.mode === 'aucun'
        ? '✓ aucun code de composant dans le lot : les gardes seulement'
        : champ.mode === 'tous'
          ? '✓ toutes les suites (réglage « complet »)'
          : `✓ suites de : ${touches.join(', ')}`
    );
    const suites = nom => {
      if (champ.mode === 'aucun') return [];
      const rouges = path.join(tmp, nom);
      writeFileSync(rouges, '');
      const r = npm(['run', '--silent', 'integration:suites', '--', ...touches], {
        ROUGES: rouges,
      });
      const noms = readFileSync(rouges, 'utf8')
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean);
      if (r.status !== 0 && noms.length === 0)
        noms.push(`(les suites sortent en ${r.status} sans test nommé)`);
      return noms;
    };

    // 5. The base.
    dire('— les suites sur HEAD (la base)');
    const base = suites('base');
    if (base.some(n => n.startsWith('(les suites sortent'))) {
      return refuser(
        'La base ne se mesure pas : les suites échouent sur HEAD sans nommer de test.'
      );
    }
    dire(`✓ base : ${base.length} rouges`);

    // 6. The lots, applied in the copy, then built.
    for (const p of lots) {
      const r = dansCopie('apply', '--3way', '--index', p);
      if (r.status !== 0) return refuser(`Le lot ${p} ne s'applique pas :\n${r.stdout}${r.stderr}`);
    }
    if (!construire()) return refuser('Le lot ne se construit pas.');
    dire('✓ lots appliqués et construits');

    // 7. The guards.
    const gardes = npm(['run', '--silent', '--if-present', 'integration:gardes']);
    if (gardes.status !== 0) return refuser('Les gardes refusent (sortie ci-dessus).');
    dire('✓ gardes');

    // 8. The suites, compared to the base.
    dire('— les suites avec le lot');
    const nouveaux = nouveauxRouges(base, suites('apres'), o.admettre);
    if (nouveaux.length)
      return refuser(`Rouges nouveaux :\n${nouveaux.map(n => `  ✗ ${n}`).join('\n')}`);
    for (const a of o.admettre) dire(`⚠ admis par l'intégrateur : ${a}`);
    dire('✓ suites');

    // 9. The commit, in the copy: the commit validated is the commit that enters.
    // The guards have just run: a pre-commit hook that plays them skips them under
    // GRILLHOUSE_INTEGRATION=1; commit-msg (one ticket, one commit) runs as always.
    const c = spawnSync('git', ['-C', copie, 'commit', '-q', '-F', absolu(o.message)], {
      encoding: 'utf8',
      env: { ...process.env, GRILLHOUSE_INTEGRATION: '1' },
    });
    if (c.status !== 0) return refuser(`Le commit est refusé :\n${c.stdout}${c.stderr}`);
    const commit = dansCopie('rev-parse', 'HEAD').stdout.trim();

    // 10. main moves forward onto it, or main has moved and the integration starts again.
    if (git('rev-parse', 'HEAD').stdout.trim() !== tete) {
      return refuser("main a bougé pendant l'intégration : relance-la sur le nouveau HEAD.");
    }
    const avance = git('merge', '-q', '--ff-only', commit);
    if (avance.status !== 0) {
      return refuser(
        `main n'avance pas sur ${commit.slice(0, 7)} :\n${avance.stdout}${avance.stderr}`
      );
    }
    dire(`✓ commit ${commit.slice(0, 7)}`);
    const duree = Math.round((Date.now() - debut) / 100) / 10;
    const budget =
      lireJsonSiPresent(path.join(racine, 'package.json'))?.grillhouse?.budgetIntegration ??
      BUDGET_FEUILLE_S;
    dire(`⏱ ${duree} s (budget d'une feuille : ${budget} s)`);
    if (champ.mode === 'composants' && touches.length === 1 && duree > budget) {
      dire(`⚠ au-delà du budget : ${duree} s pour un seul composant.`);
    }
    return 0;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(verrou, { force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(main(process.argv.slice(2)));
}
