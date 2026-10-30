// grillhouse-pkl.6, criterion 2 — the guard clippy: `cargo clippy --all-targets
// --message-format=json -- -D warnings`, each diagnostic a finding (its file, its line, its rule
// the lint's name), judged by the project's debt (scripts/dette.mjs) and written in SARIF. A
// recorded run of three diagnostics, played by the fake cargo first on the PATH: three findings;
// inscribed, counted by file and lint; one lint more refuses, one less is pruned.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lireSarif } from '../../../../scripts/resultats.mjs';
import { commande, constatsDeClippy } from '../../../../scripts/langages/cargo/clippy.mjs';
import exemples from '../../../../scripts/langages/cargo/exemples.mjs';
import { avecFauxCargo, installerFauxCargo } from './faux-cargo.js';

// One diagnostic of clippy as cargo prints it with `--message-format=json`, at <fichier>:<ligne>.
const diagnostic = (lint: string, fichier: string, ligne: number, texte: string) =>
  JSON.stringify({
    reason: 'compiler-message',
    package_id: 'path+file:///essai#seul@0.1.0',
    manifest_path: '/essai/Cargo.toml',
    target: { kind: ['lib'], name: 'seul', src_path: '/essai/src/lib.rs' },
    message: {
      $message_type: 'diagnostic',
      rendered: `error: ${texte}\n --> ${fichier}:${ligne}:5\n`,
      children: [
        { message: `\`-D ${lint}\` implied by \`-D warnings\``, level: 'note', spans: [] },
      ],
      code: { code: lint, explanation: null },
      level: 'error',
      message: texte,
      spans: [
        { file_name: fichier, line_start: ligne, column_start: 5, is_primary: true },
        { file_name: 'src/autre.rs', line_start: 1, column_start: 1, is_primary: false },
      ],
    },
  });
// The lines of a run that are no diagnostic: an artifact, the summary without code, the end.
const BRUIT = [
  JSON.stringify({ reason: 'compiler-artifact', package_id: 'x', target: { name: 'seul' } }),
  JSON.stringify({
    reason: 'compiler-message',
    message: {
      code: null,
      level: 'error',
      message: 'aborting due to 3 previous errors',
      spans: [],
    },
  }),
  JSON.stringify({ reason: 'build-finished', success: false }),
];
const TROIS = [
  diagnostic('clippy::needless_return', 'src/lib.rs', 2, 'unneeded `return` statement'),
  diagnostic('clippy::needless_return', 'src/lib.rs', 7, 'unneeded `return` statement'),
  diagnostic('clippy::redundant_clone', 'src/main.rs', 3, 'redundant clone'),
];
const UN_DE_PLUS = diagnostic('clippy::needless_return', 'src/lib.rs', 9, 'unneeded `return`');
// A finding read back from the SARIF of a run (scripts/resultats.mjs, `lireSarif`).
type Lu = {
  garde: string;
  regle: string | null;
  fichier: string | null;
  ligne: number | null;
  niveau: string;
  message: string;
  genre: string;
  trouve?: number;
};
const lus = (dossier: string) => (lireSarif(dossier) as { constats: Lu[] }).constats;
const enLignes = (l: string[]) => `${l.join('\n')}\n`;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'clippy-cargo-'));
let restaurer = () => {};
let seul: string;
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), path.join(ESSAIS, 'journal'));
  seul = (exemples.preparer(ESSAIS) as { depots: { seul: string } }).depots.seul;
});
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
afterAll(() => restaurer());

// Runs the guard on the trial <seul>, clippy answering <lignes>, in the debt's mode <mode>: its
// code, its refusals in SARIF, and what the journal of the fake cargo received.
function jouer(lignes: string[], mode?: string) {
  const enregistre = path.join(ESSAIS, `clippy-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(enregistre, enLignes(lignes));
  const resultats = mkdtempSync(path.join(ESSAIS, 'resultats-'));
  process.env.FAUX_CARGO_CLIPPY = enregistre;
  process.env.FAUX_CARGO_CODES = JSON.stringify({ clippy: 101 });
  try {
    const env = {
      ...process.env,
      GRILLHOUSE_RESULTATS: resultats,
      ...(mode ? { GRILLHOUSE_DETTE: mode } : {}),
    };
    const code = commande(seul, { env });
    return { code, sarif: lus(resultats) };
  } finally {
    delete process.env.FAUX_CARGO_CLIPPY;
    delete process.env.FAUX_CARGO_CODES;
  }
}
const dette = () =>
  JSON.parse(readFileSync(path.join(seul, 'grillhouse-dette.json'), 'utf8')) as Record<
    string,
    Record<string, unknown>
  >;

describe('grillhouse-pkl.6, critère 2 — la garde clippy', () => {
  it('a recorded run of 3 diagnostics gives 3 findings, each its file, its line and its lint', () => {
    expect(constatsDeClippy(enLignes([...BRUIT, ...TROIS]), seul)).toEqual([
      expect.objectContaining({
        fichier: 'src/lib.rs',
        ligne: 2,
        regle: 'clippy::needless_return',
      }),
      expect.objectContaining({
        fichier: 'src/lib.rs',
        ligne: 7,
        regle: 'clippy::needless_return',
      }),
      expect.objectContaining({
        fichier: 'src/main.rs',
        ligne: 3,
        regle: 'clippy::redundant_clone',
      }),
    ]);
  });

  it('it asks cargo clippy on every target, warnings denied, in JSON', () => {
    jouer([]);
    const appels = readFileSync(path.join(ESSAIS, 'journal'), 'utf8').split('\n');
    expect(appels).toContain('clippy --all-targets --message-format=json -- -D warnings');
  });

  it('without debt, the 3 findings refuse, written in SARIF under the guard clippy', () => {
    const r = jouer(TROIS);
    expect(r.code).toBe(1);
    expect(r.sarif.map(c => [c.garde, c.fichier, c.regle])).toEqual([
      ['clippy', 'src/lib.rs', 'clippy::needless_return'],
      ['clippy', 'src/lib.rs', 'clippy::needless_return'],
      ['clippy', 'src/main.rs', 'clippy::redundant_clone'],
    ]);
  });

  it('inscribed: the debt counts them by file and lint, and the guard passes', () => {
    expect(jouer(TROIS, 'inscrire').code).toBe(0);
    expect(dette()).toEqual({
      clippy: {
        'src/lib.rs': { 'clippy::needless_return': { count: 2 } },
        'src/main.rs': { 'clippy::redundant_clone': { count: 1 } },
      },
    });
    expect(jouer(TROIS).code).toBe(0);
  });

  it('one lint more than inscribed refuses', () => {
    jouer(TROIS, 'inscrire');
    const r = jouer([...TROIS, UN_DE_PLUS]);
    expect(r.code).toBe(1);
    expect(r.sarif.filter(c => c.niveau === 'error').map(c => c.ligne)).toEqual([2, 7, 9]);
  });

  it('one lint less passes, its key noted to prune, and pruning lowers the count', () => {
    jouer(TROIS, 'inscrire');
    const r = jouer(TROIS.slice(1));
    expect(r.code).toBe(0);
    expect(r.sarif.map(c => [c.genre, c.fichier, c.regle, c.trouve])).toEqual([
      ['a-elaguer', 'src/lib.rs', 'clippy::needless_return', 1],
    ]);
    expect(jouer(TROIS.slice(1), 'elaguer').code).toBe(0);
    expect(dette().clippy['src/lib.rs']).toEqual({ 'clippy::needless_return': { count: 1 } });
  });

  it('the same diagnostic given by two targets (the library and its tests) counts once', () => {
    expect(constatsDeClippy(enLignes([TROIS[0], TROIS[0], TROIS[2]]), seul)).toHaveLength(2);
  });

  it('an error of compilation (E0308) is no lint: it refuses, named, never inscribed', () => {
    const erreur = diagnostic('E0308', 'src/lib.rs', 4, 'mismatched types');
    expect(constatsDeClippy(enLignes([erreur]), seul)).toEqual([
      { fichier: 'src/lib.rs', ligne: 4, message: 'E0308 : mismatched types' },
    ]);
    const r = jouer([erreur, TROIS[2]], 'inscrire');
    expect(r.code).toBe(1);
    expect(
      r.sarif.filter(c => c.niveau === 'error').map(c => [c.fichier, c.regle, c.message])
    ).toEqual([['src/lib.rs', null, 'E0308 : mismatched types']]);
    expect(dette()).toEqual({
      clippy: { 'src/main.rs': { 'clippy::redundant_clone': { count: 1 } } },
    });
  });

  it('clippy red without any diagnostic refuses, named, never inscribed', () => {
    const r = jouer(BRUIT, 'inscrire');
    expect(r.code).toBe(1);
    expect(r.sarif.map(c => [c.fichier, c.message])).toEqual([
      [null, expect.stringContaining('cargo clippy rouge (code 101)')],
    ]);
  });
});
