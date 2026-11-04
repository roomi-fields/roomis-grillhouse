// grillhouse-44b.8: a flow of the CI declares the packages it exercises, `grillhouse.flux` of the
// root package.json (scripts/flux-des-paquets.mjs), as `grillhouse.engendres` and
// `grillhouse.outils` declare theirs: `{ ".github/workflows/<flux>.yml": ["<paquet>", …] }`. A guard
// (`grillhouse flux-des-paquets`) refuses a workflow without entry, an unknown package and a
// declared flow without file; the reviewer's instruction carries one line per flow the lot touches.
// Witness: SyntHub, a release trial that did not follow a change of the service, which no review
// read.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { declarerLeLangage } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { afterAll, describe, expect, it } from 'vitest';
import { ARRETS, consigne, fluxAuLancement } from '../../scripts/circuit.mjs';
import {
  consigneDesFlux,
  constats,
  fluxDe,
  GARDE,
  lireFlux,
  SCRIPT,
} from '../../scripts/flux-des-paquets.mjs';
import { gardesDuCadre, nomsDesGardes } from '../../scripts/gardes-du-cadre.mjs';

const SCRIPT_DE_LA_GARDE = () => SCRIPT;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'flux-des-paquets-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const CI = '.github/workflows/ci.yml';
const DEPLOIEMENT = '.github/workflows/deploy-docs.yml';
const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};

// A project whose package.json declares <flux> (absent when undefined), with the packages <paquets>
// (folder → files, a `package.json` named `@p/<dossier>` unless given) and the workflows <flux_>.
function projet(flux: unknown, paquets: Record<string, Record<string, string>>, ymls: string[]) {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  ecrire(
    racine,
    'package.json',
    JSON.stringify({
      name: 'p',
      workspaces: ['packages/*'],
      ...(flux === undefined ? {} : { grillhouse: { flux } }),
    })
  );
  for (const [dossier, fichiers] of Object.entries(paquets)) {
    ecrire(racine, `packages/${dossier}/package.json`, JSON.stringify({ name: `@p/${dossier}` }));
    for (const [f, t] of Object.entries(fichiers)) {
      ecrire(racine, `packages/${dossier}/${f}`, t);
    }
  }
  for (const y of ymls) {
    ecrire(racine, y, 'name: x\n');
  }
  return racine;
}
const messages = (racine: string) => constats(racine).map(c => c.message);

describe('critère 4 — la clé grillhouse.flux se lit comme celles d’engendres et d’outils', () => {
  it('donne chaque flux déclaré avec ses paquets', () => {
    expect(
      lireFlux({ grillhouse: { flux: { [CI]: ['@p/a', '@p/b'], [DEPLOIEMENT]: [] } } })
    ).toEqual({
      flux: [
        { fichier: CI, paquets: ['@p/a', '@p/b'] },
        { fichier: DEPLOIEMENT, paquets: [] },
      ],
      fautes: [],
    });
  });

  it('une clé absente ou nulle ne déclare aucun flux, sans faute', () => {
    expect(lireFlux({ name: 'x' })).toEqual({ flux: [], fautes: [] });
    expect(lireFlux({ grillhouse: { flux: null } })).toEqual({ flux: [], fautes: [] });
  });

  it('une valeur qui n’est pas un objet est refusée par le nom de la clé, sans flux', () => {
    for (const v of [['a'], 'ci.yml', 3]) {
      const r = lireFlux({ grillhouse: { flux: v } });
      expect(r.flux).toEqual([]);
      expect(r.fautes).toHaveLength(1);
      expect(r.fautes[0]).toContain('grillhouse.flux');
    }
  });

  it('une clé hors de .github/workflows est refusée, la clé nommée', () => {
    for (const cle of ['ci.yml', 'docs/ci.yml', '../.github/workflows/ci.yml', '/etc/ci.yml']) {
      const r = lireFlux({ grillhouse: { flux: { [CI]: ['@p/a'], [cle]: ['@p/a'] } } });
      expect(r.flux).toEqual([]);
      expect(r.fautes.join('\n')).toContain(cle);
      expect(r.fautes.join('\n')).toContain('grillhouse.flux');
    }
  });

  it('une liste qui n’est pas de chaînes est refusée, la clé du flux nommée', () => {
    for (const v of ['@p/a', [1], ['@p/a', null], { a: 1 }]) {
      const r = lireFlux({ grillhouse: { flux: { [CI]: v } } });
      expect(r.flux).toEqual([]);
      expect(r.fautes.join('\n')).toContain(CI);
    }
  });

  it('fluxDe lit la clé du projet, et lève les fautes, une par ligne', () => {
    expect(fluxDe(projet({ [CI]: ['@p/a'] }, {}, []))).toEqual([
      { fichier: CI, paquets: ['@p/a'] },
    ]);
    expect(fluxDe(projet(undefined, {}, []))).toEqual([]);
    expect(() => fluxDe(projet({ 'ci.yml': ['@p/a'] }, {}, []))).toThrow(/ci\.yml/);
  });

  it('arrête le circuit au lancement, « lancement », avant toute séance, la clé nommée', () => {
    expect(fluxAuLancement(projet({ [CI]: ['@p/a'] }, {}, []))).toMatchObject({
      flux: [{ fichier: CI }],
    });
    const { arret, flux } = fluxAuLancement(projet({ [CI]: 'a' }, {}, []));
    expect(flux).toBeUndefined();
    expect(arret).toMatchObject({ code: ARRETS.lancement, nom: 'lancement' });
    for (const t of [arret?.rapport, arret?.piece, arret?.question]) {
      expect(t).toContain('grillhouse.flux');
      expect(t).toContain(CI);
    }
  });
});

describe('critère 1 — la garde refuse un fichier sans entrée et un nom de paquet inconnu', () => {
  it('ne refuse rien quand chaque flux est déclaré avec des paquets connus', () => {
    const racine = projet({ [CI]: ['@p/a', '@p/b'], [DEPLOIEMENT]: ['@p/a'] }, { a: {}, b: {} }, [
      CI,
      DEPLOIEMENT,
    ]);
    expect(messages(racine)).toEqual([]);
  });

  it('refuse un fichier de .github/workflows sans entrée, son fichier nommé', () => {
    const racine = projet({ [CI]: ['@p/a'] }, { a: {} }, [CI, DEPLOIEMENT]);
    const out = constats(racine);
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain(DEPLOIEMENT);
  });

  it('refuse chaque fichier sans entrée, .yaml compris', () => {
    const racine = projet({}, { a: {} }, [CI, DEPLOIEMENT, '.github/workflows/release.yaml']);
    const dit = messages(racine).join('\n');
    for (const f of [CI, DEPLOIEMENT, '.github/workflows/release.yaml']) {
      expect(dit).toContain(f);
    }
  });

  it('refuse un nom de paquet inconnu, le nom et le flux nommés', () => {
    const racine = projet({ [CI]: ['@p/a', '@p/fantome'] }, { a: {} }, [CI]);
    const out = constats(racine);
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain('@p/fantome');
    expect(out[0].message).toContain(CI);
  });

  it('refuse un nom de dossier au lieu du nom du paquet', () => {
    const racine = projet({ [CI]: ['packages/a'] }, { a: {} }, [CI]);
    expect(messages(racine).join('\n')).toContain('packages/a');
  });
});

describe('critère 5 — un flux déclaré sans fichier est refusé ; un projet sans flux n’a rien à dire', () => {
  it('refuse un flux déclaré dont le fichier n’existe pas, nommé', () => {
    const racine = projet({ [CI]: ['@p/a'], [DEPLOIEMENT]: ['@p/a'] }, { a: {} }, [CI]);
    const out = constats(racine);
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain(DEPLOIEMENT);
  });

  it('ne refuse rien dans un projet sans .github/workflows ni clé', () => {
    expect(constats(projet(undefined, { a: {} }, []))).toEqual([]);
    expect(constats(projet(undefined, {}, []))).toEqual([]);
  });

  it('ne refuse rien dans un projet sans clé dont .github n’a pas de workflows', () => {
    const racine = projet(undefined, { a: {} }, []);
    ecrire(racine, '.github/CODEOWNERS', '* @x\n');
    expect(constats(racine)).toEqual([]);
  });
});

describe('critère 6 — un paquet est connu quand le graphe le porte, quel que soit son langage', () => {
  it('connaît un crate et un projet Python, à leur package.json du graphe', () => {
    const racine = projet(
      { [CI]: ['@p/npm', '@p/crate', '@p/py'] },
      {
        npm: {},
        crate: { 'Cargo.toml': '[package]\nname = "crate"\nversion = "0.1.0"\n' },
        py: { 'pyproject.toml': '[project]\nname = "py"\nversion = "0.1.0"\n' },
      },
      [CI]
    );
    expect(messages(racine)).toEqual([]);
  });

  it('la garde est l’une de celles du cadre, jouée avec elles, et un sous-commande', () => {
    const racine = projet(undefined, { a: {} }, []);
    declarerLeLangage(racine);
    expect(gardesDuCadre(racine)).toContainEqual([SCRIPT_DE_LA_GARDE()]);
    expect(nomsDesGardes(racine)).toContain('flux-des-paquets');
    expect(GARDE).toBe('flux-des-paquets');
  });

  it('la commande : code 1, chaque constat après ⛔, son SARIF sous son nom ; code 0 sinon', () => {
    const rouge = projet({}, { a: {} }, [CI]);
    const resultats = mkdtempSync(path.join(ESSAIS, 'resultats-'));
    const r = spawnSync(process.execPath, [SCRIPT_DE_LA_GARDE()], {
      cwd: rouge,
      encoding: 'utf8',
      env: { ...process.env, GRILLHOUSE_RESULTATS: resultats },
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/⛔ .*ci\.yml/);
    const sarif = readdirSync(path.join(resultats, 'sarif'));
    expect(sarif).toEqual([expect.stringMatching(/^flux-des-paquets-/)]);
    expect(readFileSync(path.join(resultats, 'sarif', sarif[0]), 'utf8')).toContain('ci.yml');

    const vert = projet({ [CI]: ['@p/a'] }, { a: {} }, [CI]);
    const v = spawnSync(process.execPath, [SCRIPT_DE_LA_GARDE()], { cwd: vert, encoding: 'utf8' });
    expect(v.stderr).toBe('');
    expect(v.status).toBe(0);
  });
});

describe('critères 2, 7 et 8 — la consigne du relecteur porte une ligne par flux que le lot touche', () => {
  const racine = projet(
    { [CI]: ['@p/a'], [DEPLOIEMENT]: ['@p/b', '@p/c'] },
    { a: {}, b: {}, c: {} },
    [CI, DEPLOIEMENT]
  );

  it('un fichier sous le dossier d’un paquet qu’un flux déclare donne « lis <flux> »', () => {
    const t = consigneDesFlux(racine, ['packages/a/scripts/circuit.mjs']);
    expect(t).toContain(`lis ${CI}`);
    expect(t).not.toContain(DEPLOIEMENT);
  });

  it('une ligne par flux touché, chacun une fois, même par plusieurs fichiers ou paquets', () => {
    const t = consigneDesFlux(racine, [
      'packages/b/x.ts',
      'packages/c/y.ts',
      'packages/b/z/w.ts',
      'packages/a/q.ts',
    ]);
    expect(t.split('\n').filter(l => l.includes(DEPLOIEMENT))).toHaveLength(1);
    expect(t.split('\n').filter(l => l.includes(CI))).toHaveLength(1);
    expect(t.split('\n')).toHaveLength(2);
  });

  it('le flux lui-même change : la ligne est donnée, sans paquet touché', () => {
    const t = consigneDesFlux(racine, [DEPLOIEMENT]);
    expect(t).toContain(`lis ${DEPLOIEMENT}`);
    expect(t).not.toContain(CI);
  });

  it('un lot sans flux touché dit « aucun »', () => {
    for (const fichiers of [[], ['README.md'], ['docs/ARCHITECTURE.md'], ['.github/CODEOWNERS']]) {
      const t = consigneDesFlux(racine, fichiers);
      expect(t).toMatch(/^aucun/);
      expect(t).not.toContain('lis ');
    }
  });

  it('un paquet ne compte ni par ses dépendants ni par ses dépendances du graphe', () => {
    const r = projet({ [CI]: ['@p/a'] }, { a: {}, b: {} }, [CI]);
    ecrire(
      r,
      'packages/a/package.json',
      JSON.stringify({ name: '@p/a', dependencies: { '@p/b': '*' } })
    );
    ecrire(
      r,
      'packages/b/package.json',
      JSON.stringify({ name: '@p/b', dependencies: { '@p/a': '*' } })
    );
    expect(consigneDesFlux(r, ['packages/b/src/index.ts'])).toMatch(/^aucun/);
    expect(consigneDesFlux(r, ['packages/a/src/index.ts'])).toContain(`lis ${CI}`);
  });

  it('un dossier au préfixe voisin n’est pas le dossier du paquet', () => {
    expect(consigneDesFlux(racine, ['packages/a-essais/x.ts', 'packages/ab/y.ts'])).toMatch(
      /^aucun/
    );
  });

  it('le gabarit de la consigne du relecteur porte la ligne des flux', () => {
    const t = consigne({ flux: 'LIGNE-DES-FLUX-DU-LOT' }, 1);
    expect(t).toContain('LIGNE-DES-FLUX-DU-LOT');
    expect(t).not.toContain('{{flux}}');
  });
});

describe('critère 9 — ce dépôt déclare ses trois flux, et la garde y est verte', () => {
  const DEPOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
  const pkg = JSON.parse(readFileSync(path.join(DEPOT, 'package.json'), 'utf8')) as Record<
    string,
    unknown
  >;

  it('ci.yml, deploy-docs.yml et release.yml sont déclarés, chacun avec au moins un paquet', () => {
    const { flux, fautes } = lireFlux(pkg);
    expect(fautes).toEqual([]);
    expect(flux.map((f: { fichier: string }) => f.fichier).sort()).toEqual([
      '.github/workflows/ci.yml',
      '.github/workflows/deploy-docs.yml',
      '.github/workflows/release.yml',
    ]);
    for (const f of flux) {
      expect(f.paquets.length).toBeGreaterThan(0);
    }
  });

  it('ci.yml exerce @roomi-fields/grillhouse', () => {
    const ci = lireFlux(pkg).flux.find((f: { fichier: string }) => f.fichier === CI);
    expect(ci?.paquets).toContain('@roomi-fields/grillhouse');
  });

  it('la garde ne trouve rien sur le dépôt entier', () => {
    expect(constats(DEPOT)).toEqual([]);
  });
});
