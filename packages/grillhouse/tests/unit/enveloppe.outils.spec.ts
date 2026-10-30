// grillhouse-4id, critère 1: the tools of the project (`grillhouse.outils`, read by
// scripts/outils-cles.mjs) enter the envelope of a session, as Bazel declares what an action sees
// out of its sandbox (--sandbox_add_mount_pair) and the environment it gets (--action_env): each
// path comes back read-only in the emptied home, and each variable reaches the session. Without the
// key, nothing changes. The arguments of bwrap on a disk described, and the environment computed.
import { describe, expect, it } from 'vitest';
import {
  environnementDeLaSeance,
  montagesDeLaSeance,
  plan,
} from '../../scripts/enveloppe/enveloppe.mjs';
import { lireOutils } from '../../scripts/outils-cles.mjs';

const SEANCE = {
  cacheNpm: '/h/.npm',
  claude: '/h/.claude',
  projet: '/h/.claude/projects/-wt',
  etatJetable: '/t/claude.json',
  scratchpads: '/tmp/claude-1/-wt',
};
const OUTILS = { X_OUTIL: '/h/.cache/outil' };

type Montage = { chemin: string; ecriture?: boolean; vide?: boolean; scelle?: boolean };

// The arguments of bwrap for the copy /wt, plan packages/a, with the mounts <montages>.
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
// The targets written or emptied by <args>: each `--bind`'s and each `--tmpfs`'s.
const ecritsDe = (args: string[]): string[] =>
  args.flatMap((a, i) =>
    a === '--bind' ? [args[i + 2] ?? ''] : a === '--tmpfs' ? [args[i + 1] ?? ''] : []
  );
const cibles = (args: string[], flag: string) =>
  args.flatMap((a, i) => (a === flag ? [args[i + 2]] : []));

describe('critère 1 — the tools of the project enter the envelope', () => {
  it('mounts each path read-only, after the emptied home', () => {
    const args = argsDe(montagesDeLaSeance({ ...SEANCE, outils: OUTILS }) as Montage[]);
    expect(cibles(args, '--ro-bind')).toContain('/h/.cache/outil');
    expect(cibles(args, '--bind')).not.toContain('/h/.cache/outil');
    const vide = args.findIndex((a, i) => a === '--tmpfs' && args[i + 1] === '/h');
    const monte = args.findIndex((a, i) => a === '--ro-bind' && args[i + 2] === '/h/.cache/outil');
    expect(vide).toBeGreaterThan(-1);
    expect(monte).toBeGreaterThan(vide);
  });
  // The review of grillhouse-4id, constat 1: a tool mounted read-only must not cover a mount in
  // writing or an emptied directory made before it, nor be covered by none it should stay under.
  it('covers no mount in writing nor emptied directory, for every tool the key accepts', () => {
    const accepte = lireOutils(
      {
        grillhouse: {
          outils: { A: '~/.cache/outil', B: '~/.local/bin/b', C: '~/outils/c', D: '/opt/d' },
        },
      },
      {
        maison: '/h',
        existe: () => true,
        montages: ['/wt', '/main', '/h/.claude', '/tmp', '/tmp/claude-1/-wt', '/h/.npm'],
      }
    );
    expect(accepte.fautes).toEqual([]);
    const args = argsDe(montagesDeLaSeance({ ...SEANCE, outils: accepte.outils }) as Montage[]);
    const ecrits = ecritsDe(args);
    for (const outil of Object.values(accepte.outils)) {
      expect(cibles(args, '--ro-bind'), outil).toContain(outil);
      for (const e of ecrits) {
        expect(e === outil || e.startsWith(`${outil}/`), `${outil} couvre ${e}`).toBe(false);
      }
    }
  });
  it('the key refuses each path that would cover a mount of this session', () => {
    const montes = ecritsDe(argsDe(montagesDeLaSeance(SEANCE) as Montage[]));
    for (const v of ['/', '~', '/h/.claude', '/tmp', '/tmp/claude-1', '/wt', '/h/.npm']) {
      const r = lireOutils(
        { grillhouse: { outils: { X_OUTIL: v } } },
        { maison: '/h', existe: () => true, montages: ['/wt', ...montes] }
      );
      expect(r.outils, v).toEqual({});
      expect(r.fautes.join('\n'), v).toContain('grillhouse.outils.X_OUTIL');
    }
  });
  it('passes each variable to the session, even when the launch does not hold it', () => {
    const env = environnementDeLaSeance(
      { HOME: '/h', PATH: '/bin' },
      { cacheNpm: '/h/.npm', paquets: ['packages/a'], travail: '/tmp/t', outils: OUTILS }
    ) as Record<string, string>;
    expect(env.X_OUTIL).toBe('/h/.cache/outil');
  });
  it('changes nothing without the key', () => {
    expect(montagesDeLaSeance({ ...SEANCE, outils: {} })).toEqual(montagesDeLaSeance(SEANCE));
    const lancement = { HOME: '/h', PATH: '/bin', X_OUTIL: '/ailleurs' };
    const o = { cacheNpm: '/h/.npm', paquets: ['packages/a'], travail: '/tmp/t' };
    const sans = environnementDeLaSeance(lancement, o) as Record<string, string>;
    expect(sans).not.toHaveProperty('X_OUTIL');
    expect(environnementDeLaSeance(lancement, { ...o, outils: {} })).toEqual(sans);
  });
});
