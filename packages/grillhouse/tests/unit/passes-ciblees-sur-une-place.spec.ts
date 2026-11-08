// grillhouse-9kq, critère 6 (décision 6) : quelle commande du circuit est une passe lourde
// (`passeLourde({ etape, args })` de scripts/passe-de-la-machine.mjs), que le verrou exclusif de la
// machine tient en plus de sa place ; les places et le verrou des passes se jouent avec un serveur
// d'essai (tests/temporal/passes-de-la-machine.nuit.spec.ts).
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const MODULE = path.resolve(__dirname, '../../scripts/passe-de-la-machine.mjs');
const passeLourde = (o: { etape: string; args: string[] }): boolean =>
  (
    createRequire(path.join(__dirname, 'x.cjs'))(MODULE) as {
      passeLourde: (o: { etape: string; args: string[] }) => boolean;
    }
  ).passeLourde(o);

describe('grillhouse-9kq critère 6 — quelle commande est une passe lourde', () => {
  it('la passe finale (npm run verifier) est lourde', () => {
    expect(passeLourde({ etape: 'controles', args: ['run', 'verifier'] })).toBe(true);
  });
  it('la passe finale restreinte aux fichiers changés reste lourde', () => {
    expect(
      passeLourde({ etape: 'controles', args: ['run', 'verifier', '--', '--filter=...[a...b]'] })
    ).toBe(true);
  });
  it('la preuve du rouge (npm test sur les tests du lot) est ciblée', () => {
    expect(passeLourde({ etape: 'preuve', args: ['test', '--', '--force', 'a/b.spec.ts'] })).toBe(
      false
    );
  });
  it('la preuve sur un paquet entier est ciblée', () => {
    expect(passeLourde({ etape: 'preuve', args: ['test', '--', 'packages/x'] })).toBe(false);
  });
  it('les contrôles qui ne jouent que les tests du ticket (npm test) sont ciblés', () => {
    expect(
      passeLourde({ etape: 'controles', args: ['test', '--', 'packages/x/tests/a.spec.ts'] })
    ).toBe(false);
  });
  it('les gardes d’une copie (npm run verifier -- --gardes) restent lourdes : verifier, quel que soit l’étape', () => {
    expect(passeLourde({ etape: 'controles', args: ['run', 'verifier', '--', '--gardes'] })).toBe(
      true
    );
  });
});
