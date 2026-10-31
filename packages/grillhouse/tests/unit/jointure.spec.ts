// grillhouse-3dr.2.1, criteria 1, 4, 8 and 9 — the join of the languages (docs/ARCHITECTURE.md,
// « La jointure des langages »): the core asks a module of language for its components, the
// components touched since a commit, its commands and their verdict, the rule of a test file, its
// generated files and its guards, and reads no file of the module typescript otherwise, as the
// core of Pants reads a backend through its rules alone.
//
// - The share of each file of `scripts/` and `bin/` between the core and the module typescript is
//   tests/temoins/repartition.json, exhaustive (grillhouse-3dr.2.2 moves the module's files by it).
// - A word of a tool (turbo, vitest, knip, dependency-cruiser, tsc; cargo since grillhouse-pkl.7)
//   in the code of the core is a rest that its ticket takes out, inscribed below: the comments,
//   which name the mature models (« as Turborepo does »), are not read, nor the join itself,
//   scripts/langages.mjs, whose list names each language by its module.
// - grillhouse-pkl.3: the module cargo, under scripts/langages/cargo/, takes its share of the
//   files, answers each member of the join, and names of the core its published entries alone.
// - grillhouse-pkl.5, criterion 4: the rights, the envelope, the launcher and the night name no
//   tool and no file of a module: they ask the module (`sorties`, `droits`, its commands), and
//   leave the rests.
// - grillhouse-pkl.7, criterion 5: the update, the source files, the session start and the list
//   of the migrations name no tool and no file of a module either: they ask the module
//   (`outils`, `binaires`, `ignorer`, `miseAJour`, `migrations`); no rest remains.
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import cargo from '../../scripts/langages/cargo/index.mjs';
import typescript from '../../scripts/langages/typescript/index.mjs';

const PAQUET = path.resolve(__dirname, '../..');
// The tools of npm of the module cargo, optional peers of the package.
const OUTILS_CARGO = (cargo as unknown as { outils: string[] }).outils;
const lire = (rel: string) => readFileSync(path.join(PAQUET, rel), 'utf8');
const REPARTITION = JSON.parse(
  readFileSync(path.join(PAQUET, 'tests/temoins/repartition.json'), 'utf8')
) as { noyau: string[]; typescript: string[]; cargo: string[] };
const DU_LANGAGE = new Set([...REPARTITION.typescript, ...REPARTITION.cargo]);

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

// The members of the interface `Langage` of scripts/jointure.d.ts: its own, and those of the
// `Composition` it extends (grillhouse-akd).
const membresDeLangage = () => {
  const texte = lire('scripts/jointure.d.ts');
  const corps = ['Composition \\{', 'Langage extends Composition \\{']
    .map(t => new RegExp(`export interface ${t}([\\s\\S]*?)\\n\\}`).exec(texte)?.[1] ?? '')
    .join('\n');
  return [...corps.matchAll(/^\s{2}(\w+)\??(?:\(|:)/gm)].map(m => m[1]);
};

const MOT = /turbo|vitest|knip|dependency-cruiser|\btsc\b|cargo/i;
// The rests of the core that name a tool, each with the ticket that takes it out: the file, and
// the pieces of its lines that may name one, in any case.
const RESTES: Record<string, { ticket: string; morceaux: string[] }> = {};
// The migrations rewrite the projects of each version: what they name stays as it was.
const HISTOIRE = 'scripts/migrations/';

describe('grillhouse-3dr.2.1 — la jointure des langages', () => {
  it('the share of scripts/ and bin/ is exhaustive, each file once', () => {
    const tous = [...fichiers('scripts'), ...fichiers('bin')].sort();
    const partages = [...REPARTITION.noyau, ...REPARTITION.typescript, ...REPARTITION.cargo].sort();
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
    // grillhouse-ca7: the declaration is the column « Langage » of the architecture, the only
    // reading, no language by default.
    expect(iface).toMatch(/colonne « Langage »/);
    expect(iface).not.toMatch(/sans déclaration est lu comme/);
  });

  it('criterion 1: jointure.d.ts declares exactly what the module typescript answers', () => {
    expect(membresDeLangage().sort()).toEqual(Object.keys(typescript).sort());
  });

  it('grillhouse-pkl.3: jointure.d.ts declares exactly what the module cargo answers, its files under its folder', () => {
    expect(membresDeLangage().sort()).toEqual(Object.keys(cargo).sort());
    expect(REPARTITION.cargo).toContain('scripts/langages/cargo/index.mjs');
    for (const f of REPARTITION.cargo) {
      expect(f).toMatch(/^scripts\/langages\/cargo\//);
    }
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
      .filter(f => f !== 'scripts/langages.mjs')
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

  // OSC Bridge, 0.25.3: the circuit refused its root crate, the components it read being the
  // workspaces of npm.
  it('grillhouse-x7c: the circuit lists its components by the join, never by the workspaces of npm', () => {
    const appels = lignesDeCode('scripts/circuit.mjs')
      .filter(([, l]) => /(?<![.\w])paquets\(/.test(l))
      .map(([n, l]) => `scripts/circuit.mjs:${n}: ${l.trim()}`);
    expect(appels).toEqual([]);
    expect(lire('scripts/circuit.mjs')).not.toMatch(/import \{[^}]*\bpaquets\b[^}]*\} from/);
  });

  // grillhouse-x7c.1: `--etendre` ordered the plan by the dependencies of the package.json files,
  // which no crate of OSC Bridge has; the order is the module's (`lecteurs`).
  it('grillhouse-x7c.1: the extension of the plan reads no package.json, its order the join’s', () => {
    const texte = lire('scripts/circuit.mjs');
    const corps = (nom: string) => {
      const debut = texte.indexOf(`function ${nom}(`);
      expect(debut, nom).toBeGreaterThan(-1);
      return texte.slice(debut, texte.indexOf('\n}\n', debut));
    };
    for (const nom of ['etendre', 'ordonnerLePlan']) {
      expect(corps(nom), nom).not.toMatch(/package\.json|[dD]ependencies|lireJson/);
    }
    expect(corps('ordonnerLePlan')).toMatch(/\.lecteurs\(/);
  });

  it('criterion 9: scripts/mesure/ holds the three files of the core, the vitest-config/ of the module none of them', () => {
    const trois = ['avancement.mjs', 'base-de-passe.mjs', 'pression.mjs'];
    expect(
      fichiers('scripts/mesure')
        .map(f => path.basename(f))
        .sort()
    ).toEqual(trois);
    // grillhouse-3dr.2.2: vitest-config/ lives in the module typescript; no file of the package
    // lies under scripts/vitest-config/ any more (the share is exhaustive, above).
    const partages = [...REPARTITION.noyau, ...REPARTITION.typescript];
    expect(partages.filter(f => f.startsWith('scripts/vitest-config/'))).toEqual([]);
    const config = fichiers(`${MODULE}vitest-config`).map(f => path.basename(f));
    expect(config).toContain('base.mjs');
    for (const f of trois) {
      expect(config).not.toContain(f);
    }
    for (const f of trois) {
      expect(REPARTITION.noyau).toContain(`scripts/mesure/${f}`);
    }
  });
});

// grillhouse-3dr.2.2, criteria 10 and 11 (grillhouse-3dr.2, § Amendement) — the module typescript
// under its folder, scripts/langages/typescript/, its published entries at their address; the
// rules of the join held by the guard of the boundaries (`grillhouse frontieres`, the repository's
// own rules in .dependency-cruiser.projet.cjs), as Nx's enforce-module-boundaries holds a plugin
// to the devkit; the tools of the language, optional peers of the package.
const DEPOT = path.resolve(PAQUET, '../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'jointure-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const MODULE = 'scripts/langages/typescript/';
const PKG = JSON.parse(lire('package.json')) as {
  exports: Record<string, string | Record<string, string>>;
  dependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};
const cibles = (e: string | Record<string, string>) =>
  (typeof e === 'string' ? [e] : Object.values(e)).map(c => path.posix.normalize(c));
// What a shell script names beside itself (`"$ici/<chemin>"`), resolved from its folder.
const duShell = (rel: string) =>
  rel.endsWith('.sh')
    ? lignesDeCode(rel).flatMap(([, l]) =>
        [...l.matchAll(/\$ici\/([\w./-]+\.(?:mjs|sh|cjs|js))/g)].map(m =>
          path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1]))
        )
      )
    : [];
// The files of a module of language the core names, each with the ticket that takes it out: the
// scripts of the shell that run a module's file by its path.
const NOMMES_EN_RESTE: Record<string, { ticket: string; fichiers: string[] }> = {};

// The violations of the rules of the repository's own (.dependency-cruiser.projet.cjs) that
// dependency-cruiser finds under <chemins> of the repository <racine>.
async function violations(racine: string, chemins: string[]) {
  type Violation = { from: string; to: string; rule: { name: string } };
  const { cruise } = (await import('dependency-cruiser')) as unknown as {
    cruise: (
      a: string[],
      o: Record<string, unknown>
    ) => Promise<{ output: string | { summary: { violations: Violation[] } } }>;
  };
  const regles = (await import(path.join(DEPOT, '.dependency-cruiser.projet.cjs'))) as {
    default: { forbidden: unknown[] };
  };
  const { output } = await cruise(chemins, {
    baseDir: racine,
    validate: true,
    ruleSet: { forbidden: regles.default.forbidden },
  });
  type Resultat = { summary: { violations: Violation[] } };
  const r = typeof output === 'string' ? (JSON.parse(output) as Resultat) : output;
  return r.summary.violations;
}

describe('grillhouse-3dr.2.2 — le module typescript sous son dossier', () => {
  it('every file of the module typescript lies under scripts/langages/typescript/, and exists', () => {
    expect(REPARTITION.typescript.length).toBeGreaterThan(30);
    for (const f of REPARTITION.typescript) {
      expect(f).toMatch(/^scripts\/langages\/typescript\//);
    }
  });

  it('criterion 10: the published entries keep their address, the module’s lead under its folder', () => {
    expect(Object.keys(PKG.exports)).toEqual([
      './package.json',
      './consommateurs',
      './conformite',
      './dette',
      './jointure',
      './paquets',
      './resultats',
      './vitest-config',
      './vitest-config/mesure',
      './vitest-config/duree',
      './tsdoc-base.json',
    ]);
    for (const e of [
      './consommateurs',
      './vitest-config',
      './vitest-config/mesure',
      './vitest-config/duree',
    ]) {
      for (const c of cibles(PKG.exports[e])) {
        expect(c, e).toMatch(/^scripts\/langages\/typescript\//);
        expect(REPARTITION.typescript, e).toContain(c);
      }
    }
    for (const e of ['./conformite', './dette', './jointure', './paquets', './resultats']) {
      for (const c of cibles(PKG.exports[e])) {
        expect(REPARTITION.noyau, e).toContain(c);
      }
    }
  });

  it('criterion 11: the guard of the boundaries refuses the core reading a module out of the join, and a module reading the core out of its entries', async () => {
    const essai = mkdtempSync(path.join(ESSAIS, 'frontieres-'));
    {
      const ecrire = (rel: string, texte: string) => {
        mkdirSync(path.dirname(path.join(essai, rel)), { recursive: true });
        writeFileSync(path.join(essai, rel), texte);
      };
      const p = 'packages/grillhouse/';
      ecrire(`${p}package.json`, lire('package.json'));
      ecrire(`${p}scripts/dette.mjs`, 'export const d = 1;\n');
      ecrire(`${p}scripts/interne.mjs`, 'export const i = 1;\n');
      ecrire(
        `${p}scripts/circuit.mjs`,
        "import o from './langages/typescript/outil.mjs';\nexport default o;\n"
      );
      ecrire(
        `${p}scripts/langages.mjs`,
        "import t from './langages/typescript/index.mjs';\nexport default t;\n"
      );
      ecrire(`${p}bin/grillhouse.mjs`, "import '../scripts/langages/typescript/outil.mjs';\n");
      ecrire(`${p}${MODULE}outil.mjs`, 'export default 1;\n');
      ecrire(
        `${p}${MODULE}index.mjs`,
        "import { d } from '../../dette.mjs';\nimport { i } from '../../interne.mjs';\nimport o from './outil.mjs';\nexport default [d, i, o];\n"
      );
      const vues = (await violations(essai, [`${p}scripts`, `${p}bin`]))
        .map(v => `${v.rule.name} ${v.from} → ${v.to}`)
        .sort();
      expect(vues).toEqual([
        `module-hors-des-entrees-du-noyau ${p}${MODULE}index.mjs → ${p}scripts/interne.mjs`,
        `noyau-hors-de-la-jointure ${p}bin/grillhouse.mjs → ${p}${MODULE}outil.mjs`,
        `noyau-hors-de-la-jointure ${p}scripts/circuit.mjs → ${p}${MODULE}outil.mjs`,
      ]);
    }
  }, 60_000);

  it('criterion 11: the core and the module typescript of the repository break no rule of the join', async () => {
    const vues = await violations(DEPOT, [
      'packages/grillhouse/scripts',
      'packages/grillhouse/bin',
    ]);
    expect(vues.map(v => `${v.from} → ${v.to}`)).toEqual([]);
  }, 60_000);

  it('the core names no file of a module of language out of the join, out of the rests and their ticket', () => {
    const DES_MODULES = (f: string) => f.startsWith('scripts/langages/');
    const trouves = REPARTITION.noyau
      .filter(f => f !== 'scripts/langages.mjs' && !f.endsWith('.d.ts'))
      .flatMap(f =>
        [...nommes(f), ...voisins(f), ...duShell(f)]
          .filter(DES_MODULES)
          .filter(n => !(NOMMES_EN_RESTE[f]?.fichiers ?? []).includes(n))
          .map(n => `${f} → ${n}`)
      );
    expect(trouves).toEqual([]);
    for (const [f, r] of Object.entries(NOMMES_EN_RESTE)) {
      expect(r.ticket, f).toMatch(/^grillhouse-pkl\.\d/);
      for (const n of r.fichiers) {
        expect(REPARTITION.typescript, f).toContain(n);
      }
    }
  });

  it('the modules of language name of the core only its published entries and its command', () => {
    const entrees = new Set([
      'bin/grillhouse.mjs',
      ...Object.values(PKG.exports)
        .flatMap(cibles)
        .filter(c => REPARTITION.noyau.includes(c)),
    ]);
    const trouves = [...REPARTITION.typescript, ...REPARTITION.cargo]
      .filter(f => /\.(mjs|js|cjs)$/.test(f))
      .flatMap(f =>
        [...nommes(f), ...voisins(f)]
          .filter(n => REPARTITION.noyau.includes(n) && !entrees.has(n))
          .map(n => `${f} → ${n}`)
      );
    expect(trouves).toEqual([]);
  });

  it('the tools of the modules are optional peers of the package; its dependencies are the core’s', () => {
    expect(Object.keys(PKG.dependencies).sort()).toEqual(['semver', 'yaml']);
    // The module typescript's, then the module cargo's (grillhouse-ool: smol-toml, the reader of
    // a Cargo.toml).
    const outils = [
      '@microsoft/api-extractor',
      '@microsoft/api-extractor-model',
      '@microsoft/tsdoc-config',
      'dependency-cruiser',
      'jsonc-parser',
      'knip',
      'smol-toml',
      'turbo',
      'typescript',
      'vitest',
    ];
    expect(OUTILS_CARGO).toEqual(['smol-toml']);
    expect(Object.keys(PKG.peerDependencies).sort()).toEqual(outils);
    for (const o of outils) {
      expect(PKG.peerDependenciesMeta?.[o], o).toEqual({ optional: true });
    }
  });

  it('each optional peer admits the version its module’s template installs and the one BPScript holds', () => {
    // npm checks an optional peer as soon as the project holds it: a range that refuses the
    // project's version stops `npm install` (ERESOLVE). BPScript's versions, read in its
    // package.json on 2026-10-29 (its devDependencies).
    const BPSCRIPT: Record<string, string> = {
      'dependency-cruiser': '^16.10.4',
      knip: '^6.41.0',
      turbo: '2.11.8',
      vitest: '^2.1.9',
    };
    // semver ships no types of its own: required with the API this test calls.
    const semver = createRequire(import.meta.url)('semver') as {
      satisfies(v: string, r: string): boolean;
      minVersion(r: string): { version: string } | null;
    };
    // A tool of the module cargo is read in its template (templates/cargo/), the others in the
    // template of a project of TypeScript: the update adds each to a project of its language alone.
    const lu = (rel: string) =>
      JSON.parse(readFileSync(path.join(DEPOT, rel, 'package.json'), 'utf8')) as {
        devDependencies: Record<string, string>;
      };
    const [projet, deCargo] = [lu('templates/projet'), lu('templates/cargo')];
    const version = (nom: string) =>
      (OUTILS_CARGO.includes(nom) ? deCargo : projet).devDependencies[nom];
    const refus = Object.entries(PKG.peerDependencies).flatMap(([nom, plage]) =>
      [
        ['gabarit', version(nom)],
        ['BPScript', BPSCRIPT[nom]],
      ]
        .filter((v): v is [string, string] => typeof v[1] === 'string')
        .filter(([, v]) => !semver.satisfies(semver.minVersion(v)?.version ?? v, plage))
        .map(([qui, v]) => `${nom} ${plage} refuse ${v} (${qui})`)
    );
    expect(refus).toEqual([]);
    for (const nom of Object.keys(PKG.peerDependencies)) {
      expect(version(nom), nom).toBeTypeOf('string');
    }
    expect(projet.devDependencies['smol-toml']).toBeUndefined();
  });
});
