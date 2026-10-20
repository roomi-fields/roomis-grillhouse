import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { canWrap } from '../machine.js';
import { ecrire as ecrireTurbo } from '../../scripts/turbo-des-paquets.mjs';

// The trial harness of the circuit of a ticket (scripts/circuit.mjs), shared by its tests
// (tests/unit/circuit*.spec.ts): the frame's paths, the stand-ins of claude and bd, the scenarios a
// test writes for each role, and the trial repository, which circuitEssai builds in the trial
// directory of the file that calls it.
//
// The trial repository holds two packages, `000-forms` (packages/forms) and `030-binder`
// (packages/binder), whose `mesure` is wrong until the developpeur writes it. Each session of the
// testeur and the developpeur is a real launch (scripts/enveloppe/lancer.sh) in a real envelope;
// the reviewer's and the chef de chantier's are claude in the ticket's copy, out of the envelope (a
// chef without a scenario answers nothing: the stop goes to the supervisor); claude is a stand-in (CLAUDE_BIN)
// that plays the scenario the test wrote for its role, and bd is a stand-in on the PATH whose
// tickets and comments live in the main tree's `.beads/`, which the envelope leaves writable. The
// proof and the checks are real runs of the frame's commands (npm test, npm run verifier), and the
// integration the frame's script (scripts/integration/integrer.mjs).

const RACINE = path.resolve(__dirname, '../..');
export const CIRCUIT = path.join(RACINE, 'scripts/circuit.mjs');
const ENVELOPPE = path.join(RACINE, 'scripts/enveloppe/enveloppe.mjs');
export const BASE = path.join(RACINE, 'scripts/vitest-config/base.mjs');

export const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;
export const ecrire = (f: string, texte: string, mode?: number) => {
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, texte, mode === undefined ? undefined : { mode });
};

// The stand-in for claude, run in the envelope with the copy as working directory. It finds the
// main tree from git, reads its ticket in the prompt, records the call (prompt, arguments, working
// directory, the author of its comments at the ticket, `BEADS_ACTOR`, in `<role>-<n>.acteur`, role
// and component in `ordre`, the role alone out of the envelope), leaves a line of transcript where
// Claude Code keeps the copy's, then sources the scenario of its role: `<role>-<n>.sh` for its n-th
// session, else `<role>.sh`. A scenario writes in the component (`$c`) and hands over with
// `passation <text>`, a comment under the session's author, as bd writes it. As claude, a session
// `--session-id <id>` keeps its transcript in `<id>.jsonl` (an id already in use fails, code 1),
// and `--resume <id>` adds to that transcript, found in the folder of its working directory, or
// fails, code 1, its scenario not played, when there is none.
const FAUX_CLAUDE = `#!/bin/bash
racine=$(cd "$(git rev-parse --path-format=absolute --git-common-dir)/.." && pwd)
prompt=$(cat)
ticket=$(printf '%s\\n' "$prompt" | sed -n 's/^TON TICKET : \\([^ ]*\\).*/\\1/p' | head -1)
role= prec= sid= reprise=
for a in "$@"; do
  [ "$prec" = --agent ] && role=$a
  [ "$prec" = --session-id ] && sid=$a
  [ "$prec" = --resume ] && reprise=$a
  prec=$a
done
e="$racine/.beads/essai/$ticket"
mkdir -p "$e"
n=$(( $(cat "$e/$role.n" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$e/$role.n"
printf '%s' "$prompt" > "$e/$role-$n.prompt"
printf '%s\\0' "$@" > "$e/$role-$n.args"
pwd > "$e/$role-$n.pwd"
printf '%s' "\${BEADS_ACTOR-}" > "$e/$role-$n.acteur"
echo "$role\${GRILLHOUSE_ENVELOPPE:+ $GRILLHOUSE_ENVELOPPE}" >> "$e/ordre"
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
c=$GRILLHOUSE_ENVELOPPE
passation() {
  node -e 'require("fs").appendFileSync(process.argv[1], JSON.stringify({ author: process.argv[3], text: process.argv[2] }) + "\\n")' "$racine/.beads/$ticket.comments.jsonl" "$1" "\${BEADS_ACTOR-}"
}
# The reviewer's verdict and the chef de chantier's decision: its final answer, on its standard
# output.
verdict() { printf '%s\n' "$1"; }
decision() { printf '%s\n' "$1"; }
s="$e/$role-$n.sh"
[ -f "$s" ] || s="$e/$role.sh"
[ -f "$s" ] && . "$s"
exit 0
`;

// The stand-in for bd, run by the circuit from the main tree: a ticket is `.beads/<id>.json`, its
// comments `.beads/<id>.comments.jsonl`, each under its author, `BEADS_ACTOR`, else git's user
// (`t`), as bd writes it; `update` (--status, --add-label, --remove-label, -d/--description,
// --notes), `close` (--reason) and `reopen` write its state, as the integration, the queue and the
// chef de chantier change it.
const FAUX_BD = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const [cmd, ...r] = process.argv.slice(2);
const b = path.join(process.cwd(), '.beads');
const commentaires = id => path.join(b, id + '.comments.jsonl');
if (cmd === 'show') {
  process.stdout.write(fs.readFileSync(path.join(b, r[0] + '.json'), 'utf8'));
} else if (cmd === 'comments' && r[0] === 'add') {
  fs.appendFileSync(commentaires(r[1]), JSON.stringify({ author: process.env.BEADS_ACTOR || 't', text: r[2] }) + '\\n');
} else if (cmd === 'comments') {
  const f = commentaires(r[0]);
  const l = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\\n').filter(Boolean) : [];
  process.stdout.write(JSON.stringify(l.map(x => JSON.parse(x))));
} else if (['update', 'close', 'reopen'].includes(cmd)) {
  const f = path.join(b, r[0] + '.json');
  const [t] = JSON.parse(fs.readFileSync(f, 'utf8'));
  const v = o => (r.includes(o) ? r[r.indexOf(o) + 1] : null);
  t.labels = t.labels ?? [];
  if (cmd === 'close') Object.assign(t, { status: 'closed', close_reason: v('--reason') });
  if (cmd === 'reopen') t.status = 'open';
  if (v('--status')) t.status = v('--status');
  if (v('--add-label')) t.labels.push(v('--add-label'));
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
// neighbour: while `packages/binder/garde-rouge.txt` exists and the code of forms does not carry
// `// accordé`, it is red and names the file of forms. While `packages/binder/ping-pong.txt`
// exists, it is always red, and names the component whose `tour` (a count each one keeps in its
// directory) is behind, forms on a tie: the two components send the red to each other.
const GARDE = `import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
const commun = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
  encoding: 'utf8',
}).trim();
const e = path.join(path.dirname(commun), '.beads', 'essai', path.basename(process.cwd()));
mkdirSync(e, { recursive: true });
appendFileSync(path.join(e, 'gardes'), (process.env.GRILLHOUSE_ENVELOPPE ?? '') + '\\n');
const accorde = readFileSync('packages/forms/src/index.mjs', 'utf8').includes('// accordé');
if (existsSync('packages/binder/garde-rouge.txt') && !accorde) {
  console.log('⛔ packages/forms/src/index.mjs:1 — la mesure ne suit pas le classeur.');
  process.exit(1);
}
const tour = d => (existsSync(d + '/tour') ? Number(readFileSync(d + '/tour', 'utf8')) : 0);
if (existsSync('packages/binder/ping-pong.txt')) {
  const qui = tour('packages/forms') <= tour('packages/binder') ? 'forms' : 'binder';
  console.log('⛔ packages/' + qui + '/src/index.mjs:1 — les deux composants se renvoient la mesure.');
  process.exit(1);
}
`;

// The test of each package that HEAD already holds, green before any ticket: the trial repository
// is green on main, as `npm run verifier` plays it (a package without a test is red).
const ANCIEN = `import { expect, it } from 'vitest';
import { mesure } from '../src/index.mjs';
it('ancien — mesure rend un nombre', () => { expect(typeof mesure(1)).toBe('number'); });
`;

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

export const lire = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
export const sortie = (r: { stdout: string; stderr: string }) => `${r.stdout}\n${r.stderr}`;

// The circuit's named values, read once; a circuit that does not load leaves them empty.
export let ARRETS: Record<string, number> = {};
export let IMMOBILE_MS = 0;
try {
  ({ ARRETS, IMMOBILE_MS } = (await import(CIRCUIT)) as {
    ARRETS: Record<string, number>;
    IMMOBILE_MS: number;
  });
} catch {
  // The tests that read them fail on their own assertion.
}

// The trial repository of one test file under <ESSAIS>, built when this machine can wrap an
// envelope, and what reads and drives it.
export function circuitEssai(ESSAIS: string) {
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
        scripts: {
          test: `node ${path.join(RACINE, 'scripts/tests.mjs')}`,
          verifier: `node ${path.join(RACINE, 'scripts/verifier.mjs')}`,
          'grillhouse:gardes': 'node -e 0',
          gardes: 'node garde.mjs',
        },
      })
    );
    ecrire(
      path.join(REPO, 'turbo.json'),
      readFileSync(path.join(RACINE, 'templates/turbo/paquets.json'), 'utf8')
    );
    for (const [dossier, nom, champs] of [
      ['forms', '000-forms', {}],
      ['binder', '030-binder', { dependencies: { '000-forms': '*' } }],
    ] as const) {
      const p = path.join(REPO, 'packages', dossier);
      ecrire(
        path.join(p, 'package.json'),
        json({ name: nom, type: 'module', scripts: { 'test:vitest': 'vitest run' }, ...champs })
      );
      ecrire(path.join(p, 'src/index.mjs'), 'export const mesure = x => x;\n');
      ecrire(
        path.join(p, 'vitest.config.mjs'),
        `import base from ${JSON.stringify(BASE)};\nexport default base;\n`
      );
    }
    for (const dossier of ['forms', 'binder']) {
      ecrire(path.join(REPO, `packages/${dossier}/test/ancien.test.mjs`), ANCIEN);
    }
    ecrire(path.join(REPO, 'garde.mjs'), GARDE);
    ecrireTurbo(REPO);
    for (const role of ['testeur', 'developpeur']) {
      ecrire(path.join(REPO, `.claude/agents/${role}.md`), `---\nname: ${role}\n---\n`);
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
  // Its reviewer accepts the lot unless the test writes it another scenario.
  function ticket(id: string, composants: string) {
    ecrire(
      path.join(BEADS, `${id}.json`),
      json([{ id, title: `${id} — La mesure — ${composants}`, description: DESCRIPTION }])
    );
    const copie = path.join(REPO, '.claude/worktrees', id);
    execFileSync('git', ['-C', REPO, 'worktree', 'add', '-q', '-b', `agent/${id}`, copie]);
    symlinkSync(path.join(RACINE, 'node_modules'), path.join(copie, 'node_modules'), 'dir');
    scenario(id, 'relecteur', "verdict 'ACCEPTÉ — le lot tient ses critères.'\n");
    return copie;
  }

  // The scenario of a role's sessions on ticket <id>: `<role>.sh` for each, `<role>-<n>.sh` for
  // the n-th.
  const scenario = (id: string, nom: string, script: string) =>
    ecrire(path.join(BEADS, 'essai', id, `${nom}.sh`), script);

  // The circuit's environment: this process's without what Vitest set for itself, the stand-ins
  // first on the PATH and for claude.
  const ENV = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST') && k !== 'NODE_OPTIONS')
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
      composant: string;
      tentative: number;
      code: number | null;
      raison: string | null;
      rapport: string | null;
      journal: string;
      finale: boolean;
      seance: number | null;
      renvois: Record<string, { etape: string }> | null;
      atteint: string | null;
      chef: { seance: string; arret: string; code: number; rapport: string | null } | null;
    } | null;
  const ordre = (id: string) => essai(id, 'ordre').trim().split('\n');
  const gitRepo = (...a: string[]) => execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' });
  // The comments at the ticket, each with its author.
  const auteurs = (id: string) =>
    lire(path.join(BEADS, `${id}.comments.jsonl`))
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l) as { author: string; text: string });
  const commentaires = (id: string) => auteurs(id).map(c => c.text);
  // The circuit's history at the ticket: [composant, étape] of each comment « Circuit · … ».
  const historique = (id: string) =>
    commentaires(id).flatMap(t => {
      const m = /^Circuit · (\S+) · (\S+) :/.exec(t);
      return m ? [[m[1], m[2]]] : [];
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
    gitRepo,
    auteurs,
    commentaires,
    historique,
  };
}
