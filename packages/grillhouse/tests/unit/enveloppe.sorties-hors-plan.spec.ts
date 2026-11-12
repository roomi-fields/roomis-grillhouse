// The envelope opens where the tools of the language write, as a sandbox of Bazel opens the
// outputs an action declares whatever the package: in each package of the copy that the plan does
// not name, every own output of the module of the language (`sorties.propres`: `.turbo`,
// `node_modules/.vite`) is an empty directory proper to the session, and the rest of the package
// stays read-only. A package the plan names keeps its outputs written; a plan that writes the
// root stays as it was. Read on the plan of the envelope, without disk.
import { describe, expect, it } from 'vitest';
import type { Langage } from '../../scripts/jointure.js';
import { plan, sortiesDuLangage } from '../../scripts/enveloppe/enveloppe.mjs';
import typescript from '../../scripts/langages/typescript/index.mjs';

const pairs = (args: string[], flag: string) =>
  args.flatMap((a, i) => (a === flag ? [args[i + 1] ?? ''] : []));

const PROPRES = ['.turbo', 'node_modules/.vite'];
const PAQUETS = ['packages/a', 'packages/b', 'packages/essais', 'packages/m'];

function enveloppe(o: {
  paquets: string[];
  role?: string;
  presents?: string[];
  liens?: Record<string, string>;
}): string[] {
  const { magasins, lectures, sorties } = sortiesDuLangage(
    (typescript as unknown as Langage).sorties,
    {
      maison: '/h',
      principal: '/main',
    }
  );
  const presents = new Set([
    '/wt',
    '/wt/.git',
    '/main/.beads',
    ...PAQUETS.map(p => `/wt/${p}`),
    ...(o.presents ??
      ['', ...PAQUETS.map(p => `${p}/`)].flatMap(base => PROPRES.map(s => `/wt/${base}${s}`))),
  ]);
  const liens = o.liens ?? {};
  const r = plan(
    {
      trees: ['/main', '/wt'],
      copie: '/wt',
      paquets: o.paquets,
      role: o.role ?? 'developpeur',
      matieres: ['packages/m'],
      magasins,
      lectures,
      sorties,
      paquetsDeLaCopie: PAQUETS.map(p => ({ dossier: p, pkg: { name: p } })),
    },
    { existe: (p: string) => presents.has(p), lien: (p: string) => liens[p] ?? null }
  );
  expect(r.refus).toBeUndefined();
  return r.args ?? [];
}

describe('les sorties propres de la séance dans les paquets hors du plan', () => {
  it('monte un dossier vide propre à chaque sortie du langage dans chaque paquet hors du plan', () => {
    const args = enveloppe({ paquets: ['packages/a'] });
    const vides = pairs(args, '--tmpfs');
    for (const p of ['packages/b', 'packages/essais', 'packages/m']) {
      for (const s of PROPRES) {
        expect(vides, `${p}/${s}`).toContain(`/wt/${p}/${s}`);
      }
    }
  });

  it('monte ces dossiers vides après la copie en lecture seule, qui les couvrirait', () => {
    const args = enveloppe({ paquets: ['packages/a'] });
    const copie = args.indexOf('/wt');
    expect(args.lastIndexOf('/wt/packages/essais/.turbo')).toBeGreaterThan(copie);
    expect(pairs(args, '--ro-bind')).toContain('/wt');
  });

  it('laisse un paquet que le plan nomme avec ses sorties écrites, sans dossier vide', () => {
    const args = enveloppe({ paquets: ['packages/a'] });
    const vides = pairs(args, '--tmpfs');
    for (const s of PROPRES) {
      expect(vides).not.toContain(`/wt/packages/a/${s}`);
    }
    expect(pairs(args, '--bind')).toContain('/wt/packages/a');
  });

  it('ne monte aucun dossier vide dans un paquet que le plan nomme, même quand il en nomme deux', () => {
    const args = enveloppe({ paquets: ['packages/a', 'packages/essais'] });
    const vides = pairs(args, '--tmpfs');
    expect(vides.filter(v => v.startsWith('/wt/packages/essais/'))).toEqual([]);
    expect(vides).toContain('/wt/packages/b/.turbo');
  });

  it('monte la matière de test en dossiers vides pour un autre rôle, et la laisse écrite pour le testwriter', () => {
    const dev = pairs(enveloppe({ paquets: ['packages/a'], role: 'developpeur' }), '--tmpfs');
    expect(dev).toContain('/wt/packages/m/.turbo');
    const tw = pairs(enveloppe({ paquets: ['packages/a'], role: 'testwriter' }), '--tmpfs');
    for (const s of PROPRES) {
      expect(tw).not.toContain(`/wt/packages/m/${s}`);
      // The other packages out of the plan are not the material: they keep their own outputs.
      expect(tw).toContain(`/wt/packages/essais/${s}`);
      expect(tw).toContain(`/wt/packages/b/${s}`);
    }
  });

  it('laisse le reste du paquet hors du plan en lecture seule', () => {
    const args = enveloppe({ paquets: ['packages/a'] });
    expect(pairs(args, '--bind')).not.toContain('/wt/packages/essais');
    expect(pairs(args, '--bind')).not.toContain('/wt');
  });

  it('ne monte pas une sortie absente de la copie', () => {
    const args = enveloppe({
      paquets: ['packages/a'],
      presents: ['/wt/.turbo', '/wt/packages/essais/.turbo'],
    });
    const vides = pairs(args, '--tmpfs');
    expect(vides).toContain('/wt/packages/essais/.turbo');
    expect(vides).not.toContain('/wt/packages/essais/node_modules/.vite');
    expect(vides).not.toContain('/wt/packages/b/.turbo');
  });

  it('écarte une sortie qu’un lien symbolique sort de la copie', () => {
    const args = enveloppe({
      paquets: ['packages/a'],
      liens: { '/wt/packages/essais/node_modules': '/ailleurs/node_modules' },
    });
    const vides = pairs(args, '--tmpfs');
    expect(vides).not.toContain('/wt/packages/essais/node_modules/.vite');
    expect(vides).toContain('/wt/packages/essais/.turbo');
  });

  it('ne change rien pour un plan qui écrit la racine', () => {
    const args = enveloppe({ paquets: ['.'] });
    const vides = pairs(args, '--tmpfs');
    // Only the shared test material, as before, has its own outputs.
    expect(vides.filter(v => v.startsWith('/wt/') && !v.startsWith('/wt/packages/m/'))).toEqual([]);
    expect(pairs(args, '--bind')).toContain('/wt');
  });
});
