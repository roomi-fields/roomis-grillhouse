import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  git('init', '-q');
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
  it('waits while an integration runs', () => {
    const m = monde();
    writeFileSync(path.join(m.repo, '.git', 'integration.lock'), String(process.pid));
    expect(m.nuit().status).toBe(2);
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
