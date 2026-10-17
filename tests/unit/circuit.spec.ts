import { execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { ecrire as ecrireTurbo } from '../../scripts/turbo-des-paquets.mjs';

// The circuit of a ticket (scripts/circuit.mjs): for each component of its title, the provider
// first, the testeur, the proof of the red, the developpeur and the checks; then the reviewer,
// and on ACCEPTÉ the integration, which puts the branch in the queue.
// Decided by the owner on 2026-10-17 (grill): the chef de chantier launches it in the background
// and wakes at its end, in place of launching and waiting for each session himself; the circuit
// launches the reviewer (Q6) and integrates the lot itself, the role of the integrateur gone (Q7);
// it ends at the entry of the lot in the queue (Q13).
//
// The trial repository holds two packages, `000-forms` (packages/forms) and `030-binder`
// (packages/binder), whose `mesure` is wrong until the developpeur writes it. Each session of the
// testeur and the developpeur is a real launch (scripts/enveloppe/lancer.sh) in a real envelope;
// the reviewer's is claude in the ticket's copy, out of the envelope; claude is a stand-in (CLAUDE_BIN)
// that plays the scenario the test wrote for its role, and bd is a stand-in on the PATH whose
// tickets and comments live in the main tree's `.beads/`, which the envelope leaves writable. The
// proof and the checks are real runs of the frame's commands (npm test, npm run verifier), and the
// integration the frame's script (scripts/integration/integrer.mjs).

const RACINE = path.resolve(__dirname, '../..');
const CIRCUIT = path.join(RACINE, 'scripts/circuit.mjs');
const ENVELOPPE = path.join(RACINE, 'scripts/enveloppe/enveloppe.mjs');
const BASE = path.join(RACINE, 'scripts/vitest-config/base.mjs');

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const REPO = path.join(ESSAIS, 'depot');
const HOME = path.join(ESSAIS, 'home');
const BIN = path.join(ESSAIS, 'bin');
const BEADS = path.join(REPO, '.beads');

const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;
const ecrire = (f: string, texte: string, mode?: number) => {
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, texte, mode === undefined ? undefined : { mode });
};

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

// The stand-in for claude, run in the envelope with the copy as working directory. It finds the
// main tree from git, reads its ticket in the prompt, records the call (prompt, arguments, working
// directory, role and component in `ordre`, the role alone out of the envelope), leaves a line of
// transcript where Claude Code keeps the copy's, then
// sources the scenario of its role: `<role>-<n>.sh` for its n-th session, else `<role>.sh`. A
// scenario writes in the component (`$c`) and hands over with `passation <text>`.
const FAUX_CLAUDE = `#!/bin/bash
racine=$(cd "$(git rev-parse --path-format=absolute --git-common-dir)/.." && pwd)
prompt=$(cat)
ticket=$(printf '%s\\n' "$prompt" | sed -n 's/^TON TICKET : \\([^ ]*\\).*/\\1/p' | head -1)
role= prec=
for a in "$@"; do [ "$prec" = --agent ] && role=$a; prec=$a; done
e="$racine/.beads/essai/$ticket"
mkdir -p "$e"
n=$(( $(cat "$e/$role.n" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$e/$role.n"
printf '%s' "$prompt" > "$e/$role-$n.prompt"
printf '%s\\0' "$@" > "$e/$role-$n.args"
pwd > "$e/$role-$n.pwd"
echo "$role\${GRILLHOUSE_ENVELOPPE:+ $GRILLHOUSE_ENVELOPPE}" >> "$e/ordre"
d="$HOME/.claude/projects/$(pwd | sed 's/[^A-Za-z0-9]/-/g')"
mkdir -p "$d"
echo '{"type":"user"}' >> "$d/$role-$n.jsonl"
c=$GRILLHOUSE_ENVELOPPE
passation() {
  node -e 'require("fs").appendFileSync(process.argv[1], JSON.stringify({ author: process.argv[3], text: process.argv[2] }) + "\\n")' "$racine/.beads/$ticket.comments.jsonl" "$1" "$role"
}
s="$e/$role-$n.sh"
[ -f "$s" ] || s="$e/$role.sh"
[ -f "$s" ] && . "$s"
exit 0
`;

// The stand-in for bd, run by the circuit from the main tree: a ticket is `.beads/<id>.json`, its
// comments `.beads/<id>.comments.jsonl`.
const FAUX_BD = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const [cmd, ...r] = process.argv.slice(2);
const b = path.join(process.cwd(), '.beads');
const commentaires = id => path.join(b, id + '.comments.jsonl');
if (cmd === 'show') {
  process.stdout.write(fs.readFileSync(path.join(b, r[0] + '.json'), 'utf8'));
} else if (cmd === 'comments' && r[0] === 'add') {
  fs.appendFileSync(commentaires(r[1]), JSON.stringify({ author: 'circuit', text: r[2] }) + '\\n');
} else if (cmd === 'comments') {
  const f = commentaires(r[0]);
  const l = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\\n').filter(Boolean) : [];
  process.stdout.write(JSON.stringify(l.map(x => JSON.parse(x))));
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

const DESCRIPTION = [
  '## Architecture',
  '',
  'La mesure vit dans chaque composant.',
  '',
  "## Critères d'acceptation",
  '',
  '1. `mesure` rend le double de sa valeur.',
].join('\n');

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
  scenario(id, 'relecteur', "passation 'ACCEPTÉ — le lot tient ses critères.'\n");
  return copie;
}

// The scenario of a role's sessions on ticket <id>: `<role>.sh` for each, `<role>-<n>.sh` for
// the n-th.
const scenario = (id: string, nom: string, script: string) =>
  ecrire(path.join(BEADS, 'essai', id, `${nom}.sh`), script);

// What a scenario writes. A test the code of today fails, one it passes already, one whose file
// does not load.
const ECRIT_ROUGE = `mkdir -p $c/test
cat > $c/test/mesure.test.mjs <<'EOF'
import { expect, it } from 'vitest';
import { mesure } from '../src/index.mjs';
it('critère 1 — mesure rend le double', () => { expect(mesure(2)).toBe(4); });
EOF
`;
const ECRIT_VERT = `cat > $c/test/forme.test.mjs <<'EOF'
import { expect, it } from 'vitest';
import { mesure } from '../src/index.mjs';
it('critère 1 — mesure rend un nombre', () => { expect(typeof mesure(1)).toBe('number'); });
EOF
`;
const ECRIT_CASSE = `cat > $c/test/casse.test.mjs <<'EOF'
import { expect, it } from 'vitest';
import { absent } from '../src/absent.mjs';
it('critère 1 — absent rend 1', () => { expect(absent()).toBe(1); });
EOF
`;
const CODE_JUSTE = `printf 'export const mesure = x => 2 * x;\\n' > $c/src/index.mjs\n`;

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

const lire = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
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
  } | null;
const ordre = (id: string) => essai(id, 'ordre').trim().split('\n');
// The entries of the integration's queue: the branches in their order of arrival.
const enFile = () => {
  const d = path.join(REPO, '.git/file-integration');
  return existsSync(d)
    ? readdirSync(d)
        .sort()
        .map(
          f => (JSON.parse(readFileSync(path.join(d, f), 'utf8')) as { branche: string }).branche
        )
    : [];
};
const gitRepo = (...a: string[]) => execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' });
const commentaires = (id: string) =>
  lire(path.join(BEADS, `${id}.comments.jsonl`))
    .split('\n')
    .filter(Boolean)
    .map(l => (JSON.parse(l) as { text: string }).text);
// The circuit's history at the ticket: [composant, étape] of each comment « Circuit · … ».
const historique = (id: string) =>
  commentaires(id).flatMap(t => {
    const m = /^Circuit · (\S+) · (\S+) :/.exec(t);
    return m ? [[m[1], m[2]]] : [];
  });
const sortie = (r: { stdout: string; stderr: string }) => `${r.stdout}\n${r.stderr}`;

// The circuit's named values, read once; a circuit that does not load leaves them empty.
let ARRETS: Record<string, number> = {};
let IMMOBILE_MS = 0;
beforeAll(async () => {
  try {
    ({ ARRETS, IMMOBILE_MS } = (await import(CIRCUIT)) as {
      ARRETS: Record<string, number>;
      IMMOBILE_MS: number;
    });
  } catch {
    // The tests that read them fail on their own assertion.
  }
});

describe('the stops of the circuit and their codes', () => {
  it('names a distinct code, not 0 nor 2, for each stop', () => {
    const noms = [
      'lancement',
      'bloqué',
      'sans-passation',
      'preuve',
      'controles',
      'sans-livraison',
      'relecture-arret',
      'integration',
      'a-repasser',
    ];
    expect(Object.keys(ARRETS).sort()).toEqual([...noms].sort());
    const codes = Object.values(ARRETS);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).not.toContain(0);
    expect(codes).not.toContain(2);
    expect(ARRETS['a-repasser']).toBe(75);
    expect(ARRETS['relecture-arret']).toBe(16);
  });
  it('waits 20 minutes of a motionless transcript before it stops a session', () => {
    expect(IMMOBILE_MS).toBe(20 * 60 * 1000);
  });
  it('names its stops and their codes in its header', () => {
    const entete = readFileSync(CIRCUIT, 'utf8').split('\nimport ')[0];
    for (const [nom, code] of Object.entries(ARRETS)) {
      expect(entete).toContain(nom);
      expect(entete).toContain(String(code));
    }
  });
});

describe.runIf(canWrap)('the circuit of a ticket', { timeout: 300_000 }, () => {
  it('passes each component of the title, provider first: testeur, proof, developpeur, checks', () => {
    const id = 'demo-ordre';
    ticket(id, '000-forms, 030-binder');
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id)).toEqual([
      'testeur packages/forms',
      'developpeur packages/forms',
      'testeur packages/binder',
      'developpeur packages/binder',
      'relecteur',
    ]);
    const etapes = ['testeur', 'preuve', 'developpeur', 'controles'];
    expect(historique(id)).toEqual([
      ...etapes.map(e => ['packages/forms', e]),
      ...etapes.map(e => ['packages/binder', e]),
      ['packages/binder', 'relecture'],
      ['packages/binder', 'integration'],
    ]);
    // The proof is written at the ticket: the red tests.
    const preuve = commentaires(id).find(t => t.startsWith('Circuit · packages/forms · preuve'));
    expect(preuve).toContain('critère 1 — mesure rend le double');
    // The state: relecture, every field written.
    const e = etat(id);
    expect(Object.keys(e ?? {}).sort()).toEqual(
      [
        'code',
        'composant',
        'dernier',
        'etape',
        'finale',
        'journal',
        'raison',
        'rapport',
        'renvois',
        'seance',
        'tentative',
      ].sort()
    );
    expect(e?.etape).toBe('en-file');
    expect(e?.code).toBe(0);
    expect(e?.journal).toBe(path.join(REPO, '.claude/worktrees', `${id}.log`));
    // The instruction the circuit writes: its ticket, its component, the criteria, the proof of
    // the step before and the last handover.
    const consigne = essai(id, 'developpeur-1.prompt');
    expect(consigne).toContain(`TON TICKET : ${id}`);
    expect(consigne).toContain('TON COMPOSANT : packages/forms');
    expect(consigne).toContain('1. `mesure` rend le double de sa valeur.');
    expect(consigne).toContain('critère 1 — mesure rend le double');
    expect(consigne).toContain('Tests écrits, rouges.');
    expect(essai(id, 'testeur-1.prompt')).toContain('TON COMPOSANT : packages/forms');
    expect(essai(id, 'testeur-2.prompt')).toContain('TON COMPOSANT : packages/binder');
  });

  it('sends a green test without its line « vert attendu » back to the testeur', () => {
    const id = 'demo-vert';
    ticket(id, '000-forms');
    scenario(id, 'testeur-1', `${ECRIT_ROUGE}${ECRIT_VERT}passation 'Tests écrits.'\n`);
    scenario(
      id,
      'testeur-2',
      "passation 'vert attendu : critère 1 — mesure rend un nombre — la forme est déjà juste'\n"
    );
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, 'testeur')).toBe(2);
    const relance = essai(id, 'testeur-2.prompt');
    expect(relance).toContain('critère 1 — mesure rend un nombre');
    expect(relance).toContain('vert attendu');
    // The proof at the ticket holds the justified green and its reason.
    const preuves = commentaires(id).filter(t => t.startsWith('Circuit · packages/forms · preuve'));
    expect(preuves.at(-1)).toContain('la forme est déjà juste');
  });

  it('relaunches the testeur twice at most, then stops at « preuve »', () => {
    const id = 'demo-preuve';
    ticket(id, '000-forms');
    scenario(id, 'testeur', `${ECRIT_ROUGE}${ECRIT_VERT}passation 'Tests écrits.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS.preuve);
    expect(sessions(id, 'testeur')).toBe(3);
    expect(sessions(id, 'developpeur')).toBe(0);
    expect(etat(id)).toMatchObject({
      etape: 'preuve',
      composant: 'packages/forms',
      raison: 'preuve',
    });
    expect(historique(id).at(-1)).toEqual(['packages/forms', 'preuve']);
  });

  it('takes a test file that does not load for no proof', () => {
    const id = 'demo-casse';
    ticket(id, '000-forms');
    scenario(id, 'testeur-1', `${ECRIT_ROUGE}${ECRIT_CASSE}passation 'Tests écrits.'\n`);
    scenario(id, 'testeur-2', `rm $c/test/casse.test.mjs\npassation 'Fichier cassé retiré.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, 'testeur')).toBe(2);
    const relance = essai(id, 'testeur-2.prompt');
    expect(relance).toContain('packages/forms/test/casse.test.mjs');
    expect(relance).toContain('ne se charge pas');
  });

  describe('a red check, then a resumption', () => {
    const id = 'demo-controles';
    it('relaunches the developpeur, the third time on the strong model, then stops at « controles »', () => {
      ticket(id, '000-forms');
      scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits.'\n`);
      // Each session changes a file of forms, never the code that the test waits for.
      scenario(
        id,
        'developpeur',
        `echo $(( $(cat $c/tour 2>/dev/null || echo 0) + 1 )) > $c/tour\npassation 'Un essai.'\n`
      );
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(ARRETS.controles);
      expect(sessions(id, 'developpeur')).toBe(3);
      for (const n of [1, 2]) {
        expect(args(id, 'developpeur', n)).not.toContain('--model');
      }
      const fort = args(id, 'developpeur', 3);
      expect(fort[fort.indexOf('--model') + 1]).toBe('opus');
      expect(fort[fort.indexOf('--effort') + 1]).toBe('high');
      // The relaunched developpeur receives the output of the red check.
      expect(essai(id, 'developpeur-2.prompt')).toContain('critère 1 — mesure rend le double');
      expect(etat(id)).toMatchObject({
        etape: 'controles',
        composant: 'packages/forms',
        raison: 'controles',
        code: ARRETS.controles,
      });
      expect(historique(id).at(-1)).toEqual(['packages/forms', 'controles']);
    });
    it("--reprendre starts again at the step and component of the state, with the chef's context", () => {
      scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
      const r = circuit([id, '--reprendre', '--contexte', 'Le chef a tranché : le double.']);
      expect(r.status, sortie(r)).toBe(0);
      expect(sessions(id, 'testeur')).toBe(1);
      expect(sessions(id, 'developpeur')).toBe(4);
      expect(essai(id, 'developpeur-4.prompt')).toContain(
        'CONTEXTE : Le chef a tranché : le double.'
      );
      expect(args(id, 'developpeur', 4)).not.toContain('--model');
      expect(etat(id)?.etape).toBe('en-file');
    });
  });

  it('stops at « sans-livraison » after a developpeur session that changes no file of its component', () => {
    const id = 'demo-sans-livraison';
    ticket(id, '000-forms, 030-binder');
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    // Its handover says it delivered; only the files of the component count.
    scenario(id, 'developpeur', "passation 'Code écrit.'\n");
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS['sans-livraison']);
    expect(sessions(id, 'developpeur')).toBe(1);
    expect(sessions(id, 'testeur')).toBe(1);
    const e = etat(id);
    expect(e).toMatchObject({
      etape: 'developpeur',
      composant: 'packages/forms',
      raison: 'sans-livraison',
      code: ARRETS['sans-livraison'],
    });
    expect(e?.rapport).toContain('packages/forms');
    expect(e?.rapport).toContain('passation');
    expect(historique(id).at(-1)).toEqual(['packages/forms', 'developpeur']);
    expect(commentaires(id).at(-1)).toContain('sans-livraison');
    expect(commentaires(id).at(-1)).toContain('packages/forms');
  });

  it('relaunches a session without handover once, then stops at « sans-passation »', () => {
    const id = 'demo-passation';
    ticket(id, '000-forms');
    scenario(id, 'testeur', ECRIT_ROUGE);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS['sans-passation']);
    expect(sessions(id, 'testeur')).toBe(2);
    expect(etat(id)).toMatchObject({ etape: 'testeur', raison: 'sans-passation' });
  });

  it('stops a session whose transcript stands still past the delay, at « bloqué »', () => {
    const id = 'demo-bloque';
    ticket(id, '000-forms');
    scenario(id, 'testeur', `${ECRIT_ROUGE}echo 'le testeur réfléchit'\nsleep 301\n`);
    const debut = Date.now();
    const r = circuit([id], { GRILLHOUSE_CIRCUIT_IMMOBILE_MS: '3000' });
    expect(r.status, sortie(r)).toBe(ARRETS['bloqué']);
    expect(Date.now() - debut).toBeLessThan(120_000);
    const e = etat(id);
    expect(e).toMatchObject({ etape: 'testeur', raison: 'bloqué', code: ARRETS['bloqué'] });
    // The last lines of the log come with the stop.
    expect(e?.rapport).toContain('le testeur réfléchit');
    expect(historique(id).at(-1)).toEqual(['packages/forms', 'testeur']);
    expect(commentaires(id).at(-1)).toContain(e?.journal);
    // The session is gone with its launcher's group.
    const lignes = readdirSync('/proc')
      .filter(p => /^\d+$/.test(p))
      .map(p => {
        try {
          return readFileSync(`/proc/${p}/cmdline`, 'utf8').split('\0').join(' ');
        } catch {
          return '';
        }
      });
    expect(lignes.filter(l => l.startsWith('sleep 301'))).toEqual([]);
  });

  it('judges after a developpeur only the components done: a later red waits for its own', () => {
    const id = 'demo-partiel';
    const copie = ticket(id, '000-forms, 030-binder');
    // The lot of binder is already in the copy, red until its developpeur writes the code.
    ecrire(
      path.join(copie, 'packages/binder/test/mesure.test.mjs'),
      `import { expect, it } from 'vitest';
import { mesure } from '../src/index.mjs';
it('critère 1 — mesure rend le double', () => { expect(mesure(2)).toBe(4); });
`
    );
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id)).toEqual([
      'testeur packages/forms',
      'developpeur packages/forms',
      'testeur packages/binder',
      'developpeur packages/binder',
      'relecteur',
    ]);
    // The checks of forms play its tests of the lot, not those of binder.
    const forms = commentaires(id).find(t => t.startsWith('Circuit · packages/forms · controles'));
    expect(forms).toContain('packages/forms/test/mesure.test.mjs');
    expect(forms).not.toContain('packages/binder/test/mesure.test.mjs');
    // The guards of forms play in its envelope; the final pass, on the whole repository (when
    // Turborepo plays it rather than replay a run of the same tree from its cache).
    const gardes = essai(id, 'gardes').split('\n').slice(0, -1);
    expect(gardes[0]).toBe('packages/forms');
    expect(gardes.slice(1).every(g => g === '')).toBe(true);
    expect(forms).toContain('GRILLHOUSE_ENVELOPPE=packages/forms npm run gardes');
    const finale = commentaires(id).find(t =>
      t.startsWith('Circuit · packages/binder · controles')
    );
    expect(finale).toContain('controles : verts : npm run verifier.');
  });

  it('sends a red of the final pass to the developpeur of the component that owns its file', () => {
    const id = 'demo-finale';
    ticket(id, '000-forms, 030-binder');
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur-1', `${CODE_JUSTE}passation 'Code de forms écrit.'\n`);
    scenario(
      id,
      'developpeur-2',
      `${CODE_JUSTE}echo rouge > $c/garde-rouge.txt\npassation 'Code de binder écrit.'\n`
    );
    scenario(
      id,
      'developpeur-3',
      `printf '// accordé\\n' >> $c/src/index.mjs\npassation 'Forms accordé.'\n`
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id)).toEqual([
      'testeur packages/forms',
      'developpeur packages/forms',
      'testeur packages/binder',
      'developpeur packages/binder',
      'developpeur packages/forms',
      'relecteur',
    ]);
    expect(historique(id).slice(-5)).toEqual([
      ['packages/binder', 'controles'],
      ['packages/forms', 'developpeur'],
      ['packages/forms', 'controles'],
      ['packages/forms', 'relecture'],
      ['packages/forms', 'integration'],
    ]);
    // The developpeur of forms receives the red guard, which names its file.
    const consigne = essai(id, 'developpeur-3.prompt');
    expect(consigne).toContain('TON COMPOSANT : packages/forms');
    expect(consigne).toContain('packages/forms/src/index.mjs:1');
    expect(etat(id)).toMatchObject({ etape: 'en-file', code: 0, finale: true });
  });

  it('counts the developpeur sessions of the final pass together: three, then « controles »', () => {
    const id = 'demo-ping-pong';
    ticket(id, '000-forms, 030-binder');
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur-1', `${CODE_JUSTE}passation 'Code de forms écrit.'\n`);
    scenario(
      id,
      'developpeur-2',
      `${CODE_JUSTE}touch $c/ping-pong.txt\npassation 'Code de binder écrit.'\n`
    );
    scenario(
      id,
      'developpeur',
      `echo $(( $(cat $c/tour 2>/dev/null || echo 0) + 1 )) > $c/tour\npassation 'Un tour.'\n`
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS.controles);
    // The final pass: binder's first session, forms', then binder's on the strong model.
    expect(ordre(id)).toEqual([
      'testeur packages/forms',
      'developpeur packages/forms',
      'testeur packages/binder',
      'developpeur packages/binder',
      'developpeur packages/forms',
      'developpeur packages/binder',
    ]);
    const fort = args(id, 'developpeur', 4);
    expect(fort[fort.indexOf('--model') + 1]).toBe('opus');
    expect(args(id, 'developpeur', 3)).not.toContain('--model');
    const e = etat(id);
    expect(e).toMatchObject({ etape: 'controles', raison: 'controles', finale: true });
    expect(e?.rapport).toContain('les deux composants se renvoient la mesure');
  });

  // A package whose build fails while its file `casse` exists, as tsc fails on a reader whose
  // provider's type gained a field.
  const casserLaConstruction = (copie: string, dossier: string) => {
    const p = path.join(copie, 'packages', dossier);
    const pkg = JSON.parse(readFileSync(path.join(p, 'package.json'), 'utf8'));
    ecrire(
      path.join(p, 'package.json'),
      json({ ...pkg, scripts: { ...pkg.scripts, build: 'node build.mjs' } })
    );
    ecrire(
      path.join(p, 'build.mjs'),
      `import { existsSync } from 'node:fs';
if (existsSync('casse')) {
  console.log("src/x.ts(1,1): error TS2741: Property 'champ' is missing in type 'Forme'.");
  process.exit(1);
}
`
    );
    ecrire(path.join(p, 'casse'), '');
  };

  it('takes the failed build of a package of the component for its red, its tests for the checks', () => {
    const id = 'demo-construction';
    const copie = ticket(id, '000-forms, 030-binder');
    casserLaConstruction(copie, 'binder');
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur-1', `${CODE_JUSTE}passation 'Code de forms écrit.'\n`);
    scenario(id, 'developpeur-2', `${CODE_JUSTE}rm $c/casse\npassation 'Binder construit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id)).toEqual([
      'testeur packages/forms',
      'developpeur packages/forms',
      'testeur packages/binder',
      'developpeur packages/binder',
      'relecteur',
    ]);
    const preuve = commentaires(id).find(t => t.startsWith('Circuit · packages/binder · preuve'));
    expect(preuve).toContain('1 rouge(s)');
    expect(preuve).toContain('0 fichier(s) qui ne se charge(nt) pas');
    expect(preuve).toContain(
      "construction de 030-binder — src/x.ts(1,1): error TS2741: Property 'champ' is missing"
    );
    expect(preuve).toContain(
      'Les tests de 030-binder se jouent aux contrôles, après le développeur.'
    );
  });

  // Witness: BPScript (bp-mono-vbwf.320.2.2.1.5). 030-binder and 040-checker each hold the other
  // in their devDependencies for their tests; the lot of 000-forms breaks both builds. The proof
  // of 030-binder saw only the failed build of 040-checker, Turborepo having stopped at it, and
  // counted 0 red and its files « ne se charge pas ».
  it('counts the failed build of each of two components that test each other at its own proof', () => {
    const id = 'demo-construction-croisee';
    const copie = ticket(id, '000-forms, 030-binder, 040-checker');
    const checker = path.join(copie, 'packages/checker');
    ecrire(
      path.join(checker, 'package.json'),
      json({
        name: '040-checker',
        type: 'module',
        scripts: { 'test:vitest': 'vitest run' },
        dependencies: { '000-forms': '*' },
        devDependencies: { '030-binder': '*' },
      })
    );
    ecrire(path.join(checker, 'src/index.mjs'), 'export const mesure = x => x;\n');
    ecrire(
      path.join(checker, 'vitest.config.mjs'),
      `import base from ${JSON.stringify(BASE)};\nexport default base;\n`
    );
    const binder = path.join(copie, 'packages/binder/package.json');
    ecrire(
      binder,
      json({
        ...JSON.parse(readFileSync(binder, 'utf8')),
        devDependencies: { '040-checker': '*' },
      })
    );
    casserLaConstruction(copie, 'binder');
    casserLaConstruction(copie, 'checker');
    // The build of binder fails after checker's, as in BPScript: a run that stops at the first
    // failure cancels it unreported.
    const construction = path.join(copie, 'packages/binder/build.mjs');
    ecrire(
      construction,
      `await new Promise(r => setTimeout(r, 2000));\n${readFileSync(construction, 'utf8')}`
    );
    ecrireTurbo(copie);
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}rm -f $c/casse\npassation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id)).toEqual([
      'testeur packages/forms',
      'developpeur packages/forms',
      'testeur packages/binder',
      'developpeur packages/binder',
      'testeur packages/checker',
      'developpeur packages/checker',
      'relecteur',
    ]);
    const etape = (composant: string, nom: string) =>
      commentaires(id).find(t => t.startsWith(`Circuit · packages/${composant} · ${nom}`));
    for (const [composant, nom] of [
      ['binder', '030-binder'],
      ['checker', '040-checker'],
    ]) {
      const preuve = etape(composant, 'preuve');
      expect(preuve).toContain('1 rouge(s)');
      expect(preuve).toContain('0 fichier(s) qui ne se charge(nt) pas');
      expect(preuve).toContain(`construction de ${nom} — src/x.ts(1,1): error TS2741`);
    }
    expect(etape('binder', 'preuve')).not.toContain('construction de 040-checker');
    // Binder built, its tests wait for the build of checker: a red of the component after.
    const controles = etape('binder', 'controles');
    expect(controles).toContain("laissés à la passe finale, rouges dans un composant d'après");
    expect(etape('checker', 'controles')).toContain('controles : verts : npm run verifier.');
    expect(etat(id)).toMatchObject({ etape: 'en-file', code: 0 });
  });

  it('leaves the files of a component broken when the build that fails lies out of it', () => {
    const id = 'demo-construction-ailleurs';
    const copie = ticket(id, '030-binder');
    casserLaConstruction(copie, 'forms');
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS.preuve);
    expect(sessions(id, 'testeur')).toBe(3);
    expect(sessions(id, 'developpeur')).toBe(0);
    const relance = essai(id, 'testeur-3.prompt');
    expect(relance).toContain('packages/binder/test/mesure.test.mjs — ne se charge pas');
    expect(relance).not.toContain('construction de 000-forms');
    expect(relance).not.toContain('Rouges (');
    const arret = commentaires(id).at(-1);
    expect(arret).toContain('1 fichier(s) qui ne se charge(nt) pas');
  });

  // A reader of forms that HEAD already holds, green there: `lit` of binder renders the value
  // `mesure` of forms gives, and its test expects the value itself. The double of the forms lot
  // turns it red; LECTEUR_JUSTE is binder's repair. The reader is committed on the trial's main,
  // where the integration applies the lot, for the time of <essai> alone: the tests after it start
  // from the main without it.
  const avecLecteur = (essai: () => void) => {
    const avant = gitRepo('rev-parse', 'HEAD').trim();
    ecrire(
      path.join(REPO, 'packages/binder/src/lecteur.mjs'),
      "import { mesure } from '../../forms/src/index.mjs';\nexport const lit = x => mesure(x);\n"
    );
    ecrire(
      path.join(REPO, 'packages/binder/test/lecteur.test.mjs'),
      `import { expect, it } from 'vitest';
import { lit } from '../src/lecteur.mjs';
it('lecteur — lit rend sa valeur', () => { expect(lit(2)).toBe(2); });
`
    );
    const git = (...a: string[]) =>
      execFileSync('git', ['-C', REPO, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
    git('add', 'packages/binder/src/lecteur.mjs', 'packages/binder/test/lecteur.test.mjs');
    git('commit', '-qm', 'lecteur');
    try {
      essai();
    } finally {
      git('reset', '-q', '--hard', avant);
    }
  };
  const LECTEUR_JUSTE = `printf "import { mesure } from '../../forms/src/index.mjs';\\nexport const lit = x => mesure(x) / 2;\\n" > $c/src/lecteur.mjs\n`;

  // Witness: BPScript (bp-mono-vbwf.320.2.2.1.5). The provider changes a type; tests the readers
  // already held, green at HEAD, turn red, and their testeur has no new test to write. The proof
  // saw no file of the lot and skipped their developpeur.
  it('takes a test HEAD holds that the lot turns red for the proof of its component', () =>
    avecLecteur(() => {
      const id = 'demo-rouge-existant';
      ticket(id, '000-forms, 030-binder');
      scenario(id, 'testeur-1', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(
        id,
        'testeur-2',
        "passation 'Aucun test neuf à écrire : les rouges existants du lecteur suffisent.'\n"
      );
      scenario(id, 'developpeur-1', `${CODE_JUSTE}passation 'Code de forms écrit.'\n`);
      scenario(id, 'developpeur-2', `${LECTEUR_JUSTE}passation 'Lecteur réparé.'\n`);
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(0);
      expect(ordre(id)).toEqual([
        'testeur packages/forms',
        'developpeur packages/forms',
        'testeur packages/binder',
        'developpeur packages/binder',
        'relecteur',
      ]);
      const preuve = commentaires(id).find(t => t.startsWith('Circuit · packages/binder · preuve'));
      expect(preuve).toContain('1 rouge(s)');
      expect(preuve).toContain('au développeur');
      expect(preuve).toContain(
        'rouge existant : packages/binder/test/lecteur.test.mjs › lecteur — lit rend sa valeur —'
      );
      expect(preuve).not.toContain('Aucun fichier de test du lot');
      expect(essai(id, 'developpeur-2.prompt')).toContain('rouge existant');
      expect(etat(id)).toMatchObject({ etape: 'en-file', code: 0 });
    }));

  it('plays at the final pass each package of the title, and sends its red to its developpeur', () =>
    avecLecteur(() => {
      const id = 'demo-finale-intouche';
      const copie = ticket(id, '000-forms, 030-binder');
      // The lot of forms is in the copy; binder, untouched, holds only what HEAD holds.
      ecrire(
        path.join(copie, 'packages/forms/test/mesure.test.mjs'),
        `import { expect, it } from 'vitest';
import { mesure } from '../src/index.mjs';
it('critère 1 — mesure rend le double', () => { expect(mesure(2)).toBe(4); });
`
      );
      scenario(id, 'developpeur-1', `${CODE_JUSTE}passation 'Code de forms écrit.'\n`);
      scenario(id, 'developpeur-2', `${LECTEUR_JUSTE}passation 'Lecteur réparé.'\n`);
      const r = circuit([
        id,
        '--depuis',
        'developpeur',
        '000-forms',
        '--contexte',
        'RENDU : le double.',
      ]);
      expect(r.status, sortie(r)).toBe(0);
      expect(ordre(id)).toEqual([
        'developpeur packages/forms',
        'developpeur packages/binder',
        'relecteur',
      ]);
      const consigne = essai(id, 'developpeur-2.prompt');
      expect(consigne).toContain('TON COMPOSANT : packages/binder');
      expect(consigne).toContain('$ npm run verifier\n');
      expect(consigne).toContain('lit rend sa valeur');
      expect(etat(id)).toMatchObject({ etape: 'en-file', code: 0, finale: true });
    }));

  // Witness: BPScript (bp-mono-vbwf.320.2.2.1.5). The lot adds a file to a directory of the root
  // that a reader out of the title reads (`grillhouse.lit`); its test turned red only at the
  // integration's `npm run verifier`, the final pass playing the packages of the title alone.
  it('plays npm run verifier at the final pass, and stops at « controles » on a red of a package out of the title', () => {
    const id = 'demo-finale-hors-titre';
    const copie = ticket(id, '000-forms');
    // 020-loader reads `libraries/` at the root, whose files are all `.bp`; HEAD holds it green.
    const loader = path.join(copie, 'packages/loader');
    ecrire(
      path.join(loader, 'package.json'),
      json({
        name: '020-loader',
        type: 'module',
        scripts: { 'test:vitest': 'vitest run' },
        grillhouse: { lit: ['libraries'] },
      })
    );
    ecrire(
      path.join(loader, 'vitest.config.mjs'),
      `import base from ${JSON.stringify(BASE)};\nexport default base;\n`
    );
    ecrire(
      path.join(loader, 'test/bibliotheques.test.mjs'),
      `import { readdirSync } from 'node:fs';
import { expect, it } from 'vitest';
it('bibliothèques — chaque fichier est une bibliothèque .bp', () => {
  const noms = readdirSync(new URL('../../../libraries', import.meta.url));
  expect(noms.filter(n => !n.endsWith('.bp'))).toEqual([]);
});
`
    );
    ecrire(path.join(copie, 'libraries/base.bp'), 'base\n');
    ecrireTurbo(copie);
    const git = (...a: string[]) =>
      execFileSync('git', ['-C', copie, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
    git('add', '-A');
    git('commit', '-qm', 'loader');
    // The lot: forms's test, and a file the loader refuses in `libraries/`.
    ecrire(
      path.join(copie, 'packages/forms/test/mesure.test.mjs'),
      `import { expect, it } from 'vitest';
import { mesure } from '../src/index.mjs';
it('critère 1 — mesure rend le double', () => { expect(mesure(2)).toBe(4); });
`
    );
    ecrire(path.join(copie, 'libraries/notes.txt'), 'notes\n');
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code de forms écrit.'\n`);
    const r = circuit([
      id,
      '--depuis',
      'developpeur',
      '000-forms',
      '--contexte',
      'RENDU : le double.',
    ]);
    expect(r.status, sortie(r)).toBe(ARRETS.controles);
    expect(sessions(id, 'developpeur')).toBe(1);
    const e = etat(id);
    expect(e).toMatchObject({
      etape: 'controles',
      composant: 'packages/forms',
      raison: 'controles',
      code: ARRETS.controles,
    });
    expect(e?.rapport).toContain('$ npm run verifier\n');
    expect(e?.rapport).toContain('020-loader');
    expect(e?.rapport).toContain('chaque fichier est une bibliothèque .bp');
    expect(e?.rapport).toContain('hors des composants du ticket (packages/forms)');
    expect(e?.rapport).toContain('La décision revient au chef de chantier');
    // Stopped before the review, the package named in the comment of the stop.
    expect(historique(id).map(([, etape]) => etape)).not.toContain('relecture');
    const arret = commentaires(id).at(-1);
    expect(arret).toContain('arrêt controles');
    expect(arret).toContain('020-loader');
  });

  it('fails the proof without a file of the lot nor a red, the greens HEAD holds not counted', () => {
    const id = 'demo-rien';
    ticket(id, '000-forms');
    scenario(id, 'testeur', "passation 'Rien écrit.'\n");
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS.preuve);
    expect(sessions(id, 'testeur')).toBe(3);
    expect(sessions(id, 'developpeur')).toBe(0);
    const relance = essai(id, 'testeur-2.prompt');
    expect(relance).toContain('Aucun fichier de test du lot dans packages/forms');
    expect(relance).toContain('0 rouge(s)');
    expect(relance).not.toContain('ancien — mesure rend un nombre');
  });

  it('proves only the tests the lot adds or changes, not those HEAD already holds', () => {
    const id = 'demo-anciens';
    const copie = ticket(id, '000-forms');
    scenario(
      id,
      'testeur',
      `cat >> $c/test/ancien.test.mjs <<'EOF'
it('critère 1 — mesure rend le double', () => { expect(mesure(2)).toBe(4); });
EOF
passation 'Test ajouté, rouge.'
`
    );
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, 'testeur')).toBe(1);
    const preuve = commentaires(id).find(t => t.startsWith('Circuit · packages/forms · preuve'));
    expect(preuve).toContain('1 rouge(s)');
    expect(preuve).toContain('0 vert(s) sans « vert attendu »');
    expect(preuve).not.toContain('› ancien — mesure rend un nombre');
    // The version of HEAD it played leaves nothing in the lot: the commit holds the two files.
    expect(existsSync(copie)).toBe(false);
    const commit = gitRepo('show', '--name-status', '--format=', `agent/${id}`);
    expect(commit.split('\n').filter(Boolean).sort()).toEqual(
      ['M\tpackages/forms/src/index.mjs', 'M\tpackages/forms/test/ancien.test.mjs'].sort()
    );
  });

  it('resumes after the death of its caller, once the session it left has ended', async () => {
    const id = 'demo-mort';
    ticket(id, '000-forms');
    scenario(
      id,
      'testeur-1',
      `${ECRIT_ROUGE}sleep 8\npassation 'Tests écrits.'\ndate +%s%N > "$e/testeur-1.fin"\n`
    );
    scenario(id, 'testeur-2', `date +%s%N > "$e/testeur-2.debut"\npassation 'Reprise.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    // The caller and the circuit share a group, which the caller's death takes down at once.
    const appelant = spawn('node', [CIRCUIT, id], {
      cwd: REPO,
      env: ENV,
      detached: true,
      stdio: 'ignore',
    });
    const attendre = (ms: number) => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 600 && sessions(id, 'testeur') < 1; i++) {
      await attendre(100);
    }
    await attendre(1_000);
    process.kill(-(appelant.pid as number), 'SIGKILL');
    const laisse = etat(id);
    expect(laisse).toMatchObject({ etape: 'testeur', composant: 'packages/forms', code: null });
    expect(typeof laisse?.seance).toBe('number');
    const r = circuit([id, '--reprendre']);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, 'testeur')).toBe(2);
    expect(BigInt(essai(id, 'testeur-2.debut').trim())).toBeGreaterThan(
      BigInt(essai(id, 'testeur-1.fin').trim())
    );
    expect(etat(id)).toMatchObject({ etape: 'en-file', code: 0, seance: null });
  });
});

// After the final pass, the circuit launches the reviewer, out of the envelope, from the second
// template (Q6). ACCEPTÉ: the circuit builds the lot from the copy and integrates it, which puts
// the branch in the queue (Q7, Q13). RENDU: each finding names « Agent : <rôle> <composant> »; the
// circuit relaunches those agents from the first component named, the components after it pass
// again, then the final pass and the reviewer; a finding without a valid recipient stops at
// « relecture-arret », and so does the third RENDU.
describe.runIf(canWrap)('the review and the integration', { timeout: 300_000 }, () => {
  // A verdict RENDU whose one finding goes to <agent>.
  const rendu = (agent: string, constat = 'mesure de 0 doit rendre 0.') =>
    `passation 'RENDU

### Constat 1 — packages/forms/src/index.mjs
Agent : ${agent}
${constat}
Règle : critère 1.'
`;

  it('ACCEPTÉ leads to the integration: one commit on agent/<ticket>, the branch in the queue', () => {
    const id = 'demo-accepte';
    const copie = ticket(id, '000-forms');
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id)).toEqual([
      'testeur packages/forms',
      'developpeur packages/forms',
      'relecteur',
    ]);
    // The reviewer's session: claude in the ticket's copy, out of the envelope, on its role.
    expect(essai(id, 'relecteur-1.pwd').trim()).toBe(copie);
    const a = args(id, 'relecteur', 1);
    expect(a[a.indexOf('--agent') + 1]).toBe('relecteur');
    expect(a[a.indexOf('--model') + 1]).toBe('opus');
    // Its instruction: the second template, the criteria, the lot and the circuit's reports.
    const consigne = essai(id, 'relecteur-1.prompt');
    expect(consigne).toContain(`Tu es le relecteur du dépôt ${REPO}.`);
    expect(consigne).toContain(`TON TICKET : ${id} — La mesure`);
    expect(consigne).toContain('1. `mesure` rend le double de sa valeur.');
    expect(consigne).toContain('le lot de tests : packages/forms/test/mesure.test.mjs');
    expect(consigne).toContain('le lot de code : packages/forms/src/index.mjs');
    expect(consigne).toContain('Circuit · packages/forms · preuve');
    expect(consigne).toContain('controles : verts : npm run verifier.');
    expect(consigne).not.toContain('{{');
    // The integration: the commit holds the testeur's lot and the developpeur's, under the
    // message the circuit writes; the copy is gone; the branch waits in the queue.
    const commit = gitRepo('show', '--name-only', '--format=%s', `agent/${id}`);
    expect(commit.split('\n').filter(Boolean)).toEqual([
      `feat(000-forms): La mesure (${id})`,
      'packages/forms/src/index.mjs',
      'packages/forms/test/mesure.test.mjs',
    ]);
    expect(gitRepo('log', '-1', '--format=%B', `agent/${id}`)).toContain('Co-Authored-By: Claude');
    expect(existsSync(copie)).toBe(false);
    expect(enFile()).toContain(`agent/${id}`);
    expect(gitRepo('rev-parse', 'main')).not.toBe(gitRepo('rev-parse', `agent/${id}`));
    expect(historique(id).slice(-2)).toEqual([
      ['packages/forms', 'relecture'],
      ['packages/forms', 'integration'],
    ]);
    expect(commentaires(id).at(-1)).toContain('en file');
    expect(etat(id)).toMatchObject({ etape: 'en-file', code: 0 });
  });

  it('RENDU « Agent : developpeur <composant> » relaunches that developpeur, then the rest, to the queue', () => {
    const id = 'demo-rendu-dev';
    ticket(id, '000-forms, 030-binder');
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    scenario(
      id,
      'developpeur-3',
      `printf '// rendu\\n' >> $c/src/index.mjs\npassation 'Rendu traité.'\n`
    );
    scenario(id, 'relecteur-1', rendu('developpeur 000-forms'));
    scenario(id, 'relecteur-2', "passation 'ACCEPTÉ — le rendu est traité.'\n");
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    // Forms' developpeur again; binder, which no finding names, passes its checks again.
    expect(ordre(id)).toEqual([
      'testeur packages/forms',
      'developpeur packages/forms',
      'testeur packages/binder',
      'developpeur packages/binder',
      'relecteur',
      'developpeur packages/forms',
      'relecteur',
    ]);
    const consigne = essai(id, 'developpeur-3.prompt');
    expect(consigne).toContain('TON COMPOSANT : packages/forms');
    expect(consigne).toMatch(/LE RAPPORT DE L'ÉTAPE D'AVANT[^\n]*\n\n### Constat 1/);
    expect(consigne).toContain('mesure de 0 doit rendre 0.');
    expect(consigne).toContain('REPRISE : oui');
    expect(essai(id, 'relecteur-2.prompt')).toContain('REPRISE : oui');
    const rendus = historique(id).findIndex(([, e]) => e === 'relecture');
    expect(historique(id).slice(rendus)).toEqual([
      ['packages/binder', 'relecture'],
      ['packages/forms', 'developpeur'],
      ['packages/forms', 'controles'],
      ['packages/binder', 'controles'],
      ['packages/binder', 'relecture'],
      ['packages/binder', 'integration'],
    ]);
    expect(gitRepo('show', `agent/${id}:packages/forms/src/index.mjs`)).toContain('// rendu');
    expect(enFile()).toContain(`agent/${id}`);
    expect(etat(id)).toMatchObject({ etape: 'en-file', code: 0 });
  });

  it('RENDU « Agent : testeur <composant> » relaunches the testeur, the proof, the developpeur, the checks', () => {
    const id = 'demo-rendu-testeur';
    ticket(id, '000-forms');
    scenario(id, 'testeur-1', `${ECRIT_ROUGE}passation 'Tests écrits.'\n`);
    scenario(id, 'developpeur-1', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    // The testeur adds the case the reviewer found; the test already green is justified.
    scenario(
      id,
      'testeur-2',
      `cat > $c/test/echelle.test.mjs <<'EOF'
import { expect, it } from 'vitest';
import * as m from '../src/index.mjs';
it('critère 2 — echelle rend le triple', () => { expect(m.echelle?.(2)).toBe(6); });
EOF
passation 'vert attendu : critère 1 — mesure rend le double — livré avant le rendu'
`
    );
    scenario(
      id,
      'developpeur-2',
      `printf 'export const echelle = x => 3 * x;\\n' >> $c/src/index.mjs\npassation 'Echelle écrite.'\n`
    );
    scenario(id, 'relecteur-1', rendu('testeur packages/forms', 'echelle manque.'));
    scenario(id, 'relecteur-2', "passation 'ACCEPTÉ'\n");
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, 'testeur')).toBe(2);
    expect(sessions(id, 'developpeur')).toBe(2);
    expect(essai(id, 'testeur-2.prompt')).toContain('echelle manque.');
    expect(historique(id).slice(-7)).toEqual([
      ['packages/forms', 'relecture'],
      ['packages/forms', 'testeur'],
      ['packages/forms', 'preuve'],
      ['packages/forms', 'developpeur'],
      ['packages/forms', 'controles'],
      ['packages/forms', 'relecture'],
      ['packages/forms', 'integration'],
    ]);
    const preuve = commentaires(id).filter(t => t.startsWith('Circuit · packages/forms · preuve'));
    expect(preuve.at(-1)).toContain('critère 2 — echelle rend le triple');
  });

  it('stops at « relecture-arret » (16) on a finding without a valid recipient, or on a criterion', () => {
    const id = 'demo-rendu-sans-destinataire';
    ticket(id, '000-forms');
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    scenario(id, 'relecteur-1', rendu('chef packages/forms'));
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(16);
    expect(ARRETS['relecture-arret']).toBe(16);
    expect(sessions(id, 'developpeur')).toBe(1);
    const e = etat(id);
    expect(e).toMatchObject({ etape: 'relecture', raison: 'relecture-arret', code: 16 });
    expect(e?.rapport).toContain("n'a pas de destinataire valide");
    expect(e?.rapport).toContain('La décision revient au chef de chantier');
    expect(enFile()).not.toContain(`agent/${id}`);
    // Resumed, the reviewer puts a criterion itself in question: a stop again.
    scenario(
      id,
      'relecteur-2',
      rendu('developpeur packages/forms', 'Critère en cause : 1, le double contredit la spec.')
    );
    const r2 = circuit([id, '--reprendre']);
    expect(r2.status, sortie(r2)).toBe(16);
    expect(sessions(id, 'developpeur')).toBe(1);
    expect(etat(id)?.rapport).toContain('met en cause un critère');
  });

  it('stops at « relecture-arret » at the third RENDU', () => {
    const id = 'demo-trois-rendus';
    ticket(id, '000-forms');
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits.'\n`);
    scenario(id, 'developpeur-1', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    scenario(
      id,
      'developpeur',
      `echo $(( $(cat $c/tour 2>/dev/null || echo 0) + 1 )) > $c/tour\npassation 'Un tour.'\n`
    );
    scenario(id, 'relecteur', rendu('developpeur 000-forms'));
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(16);
    expect(sessions(id, 'relecteur')).toBe(3);
    expect(sessions(id, 'developpeur')).toBe(3);
    // Each round is a first developpeur session: none on the strong model.
    for (const n of [2, 3]) {
      expect(args(id, 'developpeur', n)).not.toContain('--model');
    }
    const e = etat(id);
    expect(e).toMatchObject({ etape: 'relecture', raison: 'relecture-arret', code: 16 });
    expect(e?.rapport).toContain('3 relectures ont rendu le lot');
    expect(enFile()).not.toContain(`agent/${id}`);
  });
});

describe.runIf(canWrap)('the circuit refuses a malformed --depuis', () => {
  const id = 'demo-depuis-refus';
  beforeAll(() => {
    ticket(id, '000-forms');
  });
  for (const [cas, args] of [
    ['a step other than testeur or developpeur', ['--depuis', 'preuve', 'packages/forms']],
    ['a component the title does not name', ['--depuis', 'testeur', 'packages/binder']],
    ['a component missing', ['--depuis', 'testeur']],
    ['--depuis with --reprendre', ['--depuis', 'testeur', 'packages/forms', '--reprendre']],
  ] as const) {
    it(`${cas}, exit 2, nothing launched`, () => {
      const r = circuit([id, ...args]);
      expect(r.status, sortie(r)).toBe(2);
      expect(sessions(id, 'testeur')).toBe(0);
    });
  }
});

describe.runIf(canWrap)('the circuit refuses a malformed call', () => {
  it('without a ticket, exit 2', () => {
    expect(circuit([]).status).toBe(2);
  });
  it('--reprendre without a state, exit 2', () => {
    const id = 'demo-sans-etat';
    ticket(id, '000-forms');
    const r = circuit([id, '--reprendre']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(`${id}.circuit.json`);
  });
  it('a component of the title that names no package nor path, exit 2, named', () => {
    const id = 'demo-inconnu';
    ticket(id, '000-forms, 999-absent');
    const r = circuit([id]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('999-absent');
    expect(sessions(id, 'testeur')).toBe(0);
  });
});
