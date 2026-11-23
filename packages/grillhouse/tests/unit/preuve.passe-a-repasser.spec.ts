// La preuve du rouge dont la passe finit « à repasser » (code 75 : la part de la machine attendue
// jusqu'à sa borne, une passe coupée) n'a rien prouvé : elle n'est ni un rouge, ni un fichier qui ne
// se charge pas. `preuve` (scripts/activites.mjs) la rend « à repasser », nomme l'attente de la
// machine, et ne garde pas sa mesure : elle n'est ni écrite, ni relue comme un verdict, et la preuve
// suivante la rejoue. Les cas d'une attente jugent une mesure donnée (`preuveARepasser`), les autres
// jouent la mesure devant un faux npm.
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as activites from '../../scripts/activites.mjs';
import * as transitions from '../../scripts/transitions.mjs';
import {
  copieEssai,
  mesureDe,
  preuve,
  run,
  type Ctx,
  type Preuve,
  type Run,
} from './preuve-essai.js';

const preuveARepasser = activites.preuveARepasser as unknown as (
  ctx: Ctx,
  runs: Run[]
) => Preuve | null;

interface Decision {
  besoin?: { fait: string };
  suivant: { etape: string; tentative: number };
  arret?: { nom: string; rapport: string; attente?: boolean };
}
const transition = transitions.transition as (e: {
  etat: object;
  ticket: object;
  memoire?: object;
  faits: Record<string, unknown>;
}) => Decision;
const { PREUVE } = transitions as unknown as Record<string, string>;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'preuve-a-repasser-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const FORME = 'forme.test.mjs';
const AUTRE = 'autre.test.mjs';
const lot = (...fichiers: string[]) =>
  Object.fromEntries(fichiers.map(f => [f, `// ${f}, du lot\n`]));
const BORNE =
  '⏱ attente de la part bornée à 60 min (GRILLHOUSE_ATTENTE_MACHINE_MS), mesure d’un projet : la nuit tient la machine ; à repasser (code 75).';

describe('une preuve dont la passe attend la part de la machine jusqu’à sa borne', () => {
  // The pass never played: no report, code 75, its wait said.
  const attendue = (c: Ctx) =>
    preuveARepasser(c, [
      {
        ...run(FORME, [], 75),
        groupe: [AUTRE, FORME],
        attente: true,
        raison: BORNE,
        commande: `npm test -- --force ${AUTRE} ${FORME}`,
      },
    ])!;

  it('est « à repasser », une attente de la machine, et ne passe pas', () => {
    const r = attendue(copieEssai(ESSAIS, lot(FORME, AUTRE), []));
    expect(r.aRepasser).toBe(true);
    expect(r.attente).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.rouges).toBe(0);
  });

  it('ne compte aucun fichier « ne se charge pas » et ne rend aucun compte au bilan', () => {
    const r = attendue(copieEssai(ESSAIS, lot(FORME, AUTRE), []));
    expect(r.texte).not.toContain('ne se charge pas');
    expect(r.texte).not.toContain('Fichiers qui ne prouvent rien');
    expect(r.resume).not.toContain('qui ne se charge(nt) pas');
    expect(r.resultat).toBeUndefined();
  });

  it('nomme en première ligne la commande, son code et l’attente de la machine', () => {
    const r = attendue(copieEssai(ESSAIS, lot(FORME, AUTRE), []));
    const premiere = r.texte.split('\n')[0];
    expect(premiere).toContain('à repasser');
    expect(premiere).toContain(`npm test -- --force ${AUTRE} ${FORME} (code 75)`);
    expect(premiere).toContain('attente de la part bornée à 60 min');
    expect(premiere).toContain('la nuit tient la machine');
  });

  it('ne garde pas sa mesure : la preuve suivante la rejoue', () => {
    const r = attendue(copieEssai(ESSAIS, lot(FORME, AUTRE), []));
    expect(r.mesure).toBe(null);
  });
});

describe('une preuve dont la passe sort à 75 devant un faux npm', () => {
  const bin = path.join(ESSAIS, 'bin');
  const avant = { PATH: process.env.PATH };
  beforeAll(() => {
    mkdirSync(bin, { recursive: true });
    const npm = path.join(bin, 'npm');
    writeFileSync(npm, '#!/usr/bin/env node\nprocess.exit(75);\n');
    chmodSync(npm, 0o755);
    process.env.PATH = `${bin}${path.delimiter}${process.env.PATH ?? ''}`;
  });
  afterAll(() => {
    process.env.PATH = avant.PATH;
  });

  it('est « à repasser » sans être une attente de la machine, et rejoue à la preuve suivante', () => {
    const c = copieEssai(ESSAIS, lot(FORME), []);
    const premiere = preuve(c);
    expect(premiere.aRepasser).toBe(true);
    expect(premiere.attente).toBe(false);
    expect(premiere.ok).toBe(false);
    expect(premiere.texte).not.toContain('ne se charge pas');
    expect(premiere.texte.split('\n')[0]).toContain(`npm test -- --force ${FORME} (code 75)`);
    expect(premiere.mesure).toBe(null);

    preuve(c, { mesure: premiere.mesure });
    const lancements = readFileSync(c.journal, 'utf8')
      .split('\n')
      .filter(l => l.startsWith('$ npm '));
    expect(lancements).toEqual([
      `$ npm test -- --force ${FORME}`,
      `$ npm test -- --force ${FORME}`,
    ]);
  });

  it('ne juge pas une mesure qui n’a aucune passe à 75', () => {
    const c = copieEssai(ESSAIS, lot(FORME), []);
    expect(preuveARepasser(c, [run(FORME, [], 1)])).toBe(null);
  });

  it('ne relit pas comme un verdict une mesure à 75 gardée sous la clé du lot : elle rejoue', () => {
    // The measure a former proof kept, as BPScript's working directory held it.
    const c = copieEssai(ESSAIS, lot(FORME), []);
    const r = preuve(c, { mesure: mesureDe(c, [run(FORME, [], 75)]) });
    expect(
      readFileSync(c.journal, 'utf8')
        .split('\n')
        .filter(l => l.startsWith('$ npm '))
    ).toEqual([`$ npm test -- --force ${FORME}`]);
    expect(r.texte).not.toContain('ne se charge pas');
    expect(r.mesure).toBe(null);
  });

  it('s’arrête à la première passe à 75, sans jouer les autres paquets du lot', () => {
    const c = copieEssai(ESSAIS, lot(FORME, AUTRE), []);
    const r = preuve(c);
    expect(r.aRepasser).toBe(true);
    expect(
      readFileSync(c.journal, 'utf8')
        .split('\n')
        .filter(l => l.startsWith('$ npm '))
    ).toHaveLength(1);
  });
});

describe('une preuve dont la prise de part atteint la borne de son attente', () => {
  // The seam of `npm`: the pass takes its part under the environment of the process. A trial
  // machine with no memory left refuses the part, and a bound of 0 ms ends the wait at once:
  // nothing is launched.
  const VARIABLES = {
    GRILLHOUSE_PARTS_DE_LA_MACHINE: path.join(ESSAIS, 'parts', 'etat'),
    GRILLHOUSE_MESURE_D_ESSAI: JSON.stringify({
      coeurs: 12,
      charge: 1,
      memoireLibre: 0,
      memoireTotale: 32 * 1024 ** 3,
    }),
    GRILLHOUSE_ATTENTE_MACHINE_MS: '0',
    // Neither a part held by a parent nor an envelope: the pass asks for its own part.
    GRILLHOUSE_PART_TENUE: undefined,
    GRILLHOUSE_ENVELOPPE: undefined,
  };
  const avant = Object.fromEntries(Object.keys(VARIABLES).map(k => [k, process.env[k]]));
  const poser = (valeurs: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(valeurs)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  };
  beforeAll(() => poser(VARIABLES));
  afterAll(() => poser(avant));

  it('est « à repasser », une attente de la machine, sa raison nommée, sans lancer npm', () => {
    const c = copieEssai(ESSAIS, lot(FORME), []);
    const r = preuve(c);
    expect(r.aRepasser).toBe(true);
    expect(r.attente).toBe(true);
    const premiere = r.texte.split('\n')[0];
    expect(premiere).toContain(
      `npm test -- --force ${FORME} (code 75) : ⏱ attente de la part bornée`
    );
    expect(premiere).toContain('GRILLHOUSE_ATTENTE_MACHINE_MS');
    expect(r.texte).not.toContain('ne se charge pas');
    expect(r.mesure).toBe(null);
    // The pass never held its part: its command is written to the log, npm is not launched.
    expect(readFileSync(c.journal, 'utf8')).toContain('⏱ attente de la part bornée');
  });

  it('tient l’attente jusqu’à l’arrêt du circuit, sans relancer le testwriter', () => {
    const p = preuve(copieEssai(ESSAIS, lot(FORME), []));
    const lus: Record<string, unknown> = {};
    for (;;) {
      const d = transition({
        etat: { etape: PREUVE, tentative: 1, rapport: null, finale: false },
        ticket: { id: 'demo-1', paquets: ['.'], sorte: null, copie: '/copie' },
        memoire: {},
        faits: lus,
      });
      if (d.besoin) {
        expect(d.besoin.fait).toBe('preuve');
        lus.preuve = p;
        continue;
      }
      expect(d.arret).toMatchObject({ nom: 'a-repasser', attente: true, rapport: p.texte });
      expect(d.suivant).toMatchObject({ etape: PREUVE, tentative: 1 });
      break;
    }
  });
});
