import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
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
import {
  aVerifier,
  avecPartie,
  jugerExport,
  marques,
  partieGeneree,
  rapportApi,
  verifierComposant,
} from '../../../../scripts/langages/typescript/interfaces-contre-code.mjs';

type Constat = { fichier?: string; ligne?: number; regle?: string; message: string };
// A run of the check: its exit code, its stderr and its refusals as the check gives them.
export type Run = { status: number | null; stderr: string; constats: Constat[] };

// The trial harness of the check of the interfaces against the code
// (scripts/langages/typescript/interfaces-contre-code.mjs) and of their index (scripts/langages/typescript/index-interfaces.mjs), shared
// by their tests (tests/unit/interfaces-contre-code*.spec.ts): the frame's paths, the contract
// `duree` and its interface text, and what reads a run of the check.

export const RACINE = path.resolve(__dirname, '../../../../../..');
const SCRIPT = path.join(
  RACINE,
  'packages/grillhouse/scripts/langages/typescript/interfaces-contre-code.mjs'
);
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
// The elements and TSDoc messages of one declaration entry (see `analyse`).
type Analyse = { exports: { displayName: string }[]; tsdoc: string[] };
// The catalogue of the trial project: the one fault `duree` declares.
const FAUTES_DU_CATALOGUE = new Set(['DUREE_NEGATIVE']);
// Asserts that a line of <lignes> contains every one of <motifs>.
export const nomme = (lignes: string[], ...motifs: (string | RegExp)[]) => {
  const ligne = lignes.find(l =>
    motifs.every(m => (typeof m === 'string' ? l.includes(m) : m.test(l)))
  );
  expect(ligne, `a refusal naming ${motifs.join(', ')}:\n${lignes.join('\n')}`).toBeDefined();
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
    // A run of the check in this process (verifierComposant on each component), as the script's
    // output reads: its ⚠️ signals and ⛔ refusals on `stderr`, 1 when a refusal remains.
    const run = (...args: string[]): Run => {
      const ecrire = args.includes('--ecrire');
      const signaux: string[] = [];
      const constats: Constat[] = [];
      for (const c of aVerifier(dir, {})) {
        const v = verifierComposant(dir, c, { ecrire }) as { signaux: string[]; refus: Constat[] };
        signaux.push(...v.signaux);
        constats.push(...v.refus);
      }
      const lignes = [...signaux.map(s => `⚠️  ${s}`), ...constats.map(r => `⛔ ${r.message}`)];
      return {
        status: constats.length ? 1 : 0,
        stderr: lignes.map(l => `${l}\n`).join(''),
        constats,
      };
    };
    // The script as a process: the one real launch, for the refusals' exit code and their SARIF.
    const lancer = (env: Record<string, string> = {}) =>
      spawnSync('node', [SCRIPT], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });
    const lire = (rel = 'src/a/docs/INTERFACE.md') => readFileSync(path.join(dir, rel), 'utf8');
    return { dir, run, lancer, lire };
  }
  // The elements one call of `rapportApi` draws from a declaration entry, and its TSDoc messages;
  // one call per distinct entry in this file, shared by the cases that judge it.
  const analyses = new Map<string, Analyse>();
  const analyse = (dts: string): Analyse => {
    const connue = analyses.get(dts);
    if (connue) {
      return connue;
    }
    const p = projet({ 'dist/a/index.d.ts': dts });
    const { TSDocConfigFile } = createRequire(SCRIPT)('@microsoft/tsdoc-config') as {
      TSDocConfigFile: { loadFile: (f: string) => unknown };
    };
    const r = rapportApi(
      p.dir,
      { dir: path.join(p.dir, 'src/a') },
      path.join(p.dir, 'dist/a/index.d.ts'),
      false,
      TSDocConfigFile.loadFile(TSDOC)
    );
    const a = { exports: r.exports, tsdoc: r.tsdoc.map((t: { texte: string }) => t.texte) };
    analyses.set(dts, a);
    return a;
  };
  // The lines `jugerExport` refuses for the exports named <nom> (every signature of an overload)
  // against the catalogue <fautes>, and the codes they name.
  const juge = (a: Analyse, nom: string, fautes: Set<string> | null = FAUTES_DU_CATALOGUE) => {
    const lignes: string[] = [];
    const codes = new Set<string>();
    for (const item of a.exports.filter(i => i.displayName === nom)) {
      const j = jugerExport(item, fautes);
      lignes.push(...j.refus.map((r: { texte: string }) => r.texte));
      for (const c of j.codes as string[]) {
        codes.add(c);
      }
    }
    return { lignes, codes };
  };
  // Every refusal line of an analysis: its TSDoc messages, then those of each export.
  const tout = (a: Analyse, fautes: Set<string> | null = FAUTES_DU_CATALOGUE) => [
    ...a.tsdoc.map(t => `TSDoc : ${t}`),
    ...a.exports.flatMap(i => jugerExport(i, fautes).refus.map((r: { texte: string }) => r.texte)),
  ];
  // The generated part of an analysis, and an interface text rewritten with it.
  const partie = (a: Analyse) => partieGeneree(a.exports);
  const reecrit = (texte: string, a: Analyse) => avecPartie(marques(texte), texte, partie(a));
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
  return { iface, projet, ecrit, apres, analyse, juge, tout, partie, reecrit };
}
