import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { CODE_USAGE } from '../../scripts/enveloppe/codes.mjs';
import { dossierDeTravail } from '../../scripts/enveloppe/enveloppe.mjs';
import { publie } from '../../scripts/langages/typescript/index-interfaces.mjs';
import { optionsDuRole } from '../../scripts/droits.mjs';
import { schemaDeFiche } from '../../scripts/resultats.mjs';

// Ticket grillhouse-3uv.46: the launcher takes a model and a reasoning level for one session
// (--modele, --effort) and hands them to claude (--model, --effort); without them, the role's
// definition decides. The trial repositories live outside /tmp, which the envelope replaces.
const ESSAIS = racineSousLaMaison('grillhouse-essais-lancer-modele-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const RACINE = path.resolve(__dirname, '../../../..');
const LAUNCHER = path.join(RACINE, 'packages/grillhouse/scripts/enveloppe/lancer.sh');
const SCRIPT = path.join(RACINE, 'packages/grillhouse/scripts/enveloppe/enveloppe.mjs');

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
// g provides d an interface, and declares for it names larger than Linux allows one argument
// (MAX_ARG_STRLEN, 128 KiB).
const NOMS_DE_G = Array.from({ length: 6000 }, (_, k) => `element_du_gros_composant_${k}`);
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
    ...NOMS_DE_G.map(n => `### \`${n}\`\n\nRend un élément du gros composant.\n`),
    '<!-- généré: fin -->',
    '',
    '## Consommateurs',
    '',
    `- \`d\` : ${NOMS_DE_G.join(', ')}`,
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
// It writes in the first package of the plan the envelope names (grillhouse-3uv.95.3).
writeFileSync(
  FAUX,
  '#!/bin/bash\nc=${GRILLHOUSE_ENVELOPPE%%:*}\nprintf "%s\\0" "$@" > "$c/args"\ncat > "$c/prompt"\n',
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

// The section the launcher writes after the instruction, for a: b's line, the names it declares
// for a, and the address of its rubric « Rend ».
const PUBLIE_POUR_A = [
  "## Ce que les composants d'avant publient",
  '',
  '`a` dépend de ces composants, et n’utilise d’eux que les éléments déclarés pour lui. Tous les éléments d’un composant, chacun avec sa phrase, sont dans `docs/agents/index-des-interfaces.md` ; un élément se lit en entier dans l’interface de son composant, à `<interface> § <son nom>`.',
  '',
  '### b',
  '',
  'B rend les durées. (`packages/b/docs/INTERFACE.md`)',
  'Déclaré pour `a` : duree.',
  'Son cadre rend : `packages/b/docs/CADRE.md` § 3. Rend.',
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

// The arguments claude receives today for <ticket>: the schema of the role's sheet and claude's
// JSON output, then the rights and the context of its role last (scripts/droits.mjs); the
// instruction is not among them.
const AUJOURDHUI = (ticket: string) => [
  '-p',
  '--agent',
  'developpeur',
  '--output-format',
  'json',
  '--json-schema',
  JSON.stringify(schemaDeFiche('developpeur')),
  '--permission-mode',
  'bypassPermissions',
  ...optionsDuRole('developpeur', {
    racine: REPO,
    copie: path.join(REPO, '.claude/worktrees', ticket),
    ticket,
    home: HOME,
  }),
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
    const { r, args, prompt, ticket } = lancer(['--modele', 'opus', '--effort', 'high']);
    expect(r.status, r.stderr).toBe(0);
    expect(valeurs(args ?? [], '--model')).toEqual(['opus']);
    expect(valeurs(args ?? [], '--effort')).toEqual(['high']);
    expect(sansSurcharge(args ?? [])).toEqual(AUJOURDHUI(ticket));
    expect(prompt).toBe(PROMPT(ticket));
  });
  it('critère 1 — the two options in the other order launch the same session', () => {
    const { r, args, prompt, ticket } = lancer(['--effort', 'high', '--modele', 'opus']);
    expect(r.status, r.stderr).toBe(0);
    expect(valeurs(args ?? [], '--model')).toEqual(['opus']);
    expect(valeurs(args ?? [], '--effort')).toEqual(['high']);
    expect(sansSurcharge(args ?? [])).toEqual(AUJOURDHUI(ticket));
    expect(prompt).toBe(PROMPT(ticket));
  });
  it('critère 1 — --modele alone sets the model and leaves the level to the role', () => {
    const { r, args, prompt, ticket } = lancer(['--modele', 'haiku']);
    expect(r.status, r.stderr).toBe(0);
    expect(valeurs(args ?? [], '--model')).toEqual(['haiku']);
    expect(args).not.toContain('--effort');
    expect(sansSurcharge(args ?? [])).toEqual(AUJOURDHUI(ticket));
    expect(prompt).toBe(PROMPT(ticket));
  });
  it('critère 1 — --effort alone sets the level and leaves the model to the role', () => {
    const { r, args, prompt, ticket } = lancer(['--effort', 'low']);
    expect(r.status, r.stderr).toBe(0);
    expect(valeurs(args ?? [], '--effort')).toEqual(['low']);
    expect(args).not.toContain('--model');
    expect(sansSurcharge(args ?? [])).toEqual(AUJOURDHUI(ticket));
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
    expect(args).toEqual(AUJOURDHUI(ticket));
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

// A relaunch of the circuit resumes the session of its agent: --seance <id> opens a session under
// that id (claude's --session-id), --reprise <id> resumes it (--resume), its instruction alone,
// since the session it resumes holds the sections the launcher adds.
describe.runIf(canWrap)('the launcher and the session of a relaunch', () => {
  const ID = '0b7c5f0e-6a1d-4c58-9d3e-2f4a8b9c1d2e';
  it('--seance <id> opens the session under that id, its instruction whole', () => {
    const { r, args, prompt, ticket } = lancer(['--seance', ID]);
    expect(r.status, r.stderr).toBe(0);
    expect(valeurs(args ?? [], '--session-id')).toEqual([ID]);
    expect(args).not.toContain('--resume');
    expect(prompt).toBe(PROMPT(ticket));
  });
  it('--reprise <id> resumes that session, its instruction alone', () => {
    const { r, args, prompt, ticket } = lancer(['--reprise', ID, '--modele', 'opus']);
    expect(r.status, r.stderr).toBe(0);
    expect(valeurs(args ?? [], '--resume')).toEqual([ID]);
    expect(valeurs(args ?? [], '--model')).toEqual(['opus']);
    expect(args).not.toContain('--session-id');
    expect(prompt).toBe(`TON TICKET : ${ticket} — un sujet.`);
  });
  it('refuses a session without its id, or both options together', () => {
    for (const options of [
      ['--seance', ''],
      ['--reprise', '--modele', 'opus'],
      ['--seance', ID, '--reprise', ID],
    ]) {
      const { r, copie } = lancer(options);
      expect(r.status, options.join(' ')).toBe(CODE_USAGE);
      expect(existsSync(copie), options.join(' ')).toBe(false);
    }
  });
});

// The instruction of the session carries what the components its component depends on publish,
// read in the copy from the `## Consommateurs` sections of their interfaces.
describe.runIf(canWrap)('the launcher and what the components before publish', () => {
  it('gives the session of a dependent component its provider, the names declared for it, and their addresses', () => {
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
  // grillhouse-3uv.95.6: one session works the whole plan of a ticket; the section gives, for
  // each package of the plan, what its providers publish to it.
  it('gives the session of a plan of two packages what the providers of each publish', () => {
    const ticket = `demo-${++numero}`;
    const consigne = path.join(REPO, `${ticket}.txt`);
    writeFileSync(consigne, `TON TICKET : ${ticket} — un sujet.`);
    const r = spawnSync(
      'bash',
      [LAUNCHER, '--paquets', 'packages/a:packages/d', ticket, 'developpeur', '.', consigne],
      { cwd: REPO, encoding: 'utf8', env: { ...process.env, CLAUDE_BIN: FAUX, HOME } }
    );
    const copie = path.join(REPO, '.claude/worktrees', ticket);
    expect(r.status, r.stderr).toBe(0);
    const prompt = readFileSync(path.join(copie, 'packages/a/prompt'), 'utf8');
    expect(prompt).toContain("## Ce que les composants d'avant publient");
    expect(prompt).toContain('### Pour `a`');
    expect(prompt).toContain('#### b');
    expect(prompt).toContain('Déclaré pour `a` : duree.');
    expect(prompt).toContain('### Pour `d`');
    expect(prompt).toContain('#### g');
    expect(prompt).toContain(`Déclaré pour \`d\` : ${NOMS_DE_G[0]}`);
    expect(prompt.indexOf('### Pour `a`')).toBeLessThan(prompt.indexOf('### Pour `d`'));
    expect(prompt).toBe(
      `TON TICKET : ${ticket} — un sujet.\n\n${publie(copie, 'packages/a:packages/d')}\n\n${TRAVAIL(ticket)}`
    );
  });
  // Witness: BPScript, a ticket across ten components, whose section held 127 KB on its own:
  // passed as one argument with the instruction, it went past the 128 KiB Linux allows one
  // (MAX_ARG_STRLEN), « Liste d'arguments trop longue ». It reaches claude on its standard input.
  it('gives the session an instruction larger than one argument allows, whole', () => {
    const { r, args, prompt, copie, ticket } = lancer([], [], 'packages/d');
    const journal = existsSync(`${copie}.log`) ? readFileSync(`${copie}.log`, 'utf8') : '';
    expect(r.status, `${r.stderr}\n${journal}`).toBe(0);
    expect(args).toEqual(AUJOURDHUI(ticket));
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
  'usage: npx grillhouse lancer [--modele <m>] [--effort <e>] [--seance <id> | --reprise <id>] [--paquets <liste>] <ticket> <rôle> <composant> <fichier de consigne>';

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
    mkdirSync(path.join(REPO, 'scripts', 'integration'), { recursive: true });
    mkdirSync(path.join(REPO, 'scripts', 'mesure'), { recursive: true });
    mkdirSync(path.join(REPO, 'scripts', 'enveloppe'), { recursive: true });
    for (const f of [
      'registre.mjs',
      'tableau.mjs',
      'bilan.mjs',
      'etapes.mjs',
      'avancement.mjs',
      'mesure/avancement.mjs',
      'mesure/pression.mjs',
      'verrou-de-machine.mjs',
      'enveloppe/paquets-du-plan.mjs',
      'verrou-de-fichier.mjs',
      'integration/verdict.mjs',
    ]) {
      execFileSync('cp', [
        path.join(RACINE, 'packages/grillhouse/scripts', f),
        path.join(REPO, 'scripts', f),
      ]);
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

// Witness: BPScript, whose chiefs named the folder of a package (`050-emitter`) instead of its
// path; the envelope refused it only after the whole copy was prepared and built, in the log. The
// launcher judges the component in the main tree, as it judges the role and the instruction.
describe('the launcher refuses a component that is not a path before preparing the copy', () => {
  const DEPOT = path.join(ESSAIS, 'depot-paquets');
  mkdirSync(path.join(DEPOT, 'packages/050-emitter/src'), { recursive: true });
  writeFileSync(
    path.join(DEPOT, 'package.json'),
    JSON.stringify({ name: 'essai', private: true, workspaces: ['packages/*'] })
  );
  writeFileSync(
    path.join(DEPOT, 'packages/050-emitter/package.json'),
    JSON.stringify({ name: '050-emitter' })
  );
  writeFileSync(path.join(DEPOT, 'packages/050-emitter/src/e.ts'), 'e');
  execFileSync('git', ['init', '-q', DEPOT]);
  execFileSync('git', ['-C', DEPOT, 'add', '.']);
  execFileSync('git', [
    '-C',
    DEPOT,
    '-c',
    'user.name=t',
    '-c',
    'user.email=t@t',
    'commit',
    '-qm',
    'i',
  ]);
  const lancerSur = (ticket: string, composant: string) => {
    const consigne = path.join(DEPOT, `${ticket}.txt`);
    writeFileSync(consigne, `TON TICKET : ${ticket} — un sujet.`);
    const r = spawnSync('bash', [LAUNCHER, ticket, 'developpeur', composant, consigne], {
      cwd: DEPOT,
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_BIN: '/bin/false', HOME },
    });
    return { r, copie: path.join(DEPOT, '.claude/worktrees', ticket) };
  };

  it('names the path of a package named by its folder, exit CODE_USAGE, no copy', () => {
    const { r, copie } = lancerSur('demo-dossier', '050-emitter');
    expect(r.status, r.stderr).toBe(CODE_USAGE);
    expect(r.stderr).toContain(
      "`050-emitter` n'est pas le chemin d'un composant ; écris `packages/050-emitter`"
    );
    expect(existsSync(copie)).toBe(false);
    expect(existsSync(`${copie}.log`)).toBe(false);
  });
  it('refuses a path that names nothing, exit CODE_USAGE, no copy', () => {
    const { r, copie } = lancerSur('demo-absent', 'packages/z');
    expect(r.status, r.stderr).toBe(CODE_USAGE);
    expect(r.stderr).toContain("n'existe pas");
    expect(existsSync(copie)).toBe(false);
    expect(existsSync(`${copie}.log`)).toBe(false);
  });
  // A relaunch: the developpeur after a testwriter that created the package in the ticket's copy.
  it.runIf(canWrap)(
    "judges the component in the ticket's copy when it exists, not in the main tree",
    () => {
      const ticket = 'demo-neuf';
      const copie = path.join(REPO, '.claude/worktrees', ticket);
      execFileSync('git', ['-C', REPO, 'worktree', 'add', '-q', '-b', `agent/${ticket}`, copie]);
      mkdirSync(path.join(copie, 'packages/neuf/src'), { recursive: true });
      writeFileSync(path.join(copie, 'packages/neuf/src/n.ts'), 'n');
      expect(existsSync(path.join(REPO, 'packages/neuf'))).toBe(false);
      const consigne = path.join(REPO, `${ticket}.txt`);
      writeFileSync(consigne, `TON TICKET : ${ticket} — un sujet.`);
      const r = spawnSync('bash', [LAUNCHER, ticket, 'developpeur', 'packages/neuf', consigne], {
        cwd: REPO,
        encoding: 'utf8',
        env: { ...process.env, CLAUDE_BIN: FAUX, HOME },
      });
      expect(r.stderr).not.toContain("n'existe pas");
      expect(r.status, r.stderr).toBe(0);
    },
    120_000
  );
  // A branch the queue sent back, without a copy: its lot created the package; main lacks it.
  it.runIf(canWrap)(
    "judges the component in the ticket's branch when it has no copy, not in the main tree",
    () => {
      const ticket = 'demo-renvoi';
      const ailleurs = path.join(ESSAIS, 'copie-renvoi');
      execFileSync('git', ['-C', REPO, 'worktree', 'add', '-q', '-b', `agent/${ticket}`, ailleurs]);
      mkdirSync(path.join(ailleurs, 'packages/neuf/src'), { recursive: true });
      writeFileSync(path.join(ailleurs, 'packages/neuf/src/n.ts'), 'n');
      execFileSync('git', ['-C', ailleurs, 'add', '.']);
      execFileSync('git', [
        '-C',
        ailleurs,
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@t',
        'commit',
        '-qm',
        'lot',
      ]);
      execFileSync('git', ['-C', REPO, 'worktree', 'remove', ailleurs]);
      const copie = path.join(REPO, '.claude/worktrees', ticket);
      expect(existsSync(copie)).toBe(false);
      expect(existsSync(path.join(REPO, 'packages/neuf'))).toBe(false);
      const consigne = path.join(REPO, `${ticket}.txt`);
      writeFileSync(consigne, `TON TICKET : ${ticket} — un sujet.`);
      const r = spawnSync('bash', [LAUNCHER, ticket, 'developpeur', 'packages/neuf', consigne], {
        cwd: REPO,
        encoding: 'utf8',
        env: { ...process.env, CLAUDE_BIN: FAUX, HOME },
      });
      expect(r.stderr).not.toContain("n'existe pas");
      expect(r.status, r.stderr).toBe(0);
    },
    120_000
  );
});

// The circuit (scripts/circuit.mjs) launches every session of a ticket in its copy and reads each
// end: the log of the ticket keeps every session, each under a header line (role, component,
// time), and the session's exit code lands in `<copie>.fin`, apart from the launcher's own codes.
describe.runIf(canWrap)('the launcher and the log and end of each session', () => {
  const ENTETE = /^=== \S+ · developpeur · packages\/a ===$/gm;
  const lancerSur = (ticket: string, claude: string) => {
    const consigne = path.join(REPO, `${ticket}.txt`);
    writeFileSync(consigne, `TON TICKET : ${ticket} — un sujet.`);
    return spawnSync('bash', [LAUNCHER, ticket, 'developpeur', 'packages/a', consigne], {
      cwd: REPO,
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_BIN: claude, HOME },
    });
  };
  it('adds each session to the log of the ticket, under its header line', () => {
    const ticket = 'demo-journal';
    const parle = path.join(REPO, 'faux-claude-parle.sh');
    writeFileSync(parle, '#!/bin/bash\necho "séance $$"\n', { mode: 0o755 });
    expect(lancerSur(ticket, parle).status).toBe(0);
    expect(lancerSur(ticket, parle).status).toBe(0);
    const journal = readFileSync(path.join(REPO, '.claude/worktrees', `${ticket}.log`), 'utf8');
    expect(journal.match(ENTETE)?.length, journal).toBe(2);
    expect(journal.match(/^séance \d+$/gm)?.length, journal).toBe(2);
  }, 120_000);
  it("writes the session's exit code to <copie>.fin", () => {
    const ticket = 'demo-fin';
    const sort = path.join(REPO, 'faux-claude-sort.sh');
    writeFileSync(sort, '#!/bin/bash\nexit 7\n', { mode: 0o755 });
    const fin = path.join(REPO, '.claude/worktrees', `${ticket}.fin`);
    expect(lancerSur(ticket, sort).status).toBe(7);
    expect(readFileSync(fin, 'utf8').trim()).toBe('7');
    expect(lancerSur(ticket, FAUX).status).toBe(0);
    expect(readFileSync(fin, 'utf8').trim()).toBe('0');
  }, 120_000);
  it('leaves no <copie>.fin when the launcher refuses before the session', () => {
    const ticket = 'demo-fin-refus';
    const r = spawnSync('bash', [LAUNCHER, ticket, 'developpeur', 'packages/z', '/dev/null'], {
      cwd: REPO,
      encoding: 'utf8',
    });
    expect(r.status).toBe(CODE_USAGE);
    expect(existsSync(path.join(REPO, '.claude/worktrees', `${ticket}.fin`))).toBe(false);
  });
});
