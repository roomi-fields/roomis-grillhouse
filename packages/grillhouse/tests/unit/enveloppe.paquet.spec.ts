// grillhouse-3uv.92.4 — in the envelope of a component that is a package, the agent writes its own
// package and nothing else of the copy: the rest is read-only, as a sandbox of Bazel or of Nix
// opens in writing only what the action declares. Witness: BPScript 320.4 (n° 13), where only
// `packages/` was emptied: `libraries/` and `spec/` stayed writable, the developer of 900-driver
// edited `libraries/alphabets.bpsl`, and the circuit saw « aucun changement de 900 ».
// Each case reads the plan of the envelope, the arguments of bwrap, on a disk described; bwrap
// itself is the night's (packages/grillhouse-essais/tests/enveloppe.paquet.nuit.spec.ts).
import { describe, expect, it } from 'vitest';
import { plan } from '../../scripts/enveloppe/enveloppe.mjs';

// A disk that holds the paths <files>.
const fakeDisk = (files: string[]) => {
  const exists = new Set(files);
  return { existe: (p: string) => exists.has(p) };
};
const pairs = (args: string[], flag: string) =>
  args.flatMap((a, i) => (a === flag ? [args[i + 1]] : []));

const presents = [
  '/wt/.git',
  '/wt/.turbo',
  '/wt/libraries',
  '/wt/spec',
  '/wt/packages/a',
  '/main/.beads',
];
const paquets = [
  { dossier: 'packages/a', pkg: { name: 'a' } },
  { dossier: 'packages/b', pkg: { name: 'b' } },
  { dossier: 'packages/m', pkg: { name: 'm' } },
];
const montages = ({ composant = 'packages/a', role = 'developpeur', liste = paquets } = {}) =>
  plan(
    {
      trees: ['/main', '/wt'],
      copie: '/wt',
      paquets: [composant],
      role,
      matieres: ['packages/m'],
      // The outputs of TypeScript proper to the session (grillhouse-pkl.5: its module's).
      sorties: { ecrites: [], propres: ['.turbo', 'node_modules/.vite'] },
      paquetsDeLaCopie: liste,
    },
    fakeDisk(presents)
  ).args ?? [];

describe('grillhouse-3uv.92.4 — le plan de l’enveloppe d’un paquet', () => {
  it('critère 1 — monte la copie en lecture seule, puis le seul paquet du composant en écriture', () => {
    const args = montages();
    expect(pairs(args, '--ro-bind')).toContain('/wt');
    expect(pairs(args, '--bind')).not.toContain('/wt');
    expect(pairs(args, '--bind')).toContain('/wt/packages/a');
    expect(args.lastIndexOf('/wt/packages/a')).toBeGreaterThan(args.indexOf('/wt'));
  });

  it('critère 1 — n’ouvre en écriture aucun dossier de la racine hors des paquets : libraries, spec', () => {
    const ecrits = pairs(montages(), '--bind');
    for (const d of ['/wt/libraries', '/wt/spec']) {
      expect(ecrits).not.toContain(d);
    }
  });

  it('critère 1 — garde au testwriter la matière de test partagée en écriture, aux autres rôles en lecture', () => {
    expect(pairs(montages({ role: 'testwriter' }), '--bind')).toContain('/wt/packages/m');
    const dev = montages();
    expect(pairs(dev, '--bind')).not.toContain('/wt/packages/m');
    expect(pairs(dev, '--ro-bind')).toContain('/wt/packages/m');
  });

  it('critère 1 — garde en écriture la base des tickets et ce qu’un lancement de Turborepo écrit à la racine, propre à la séance', () => {
    const args = montages();
    expect(pairs(args, '--bind')).toContain('/main/.beads');
    expect(pairs(args, '--tmpfs')).toContain('/wt/.turbo');
    expect(args.lastIndexOf('/wt/.turbo')).toBeGreaterThan(args.indexOf('/wt'));
  });

  it('un composant qui n’est pas un paquet écrit le paquet qui le tient, la copie entière', () => {
    expect(pairs(montages({ composant: 'libraries' }), '--bind')).toContain('/wt');
    expect(pairs(montages({ liste: [] }), '--bind')).toContain('/wt');
  });
});
