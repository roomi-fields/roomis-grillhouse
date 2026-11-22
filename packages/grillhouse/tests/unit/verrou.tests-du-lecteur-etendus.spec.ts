// Les tests d'un paquet lecteur que le circuit a étendus au plan (`GRILLHOUSE_TESTS_ETENDUS`, la
// liste des dossiers de ces paquets, que l'enveloppe donne au seul testwriter) : le verrou du
// testwriter laisse passer les fichiers de test de ces paquets et aucun autre fichier ; le verrou
// du développeur n'en laisse passer aucun. L'enveloppe ouvre ces paquets en écriture au testwriter
// seul. Le code d'un lecteur reste hors du plan.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { environnementDeLaSeance, plan } from '../../scripts/enveloppe/enveloppe.mjs';
import { horsDuPlan } from '../../scripts/verrous/verrou.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'verrou-tests-etendus-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const SCRATCH = '/scratch';

interface Arret {
  paquet: string;
  chemin: string;
}
const jugerLEcriture = horsDuPlan as unknown as (
  input: object,
  o: { tmp: string; env: Record<string, string>; role: string }
) => Arret | null;
const environnement = environnementDeLaSeance as unknown as (
  env: Record<string, string>,
  o: { cacheNpm: string; paquets: string[]; travail: string; testsEtendus?: string[] }
) => Record<string, string>;
const monterLePlan = plan as unknown as (
  o: object,
  fs: { existe: (p: string) => boolean }
) => { args?: string[] };

// Un projet de deux paquets : a, le plan, et b, un lecteur de a qui n'est pas au plan.
function depot() {
  const repo = mkdtempSync(path.join(ESSAIS, 'depot-'));
  const ecrire = (rel: string, contenu: unknown) => {
    mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    writeFileSync(path.join(repo, rel), `${JSON.stringify(contenu, null, 2)}\n`);
  };
  ecrire('package.json', { name: 'racine', private: true, workspaces: ['packages/*'] });
  declarerLesLangages(repo);
  ecrire('packages/a/package.json', { name: 'a' });
  ecrire('packages/b/package.json', { name: 'b' });
  ecrire('packages/c/package.json', { name: 'c' });
  spawnSync('git', ['init', '-q'], { cwd: repo });
  return repo;
}
const repo = depot();
const ecrit = (rel: string) => ({
  tool_name: 'Write',
  tool_input: { file_path: path.join(repo, rel), content: 'x\n' },
  cwd: repo,
});
const env = { GRILLHOUSE_ENVELOPPE: 'packages/a', GRILLHOUSE_TESTS_ETENDUS: 'packages/b' };
const juge = (rel: string, role: string, e: Record<string, string> = env) =>
  jugerLEcriture(ecrit(rel), { tmp: SCRATCH, env: e, role });

describe('le verrou du testwriter laisse écrire les fichiers de test d’un lecteur étendu aux tests', () => {
  it('un fichier de test du lecteur étendu ne l’arrête pas', () => {
    expect(juge('packages/b/tests/b.test.ts', 'testwriter')).toBeNull();
    expect(juge('packages/b/src/b.test.ts', 'testwriter')).toBeNull();
  });

  it('un fichier de code du lecteur étendu l’arrête toujours, nommé', () => {
    expect(juge('packages/b/src/index.ts', 'testwriter')).toMatchObject({
      paquet: 'packages/b',
      chemin: 'packages/b/src/index.ts',
    });
  });

  it('le manifeste du lecteur étendu l’arrête : seul le code du plan se change par son manifeste', () => {
    expect(juge('packages/b/package.json', 'testwriter')?.paquet).toBe('packages/b');
  });

  it('un fichier de test d’un autre lecteur, non étendu, l’arrête', () => {
    expect(juge('packages/c/tests/c.test.ts', 'testwriter')?.paquet).toBe('packages/c');
  });

  it('sans liste étendue, un fichier de test du lecteur l’arrête comme avant', () => {
    const sans = { GRILLHOUSE_ENVELOPPE: 'packages/a' };
    expect(juge('packages/b/tests/b.test.ts', 'testwriter', sans)?.paquet).toBe('packages/b');
  });
});

describe('le verrou des autres rôles ne lit pas la liste des tests étendus', () => {
  it.each(['developpeur', 'explorateur', 'questionneur'])(
    'un fichier de test du lecteur arrête le %s',
    role => {
      expect(juge('packages/b/tests/b.test.ts', role)?.paquet).toBe('packages/b');
    }
  );
});

describe('l’enveloppe donne les tests étendus au seul testwriter', () => {
  const lancement = (testsEtendus?: string[]) =>
    environnement(
      { PATH: '/usr/bin' },
      { cacheNpm: '/cache', paquets: ['packages/a'], travail: '/travail', testsEtendus }
    );

  it('la variable porte la liste des dossiers, séparés comme ceux du plan', () => {
    const e = lancement(['packages/b', 'packages/c']);
    expect(e.GRILLHOUSE_TESTS_ETENDUS).toBe(['packages/b', 'packages/c'].join(path.delimiter));
    expect(e.GRILLHOUSE_ENVELOPPE).toBe('packages/a');
  });

  it('sans paquet étendu, la variable n’existe pas', () => {
    expect(lancement().GRILLHOUSE_TESTS_ETENDUS).toBeUndefined();
    expect(lancement([]).GRILLHOUSE_TESTS_ETENDUS).toBeUndefined();
  });

  it('le plan de l’enveloppe ouvre le lecteur étendu en écriture au testwriter, en lecture aux autres', () => {
    const presents = new Set(['/wt/.git', '/wt/packages/a', '/wt/packages/b']);
    const montage = (role: string) => {
      const r = monterLePlan(
        {
          trees: ['/main', '/wt'],
          copie: '/wt',
          paquets: ['packages/a'],
          role,
          testsEtendus: ['packages/b'],
          sorties: { ecrites: [], propres: [] },
          paquetsDeLaCopie: [
            { dossier: 'packages/a', pkg: { name: 'a' } },
            { dossier: 'packages/b', pkg: { name: 'b' } },
          ],
        },
        { existe: (p: string) => presents.has(p) }
      );
      const args = r.args ?? [];
      return args
        .flatMap((a, i) => (a === '--bind' || a === '--ro-bind' ? [`${a} ${args[i + 2]}`] : []))
        .filter(m => m.endsWith(' /wt/packages/b'))
        .at(-1);
    };
    expect(montage('testwriter')).toBe('--bind /wt/packages/b');
    expect(montage('developpeur')).toBe('--ro-bind /wt/packages/b');
  });
});
