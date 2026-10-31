import { execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { canWrap } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { CADRE, RACINE, valeursDe } from './cadre.js';

// The trial harness of the circuit of a ticket (scripts/circuit.mjs), shared by its tests
// (tests/circuit*.nuit.spec.ts): the frame's paths, the stand-ins of claude and bd, the scenarios a
// test writes for each role, and the trial repository, which circuitEssai builds in the trial
// directory of the file that calls it.
//
// The frame's package is the one of the same tree (./cadre.ts).
//
// The trial repository holds two packages, `000-forms` (packages/forms) and `030-binder`
// (packages/binder, which depends on forms), whose `mesure` is wrong until the developpeur writes
// it; with `feuille`, a third, `060-sheet` (packages/sheet), which depends on none. Each session of the
// testwriter and the developpeur is a real launch (scripts/enveloppe/lancer.sh) in a real envelope;
// the explorateur's, the questionneur's and the reviewer's are claude in the ticket's copy, out of the envelope; claude
// is a stand-in (CLAUDE_BIN)
// that plays the scenario the test wrote for its role, and bd is a stand-in on the PATH whose
// tickets and comments live in the main tree's `.beads/`, which the envelope leaves writable. The
// proof and the checks are real runs of the frame's commands (npm test, npm run verifier), and the
// integration the frame's script (scripts/integration/integrer.mjs).

export const CIRCUIT = path.join(CADRE, 'scripts/circuit.mjs');
const ENVELOPPE = path.join(CADRE, 'scripts/enveloppe/enveloppe.mjs');
export const BASE = path.join(CADRE, 'scripts/langages/typescript/vitest-config/base.mjs');

// The turbo.json of each package of <racine> and its root's, written by the frame's command.
export function ecrireTurbo(racine: string): void {
  const r = spawnSync(
    process.execPath,
    [path.join(CADRE, 'bin/grillhouse.mjs'), 'turbo-des-paquets', '--ecrire'],
    { cwd: racine, encoding: 'utf8' }
  );
  if (r.status !== 0) {
    throw new Error(`turbo-des-paquets --ecrire : ${r.stderr}`);
  }
}

// Waits <ms> milliseconds, the process blocked.
const attendre = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Opens a base of a pass of <genre> in <dans> (scripts/mesure/base-de-passe.mjs) in a process of
 * its own, which lives until `fermer`: its owner lives as long as the base is open.
 */
export function ouvrirBaseEnProcessus(
  genre: string,
  { dans }: { dans: string }
): { base: string; dossier: string; fermer: () => void } {
  const tenue = mkdtempSync(path.join(tmpdir(), 'base-tenue-'));
  const remise = path.join(tenue, 'base.json');
  const module = pathToFileURL(path.join(CADRE, 'scripts/mesure/base-de-passe.mjs')).href;
  const code = `import { writeFileSync } from 'node:fs';
const { ouvrirBase } = await import(${JSON.stringify(module)});
const b = ouvrirBase(${JSON.stringify(genre)}, { dans: ${JSON.stringify(dans)} });
process.on('SIGTERM', () => { b.fermer(); process.exit(0); });
process.stdin.on('end', () => process.exit(0));
process.stdin.resume();
writeFileSync(${JSON.stringify(remise)}, JSON.stringify({ base: b.base, dossier: b.dossier }));`;
  const enfant = spawn(process.execPath, ['--input-type=module', '-e', code], {
    stdio: ['pipe', 'ignore', 'inherit'],
  });
  enfant.unref();
  for (let i = 0; !existsSync(remise); i++) {
    if (i > 1500) {
      throw new Error(`ouvrirBase ${genre} : aucune base après 30 s`);
    }
    attendre(20);
  }
  const { base, dossier } = JSON.parse(readFileSync(remise, 'utf8')) as {
    base: string;
    dossier: string;
  };
  rmSync(tenue, { recursive: true, force: true });
  const fermer = () => {
    enfant.kill('SIGTERM');
    for (let i = 0; existsSync(base); i++) {
      if (i > 1500) {
        throw new Error(`ouvrirBase ${genre} : la base reste après 30 s`);
      }
      attendre(20);
    }
  };
  return { base, dossier, fermer };
}

export const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;
export const ecrire = (f: string, texte: string, mode?: number) => {
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, texte, mode === undefined ? undefined : { mode });
};

// The stand-in for claude, run in the envelope with the copy as working directory. It finds the
// main tree from git, reads its ticket in the prompt, records the call (prompt, arguments, working
// directory, the author of its comments at the ticket, `BEADS_ACTOR`, in `<role>-<n>.acteur`, its
// role in `ordre`, the plan's packages in `<role>-<n>.paquets`), leaves a line of transcript where
// Claude Code keeps the copy's, then sources the scenario of its role: `<role>-<n>.sh` for its n-th
// session, else `<role>.sh`. A scenario writes in the first package of the plan (`$c`), or in any
// package of the plan by its path, hands over with
// `passation <text>`, a comment under the session's author, as bd writes it, and ends on its sheet
// with `fiche '<json>'`. As claude with `--output-format json`, it prints on its standard output
// its JSON result alone, whatever the scenario prints (on its standard error), the sheet in
// `structured_output`: the scenario's, else `{"statut":"FAIT"}` for a testwriter, the same for a
// developpeur with an answer `levé` to each finding its prompt carries (« ### Constat <n> — <titre> »),
// `{"issue":"AUCUNE"}` for the questionneur (a plan it has no question on), for the explorateur the plan
// its ticket holds (the components of its title, no criterion added, no open question), or on the
// schema of the tri a verdict `sans-suite` for each discovery its prompt lists, none for another role
// or after `sans_fiche`; a `--json-schema` that is not JSON fails, code 1,
// as claude refuses it. As claude, a session `--session-id <id>` keeps its transcript in
// `<id>.jsonl` (an id already in use fails, code 1), and `--resume <id>` adds to that transcript,
// found in the folder of its working directory, or fails, code 1, its scenario not played, when
// there is none.
const FAUX_CLAUDE = `#!/bin/bash
racine=$(cd "$(git rev-parse --path-format=absolute --git-common-dir)/.." && pwd)
prompt=$(cat)
ticket=$(printf '%s\\n' "$prompt" | sed -n 's/^TON TICKET : \\([^ ]*\\).*/\\1/p' | head -1)
role= prec= sid= reprise= schema= format=
for a in "$@"; do
  [ "$prec" = --agent ] && role=$a
  [ "$prec" = --session-id ] && sid=$a
  [ "$prec" = --resume ] && reprise=$a
  [ "$prec" = --json-schema ] && schema=$a
  [ "$prec" = --output-format ] && format=$a
  prec=$a
done
if [ -n "$schema" ]; then
  node -e 'JSON.parse(process.argv[1])' "$schema" 2> /dev/null || { echo "Invalid --json-schema" >&2; exit 1; }
fi
e="$racine/.beads/essai/$ticket"
mkdir -p "$e"
n=$(( $(cat "$e/$role.n" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$e/$role.n"
printf '%s' "$prompt" > "$e/$role-$n.prompt"
printf '%s\\0' "$@" > "$e/$role-$n.args"
pwd > "$e/$role-$n.pwd"
printf '%s' "\${BEADS_ACTOR-}" > "$e/$role-$n.acteur"
# In the envelope, the plan's packages are in GRILLHOUSE_ENVELOPPE, joined by \`:\`; \`$c\` the first.
c=\${GRILLHOUSE_ENVELOPPE-}
c=\${c%%:*}
printf '%s' "\${GRILLHOUSE_ENVELOPPE-}" > "$e/$role-$n.paquets"
echo "$role" >> "$e/ordre"
d="$HOME/.claude/projects/$(pwd | sed 's/[^A-Za-z0-9]/-/g')"
mkdir -p "$d"
if [ -n "$reprise" ]; then
  [ -f "$d/$reprise.jsonl" ] || { echo "No conversation found with session ID: $reprise" >&2; exit 1; }
  echo '{"type":"user"}' >> "$d/$reprise.jsonl"
elif [ -n "$sid" ]; then
  [ ! -f "$d/$sid.jsonl" ] || { echo "Session ID $sid is already in use." >&2; exit 1; }
  echo '{"type":"user"}' >> "$d/$sid.jsonl"
else
  echo '{"type":"user"}' >> "$d/$role-$n.jsonl"
fi
passation() {
  node -e 'require("fs").appendFileSync(process.argv[1], JSON.stringify({ author: process.argv[3], text: process.argv[2], created_at: new Date().toISOString().slice(0, 19) + "Z" }) + "\\n")' "$racine/.beads/$ticket.comments.jsonl" "$1" "\${BEADS_ACTOR-}"
}
# The sheet of the session, and none at all.
la_fiche=
case "$role" in
  testwriter) la_fiche='{"statut":"FAIT"}' ;;
  developpeur) la_fiche=$(node -e '
const titres = [...process.argv[1].matchAll(/^### Constat \\d+ — (.+)$/gm)].map(m => m[1]);
const reponses = titres.map(titre => ({ titre, etat: "levé", piece: "$ git diff\\nle correctif" }));
console.log(JSON.stringify({ statut: "FAIT", ...(reponses.length ? { reponses } : {}) }));' "$prompt") ;;
  questionneur) la_fiche='{"issue":"AUCUNE"}' ;;
  explorateur) la_fiche=$(node -e '
const [ticket, schema, prompt] = process.argv.slice(1);
if (schema.includes("\\"verdicts\\"")) {
  const ids = [...prompt.matchAll(/^- (\\S+) — /gm)].map(m => m[1]);
  console.log(JSON.stringify({ verdicts: ids.map(decouverte => ({ decouverte, verdict: "sans-suite", texte: "hors de l’usage actuel." })) }));
} else {
  const t = JSON.parse(require("fs").readFileSync(ticket, "utf8"))[0];
  const paquets = String(t.title).split(" — ").pop().split(",").map(s => s.trim()).filter(Boolean);
  console.log(JSON.stringify({ criteres: [], paquets, questions: [] }));
}' "$racine/.beads/$ticket.json" "$schema" "$prompt") ;;
esac
fiche() { la_fiche=$1; }
sans_fiche() { la_fiche=; }
# The result on the standard output, the scenario's own output on the standard error.
exec 3>&1 1>&2
resultat() {
  [ "$format" = json ] || return 0
  node -e 'const [s, f] = process.argv.slice(1); const r = { type: "result", subtype: "success", is_error: false, session_id: s, result: "fini" }; if (f) r.structured_output = JSON.parse(f); console.log(JSON.stringify(r));' "\${sid:-$reprise}" "$la_fiche" >&3
}
trap resultat EXIT
s="$e/$role-$n.sh"
[ -f "$s" ] || s="$e/$role.sh"
[ -f "$s" ] && . "$s"
exit 0
`;

// The stand-in for bd, run by the circuit from the main tree: a ticket is `.beads/<id>.json`, its
// comments `.beads/<id>.comments.jsonl`, each under its author, `BEADS_ACTOR`, else git's user
// (`t`), with its time to the second, as bd writes it; `update` (--status, --add-label repeatable,
// --remove-label, -d/--description, --notes, --title), `close` (--reason, -r) and `reopen` write
// its state, as the integration, the queue and the circuit change it; `create` (--parent, -l,
// -d) makes a child `<parent>.<n>`, and prints its id, and `config get issue_prefix` is `demo`,
// as scripts/ticket.sh uses them.
const FAUX_BD = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const [cmd, ...r] = process.argv.slice(2);
const b = path.join(process.cwd(), '.beads');
const commentaires = id => path.join(b, id + '.comments.jsonl');
if (cmd === 'config') {
  process.stdout.write('demo\\n');
} else if (cmd === 'create') {
  const v = o => (r.includes(o) ? r[r.indexOf(o) + 1] : null);
  const parent = v('--parent');
  let n = 1;
  while (fs.existsSync(path.join(b, parent + '.' + n + '.json'))) n++;
  const id = parent + '.' + n;
  fs.writeFileSync(path.join(b, id + '.json'), JSON.stringify([{ id, title: r[0], parent, labels: [v('-l')], description: v('-d') ?? '', status: 'open' }]));
  process.stdout.write(id + '\\n');
} else if (cmd === 'show') {
  process.stdout.write(fs.readFileSync(path.join(b, r[0] + '.json'), 'utf8'));
} else if (cmd === 'comments' && r[0] === 'add') {
  fs.appendFileSync(commentaires(r[1]), JSON.stringify({ author: process.env.BEADS_ACTOR || 't', text: r[2], created_at: new Date().toISOString().slice(0, 19) + 'Z' }) + '\\n');
} else if (cmd === 'comments') {
  const f = commentaires(r[0]);
  const l = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\\n').filter(Boolean) : [];
  process.stdout.write(JSON.stringify(l.map(x => JSON.parse(x))));
} else if (['update', 'close', 'reopen'].includes(cmd)) {
  const f = path.join(b, r[0] + '.json');
  const [t] = JSON.parse(fs.readFileSync(f, 'utf8'));
  const v = o => (r.includes(o) ? r[r.indexOf(o) + 1] : null);
  t.labels = t.labels ?? [];
  if (cmd === 'close') Object.assign(t, { status: 'closed', close_reason: v('--reason') ?? v('-r') });
  if (v('--title')) t.title = v('--title');
  if (cmd === 'reopen') t.status = 'open';
  if (v('--status')) t.status = v('--status');
  r.forEach((x, i) => { if (x === '--add-label') t.labels.push(r[i + 1]); });
  if (v('--remove-label')) t.labels = t.labels.filter(x => x !== v('--remove-label'));
  if (v('-d') ?? v('--description')) t.description = v('-d') ?? v('--description');
  if (v('--notes')) t.notes = v('--notes');
  fs.writeFileSync(f, JSON.stringify([t]));
} else {
  process.exit(1);
}
`;

// The project's guard of the trial repository, run in a copy: it writes the envelope it runs in
// (`GRILLHOUSE_ENVELOPPE`, empty outside) in `.beads/essai/<ticket>/gardes`, and judges a
// neighbour, its findings in SARIF by the frame's means (ecrireSarif of scripts/resultats.mjs),
// beside its output: while `packages/binder/garde-rouge.txt` exists and the code of forms does not
// carry `// accordé`, it is red and names the file of forms; so, while `packages/binder/arbitrer.txt`
// exists, with a finding to settle (`a-arbitrer`); so, while `packages/binder/garde-finale.txt`
// exists, out of an envelope alone: a red the final pass alone sees. While `packages/binder/ping-pong.txt`
// exists, it is always red, and names the component whose `tour` (a count each one keeps in its
// directory) is behind, forms on a tie: the two components send the red to each other. While
// `packages/forms/garde-globale.txt` exists, it is red without SARIF, its output naming a file of
// forms: a red no finding situates. While the main tree holds `.beads/essai/integration/rouge` and
// the code of forms does not carry `// accordé`, it is red in the integration copy alone
// (`.claude/worktrees/integration`): a red the checks of the ticket's copy never see, as a path of
// the copy written in a fingerprint (BP 320.37), which the lot lifts, or the removal of that file,
// as the load of the machine or main lifts it (BP 320.16).
const GARDE = `import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ecrireSarif } from ${JSON.stringify(path.join(CADRE, 'scripts/resultats.mjs'))};
const commun = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
  encoding: 'utf8',
}).trim();
const e = path.join(path.dirname(commun), '.beads', 'essai', path.basename(process.cwd()));
mkdirSync(e, { recursive: true });
appendFileSync(path.join(e, 'gardes'), (process.env.GRILLHOUSE_ENVELOPPE ?? '') + '\\n');
const accorde = readFileSync('packages/forms/src/index.mjs', 'utf8').includes('// accordé');
const rouge = (fichier, message, genre) => {
  console.log('⛔ ' + fichier + ':1 — ' + message);
  ecrireSarif({ garde: 'mesure', constats: [{ fichier, ligne: 1, message, genre }] });
  process.exit(1);
};
if (existsSync('packages/forms/garde-globale.txt')) {
  console.log('⛔ packages/forms/src/index.mjs:1 — une garde sans SARIF.');
  process.exit(1);
}
if (existsSync('packages/binder/garde-rouge.txt') && !accorde) {
  rouge('packages/forms/src/index.mjs', 'la mesure ne suit pas le classeur.');
}
if (existsSync('packages/binder/garde-finale.txt') && !accorde && !process.env.GRILLHOUSE_ENVELOPPE) {
  rouge('packages/forms/src/index.mjs', 'la mesure ne suit pas le classeur, hors enveloppe.');
}
if (
  path.basename(process.cwd()) === 'integration' &&
  existsSync(path.join(e, 'rouge')) &&
  !accorde
) {
  rouge('packages/forms/src/index.mjs', 'la mesure lit un chemin que seule l’intégration voit.');
}
if (existsSync('packages/binder/arbitrer.txt') && !accorde) {
  rouge('packages/forms/src/index.mjs', 'la mesure attend un arbitrage.', 'a-arbitrer');
}
const tour = d => (existsSync(d + '/tour') ? Number(readFileSync(d + '/tour', 'utf8')) : 0);
if (existsSync('packages/binder/ping-pong.txt')) {
  const qui = tour('packages/forms') <= tour('packages/binder') ? 'forms' : 'binder';
  rouge('packages/' + qui + '/src/index.mjs', 'les deux composants se renvoient la mesure.');
}
ecrireSarif({ garde: 'mesure', constats: [] });
`;

// The test of each package that HEAD already holds, green before any ticket: the trial repository
// is green on main, as `npm run verifier` plays it (a package without a test is red).
const ANCIEN = `import { expect, it } from 'vitest';
import { mesure } from '../src/index.mjs';
it('ancien — mesure rend un nombre', () => { expect(typeof mesure(1)).toBe('number'); });
`;

// The project's charter of the trial repository: its rubrics « Comment on arbitre » and « Ce qui
// monte au superviseur », which the questionneur's instruction carries.
const CHARTE = [
  '# Essai',
  '',
  '## Comment on arbitre',
  '',
  '1. **Que fait la référence mature ?** Un tableur mûr calcule chaque mesure une fois.',
  '',
  '## Ce qui monte au superviseur',
  '',
  'Le format publié de la mesure.',
  '',
  '## Commandes',
  '',
  '- `npm test`.',
].join('\n');

// The description of each trial ticket: its Architecture section and its one criterion.
export const DESCRIPTION = [
  '## Architecture',
  '',
  'La mesure vit dans chaque composant.',
  '',
  "## Critères d'acceptation",
  '',
  '1. `mesure` rend le double de sa valeur.',
].join('\n');

// What a scenario writes. A test the code of today fails, one it passes already, one whose file
// does not load.
export const ECRIT_ROUGE = `mkdir -p $c/test
cat > $c/test/mesure.test.mjs <<'EOF'
import { expect, it } from 'vitest';
import { mesure } from '../src/index.mjs';
it('critère 1 — mesure rend le double', () => { expect(mesure(2)).toBe(4); });
EOF
`;
export const CODE_JUSTE = `printf 'export const mesure = x => 2 * x;\\n' > $c/src/index.mjs\n`;

// The head of the instruction of a testwriter or a developpeur in a run the supervisor gives its
// task (`--contexte`, or the question `--etendre` gives it), the task after it (grillhouse-jya).
export const TA_TACHE =
  'TA TÂCHE, que le superviseur te donne ; elle passe avant le ticket, le rapport ci-dessous :\n\n';

export const lire = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
export const sortie = (r: { stdout: string; stderr: string }) => `${r.stdout}\n${r.stderr}`;

// The circuit's named values, read once in a process; a circuit that does not load leaves them
// empty, and the tests that read them fail on their own assertion.
const valeurs = valeursDe('scripts/circuit.mjs', ['ARRETS', 'IMMOBILE_MS']);
export const ARRETS = (valeurs.ARRETS ?? {}) as Record<string, number>;
export const IMMOBILE_MS = (valeurs.IMMOBILE_MS ?? 0) as number;

// The trial repository of one test file under <ESSAIS>, built when this machine can wrap an
// envelope, and what reads and drives it; <feuille> adds the third package; <gardesSansCache> keeps
// the project's guard out of Turborepo's cache, so that the integration copy plays it again, where
// the checks of the ticket's copy played it green (the guard red in the integration copy alone).
export function circuitEssai(ESSAIS: string, { feuille = false, gardesSansCache = false } = {}) {
  const REPO = path.join(ESSAIS, 'depot');
  const HOME = path.join(ESSAIS, 'home');
  const BIN = path.join(ESSAIS, 'bin');
  const BEADS = path.join(REPO, '.beads');

  // The envelope as the trial repository holds it: enveloppe.mjs and every module it imports.
  function installerEnveloppe() {
    const vus = new Set<string>();
    const suivre = (fichier: string) => {
      if (vus.has(fichier)) {
        return;
      }
      vus.add(fichier);
      ecrire(path.join(REPO, path.relative(RACINE, fichier)), readFileSync(fichier, 'utf8'));
      for (const [, spec] of readFileSync(fichier, 'utf8').matchAll(
        /^\s*(?:import|export)\b[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/gm
      )) {
        suivre(path.resolve(path.dirname(fichier), spec));
      }
    };
    suivre(ENVELOPPE);
  }

  // The trial repository: two packages of the frame, each with its tests under Vitest, the frame's
  // test commands as its scripts, the frame's guards that pass and the project's guard (GARDE).
  function depot() {
    ecrire(
      path.join(REPO, 'package.json'),
      json({
        name: 'essai',
        private: true,
        type: 'module',
        workspaces: ['packages/*'],
        packageManager: 'npm@10.9.8',
        grillhouse: { langages: ['typescript'] },
        scripts: {
          test: `node ${path.join(CADRE, 'scripts/langages/typescript/tests.mjs')}`,
          verifier: `node ${path.join(CADRE, 'scripts/langages/typescript/verifier.mjs')}`,
          'grillhouse:gardes': 'node -e 0',
          gardes: 'node garde.mjs',
        },
      })
    );
    ecrire(
      path.join(REPO, 'turbo.json'),
      readFileSync(path.join(RACINE, 'templates/turbo/paquets.json'), 'utf8')
    );
    // Each package: its directory, its name, the fields of its package.json.
    type Paquet = [string, string, Record<string, unknown>];
    const lesPaquets: Paquet[] = [
      ['forms', '000-forms', {}],
      ['binder', '030-binder', { dependencies: { '000-forms': '*' } }],
      ...(feuille ? [['sheet', '060-sheet', {}] as Paquet] : []),
    ];
    for (const [dossier, nom, champs] of lesPaquets) {
      const p = path.join(REPO, 'packages', dossier);
      ecrire(
        path.join(p, 'package.json'),
        json({ name: nom, type: 'module', scripts: { 'test:unit': 'vitest run' }, ...champs })
      );
      ecrire(path.join(p, 'src/index.mjs'), 'export const mesure = x => x;\n');
      ecrire(
        path.join(p, 'vitest.config.mjs'),
        `import base from ${JSON.stringify(BASE)};\nexport default base;\n`
      );
    }
    for (const [dossier] of lesPaquets) {
      ecrire(path.join(REPO, `packages/${dossier}/test/ancien.test.mjs`), ANCIEN);
    }
    ecrire(path.join(REPO, 'garde.mjs'), GARDE);
    ecrire(path.join(REPO, 'CLAUDE.md'), CHARTE);
    ecrireTurbo(REPO);
    if (gardesSansCache) {
      const f = path.join(REPO, 'turbo.json');
      const turbo = JSON.parse(readFileSync(f, 'utf8')) as {
        tasks: Record<string, Record<string, unknown>>;
      };
      turbo.tasks['//#gardes'] = { ...turbo.tasks['//#gardes'], cache: false };
      ecrire(f, json(turbo));
    }
    ecrire(
      path.join(REPO, '.gitignore'),
      'node_modules\n.turbo/\ndist/\n.beads/\n.claude/worktrees/\n'
    );
    ecrire(path.join(REPO, 'faux-claude.sh'), FAUX_CLAUDE, 0o755);
    installerEnveloppe();
    mkdirSync(BEADS, { recursive: true });
    ecrire(path.join(BIN, 'bd'), FAUX_BD, 0o755);
    mkdirSync(path.join(HOME, '.claude/projects'), { recursive: true });
    const git = (...a: string[]) =>
      execFileSync('git', ['-C', REPO, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
    git('init', '-q', '-b', 'main');
    git('add', '.');
    git('commit', '-qm', 'init');
    // The integration's copy made ahead, with this repository's dependencies, as a project holds them.
    const integration = path.join(REPO, '.claude/worktrees/integration');
    git('worktree', 'add', '-q', '--detach', integration);
    symlinkSync(path.join(RACINE, 'node_modules'), path.join(integration, 'node_modules'), 'dir');
  }
  if (canWrap) {
    depot();
  }
  // The main of the trial as the repository holds it before any ticket: the queue brings each lot
  // accepted onto it, and every test starts again from it.
  const INITIAL = canWrap
    ? execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    : '';
  const revenirAuDebut = () =>
    execFileSync('git', ['-C', REPO, 'reset', '-q', '--hard', INITIAL], { encoding: 'utf8' });

  // A ticket of the stand-in bd, whose title names <composants>; its copy made ahead, with this
  // repository's dependencies as its own (the launcher then installs nothing), as a project holds them.
  // Its reviewer accepts the lot, by its sheet, unless the test writes it another scenario.
  function ticket(id: string, composants: string) {
    ecrire(
      path.join(BEADS, `${id}.json`),
      json([{ id, title: `${id} — La mesure — ${composants}`, description: DESCRIPTION }])
    );
    const copie = path.join(REPO, '.claude/worktrees', id);
    execFileSync('git', ['-C', REPO, 'worktree', 'add', '-q', '-b', `agent/${id}`, copie]);
    symlinkSync(path.join(RACINE, 'node_modules'), path.join(copie, 'node_modules'), 'dir');
    scenario(id, 'relecteur', `fiche '{"verdict":"ACCEPTÉ"}'\n`);
    return copie;
  }

  // The scenario of a role's sessions on ticket <id>: `<role>.sh` for each, `<role>-<n>.sh` for
  // the n-th.
  const scenario = (id: string, nom: string, script: string) =>
    ecrire(path.join(BEADS, 'essai', id, `${nom}.sh`), script);

  // The circuit's environment: this process's without what Vitest set for itself nor the session
  // of Claude Code that runs the tests (a test names the supervisor's session it needs), the
  // stand-ins first on the PATH and for claude.
  const ENV = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        ([k]) => !k.startsWith('VITEST') && k !== 'NODE_OPTIONS' && k !== 'CLAUDE_CODE_SESSION_ID'
      )
    ),
    PATH: `${BIN}${path.delimiter}${path.join(RACINE, 'node_modules/.bin')}${path.delimiter}${process.env.PATH ?? ''}`,
    CLAUDE_BIN: path.join(REPO, 'faux-claude.sh'),
    HOME,
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@t',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@t',
    TURBO_TELEMETRY_DISABLED: '1',
    DO_NOT_TRACK: '1',
  };

  const circuit = (args: string[], env: Record<string, string> = {}) =>
    spawnSync('node', [CIRCUIT, ...args], {
      cwd: REPO,
      encoding: 'utf8',
      env: { ...ENV, ...env },
      timeout: 280_000,
    });
  const essai = (id: string, f: string) => lire(path.join(BEADS, 'essai', id, f));
  const sessions = (id: string, role: string) => Number(essai(id, `${role}.n`) || 0);
  const args = (id: string, role: string, n: number) =>
    essai(id, `${role}-${n}.args`).split('\0').slice(0, -1);
  const etat = (id: string) =>
    JSON.parse(lire(path.join(REPO, '.claude/worktrees', `${id}.circuit.json`)) || 'null') as {
      etape: string;
      tentative: number;
      code: number | null;
      raison: string | null;
      rapport: string | null;
      journal: string;
      finale: boolean;
      seance: number | null;
      processus: number;
      paquets: string[];
      constats: { titre: string; role: string; regle: string; corps: string; piece?: string }[];
      verifie: string | null;
      question: {
        arret: string;
        fait: string;
        piece: string | null;
        question: string;
        qui: string;
      } | null;
    } | null;
  // The order of the sessions of the lot; those of the plan, the explorateur's and the
  // questionneur's, which the default sheets of the stand-in end at once on the ticket's plan, aside
  // unless <plan> asks for them (tests/unit/circuit.plan.spec.ts).
  const ordre = (id: string, { plan = false } = {}) =>
    essai(id, 'ordre')
      .trim()
      .split('\n')
      .filter(l => plan || !['explorateur', 'questionneur'].includes(l));
  // The log of the ticket, and the commands of the circuit it holds, in their order (`$ …`).
  const journal = (id: string) => lire(path.join(REPO, '.claude/worktrees', `${id}.log`));
  const commandes = (id: string) =>
    journal(id)
      .split('\n')
      .filter(l => l.startsWith('$ '))
      .map(l => l.slice(2));
  // The entries of the ticket's sheets and of the circuit's results, in their order.
  const entrees = (id: string) =>
    lire(path.join(REPO, '.claude/worktrees', `${id}.fiches.jsonl`))
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l) as Record<string, unknown>);
  const gitRepo = (...a: string[]) => execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' });
  // Every comment at the ticket, each with its author and its time.
  const tous = (id: string) =>
    lire(path.join(BEADS, `${id}.comments.jsonl`))
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l) as { author: string; text: string; created_at: string });
  // The bilan the circuit writes at each of its ends (scripts/bilan.mjs), a line `Circuit · bilan :
  // …`, read apart from its history.
  const BILAN = /^Circuit · bilan :/;
  const bilans = (id: string) => tous(id).filter(c => BILAN.test(c.text));
  // The comments at the ticket, each with its author, the bilan aside.
  const auteurs = (id: string) => tous(id).filter(c => !BILAN.test(c.text));
  const commentaires = (id: string) => auteurs(id).map(c => c.text);
  // The circuit's history at the ticket: the step of each comment « Circuit · <étape> : … », the
  // lines of its gestures, of its questions and of the plan aside
  // (tests/unit/circuit.gestes.spec.ts, tests/unit/circuit.montee.spec.ts and
  // tests/unit/circuit.plan.spec.ts read them).
  const historique = (id: string) =>
    commentaires(id).flatMap(t => {
      const m = /^Circuit · (\S+) :/.exec(t);
      return m && !['geste', 'question', 'plan', 'questionnement'].includes(m[1]) ? [m[1]] : [];
    });
  return {
    REPO,
    BEADS,
    revenirAuDebut,
    ticket,
    scenario,
    ENV,
    circuit,
    essai,
    sessions,
    args,
    etat,
    ordre,
    journal,
    commandes,
    entrees,
    gitRepo,
    auteurs,
    commentaires,
    historique,
    bilans,
  };
}
