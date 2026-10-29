import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { commandeDe, sousCommandes } from '../../scripts/sous-commandes.mjs';
import { declarerLeLangage } from './langage-essai.js';

// The frame's one command, `grillhouse <sous-commande>` (bin/grillhouse.mjs, the `bin` of the
// package @roomi-fields/grillhouse): each script a caller launches has its subcommand, and every
// caller of the repository names the subcommand, never the script's path.

const PAQUET = path.resolve(__dirname, '../..');
const DEPOT = path.resolve(PAQUET, '../..');
const COMMANDE = path.join(DEPOT, 'node_modules/.bin/grillhouse');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'commande-grillhouse-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
// The command runs in a project of TypeScript, its language declared (grillhouse-3dr.2.3).
declarerLeLangage(ESSAIS);

const grillhouse = (args: string[], cwd = ESSAIS) =>
  spawnSync(COMMANDE, args, { cwd, encoding: 'utf8', timeout: 30_000 });

// The files under <dossier> (absolute), each absolute.
const sous = (dossier: string): string[] =>
  readdirSync(dossier, { withFileTypes: true }).flatMap(e => {
    const f = path.join(dossier, e.name);
    return e.isDirectory() ? sous(f) : [f];
  });

describe('grillhouse <sous-commande>', () => {
  it('is the bin of the package, linked by the workspaces', () => {
    const pkg = JSON.parse(readFileSync(path.join(PAQUET, 'package.json'), 'utf8')) as {
      name: string;
      bin: Record<string, string>;
    };
    expect(pkg.name).toBe('@roomi-fields/grillhouse');
    expect(pkg.bin).toEqual({ grillhouse: 'bin/grillhouse.mjs' });
    expect(existsSync(COMMANDE)).toBe(true);
  });

  it('names a script of the package for each subcommand', () => {
    for (const nom of Object.keys(sousCommandes(DEPOT))) {
      const commande = commandeDe(nom, DEPOT);
      expect(commande, nom).not.toBeNull();
      expect(statSync(commande?.script as string).isFile(), nom).toBe(true);
    }
  });

  it('refuses an unknown subcommand: exit code 2, the list of the subcommands', () => {
    const r = grillhouse(['inconnue']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('sous-commande inconnue : inconnue');
    expect(r.stderr).toContain(`Sous-commandes : ${Object.keys(sousCommandes(DEPOT)).join(', ')}`);
  });

  it('writes the usage without a subcommand, exit code 2', () => {
    const r = grillhouse([]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('Usage : grillhouse <sous-commande>');
  });

  it('runs a Node script with its arguments, its exit code the command’s', () => {
    const r = grillhouse(['turbo-des-paquets', '--zut']);
    expect(r.status).toBe(2);
    expect(r.stdout + r.stderr).toContain('Usage : npx grillhouse turbo-des-paquets');
  });

  it('runs a shell script by bash, its exit code the command’s', () => {
    const r = grillhouse(['ticket']);
    expect(r.status).toBe(2);
  });

  it('works in the working directory, the project', () => {
    const projet = mkdtempSync(path.join(ESSAIS, 'projet-'));
    declarerLeLangage(projet);
    mkdirSync(path.join(projet, 'docs/agents'), { recursive: true });
    const r = grillhouse(['index-interfaces'], projet);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(path.join(projet, 'docs/agents/index-des-interfaces.md'))).toBe(true);
  });
});

// A command that runs a script of the frame by its path: `node scripts/x.mjs`, `bash scripts/x.sh`.
const PAR_CHEMIN = /\b(?:node|bash)\s+["']?(?:\$\S*\/|\.\/)?scripts\/[\w./-]+\.(?:mjs|sh)/;
// A subcommand a text names: `npx grillhouse <nom>` or, in an npm script, `grillhouse <nom>`.
const NOMMEE = /(?:^|[\s`'"(])(?:npx |node_modules\/\.bin\/)?grillhouse (?!<)([a-z][a-z-]*)/g;

// The callers of the repository: the npm scripts of the root and of the template, the skills, the
// agents, the charter and the documents of the agents, the mod, and the guides. The hooks of Claude
// Code that `.claude/settings.json` declares go to the mod (grillhouse-3uv.84.2).
const APPELANTS = [
  'package.json',
  'templates/projet/package.json',
  ...sous(path.join(DEPOT, 'mods/grillhouse/skills')).map(f => path.relative(DEPOT, f)),
  ...sous(path.join(DEPOT, 'mods/grillhouse/agents')).map(f => path.relative(DEPOT, f)),
  'mods/grillhouse/charte.md',
  ...sous(path.join(DEPOT, 'docs/agents')).map(f => path.relative(DEPOT, f)),
  'mods/grillhouse/hooks/register.tsx',
  'README.md',
  'CONTRIBUTING.md',
  'STRUCTURE.md',
].filter(f => /\.(?:md|json|tsx|cjs|mjs)$/.test(f));

describe('the callers name the subcommand, never a path of the frame', () => {
  it.each(APPELANTS)('%s', f => {
    const texte = readFileSync(path.join(DEPOT, f), 'utf8');
    const lignes = texte.split('\n').filter(l => PAR_CHEMIN.test(l));
    expect(lignes, f).toEqual([]);
    for (const m of texte.matchAll(NOMMEE)) {
      expect(Object.keys(sousCommandes(DEPOT)), `${f} : grillhouse ${m[1]}`).toContain(m[1]);
    }
  });

  it('runs the frame on itself by its command: npm run verifier is grillhouse verifier', () => {
    const p = JSON.parse(readFileSync(path.join(DEPOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(p.scripts.verifier).toBe('grillhouse verifier');
    expect(p.scripts.test).toBe('grillhouse tests');
  });
});
