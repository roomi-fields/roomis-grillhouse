// grillhouse-44b.4.1, critère 1: a project that names its published version (`grillhouse.outil`)
// gets the cache of the published versions in its envelope, read-only, so that the write lock runs
// on that version inside the session. Without it, nothing is mounted.
import { describe, expect, it } from 'vitest';
import { montagesDeLaSeance, plan } from '../../scripts/enveloppe/enveloppe.mjs';

const SEANCE = {
  cacheNpm: '/h/.npm',
  claude: '/h/.claude',
  projet: '/h/.claude/projects/-wt',
  etatJetable: '/t/claude.json',
  scratchpads: '/tmp/claude-1/-wt',
};
const CACHE = '/h/.cache/grillhouse/outil';

type Montage = { chemin: string; ecriture?: boolean; vide?: boolean; scelle?: boolean };

function argsDe(montages: Montage[]) {
  const presents = new Set([
    ...montages.map(m => m.chemin),
    '/wt',
    '/wt/packages/a',
    '/t/claude.json',
  ]);
  const { args = [] } = plan(
    {
      trees: ['/main', '/wt'],
      copie: '/wt',
      paquets: ['packages/a'],
      montages,
      paquetsDeLaCopie: [{ dossier: 'packages/a', pkg: { name: 'a' } }],
    },
    { existe: (p: string) => presents.has(p) }
  );
  return args;
}
const cibles = (args: string[], flag: string) =>
  args.flatMap((a, i) => (a === flag ? [args[i + 2]] : []));

describe('grillhouse-44b.4.1, critère 1 — le cache des versions publiées entre dans l’enveloppe', () => {
  it('critère 1 : le cache publié se monte en lecture seule, après la maison vidée', () => {
    const args = argsDe(montagesDeLaSeance({ ...SEANCE, publie: CACHE }) as Montage[]);
    expect(cibles(args, '--ro-bind')).toContain(CACHE);
    expect(cibles(args, '--bind')).not.toContain(CACHE);
    const vide = args.findIndex((a, i) => a === '--tmpfs' && args[i + 1] === '/h');
    const monte = args.findIndex((a, i) => a === '--ro-bind' && args[i + 2] === CACHE);
    expect(vide).toBeGreaterThan(-1);
    expect(monte).toBeGreaterThan(vide);
  });

  it('critère 1 : sans version publiée nommée, aucun montage du cache', () => {
    const args = argsDe(montagesDeLaSeance({ ...SEANCE }) as Montage[]);
    expect(cibles(args, '--ro-bind')).not.toContain(CACHE);
    expect(cibles(args, '--bind')).not.toContain(CACHE);
  });
});
