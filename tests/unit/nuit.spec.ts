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

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'nuit-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const NUIT = path.resolve(__dirname, '../../scripts/nuit.sh');

// A repository whose tests fail while ROUGE is committed, with a fake Beads that records its calls
// and answers `list` with the open tickets written in OUVERTS.
function monde() {
  const repo = mkdtempSync(path.join(ESSAIS, 'nuit-'));
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
  const appels = path.join(bin, 'appels');
  writeFileSync(
    path.join(bin, 'bd'),
    `#!/bin/sh\necho "$@" >> ${appels}\ncase "$1" in list) cat ${bin}/OUVERTS 2>/dev/null || echo '[]';; create) echo demo-12;; esac\n`,
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
    JSON.stringify({ scripts: { test: 'node t.mjs' } })
  );
  writeFileSync(
    path.join(repo, 't.mjs'),
    "import fs from 'node:fs';\nif (fs.existsSync('ROUGE')) { console.log('✗ un test rouge'); process.exit(1); }\nconsole.log('tout vert');\n"
  );
  writeFileSync(path.join(repo, '.gitignore'), '.claude/worktrees/\n');
  git('init', '-q', '-b', 'main');
  git('add', '.');
  git('commit', '-qm', 'base');
  const nuit = () =>
    spawnSync('bash', [path.join(repo, 'scripts/nuit.sh')], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
  const commun = path.join(repo, '.git', 'nuit');
  const lire = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
  return { repo, bin, git, nuit, commun, appels: () => lire(appels), lire };
}

describe('the night', () => {
  it('marks a green HEAD as the last green, and opens nothing', () => {
    const m = monde();
    expect(m.nuit().status).toBe(0);
    expect(m.lire(path.join(m.commun, 'dernier-vert')).trim()).toBe(
      m.git('rev-parse', 'HEAD').trim()
    );
    expect(m.appels()).toBe('');
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
    expect(appels).toMatch(/^create La nuit est rouge depuis/m);
    expect(appels).toMatch(/-l nuit/);
    expect(appels).toMatch(/^update demo-12 --title 12 — La nuit est rouge depuis \w+ — parent$/m);
    expect(appels).toContain(`${vert}..${rouge}`);
    expect(appels).toMatch(/un test rouge/);
  });
  it('comments the open night ticket instead of opening another', () => {
    const m = monde();
    writeFileSync(path.join(m.repo, 'ROUGE'), '');
    m.git('add', 'ROUGE');
    m.git('commit', '-qm', 'casse');
    writeFileSync(path.join(m.bin, 'OUVERTS'), '[{"id":"demo-9"}]');
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
  it('3uv.63 critère 10: during the night no integration lock is held, and the queue runs', () => {
    const m = monde();
    const trace = path.join(m.bin, 'pendant');
    // The night's tests look at the lock and launch the queue from the main tree.
    writeFileSync(
      path.join(m.repo, 't.mjs'),
      `import fs from 'node:fs';\nimport { spawnSync } from 'node:child_process';\n` +
        `const verrou = fs.existsSync(${JSON.stringify(path.join(m.repo, '.git', 'integration.lock'))});\n` +
        `const f = spawnSync('node', [${JSON.stringify(path.join(m.repo, 'scripts/integration/file.mjs'))}], { cwd: ${JSON.stringify(m.repo)}, encoding: 'utf8', timeout: 30000 });\n` +
        `fs.writeFileSync(${JSON.stringify(trace)}, JSON.stringify({ verrou, file: f.status, sortie: f.stdout + f.stderr }));\n`
    );
    m.git('add', 't.mjs');
    m.git('commit', '-qm', 'pendant');
    expect(m.nuit().status).toBe(0);
    const p = JSON.parse(m.lire(trace)) as { verrou: boolean; file: number; sortie: string };
    expect(p.verrou).toBe(false);
    expect(p.file, p.sortie).toBe(0);
  });
});

// The project's night script (grillhouse-3uv.30): `grillhouse.nuit` in the section `grillhouse` of
// the project's package.json names an npm script; the night plays it in its copy, after a green
// `npm test`. Each script below appends its name and working directory to a trace outside the
// repository, so the order and the place of each run can be read.
describe('the night plays the project night script (grillhouse.nuit)', () => {
  function projet(cle: unknown, scripts: Record<string, string> = {}, testRouge = false) {
    const m = monde();
    const trace = path.join(m.bin, 'trace');
    const noter = (nom: string, code = 0) =>
      `node -e "require('fs').appendFileSync('${trace}', '${nom} ' + process.cwd() + '\\n'); process.exit(${code})"`;
    const pkg: Record<string, unknown> = {
      scripts: {
        test: testRouge ? noter('test', 1) : `${noter('test')} && node t.mjs`,
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

  it('1 — plays npm run <script> in its copy after a green npm test', () => {
    const p = projet({ nuit: 'nuit-projet' }, { 'nuit-projet': 'vert' });
    const r = p.nuit();
    expect(r.status, p.journal()).toBe(0);
    expect(p.lignes().map(l => l.nom)).toEqual(['test', 'nuit-projet']);
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
    expect(p.lignes().map(l => l.nom)).toEqual(['test', 'nuit:corpus']);
  });
  it('2 — a red npm test turns the night red without playing the project script', () => {
    const p = projet({ nuit: 'nuit-projet' }, { 'nuit-projet': 'vert' }, true);
    expect(p.nuit().status).toBe(1);
    expect(p.lignes().map(l => l.nom)).toEqual(['test']);
    expect(p.appels()).toMatch(/^create La nuit est rouge depuis/m);
  });
  it('3 — a red project script turns the night red, on the night ticket, and the log names it', () => {
    const p = projet({ nuit: 'nuit-projet' }, { 'nuit-projet': 'rouge' });
    expect(p.nuit().status).toBe(1);
    expect(p.lignes().map(l => l.nom)).toEqual(['test', 'nuit-projet']);
    expect(p.lire(path.join(p.commun, 'dernier-vert'))).toBe('');
    const journal = p.journal();
    expect(journal).toMatch(/✗ rouge : ticket/);
    expect(
      journal.split('\n').some(l => l.includes('grillhouse.nuit') && l.includes('nuit-projet'))
    ).toBe(true);
    const appels = p.appels();
    expect(appels).toMatch(/^create La nuit est rouge depuis/m);
    expect(appels).toMatch(/-l nuit/);
    expect(appels).toMatch(/grillhouse\.nuit[^\n]*nuit-projet|nuit-projet[^\n]*grillhouse\.nuit/);
  });
  it('3 — a red project script comments the open night ticket instead of opening another', () => {
    const p = projet({ nuit: 'nuit:corpus' }, { 'nuit:corpus': 'rouge' });
    writeFileSync(path.join(p.bin, 'OUVERTS'), '[{"id":"demo-9"}]');
    expect(p.nuit().status).toBe(1);
    expect(p.appels()).toMatch(/^comments add demo-9 La nuit du/m);
    expect(p.appels()).not.toMatch(/^create/m);
    expect(p.appels()).toMatch(/nuit:corpus/);
  });
  it('4 — without the key, the night plays npm test alone', () => {
    const p = projet(undefined, { 'nuit-projet': 'vert' });
    expect(p.nuit().status, p.journal()).toBe(0);
    expect(p.lignes().map(l => l.nom)).toEqual(['test']);
    expect(p.journal()).not.toMatch(/grillhouse\.nuit/);
  });
  it('4 — a section without the key leaves the night unchanged', () => {
    const p = projet({ integration: 'impactes', roles: {} }, { nuit: 'vert' });
    expect(p.nuit().status, p.journal()).toBe(0);
    expect(p.lignes().map(l => l.nom)).toEqual(['test']);
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
    expect(p.appels()).toMatch(/^create La nuit est rouge depuis/m);
    expect(p.appels()).toMatch(/nuit-absente/);
  });
  it('7 — a null key is an absent key: the night plays npm test alone', () => {
    const p = projet({ nuit: null }, { 'nuit-projet': 'vert', null: 'vert' });
    expect(p.nuit().status, p.journal()).toBe(0);
    expect(p.lignes().map(l => l.nom)).toEqual(['test']);
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
      expect(p.appels()).toMatch(/^create La nuit est rouge depuis/m);
      expect(p.appels()).toMatch(/grillhouse\.nuit/);
    });
  }
  it('12 — an invalid key is caught before npm test: a red suite still reports the key', () => {
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
      expect(p.appels()).toMatch(/^create La nuit est rouge depuis/m);
      expect(p.appels()).toContain(cle);
    });
  }
  it('9 — the key is read in the committed package.json: an uncommitted removal still plays it', () => {
    const p = projet({ nuit: 'nuit-projet' }, { 'nuit-projet': 'vert' });
    writeFileSync(
      path.join(p.repo, 'package.json'),
      JSON.stringify({ scripts: { test: 'node t.mjs' } })
    );
    expect(p.nuit().status, p.journal()).toBe(0);
    expect(p.lignes().map(l => l.nom)).toEqual(['test', 'nuit-projet']);
    expect(p.lignes()[1]?.dir).toBe(p.copie);
  });
  it('9 — a key only in the uncommitted package.json of the main tree is not read', () => {
    const p = projet(undefined, { 'nuit-projet': 'vert' });
    const pkg = JSON.parse(p.lire(path.join(p.repo, 'package.json'))) as Record<string, unknown>;
    pkg.grillhouse = { nuit: 'nuit-projet' };
    writeFileSync(path.join(p.repo, 'package.json'), JSON.stringify(pkg));
    expect(p.nuit().status, p.journal()).toBe(0);
    expect(p.lignes().map(l => l.nom)).toEqual(['test']);
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
    const entete = readFileSync(NUIT, 'utf8')
      .split('\n')
      .slice(1)
      .filter((l, i, t) => t.slice(0, i + 1).every(x => x.startsWith('#')))
      .join('\n');
    expect(entete).toMatch(/grillhouse\.nuit/);
    expect(entete).toMatch(/npm pkg set grillhouse\.nuit=/);
    expect(entete).toMatch(/npm test/);
  });
});

// The night pushes its green commit (grillhouse-3uv.51): `grillhouse.poussee.nuit` in the package.json
// of the commit it plays names the remote branch where, after writing the last green, it runs
// `git push origin <commit>:<branch>` (decision of grillhouse-3uv.53). The remote is a local bare
// repository, `origin`, whose branches start at the base commit; its pre-receive hook records the
// last green at the moment of each push, and refuses the push while the file REFUSE exists.
describe('the night pushes its green commit (grillhouse.poussee.nuit)', () => {
  function distant(
    grillhouse: unknown,
    opts: { branches?: string[]; testRouge?: boolean; scripts?: Record<string, string> } = {}
  ) {
    const m = monde();
    const bare = mkdtempSync(path.join(ESSAIS, 'distant-'));
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare]);
    const trace = path.join(m.bin, 'trace');
    const recus = path.join(m.bin, 'recus');
    const noter = (nom: string, code = 0) =>
      `node -e "require('fs').appendFileSync('${trace}', '${nom}\\n'); process.exit(${code})"`;
    const pkg: Record<string, unknown> = {
      scripts: {
        test: opts.testRouge ? noter('test', 1) : `${noter('test')} && node t.mjs`,
        ...Object.fromEntries(
          Object.entries(opts.scripts ?? {}).map(([nom, code]) => [
            nom,
            code === 'rouge' ? noter(nom, 1) : noter(nom),
          ])
        ),
      },
    };
    if (grillhouse !== undefined) {
      pkg.grillhouse = grillhouse;
    }
    writeFileSync(path.join(m.repo, 'package.json'), JSON.stringify(pkg, null, 2));
    m.git('add', 'package.json');
    m.git('commit', '-qm', 'projet');
    m.git('remote', 'add', 'origin', bare);
    const base = m.git('rev-parse', 'HEAD').trim();
    for (const b of opts.branches ?? ['main']) {
      m.git('push', '-q', 'origin', `HEAD:refs/heads/${b}`);
    }
    writeFileSync(
      path.join(bare, 'hooks', 'pre-receive'),
      `#!/bin/sh\nif [ -f ${m.commun}/dernier-vert ]; then cat ${m.commun}/dernier-vert; else echo aucun; fi >> ${recus}\n[ -f ${bare}/REFUSE ] && exit 1\nexit 0\n`,
      { mode: 0o755 }
    );
    writeFileSync(path.join(m.repo, 'suite'), '');
    m.git('add', 'suite');
    m.git('commit', '-qm', 'suite');
    const tete = m.git('rev-parse', 'HEAD').trim();
    const ref = (b: string) =>
      spawnSync('git', ['--git-dir', bare, 'rev-parse', '--verify', '-q', `refs/heads/${b}`], {
        encoding: 'utf8',
      }).stdout.trim();
    const journal = () => {
      const f = execFileSync('ls', [m.commun], { encoding: 'utf8' })
        .split('\n')
        .find(x => x.endsWith('.log'));
      return f ? m.lire(path.join(m.commun, f)) : '';
    };
    const joues = () => m.lire(trace).split('\n').filter(Boolean);
    const poussees = () => m.lire(recus).split('\n').filter(Boolean);
    const dernierVert = () => m.lire(path.join(m.commun, 'dernier-vert')).trim();
    // Commits what changes makes in the main tree, and returns the new HEAD.
    const suivant = (changes: () => void) => {
      changes();
      m.git('add', '-A');
      m.git('commit', '-qm', 'suivant');
      return m.git('rev-parse', 'HEAD').trim();
    };
    const avecPaquet = (modifier: (pkg: Record<string, unknown>) => void) => () => {
      const pkg = JSON.parse(m.lire(path.join(m.repo, 'package.json'))) as Record<string, unknown>;
      modifier(pkg);
      writeFileSync(path.join(m.repo, 'package.json'), JSON.stringify(pkg, null, 2));
    };
    return {
      ...m,
      bare,
      base,
      tete,
      ref,
      journal,
      joues,
      poussees,
      dernierVert,
      suivant,
      avecPaquet,
    };
  }
  // A line of the night ticket's text that names the refused push and its branch.
  const nommePoussee = (texte: string, branche: string) =>
    texte.split('\n').some(l => /pouss/i.test(l) && l.includes(branche));

  it('1 — a green night pushes its commit onto the branch the key names', () => {
    const d = distant({ poussee: { nuit: 'main' } });
    expect(d.nuit().status, d.journal()).toBe(0);
    expect(d.ref('main')).toBe(d.tete);
    expect(d.dernierVert()).toBe(d.tete);
    expect(d.appels()).toBe('');
  });
  it('1 — another branch, with a slash, among other keys: only that branch moves', () => {
    const d = distant(
      { integration: 'impactes', poussee: { commit: 'travail', nuit: 'deploiement/nuit' } },
      { branches: ['main', 'travail', 'deploiement/nuit'] }
    );
    expect(d.nuit().status, d.journal()).toBe(0);
    expect(d.ref('deploiement/nuit')).toBe(d.tete);
    expect(d.ref('travail')).toBe(d.base);
    expect(d.ref('main')).toBe(d.base);
  });
  it('1 — the push happens once, after the last green is written', () => {
    const d = distant({ poussee: { nuit: 'main' } });
    expect(d.nuit().status, d.journal()).toBe(0);
    expect(d.poussees()).toEqual([d.tete]);
  });
  it('1 — the push follows a green project night script', () => {
    const d = distant(
      { nuit: 'nuit-projet', poussee: { nuit: 'main' } },
      { scripts: { 'nuit-projet': 'vert' } }
    );
    expect(d.nuit().status, d.journal()).toBe(0);
    expect(d.joues()).toEqual(['test', 'nuit-projet']);
    expect(d.ref('main')).toBe(d.tete);
  });
  // Each red night is followed by the green night of its fix, which pushes: the push waits for green.
  it('1, 2 — a red npm test pushes nothing; the green night of its fix pushes', () => {
    const d = distant({ poussee: { nuit: 'main' } });
    const rouge = d.suivant(() => writeFileSync(path.join(d.repo, 'ROUGE'), ''));
    expect(d.nuit().status).toBe(1);
    expect(d.poussees()).toEqual([]);
    expect(d.ref('main')).toBe(d.base);
    const vert = d.suivant(() => rmSync(path.join(d.repo, 'ROUGE')));
    expect(vert).not.toBe(rouge);
    expect(d.nuit().status, d.journal()).toBe(0);
    expect(d.ref('main')).toBe(vert);
    expect(d.poussees()).toEqual([vert]);
  });
  it('2 — a red project night script pushes nothing; the green night of its fix pushes', () => {
    const d = distant(
      { nuit: 'nuit-projet', poussee: { nuit: 'main' } },
      { scripts: { 'nuit-projet': 'rouge' } }
    );
    expect(d.nuit().status).toBe(1);
    expect(d.poussees()).toEqual([]);
    expect(d.ref('main')).toBe(d.base);
    const vert = d.suivant(
      d.avecPaquet(pkg => {
        (pkg.scripts as Record<string, string>)['nuit-projet'] = 'node -e ""';
      })
    );
    expect(d.nuit().status, d.journal()).toBe(0);
    expect(d.ref('main')).toBe(vert);
  });
  it('2 — a night red on its grillhouse.nuit key pushes nothing; the green night of its fix pushes', () => {
    const d = distant({ nuit: 'nuit-absente', poussee: { nuit: 'main' } });
    expect(d.nuit().status).toBe(1);
    expect(d.poussees()).toEqual([]);
    expect(d.ref('main')).toBe(d.base);
    const vert = d.suivant(
      d.avecPaquet(pkg => {
        pkg.grillhouse = { poussee: { nuit: 'main' } };
      })
    );
    expect(d.nuit().status, d.journal()).toBe(0);
    expect(d.ref('main')).toBe(vert);
  });
  it('3 — a push refused by the remote keeps the last green and opens a night ticket naming it', () => {
    const d = distant({ poussee: { nuit: 'deploiement' } }, { branches: ['deploiement'] });
    writeFileSync(path.join(d.bare, 'REFUSE'), '');
    d.nuit();
    expect(d.poussees()).toEqual([d.tete]);
    expect(d.ref('deploiement')).toBe(d.base);
    expect(d.dernierVert()).toBe(d.tete);
    expect(d.appels()).toMatch(/^create .*-l nuit/m);
    expect(nommePoussee(d.appels(), 'deploiement')).toBe(true);
  });
  it('3 — a push refused as not fast-forward keeps the last green and names the push', () => {
    const d = distant({ poussee: { nuit: 'deploiement' } }, { branches: ['deploiement'] });
    const ailleurs = d
      .git('commit-tree', `${d.base}^{tree}`, '-p', d.base, '-m', 'ailleurs')
      .trim();
    d.git('push', '-q', 'origin', `${ailleurs}:refs/heads/deploiement`);
    d.nuit();
    expect(d.ref('deploiement')).toBe(ailleurs);
    expect(d.dernierVert()).toBe(d.tete);
    expect(d.appels()).toMatch(/^create .*-l nuit/m);
    expect(nommePoussee(d.appels(), 'deploiement')).toBe(true);
  });
  it('3 — a refused push comments the open night ticket instead of opening another', () => {
    const d = distant({ poussee: { nuit: 'deploiement' } }, { branches: ['deploiement'] });
    writeFileSync(path.join(d.bare, 'REFUSE'), '');
    writeFileSync(path.join(d.bin, 'OUVERTS'), '[{"id":"demo-9"}]');
    d.nuit();
    expect(d.dernierVert()).toBe(d.tete);
    expect(d.appels()).toMatch(/^comments add demo-9 /m);
    expect(d.appels()).not.toMatch(/^create/m);
    expect(nommePoussee(d.appels(), 'deploiement')).toBe(true);
  });
  for (const [cas, cle] of [
    ['without a grillhouse section', undefined],
    ['without the poussee key', { integration: 'impactes' }],
    ['with poussee but no nuit', { poussee: { commit: 'main' } }],
  ] as const) {
    // The next night, once the key is committed, pushes: the key alone drives the push.
    it(`4 — ${cas}, a green night pushes nothing; with the key committed, the next one pushes`, () => {
      const d = distant(cle);
      expect(d.nuit().status, d.journal()).toBe(0);
      expect(d.dernierVert()).toBe(d.tete);
      expect(d.poussees()).toEqual([]);
      expect(d.ref('main')).toBe(d.base);
      expect(d.appels()).toBe('');
      const avec = d.suivant(
        d.avecPaquet(pkg => {
          pkg.grillhouse = { ...(pkg.grillhouse as object), poussee: { nuit: 'main' } };
        })
      );
      expect(d.nuit().status, d.journal()).toBe(0);
      expect(d.ref('main')).toBe(avec);
    });
  }
  // Each invalid value is one whose coercion could name the remote branch main.
  for (const [cas, valeur] of [
    ['a number', 3],
    ['a boolean', true],
    ['an array', ['main']],
    ['an object', { branche: 'main' }],
    ['an empty string', ''],
    ['a string of spaces', '   '],
    ['a string of tabs and spaces', '\t \t'],
  ] as const) {
    it(`4 — ${cas} as poussee.nuit turns the night red before any work, citing the key`, () => {
      const d = distant({ poussee: { nuit: valeur } }, { branches: ['main', '3', 'true'] });
      expect(d.nuit().status).toBe(1);
      expect(d.joues()).toEqual([]);
      expect(d.poussees()).toEqual([]);
      expect(d.dernierVert()).toBe('');
      expect(
        d
          .journal()
          .split('\n')
          .some(l => l.includes('grillhouse.poussee.nuit'))
      ).toBe(true);
      expect(d.appels()).toMatch(/^create La nuit est rouge depuis/m);
      expect(d.appels()).toMatch(/grillhouse\.poussee\.nuit/);
    });
  }
  it('4 — an invalid poussee.nuit is caught before npm test: a red suite still reports the key', () => {
    const d = distant({ poussee: { nuit: '' } }, { testRouge: true });
    expect(d.nuit().status).toBe(1);
    expect(d.joues()).toEqual([]);
    expect(d.appels()).toMatch(/grillhouse\.poussee\.nuit/);
  });
  it('4 — the key is read in the committed package.json: an uncommitted removal still pushes', () => {
    const d = distant({ poussee: { nuit: 'main' } });
    writeFileSync(
      path.join(d.repo, 'package.json'),
      JSON.stringify({ scripts: { test: 'node t.mjs' } })
    );
    expect(d.nuit().status, d.journal()).toBe(0);
    expect(d.ref('main')).toBe(d.tete);
  });
  it('4 — a key only in the uncommitted package.json pushes nothing; once committed, it pushes', () => {
    const d = distant(undefined);
    const ajouter = d.avecPaquet(pkg => {
      pkg.grillhouse = { poussee: { nuit: 'main' } };
    });
    ajouter();
    expect(d.nuit().status, d.journal()).toBe(0);
    expect(d.poussees()).toEqual([]);
    expect(d.ref('main')).toBe(d.base);
    const avec = d.suivant(() => {});
    expect(d.nuit().status, d.journal()).toBe(0);
    expect(d.ref('main')).toBe(avec);
  });
  it('5 — the header of nuit.sh describes the grillhouse.poussee.nuit key', () => {
    const entete = readFileSync(NUIT, 'utf8')
      .split('\n')
      .slice(1)
      .filter((l, i, t) => t.slice(0, i + 1).every(x => x.startsWith('#')))
      .join('\n');
    expect(entete).toMatch(/grillhouse\.poussee\.nuit/);
    expect(entete).toMatch(/git push origin/);
  });
  // A refused push is a defect to deal with, like a red: the night exits 1 (the remote's hook, or
  // a remote branch that moved elsewhere and refuses a push that is not fast-forward).
  const refus: [string, (d: ReturnType<typeof distant>) => void][] = [
    ['the remote hook', d => writeFileSync(path.join(d.bare, 'REFUSE'), '')],
    [
      'a remote branch moved elsewhere',
      d => {
        const ailleurs = d
          .git('commit-tree', `${d.base}^{tree}`, '-p', d.base, '-m', 'ailleurs')
          .trim();
        d.git('push', '-q', 'origin', `${ailleurs}:refs/heads/deploiement`);
      },
    ],
  ];
  for (const [cas, refuser] of refus) {
    it(`6 — a green night whose push is refused by ${cas} exits 1, on a ticket « La poussée de la nuit est refusée sur <commit> »`, () => {
      const d = distant({ poussee: { nuit: 'deploiement' } }, { branches: ['deploiement'] });
      refuser(d);
      expect(d.nuit().status, d.journal()).toBe(1);
      expect(d.dernierVert()).toBe(d.tete);
      const court = d.tete.slice(0, 7);
      const appels = d.appels();
      expect(appels).toMatch(
        new RegExp(`^create La poussée de la nuit est refusée sur ${court} .*-l nuit`, 'm')
      );
      expect(appels).toMatch(
        new RegExp(
          `^update demo-12 --title 12 — La poussée de la nuit est refusée sur ${court} — parent$`,
          'm'
        )
      );
      expect(appels).not.toMatch(/La nuit est rouge depuis/);
    });
  }
  it('6 — a refused push that comments the open night ticket also exits 1', () => {
    const d = distant({ poussee: { nuit: 'deploiement' } }, { branches: ['deploiement'] });
    writeFileSync(path.join(d.bare, 'REFUSE'), '');
    writeFileSync(path.join(d.bin, 'OUVERTS'), '[{"id":"demo-9"}]');
    expect(d.nuit().status, d.journal()).toBe(1);
    expect(d.appels()).toMatch(/^comments add demo-9 /m);
    expect(d.appels()).not.toMatch(/^create/m);
  });
  it('7 — a null poussee is an absent key: nothing pushed; with the key committed, the next night pushes', () => {
    const d = distant({ poussee: null });
    expect(d.nuit().status, d.journal()).toBe(0);
    expect(d.dernierVert()).toBe(d.tete);
    expect(d.poussees()).toEqual([]);
    expect(d.ref('main')).toBe(d.base);
    expect(d.appels()).toBe('');
    const avec = d.suivant(
      d.avecPaquet(pkg => {
        pkg.grillhouse = { poussee: { nuit: 'main' } };
      })
    );
    expect(d.nuit().status, d.journal()).toBe(0);
    expect(d.ref('main')).toBe(avec);
  });
  // A line cites grillhouse.poussee itself, not only its nuit key.
  const citePoussee = (l: string) => /grillhouse\.poussee(?!\.\w)/.test(l);
  // Each invalid value is one whose coercion could name the remote branch main.
  for (const [cas, valeur] of [
    ['a string', 'main'],
    ['a number', 3],
    ['a boolean', true],
    ['an array', ['main']],
    ['an array of an object', [{ nuit: 'main' }]],
  ] as const) {
    it(`7 — ${cas} as poussee turns the night red before any work, citing grillhouse.poussee`, () => {
      const d = distant({ poussee: valeur }, { branches: ['main', '3', 'true'] });
      expect(d.nuit().status).toBe(1);
      expect(d.joues()).toEqual([]);
      expect(d.poussees()).toEqual([]);
      expect(d.dernierVert()).toBe('');
      expect(d.journal().split('\n').some(citePoussee)).toBe(true);
      expect(d.appels()).toMatch(/^create La nuit est rouge depuis/m);
      expect(d.appels().split('\n').some(citePoussee)).toBe(true);
    });
  }
  it('8 — a null poussee.nuit is an absent key: nothing pushed; with the key committed, the next night pushes', () => {
    const d = distant({ poussee: { commit: 'main', nuit: null } });
    expect(d.nuit().status, d.journal()).toBe(0);
    expect(d.dernierVert()).toBe(d.tete);
    expect(d.poussees()).toEqual([]);
    expect(d.ref('main')).toBe(d.base);
    expect(d.appels()).toBe('');
    const avec = d.suivant(
      d.avecPaquet(pkg => {
        pkg.grillhouse = { poussee: { commit: 'main', nuit: 'main' } };
      })
    );
    expect(d.nuit().status, d.journal()).toBe(0);
    expect(d.ref('main')).toBe(avec);
  });
  // A ticket call: a creation, or a comment on the open night ticket.
  const signalements = (appels: string) =>
    appels.split('\n').filter(l => /^(create|comments add) /.test(l));
  it('9 — grillhouse.nuit and grillhouse.poussee.nuit both wrong: a line for each, one ticket', () => {
    const d = distant(
      { nuit: 3, poussee: { nuit: '' } },
      { scripts: { '3': 'vert' }, branches: ['main', '3'] }
    );
    expect(d.nuit().status).toBe(1);
    expect(d.joues()).toEqual([]);
    expect(d.poussees()).toEqual([]);
    expect(d.dernierVert()).toBe('');
    const lignes = d.journal().split('\n');
    expect(lignes.some(l => l.includes('grillhouse.nuit'))).toBe(true);
    expect(lignes.some(l => l.includes('grillhouse.poussee.nuit'))).toBe(true);
    expect(signalements(d.appels())).toHaveLength(1);
    expect(d.appels()).toMatch(/^create La nuit est rouge depuis/m);
  });
  it('9 — both keys wrong, with an open night ticket: a line for each, one comment', () => {
    const d = distant({ nuit: 'nuit-absente', poussee: { nuit: ['main'] } });
    writeFileSync(path.join(d.bin, 'OUVERTS'), '[{"id":"demo-9"}]');
    expect(d.nuit().status).toBe(1);
    expect(d.joues()).toEqual([]);
    const lignes = d.journal().split('\n');
    expect(lignes.some(l => l.includes('grillhouse.nuit') && l.includes('nuit-absente'))).toBe(
      true
    );
    expect(lignes.some(l => l.includes('grillhouse.poussee.nuit'))).toBe(true);
    expect(signalements(d.appels())).toEqual([expect.stringMatching(/^comments add demo-9 /)]);
  });
  // The common night without a commit of the day: the remote already holds the green commit.
  it('10 — a remote already at the green commit: the night is green, without a refusal or a ticket', () => {
    const d = distant({ poussee: { nuit: 'main' } });
    expect(d.nuit().status, d.journal()).toBe(0);
    expect(d.ref('main')).toBe(d.tete);
    expect(d.nuit().status, d.journal()).toBe(0);
    expect(d.ref('main')).toBe(d.tete);
    expect(d.dernierVert()).toBe(d.tete);
    expect(d.appels()).toBe('');
    expect(d.journal()).not.toMatch(/refus/i);
    const apres = d.suivant(() => writeFileSync(path.join(d.repo, 'apres'), ''));
    expect(d.nuit().status, d.journal()).toBe(0);
    expect(d.ref('main')).toBe(apres);
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
