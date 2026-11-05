// grillhouse-44b.4.1, critères 2 et 7: the write lock that runs on the published version still
// stops a write out of the plan. The lock judges the packages of the plan in a git repository only,
// so this test mounts a trial repository (git init) and starts the command of the product there:
// a large test, played at night.
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  CASSES,
  copieCassee,
  copieSaine,
  depot,
  maisonAvecLaVersionSaine,
  verrou,
} from './verrou-essai.js';

function depotGit(avecC = false) {
  const repo = depot({ avecC });
  const r = spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: repo, encoding: 'utf8' });
  expect(r.status, r.stderr).toBe(0);
  return repo;
}

const arret = (stdout: string) => JSON.parse(stdout) as { continue: boolean; stopReason: string };

describe('grillhouse-44b.4.1, le verrou garde son arrêt hors du plan, dans un dépôt git', () => {
  it.each(CASSES)(
    'critère 2 : %s — une écriture hors du plan reste arrêtée',
    (_nom, rel, casser) => {
      const r = verrou(copieCassee(rel, casser), {
        repo: depotGit(),
        maison: maisonAvecLaVersionSaine(),
        fichier: 'packages/b/tests/x.spec.ts',
      });
      const reponse = arret(r.stdout);
      expect(reponse.continue).toBe(false);
      expect(reponse.stopReason).toContain('packages/b');
    }
  );

  it('critère 7 : un paquet hors du plan de la copie reste arrêté, le plan étant celui de la copie', () => {
    const r = verrou(copieSaine('principal'), {
      repo: depotGit(true),
      maison: maisonAvecLaVersionSaine(),
      fichier: 'packages/a/tests/x.spec.ts',
      plan: 'packages/c',
    });
    const reponse = arret(r.stdout);
    expect(reponse.continue).toBe(false);
    expect(reponse.stopReason).toContain('packages/a');
  });

  it('critère 7 : le paquet c, que seule la copie connaît, s’écrit dans son plan', () => {
    const r = verrou(copieSaine('principal'), {
      repo: depotGit(true),
      maison: maisonAvecLaVersionSaine(),
      fichier: 'packages/c/tests/x.spec.ts',
      plan: 'packages/c',
    });
    expect([r.status, r.stdout, r.stderr]).toEqual([0, '', '']);
  });
});
