// grillhouse-4id, critères 2 and 3, end to end: the tools of the project (`grillhouse.outils`)
// reach the circuit, the night, the command of the key and `grillhouse verifier`, whatever their
// launcher holds, and a faulty key stops each of them by its name. Each case mounts a repository
// of trial and runs the frame there; the day proves the same by the exported functions
// (packages/grillhouse/tests/unit/outils-cles.spec.ts, circuit.outils.spec.ts).
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

// The frame's package, in the same tree.
const CADRE = path.resolve(__dirname, '../../grillhouse');
const CIRCUIT = path.join(CADRE, 'scripts/circuit.mjs');
const NUIT = path.join(CADRE, 'scripts/nuit.sh');
const SCRIPT = path.join(CADRE, 'scripts/outils-cles.mjs');
const COMMANDE = path.join(CADRE, 'bin/grillhouse.mjs');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'outils-nuit-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// A repository of trial whose package.json declares <outils> (and <cles>), committed once.
function depotGit(outils: unknown, cles: Record<string, unknown> = {}): string {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  writeFileSync(
    path.join(racine, 'package.json'),
    JSON.stringify({ name: 'essai', private: true, grillhouse: { ...cles, outils } })
  );
  const git = (...a: string[]) => {
    const r = spawnSync('git', ['-C', racine, ...a], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
  };
  git('init', '-q');
  git('add', 'package.json');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'un');
  return racine;
}

// A directory of fake commands beside <racine>: each `nom` runs its `lignes`.
function commandes(racine: string, scripts: Record<string, string[]>): string {
  const bin = `${racine}-bin`;
  mkdirSync(bin);
  for (const [nom, lignes] of Object.entries(scripts)) {
    writeFileSync(path.join(bin, nom), ['#!/bin/sh', ...lignes, ''].join('\n'));
    chmodSync(path.join(bin, nom), 0o755);
  }
  return bin;
}

describe('critère 3 — a faulty key stops the circuit at its launch, by its name', () => {
  it('stops at « lancement », before any session, the fault in its state and its question', () => {
    const racine = depotGit({ X_OUTIL: '~' }, { langages: ['typescript'] });
    const bin = commandes(racine, {
      bd: [
        'ici=$(dirname "$0")',
        'case "$1" in',
        '  show) cat "$ici/ticket.json" ;;',
        '  comments) if [ "$2" = add ]; then printf "%s\\n" "$4" >> "$ici/bd.journal"; else echo "[]"; fi ;;',
        '  *) echo "[]" ;;',
        'esac',
      ],
    });
    writeFileSync(
      path.join(bin, 'ticket.json'),
      JSON.stringify([
        {
          id: 't-1',
          title: '1 — sujet — .',
          description: '## Architecture\n\nModèle mûr : Bazel.\n\n## Critères\n\n1. Un critère.',
          issue_type: 'task',
          status: 'in_progress',
        },
      ])
    );
    const r = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `const { main } = await import(${JSON.stringify(pathToFileURL(CIRCUIT).href)});
process.exitCode = await main(['t-1']);`,
      ],
      {
        cwd: racine,
        encoding: 'utf8',
        timeout: 60_000,
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, CLAUDE_BIN: '/bin/false' },
      }
    );
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(10);
    expect(r.stderr).toContain('lancement');
    const etat = JSON.parse(
      readFileSync(path.join(racine, '.claude/worktrees/t-1.circuit.json'), 'utf8')
    ) as { raison: string; rapport: string; seance: unknown };
    expect(etat.raison).toBe('lancement');
    expect(etat.rapport).toContain('grillhouse.outils.X_OUTIL');
    expect(etat.seance).toBeNull();
    expect(readFileSync(path.join(bin, 'bd.journal'), 'utf8')).toContain(
      'grillhouse.outils.X_OUTIL'
    );
    expect(existsSync(path.join(racine, '.claude/worktrees/t-1'))).toBe(false);
  });
});

// The night in a repository of trial declaring <outils>, npm a script that writes the value of
// X_OUTIL at each call to `vu`, bd a script that answers nothing, X_OUTIL absent from the
// environment: its exit code, its log, and `vu`.
function nuit(outils: unknown) {
  const racine = depotGit(outils);
  const vu = `${racine}-vu`;
  const bin = commandes(racine, {
    npm: [`printf '%s\\n' "X_OUTIL=\${X_OUTIL-absent} $*" >> '${vu}'`, 'exit 0'],
    bd: ['echo "[]"'],
  });
  const env: Record<string, string | undefined> = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
  };
  delete env.X_OUTIL;
  const r = spawnSync('bash', [NUIT], { cwd: racine, encoding: 'utf8', timeout: 120_000, env });
  const dossier = path.join(racine, '.git', 'nuit');
  const journal = readdirSync(dossier)
    .filter(f => f.endsWith('.log'))
    .map(f => readFileSync(path.join(dossier, f), 'utf8'))
    .join('\n');
  return { code: r.status, journal: `${journal}\n${r.stdout}\n${r.stderr}`, vu };
}

describe('the night plays with the tools of the project', () => {
  it('critère 2: its full pass sees X_OUTIL, set from the key', () => {
    const outil = path.join(ESSAIS, 'outil');
    mkdirSync(outil, { recursive: true });
    const { code, journal, vu } = nuit({ X_OUTIL: outil });
    expect(code, journal).toBe(0);
    expect(readFileSync(vu, 'utf8')).toContain(`X_OUTIL=${outil} --prefix`);
    expect(readFileSync(vu, 'utf8')).not.toContain('X_OUTIL=absent');
  });
  it('critère 3: a faulty key turns the night red, named in the log, and nothing runs', () => {
    const { code, journal, vu } = nuit({ X_OUTIL: '/nulle/part/outil' });
    expect(code).toBe(1);
    expect(journal).toContain('grillhouse.outils.X_OUTIL');
    expect(journal).toContain('/nulle/part/outil');
    expect(existsSync(vu)).toBe(false);
  });
});

describe('the command of the key and `grillhouse verifier`', () => {
  it('critère 2: gives the night one export per tool (the command)', () => {
    const outil = path.join(ESSAIS, 'outil-b');
    mkdirSync(outil, { recursive: true });
    const dir = depotGit({ X_OUTIL: outil });
    const r = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toBe(`export X_OUTIL='${outil}'\n`);
  });
  it('critère 3: the night’s command refuses a faulty key, naming it, exit 1', () => {
    const dir = depotGit({ 'X-OUTIL': '/' });
    const r = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('X-OUTIL');
  });
  it('critère 3: `grillhouse verifier` refuses a faulty key before any pass, naming it', () => {
    const dir = depotGit({ X_OUTIL: '/nulle/part/outil' }, { langages: ['typescript'] });
    const r = spawnSync(process.execPath, [COMMANDE, 'verifier'], {
      cwd: dir,
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('grillhouse.outils.X_OUTIL');
    expect(r.stderr).toContain('/nulle/part/outil');
  });
});
