import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse as parseJsonc } from 'jsonc-parser';
import { afterAll, describe, expect, it } from 'vitest';
import { ecrire, verifier } from '../../../../scripts/langages/typescript/turbo-des-paquets.mjs';

// Ticket grillhouse-44b.9, critère 11 : la mise en forme et le lint se jouent par paquet. Le
// générateur écrit les tâches `format:check` et `lint` des paquets qui portent ces scripts dans le
// turbo.json ; la garde refuse une tâche de racine pour un fichier qu'un paquet porte ; la racine
// garde `//#format:check` et `//#lint` pour ses propres fichiers ; chaque paquet de TypeScript du
// dépôt a ses scripts `lint` et `format:check` sur ses sources et ses tests.

const DEPOT = path.resolve(__dirname, '../../../../../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'turbo-style-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ecrireFichier = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;
const scriptsDe = (f: string) =>
  (JSON.parse(readFileSync(path.join(DEPOT, f), 'utf8')) as { scripts: Record<string, string> })
    .scripts;

type Scripts = Record<string, string>;
function depot(racine: Scripts, paquets: Record<string, Scripts>) {
  const r = mkdtempSync(path.join(ESSAIS, 'depot-'));
  ecrireFichier(
    r,
    'package.json',
    json({
      name: 'essai',
      private: true,
      workspaces: ['packages/*'],
      packageManager: 'npm@10.9.8',
      scripts: racine,
    })
  );
  ecrireFichier(
    r,
    'turbo.json',
    readFileSync(path.join(DEPOT, 'templates/turbo/paquets.json'), 'utf8')
  );
  for (const [nom, scripts] of Object.entries(paquets)) {
    ecrireFichier(
      r,
      `packages/${nom}/package.json`,
      json({ name: nom, scripts: { build: 'tsc', 'test:unit': 'vitest run', ...scripts } })
    );
  }
  return r;
}
const taches = (r: string) =>
  (
    parseJsonc(readFileSync(path.join(r, 'turbo.json'), 'utf8')) as {
      tasks: Record<string, { outputs?: unknown }>;
    }
  ).tasks;
const refus = (r: string) => verifier(r).filter(l => /lint|format:check/.test(l));

const DE_PAQUET = { 'format:check': 'prettier --check src tests', lint: 'eslint src tests' };

describe('critère 11 — le générateur écrit format:check et lint des paquets', () => {
  it('ecrire ajoute les tâches `format:check` et `lint` quand un paquet porte ces scripts', () => {
    const r = depot({}, { a: DE_PAQUET, b: DE_PAQUET });
    ecrire(r);
    const t = taches(r);
    expect(t['format:check']).toMatchObject({ outputs: [] });
    expect(t['lint']).toMatchObject({ outputs: [] });
  });
  it('un paquet qui ne porte que le lint ne fait écrire que la tâche `lint`', () => {
    const r = depot({}, { a: { lint: 'eslint src' } });
    ecrire(r);
    expect(Object.keys(taches(r))).toContain('lint');
    expect(Object.keys(taches(r))).not.toContain('format:check');
  });
  it('sans aucun paquet qui porte ces scripts, aucune tâche de paquet n’est écrite', () => {
    const r = depot({}, { a: {} });
    ecrire(r);
    expect(Object.keys(taches(r))).not.toContain('lint');
    expect(Object.keys(taches(r))).not.toContain('format:check');
  });
  it('la vérification refuse, en les nommant, les tâches absentes d’un paquet qui porte le script', () => {
    const r = depot({}, { a: DE_PAQUET });
    const l = refus(r);
    expect(l.some(x => x.includes('lint') && !x.includes('format:check'))).toBe(true);
    expect(l.some(x => x.includes('format:check'))).toBe(true);
    ecrire(r);
    expect(refus(r)).toEqual([]);
  });
  it('ecrire rejoué ne change rien', () => {
    const r = depot({}, { a: DE_PAQUET });
    ecrire(r);
    const avant = readFileSync(path.join(r, 'turbo.json'), 'utf8');
    ecrire(r);
    expect(readFileSync(path.join(r, 'turbo.json'), 'utf8')).toBe(avant);
  });
});

describe('critère 11 — la racine ne garde que ses propres fichiers', () => {
  it('la garde refuse un script de racine qui nomme un fichier qu’un paquet porte', () => {
    const r = depot(
      { lint: 'eslint templates/projet/src packages/a/src', 'format:check': 'prettier --check .' },
      { a: DE_PAQUET }
    );
    ecrire(r);
    const l = refus(r);
    expect(l.some(x => x.includes('//#lint') && x.includes('packages/a'))).toBe(true);
  });
  it('un dossier de paquet entier, ou une accolade de paquets, est refusé de même', () => {
    const r = depot(
      {
        lint: 'eslint packages/b',
        'format:check': 'prettier --check "packages/{a,b}/tests/**/*.ts"',
      },
      { a: DE_PAQUET, b: DE_PAQUET }
    );
    ecrire(r);
    const l = refus(r);
    expect(l.some(x => x.includes('//#lint'))).toBe(true);
    expect(l.some(x => x.includes('//#format:check'))).toBe(true);
  });
  it('un script de racine sur ses seuls fichiers (templates, mods, racine) n’est pas refusé', () => {
    const r = depot(
      {
        lint: 'eslint templates/projet/src mods/grillhouse/tests',
        'format:check': 'prettier --check "templates/projet/{src,tests}/**/*.ts" "*.mjs"',
      },
      { a: DE_PAQUET }
    );
    ecrire(r);
    expect(Object.keys(taches(r))).toEqual(
      expect.arrayContaining(['//#lint', '//#format:check', 'lint', 'format:check'])
    );
    expect(refus(r)).toEqual([]);
  });
});

describe('critère 11 — le dépôt de Grillhouse', () => {
  const paquets = readdirSync(path.join(DEPOT, 'packages')).sort();

  it.each(paquets)(
    'le paquet %s a ses scripts lint et format:check, sur ses sources et ses tests',
    p => {
      const scripts = scriptsDe(`packages/${p}/package.json`);
      expect(scripts['lint'], 'lint').toMatch(/eslint/);
      expect(scripts['format:check'], 'format:check').toMatch(/prettier --check/);
      // Ses propres fichiers, depuis son dossier : aucun chemin d'un autre paquet ni de la racine.
      for (const nom of ['lint', 'format:check']) {
        expect(scripts[nom], nom).not.toMatch(/packages\//);
        for (const dossier of ['src', 'tests']) {
          if (existsSync(path.join(DEPOT, 'packages', p, dossier))) {
            expect(scripts[nom], `${nom} nomme ${dossier}`).toMatch(new RegExp(`\\b${dossier}\\b`));
          }
        }
      }
    }
  );
  it('les scripts de la racine ne nomment aucun fichier d’un paquet', () => {
    const scripts = scriptsDe('package.json');
    for (const nom of ['lint', 'format:check']) {
      expect(scripts[nom], nom).not.toMatch(/packages\//);
      expect(scripts[nom], nom).toMatch(/templates\/projet/);
    }
  });
  it('le générateur et sa garde sont d’accord avec le dépôt : aucun refus de lint ni de mise en forme', () => {
    expect(refus(DEPOT)).toEqual([]);
  });
});
