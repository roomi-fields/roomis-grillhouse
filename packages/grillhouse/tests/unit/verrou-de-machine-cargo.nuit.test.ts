// grillhouse-6ay, critères 3, 5 et 10 — le module Cargo nomme sa vérification au verrou de la
// machine. Il refuse un espace de travail dont git ne suit pas Cargo.lock : le cas monte un dépôt
// d'essai et y lance le module, donc c'est un grand test, joué la nuit.
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const RACINE = path.resolve(__dirname, '../../../..');
const MODULE = pathToFileURL(
  path.join(RACINE, 'packages/grillhouse/scripts/langages/cargo/commandes.mjs')
).href;
const SORTE = 'GRILLHOUSE_VERIFICATION_SORTE';
const TICKET = 'GRILLHOUSE_VERIFICATION_TICKET';
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'verrou-cargo-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

let n = 0;
const unDossier = () => {
  const d = path.join(ESSAIS, `essai-${++n}`);
  mkdirSync(d, { recursive: true });
  return d;
};

const environnement = (ajouts: Record<string, string | undefined>) => {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !k.startsWith('VITEST') && k !== 'NODE_OPTIONS') env[k] = v;
  }
  delete env.GRILLHOUSE_VERROU_MACHINE;
  delete env.GRILLHOUSE_MESURE_TENUE;
  delete env.GRILLHOUSE_ENVELOPPE;
  for (const [k, v] of Object.entries(ajouts)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  return env;
};

const GARDE = `
  import { readFileSync, writeFileSync } from 'node:fs';
  const lock = process.env.GRILLHOUSE_VERROU_MACHINE;
  writeFileSync('lu.json', JSON.stringify({
    detenteur: JSON.parse(readFileSync(lock + '.detenteur.json', 'utf8')),
    sorte: process.env.${SORTE} ?? null,
    ticket: process.env.${TICKET} ?? null,
  }));
`;

const projetDEssai = (d: string) => {
  writeFileSync(path.join(d, 'garde.mjs'), GARDE);
  writeFileSync(
    path.join(d, 'package.json'),
    JSON.stringify({ name: 'essai', private: true, scripts: { gardes: 'node garde.mjs' } })
  );
  const bin = path.join(d, 'bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(path.join(bin, 'sccache'), '#!/bin/sh\nexit 0\n');
  chmodSync(path.join(bin, 'sccache'), 0o755);
  writeFileSync(path.join(d, 'Cargo.lock'), '');
  spawnSync('git', ['init', '-q', d]);
  spawnSync('git', ['-C', d, 'add', 'Cargo.lock']);
  return bin;
};

const jouer = async (d: string, ajouts: Record<string, string | undefined>) => {
  const bin = projetDEssai(d);
  const maison = path.join(d, 'maison');
  mkdirSync(path.join(maison, '.cache', 'grillhouse'), { recursive: true });
  const env = environnement({
    HOME: maison,
    GRILLHOUSE_VERROU_MACHINE: path.join(d, 'mesure.lock'),
    PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
    ...ajouts,
  });
  const { lancer } = (await import(MODULE)) as {
    lancer: (
      nom: string,
      args: string[],
      o: { racine: string; env: Record<string, string> }
    ) => number;
  };
  return lancer('verifier', ['--gardes'], { racine: d, env });
};

const lu = (d: string) =>
  JSON.parse(readFileSync(path.join(d, 'lu.json'), 'utf8')) as {
    detenteur: Record<string, unknown>;
    sorte: string | null;
    ticket: string | null;
  };

describe('grillhouse-6ay — le module Cargo nomme sa vérification', { timeout: 120_000 }, () => {
  it('critère 5 (cargo) : la vérification s’inscrit avec l’identité de l’environnement, que sa mesure ne reçoit pas', async () => {
    const d = unDossier();
    expect(await jouer(d, { [SORTE]: 'Intégration', [TICKET]: 'SH-ae6.5' })).toBe(0);
    expect(lu(d)).toMatchObject({
      detenteur: { sorte: 'Intégration', ticket: 'SH-ae6.5' },
      sorte: null,
      ticket: null,
    });
  });

  it('critères 3 et 5 (cargo) : lancée à la main, elle s’inscrit « Vérification », sans ticket', async () => {
    const d = unDossier();
    expect(await jouer(d, { [SORTE]: undefined, [TICKET]: undefined })).toBe(0);
    expect(lu(d).detenteur).toMatchObject({ sorte: 'Vérification', ticket: null });
  });
});
