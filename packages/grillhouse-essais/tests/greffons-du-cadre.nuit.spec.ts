import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  type AppelClaude,
  type EtatClaude,
  cheminSysteme,
  claudeSubstitut,
  configGit,
  declarerLesLangages,
  sansClaude,
} from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { RACINE } from './cadre.js';

// grillhouse-3uv.71: the nominal configuration. The frame's plugins are listed once, in
// `enabledPlugins` (and `extraKnownMarketplaces`) of the project's `.claude/settings.json`. One
// mechanism, scripts/greffons.mjs, installs them for the project — `node scripts/greffons.mjs
// [<project>]`, the current directory by default — after adding each absent marketplace; the
// preparation (scripts/preparation.mjs, which `grillhouse init` runs) and the update of the frame
// (scripts/grillhouse-maj.mjs) call it;
// the session start (scripts/session-start.sh) names under « Manque » each declared plugin not
// installed for the project. No test launches the real claude (critère 6): a stand-in
// on the PATH records each call (packages/grillhouse-matiere/src/claude-substitut.ts).

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'greffons-du-cadre-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const DEPOT = RACINE;
const GREFFONS = path.join(DEPOT, 'packages/grillhouse/scripts/greffons.mjs');
const MAJ = path.join(DEPOT, 'packages/grillhouse/scripts/grillhouse-maj.mjs');
const SESSION = path.join(DEPOT, 'packages/grillhouse/scripts/session-start.sh');

// The frame's list, as .claude/settings.json of Grillhouse holds it (2026-10-12).
const MATT = 'mattpocock-skills@claude-plugins-official';
const RTFM = 'rtfm@roomi-fields';
const GRILL = 'grillhouse@roomi-fields';
const SOURCE_ROOMI = 'roomi-fields/claude-plugins';
const REGLAGES_DU_CADRE = {
  enabledPlugins: { [MATT]: true, [RTFM]: true, [GRILL]: true },
  extraKnownMarketplaces: {
    'roomi-fields': { source: { source: 'github', repo: SOURCE_ROOMI } },
  },
};
// The name Claude Code gives the marketplace added from its source.
const NOMS = { [SOURCE_ROOMI]: 'roomi-fields' };

// Another list of the same kind: another marketplace, another plugin of the official one.
const ALPHA = 'alpha@atelier';
const BETA = 'beta@claude-plugins-official';
const SOURCE_ATELIER = 'quelquun/atelier-greffons';
const AUTRES_REGLAGES = {
  permissions: { allow: ['Bash(ls)'] },
  enabledPlugins: { [ALPHA]: true, [BETA]: true },
  extraKnownMarketplaces: { atelier: { source: { source: 'github', repo: SOURCE_ATELIER } } },
};
const AUTRES_NOMS = { [SOURCE_ATELIER]: 'atelier' };

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const ecrireReglages = (racine: string, reglages: object) =>
  ecrire(racine, '.claude/settings.json', `${JSON.stringify(reglages, null, 2)}\n`);

// A directory of its own for one trial.
const dossier = (prefixe: string) => mkdtempSync(path.join(ESSAIS, `${prefixe}-`));

// A project directory holding the given settings.
function projet(reglages: object | null = REGLAGES_DU_CADRE) {
  const p = dossier('projet');
  if (reglages) {
    ecrireReglages(p, reglages);
  }
  return p;
}

// The installs and marketplace adds among the calls.
const installs = (appels: AppelClaude[]) =>
  appels.filter(a => a.argv[0] === 'plugin' && (a.argv[1] === 'install' || a.argv[1] === 'i'));
const ajouts = (appels: AppelClaude[]) =>
  appels.filter(a => a.argv[0] === 'plugin' && a.argv[1] === 'marketplace' && a.argv[2] === 'add');
const installes = (appels: AppelClaude[]) =>
  installs(appels)
    .map(a => a.argv[2])
    .sort();

// The scope an install call asks for.
const portee = (a: AppelClaude) => {
  const i = a.argv.findIndex(x => x === '--scope' || x === '-s');
  if (i >= 0) {
    return a.argv[i + 1];
  }
  return a.argv.find(x => x.startsWith('--scope='))?.slice('--scope='.length);
};

// The environment of a command: the given directories first, then the system's; a home of its own;
// the git settings of the suite.
const env = (...dossiers: string[]): NodeJS.ProcessEnv => ({
  PATH: cheminSysteme(...dossiers),
  HOME: dossier('maison'),
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
  ...configGit(),
});

// scripts/greffons.mjs run on the project, from another directory, the stand-in on the PATH.
function installer(p: string, etat: EtatClaude = { noms: NOMS }) {
  const claude = claudeSubstitut(dossier('claude'), etat);
  const r = spawnSync(process.execPath, [GREFFONS, p], {
    cwd: dossier('ailleurs'),
    encoding: 'utf8',
    env: env(claude.bin),
    timeout: 60_000,
  });
  return { ...r, sortie: `${r.stdout}\n${r.stderr}`, claude };
}

// The tools the preparation calls, stood in: Beads, CodeGraph, npm. None installs anything.
function outilsDeLaPreparation() {
  const bin = dossier('outils');
  const outil = (nom: string, corps: string) =>
    writeFileSync(path.join(bin, nom), `#!/bin/sh\n${corps}\n`, { mode: 0o755 });
  outil('bd', 'case "$1" in\n  config) echo demo;;\n  init) mkdir -p .beads;;\nesac\nexit 0');
  outil('codegraph', '[ "$1" = init ] && mkdir -p "$2/.codegraph"\nexit 0');
  outil('npm', 'exit 0');
  return bin;
}

// A project ready for the preparation: a package.json.
function projetAPreparer(reglages: object = REGLAGES_DU_CADRE) {
  const p = projet(reglages);
  writeFileSync(path.join(p, 'package.json'), '{"name":"p"}\n');
  return p;
}

// The preparation of a project (scripts/preparation.mjs, which `grillhouse init` runs), run in
// <cwd> with <env>: its lines of failure on the error output, the exit code 1 when there are some.
const PREPARATION = path.join(DEPOT, 'packages/grillhouse/scripts/preparation.mjs');
const lancerLaPreparation = (cwd: string, env: NodeJS.ProcessEnv) =>
  spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { preparer } from ${JSON.stringify(pathToFileURL(PREPARATION).href)};
const l = preparer(process.cwd());
for (const x of l) console.error(x);
if (l.length > 0) process.exitCode = 1;`,
    ],
    { cwd, encoding: 'utf8', env, timeout: 120_000 }
  );

// The preparation run on the project; `claude`: the stand-in's bin, or a bin without claude.
function preparer(p: string, binClaude: string) {
  const r = lancerLaPreparation(p, env(outilsDeLaPreparation(), binClaude));
  return { ...r, sortie: `${r.stdout}\n${r.stderr}` };
}

// npm run grillhouse:maj in the project, with the given bin; grillhouse-ca7: the project, of
// TypeScript, has its package.json, and its architecture where it declares its language.
function mettreAJourProjet(p: string, binClaude: string) {
  if (!existsSync(path.join(p, 'package.json'))) {
    writeFileSync(path.join(p, 'package.json'), '{"name":"p"}\n');
    declarerLesLangages(p);
  }
  const r = spawnSync(process.execPath, [MAJ], {
    cwd: p,
    encoding: 'utf8',
    env: env(binClaude),
    timeout: 60_000,
  });
  return { ...r, sortie: `${r.stdout}\n${r.stderr}` };
}

// The command that installs a plugin for the project, as Claude Code itself names it.
const commande = (id: string) => `claude plugin install ${id} --scope project`;

// A line of the output naming the plugin and the command that installs it.
const ligneQuiNomme = (sortie: string, id: string) =>
  sortie.split('\n').find(l => l.includes(id) && l.includes(commande(id)));

// The non-comment lines of a script.
const lignesDeCode = (texte: string) =>
  texte.split('\n').filter(l => !/^\s*(#|\/\/|\*|\/\*)/.test(l));
function fichiersDeScripts(d: string): string[] {
  return readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      return fichiersDeScripts(p);
    }
    return /\.(sh|bash|mjs|js|cjs)$/.test(e.name) ? [p] : [];
  });
}
// A line that runs `claude plugin install` or `claude plugin marketplace add`: in a shell command,
// or as the arguments of a process launched from JavaScript.
const LANCE_EN_SHELL =
  /(^|[;&|(]|\$\(|\bthen\b|\bdo\b|\|\||&&)\s*claude\s+plugin\s+(install|i|marketplace\s+add)\b/;
const LANCE_EN_JS = /['"`]claude['"`]\s*,\s*\[\s*['"`]plugin['"`]/;

describe('grillhouse-3uv.71 critère 1 — one mechanism installs the declared plugins for the project', () => {
  it('critère 1: each plugin at true is installed with --scope project, from the project, after its absent marketplace is added', () => {
    const p = projet();
    const r = installer(p);
    expect(r.status, r.sortie).toBe(0);
    const appels = r.claude.appels();
    expect(installes(appels)).toEqual([GRILL, MATT, RTFM].sort());
    for (const a of installs(appels)) {
      expect(portee(a), a.argv.join(' ')).toBe('project');
      expect(a.cwd, a.argv.join(' ')).toBe(p);
    }
    expect(ajouts(appels).map(a => a.argv[3])).toEqual([SOURCE_ROOMI]);
  });
  it('critère 1: another list of the same kind — another marketplace, another official plugin', () => {
    const p = projet(AUTRES_REGLAGES);
    const r = installer(p, { noms: AUTRES_NOMS });
    expect(r.status, r.sortie).toBe(0);
    const appels = r.claude.appels();
    expect(installes(appels)).toEqual([ALPHA, BETA].sort());
    expect(installs(appels).every(a => portee(a) === 'project' && a.cwd === p)).toBe(true);
    expect(ajouts(appels).map(a => a.argv[3])).toEqual([SOURCE_ATELIER]);
  });
  it('critère 1: the marketplace is added before any plugin of it is installed', () => {
    const r = installer(projet());
    const appels = r.claude.appels();
    const ajout = appels.findIndex(a => ajouts([a]).length === 1);
    expect(ajout, JSON.stringify(appels)).toBeGreaterThanOrEqual(0);
    for (const id of [RTFM, GRILL]) {
      const i = appels.findIndex(a => installs([a]).length === 1 && a.argv[2] === id);
      expect(i, `${id}\n${JSON.stringify(appels)}`).toBeGreaterThan(ajout);
    }
  });
  it('critère 1: the preparation (scripts/preparation.mjs) installs the declared plugins for the project', () => {
    const p = projetAPreparer();
    const claude = claudeSubstitut(dossier('claude'), { noms: NOMS });
    const r = preparer(p, claude.bin);
    expect(r.status, r.sortie).toBe(0);
    const appels = claude.appels();
    expect(installes(appels)).toEqual([GRILL, MATT, RTFM].sort());
    expect(installs(appels).every(a => portee(a) === 'project' && a.cwd === p)).toBe(true);
  });
  it('critère 1: the update of the frame (npm run grillhouse:maj) installs the plugins the project declares, for the project', () => {
    const p = projet(AUTRES_REGLAGES);
    const claude = claudeSubstitut(dossier('claude'), { noms: { ...AUTRES_NOMS, ...NOMS } });
    const r = mettreAJourProjet(p, claude.bin);
    expect(r.status, r.sortie).toBe(0);
    const appels = claude.appels();
    // The frame's plugin, which the update declares (grillhouse-3uv.84.7), with them.
    expect(installes(appels)).toEqual([ALPHA, BETA, GRILL].sort());
    expect(installs(appels).every(a => portee(a) === 'project' && a.cwd === p)).toBe(true);
  });
  it('critère 1: no script of scripts/ other than scripts/greffons.mjs installs a plugin or adds a marketplace', () => {
    expect(existsSync(GREFFONS), 'scripts/greffons.mjs is missing').toBe(true);
    const porteurs = fichiersDeScripts(path.join(DEPOT, 'packages/grillhouse/scripts'))
      .filter(f => f !== GREFFONS)
      .filter(f =>
        lignesDeCode(readFileSync(f, 'utf8')).some(
          l => LANCE_EN_SHELL.test(l) || LANCE_EN_JS.test(l)
        )
      )
      .map(f => path.relative(DEPOT, f));
    expect(porteurs).toEqual([]);
  });
});

describe('grillhouse-3uv.71 critère 2 — idempotent: what is there is not installed again', () => {
  it('critère 2: every plugin installed for the project and the marketplace known: no install, no add', () => {
    const p = projet();
    const r = installer(p, {
      noms: NOMS,
      marches: ['claude-plugins-official', 'roomi-fields'],
      plugins: [
        { id: RTFM, scope: 'user', enabled: true },
        { id: GRILL, scope: 'local', enabled: true, projectPath: p },
        { id: MATT, scope: 'project', enabled: true, projectPath: p },
      ],
    });
    expect(r.status, r.sortie).toBe(0);
    expect(installs(r.claude.appels())).toEqual([]);
    expect(ajouts(r.claude.appels())).toEqual([]);
  });
  it('critère 2: one plugin already installed for the project: only the others are installed', () => {
    const p = projet();
    const r = installer(p, {
      noms: NOMS,
      marches: ['claude-plugins-official', 'roomi-fields'],
      plugins: [{ id: GRILL, scope: 'local', enabled: true, projectPath: p }],
    });
    expect(r.status, r.sortie).toBe(0);
    expect(installes(r.claude.appels())).toEqual([MATT, RTFM].sort());
    expect(ajouts(r.claude.appels())).toEqual([]);
  });
  it('critère 2: replayed after a first installation, the mechanism installs and adds nothing', () => {
    const p = projet();
    const premier = installer(p);
    expect(premier.status, premier.sortie).toBe(0);
    const etat = premier.claude.etat();
    const second = installer(p, etat);
    expect(second.status, second.sortie).toBe(0);
    expect(installs(second.claude.appels())).toEqual([]);
    expect(ajouts(second.claude.appels())).toEqual([]);
  });
});

describe('grillhouse-3uv.71 critère 3 — a plugin at false, or not listed, is not installed', () => {
  it('critère 3: a plugin declared at false is not installed, the others are', () => {
    const p = projet({
      ...REGLAGES_DU_CADRE,
      enabledPlugins: { [MATT]: true, [RTFM]: false, [GRILL]: true },
    });
    const r = installer(p);
    expect(r.status, r.sortie).toBe(0);
    expect(installes(r.claude.appels())).toEqual([GRILL, MATT].sort());
  });
  it('critère 3: settings without enabledPlugins install no plugin', () => {
    const p = projet({ permissions: { allow: [] } });
    const r = installer(p);
    expect(r.status, r.sortie).toBe(0);
    expect(installs(r.claude.appels())).toEqual([]);
  });
});

describe('grillhouse-3uv.71 critère 4 — without claude, or on a failed install, a line names the plugin and its command', () => {
  it('critère 4: the preparation without the claude command names each plugin with its command, and exits non-zero', () => {
    const p = projetAPreparer();
    const r = preparer(p, sansClaude(dossier('sans-claude')));
    expect(r.status, r.sortie).not.toBe(0);
    for (const id of [MATT, RTFM, GRILL]) {
      expect(ligneQuiNomme(r.sortie, id), `${id}\n${r.sortie}`).toBeDefined();
    }
  });
  it('critère 4: the preparation whose install of one plugin fails names it with its command, and exits non-zero', () => {
    const p = projetAPreparer();
    const claude = claudeSubstitut(dossier('claude'), { noms: NOMS, echecsInstall: [RTFM] });
    const r = preparer(p, claude.bin);
    expect(r.status, r.sortie).not.toBe(0);
    expect(ligneQuiNomme(r.sortie, RTFM), r.sortie).toBeDefined();
  });
  it('critère 4: the update without the claude command finishes its work, then exits non-zero naming each plugin with its command', () => {
    const p = projet(AUTRES_REGLAGES);
    const r = mettreAJourProjet(p, sansClaude(dossier('sans-claude')));
    expect(r.status, r.sortie).not.toBe(0);
    expect(r.sortie).toMatch(/^Cadre /);
    const reglages = JSON.parse(readFileSync(path.join(p, '.claude/settings.json'), 'utf8')) as {
      enabledPlugins?: Record<string, boolean>;
    };
    // The update declares the frame's plugin (grillhouse-3uv.84.7) beside them.
    expect(reglages.enabledPlugins).toEqual({ ...AUTRES_REGLAGES.enabledPlugins, [GRILL]: true });
    for (const id of [ALPHA, BETA]) {
      expect(ligneQuiNomme(r.sortie, id), `${id}\n${r.sortie}`).toBeDefined();
    }
  });
  it('critère 4: the update whose install of one plugin fails finishes its work, then exits non-zero naming it with its command', () => {
    const p = projet(AUTRES_REGLAGES);
    const claude = claudeSubstitut(dossier('claude'), { noms: AUTRES_NOMS, echecsInstall: [BETA] });
    const r = mettreAJourProjet(p, claude.bin);
    expect(r.status, r.sortie).not.toBe(0);
    expect(r.sortie).toMatch(/^Cadre /);
    expect(ligneQuiNomme(r.sortie, BETA), r.sortie).toBeDefined();
  });
});

// The session start in a project tree: the frame's scripts, its settings, its dependencies.
function projetOuvert(reglages: object = REGLAGES_DU_CADRE) {
  const p = projet(reglages);
  symlinkSync(path.join(DEPOT, 'packages/grillhouse/scripts'), path.join(p, 'scripts'));
  mkdirSync(path.join(p, 'node_modules'));
  return p;
}
const bdVide = (() => {
  const bin = mkdtempSync(path.join(ESSAIS, 'bd-'));
  writeFileSync(path.join(bin, 'bd'), '#!/bin/sh\necho "[]"\n', { mode: 0o755 });
  return bin;
})();
function ouvrirAvec(p: string, bin: string) {
  const r = spawnSync('bash', [SESSION], {
    cwd: dossier('ailleurs'),
    encoding: 'utf8',
    env: { ...env(bin, bdVide), CLAUDE_PROJECT_DIR: p },
    timeout: 30_000,
  });
  expect(r.error, 'la séance a gelé').toBeUndefined();
  expect(r.status, r.stderr).toBe(0);
  return r.stdout;
}
function ouvrir(p: string, etat: EtatClaude) {
  const claude = claudeSubstitut(dossier('claude'), etat);
  return { sortie: ouvrirAvec(p, claude.bin), claude };
}
// The items of the list « Pas encore renseignés », one per « - » line.
const elements = (sortie: string) =>
  (sortie.split('Pas encore renseignés :\n')[1] ?? '')
    .split('\n')
    .filter(l => l.startsWith('- '))
    .map(l => l.slice(2));
const nomme = (sortie: string, id: string) => sortie.includes(id);
// The line « Manque : … », which gives the command `npx grillhouse maj`.
const ligneManque = (sortie: string) => sortie.split('\n').find(l => l.startsWith('Manque : '));
// The plugin is named under « Manque », whose line gives `npx grillhouse maj`.
function manqueLeGreffon(sortie: string, id: string) {
  const l = ligneManque(sortie);
  expect(l, `${id}\n${sortie}`).toBeDefined();
  expect(l, sortie).toContain(`le greffon ${id}`);
  expect(l, sortie).toContain('npx grillhouse maj');
  expect(
    elements(sortie).filter(e => e.includes(id)),
    sortie
  ).toEqual([]);
}
const nommeCommeManquant = (sortie: string, id: string) =>
  (ligneManque(sortie) ?? '').includes(`le greffon ${id}`);

// Critère 5 as the supervisor rewrote it (ticket comment « Arbitrage du superviseur — critère 5 »):
// each declared plugin not installed for the project goes under « Manque » (« le greffon <id> »),
// whose line gives `npx grillhouse maj`; without claude, « la commande claude »; « Pas encore
// renseignés » names no plugin.
describe('grillhouse-3uv.71 critère 5 — the session start names under « Manque » each declared plugin not installed for the project', () => {
  it('critère 5: one plugin installed for another project only is « le greffon <id> » under « Manque », with npx grillhouse maj; the installed ones are not named', () => {
    const p = projetOuvert();
    const { sortie } = ouvrir(p, {
      marches: ['claude-plugins-official', 'roomi-fields'],
      plugins: [
        { id: RTFM, scope: 'user', enabled: true },
        { id: GRILL, scope: 'local', enabled: true, projectPath: p },
        { id: MATT, scope: 'project', enabled: true, projectPath: '/home/quelquun/autre-projet' },
      ],
    });
    manqueLeGreffon(sortie, MATT);
    expect(nomme(sortie, RTFM), sortie).toBe(false);
    expect(nomme(sortie, GRILL), sortie).toBe(false);
  });
  it('critère 5: no plugin installed: each plugin of another list is under « Manque »', () => {
    const p = projetOuvert(AUTRES_REGLAGES);
    const { sortie } = ouvrir(p, {});
    for (const id of [ALPHA, BETA]) {
      manqueLeGreffon(sortie, id);
    }
  });
  it('critère 5: « Pas encore renseignés » names no plugin, even when every plugin is missing', () => {
    const p = projetOuvert();
    const { sortie } = ouvrir(p, {});
    for (const id of [MATT, RTFM, GRILL]) {
      expect(
        elements(sortie).filter(e => e.includes(id)),
        `${id}\n${sortie}`
      ).toEqual([]);
    }
    expect(
      elements(sortie).filter(e => /greffon/i.test(e)),
      sortie
    ).toEqual([]);
  });
  it('critère 5: every plugin installed for the project: none is named, no plugin command is given', () => {
    const p = projetOuvert();
    const { sortie } = ouvrir(p, {
      marches: ['claude-plugins-official', 'roomi-fields'],
      plugins: [
        { id: RTFM, scope: 'user', enabled: true },
        { id: GRILL, scope: 'local', enabled: true, projectPath: p },
        { id: MATT, scope: 'project', enabled: true, projectPath: p },
      ],
    });
    for (const id of [MATT, RTFM, GRILL]) {
      expect(nomme(sortie, id), `${id}\n${sortie}`).toBe(false);
    }
    expect(sortie).not.toMatch(/le greffon|claude plugin|la commande claude/);
  });
  it('critère 5: a plugin declared at false is not named; the one at true is', () => {
    const p = projetOuvert({
      ...REGLAGES_DU_CADRE,
      enabledPlugins: { [MATT]: false, [RTFM]: true },
    });
    const { sortie } = ouvrir(p, {});
    expect(nomme(sortie, MATT), sortie).toBe(false);
    manqueLeGreffon(sortie, RTFM);
  });
  it('critère 5: without the claude command, « Manque » names « la commande claude », with npx grillhouse maj', () => {
    const p = projetOuvert();
    const sortie = ouvrirAvec(p, sansClaude(dossier('sans-claude')));
    const l = ligneManque(sortie);
    expect(l, sortie).toBeDefined();
    expect(l, sortie).toContain('la commande claude');
    expect(l, sortie).toContain('npx grillhouse maj');
    expect(
      elements(sortie).filter(
        e =>
          e.includes('la commande claude') ||
          /greffon/i.test(e) ||
          [MATT, RTFM, GRILL].some(id => e.includes(id))
      ),
      sortie
    ).toEqual([]);
  });
  it('critère 5: the claude command present: « la commande claude » is not asked for', () => {
    const p = projetOuvert();
    const { sortie } = ouvrir(p, {});
    expect(sortie).not.toContain('la commande claude');
  });
});

describe('grillhouse-3uv.71 critère 14 — at the session start, a failed reading of the state has its line instead of the plugins', () => {
  for (const lecture of ['erreur', 'illisible'] as const) {
    it(`critère 14: « claude plugin list --json » ${lecture === 'erreur' ? 'in error' : 'answering unreadable JSON'}: a line says the plugins could not be read, no plugin is named`, () => {
      const p = projetOuvert();
      const { sortie, claude } = ouvrir(p, { lectures: { plugins: lecture } });
      expect(
        claude.appels().some(a => a.argv[0] === 'plugin' && a.argv[1] === 'list'),
        'the plugins were not read'
      ).toBe(true);
      expect(
        sortie.split('\n').some(l => /greffons/.test(l)),
        sortie
      ).toBe(true);
      for (const id of [MATT, RTFM, GRILL]) {
        expect(nommeCommeManquant(sortie, id), `${id}\n${sortie}`).toBe(false);
      }
    });
  }
});

describe('grillhouse-3uv.71 critère 6 — the update of the files launches no claude', () => {
  it('critère 6: mettreAJour, which the suites call in their own process, calls no claude', () => {
    const p = projet(null);
    const claude = claudeSubstitut(dossier('claude'), { noms: NOMS });
    const programme = `import(${JSON.stringify(MAJ)}).then(m => m.mettreAJour(${JSON.stringify(p)}, ${JSON.stringify(dossier('cadre'))}))`;
    const r = spawnSync(process.execPath, ['-e', programme], {
      cwd: p,
      encoding: 'utf8',
      env: env(claude.bin),
      timeout: 60_000,
    });
    expect(r.status, r.stderr).toBe(0);
    expect(claude.appels()).toEqual([]);
  });
});

describe('grillhouse-3uv.71 critère 10 — in an agent copy, the session start neither reads nor lists the plugins', () => {
  // A project with its git repository, its settings committed, and an agent copy of it.
  function projetEtCopie() {
    const p = projetOuvert();
    const git = (...a: string[]) => execFileSync('git', ['-C', p, ...a], { env: env() });
    git('init', '-q');
    git('add', '.claude/settings.json', 'scripts');
    git('commit', '-qm', 'init');
    const c = path.join(p, '.claude/worktrees', 'grillhouse-3uv.71');
    git('worktree', 'add', '-q', '-b', 'agent/grillhouse-3uv.71', c);
    mkdirSync(path.join(c, 'node_modules'));
    return { p, c };
  }
  it('critère 10: in the agent copy, no claude is called and no plugin is named', () => {
    const { c } = projetEtCopie();
    const { sortie, claude } = ouvrir(c, {});
    expect(claude.appels()).toEqual([]);
    for (const id of [MATT, RTFM, GRILL]) {
      expect(nomme(sortie, id), `${id}\n${sortie}`).toBe(false);
    }
  });
  it('critère 10 (garde): the project tree of the same project names them under « Manque »', () => {
    const { p } = projetEtCopie();
    const { sortie } = ouvrir(p, {});
    for (const id of [MATT, RTFM, GRILL]) {
      manqueLeGreffon(sortie, id);
    }
  });
  it('critère 10: in the agent copy without the claude command, « la commande claude » is not asked for', () => {
    const { c } = projetEtCopie();
    const sortie = ouvrirAvec(c, sansClaude(dossier('sans-claude')));
    expect(sortie).not.toContain('la commande claude');
  });
});

describe('grillhouse-3uv.71 critère 11 — « installed for the project »: scope user, or project/local at its root', () => {
  const AUTRE = '/home/quelquun/autre-projet';
  const cas: { titre: string; entree: (p: string) => Record<string, unknown>; compte: boolean }[] =
    [
      { titre: 'scope user, without projectPath', entree: () => ({ scope: 'user' }), compte: true },
      {
        titre: 'scope local at the root',
        entree: p => ({ scope: 'local', projectPath: p }),
        compte: true,
      },
      {
        titre: 'scope project at the root',
        entree: p => ({ scope: 'project', projectPath: p }),
        compte: true,
      },
      {
        titre: 'scope project of another project',
        entree: () => ({ scope: 'project', projectPath: AUTRE }),
        compte: false,
      },
      {
        titre: 'scope local of another project',
        entree: () => ({ scope: 'local', projectPath: AUTRE }),
        compte: false,
      },
    ];
  for (const { titre, entree, compte } of cas) {
    it(`critère 11: an entry of ${titre} ${compte ? 'counts: no install' : 'does not count: the plugin is installed'}`, () => {
      const p = projet({ enabledPlugins: { [MATT]: true } });
      const r = installer(p, { plugins: [{ id: MATT, enabled: true, ...entree(p) }] });
      expect(r.status, r.sortie).toBe(0);
      expect(installes(r.claude.appels())).toEqual(compte ? [] : [MATT]);
    });
  }
  it('critère 11: an entry of a subdirectory of the root does not count', () => {
    const p = projet({ enabledPlugins: { [MATT]: true } });
    const r = installer(p, {
      plugins: [{ id: MATT, enabled: true, scope: 'project', projectPath: path.join(p, 'sous') }],
    });
    expect(installes(r.claude.appels())).toEqual([MATT]);
  });
});

describe('grillhouse-3uv.71 critère 12 — an absent marketplace is added at the user’s scope', () => {
  for (const [titre, reglages, noms, src] of [
    ['roomi-fields', REGLAGES_DU_CADRE, NOMS, SOURCE_ROOMI],
    ['another marketplace', AUTRES_REGLAGES, AUTRES_NOMS, SOURCE_ATELIER],
  ] as const) {
    it(`critère 12: ${titre} is added by « claude plugin marketplace add <source> », without --scope; the project’s settings stay byte for byte`, () => {
      const p = projet(reglages);
      const avant = readFileSync(path.join(p, '.claude/settings.json'), 'utf8');
      const r = installer(p, { noms });
      expect(r.status, r.sortie).toBe(0);
      expect(ajouts(r.claude.appels()).map(a => a.argv)).toEqual([
        ['plugin', 'marketplace', 'add', src],
      ]);
      expect(readFileSync(path.join(p, '.claude/settings.json'), 'utf8')).toBe(avant);
    });
  }
});

// The command that adds a marketplace from its source (critères 12 and 17).
const commandeMarche = (src: string) => `claude plugin marketplace add ${src}`;

describe('grillhouse-3uv.71 critère 13 — the source of a marketplace is passed by its type', () => {
  const cas = [
    { type: 'github', champ: { repo: 'quelquun/marche-gh' }, src: 'quelquun/marche-gh' },
    {
      type: 'git',
      champ: { url: 'https://git.exemple.org/marche.git' },
      src: 'https://git.exemple.org/marche.git',
    },
    {
      type: 'url',
      champ: { url: 'https://exemple.org/plugins/marketplace.json' },
      src: 'https://exemple.org/plugins/marketplace.json',
    },
    { type: 'directory', champ: { path: '/srv/marches/local' }, src: '/srv/marches/local' },
    {
      type: 'file',
      champ: { path: '/srv/marches/un/marketplace.json' },
      src: '/srv/marches/un/marketplace.json',
    },
  ];
  for (const { type, champ, src } of cas) {
    it(`critère 13: a marketplace of type ${type} is added by its ${Object.keys(champ)[0]}, then its plugin is installed`, () => {
      const p = projet({
        enabledPlugins: { 'gamma@marche': true },
        extraKnownMarketplaces: { marche: { source: { source: type, ...champ } } },
      });
      const r = installer(p, { noms: { [src]: 'marche' } });
      expect(r.status, r.sortie).toBe(0);
      expect(ajouts(r.claude.appels()).map(a => a.argv)).toEqual([
        ['plugin', 'marketplace', 'add', src],
      ]);
      expect(installes(r.claude.appels())).toEqual(['gamma@marche']);
    });
  }
  it('critère 13: two marketplaces of different types are each added by their own field', () => {
    const p = projet({
      enabledPlugins: { 'gamma@depot': true, 'delta@dossier': true },
      extraKnownMarketplaces: {
        depot: { source: { source: 'git', url: 'https://git.exemple.org/depot.git' } },
        dossier: { source: { source: 'directory', path: '/srv/dossier' } },
      },
    });
    const r = installer(p, {
      noms: { 'https://git.exemple.org/depot.git': 'depot', '/srv/dossier': 'dossier' },
    });
    expect(r.status, r.sortie).toBe(0);
    expect(
      ajouts(r.claude.appels())
        .map(a => a.argv[3])
        .sort()
    ).toEqual(['/srv/dossier', 'https://git.exemple.org/depot.git']);
  });
  for (const source of [
    { source: 'npm', package: '@quelquun/marche' },
    { source: 'inconnu', repo: 'quelquun/marche' },
  ]) {
    it(`critère 13: a marketplace of type ${source.source} has no form of add: a line names it, nothing is added for it, non-zero code`, () => {
      const p = projet({
        enabledPlugins: { 'gamma@marche-npm': true },
        extraKnownMarketplaces: { 'marche-npm': { source } },
      });
      const r = installer(p);
      expect(r.status, r.sortie).not.toBe(0);
      expect(ajouts(r.claude.appels())).toEqual([]);
      expect(
        r.sortie.split('\n').some(l => l.includes('marche-npm')),
        r.sortie
      ).toBe(true);
    });
  }
});

describe('grillhouse-3uv.71 critère 14 — at the installation, a failed reading of the state installs nothing blindly', () => {
  for (const lecture of ['erreur', 'illisible'] as const) {
    it(`critère 14: « claude plugin list --json » ${lecture === 'erreur' ? 'in error' : 'unreadable'}: no plugin is installed, a line says it, non-zero code`, () => {
      const r = installer(projet(), { noms: NOMS, lectures: { plugins: lecture } });
      expect(r.status, r.sortie).not.toBe(0);
      expect(installs(r.claude.appels())).toEqual([]);
      expect(r.sortie, r.sortie).toMatch(/plugin list/);
    });
    it(`critère 14: « claude plugin marketplace list --json » ${lecture === 'erreur' ? 'in error' : 'unreadable'}: no marketplace is added, no plugin installed, a line says it, non-zero code`, () => {
      const r = installer(projet(), { noms: NOMS, lectures: { marches: lecture } });
      expect(r.status, r.sortie).not.toBe(0);
      expect(ajouts(r.claude.appels())).toEqual([]);
      expect(installs(r.claude.appels())).toEqual([]);
      expect(r.sortie, r.sortie).toMatch(/marketplace list/);
    });
  }
  it('critère 14: the preparation whose reading of the plugins fails exits non-zero, installing nothing', () => {
    const p = projetAPreparer();
    const claude = claudeSubstitut(dossier('claude'), {
      noms: NOMS,
      lectures: { plugins: 'erreur' },
    });
    const r = preparer(p, claude.bin);
    expect(r.status, r.sortie).not.toBe(0);
    expect(installs(claude.appels())).toEqual([]);
  });
});

describe('grillhouse-3uv.71 critère 15 — an absent settings file declares no plugin; an unreadable one is a failure', () => {
  it('critère 15: without .claude/settings.json, nothing is installed or added, code 0', () => {
    const r = installer(projet(null));
    expect(r.status, r.sortie).toBe(0);
    expect(installs(r.claude.appels())).toEqual([]);
    expect(ajouts(r.claude.appels())).toEqual([]);
  });
  it('critère 15: the preparation of a project without .claude/settings.json installs nothing and exits 0', () => {
    const p = projetAPreparer();
    rmSync(path.join(p, '.claude/settings.json'));
    const claude = claudeSubstitut(dossier('claude'), { noms: NOMS });
    const r = preparer(p, claude.bin);
    expect(r.status, r.sortie).toBe(0);
    expect(installs(claude.appels())).toEqual([]);
  });
  for (const [titre, texte] of [
    ['truncated JSON', '{"enabledPlugins": {"rtfm@roomi-fields": tr'],
    ['an empty file', ''],
  ] as const) {
    it(`critère 15: an unreadable .claude/settings.json (${titre}): a line names it, nothing is installed, non-zero code`, () => {
      const p = projet(null);
      ecrire(p, '.claude/settings.json', texte);
      const r = installer(p);
      expect(r.status, r.sortie).not.toBe(0);
      expect(installs(r.claude.appels())).toEqual([]);
      expect(r.sortie, r.sortie).toMatch(/settings\.json/);
    });
  }
});

describe('grillhouse-3uv.71 critère 16 — the failure of one plugin stops none of the others', () => {
  it('critère 16: two installs out of three fail: all three are tried, each failure has its line, non-zero code', () => {
    const r = installer(projet(), { noms: NOMS, echecsInstall: [MATT, GRILL] });
    expect(r.status, r.sortie).not.toBe(0);
    expect(installes(r.claude.appels())).toEqual([GRILL, MATT, RTFM].sort());
    expect(
      r.claude.etat().plugins?.map(e => e.id),
      r.sortie
    ).toEqual([RTFM]);
    for (const id of [MATT, GRILL]) {
      expect(ligneQuiNomme(r.sortie, id), `${id}\n${r.sortie}`).toBeDefined();
    }
    expect(ligneQuiNomme(r.sortie, RTFM), r.sortie).toBeUndefined();
  });
  it('critère 16: every install of another list fails: each is tried and has its line', () => {
    const r = installer(projet(AUTRES_REGLAGES), {
      noms: AUTRES_NOMS,
      echecsInstall: [ALPHA, BETA],
    });
    expect(r.status, r.sortie).not.toBe(0);
    expect(installes(r.claude.appels())).toEqual([ALPHA, BETA].sort());
    for (const id of [ALPHA, BETA]) {
      expect(ligneQuiNomme(r.sortie, id), `${id}\n${r.sortie}`).toBeDefined();
    }
  });
});

describe('grillhouse-3uv.71 critère 17 — a failed marketplace add: its plugins are not tried, each has its line', () => {
  // The line naming the plugin with the marketplace's command, then the plugin's.
  const ligneMarchePuisGreffon = (sortie: string, src: string, id: string) =>
    sortie.split('\n').find(l => {
      const m = l.indexOf(commandeMarche(src));
      const g = l.indexOf(commande(id));
      return m >= 0 && g > m;
    });
  it('critère 17: the add of roomi-fields fails: rtfm and grillhouse are not tried, each has its line; the official plugin is installed', () => {
    const r = installer(projet(), { noms: NOMS, echecsAjout: [SOURCE_ROOMI] });
    expect(r.status, r.sortie).not.toBe(0);
    expect(installes(r.claude.appels())).toEqual([MATT]);
    for (const id of [RTFM, GRILL]) {
      expect(
        ligneMarchePuisGreffon(r.sortie, SOURCE_ROOMI, id),
        `${id}\n${r.sortie}`
      ).toBeDefined();
    }
  });
  it('critère 17: two marketplaces, one add fails: the plugins of the other are installed', () => {
    const p = projet({
      enabledPlugins: { [RTFM]: true, [ALPHA]: true, [BETA]: true },
      extraKnownMarketplaces: {
        ...REGLAGES_DU_CADRE.extraKnownMarketplaces,
        ...AUTRES_REGLAGES.extraKnownMarketplaces,
      },
    });
    const r = installer(p, { noms: { ...NOMS, ...AUTRES_NOMS }, echecsAjout: [SOURCE_ATELIER] });
    expect(r.status, r.sortie).not.toBe(0);
    expect(installes(r.claude.appels())).toEqual([BETA, RTFM].sort());
    expect(ligneMarchePuisGreffon(r.sortie, SOURCE_ATELIER, ALPHA), r.sortie).toBeDefined();
  });
});

describe('grillhouse-3uv.71 critère 1, cas 6 — a declared marketplace without an active plugin is added', () => {
  it('critère 1 (cas 6): roomi-fields declared, its plugins at false: it is added, none of them installed', () => {
    const p = projet({
      ...REGLAGES_DU_CADRE,
      enabledPlugins: { [MATT]: true, [RTFM]: false, [GRILL]: false },
    });
    const r = installer(p);
    expect(r.status, r.sortie).toBe(0);
    expect(ajouts(r.claude.appels()).map(a => a.argv[3])).toEqual([SOURCE_ROOMI]);
    expect(installes(r.claude.appels())).toEqual([MATT]);
  });
});

describe('grillhouse-3uv.71 critère 11, cas 10 — an entry at the root counts whatever its state', () => {
  for (const [titre, etat] of [
    ['enabled: false', { enabled: false }],
    [
      'errors not empty',
      {
        enabled: true,
        errors: ['Plugin "mattpocock-skills" is enabled in project settings but isn\'t installed'],
        errorDetails: [{ type: 'plugin-not-installed', plugin: 'mattpocock-skills' }],
      },
    ],
  ] as const) {
    it(`critère 11 (cas 10): an entry of scope project at the root with ${titre} counts: nothing is installed or re-enabled`, () => {
      const p = projet({ enabledPlugins: { [MATT]: true } });
      const r = installer(p, {
        plugins: [{ id: MATT, scope: 'project', projectPath: p, ...etat }],
      });
      expect(r.status, r.sortie).toBe(0);
      expect(installs(r.claude.appels())).toEqual([]);
      expect(r.claude.appels().filter(a => a.argv[1] === 'enable')).toEqual([]);
    });
  }
  it('critère 11 (cas 10): at the session start, an entry at the root with enabled: false is not named', () => {
    const p = projetOuvert({ enabledPlugins: { [MATT]: true } });
    const { sortie } = ouvrir(p, {
      plugins: [{ id: MATT, scope: 'local', projectPath: p, enabled: false }],
    });
    expect(nomme(sortie, MATT), sortie).toBe(false);
  });
});

describe('grillhouse-3uv.71 critère 11, cas 11 — the root is compared by its resolved path', () => {
  it('critère 11 (cas 11): the project reached through a symbolic link, the entry at its real path: it counts', () => {
    const p = projet({ enabledPlugins: { [MATT]: true } });
    const lien = path.join(dossier('liens'), 'projet');
    symlinkSync(p, lien);
    const r = installer(lien, { plugins: [{ id: MATT, scope: 'project', projectPath: p }] });
    expect(r.status, r.sortie).toBe(0);
    expect(installs(r.claude.appels())).toEqual([]);
  });
  it('critère 11 (cas 11): the entry at a symbolic link to the project, the project by its real path: it counts', () => {
    const p = projet({ enabledPlugins: { [MATT]: true } });
    const lien = path.join(dossier('liens'), 'projet');
    symlinkSync(p, lien);
    const r = installer(p, { plugins: [{ id: MATT, scope: 'local', projectPath: lien }] });
    expect(r.status, r.sortie).toBe(0);
    expect(installs(r.claude.appels())).toEqual([]);
  });
  it('critère 11 (cas 11, garde): a link to another directory does not count', () => {
    const p = projet({ enabledPlugins: { [MATT]: true } });
    const lien = path.join(dossier('liens'), 'autre');
    symlinkSync(dossier('autre'), lien);
    const r = installer(p, { plugins: [{ id: MATT, scope: 'local', projectPath: lien }] });
    expect(installes(r.claude.appels())).toEqual([MATT]);
  });
});

// grillhouse-3uv.84.3, critère 3: the package and the mod are released by the same commit, under
// one version; the session start names a mod installed for the project at another version than
// the package's (the `version` of its package.json), with the command that aligns them: the mod's
// update when it is behind, the package's install at the mod's version when the package is.
describe('grillhouse-3uv.84.3 critère 3 — the session start names a package and a mod of different versions', () => {
  const PAQUET = (
    JSON.parse(readFileSync(path.join(DEPOT, 'packages/grillhouse/package.json'), 'utf8')) as {
      version: string;
    }
  ).version;
  const DERRIERE = '0.0.1';
  const DEVANT = `${Number(PAQUET.split('.')[0]) + 1}.0.0`;
  const ligneEcart = (sortie: string) =>
    sortie.split('\n').find(l => l.includes(GRILL) && l.includes('@roomi-fields/grillhouse'));
  const etat = (p: string, version: string, scope = 'local', racine = p): EtatClaude => ({
    marches: ['claude-plugins-official', 'roomi-fields'],
    plugins: [
      { id: RTFM, scope: 'user', enabled: true, version: '9.9.9' },
      { id: GRILL, scope, enabled: true, projectPath: racine, version },
      { id: GRILL, scope: 'user', enabled: true, version: PAQUET },
      { id: MATT, scope: 'project', enabled: true, projectPath: p, version: '1.0.0' },
    ],
  });

  it('critère 3: the mod behind the package: both versions, and the update of the mod for the project', () => {
    const p = projetOuvert();
    const { sortie } = ouvrir(p, etat(p, DERRIERE));
    const l = ligneEcart(sortie);
    expect(l, sortie).toBeDefined();
    expect(l, sortie).toContain(DERRIERE);
    expect(l, sortie).toContain(PAQUET);
    expect(l, sortie).toContain(`\`claude plugin update ${GRILL} --scope local\``);
  });
  it('critère 3: the package behind the mod: the install of the package at the mod’s version', () => {
    const p = projetOuvert();
    const { sortie } = ouvrir(p, etat(p, DEVANT, 'project'));
    const l = ligneEcart(sortie);
    expect(l, sortie).toBeDefined();
    expect(l, sortie).toContain(DEVANT);
    expect(l, sortie).toContain(PAQUET);
    expect(l, sortie).toContain(`\`npm install -D @roomi-fields/grillhouse@${DEVANT}\``);
  });
  it('critère 3: the same version, other plugins at other versions: nothing is said', () => {
    const p = projetOuvert();
    const { sortie } = ouvrir(p, etat(p, PAQUET));
    expect(ligneEcart(sortie), sortie).toBeUndefined();
    expect(sortie).not.toMatch(/claude plugin update|npm install -D/);
  });
  it('critère 3: the mod at another version for another project only is not compared', () => {
    const p = projetOuvert();
    const { sortie } = ouvrir(p, etat(p, DERRIERE, 'local', '/home/quelquun/autre-projet'));
    expect(ligneEcart(sortie), sortie).toBeUndefined();
  });
  // grillhouse-3uv.84.7 critère 3: the plugin's manifest in the repository carries no version (the
  // package's reaches it when packed), so a plugin read from a git source has none of x.y.z.
  it('critère 3: a mod whose version is not x.y.z (a manifest without version) is not compared', () => {
    const p = projetOuvert();
    const { sortie } = ouvrir(p, etat(p, 'a1b2c3d4e5f6'));
    expect(ligneEcart(sortie), sortie).toBeUndefined();
  });
});

// grillhouse-982.4: on BPScript 320.3.9, the package was at 0.24.6 and the mod installed for the
// project stayed at 0.24.3 (~/.claude/plugins/installed_plugins.json): the update installed an
// absent plugin, never updated a present one. The installation of the plugins (the update and the
// preparation call it) now brings the frame's mod to the package's version, by `claude plugin
// update <id> --scope <its scope>` from the project's root; when it cannot, a line names the
// command to type and the code is non-zero.
describe('grillhouse-982.4 — the installation brings the frame’s mod to the package’s version', () => {
  const PAQUET = (
    JSON.parse(readFileSync(path.join(DEPOT, 'packages/grillhouse/package.json'), 'utf8')) as {
      version: string;
    }
  ).version;
  const [MAJ_X, MIN_X, PAT_X] = PAQUET.split('.').map(Number);
  // A version just behind the package's (0.24.3 under 0.24.6 on BPScript), and one ahead.
  const DERRIERE =
    PAT_X > 0 ? `${MAJ_X}.${MIN_X}.${PAT_X - 1}` : MIN_X > 0 ? `${MAJ_X}.${MIN_X - 1}.9` : '0.0.1';
  const DEVANT = `${MAJ_X + 1}.0.0`;
  const misesAJour = (appels: AppelClaude[]) =>
    appels.filter(a => a.argv[0] === 'plugin' && a.argv[1] === 'update');
  const mise = (scope: string) => `claude plugin update ${GRILL} --scope ${scope}`;
  // The BPScript state: the mod at the root at scope local, the agents' copies at other versions.
  const etat = (p: string, version: string, scope = 'local', autre: Partial<EtatClaude> = {}) => ({
    noms: NOMS,
    marches: ['claude-plugins-official', 'roomi-fields'],
    plugins: [
      { id: RTFM, scope: 'user', enabled: true, version: '9.9.9' },
      { id: MATT, scope: 'project', enabled: true, projectPath: p, version: '1.0.0' },
      { id: GRILL, scope, enabled: true, projectPath: p, version },
      {
        id: GRILL,
        scope: 'local',
        enabled: true,
        projectPath: path.join(p, '.claude/worktrees/copie'),
        version: '0.14.0',
      },
    ],
    ...autre,
  });
  const versionDuMod = (e: EtatClaude, p: string, scope: string) =>
    e.plugins?.find(x => x.id === GRILL && x.scope === scope && x.projectPath === p)?.version;
  const ligneMod = (sortie: string) => sortie.split('\n').find(l => l.includes(GRILL));

  for (const scope of ['local', 'project']) {
    it(`critère 1: the mod behind the package at scope ${scope}: updated at its scope, from the project’s root, to the package’s version; code 0`, () => {
      const p = projet();
      const r = installer(p, etat(p, DERRIERE, scope));
      expect(r.status, r.sortie).toBe(0);
      const appels = misesAJour(r.claude.appels());
      expect(
        appels.map(a => a.argv.join(' ')),
        r.sortie
      ).toEqual([`plugin update ${GRILL} --scope ${scope}`]);
      expect(appels[0]?.cwd).toBe(p);
      expect(versionDuMod(r.claude.etat(), p, scope), r.sortie).toBe(PAQUET);
      expect(installs(r.claude.appels())).toEqual([]);
    });
  }
  it('critère 1: the update of the frame (npm run grillhouse:maj) brings the mod to the package’s version', () => {
    const p = projet();
    const claude = claudeSubstitut(dossier('claude'), etat(p, DERRIERE));
    const r = mettreAJourProjet(p, claude.bin);
    expect(r.status, r.sortie).toBe(0);
    expect(misesAJour(claude.appels()).map(a => a.argv.join(' '))).toEqual([
      `plugin update ${GRILL} --scope local`,
    ]);
    expect(versionDuMod(claude.etat(), p, 'local'), r.sortie).toBe(PAQUET);
  });
  it('critère 1: the mod at the package’s version: no update', () => {
    const p = projet();
    const r = installer(p, etat(p, PAQUET));
    expect(r.status, r.sortie).toBe(0);
    expect(misesAJour(r.claude.appels())).toEqual([]);
  });
  it('critère 1: the update fails: a line names the mod and the command to type, code non-zero', () => {
    const p = projet();
    const r = installer(p, etat(p, DERRIERE, 'local', { echecsMiseAJour: [GRILL] }));
    expect(r.status, r.sortie).not.toBe(0);
    const l = ligneMod(r.sortie);
    expect(l, r.sortie).toBeDefined();
    expect(l, r.sortie).toContain(mise('local'));
    expect(l, r.sortie).toContain(DERRIERE);
    expect(l, r.sortie).toContain(PAQUET);
  });
  it('critère 1: the update leaves the mod behind (its source publishes no newer version): a line, code non-zero', () => {
    const p = projet();
    const r = installer(p, etat(p, DERRIERE, 'local', { publiees: { [GRILL]: DERRIERE } }));
    expect(r.status, r.sortie).not.toBe(0);
    expect(ligneMod(r.sortie), r.sortie).toContain(mise('local'));
  });
  it('critère 1: the update of the frame whose update of the mod fails finishes its work, then exits non-zero with the command', () => {
    const p = projet();
    const claude = claudeSubstitut(
      dossier('claude'),
      etat(p, DERRIERE, 'local', { echecsMiseAJour: [GRILL] })
    );
    const r = mettreAJourProjet(p, claude.bin);
    expect(r.status, r.sortie).not.toBe(0);
    expect(r.sortie).toMatch(/^Cadre /);
    expect(ligneMod(r.sortie), r.sortie).toContain(mise('local'));
  });
  it('critère 1: the mod ahead of the package: no update, a line gives the install of the package at the mod’s version, code non-zero', () => {
    const p = projet();
    const r = installer(p, etat(p, DEVANT));
    expect(r.status, r.sortie).not.toBe(0);
    expect(misesAJour(r.claude.appels())).toEqual([]);
    expect(ligneMod(r.sortie), r.sortie).toContain(
      `npm install -D @roomi-fields/grillhouse@${DEVANT}`
    );
  });
  it('critère 1: the mod installed by this run at another version than the package’s is updated to it', () => {
    const p = projet();
    const r = installer(p, { noms: NOMS, publiees: { [GRILL]: DERRIERE } });
    // The source publishes the version behind: the update cannot bring the package's.
    expect(installes(r.claude.appels())).toContain(GRILL);
    expect(misesAJour(r.claude.appels()).map(a => a.argv.join(' '))).toEqual([
      `plugin update ${GRILL} --scope project`,
    ]);
    expect(r.status, r.sortie).not.toBe(0);
    expect(ligneMod(r.sortie), r.sortie).toContain(mise('project'));
  });

  it('critère 2: the session start names the BPScript case — the mod a version behind at scope local, the copies at others — with the update at scope local', () => {
    const p = projetOuvert();
    const { sortie } = ouvrir(p, etat(p, DERRIERE));
    const l = sortie
      .split('\n')
      .find(x => x.includes(GRILL) && x.includes('@roomi-fields/grillhouse'));
    expect(l, sortie).toBeDefined();
    expect(l, sortie).toContain(`en ${DERRIERE}`);
    expect(l, sortie).toContain(`en ${PAQUET}`);
    expect(l, sortie).toContain(`\`${mise('local')}\``);
  });
});
