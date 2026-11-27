// Les tests d'un paquet lecteur que le circuit a étendus au plan (`GRILLHOUSE_TESTS_ETENDUS`, la
// liste des dossiers de ces paquets) : l'enveloppe la donne au seul testwriter, et ouvre ces
// paquets en écriture à lui seul.
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { environnementDeLaSeance, plan } from '../../scripts/enveloppe/enveloppe.mjs';

const environnement = environnementDeLaSeance as unknown as (
  env: Record<string, string>,
  o: { cacheNpm: string; paquets: string[]; travail: string; testsEtendus?: string[] }
) => Record<string, string>;
const monterLePlan = plan as unknown as (
  o: object,
  fs: { existe: (p: string) => boolean }
) => { args?: string[] };

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
