// `regenerer` (scripts/activites.mjs, étape 4.2) : la régénération des références sur la copie
// entière, comme make refait une cible puis celles qui lisent ses sorties. Des tests moyens : un
// dépôt git d'essai créé par l'outil temporaire du langage, et pour lanceur de commandes de petites
// lignes de shell qui écrivent un fichier ; ni Turborepo ni npm.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';
import * as activites from '../../scripts/activites.mjs';
import { FICHIER as DETTE } from '../../scripts/dette.mjs';
import { Arret } from '../../scripts/ticket-du-circuit.mjs';
import { depotDeReferences, type Reference } from './references-essai.js';
import type { Ctx } from './preuve-essai.js';

interface Lot {
  commit: string;
  arbre: string;
}
interface Rendu {
  texte?: string;
  regenerees?: string[];
  fichiers?: string[];
  restreinte?: { avant: string; apres: string } | null;
  refus?: string[];
}
interface Entree {
  noms: string[];
  notes?: object[];
  suite?: 'controles' | 'passe' | null;
  refusAuLot?: boolean;
}
const leLotGarde = activites.leLotGarde as (ctx: object) => { lot: Lot | null };
const regenererBrut = activites.regenerer as (ctx: object, e: Entree & { avant: Lot }) => Rendu;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'activites-regenerer-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const regenerer = (ctx: Ctx, e: Entree) =>
  regenererBrut(ctx, { ...e, avant: leLotGarde(ctx).lot! });
const lire = (ctx: Ctx, f: string) => readFileSync(path.join(ctx.copie, f), 'utf8');
const ecrire = (ctx: Ctx, f: string, t: string) => writeFileSync(path.join(ctx.copie, f), t);
const statut = (ctx: Ctx, ...chemins: string[]) =>
  spawnSync('git', ['-C', ctx.copie, 'status', '--porcelain', '--', ...chemins], {
    encoding: 'utf8',
  }).stdout;
/** L'arrêt que lève <f>, ou fait échouer le test. */
function arret(f: () => unknown): Arret {
  try {
    f();
  } catch (e) {
    expect(e).toBeInstanceOf(Arret);
    return e as Arret;
  }
  throw new Error("aucun arrêt n'a été levé");
}

// Le plafond : un compte (4) et son plafond (plafond.txt), que la commande abaisse au compte.
const PLAFOND: Reference = {
  nom: 'le plafond des mots',
  commande: "printf '4\\n' > plafond.txt",
  fichiers: ['plafond.txt'],
};
const depot = (references: Reference[], fichiers: Record<string, string> = {}) =>
  depotDeReferences(ESSAIS, references, { 'plafond.txt': '5\n', ...fichiers });

describe('la régénération d’une référence qui change un fichier', () => {
  it('écrit le plafond abaissé dans la copie, nomme la référence et ses fichiers, et borne la passe qui suit', () => {
    const ctx = depot([PLAFOND]);
    const r = regenerer(ctx, { noms: [PLAFOND.nom] });
    expect(lire(ctx, 'plafond.txt')).toBe('4\n');
    expect(r.regenerees).toEqual([PLAFOND.nom]);
    expect(r.fichiers).toEqual(['plafond.txt']);
    expect(r.restreinte).toBeTruthy();
    expect(r.restreinte!.avant).not.toBe(r.restreinte!.apres);
    expect(r.texte).toContain(`- ${PLAFOND.nom} (\`${PLAFOND.commande}\`) : plafond.txt`);
  });

  it.each([
    ['controles', "les contrôles du plan, sur l'arbre régénéré"],
    ['passe', 'la passe finale'],
    [null, "la passe finale restreinte à ce qu'elles changent"],
  ] as const)('dit, après %s, la passe qui juge l’arbre régénéré', (suite, passe) => {
    const ctx = depot([PLAFOND]);
    expect(regenerer(ctx, { noms: [PLAFOND.nom], suite }).texte).toContain(
      `le lot porte leurs fichiers, puis ${passe}`
    );
  });

  it('une empreinte par scène, en partie régénérée : chaque fichier changé est couvert par le motif', () => {
    const SCENES = { zero: 0, un: 1, deux: 2 };
    const dossier = 'packages/binder/empreinte';
    const ctx = depot(
      [
        {
          nom: "l'empreinte des scènes",
          commande: `for s in un deux; do printf '{"mesure":%s}\\n' $([ $s = un ] && echo 2 || echo 4) > ${dossier}/$s.json; done`,
          fichiers: [`${dossier}/*.json`],
          tests: ['packages/binder/test/empreinte.test.mjs'],
        },
      ],
      Object.fromEntries(
        Object.entries(SCENES).map(([s, n]) => [`${dossier}/${s}.json`, `{"mesure":${n}}\n`])
      )
    );
    const r = regenerer(ctx, { noms: ["l'empreinte des scènes"] });
    expect([...r.fichiers!].sort()).toEqual([`${dossier}/deux.json`, `${dossier}/un.json`]);
    expect(lire(ctx, `${dossier}/zero.json`)).toBe('{"mesure":0}\n');
  });

  it('rejoue après elle la référence qui lit un fichier qu’elle vient d’écrire, une seule fois', () => {
    const ctx = depot(
      [
        {
          nom: "les rapports d'API",
          commande: "printf 'rapport v2\\n' > docs-interface.md",
          fichiers: ['docs-interface.md'],
        },
        {
          nom: "l'index des interfaces",
          commande: 'cp docs-interface.md index.md',
          fichiers: ['index.md'],
          lit: ['docs-interface.md'],
        },
      ],
      { 'docs-interface.md': 'rapport v1\n', 'index.md': 'rapport v1\n' }
    );
    const r = regenerer(ctx, { noms: ["les rapports d'API"] });
    expect(r.regenerees).toEqual(["les rapports d'API", "l'index des interfaces"]);
    expect(r.fichiers).toEqual(['docs-interface.md', 'index.md']);
    expect(lire(ctx, 'index.md')).toBe('rapport v2\n');
  });
});

describe('la régénération qui ne change aucun fichier', () => {
  it.each([
    [
      'controles',
      'les contrôles ne rejouent pas, et leurs rouges restent, chacun à son propriétaire',
    ],
    ['passe', 'la passe finale juge le lot tel quel'],
    [
      null,
      'aucune passe ne rejoue, et les rouges de la passe finale restent, chacun à son propriétaire',
    ],
  ] as const)('après %s, ne borne aucune passe et le dit', (suite, phrase) => {
    const ctx = depot([{ ...PLAFOND, commande: "printf '5\\n' > plafond.txt" }]);
    const r = regenerer(ctx, { noms: [PLAFOND.nom], suite });
    expect(r.fichiers).toEqual([]);
    expect(r.regenerees).toEqual([]);
    expect(r.restreinte).toBeNull();
    expect(r.texte).toContain(phrase);
  });
});

describe('la dette des gardes abaissée', () => {
  const dette = (n: number) => JSON.stringify({ vieux: { 'src/a.mjs': { vieux: { count: n } } } });
  const note = (trouve: number, garde = 'vieux') => ({
    garde,
    fichier: 'src/a.mjs',
    regle: 'vieux',
    trouve,
    genre: 'a-elaguer',
  });

  it('d’office, depuis les notes de la passe : la clé descend à ce que la garde trouve', () => {
    const ctx = depot([], { [DETTE]: dette(2) });
    const r = regenerer(ctx, { noms: ['la dette des gardes'], notes: [note(1)] });
    expect(r.fichiers).toEqual([DETTE]);
    expect(JSON.parse(lire(ctx, DETTE))).toEqual(JSON.parse(dette(1)));
  });

  it('une note d’une autre garde ne touche pas la dette de celle-ci', () => {
    const ctx = depot([], { [DETTE]: dette(2) });
    const r = regenerer(ctx, { noms: ['la dette des gardes'], notes: [note(1, 'autre')] });
    expect(r.fichiers).toEqual([]);
    expect(lire(ctx, DETTE)).toBe(dette(2));
  });

  it('une clé qui ne descend pas ne monte jamais', () => {
    const ctx = depot([], { [DETTE]: dette(2) });
    regenerer(ctx, { noms: ['la dette des gardes'], notes: [note(3)] });
    expect(lire(ctx, DETTE)).toBe(dette(2));
  });
});

describe('un refus de la commande d’une référence du projet', () => {
  // Elle écrit le compte dans le plafond, puis refuse : « le plafond ne monte pas ».
  const REFUS: Reference = {
    ...PLAFOND,
    commande:
      "printf '4\\n' > plafond.txt; echo '✗ le plafond ne monte pas : forms 4 > 3.'; exit 1",
  };
  const MONTE = '✗ le plafond ne monte pas : forms 4 > 3.';

  it('à côté de rouges du plan, rend le refus avec la fin de sa sortie et restaure la copie', () => {
    const ctx = depot([REFUS], { 'plafond.txt': '3\n' });
    const r = regenerer(ctx, { noms: [PLAFOND.nom], refusAuLot: true });
    expect(r.refus).toHaveLength(1);
    expect(r.refus![0]).toContain(`- ${PLAFOND.nom} : \`${REFUS.commande}\` rend le code 1.`);
    expect(r.refus![0]).toContain(MONTE);
    expect(lire(ctx, 'plafond.txt')).toBe('3\n');
    expect(statut(ctx, 'plafond.txt')).toBe('');
  });

  it('sans rouge du plan, arrête à « references », sa question nomme la commande et son code, la copie restaurée', () => {
    const ctx = depot([REFUS], { 'plafond.txt': '3\n' });
    const a = arret(() => regenerer(ctx, { noms: [PLAFOND.nom] }));
    expect(a.nom).toBe('references');
    expect(a.question).toContain(`- ${PLAFOND.nom} : \`${REFUS.commande}\` rend le code 1.`);
    expect(lire(ctx, 'plafond.txt')).toBe('3\n');
  });

  it('une commande qui échoue sans rien écrire arrête à « references » même avec des rouges du plan', () => {
    const ctx = depot([{ ...PLAFOND, commande: 'exit 127' }]);
    const a = arret(() => regenerer(ctx, { noms: [PLAFOND.nom], refusAuLot: true }));
    expect(a.nom).toBe('references');
    expect(a.question).toContain('rend le code 127 (une panne).');
  });
});

describe('l’arrêt de la régénération', () => {
  const ECART = "- autre.txt change, et aucune référence régénérée ne l'écrit.";
  const HORS_DECLARATION: Reference = {
    ...PLAFOND,
    commande: "printf '4\\n' > plafond.txt; printf 'hors de toute référence\\n' > autre.txt",
  };

  it('porte la liste de ses écarts dans sa question, sa pièce et son rapport', () => {
    const ctx = depot([HORS_DECLARATION]);
    const a = arret(() => regenerer(ctx, { noms: [PLAFOND.nom] }));
    expect(a.nom).toBe('references');
    expect(a.question).toContain('Les écarts de la régénération');
    expect(a.question).toContain(ECART);
    expect(a.piece).toContain(ECART);
    expect(a.rapport).toContain(ECART);
    expect(a.rapport).toContain('git diff');
  });

  it('rend la copie telle qu’avant la régénération : ni le fichier déclaré ni l’autre ne restent', () => {
    const ctx = depot([HORS_DECLARATION]);
    arret(() => regenerer(ctx, { noms: [PLAFOND.nom] }));
    expect(lire(ctx, 'plafond.txt')).toBe('5\n');
    expect(existsSync(path.join(ctx.copie, 'autre.txt'))).toBe(false);
    expect(statut(ctx)).toBe('');
  });

  it('ne retire pas le travail du lot que la régénération n’a pas écrit', () => {
    const ctx = depot([HORS_DECLARATION]);
    ecrire(ctx, 'lot.txt', 'le travail du lot\n');
    arret(() => regenerer(ctx, { noms: [PLAFOND.nom] }));
    expect(lire(ctx, 'lot.txt')).toBe('le travail du lot\n');
  });
});

describe('une référence que le cadre engendre', () => {
  it('un turbo.json que le lot rend périmé, hors du plan, est réécrit par sa commande', () => {
    const ctx = depot([], {
      'package.json': JSON.stringify({
        name: 'essai',
        private: true,
        workspaces: ['packages/*'],
      }),
      'packages/forms/package.json': JSON.stringify({
        name: '000-forms',
        type: 'module',
        scripts: { build: 'node -e 0' },
      }),
      'packages/binder/package.json': JSON.stringify({
        name: '030-binder',
        type: 'module',
        dependencies: { '000-forms': '*' },
        scripts: { build: 'node -e 0' },
      }),
    });
    const r = regenerer(ctx, { noms: ['les turbo.json des paquets'] });
    expect(r.regenerees).toEqual(['les turbo.json des paquets']);
    expect(r.fichiers).toContain('packages/binder/turbo.json');
    expect(lire(ctx, 'packages/binder/turbo.json')).toContain('000-forms#build');
  });
});
