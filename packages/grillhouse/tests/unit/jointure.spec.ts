// grillhouse-3dr.2.1, criteria 1, 4, 8 and 9 — the join of the languages (docs/ARCHITECTURE.md,
// « La jointure des langages »): the core asks a module of language for its components, the
// components touched since a commit, its commands and their verdict, the rule of a test file, its
// generated files and its guards, and reads no file of the module typescript otherwise, as the
// core of Pants reads a backend through its rules alone.
//
// - The share of each file of `scripts/` and `bin/` between the core and the module typescript is
//   tests/temoins/repartition.json, exhaustive (grillhouse-3dr.2.2 moves the module's files by it).
// - A word of a tool (turbo, vitest, knip, dependency-cruiser, tsc) in the code of the core is a
//   rest that its ticket takes out, inscribed below: the comments, which name the mature models
//   (« as Turborepo does »), are not read.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import typescript from '../../scripts/langages/typescript/index.mjs';

const PAQUET = path.resolve(__dirname, '../..');
const lire = (rel: string) => readFileSync(path.join(PAQUET, rel), 'utf8');
const REPARTITION = JSON.parse(
  readFileSync(path.join(PAQUET, 'tests/temoins/repartition.json'), 'utf8')
) as { noyau: string[]; typescript: string[] };
const DU_LANGAGE = new Set(REPARTITION.typescript);

// Every file under <rel>, from the package.
const fichiers = (rel: string): string[] =>
  readdirSync(path.join(PAQUET, rel)).flatMap(n => {
    const r = `${rel}/${n}`;
    return statSync(path.join(PAQUET, r)).isDirectory() ? fichiers(r) : [r];
  });

// The lines of code of <rel>, its comments left out: `[numéro, ligne]`.
const lignesDeCode = (rel: string): [number, string][] => {
  const sh = rel.endsWith('.sh');
  return lire(rel)
    .split('\n')
    .map((l, i): [number, string] => [i + 1, l])
    .filter(([, l]) => {
      const t = l.trim();
      return !(sh ? t.startsWith('#') : /^(\/\/|\*|\/\*)/.test(t));
    });
};

// The files of the package <rel> names in its code by a relative string, resolved from its folder.
const nommes = (rel: string) =>
  lignesDeCode(rel).flatMap(([, l]) =>
    [...l.matchAll(/['"`](\.{1,2}\/[^'"`$]+?\.(?:mjs|js|cjs|sh|json|ts))['"`]/g)].map(m =>
      path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1]))
    )
  );
// The files of the package <rel> names by a call of a script beside it (`ici('x.mjs')`).
const voisins = (rel: string) =>
  lignesDeCode(rel).flatMap(([, l]) =>
    [...l.matchAll(/\bici\(\s*['"`]([^'"`]+)['"`]/g)].map(m =>
      path.posix.join(path.posix.dirname(rel), m[1])
    )
  );

// The members of the interface `Langage` of scripts/jointure.d.ts.
const membresDeLangage = () => {
  const corps =
    /export interface Langage \{([\s\S]*?)\n\}/.exec(lire('scripts/jointure.d.ts'))?.[1] ?? '';
  return [...corps.matchAll(/^\s{2}(\w+)\??(?:\(|:)/gm)].map(m => m[1]);
};

const MOT = /turbo|vitest|knip|dependency-cruiser|\btsc\b/i;
// The rests of the core that name a tool, each with the ticket that takes it out: the file, and
// the pieces of its lines that may name one, in any case.
const RESTES: Record<string, { ticket: string; morceaux: string[] }> = {
  'scripts/circuit.mjs': { ticket: 'grillhouse-pkl.2', morceaux: ['test:vitest'] },
  'scripts/droits.mjs': { ticket: 'grillhouse-pkl.5', morceaux: ['vitest', 'turbo'] },
  'scripts/enveloppe/enveloppe.mjs': { ticket: 'grillhouse-pkl.5', morceaux: ['.turbo'] },
  'scripts/enveloppe/lancer.sh': { ticket: 'grillhouse-pkl.5', morceaux: ['turbo'] },
  'scripts/nuit.sh': { ticket: 'grillhouse-pkl.5', morceaux: ['turbo', 'vitest'] },
  'scripts/sources.mjs': { ticket: 'grillhouse-pkl.7', morceaux: ['.turbo'] },
  'scripts/session-start.sh': { ticket: 'grillhouse-pkl.7', morceaux: ['turbo'] },
  'scripts/grillhouse-maj.mjs': {
    ticket: 'grillhouse-pkl.7',
    morceaux: ['turbo', 'vitest', 'knip', 'dependency-cruiser'],
  },
  'scripts/migrations.mjs': {
    ticket: 'grillhouse-pkl.7',
    morceaux: ['config-vitest', 'configvitest'],
  },
  'scripts/sous-commandes.mjs': {
    ticket: 'grillhouse-3dr.2.2',
    morceaux: ["'turbo-des-paquets': 'turbo-des-paquets.mjs'"],
  },
};
// The migrations rewrite the projects of each version: what they name stays as it was.
const HISTOIRE = 'scripts/migrations/';

describe('grillhouse-3dr.2.1 — la jointure des langages', () => {
  it('the share of scripts/ and bin/ is exhaustive, each file once', () => {
    const tous = [...fichiers('scripts'), ...fichiers('bin')].sort();
    const partages = [...REPARTITION.noyau, ...REPARTITION.typescript].sort();
    expect(partages).toEqual(tous);
    expect(new Set(partages).size).toBe(partages.length);
  });

  it('criterion 1: the core’s INTERFACE.md and CADRE.md exist, and the INTERFACE names each demand', () => {
    const iface = lire('docs/INTERFACE.md');
    expect(lire('docs/CADRE.md')).toMatch(/^# /);
    const membres = membresDeLangage();
    expect(membres.length).toBeGreaterThan(5);
    for (const m of membres) {
      expect(iface, m).toContain(`\`${m}\``);
    }
    expect(iface).toMatch(/\["typescript"\]/);
    expect(iface).toContain('grillhouse-3dr.2.3');
  });

  it('criterion 1: jointure.d.ts declares exactly what the module typescript answers', () => {
    expect(membresDeLangage().sort()).toEqual(Object.keys(typescript).sort());
  });

  it('criterion 4: composants-affectes, dernier-vert, the lock and the guards read no file of the language', () => {
    const lus = [
      'scripts/composants-affectes.mjs',
      'scripts/dernier-vert.mjs',
      'scripts/verrous/verrou.mjs',
      'scripts/gardes-du-cadre.mjs',
    ].flatMap(f => [...nommes(f), ...voisins(f)].map(n => `${f} → ${n}`));
    expect(lus.filter(l => DU_LANGAGE.has(l.split(' → ')[1]))).toEqual([]);
  });

  it('criterion 4: no word of a tool in the code of the core, out of the rests and their ticket', () => {
    const trouves = REPARTITION.noyau
      .filter(f => /\.(mjs|js|cjs|sh)$/.test(f) && !f.startsWith(HISTOIRE))
      .flatMap(f =>
        lignesDeCode(f)
          .filter(([, l]) => MOT.test(l))
          .filter(([, l]) => !(RESTES[f]?.morceaux ?? []).some(m => l.toLowerCase().includes(m)))
          .map(([n, l]) => `${f}:${n}: ${l.trim()}`)
      );
    expect(trouves).toEqual([]);
    for (const r of Object.values(RESTES)) {
      expect(r.ticket).toMatch(/^grillhouse-(pkl|3dr)\.\d/);
    }
  });

  it('criterion 8: resultats.mjs reads no summary and no report of a tool; its entry is unchanged', () => {
    const texte = lignesDeCode('scripts/resultats.mjs')
      .map(([, l]) => l)
      .join('\n');
    for (const mot of [
      'TURBO',
      'VITEST',
      'lireResumes',
      'lireRapportsVitest',
      'garderLesResumes',
    ]) {
      expect(texte, mot).not.toMatch(new RegExp(`\\b${mot}\\b`));
    }
    expect(texte).toMatch(/export function ecrireSarif\b/);
    expect(texte).toMatch(/export const RESULTATS = 'GRILLHOUSE_RESULTATS'/);
    const temoin = JSON.parse(lire('tests/temoins/entrees.json')) as Record<string, string>;
    expect(lire('scripts/resultats.d.ts')).toBe(temoin['scripts/resultats.d.ts']);
  });

  it('criterion 9: scripts/mesure/ holds the three files of the core, scripts/vitest-config/ none of them', () => {
    const trois = ['avancement.mjs', 'base-de-passe.mjs', 'pression.mjs'];
    expect(
      fichiers('scripts/mesure')
        .map(f => path.basename(f))
        .sort()
    ).toEqual(trois);
    const config = fichiers('scripts/vitest-config').map(f => path.basename(f));
    for (const f of trois) {
      expect(config).not.toContain(f);
    }
    for (const f of trois) {
      expect(REPARTITION.noyau).toContain(`scripts/mesure/${f}`);
    }
  });
});
