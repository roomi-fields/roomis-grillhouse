import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { CODE_USAGE } from '../../scripts/enveloppe/codes.mjs';
import { dossierDeTravail } from '../../scripts/enveloppe/enveloppe.mjs';
import { publie } from '../../scripts/index-interfaces.mjs';

// Ticket grillhouse-3uv.46: the launcher takes a model and a reasoning level for one session
// (--modele, --effort) and hands them to claude (--model, --effort); without them, the role's
// definition decides. The trial repositories live outside /tmp, which the envelope replaces.
const ESSAIS = racineSousLaMaison('grillhouse-essais-lancer-modele-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const RACINE = path.resolve(__dirname, '../..');
const LAUNCHER = path.join(RACINE, 'scripts/enveloppe/lancer.sh');
const SCRIPT = path.join(RACINE, 'scripts/enveloppe/enveloppe.mjs');

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
// for claude that records its arguments, one per NUL, and the prompt it reads on its standard
// input.
const REPO = path.join(ESSAIS, 'depot');
const HOME = path.join(ESSAIS, 'home');
mkdirSync(path.join(REPO, 'packages/a/src'), { recursive: true });
mkdirSync(path.join(REPO, '.claude/agents'), { recursive: true });
mkdirSync(HOME, { recursive: true });
writeFileSync(path.join(REPO, 'packages/a/src/a.ts'), 'a');
// g provides d an interface larger than Linux allows one argument (MAX_ARG_STRLEN, 128 KiB).
mkdirSync(path.join(REPO, 'packages/d/src'), { recursive: true });
writeFileSync(path.join(REPO, 'packages/d/src/d.ts'), 'd');
mkdirSync(path.join(REPO, 'packages/g/docs'), { recursive: true });
writeFileSync(
  path.join(REPO, 'packages/g/docs/INTERFACE.md'),
  [
    '# g',
    '',
    'G rend beaucoup.',
    '',
    '<!-- généré: début -->',
    '',
    ...Array.from(
      { length: 3000 },
      (_, k) => `### \`e${k}\`\n\nRend l’élément ${k} du gros composant, en battements.\n`
    ),
    '<!-- généré: fin -->',
    '',
    '## Consommateurs',
    '',
    '- `d` : *',
    '',
  ].join('\n')
);
// b provides a: its interface, with its generated part, declares a as consumer.
mkdirSync(path.join(REPO, 'packages/b/docs'), { recursive: true });
writeFileSync(
  path.join(REPO, 'packages/b/docs/INTERFACE.md'),
  [
    '# b',
    '',
    'B rend les durées.',
    '',
    '<!-- généré: début -->',
    '',
    '### `duree`',
    '',
    'Rend la durée d’un objet.',
    '',
    '<!-- généré: fin -->',
    '',
    '## Consommateurs',
    '',
    '- `a` : duree',
    '',
  ].join('\n')
);
writeFileSync(
  path.join(REPO, 'packages/b/docs/CADRE.md'),
  '# b — rendre les durées\n\n## 3. Rend\n\n- **R3.** La durée d’un objet.\n\n## 4. Connaît\n\n- **R4.** Le tempo.\n'
);
writeFileSync(
  path.join(REPO, '.claude/agents/developpeur.md'),
  '---\nname: developpeur\nmodel: sonnet\neffort: medium\n---\n'
);
installerEnveloppe(REPO);
const FAUX = path.join(REPO, 'faux-claude.sh');
// It writes in the component of the session, the one the envelope leaves writable.
writeFileSync(
  FAUX,
  '#!/bin/bash\nfor c in a b d; do\n  if printf "%s\\0" "$@" 2>/dev/null > packages/$c/args; then cat > packages/$c/prompt; break; fi\ndone\n',
  { mode: 0o755 }
);
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
function lancer(options: string[], apres: string[] = [], composant = 'packages/a') {
  const ticket = `demo-${++numero}`;
  const consigne = path.join(REPO, `${ticket}.txt`);
  writeFileSync(consigne, `TON TICKET : ${ticket} — un sujet.`);
  const r = spawnSync(
    'bash',
    [LAUNCHER, ...options, ticket, 'developpeur', composant, consigne, ...apres],
    {
      cwd: REPO,
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_BIN: FAUX, HOME },
    }
  );
  const copie = path.join(REPO, '.claude/worktrees', ticket);
  const fichier = path.join(copie, composant, 'args');
  const args = existsSync(fichier) ? readFileSync(fichier, 'utf8').split('\0').slice(0, -1) : null;
  const recu = path.join(copie, composant, 'prompt');
  const prompt = existsSync(recu) ? readFileSync(recu, 'utf8') : null;
  return { r, copie, args, prompt, ticket };
}

// The section the launcher writes after the instruction, for a: what b publishes, and its rubric
// « Rend ».
const PUBLIE_POUR_A = [
  "## Ce que les composants d'avant publient",
  '',
  '`a` dépend de ces composants ; chaque élément publié se lit dans l’interface de son fournisseur.',
  '',
  '### b',
  '',
  'B rend les durées. Chaque élément se lit à `packages/b/docs/INTERFACE.md` § <son nom>.',
  'Déclaré pour `a` : duree.',
  '',
  '- `duree` — Rend la durée d’un objet.',
  '',
  'Son cadre rend (`packages/b/docs/CADRE.md` § 3. Rend) :',
  '',
  '- **R3.** La durée d’un objet.',
].join('\n');

// The section the launcher writes last: the session's working directory, in its copy's
// scratchpads.
const TRAVAIL = (ticket: string) =>
  [
    '## Ton dossier de travail',
    '',
    `Tout fichier temporaire s'écrit dans \`${dossierDeTravail(path.join(REPO, '.claude/worktrees', ticket))}\`, que \`$TMPDIR\` nomme aussi.`,
  ].join('\n');

// The prompt claude reads on its standard input, for a ticket.
const PROMPT = (ticket: string) =>
  `TON TICKET : ${ticket} — un sujet.\n\n${PUBLIE_POUR_A}\n\n${TRAVAIL(ticket)}`;

// The arguments claude receives today: the instruction is not among them.
const AUJOURDHUI = ['-p', '--agent', 'developpeur', '--permission-mode', 'bypassPermissions'];

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
    const { r, args, prompt, ticket } = lancer(['--modele', 'opus', '--effort', 'high']);
    expect(r.status, r.stderr).toBe(0);
    expect(valeurs(args ?? [], '--model')).toEqual(['opus']);
    expect(valeurs(args ?? [], '--effort')).toEqual(['high']);
    expect(sansSurcharge(args ?? [])).toEqual(AUJOURDHUI);
    expect(prompt).toBe(PROMPT(ticket));
  });
  it('critère 1 — the two options in the other order launch the same session', () => {
    const { r, args, prompt, ticket } = lancer(['--effort', 'high', '--modele', 'opus']);
    expect(r.status, r.stderr).toBe(0);
    expect(valeurs(args ?? [], '--model')).toEqual(['opus']);
    expect(valeurs(args ?? [], '--effort')).toEqual(['high']);
    expect(sansSurcharge(args ?? [])).toEqual(AUJOURDHUI);
    expect(prompt).toBe(PROMPT(ticket));
  });
  it('critère 1 — --modele alone sets the model and leaves the level to the role', () => {
    const { r, args, prompt, ticket } = lancer(['--modele', 'haiku']);
    expect(r.status, r.stderr).toBe(0);
    expect(valeurs(args ?? [], '--model')).toEqual(['haiku']);
    expect(args).not.toContain('--effort');
    expect(sansSurcharge(args ?? [])).toEqual(AUJOURDHUI);
    expect(prompt).toBe(PROMPT(ticket));
  });
  it('critère 1 — --effort alone sets the level and leaves the model to the role', () => {
    const { r, args, prompt, ticket } = lancer(['--effort', 'low']);
    expect(r.status, r.stderr).toBe(0);
    expect(valeurs(args ?? [], '--effort')).toEqual(['low']);
    expect(args).not.toContain('--model');
    expect(sansSurcharge(args ?? [])).toEqual(AUJOURDHUI);
    expect(prompt).toBe(PROMPT(ticket));
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
    const { r, args, prompt, ticket } = lancer([]);
    expect(r.status, r.stderr).toBe(0);
    expect(args).toEqual(AUJOURDHUI);
    expect(prompt).toBe(PROMPT(ticket));
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

// The instruction of the session carries what the components its component depends on publish,
// read in the copy from the `## Consommateurs` sections of their interfaces.
describe.runIf(canWrap)('the launcher and what the components before publish', () => {
  it('gives the session of a dependent component the elements of its provider, at their address', () => {
    const { r, prompt, ticket } = lancer([]);
    expect(r.status, r.stderr).toBe(0);
    expect(prompt).toBe(PROMPT(ticket));
  });
  it('tells the session of a component without provider, in one line, that it depends on none', () => {
    const { r, prompt, ticket } = lancer([], [], 'packages/b');
    expect(r.status, r.stderr).toBe(0);
    expect(prompt).toBe(
      `TON TICKET : ${ticket} — un sujet.\n\n## Ce que les composants d'avant publient\n\n` +
        '`b` ne dépend d’aucun composant : aucune section « Consommateurs » ne le nomme.\n\n' +
        TRAVAIL(ticket)
    );
  });
  // Witness: BPScript, a ticket across ten components, whose section held 127 KB on its own:
  // passed as one argument with the instruction, it went past the 128 KiB Linux allows one
  // (MAX_ARG_STRLEN), « Liste d'arguments trop longue ». It reaches claude on its standard input.
  it('gives the session an instruction larger than one argument allows, whole', () => {
    const { r, args, prompt, copie, ticket } = lancer([], [], 'packages/d');
    const journal = existsSync(`${copie}.log`) ? readFileSync(`${copie}.log`, 'utf8') : '';
    expect(r.status, `${r.stderr}\n${journal}`).toBe(0);
    expect(args).toEqual(AUJOURDHUI);
    const section = publie(copie, 'packages/d');
    expect(Buffer.byteLength(section)).toBeGreaterThan(128 * 1024);
    expect(prompt).toBe(`TON TICKET : ${ticket} — un sujet.\n\n${section}\n\n${TRAVAIL(ticket)}`);
  });
});

// The instruction names the session's working directory, the one the envelope gives as TMPDIR.
describe.runIf(canWrap)("the launcher and the session's working directory", () => {
  it('names the working directory of the copy after what the components before publish', () => {
    const { r, prompt, copie } = lancer([]);
    expect(r.status, r.stderr).toBe(0);
    const travail = dossierDeTravail(copie);
    expect(prompt).toContain(
      `## Ton dossier de travail\n\nTout fichier temporaire s'écrit dans \`${travail}\``
    );
    expect(prompt?.indexOf('## Ton dossier de travail')).toBeGreaterThan(
      prompt?.indexOf("## Ce que les composants d'avant publient") ?? Infinity
    );
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

// The register line of an enveloped session is written by the launcher once the envelope has
// ended (scripts/registre.mjs --copie), whatever the envelope's exit code.
describe.runIf(canWrap)('the launcher and the register line of a session that fails', () => {
  const REGISTRE = path.join(ESSAIS, 'registre.jsonl');
  const ECHEC = path.join(REPO, 'faux-claude-echec.sh');
  it('writes the line of a session whose envelope exits in error, and keeps its exit code', () => {
    // registre.mjs and what it imports, as the test repository holds them.
    for (const f of ['registre.mjs', 'tableau.mjs', 'verrou-de-fichier.mjs']) {
      execFileSync('cp', [path.join(RACINE, 'scripts', f), path.join(REPO, 'scripts', f)]);
    }
    // A stand-in for claude that leaves a transcript in its project directory, then fails.
    writeFileSync(
      ECHEC,
      [
        '#!/bin/bash',
        'd="$HOME/.claude/projects/$(pwd | sed "s/[^A-Za-z0-9]/-/g")"',
        'mkdir -p "$d"',
        'printf \'%s\\n\' \'{"type":"user","timestamp":"2026-10-14T10:00:00Z","message":{"content":"TON TICKET : demo-echec — x"}}\' \'{"type":"assistant","timestamp":"2026-10-14T10:01:00Z","message":{"id":"m","usage":{"input_tokens":5,"output_tokens":5}}}\' > "$d/s-echec.jsonl"',
        'exit 3',
        '',
      ].join('\n'),
      { mode: 0o755 }
    );
    const consigne = path.join(REPO, 'demo-echec.txt');
    writeFileSync(consigne, 'TON TICKET : demo-echec — un sujet.');
    const r = spawnSync('bash', [LAUNCHER, 'demo-echec', 'developpeur', 'packages/a', consigne], {
      cwd: REPO,
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_BIN: ECHEC, HOME, GRILLHOUSE_REGISTRE: REGISTRE },
    });
    expect(r.status, r.stderr).toBe(3);
    const lignes = existsSync(REGISTRE)
      ? readFileSync(REGISTRE, 'utf8').trim().split('\n').filter(Boolean)
      : [];
    expect(lignes.map(l => (JSON.parse(l) as { agent: string }).agent)).toContain('s-echec');
  }, 120_000);
});
