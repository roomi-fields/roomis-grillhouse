// The fallback of the night end to end (packages/grillhouse/docs/architecture/entree.md §5.3 « Les
// deux parts »): the real `repli()` of scripts/nuit.sh, cut out of its text and played by bash under
// `set -u`, with the real scripts/repli-de-la-nuit.mjs and scripts/flux-de-la-nuit.mjs. Only what
// lies outside the frame is stood in: `gh` by a script on the PATH, the copy of the night by its
// flow file alone, `monter` by a function that notes its calls and plays nothing.
//
// A medium test, by exception: the seam between nuit.sh and the module of the fallback is what it
// proves, which a test of the module by import does not see.
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const NUIT = path.resolve(__dirname, '../../scripts/nuit.sh');
const REPLI = path.resolve(__dirname, '../../scripts/repli-de-la-nuit.mjs');
const FLUX = path.resolve(__dirname, '../../scripts/flux-de-la-nuit.mjs');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'repli-de-la-nuit-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const COMMIT = '0123456789abcdef0123456789abcdef01234567';
// A flow on PC2 whose job `mesures` plays the measures of time, as the flow of Grillhouse.
const AVEC_MESURES = `name: Nuit
env:
  TRANCHES: 3
jobs:
  tranches:
    runs-on: [self-hosted, pc2]
    steps:
      - run: npx --no-install grillhouse tests-de-nuit --hors-du-poste --tranche 1/3
  mesures:
    runs-on: [self-hosted, pc2]
    steps:
      - run: npx --no-install grillhouse tests-de-nuit --mesures
`;
// A flow on PC2 that declares no measure, as the template of the projects.
const SANS_MESURES = `name: Nuit
env:
  TRANCHES: 3
jobs:
  tranches:
    runs-on: [self-hosted, pc2]
    steps:
      - run: npx --no-install grillhouse tests-de-nuit --hors-du-poste --tranche 1/3
`;

// The function as nuit.sh writes it: from its line `repli() {` to the first line `}`.
function texteDuRepli() {
  const lignes = readFileSync(NUIT, 'utf8').split('\n');
  const debut = lignes.indexOf('repli() {');
  const fin = lignes.indexOf('}', debut);
  if (debut < 0 || fin < 0) {
    throw new Error('nuit.sh : repli() introuvable');
  }
  const texte = lignes.slice(debut, fin + 1).join('\n');
  // The trial stands for the function only while it reads these two modules.
  for (const module of [REPLI, FLUX]) {
    if (!texte.includes(path.basename(module))) {
      throw new Error(`nuit.sh : repli() ne lit plus ${path.basename(module)}`);
    }
  }
  return texte;
}

interface Job {
  name: string;
  status: string;
  conclusion: string | null;
  startedAt: string | null;
}
const ilYA = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const finie = (name: string, conclusion: string): Job => ({
  name,
  status: 'completed',
  conclusion,
  startedAt: ilYA(80),
});
const enAttente = (name: string): Job => ({
  name,
  status: 'queued',
  conclusion: null,
  startedAt: null,
});
const enCours = (name: string): Job => ({
  name,
  status: 'in_progress',
  conclusion: null,
  startedAt: ilYA(2),
});
const tranche = (n: number) => `tranches (26.x, ${n})`;
const MESURES = 'mesures (26.x)';
const vertes = [1, 2, 3].map(n => finie(tranche(n), 'success'));

interface Essai {
  jobs: Job[];
  flux?: string;
  /** The status of the run, and the minutes since its hour. */
  statut?: string;
  age?: number;
  /** The exit code of each command `monter` receives. */
  codeDeMonter?: number;
}

function jouer({
  jobs,
  flux = AVEC_MESURES,
  statut = 'completed',
  age = 90,
  codeDeMonter = 0,
}: Essai) {
  const d = mkdtempSync(path.join(ESSAIS, 'essai-'));
  const copie = path.join(d, 'copie');
  mkdirSync(path.join(copie, '.github/workflows'), { recursive: true });
  writeFileSync(path.join(copie, '.github/workflows/nuit.yml'), flux);
  writeFileSync(path.join(d, 'liste.json'), JSON.stringify([{ databaseId: 42, headSha: COMMIT }]));
  writeFileSync(
    path.join(d, 'vue.json'),
    JSON.stringify({ jobs, createdAt: ilYA(age), status: statut, headSha: COMMIT })
  );
  const bin = path.join(d, 'bin');
  mkdirSync(bin);
  writeFileSync(
    path.join(bin, 'gh'),
    `#!/usr/bin/env bash
case "$1 $2" in
  "repo view") echo "essai/projet" ;;
  "run list") cat "${d}/liste.json" ;;
  "run view") cat "${d}/vue.json" ;;
  "run cancel") echo "$3" >> "${d}/annulations" ;;
  *) echo "gh factice : appel inconnu : $*" >&2; exit 1 ;;
esac
`
  );
  chmodSync(path.join(bin, 'gh'), 0o755);
  const script = path.join(d, 'repli.sh');
  writeFileSync(
    script,
    `set -u
racine="${d}"
copie="${copie}"
ici="${path.dirname(REPLI)}"
tete="${COMMIT}"
tranches=3
etapes_pc2=()
taches_pc2=()
code_pc2=
monter() { printf '%s\\n' "$*" >> "${d}/montes"; return ${codeDeMonter}; }
${texteDuRepli()}
repli
echo "$code_pc2" > "${d}/code"
for e in "\${etapes_pc2[@]}"; do echo "$e" >> "${d}/etapes"; done
`
  );
  const r = spawnSync('bash', [script], {
    cwd: d,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}` },
  });
  const lire = (f: string) =>
    existsSync(path.join(d, f))
      ? readFileSync(path.join(d, f), 'utf8').split('\n').filter(Boolean)
      : [];
  const journal = `${r.stdout}${r.stderr}`;
  return {
    statut: r.status,
    journal,
    lignes: journal.split('\n').map(l => l.trimEnd()),
    code: lire('code')[0],
    etapes: lire('etapes'),
    annulations: lire('annulations'),
    // What `monter` received, each call from the sub-command on.
    montes: lire('montes').map(l => {
      const commande = `node ${path.join(path.dirname(REPLI), 'commande-du-langage.mjs')} `;
      return l.startsWith(commande) ? l.slice(commande.length) : l;
    }),
  };
}

const PC2 = 'relevé de la nuit : tranches jouées sur PC2 :';
const PC3 = 'relevé de la nuit : tranches jouées sur PC3 :';
const ETAT = 'relevé de la nuit : mesures de temps du flux :';
const rejeu = (n: number) => `tests-de-nuit --hors-du-poste --tranche ${n}/3`;

// The script ran to its end, and nothing in it threw.
const sansPlantage = (r: ReturnType<typeof jouer>) => {
  expect(r.journal).not.toMatch(/TypeError|unbound variable|gh factice/);
  expect(r.statut, r.journal).toBe(0);
};

describe('the fallback of a night whose flow declares the measures of time', () => {
  it('says the tranches played on PC2, on PC3 and the state of the measures; green measures leave the part of PC2 green', () => {
    const r = jouer({ jobs: [...vertes, finie(MESURES, 'success')] });
    sansPlantage(r);
    expect(r.lignes).toContain(`${PC2} 1 2 3`);
    expect(r.lignes).toContain(`${PC3} aucune`);
    expect(r.lignes).toContain(`${ETAT} verte`);
    expect(r.code).toBe('0');
    expect(r.etapes).toEqual([]);
    expect(r.montes).toEqual([]);
  });

  it.each([
    ['running', enCours(MESURES)],
    ['waiting', enAttente(MESURES)],
  ])(
    'leaves the part of PC2 to play again, naming the measures, while their job is %s',
    (_, job) => {
      const r = jouer({ jobs: [...vertes, job], statut: 'in_progress', age: 5 });
      sansPlantage(r);
      expect(r.lignes).toContain(`${ETAT} en-cours`);
      expect(r.code).toBe('75');
      expect(r.journal).toMatch(/la part de PC2 reste à repasser.* :\s+mesures\.$/m);
      expect(r.montes).toEqual([]);
    }
  );

  it('turns the part of PC2 red on red measures, naming them', () => {
    const r = jouer({ jobs: [...vertes, finie(MESURES, 'failure')] });
    sansPlantage(r);
    expect(r.lignes).toContain(`${ETAT} rouge`);
    expect(r.lignes).toContain('✗ les mesures de temps du flux sont rouges sur PC2.');
    expect(r.code).toBe('1');
    expect(r.etapes).toEqual(['les mesures de temps de la nuit sur PC2']);
    expect(r.montes).toEqual([]);
  });

  it('plays the interrupted measures again on PC3; green there, the part of PC2 is green', () => {
    const r = jouer({ jobs: [...vertes, finie(MESURES, 'cancelled')] });
    sansPlantage(r);
    expect(r.lignes).toContain(`${ETAT} a-rejouer`);
    expect(r.montes).toEqual(['tests-de-nuit --mesures']);
    expect(r.code).toBe('0');
  });

  it.each([
    [1, '1', ['les mesures de temps de la nuit, rejouées sur PC3']],
    [75, '75', []],
  ])('keeps the exit %i of the measures played again on PC3', (sortie, code, etapes) => {
    const r = jouer({ jobs: [...vertes, finie(MESURES, 'cancelled')], codeDeMonter: sortie });
    sansPlantage(r);
    expect(r.montes).toEqual(['tests-de-nuit --mesures']);
    expect(r.code).toBe(code);
    expect(r.etapes).toEqual(etapes);
  });
});

describe('the tranches of the fallback of a night', () => {
  const mesuresVertes = finie(MESURES, 'success');

  it('names a tranche red on PC2, turns the part of PC2 red and never plays it again', () => {
    const r = jouer({
      jobs: [
        finie(tranche(1), 'success'),
        finie(tranche(2), 'failure'),
        finie(tranche(3), 'success'),
        mesuresVertes,
      ],
    });
    sansPlantage(r);
    expect(r.lignes).toContain('✗ la tranche 2 de la nuit est rouge sur PC2.');
    expect(r.code).toBe('1');
    expect(r.etapes).toEqual(['la tranche 2 de la nuit sur PC2']);
    expect(r.montes).toEqual([]);
  });

  it('plays an interrupted tranche once on PC3, and no tranche finished on PC2', () => {
    const r = jouer({
      jobs: [
        finie(tranche(1), 'success'),
        finie(tranche(2), 'cancelled'),
        finie(tranche(3), 'failure'),
        mesuresVertes,
      ],
    });
    sansPlantage(r);
    expect(r.lignes).toContain(`${PC2} 1 3`);
    expect(r.lignes).toContain(`${PC3} 2`);
    expect(r.montes).toEqual([rejeu(2)]);
    expect(r.etapes).toEqual(['la tranche 3 de la nuit sur PC2']);
    expect(r.code).toBe('1');
  });

  it('cancels the run and plays on PC3, once each, the tranches not started sixty minutes after the hour of the flow', () => {
    const r = jouer({
      jobs: [
        finie(tranche(1), 'success'),
        enAttente(tranche(2)),
        enAttente(tranche(3)),
        mesuresVertes,
      ],
      statut: 'in_progress',
      age: 61,
    });
    sansPlantage(r);
    expect(r.annulations).toEqual(['42']);
    expect(r.lignes).toContain(`${PC2} 1`);
    expect(r.lignes).toContain(`${PC3} 2 3`);
    expect(r.montes).toEqual([rejeu(2), rejeu(3)]);
    expect(r.code).toBe('0');
  });

  it('turns the part of PC2 red when a tranche played again on PC3 is red', () => {
    const r = jouer({
      jobs: [finie(tranche(1), 'cancelled'), ...vertes.slice(1), mesuresVertes],
      codeDeMonter: 1,
    });
    sansPlantage(r);
    expect(r.montes).toEqual([rejeu(1)]);
    expect(r.etapes).toEqual(['la tranche 1 de la nuit, rejouée sur PC3']);
    expect(r.code).toBe('1');
  });

  it('leaves to PC2, to play again, a tranche that runs and one that waits for less than sixty minutes', () => {
    const r = jouer({
      jobs: [
        finie(tranche(1), 'success'),
        enCours(tranche(2)),
        enAttente(tranche(3)),
        mesuresVertes,
      ],
      statut: 'in_progress',
      age: 5,
    });
    sansPlantage(r);
    expect(r.code).toBe('75');
    const attente = r.lignes.find(l => l.includes('la part de PC2 reste à repasser')) ?? '';
    expect(attente.split(' :').at(-1)?.match(/\d+/g)?.sort()).toEqual(['2', '3']);
    expect(r.annulations).toEqual([]);
    expect(r.montes).toEqual([]);
  });
});

describe('the fallback of a night whose flow plays on PC2 without declaring the measures', () => {
  it.each([
    ['without any job of measures', vertes],
    ['even beside a job named for the measures', [...vertes, finie(MESURES, 'failure')]],
  ])(
    'writes no line of the measures, plays none and leaves green tranches green, %s',
    (_, jobs) => {
      const r = jouer({ jobs, flux: SANS_MESURES });
      sansPlantage(r);
      expect(r.lignes).toContain(`${PC2} 1 2 3`);
      expect(r.lignes).toContain(`${PC3} aucune`);
      expect(r.journal).not.toContain('mesures de temps du flux');
      expect(r.montes).toEqual([]);
      expect(r.etapes).toEqual([]);
      expect(r.code).toBe('0');
    }
  );
});
