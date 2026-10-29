// grillhouse-3dr.2.1, criterion 3 — one suite of conformity holds every module of language to the
// join (scripts/conformite.mjs), as ESLint's RuleTester holds a rule to its valid and invalid
// cases: each case has an entry that passes and a defective entry that fails with the faults it
// expects. It passes on the module typescript; each defective module, one defect each, fails its
// own case and no other, so that the suite catches a real defect. grillhouse-3dr.2.2: the suite
// covers the components alone, the readers, the elements of a lot, the shared test material, and
// each generated file late.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { cas, echecs } from '../../scripts/conformite.mjs';
import type { langageDe } from '../../scripts/langages.mjs';
import module from '../../scripts/langages/typescript/index.mjs';
import lesExemples from '../../scripts/langages/typescript/exemples.mjs';

const typescript = module as unknown as Langage;
const exemples = lesExemples as unknown as Parameters<typeof cas>[1];

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'conformite-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

type Langage = ReturnType<typeof langageDe>;
type Engendre = ReturnType<Langage['fichiersEngendres']>[number];

// The module typescript, the check of its generated files kept by repository: the mutants below
// share it, so that the suite plays each check once.
const verifies = new Map<string, unknown>();
const reference: Langage = {
  ...typescript,
  fichiersEngendres: (racine: string) =>
    typescript.fichiersEngendres(racine).map((e: Engendre) => ({
      ...e,
      verifier: (r: string) => {
        const cle = `${e.nom}\0${r}`;
        if (!verifies.has(cle)) {
          verifies.set(cle, e.verifier(r));
        }
        return verifies.get(cle) as ReturnType<Engendre['verifier']>;
      },
    })),
};

// The defects, each the case it must fail.
const MUTANTS: [string, string, Partial<Langage>][] = [
  [
    'touches sans dépendants transitifs',
    'touches',
    {
      touches: (racine: string, o: { depuis: string }) => {
        const t = typescript.touches(racine, o);
        return { ...t, dependants: t.dependants.slice(0, 1) };
      },
    },
  ],
  [
    'verdict qui lit le code 75 comme 1',
    'verdict',
    {
      verdict: (dossier: string) => {
        const v = typescript.verdict(dossier);
        return {
          ...v,
          taches: v.taches.map((t: { code: number | null }) => ({
            ...t,
            code: t.code === 75 ? 1 : t.code,
          })),
        };
      },
    },
  ],
  [
    'estUnTest qui rate *.spec.mjs',
    'estUnTest',
    {
      estUnTest: (chemin: string, racine: string) =>
        chemin.endsWith('.spec.mjs') ? null : typescript.estUnTest(chemin, racine),
    },
  ],
  [
    'fichiersEngendres dont la vérification ne voit jamais d’écart',
    'fichiersEngendres',
    {
      fichiersEngendres: (racine: string) =>
        reference.fichiersEngendres(racine).map((e: Engendre) => ({ ...e, verifier: () => [] })),
    },
  ],
  [
    'composantDe incohérent avec composants',
    'composantDe',
    {
      composantDe: (racine: string) => typescript.composants(racine)[0] ?? null,
    },
  ],
  [
    'une commande qui exécute au lieu de décrire',
    'commandes',
    {
      commandes: (racine: string) => {
        const c = typescript.commandes(racine);
        return { ...c, tester: { status: 0, stdout: '' } as unknown as typeof c.tester };
      },
    },
  ],
  ['gardes vide', 'gardes', { gardes: () => [] }],
  [
    'composants sans la matière partagée',
    'composants',
    {
      composants: (racine: string) =>
        typescript.composants(racine).filter((c: { nom: string }) => c.nom !== 'm'),
    },
  ],
  [
    'lecteurs qui ne voit aucune lecture',
    'lecteurs',
    {
      lecteurs: (racine: string, o: Parameters<Langage['lecteurs']>[1]) => ({
        ...typescript.lecteurs(racine, o),
        lit: new Map(),
      }),
    },
  ],
  [
    'un seul fichier engendré dont la vérification est aveugle',
    'fichiersEngendres',
    {
      fichiersEngendres: (racine: string) =>
        reference
          .fichiersEngendres(racine)
          .map((e: Engendre) =>
            e.gardes.includes('turbo-des-paquets') ? { ...e, verifier: () => [] } : e
          ),
    },
  ],
  [
    'elementsDuLot qui ne nomme aucun fichier',
    'elementsDuLot',
    {
      elementsDuLot: (racine: string, o: { avant: string; apres: string }) => ({
        ...typescript.elementsDuLot(racine, o),
        fichiers: [],
      }),
    },
  ],
  ['matieres vide', 'matieres', { matieres: () => [] }],
];

describe('grillhouse-3dr.2.1 — la suite de conformité de la jointure', { timeout: 180_000 }, () => {
  it('names one case per demand of the join', () => {
    const noms = cas(reference, exemples, { dans: ESSAIS }).map(c => c.nom);
    expect(noms).toEqual([
      'composants',
      'composantDe',
      'lecteurs',
      'touches',
      'commandes',
      'verdict',
      'estUnTest',
      'fichiersEngendres',
      'gardes',
      'elementsDuLot',
      'matieres',
    ]);
  });

  it('each case has a defective entry that fails with the faults it expects', () => {
    for (const c of cas(reference, exemples, { dans: ESSAIS })) {
      expect(c.attendu.length, c.nom).toBeGreaterThan(0);
    }
  });

  it('its defective entry of the generated files makes each of them late', () => {
    const c = cas(reference, exemples, { dans: ESSAIS }).find(k => k.nom === 'fichiersEngendres');
    expect(c?.attendu).toEqual(
      typescript.fichiersEngendres(ESSAIS).map((e: Engendre) => `${e.nom} : en retard`)
    );
  });

  it('passes on the module typescript', () => {
    expect(echecs(reference, exemples, { dans: ESSAIS })).toEqual([]);
  });

  it.each(MUTANTS)('%s fails its own case alone', (_defaut, attendu, mutation) => {
    const l = { ...reference, ...mutation } as Langage;
    expect(echecs(l, exemples, { dans: ESSAIS }).map(e => e.nom)).toEqual([attendu]);
  });
});
