import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CODE_USAGE } from '../../scripts/enveloppe/codes.mjs';

// Ticket grillhouse-3uv.46: the launcher takes a model and a reasoning level for one session
// (--modele, --effort) and hands them to claude (--model, --effort); without them, the role's
// definition decides. The trial repositories live outside /tmp, which the envelope replaces.
const ESSAIS = mkdtempSync(path.join(homedir(), '.cache', 'grillhouse-essais-lancer-modele-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const RACINE = path.resolve(__dirname, '../..');
const LAUNCHER = path.join(RACINE, 'scripts/enveloppe/lancer.sh');
const SCRIPT = path.join(RACINE, 'scripts/enveloppe/enveloppe.mjs');
const canWrap = spawnSync('bwrap', ['--dev-bind', '/', '/', 'true']).status === 0;

// The envelope as a test repository holds it: enveloppe.mjs and every module it imports.
function installerEnveloppe(repo: string) {
  const vus = new Set<string>();
  const suivre = (fichier: string) => {
    if (vus.has(fichier)) {
      return;
    }
    vus.add(fichier);
    const cible = path.join(repo, path.relative(RACINE, fichier));
    mkdirSync(path.dirname(cible), { recursive: true });
    execFileSync('cp', [fichier, cible]);
    const source = readFileSync(fichier, 'utf8');
    for (const [, spec] of source.matchAll(
      /^\s*(?:import|export)\b[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/gm
    )) {
      suivre(path.resolve(path.dirname(fichier), spec));
    }
  };
  suivre(SCRIPT);
}

// A test repository whose developpeur's definition sets its own model and level, and a stand-in
// for claude that records its arguments, one per NUL.
const REPO = path.join(ESSAIS, 'depot');
const HOME = path.join(ESSAIS, 'home');
mkdirSync(path.join(REPO, 'packages/a/src'), { recursive: true });
mkdirSync(path.join(REPO, '.claude/agents'), { recursive: true });
mkdirSync(HOME, { recursive: true });
writeFileSync(path.join(REPO, 'packages/a/src/a.ts'), 'a');
writeFileSync(
  path.join(REPO, '.claude/agents/developpeur.md'),
  '---\nname: developpeur\nmodel: sonnet\neffort: medium\n---\n'
);
installerEnveloppe(REPO);
const FAUX = path.join(REPO, 'faux-claude.sh');
writeFileSync(FAUX, '#!/bin/bash\nprintf "%s\\0" "$@" > packages/a/args\n', { mode: 0o755 });
execFileSync('git', ['init', '-q', REPO]);
execFileSync('git', ['-C', REPO, 'add', '.']);
execFileSync('git', [
  '-C',
  REPO,
  '-c',
  'user.name=t',
  '-c',
  'user.email=t@t',
  'commit',
  '-qm',
  'i',
]);

let numero = 0;
// One launch, on a ticket of its own: the options come before the four arguments of today, and
// `apres` after them.
function lancer(options: string[], apres: string[] = []) {
  const ticket = `demo-${++numero}`;
  const consigne = path.join(REPO, `${ticket}.txt`);
  writeFileSync(consigne, `TON TICKET : ${ticket} — un sujet.`);
  const r = spawnSync(
    'bash',
    [LAUNCHER, ...options, ticket, 'developpeur', 'packages/a', consigne, ...apres],
    {
      cwd: REPO,
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_BIN: FAUX, HOME },
    }
  );
  const copie = path.join(REPO, '.claude/worktrees', ticket);
  const fichier = path.join(copie, 'packages/a/args');
  const args = existsSync(fichier) ? readFileSync(fichier, 'utf8').split('\0').slice(0, -1) : null;
  return { r, copie, args, ticket };
}

// What claude receives today, for a ticket.
const AUJOURDHUI = (ticket: string) => [
  '-p',
  `TON TICKET : ${ticket} — un sujet.`,
  '--agent',
  'developpeur',
  '--permission-mode',
  'bypassPermissions',
];

// The value that follows a flag, each time it appears.
const valeurs = (args: string[], flag: string) =>
  args.flatMap((a, i) => (a === flag ? [args[i + 1]] : []));

// The arguments without the pairs --model <m> and --effort <e>.
const sansSurcharge = (args: string[]) =>
  args.filter(
    (a, i) => !['--model', '--effort'].includes(a) && !['--model', '--effort'].includes(args[i - 1])
  );

describe.runIf(canWrap)('the launcher and the model and level of a session', () => {
  it('critère 1 — --modele and --effort together launch the session with this model and this level', () => {
    const { r, args, ticket } = lancer(['--modele', 'opus', '--effort', 'high']);
    expect(r.status, r.stderr).toBe(0);
    expect(valeurs(args ?? [], '--model')).toEqual(['opus']);
    expect(valeurs(args ?? [], '--effort')).toEqual(['high']);
    expect(sansSurcharge(args ?? [])).toEqual(AUJOURDHUI(ticket));
  });
  it('critère 1 — the two options in the other order launch the same session', () => {
    const { r, args, ticket } = lancer(['--effort', 'high', '--modele', 'opus']);
    expect(r.status, r.stderr).toBe(0);
    expect(valeurs(args ?? [], '--model')).toEqual(['opus']);
    expect(valeurs(args ?? [], '--effort')).toEqual(['high']);
    expect(sansSurcharge(args ?? [])).toEqual(AUJOURDHUI(ticket));
  });
  it('critère 1 — --modele alone sets the model and leaves the level to the role', () => {
    const { r, args, ticket } = lancer(['--modele', 'haiku']);
    expect(r.status, r.stderr).toBe(0);
    expect(valeurs(args ?? [], '--model')).toEqual(['haiku']);
    expect(args).not.toContain('--effort');
    expect(sansSurcharge(args ?? [])).toEqual(AUJOURDHUI(ticket));
  });
  it('critère 1 — --effort alone sets the level and leaves the model to the role', () => {
    const { r, args, ticket } = lancer(['--effort', 'low']);
    expect(r.status, r.stderr).toBe(0);
    expect(valeurs(args ?? [], '--effort')).toEqual(['low']);
    expect(args).not.toContain('--model');
    expect(sansSurcharge(args ?? [])).toEqual(AUJOURDHUI(ticket));
  });
  it('critère 1 — a full model name goes to claude as written', () => {
    const { r, args } = lancer(['--modele', 'claude-sonnet-4-5']);
    expect(r.status, r.stderr).toBe(0);
    expect(valeurs(args ?? [], '--model')).toEqual(['claude-sonnet-4-5']);
  });
  for (const niveau of ['low', 'medium', 'high', 'xhigh', 'max']) {
    it(`critère 1 — the level ${niveau} goes to claude`, () => {
      const { r, args } = lancer(['--effort', niveau]);
      expect(r.status, r.stderr).toBe(0);
      expect(valeurs(args ?? [], '--effort')).toEqual([niveau]);
    });
  }

  it('critère 2 — without an option, claude receives the command of today: the role decides', () => {
    const { r, args, ticket } = lancer([]);
    expect(r.status, r.stderr).toBe(0);
    expect(args).toEqual(AUJOURDHUI(ticket));
  });

  it("critère 3 — an override goes to claude over the model and level of the role's definition", () => {
    // The definition says sonnet and medium; the session asks for opus and max.
    const { r, args } = lancer(['--modele', 'opus', '--effort', 'max']);
    expect(r.status, r.stderr).toBe(0);
    expect(valeurs(args ?? [], '--model')).toEqual(['opus']);
    expect(valeurs(args ?? [], '--effort')).toEqual(['max']);
    expect(args).not.toContain('sonnet');
    expect(args).not.toContain('medium');
  });
});

// A refusal comes before any preparation of the copy: exit CODE_USAGE, no copy, no log, no
// session. Each refused call stands next to the call it differs from, which launches.
describe('critère 4 — the launcher refuses a malformed option before preparing the copy', () => {
  const refuse = (options: string[]) => {
    const { r, copie } = lancer(options);
    expect(r.status, `${options.join(' ')}: ${r.stderr}`).toBe(CODE_USAGE);
    expect(existsSync(copie), options.join(' ')).toBe(false);
    expect(existsSync(`${copie}.log`), options.join(' ')).toBe(false);
  };
  const lance = (options: string[]) => {
    const { r, args } = lancer(options);
    expect(r.status, `${options.join(' ')}: ${r.stderr}`).toBe(0);
    expect(args).not.toBeNull();
  };

  it.runIf(canWrap)('critère 4 — a level outside low, medium, high, xhigh, max', () => {
    lance(['--effort', 'high']);
    for (const niveau of ['ultra', 'HIGH', 'minimal', 'medium ', '']) {
      refuse(['--effort', niveau]);
    }
  });
  it.runIf(canWrap)('critère 4 — a bad level beside a valid model', () => {
    lance(['--modele', 'opus', '--effort', 'xhigh']);
    refuse(['--modele', 'opus', '--effort', 'enorme']);
  });
  it.runIf(canWrap)('critère 4 — every level given is checked, a repeated one included', () => {
    // Arbitrage (2), cas 1: the repetition of critère 7 chooses only between valid levels.
    lance(['--effort', 'low', '--effort', 'high']);
    refuse(['--effort', 'ultra', '--effort', 'high']);
    lance(['--effort', 'low', '--modele', 'opus', '--effort', 'max']);
    refuse(['--effort', 'enorme', '--modele', 'opus', '--effort', 'max']);
  });
  it.runIf(canWrap)('critère 4 — an option without a value', () => {
    lance(['--modele', 'opus']);
    refuse(['--modele', '']);
    refuse(['--modele', '--effort', 'high']);
    refuse(['--effort', '--modele', 'opus']);
  });
  it('critère 4 — an option without a value, with nothing after it', () => {
    for (const option of ['--modele', '--effort']) {
      const r = spawnSync('bash', [LAUNCHER, option], { cwd: REPO, encoding: 'utf8' });
      expect(r.status, option).toBe(CODE_USAGE);
    }
  });
  it.runIf(canWrap)('critère 4 — an unknown option', () => {
    lance(['--modele', 'opus']);
    for (const inconnue of [
      ['--model', 'opus'],
      ['-m', 'opus'],
      ['--verbose'],
      ['--niveau', 'high'],
    ]) {
      refuse(inconnue);
    }
  });
});

describe('critère 5 — the header of the launcher', () => {
  // The header: the comment lines at the top of the script, before its first command.
  const entete = readFileSync(LAUNCHER, 'utf8')
    .split('\n')
    .slice(1)
    .filter((_, i, l) => l.slice(0, i + 1).every(x => x.startsWith('#')))
    .join('\n');
  it('critère 5 — names the two options and what each sets', () => {
    expect(entete).toMatch(/--modele/);
    expect(entete).toMatch(/--effort/);
    for (const niveau of ['low', 'medium', 'high', 'xhigh', 'max']) {
      expect(entete).toContain(niveau);
    }
  });
});

// The usage line of the launcher, with its two options.
const USAGE =
  'usage: lancer.sh [--modele <m>] [--effort <e>] <ticket> <rôle> <composant> <fichier de consigne>';

describe('critère 6 — the usage message shows the two options', () => {
  it('critère 6 — the usage line of the header shows the two options', () => {
    const texte = readFileSync(LAUNCHER, 'utf8');
    const entete = texte.slice(0, texte.search(/^[^#\n]/m));
    expect(entete).toContain(USAGE.replace('usage: ', ''));
  });
  it('critère 6 — a call without its four arguments prints the usage line', () => {
    for (const appel of [[], ['demo-x'], ['--modele', 'opus'], ['--effort']]) {
      const r = spawnSync('bash', [LAUNCHER, ...appel], { cwd: REPO, encoding: 'utf8' });
      expect(r.status, appel.join(' ')).toBe(CODE_USAGE);
      expect(r.stderr, appel.join(' ')).toContain(USAGE);
    }
  });
  it.runIf(canWrap)('critère 6 — a refused option prints the usage line', () => {
    // Arbitrage (2), cas 3: a refused level prints it too.
    for (const options of [
      ['--model', 'opus'],
      ['--verbose'],
      ['--modele', ''],
      ['--effort', 'ultra'],
      ['--modele', 'opus', '--effort', 'enorme'],
      ['--effort', 'ultra', '--effort', 'high'],
    ]) {
      const { r } = lancer(options);
      expect(r.status, options.join(' ')).toBe(CODE_USAGE);
      expect(r.stderr, options.join(' ')).toContain(USAGE);
    }
  });
});

// Each refused call stands next to the call it differs from, which launches.
describe.runIf(canWrap)('critère 7 — the form of the options', () => {
  const refuse = (options: string[], apres: string[] = []) => {
    const appel = [...options, '…', ...apres].join(' ');
    const { r, copie } = lancer(options, apres);
    expect(r.status, `${appel}: ${r.stderr}`).toBe(CODE_USAGE);
    expect(existsSync(copie), appel).toBe(false);
    expect(existsSync(`${copie}.log`), appel).toBe(false);
  };
  const lance = (options: string[]) => {
    const { r, args } = lancer(options);
    expect(r.status, `${options.join(' ')}: ${r.stderr}`).toBe(0);
    expect(args).not.toBeNull();
    return args ?? [];
  };

  it('critère 7 — an option in one word, --x=v, is refused', () => {
    lance(['--modele', 'opus', '--effort', 'high']);
    refuse(['--modele=opus']);
    refuse(['--effort=high']);
    refuse(['--modele=opus', '--effort', 'high']);
    refuse(['--modele', 'opus', '--effort=high']);
  });
  it('critère 7 — the separator -- is refused', () => {
    lance(['--modele', 'opus']);
    refuse(['--']);
    refuse(['--modele', 'opus', '--']);
    refuse(['--', '--modele', 'opus']);
  });
  it('critère 7 — an option after the four arguments is refused', () => {
    lance(['--modele', 'opus']);
    refuse([], ['--modele', 'opus']);
    refuse([], ['--effort', 'high']);
    refuse(['--modele', 'opus'], ['--effort', 'high']);
  });
  it('critère 7 — a repeated option keeps its last value', () => {
    const a = lance(['--modele', 'haiku', '--modele', 'opus']);
    expect(valeurs(a, '--model')).toEqual(['opus']);
    const b = lance(['--effort', 'low', '--effort', 'max']);
    expect(valeurs(b, '--effort')).toEqual(['max']);
    const c = lance([
      '--modele',
      'haiku',
      '--effort',
      'low',
      '--modele',
      'sonnet',
      '--effort',
      'xhigh',
    ]);
    expect(valeurs(c, '--model')).toEqual(['sonnet']);
    expect(valeurs(c, '--effort')).toEqual(['xhigh']);
  });
  it('critère 7 — any non-empty model goes to claude as written', () => {
    for (const modele of ['claude-opus-4-1[1m]', 'un modèle', 'inexistant', '*', 'x']) {
      expect(valeurs(lance(['--modele', modele]), '--model'), modele).toEqual([modele]);
    }
  });
});
