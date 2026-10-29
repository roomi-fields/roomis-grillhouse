import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// The version of the frame's package, which the marketplace roomi-fields publishes as the frame's
// plugin (its source is the npm package): an install or an update of `grillhouse@roomi-fields`
// brings it, unless the state gives another (`publiees`). Its package.json is read beside this
// package in the workspace, a file and not an import: the material imports no package.
const VERSION_DU_PAQUET = (
  JSON.parse(readFileSync(path.join(__dirname, '../../grillhouse/package.json'), 'utf8')) as {
    version: string;
  }
).version;

// A stand-in for the `claude` command (grillhouse-3uv.71, critère 6): no test launches the real one.
// It records each call (argv and working directory) and answers the plugin commands from a state
// file, as Claude Code 2.1.296 does (measured on 2026-10-12):
// - `plugin list --json`: one entry per installation (id, scope, projectPath for project/local);
// - `plugin marketplace list --json`: one entry per known marketplace (`name`);
// - `plugin marketplace add <source>`: the marketplace becomes known, under the name `noms` gives
//   for the source (else the last segment of the source);
// - `plugin install <plugin>@<marketplace> [--scope s]`: refused when the marketplace is unknown,
//   else an entry of scope s (user by default), whose projectPath is the working directory.
//   With --scope project and a known marketplace, it first rewrites `.claude/settings.json` of the
//   working directory, as the real one does even when the install then fails (measured on
//   2026-10-13, grillhouse-3uv.76): the plugin set to true in `enabledPlugins`, the keys in the
//   order of Claude Code's schema (`ORDRE_DES_REGLAGES`, the others after, in their order), the
//   text `JSON.stringify(value, null, 2)` and a newline, written even when the value is the same.
//   The entry carries the version its source publishes (`publiees`; the frame's plugin, the
//   package's version; any other, 1.0.0).
// - `plugin update <plugin> --scope s`: the entry of scope s (for project/local, at the working
//   directory) takes the version its source publishes; refused when there is none, or when the
//   plugin is among `echecsMiseAJour`.
// A list reading can be made to fail, or to answer unreadable JSON (`lectures`).
// A list command without --json answers in text, as the real one does.

/** The state the stand-in answers from. */
export interface EtatClaude {
  /** The entries of `plugin list --json`. */
  plugins?: Record<string, unknown>[];
  /** The names of the known marketplaces; claude-plugins-official by default. */
  marches?: string[];
  /** The name a marketplace added from a source receives. */
  noms?: Record<string, string>;
  /** The plugins whose install fails. */
  echecsInstall?: string[];
  /** The version each plugin's source publishes, which an install or an update brings. */
  publiees?: Record<string, string>;
  /** The plugins whose update fails. */
  echecsMiseAJour?: string[];
  /** The sources whose add fails. */
  echecsAjout?: string[];
  /** Seconds each call waits before answering. */
  sommeil?: number;
  /** The list readings that fail (`erreur`: non-zero code) or answer unreadable JSON (`illisible`). */
  lectures?: { plugins?: 'erreur' | 'illisible'; marches?: 'erreur' | 'illisible' };
}

/** One call of the stand-in. */
export interface AppelClaude {
  argv: string[];
  cwd: string;
}

// The order in which Claude Code 2.1.296 writes the keys of a settings file it rewrites, as measured
// on 2026-10-13 (keys it does not know follow, in the file's order).
const ORDRE_DES_REGLAGES = [
  '$schema',
  'env',
  'permissions',
  'model',
  'enabledMcpjsonServers',
  'hooks',
  'statusLine',
  'enabledPlugins',
  'extraKnownMarketplaces',
];

const PROGRAMME = `
const fs = require('fs');
const D = __DOSSIER__;
const F = D + '/etat.json';
const e = JSON.parse(fs.readFileSync(F, 'utf8'));
const a = process.argv.slice(2);
fs.appendFileSync(D + '/appels.jsonl', JSON.stringify({ argv: a, cwd: process.cwd() }) + '\\n');
if (e.sommeil) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, e.sommeil * 1000);
let scope;
const k = [];
for (let i = 0; i < a.length; i++) {
  if (a[i] === '--scope' || a[i] === '-s') scope = a[++i];
  else if (a[i].startsWith('--scope=')) scope = a[i].slice(8);
  else if (!a[i].startsWith('-')) k.push(a[i]);
}
const json = a.includes('--json');
const sortir = v => { process.stdout.write(JSON.stringify(v, null, 2) + '\\n'); process.exit(0); };
const ecrire = () => fs.writeFileSync(F, JSON.stringify(e));
const lire = (quoi, v) => {
  const l = (e.lectures ?? {})[quoi];
  if (l === 'erreur') { process.stderr.write('Error: failed to read ' + quoi + '\\n'); process.exit(1); }
  if (l === 'illisible') { process.stdout.write('[{"id": tronqué\\n'); process.exit(0); }
  sortir(v);
};
e.plugins ??= [];
e.marches ??= ['claude-plugins-official'];
const publiee = id => ({ 'grillhouse@roomi-fields': __VERSION__, ...(e.publiees ?? {}) })[id] ?? '1.0.0';
if (k[0] === 'plugin' && k[1] === 'list') {
  if (!json) { process.stdout.write('Installed plugins:\\n'); process.exit(0); }
  lire('plugins', e.plugins);
}
if (k[0] === 'plugin' && k[1] === 'marketplace' && k[2] === 'list') {
  if (!json) { process.stdout.write('Configured marketplaces:\\n'); process.exit(0); }
  lire('marches', e.marches.map(name => ({ name, source: 'github', repo: 'x/' + name, installLocation: '/x/' + name })));
}
if (k[0] === 'plugin' && k[1] === 'marketplace' && k[2] === 'add' && k[3]) {
  if ((e.echecsAjout ?? []).includes(k[3])) { process.stderr.write('Failed to add marketplace\\n'); process.exit(1); }
  const nom = (e.noms ?? {})[k[3]] ?? k[3].replace(/\\.git$/, '').split('/').pop();
  if (!e.marches.includes(nom)) e.marches.push(nom);
  ecrire();
  process.stdout.write('Successfully added marketplace: ' + nom + '\\n');
  process.exit(0);
}
if (k[0] === 'plugin' && (k[1] === 'install' || k[1] === 'i') && k[2]) {
  const [nom, marche] = k[2].split('@');
  const reglages = process.cwd() + '/.claude/settings.json';
  if ((scope ?? 'user') === 'project' && e.marches.includes(marche)) {
    const r = fs.existsSync(reglages) ? JSON.parse(fs.readFileSync(reglages, 'utf8')) : {};
    r.enabledPlugins = { ...(r.enabledPlugins ?? {}), [k[2]]: true };
    const ordre = __ORDRE__;
    const cles = [...ordre.filter(c => c in r), ...Object.keys(r).filter(c => !ordre.includes(c))];
    fs.mkdirSync(process.cwd() + '/.claude', { recursive: true });
    fs.writeFileSync(reglages, JSON.stringify(Object.fromEntries(cles.map(c => [c, r[c]])), null, 2) + '\\n');
  }
  if ((e.echecsInstall ?? []).includes(k[2]) || !e.marches.includes(marche)) {
    process.stderr.write('Failed to install plugin "' + k[2] + '"\\n');
    process.exit(1);
  }
  const s = scope ?? 'user';
  e.plugins.push({ id: k[2], version: publiee(k[2]), scope: s, enabled: true, installPath: '/x/' + nom,
    ...(s === 'user' ? {} : { projectPath: process.cwd() }), projectEnabled: true });
  ecrire();
  process.stdout.write('Successfully installed plugin: ' + k[2] + ' (scope: ' + s + ')\\n');
  process.exit(0);
}
if (k[0] === 'plugin' && k[1] === 'update' && k[2]) {
  const ici = fs.realpathSync(process.cwd());
  const entree = e.plugins.find(p => p.id === k[2] && p.scope === scope &&
    (scope === 'user' || (typeof p.projectPath === 'string' && fs.existsSync(p.projectPath) && fs.realpathSync(p.projectPath) === ici)));
  if (!entree || (e.echecsMiseAJour ?? []).includes(k[2])) {
    process.stderr.write('Failed to update plugin "' + k[2] + '"\\n');
    process.exit(1);
  }
  entree.version = publiee(k[2]);
  ecrire();
  process.stdout.write('Plugin "' + k[2] + '" updated to ' + entree.version + '\\n');
  process.exit(0);
}
process.stderr.write('claude (substitut): commande inconnue ' + a.join(' ') + '\\n');
process.exit(2);
`;

/**
 * A directory `bin` holding the stand-in `claude` and a link to node, its state set to `etat`.
 * `appels()` reads the calls made so far; `etat()` the state as the calls left it.
 */
export function claudeSubstitut(dossier: string, etat: EtatClaude = {}) {
  const bin = path.join(dossier, 'bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(path.join(dossier, 'etat.json'), JSON.stringify(etat));
  writeFileSync(
    path.join(bin, 'claude'),
    `#!${process.execPath}\n${PROGRAMME.replace('__DOSSIER__', JSON.stringify(dossier)).replace('__ORDRE__', JSON.stringify(ORDRE_DES_REGLAGES)).replace('__VERSION__', JSON.stringify(VERSION_DU_PAQUET))}`,
    { mode: 0o755 }
  );
  if (!existsSync(path.join(bin, 'node'))) {
    symlinkSync(process.execPath, path.join(bin, 'node'));
  }
  const fichier = path.join(dossier, 'appels.jsonl');
  return {
    bin,
    appels: (): AppelClaude[] =>
      existsSync(fichier)
        ? readFileSync(fichier, 'utf8')
            .split('\n')
            .filter(Boolean)
            .map(l => JSON.parse(l) as AppelClaude)
        : [],
    etat: () => JSON.parse(readFileSync(path.join(dossier, 'etat.json'), 'utf8')) as EtatClaude,
  };
}

/** A directory `bin` holding node alone, and no claude: a machine without Claude Code. */
export function sansClaude(dossier: string) {
  const bin = path.join(dossier, 'bin');
  mkdirSync(bin, { recursive: true });
  if (!existsSync(path.join(bin, 'node'))) {
    symlinkSync(process.execPath, path.join(bin, 'node'));
  }
  return bin;
}

/** The PATH of a test: its own directories first, then the system's (no ~/.local/bin, no nvm). */
export const cheminSysteme = (...dossiers: string[]) =>
  [...dossiers, '/usr/local/bin', '/usr/bin', '/bin'].join(':');

// git is needed by the scripts the tests run; it must lie in the system's directories.
execFileSync('git', ['--version'], { env: { PATH: cheminSysteme() } });
