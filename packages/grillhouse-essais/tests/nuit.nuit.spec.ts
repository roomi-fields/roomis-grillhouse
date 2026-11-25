import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CADRE, RACINE } from './cadre.js';

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'nuit-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const NUIT = path.join(CADRE, 'scripts/nuit.sh');
// The header of nuit.sh: its comment lines after the shebang, up to the first line that is not one.
const enteteDeNuit = () => {
  const lignes = readFileSync(NUIT, 'utf8').split('\n').slice(1);
  const fin = lignes.findIndex(l => !l.startsWith('#'));
  return lignes.slice(0, fin < 0 ? lignes.length : fin).join('\n');
};

// A repository whose tests (`npm test`, and the full pass the night plays, `npm run verifier -- --force`)
// fail while ROUGE is committed, with a fake Beads that records its calls,
// answers `list` with the open tickets written in OUVERTS, `create` with the ticket <prefixe>-<numero>
// (the project's prefix is the key of its `.beads/config.yaml`).
function monde({ prefixe = 'demo', numero = '12' } = {}) {
  const repo = mkdtempSync(path.join(ESSAIS, 'nuit-'));
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
  const appels = path.join(bin, 'appels');
  // The temporary directory of the night of trial, its own, under its trial directory, as Bazel
  // gives each test its TEST_TMPDIR: the night reads the tickets' directories there
  // (scripts/copies-finies.mjs), never those the neighbour files of the pass make meanwhile.
  const tmp = mkdtempSync(path.join(ESSAIS, 'tmp-'));
  writeFileSync(
    path.join(bin, 'bd'),
    `#!/bin/sh\necho "$@" >> ${appels}\ncase "$1" in list) cat ${bin}/OUVERTS 2>/dev/null || echo '[]';; create) echo ${prefixe}-${numero};; esac\n`,
    { mode: 0o755 }
  );
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
      encoding: 'utf8',
    });
  // The night runs from the repository's own scripts, the copy's preparation with them.
  cpSync(path.dirname(NUIT), path.join(repo, 'scripts'), { recursive: true });
  writeFileSync(
    path.join(repo, 'package.json'),
    JSON.stringify({ scripts: { test: 'node t.mjs', verifier: 'node t.mjs' } })
  );
  writeFileSync(
    path.join(repo, 't.mjs'),
    "import fs from 'node:fs';\nif (fs.existsSync('ROUGE')) { console.log('✗ un test rouge'); process.exit(1); }\nconsole.log('tout vert');\n"
  );
  writeFileSync(path.join(repo, '.gitignore'), '.claude/worktrees/\n');
  mkdirSync(path.join(repo, '.beads'));
  writeFileSync(path.join(repo, '.beads/config.yaml'), `issue-prefix: "${prefixe}"\n`);
  git('init', '-q', '-b', 'main');
  git('add', '.');
  git('commit', '-qm', 'base');
  const nuit = (...args: string[]) =>
    spawnSync('bash', [path.join(repo, 'scripts/nuit.sh'), ...args], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: tmp },
    });
  const commun = path.join(repo, '.git', 'nuit');
  const lire = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
  return { repo, bin, git, nuit, commun, appels: () => lire(appels), lire };
}

// grillhouse-w47.1 critère 3: on BPScript (2026-10-27), `grillhouse nuit --help` launched the
// night; as a GNU command, it answers --help by its usage and refuses an unknown argument (2).
describe('w47.1 critère 3 — the entry of the night reads its arguments', () => {
  const rienDeLance = (m: ReturnType<typeof monde>) => {
    expect(existsSync(m.commun)).toBe(false);
    expect(existsSync(path.join(m.repo, '.claude/worktrees/nuit'))).toBe(false);
    expect(m.appels()).toBe('');
  };
  it('--help and -h print the usage on the output, exit 0, and launch no night', () => {
    for (const option of ['--help', '-h']) {
      const m = monde();
      const r = m.nuit(option);
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toMatch(/^Usage : grillhouse nuit$/m);
      expect(r.stdout).toContain('--help');
      rienDeLance(m);
    }
  });
  it('an unknown argument is refused, exit 2, naming it, and launches no night', () => {
    for (const args of [['--tout'], ['demain'], ['--help', 'demain']]) {
      const m = monde();
      const r = m.nuit(...args);
      expect(r.status).toBe(2);
      expect(r.stderr).toContain(`argument inconnu : ${args.at(-1)}`);
      expect(r.stderr).toMatch(/^Usage : grillhouse nuit$/m);
      rienDeLance(m);
    }
  });
});

// The creation of a red night's ticket, named by its red task (grillhouse-w47.2).
const CREE_ROUGE =
  /^create La nuit est rouge sur « [^»\n]+ » depuis la nuit du \d{4}-\d{2}-\d{2} /m;
// An open night ticket whose title names the cause « <cause> », for OUVERTS.
const ouvert = (id: string, cause: string) => ({
  id,
  title: `${id.split('-').pop()} — La nuit est rouge sur « ${cause} » depuis la nuit du 2026-10-20 — parent`,
});

describe('the night', () => {
  it('marks a green HEAD as the last green, and opens nothing', () => {
    const m = monde();
    expect(m.nuit().status).toBe(0);
    expect(m.lire(path.join(m.commun, 'dernier-vert')).trim()).toBe(
      m.git('rev-parse', 'HEAD').trim()
    );
    expect(m.appels()).toBe('');
  });
  // The full pass of the night is `npm run verifier -- --force`: Turborepo's guards and tests,
  // each task played for real.
  it('plays npm run verifier with --force, its full pass played for real', () => {
    const m = monde();
    const recu = path.join(m.bin, 'args');
    writeFileSync(
      path.join(m.repo, 'args.mjs'),
      `import fs from 'node:fs';\nfs.writeFileSync(${JSON.stringify(recu)}, process.argv.slice(2).join(' '));\n`
    );
    writeFileSync(
      path.join(m.repo, 'package.json'),
      JSON.stringify({ scripts: { test: 'node t.mjs', verifier: 'node args.mjs' } })
    );
    m.git('add', '.');
    m.git('commit', '-qm', 'verifier');
    expect(m.nuit().status).toBe(0);
    expect(m.lire(recu)).toBe('--force');
  });
  // « À repasser » (75, scripts/attente-de-la-machine.mjs): the wait for the part of the machine, or for
  // room in the temporary directory, reached its bound. Neither green nor red: the
  // last green stays, no ticket opens, nothing is pushed, and the next night plays again.
  it('a npm run verifier à repasser (75): exit 75, no last green, no ticket, the log says so', () => {
    const m = monde();
    writeFileSync(path.join(m.repo, 't.mjs'), 'process.exit(75);\n');
    m.git('add', 't.mjs');
    m.git('commit', '-qm', 'repasser');
    expect(m.nuit().status).toBe(75);
    expect(m.lire(path.join(m.commun, 'dernier-vert'))).toBe('');
    expect(m.appels()).toBe('');
    const journal = readdirSync(m.commun)
      .filter(f => f.endsWith('.log'))
      .map(f => m.lire(path.join(m.commun, f)))
      .join('\n');
    expect(journal).toMatch(/à repasser/);
  });
  it('opens a ticket on red, with the commits since the last green', () => {
    const m = monde();
    m.nuit();
    const vert = m.git('rev-parse', '--short=7', 'HEAD').trim();
    writeFileSync(path.join(m.repo, 'ROUGE'), '');
    m.git('add', 'ROUGE');
    m.git('commit', '-qm', 'casse');
    const rouge = m.git('rev-parse', '--short=7', 'HEAD').trim();
    expect(m.nuit().status).toBe(1);
    const appels = m.appels();
    expect(appels).toMatch(CREE_ROUGE);
    expect(appels).toMatch(/-l nuit/);
    expect(appels).toMatch(
      /^update demo-12 --title 12 — La nuit est rouge sur « npm run verifier -- --force » depuis la nuit du \d{4}-\d{2}-\d{2} — parent$/m
    );
    expect(appels).toContain(`${vert}..${rouge}`);
    expect(appels).toMatch(/un test rouge/);
  });
  // grillhouse-3uv.56 critère 22: the night writes its ticket's title by the recipe of criterion 8
  // (docs/agents/issue-tracker.md), the whole prefix of the project stripped.
  it('3uv.56 critère 22: the night ticket of a project whose prefix holds a dash (bp-mono) is titled by its number alone', () => {
    const m = monde({ prefixe: 'bp-mono', numero: 'vbwf.12' });
    writeFileSync(path.join(m.repo, 'ROUGE'), '');
    m.git('add', 'ROUGE');
    m.git('commit', '-qm', 'casse');
    expect(m.nuit().status).toBe(1);
    expect(m.appels()).toMatch(
      /^update bp-mono-vbwf\.12 --title vbwf\.12 — La nuit est rouge sur « npm run verifier -- --force » depuis la nuit du \d{4}-\d{2}-\d{2} — parent$/m
    );
  });
  it('comments the open night ticket that names its red task instead of opening another', () => {
    const m = monde();
    writeFileSync(path.join(m.repo, 'ROUGE'), '');
    m.git('add', 'ROUGE');
    m.git('commit', '-qm', 'casse');
    writeFileSync(
      path.join(m.bin, 'OUVERTS'),
      JSON.stringify([ouvert('demo-9', 'npm run verifier -- --force')])
    );
    expect(m.nuit().status).toBe(1);
    expect(m.appels()).toMatch(/^comments add demo-9 La nuit du/m);
    expect(m.appels()).not.toMatch(/^create/m);
  });
  it('plays the commit, not the local files of the main tree', () => {
    const m = monde();
    writeFileSync(path.join(m.repo, 'ROUGE'), '');
    expect(m.nuit().status).toBe(0);
  });
  // grillhouse-3uv.63 critère 10: the night takes no lock of the integration or the queue; an
  // integration and the queue run during the night.
  it('3uv.63 critère 10: the night runs while an integration holds the old lock', () => {
    const m = monde();
    writeFileSync(path.join(m.repo, '.git', 'integration.lock'), String(process.pid));
    expect(m.nuit().status).toBe(0);
    expect(m.lire(path.join(m.commun, 'dernier-vert')).trim()).toBe(
      m.git('rev-parse', 'HEAD').trim()
    );
  });
  it('3uv.63 critère 10: during the night no integration lock is held', () => {
    const m = monde();
    const trace = path.join(m.bin, 'pendant');
    // The night's tests look at the lock.
    writeFileSync(
      path.join(m.repo, 't.mjs'),
      `import fs from 'node:fs';\nimport { spawnSync } from 'node:child_process';\n` +
        `const verrou = fs.existsSync(${JSON.stringify(path.join(m.repo, '.git', 'integration.lock'))});\n` +
        `fs.writeFileSync(${JSON.stringify(trace)}, JSON.stringify({ verrou }));\n`
    );
    m.git('add', 't.mjs');
    m.git('commit', '-qm', 'pendant');
    expect(m.nuit().status).toBe(0);
    const p = JSON.parse(m.lire(trace)) as { verrou: boolean };
    expect(p.verrou).toBe(false);
  });
});

// grillhouse-3uv.56.2: the red night's ticket gives, for each red task of the full pass, the
// command that looks for the culprit commit over the interval, `git bisect run` with that task
// alone. The fake `npm run verifier` writes the red tasks committed in ROUGE (one Turborepo task id
// per line, then a tab and the command that replays it alone, grillhouse-pkl.5) to the file
// GRILLHOUSE_ROUGES names, as scripts/langages/typescript/verifier.mjs does, and fails.
const ligneRouge = (t: string) => {
  const i = t.indexOf('#');
  return `${t}\tnpx turbo run ${t.slice(i + 1)} --filter=${t.slice(0, i)}\n`;
};
describe('the bisect commands of the red night (grillhouse-3uv.56.2)', () => {
  function rougeSur(taches: string[]) {
    const m = monde();
    writeFileSync(
      path.join(m.repo, 't.mjs'),
      "import fs from 'node:fs';\nif (fs.existsSync('ROUGE')) {\n" +
        "  if (process.env.GRILLHOUSE_ROUGES) fs.copyFileSync('ROUGE', process.env.GRILLHOUSE_ROUGES);\n" +
        "  console.log('✗ un test rouge'); process.exit(1);\n}\n"
    );
    m.git('add', 't.mjs');
    m.git('commit', '-qm', 'verifier');
    expect(m.nuit().status).toBe(0);
    const vert = m.git('rev-parse', '--short=7', 'HEAD').trim();
    writeFileSync(path.join(m.repo, 'ROUGE'), taches.map(ligneRouge).join(''));
    m.git('add', 'ROUGE');
    m.git('commit', '-qm', 'casse');
    const rouge = m.git('rev-parse', '--short=7', 'HEAD').trim();
    expect(m.nuit().status).toBe(1);
    const bisect = (tache: string, paquet: string) =>
      `git bisect start ${rouge} ${vert} && git bisect run npx turbo run ${tache} --filter=${paquet}`;
    return { appels: m.appels(), vert, rouge, bisect };
  }

  it('1 — a red task of a package: the ticket gives the interval and its bisect command', () => {
    const r = rougeSur(['a#test:unit']);
    expect(r.appels).toContain(`${r.vert}..${r.rouge}`);
    expect(r.appels).toContain(`a#test:unit : ${r.bisect('test:unit', 'a')}`);
  });
  it('2 — two red tasks: two commands, one per task, the root filtered by //', () => {
    const r = rougeSur(['@x/b#test:unit', '//#gardes']);
    expect(r.appels).toContain(`@x/b#test:unit : ${r.bisect('test:unit', '@x/b')}`);
    expect(r.appels).toContain(`//#gardes : ${r.bisect('gardes', '//')}`);
    // One ticket per red task (grillhouse-w47.2), each text giving both commands.
    const textes = textesDe(r.appels);
    expect(textes).toHaveLength(2);
    for (const t of textes) {
      expect(t.match(/git bisect run/g)).toHaveLength(2);
    }
  });
  it('3 — a red with no red task named (à repasser beside, or another step): no command', () => {
    const r = rougeSur([]);
    expect(r.appels).toContain(`${r.vert}..${r.rouge}`);
    expect(r.appels).not.toContain('git bisect run');
  });
});

// The text of each ticket call (a creation, or a comment), from its line to the next call.
const textesDe = (appels: string) =>
  appels
    .split(/^(?=create |comments add |update |list |config )/m)
    .filter(t => /^(create|comments add) /.test(t));

// grillhouse-w47.2: the night plays each step, its ticket names each red step and each red task,
// with or without a last green, and each red task reports on the open night ticket that names it,
// else on its own. The fake `npm run verifier` writes the tasks committed in ROUGE to the file
// GRILLHOUSE_ROUGES names and fails; `grillhouse.nuit`, when given, names a project script.
describe('grillhouse-w47.2 — the night plays each step and names each red task', () => {
  function nuitRouge(
    taches: string[],
    o: { vertAvant?: boolean; script?: 'vert' | 'rouge'; ouverts?: object[] } = {}
  ) {
    const m = monde();
    const trace = path.join(m.bin, 'trace');
    writeFileSync(
      path.join(m.repo, 't.mjs'),
      "import fs from 'node:fs';\nif (fs.existsSync('ROUGE')) {\n" +
        "  if (process.env.GRILLHOUSE_ROUGES) fs.copyFileSync('ROUGE', process.env.GRILLHOUSE_ROUGES);\n" +
        "  console.log('✗ un test rouge'); process.exit(1);\n}\n"
    );
    const scripts: Record<string, string> = { test: 'node t.mjs', verifier: 'node t.mjs' };
    const pkg: Record<string, unknown> = { scripts };
    if (o.script) {
      scripts['nuit-projet'] =
        `node -e "require('fs').appendFileSync('${trace}', 'nuit-projet\\n'); process.exit(require('fs').existsSync('ROUGE') && ${o.script === 'rouge'} ? 1 : 0)"`;
      pkg.grillhouse = { nuit: 'nuit-projet' };
    }
    writeFileSync(path.join(m.repo, 'package.json'), JSON.stringify(pkg));
    m.git('add', '.');
    m.git('commit', '-qm', 'verifier');
    if (o.vertAvant) {
      expect(m.nuit().status).toBe(0);
    }
    writeFileSync(path.join(m.repo, 'ROUGE'), taches.map(ligneRouge).join(''));
    m.git('add', 'ROUGE');
    m.git('commit', '-qm', 'casse');
    if (o.ouverts) {
      writeFileSync(path.join(m.bin, 'OUVERTS'), JSON.stringify(o.ouverts));
    }
    const r = m.nuit();
    const appels = m.appels();
    return {
      ...m,
      status: r.status,
      appels,
      textes: textesDe(appels),
      creations: appels.split('\n').filter(l => l.startsWith('create ')),
      commentaires: appels.split('\n').filter(l => l.startsWith('comments add ')),
      joues: m.lire(trace).split('\n').filter(Boolean),
    };
  }

  it('critère 1: a red full pass still plays the project script; a red script after it, both red', () => {
    const r = nuitRouge(['a#test:unit'], { script: 'rouge' });
    expect(r.status).toBe(1);
    expect(r.joues).toEqual(['nuit-projet']);
    expect(r.creations).toHaveLength(2);
  });
  it('critère 1: a red full pass and a green project script: the script played, the night red', () => {
    const r = nuitRouge(['a#test:unit'], { script: 'vert' });
    expect(r.status).toBe(1);
    expect(r.joues).toEqual(['nuit-projet']);
    expect(r.creations).toHaveLength(1);
  });
  it('critère 2: without a last green, the text names each red step and each red task, no bisect command', () => {
    const r = nuitRouge(['a#test:unit', '//#gardes'], { script: 'rouge' });
    expect(r.status).toBe(1);
    expect(r.lire(path.join(r.commun, 'dernier-vert'))).toBe('');
    expect(r.textes.length).toBeGreaterThan(0);
    for (const t of r.textes) {
      expect(t).toMatch(/^- la passe complète \(npm run verifier -- --force\)$/m);
      expect(t).toMatch(
        /^- le script de nuit du projet \(npm run nuit-projet, grillhouse\.nuit\)$/m
      );
      expect(t).toMatch(/^- a#test:unit$/m);
      expect(t).toMatch(/^- \/\/#gardes$/m);
      expect(t).toMatch(/^- npm run nuit-projet$/m);
      expect(t).not.toContain('git bisect run');
    }
  });
  it('critère 2: with a last green, each red task of the full pass gets its bisect command, the script none', () => {
    const r = nuitRouge(['a#test:unit'], { script: 'rouge', vertAvant: true });
    expect(r.status).toBe(1);
    for (const t of r.textes) {
      expect(t).toMatch(
        /^- a#test:unit : git bisect start \w{7} \w{7} && git bisect run npx turbo run test:unit --filter=a$/m
      );
      expect(t).toMatch(/^- npm run nuit-projet$/m);
      expect(t.match(/git bisect run/g)).toHaveLength(1);
    }
  });
  it('critère 2: a full pass red without a red task named names the step and its command', () => {
    const r = nuitRouge([]);
    expect(r.status).toBe(1);
    expect(r.textes).toHaveLength(1);
    expect(r.textes[0]).toMatch(/^- la passe complète \(npm run verifier -- --force\)$/m);
    expect(r.textes[0]).toMatch(/^- npm run verifier -- --force$/m);
  });
  it('critère 3: two red tasks, no open night ticket: a ticket of its own for each, its title naming it', () => {
    const r = nuitRouge(['a#test:unit', 'b#test:unit']);
    expect(r.commentaires).toEqual([]);
    expect(r.creations).toHaveLength(2);
    expect(r.creations[0]).toMatch(
      /^create La nuit est rouge sur « a#test:unit » depuis la nuit du /
    );
    expect(r.creations[1]).toMatch(
      /^create La nuit est rouge sur « b#test:unit » depuis la nuit du /
    );
    expect(r.appels).toMatch(
      /^update demo-12 --title 12 — La nuit est rouge sur « a#test:unit » depuis la nuit du \d{4}-\d{2}-\d{2} — parent$/m
    );
  });
  it('critère 3: a task the open night ticket names comments it; a task it does not name opens its own', () => {
    const r = nuitRouge(['a#test:unit', 'b#test:unit'], {
      ouverts: [ouvert('demo-9', 'a#test:unit')],
    });
    expect(r.commentaires).toHaveLength(1);
    expect(r.commentaires[0]).toMatch(/^comments add demo-9 La nuit du/);
    expect(r.creations).toHaveLength(1);
    expect(r.creations[0]).toMatch(/^create La nuit est rouge sur « b#test:unit » /);
  });
  it('critère 3: an open night ticket that names no red task gets no comment, each task opens its own', () => {
    const r = nuitRouge(['a#test:unit'], {
      ouverts: [
        { id: 'demo-9', title: '9 — La nuit est rouge depuis la nuit du 2026-10-17 — parent' },
        ouvert('demo-8', 'a#test:unit:lent'),
      ],
    });
    expect(r.commentaires).toEqual([]);
    expect(r.creations).toHaveLength(1);
    expect(r.creations[0]).toMatch(/^create La nuit est rouge sur « a#test:unit » /);
  });
  it('critère 3: each open night ticket gets the comment of the tasks it names, once', () => {
    const r = nuitRouge(['a#test:unit', 'b#test:unit'], {
      script: 'rouge',
      ouverts: [
        { id: 'demo-9', title: '9 — « a#test:unit » et « b#test:unit » — parent' },
        ouvert('demo-7', 'npm run nuit-projet'),
      ],
    });
    expect(r.creations).toEqual([]);
    expect(r.commentaires).toHaveLength(2);
    expect(r.commentaires.filter(l => l.startsWith('comments add demo-9 '))).toHaveLength(1);
    expect(r.commentaires.filter(l => l.startsWith('comments add demo-7 '))).toHaveLength(1);
  });
});

// The project's night script (grillhouse-3uv.30): `grillhouse.nuit` in the section `grillhouse` of
// the project's package.json names an npm script; the night plays it in its copy, after a green
// full pass (`npm run verifier -- --force`). `npm test` notes itself as `npm-test`, which the night never
// plays. Each script below appends its name and working directory to a trace outside the
// repository, so the order and the place of each run can be read.
describe('the night plays the project night script (grillhouse.nuit)', () => {
  function projet(cle: unknown, scripts: Record<string, string> = {}, testRouge = false) {
    const m = monde();
    const trace = path.join(m.bin, 'trace');
    // The final `--` ends node's options: the `--force` the night passes to `verifier` is an
    // argument of the script, not an option node refuses.
    const noter = (nom: string, code = 0) =>
      `node -e "require('fs').appendFileSync('${trace}', '${nom} ' + process.cwd() + '\\n'); process.exit(${code})" --`;
    const pkg: Record<string, unknown> = {
      scripts: {
        test: noter('npm-test'),
        verifier: testRouge ? noter('verifier', 1) : `${noter('verifier')} && node t.mjs`,
        ...Object.fromEntries(
          Object.entries(scripts).map(([nom, code]) => [
            nom,
            code === 'rouge' ? noter(nom, 1) : code === 'vert' ? noter(nom) : code,
          ])
        ),
      },
    };
    if (cle !== undefined) {
      pkg.grillhouse = cle;
    }
    writeFileSync(path.join(m.repo, 'package.json'), JSON.stringify(pkg, null, 2));
    m.git('add', 'package.json');
    m.git('commit', '-qm', 'projet');
    const copie = path.join(m.repo, '.claude/worktrees/nuit');
    const lignes = () =>
      m
        .lire(trace)
        .split('\n')
        .filter(Boolean)
        .map(l => {
          const [nom, ...dir] = l.split(' ');
          return { nom, dir: dir.join(' ') };
        });
    const journal = () => {
      const f = execFileSync('ls', [m.commun], { encoding: 'utf8' })
        .split('\n')
        .find(x => x.endsWith('.log'));
      return f ? m.lire(path.join(m.commun, f)) : '';
    };
    return { ...m, copie, lignes, journal };
  }

  it('1 — plays npm run <script> in its copy after a green npm run verifier -- --force', () => {
    const p = projet({ nuit: 'nuit-projet' }, { 'nuit-projet': 'vert' });
    const r = p.nuit();
    expect(r.status, p.journal()).toBe(0);
    expect(p.lignes().map(l => l.nom)).toEqual(['verifier', 'nuit-projet']);
    expect(p.lignes()[1]?.dir).toBe(p.copie);
    expect(p.lire(path.join(p.commun, 'dernier-vert')).trim()).toBe(
      p.git('rev-parse', 'HEAD').trim()
    );
    expect(p.appels()).toBe('');
  });
  it('1 — plays another script name, one with a colon, among other keys of the section', () => {
    const p = projet(
      { integration: 'impactes', nuit: 'nuit:corpus' },
      { 'nuit:corpus': 'vert', autre: 'vert' }
    );
    expect(p.nuit().status, p.journal()).toBe(0);
    expect(p.lignes().map(l => l.nom)).toEqual(['verifier', 'nuit:corpus']);
  });
  it('w47.2 critère 1 — a red npm run verifier -- --force turns the night red, the project script still played', () => {
    const p = projet({ nuit: 'nuit-projet' }, { 'nuit-projet': 'vert' }, true);
    expect(p.nuit().status).toBe(1);
    expect(p.lignes().map(l => l.nom)).toEqual(['verifier', 'nuit-projet']);
    expect(p.lire(path.join(p.commun, 'dernier-vert'))).toBe('');
    expect(p.appels()).toMatch(CREE_ROUGE);
  });
  it('w47.2 critère 1 — a red npm run verifier and a red project script: both played, red, each named', () => {
    const p = projet({ nuit: 'nuit-projet' }, { 'nuit-projet': 'rouge' }, true);
    expect(p.nuit().status).toBe(1);
    expect(p.lignes().map(l => l.nom)).toEqual(['verifier', 'nuit-projet']);
    const appels = p.appels();
    expect(appels).toMatch(/^create La nuit est rouge sur « npm run verifier -- --force » /m);
    expect(appels).toMatch(/^create La nuit est rouge sur « npm run nuit-projet » /m);
  });
  it('w47.2 critère 1 — a npm run verifier à repasser keeps its rule: 75, the project script not played, no ticket', () => {
    const p = projet({ nuit: 'nuit-projet' }, { 'nuit-projet': 'rouge' });
    writeFileSync(path.join(p.repo, 't.mjs'), 'process.exit(75);\n');
    p.git('add', 't.mjs');
    p.git('commit', '-qm', 'repasser');
    expect(p.nuit().status, p.journal()).toBe(75);
    expect(p.lignes().map(l => l.nom)).toEqual(['verifier']);
    expect(p.lire(path.join(p.commun, 'dernier-vert'))).toBe('');
    expect(p.appels()).toBe('');
  });
  it('3 — a red project script turns the night red, on the night ticket, and the log names it', () => {
    const p = projet({ nuit: 'nuit-projet' }, { 'nuit-projet': 'rouge' });
    expect(p.nuit().status).toBe(1);
    expect(p.lignes().map(l => l.nom)).toEqual(['verifier', 'nuit-projet']);
    expect(p.lire(path.join(p.commun, 'dernier-vert'))).toBe('');
    const journal = p.journal();
    expect(journal).toMatch(/✗ rouge : ticket/);
    expect(
      journal.split('\n').some(l => l.includes('grillhouse.nuit') && l.includes('nuit-projet'))
    ).toBe(true);
    const appels = p.appels();
    expect(appels).toMatch(CREE_ROUGE);
    expect(appels).toMatch(/-l nuit/);
    expect(appels).toMatch(/grillhouse\.nuit[^\n]*nuit-projet|nuit-projet[^\n]*grillhouse\.nuit/);
  });
  it('3 — a red project script comments the open night ticket that names it instead of opening another', () => {
    const p = projet({ nuit: 'nuit:corpus' }, { 'nuit:corpus': 'rouge' });
    writeFileSync(
      path.join(p.bin, 'OUVERTS'),
      JSON.stringify([ouvert('demo-9', 'npm run nuit:corpus')])
    );
    expect(p.nuit().status).toBe(1);
    expect(p.appels()).toMatch(/^comments add demo-9 La nuit du/m);
    expect(p.appels()).not.toMatch(/^create/m);
    expect(p.appels()).toMatch(/nuit:corpus/);
  });
  it('4 — without the key, the night plays npm run verifier alone', () => {
    const p = projet(undefined, { 'nuit-projet': 'vert' });
    expect(p.nuit().status, p.journal()).toBe(0);
    expect(p.lignes().map(l => l.nom)).toEqual(['verifier']);
    expect(p.journal()).not.toMatch(/grillhouse\.nuit/);
  });
  it('4 — a section without the key leaves the night unchanged', () => {
    const p = projet({ integration: 'impactes', roles: {} }, { nuit: 'vert' });
    expect(p.nuit().status, p.journal()).toBe(0);
    expect(p.lignes().map(l => l.nom)).toEqual(['verifier']);
    expect(p.appels()).toBe('');
  });
  it('5 — a key naming a script absent from package.json turns the night red, naming it', () => {
    const p = projet({ nuit: 'nuit-absente' }, { 'nuit-projet': 'vert' });
    expect(p.nuit().status).toBe(1);
    expect(p.lire(path.join(p.commun, 'dernier-vert'))).toBe('');
    expect(
      p
        .journal()
        .split('\n')
        .some(l => l.includes('grillhouse.nuit') && l.includes('nuit-absente'))
    ).toBe(true);
    expect(p.appels()).toMatch(CREE_ROUGE);
    expect(p.appels()).toMatch(/nuit-absente/);
  });
  it('7 — a null key is an absent key: the night plays npm run verifier alone', () => {
    const p = projet({ nuit: null }, { 'nuit-projet': 'vert', null: 'vert' });
    expect(p.nuit().status, p.journal()).toBe(0);
    expect(p.lignes().map(l => l.nom)).toEqual(['verifier']);
    expect(p.lire(path.join(p.commun, 'dernier-vert')).trim()).toBe(
      p.git('rev-parse', 'HEAD').trim()
    );
    expect(p.appels()).toBe('');
  });
  // Each invalid value sits next to scripts its coercion to a string would name, so a night that
  // coerces it plays something and the trace shows it.
  for (const [cas, valeur, scripts] of [
    ['a number', 3, { '3': 'vert' }],
    ['a boolean', true, { true: 'vert' }],
    ['an array', ['nuit-projet'], { 'nuit-projet': 'vert' }],
    ['an object', { script: 'nuit-projet' }, { 'nuit-projet': 'vert', '[object Object]': 'vert' }],
    ['an empty string', '', { 'nuit-projet': 'vert' }],
    ['a string of spaces', '   ', { 'nuit-projet': 'vert' }],
    ['a string of tabs and spaces', '\t \t', { 'nuit-projet': 'vert' }],
  ] as const) {
    it(`8, 12 — ${cas} as the key turns the night red, playing nothing, with a log line citing the key`, () => {
      const p = projet({ nuit: valeur }, scripts as Record<string, string>);
      expect(p.nuit().status).toBe(1);
      expect(p.lignes()).toEqual([]);
      expect(p.lire(path.join(p.commun, 'dernier-vert'))).toBe('');
      expect(
        p
          .journal()
          .split('\n')
          .some(l => l.includes('grillhouse.nuit'))
      ).toBe(true);
      expect(p.appels()).toMatch(CREE_ROUGE);
      expect(p.appels()).toMatch(/grillhouse\.nuit/);
    });
  }
  it('12 — an invalid key is caught before npm run verifier -- --force: a red suite still reports the key', () => {
    const p = projet({ nuit: '' }, { 'nuit-projet': 'vert' }, true);
    expect(p.nuit().status).toBe(1);
    expect(p.lignes()).toEqual([]);
    expect(
      p
        .journal()
        .split('\n')
        .some(l => l.includes('grillhouse.nuit'))
    ).toBe(true);
    expect(p.appels()).toMatch(/grillhouse\.nuit/);
  });
  // The key is taken as written: surrounding blanks are part of the name, which no script bears.
  for (const cle of [' nuit-projet ', 'nuit-projet ', '\tnuit-projet']) {
    it(`11 — ${JSON.stringify(cle)} as the key names an absent script and turns the night red`, () => {
      const p = projet({ nuit: cle }, { 'nuit-projet': 'vert' });
      expect(p.nuit().status).toBe(1);
      expect(p.lignes().map(l => l.nom)).not.toContain('nuit-projet');
      expect(p.lire(path.join(p.commun, 'dernier-vert'))).toBe('');
      expect(
        p
          .journal()
          .split('\n')
          .some(l => l.includes('grillhouse.nuit') && l.includes(cle))
      ).toBe(true);
      expect(p.appels()).toMatch(CREE_ROUGE);
      expect(p.appels()).toContain(cle);
    });
  }
  it('9 — the key is read in the committed package.json: an uncommitted removal still plays it', () => {
    const p = projet({ nuit: 'nuit-projet' }, { 'nuit-projet': 'vert' });
    writeFileSync(
      path.join(p.repo, 'package.json'),
      JSON.stringify({ scripts: { test: 'node t.mjs', verifier: 'node t.mjs' } })
    );
    expect(p.nuit().status, p.journal()).toBe(0);
    expect(p.lignes().map(l => l.nom)).toEqual(['verifier', 'nuit-projet']);
    expect(p.lignes()[1]?.dir).toBe(p.copie);
  });
  it('9 — a key only in the uncommitted package.json of the main tree is not read', () => {
    const p = projet(undefined, { 'nuit-projet': 'vert' });
    const pkg = JSON.parse(p.lire(path.join(p.repo, 'package.json'))) as Record<string, unknown>;
    pkg.grillhouse = { nuit: 'nuit-projet' };
    writeFileSync(path.join(p.repo, 'package.json'), JSON.stringify(pkg));
    expect(p.nuit().status, p.journal()).toBe(0);
    expect(p.lignes().map(l => l.nom)).toEqual(['verifier']);
    expect(p.appels()).toBe('');
  });
  it('9 — an invalid key only in the uncommitted package.json leaves the night green', () => {
    const p = projet(undefined, { 'nuit-projet': 'vert' });
    const pkg = JSON.parse(p.lire(path.join(p.repo, 'package.json'))) as Record<string, unknown>;
    pkg.grillhouse = { nuit: 'nuit-absente' };
    writeFileSync(path.join(p.repo, 'package.json'), JSON.stringify(pkg));
    expect(p.nuit().status, p.journal()).toBe(0);
    expect(p.appels()).toBe('');
  });
  it('6, 10 — the header of nuit.sh describes the grillhouse.nuit key', () => {
    const entete = enteteDeNuit();
    expect(entete).toMatch(/grillhouse\.nuit/);
    expect(entete).toMatch(/npm pkg set grillhouse\.nuit=/);
    expect(entete).toMatch(/npm run verifier -- --force/);
  });
});

// grillhouse-3uv.58 critère 6: an existing night copy that does not get ready (its move onto HEAD,
// its cleaning or the setting of its submodules fails) is removed by the frame's script
// (scripts/retirer-copie.sh --jetable, critère 11) and created again, once; the night turns red as
// today when the new copy does not get ready either, or when the removal is refused, its log
// repeating the script's reason (critère 9).
describe('grillhouse-3uv.58 critère 6 — the night removes and recreates a copy that does not get ready', () => {
  const LONG = 60_000;
  // A world whose node_modules is ignored, with a night copy left by an earlier night; a mark in
  // its node_modules survives its cleaning, never its removal.
  function existante() {
    const m = monde();
    writeFileSync(path.join(m.repo, '.gitignore'), '.claude/worktrees/\nnode_modules\n');
    m.git('commit', '-qam', 'ignore');
    const copie = path.join(m.repo, '.claude/worktrees/nuit');
    const gitdir = path.join(m.repo, '.git/worktrees/nuit');
    const marque = path.join(copie, 'node_modules/.marque');
    const creer = () => {
      m.git('worktree', 'add', '-q', '--detach', copie, 'HEAD');
      mkdirSync(path.dirname(marque), { recursive: true });
      writeFileSync(marque, 'ancienne copie\n');
    };
    // The copy's move onto HEAD fails: a lock left in its git directory by a stopped git.
    const bloquerPassage = () => writeFileSync(path.join(gitdir, 'index.lock'), '');
    // main references the submodule vendor/natif; `perdre` moves its source away.
    let natif = '';
    const sousModule = () => {
      natif = mkdtempSync(path.join(ESSAIS, 'natif-'));
      const g = (...a: string[]) =>
        execFileSync('git', ['-C', natif, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
      g('init', '-q', '-b', 'main');
      writeFileSync(path.join(natif, 'natif.txt'), 'v1\n');
      g('add', '.');
      g('commit', '-qm', 'v1');
      m.git('-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', natif, 'vendor/natif');
      m.git('commit', '-qm', 'natif');
    };
    const perdre = () => renameSync(natif, `${natif}-parti`);
    const listees = () => m.git('worktree', 'list', '--porcelain');
    const journal = () =>
      existsSync(m.commun)
        ? readdirSync(m.commun)
            .filter(f => f.endsWith('.log'))
            .map(f => m.lire(path.join(m.commun, f)))
            .join('')
        : '';
    const vert = () => m.lire(path.join(m.commun, 'dernier-vert')).trim();
    return {
      ...m,
      copie,
      gitdir,
      marque,
      creer,
      bloquerPassage,
      sousModule,
      perdre,
      listees,
      journal,
      vert,
    };
  }

  it(
    'critère 6: a copy whose move onto HEAD fails is removed, recreated, and the night plays green',
    () => {
      const m = existante();
      m.creer();
      m.bloquerPassage();
      const r = m.nuit();
      expect(r.status, m.journal()).toBe(0);
      expect(m.journal()).toMatch(/✓ vert/);
      expect(m.vert()).toBe(m.git('rev-parse', 'HEAD').trim());
      expect(existsSync(m.marque)).toBe(false);
      expect(m.listees()).toContain(`worktree ${m.copie}\n`);
    },
    LONG
  );
  it(
    'critère 6: a copy whose submodules do not set is removed, recreated, and the night plays green',
    () => {
      const m = existante();
      m.sousModule();
      m.creer();
      m.git(
        '-C',
        m.copie,
        '-c',
        'protocol.file.allow=always',
        'submodule',
        'update',
        '--init',
        '-q'
      );
      // The submodule's own git directory in the copy holds a stale lock: its checkout fails.
      const gitdirNatif = path.join(m.gitdir, 'modules/vendor/natif');
      expect(existsSync(gitdirNatif)).toBe(true);
      writeFileSync(path.join(gitdirNatif, 'index.lock'), '');
      const r = m.nuit();
      expect(r.status, m.journal()).toBe(0);
      expect(m.journal()).toMatch(/✓ vert/);
      expect(existsSync(m.marque)).toBe(false);
      expect(m.lire(path.join(m.copie, 'vendor/natif/natif.txt'))).toBe('v1\n');
    },
    LONG
  );
  it(
    'critère 6: a recreated copy that does not get ready either turns the night red, its log naming the submodule',
    () => {
      const m = existante();
      m.creer();
      m.bloquerPassage();
      m.sousModule();
      m.perdre();
      const r = m.nuit();
      expect(r.status).toBe(1);
      expect(m.journal()).toMatch(/vendor\/natif/);
      expect(m.journal()).toMatch(/✗ rouge/);
      expect(m.vert()).toBe('');
      // The old copy was removed before the second try.
      expect(existsSync(m.marque)).toBe(false);
    },
    LONG
  );
  // grillhouse-3uv.58 critère 11: the night passes --jetable for its own copy; local work left in
  // it (a file, a submodule moved) does not hold its removal.
  it(
    'critère 6 et 11: a copy that does not get ready and carries an untracked file is removed, recreated, and the night plays green',
    () => {
      const m = existante();
      m.creer();
      writeFileSync(path.join(m.copie, 'RESTE'), 'reste\n');
      m.bloquerPassage();
      const r = m.nuit();
      expect(r.status, m.journal()).toBe(0);
      expect(m.journal()).toMatch(/✓ vert/);
      expect(existsSync(path.join(m.copie, 'RESTE'))).toBe(false);
      expect(existsSync(m.marque)).toBe(false);
    },
    LONG
  );
  it(
    'critère 6 et 11: a copy that does not get ready and carries a modified tracked file is removed, recreated, and the night plays green',
    () => {
      const m = existante();
      m.creer();
      writeFileSync(path.join(m.copie, 't.mjs'), "console.log('modifié');\n");
      m.bloquerPassage();
      const r = m.nuit();
      expect(r.status, m.journal()).toBe(0);
      expect(m.journal()).toMatch(/✓ vert/);
      expect(m.lire(path.join(m.copie, 't.mjs'))).toBe(m.lire(path.join(m.repo, 't.mjs')));
      expect(existsSync(m.marque)).toBe(false);
    },
    LONG
  );
  it(
    'critère 6 et 11: a copy whose submodule carries local work and does not set is removed, recreated, and the night plays green',
    () => {
      const m = existante();
      m.sousModule();
      m.creer();
      m.git(
        '-C',
        m.copie,
        '-c',
        'protocol.file.allow=always',
        'submodule',
        'update',
        '--init',
        '-q'
      );
      writeFileSync(path.join(m.copie, 'vendor/natif/natif.txt'), 'travail\n');
      writeFileSync(path.join(m.copie, 'vendor/natif/neuf.txt'), 'neuf\n');
      writeFileSync(path.join(m.gitdir, 'modules/vendor/natif/index.lock'), '');
      const r = m.nuit();
      expect(r.status, m.journal()).toBe(0);
      expect(m.journal()).toMatch(/✓ vert/);
      expect(existsSync(m.marque)).toBe(false);
      expect(m.lire(path.join(m.copie, 'vendor/natif/natif.txt'))).toBe('v1\n');
      expect(existsSync(path.join(m.copie, 'vendor/natif/neuf.txt'))).toBe(false);
    },
    LONG
  );
  // grillhouse-3uv.58 critère 9: the red night repeats the reason the script gives.
  it(
    'critère 6, 9 et 11: a locked copy that does not get ready turns the night red, the script’s reason in its log, the copy left in place and locked',
    () => {
      const m = existante();
      m.creer();
      writeFileSync(path.join(m.copie, 'RESTE'), 'reste\n');
      m.git('worktree', 'lock', '--reason', 'en cours', m.copie);
      m.bloquerPassage();
      const r = m.nuit();
      expect(r.status).toBe(1);
      expect(m.journal()).toMatch(/✗ rouge/);
      expect(m.lire(path.join(m.copie, 'RESTE'))).toBe('reste\n');
      expect(existsSync(m.marque)).toBe(true);
      expect(m.listees()).toMatch(new RegExp(`worktree ${m.copie}\n[^]*?locked`));
      // The reason the frame's script gives for this copy, as the night calls it.
      const raison = spawnSync(
        'bash',
        [path.join(m.repo, 'scripts/retirer-copie.sh'), '--jetable', m.copie],
        {
          cwd: m.repo,
          encoding: 'utf8',
        }
      );
      expect(raison.status, raison.stderr).toBe(1);
      expect(raison.stderr.trim()).not.toBe('');
      expect(m.journal()).toContain(raison.stderr.trim());
    },
    LONG
  );
});

// STRUCTURE.md sums up nuit.sh with the project's night script (grillhouse.nuit); the night pushes
// nothing.
describe('STRUCTURE.md sums up the night with its one key', () => {
  it('the line of nuit.sh in STRUCTURE.md names grillhouse.nuit and no longer the push of the night', () => {
    const ligne = readFileSync(path.join(RACINE, 'STRUCTURE.md'), 'utf8')
      .split('\n')
      .find(l => /\bnuit\.sh\s+#/.test(l));
    expect(ligne).toBeDefined();
    expect(ligne).toMatch(/grillhouse\.nuit\b(?!\.)/);
    expect(ligne).not.toMatch(/grillhouse\.poussee/);
  });
});
