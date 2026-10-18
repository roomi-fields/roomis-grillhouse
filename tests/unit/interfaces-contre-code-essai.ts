import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';

// The trial harness of the check of the interfaces against the code
// (scripts/interfaces-contre-code.mjs) and of their index (scripts/index-interfaces.mjs), shared
// by their tests (tests/unit/interfaces-contre-code*.spec.ts): the frame's paths, the contract
// `duree` and its interface text, and what reads a run of the check.

export const RACINE = path.resolve(__dirname, '../..');
const SCRIPT = path.join(RACINE, 'scripts/interfaces-contre-code.mjs');
const MODULES = path.join(RACINE, 'node_modules');
export const TSDOC = path.join(RACINE, 'tsdoc.json');

export const DEBUT = '<!-- généré: début -->';
export const FIN = '<!-- généré: fin -->';

export const TSCONFIG = JSON.stringify({ compilerOptions: { strict: true, skipLibCheck: true } });

// The contract of `duree`, written in TSDoc on the export (grillhouse-3uv.64, Q1-Q2).
export const DUREE = [
  '/**',
  ' * Rend la durée d’un objet en battements.',
  ' * @param x - Le tempo de l’objet.',
  ' * @returns La durée, positive.',
  ' * @faute DUREE_NEGATIVE',
  ' */',
  'export declare function duree(x: number): number;',
  '',
].join('\n');

export const FAUTES = '\n## Les fautes\n\n- `DUREE_NEGATIVE` : un tempo négatif.\n';

// The generated part of an interface text: what lies strictly between the two marks.
export const generee = (texte: string) => {
  const d = texte.indexOf(DEBUT);
  const f = texte.indexOf(FIN);
  expect(d, 'the start mark').toBeGreaterThanOrEqual(0);
  expect(f, 'the end mark').toBeGreaterThan(d);
  return texte.slice(d + DEBUT.length, f);
};
// The titles in code of one export in a generated part.
export const titres = (part: string, nom: string) =>
  part.split('\n').filter(l => new RegExp(`^#{2,4} \`${nom}\``).test(l));
// The entry of one export in a generated part: from its title in code to the next title of the
// same or a higher level (a member may have its own sub-title inside the entry).
export const entree = (part: string, nom: string) => {
  const lignes = part.split('\n');
  const i = lignes.findIndex(l => new RegExp(`^#{2,4} \`${nom}\``).test(l));
  expect(i, `the title of ${nom}`).toBeGreaterThanOrEqual(0);
  const niveau = /^#+/.exec(lignes[i])![0].length;
  const j = lignes.findIndex((l, k) => k > i && new RegExp(`^#{1,${niveau}} `).test(l));
  return lignes.slice(i, j < 0 ? undefined : j).join('\n');
};
// The refusal lines (⛔) of a run.
export const refus = (stderr: string) => stderr.split('\n').filter(l => l.startsWith('⛔'));
// Asserts a refusal line that contains every one of <motifs>.
export const refusNommant = (
  r: { status: number | null; stderr: string },
  ...motifs: (string | RegExp)[]
) => {
  expect(r.status, r.stderr).toBe(1);
  const ligne = refus(r.stderr).find(l =>
    motifs.every(m => (typeof m === 'string' ? l.includes(m) : m.test(l)))
  );
  expect(ligne, `a refusal naming ${motifs.join(', ')}:\n${r.stderr}`).toBeDefined();
};
export const passe = (r: { status: number | null; stderr: string }) => {
  expect(r.stderr).toBe('');
  expect(r.status).toBe(0);
};
// A TSDoc comment of the given lines.
export const doc = (...lignes: string[]) =>
  ['/**', ...lignes.map(l => ` * ${l}`), ' */', ''].join('\n');

// The projects of trial of one test file, each in a directory of its own under <ESSAIS>.
export function interfacesEssai(ESSAIS: string) {
  const iface = (avant = '# a\n\nA rend des durées.\n\n', apres = '') =>
    `${avant}${DEBUT}\n${FIN}\n${apres}`;

  // A one-package project whose module `a` is built in dist/a, with the given files on top. The
  // frame's TSDoc configuration sits at its root, as in a project installed from the frame.
  function projet(files: Record<string, string>) {
    const dir = mkdtempSync(path.join(ESSAIS, 'icc-'));
    const base = {
      'package.json': '{"name":"p","types":"dist/index.d.ts"}',
      'tsconfig.json': TSCONFIG,
      'src/a/index.ts':
        "export function duree(x: number): number { if (x < 0) throw new Error('DUREE_NEGATIVE'); return x; }\n",
      'dist/a/index.d.ts': DUREE,
      'src/a/docs/INTERFACE.md': iface(undefined, FAUTES),
    };
    for (const [rel, text] of Object.entries({ ...base, ...files })) {
      mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      writeFileSync(path.join(dir, rel), text);
    }
    if (existsSync(TSDOC)) {
      copyFileSync(TSDOC, path.join(dir, 'tsdoc.json'));
    }
    symlinkSync(MODULES, path.join(dir, 'node_modules'));
    const run = (...args: string[]) =>
      spawnSync('node', [SCRIPT, ...args], { cwd: dir, encoding: 'utf8' });
    const lire = (rel = 'src/a/docs/INTERFACE.md') => readFileSync(path.join(dir, rel), 'utf8');
    return { dir, run, lire };
  }
  const ecrit = (files: Record<string, string>) => {
    const p = projet(files);
    p.run('--ecrire');
    return p;
  };
  const apres = (files: Record<string, string>, change: Record<string, string> = {}) => {
    const p = ecrit(files);
    for (const [rel, text] of Object.entries(change)) {
      writeFileSync(path.join(p.dir, rel), text);
    }
    return p.run();
  };
  return { iface, projet, ecrit, apres };
}
