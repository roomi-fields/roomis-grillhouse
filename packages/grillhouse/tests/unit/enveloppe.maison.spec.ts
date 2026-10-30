// METACADRE intention 5, « des agents cadrés », and the arbitration of grillhouse-3uv.8: like
// Flatpak and the development containers, the envelope of an agent (scripts/enveloppe/enveloppe.mjs)
// shows of the home and of the session directory ($XDG_RUNTIME_DIR, /run/user/<uid>) what it
// declares, and nothing else. It declares what the session needs: `~/.claude` and `~/.claude.json`,
// claude's binary and versions (`~/.local/bin/claude`, `~/.local/share/claude`), node and its tools
// (`~/.nvm`), `~/.gitconfig`, the npm cache, and the repository (main tree, its `.git`, `.beads`)
// with today's rights, the whole of it in sight. No socket of the session comes back.
//
// Each case reads the mounts of the session (`montagesDeLaSeance`) and the plan of the envelope,
// the arguments of bwrap, on a disk described; bwrap itself, in a home of trial that holds stores
// of secrets, is the night's (packages/grillhouse-essais/tests/enveloppe.maison.nuit.spec.ts).
import { describe, expect, it } from 'vitest';
import { montagesDeLaSeance, plan } from '../../scripts/enveloppe/enveloppe.mjs';

type Montage = { chemin: string; ecriture?: boolean; vide?: boolean; scelle?: boolean };

// The session of a copy of the repository /h/dev/projet, which lives in the home /h, as on the
// machine; its session directories /run/user/1 and /x/run.
const REPO = '/h/dev/projet';
const COPIE = `${REPO}/.claude/worktrees/demo-1`;
const AUTRE = `${REPO}/.claude/worktrees/demo-2`;
const montages = montagesDeLaSeance({
  cacheNpm: '/h/.npm',
  claude: '/h/.claude',
  projet: '/h/.claude/projects/-demo-1',
  etatJetable: '/t/claude.json',
  scratchpads: '/tmp/claude-1/-demo-1',
  sessions: ['/run/user/1', '/x/run'],
}) as Montage[];
const presents = new Set([
  ...montages.map(m => m.chemin),
  '/t/claude.json',
  REPO,
  `${REPO}/.beads`,
  COPIE,
  `${COPIE}/.git`,
  `${COPIE}/packages/a`,
  AUTRE,
]);
const { args = [] } = plan(
  {
    trees: [REPO, COPIE, AUTRE],
    copie: COPIE,
    paquets: ['packages/a'],
    montages,
    paquetsDeLaCopie: [{ dossier: 'packages/a', pkg: { name: 'a' } }],
  },
  { existe: (p: string) => presents.has(p) }
);
// The mounts of the plan as `<flag> <target>`, in order.
const montes = args.flatMap((a, i) =>
  a === '--bind' || a === '--ro-bind'
    ? [`${a} ${args[i + 2]}`]
    : a === '--tmpfs' || a === '--remount-ro' || a === '--symlink'
      ? [`${a} ${args[i + (a === '--symlink' ? 2 : 1)]}`]
      : []
);
const sous = (p: string, d: string) => p === d || p.startsWith(`${d}/`);

describe('the envelope shows of the home and the session only what it declares', () => {
  it('empties the home and each session directory, and seals them once mounted', () => {
    for (const d of ['/h', '/run/user/1', '/x/run']) {
      expect(
        montages.find(m => m.chemin === d),
        d
      ).toMatchObject({ vide: true, scelle: true });
      expect(montes.indexOf(`--tmpfs ${d}`), d).toBeGreaterThan(-1);
      const dernierMontage = montes.reduce(
        (n, m, i) => (m.startsWith('--bind ') || m.startsWith('--ro-bind ') ? i : n),
        -1
      );
      expect(montes.lastIndexOf(`--remount-ro ${d}`), d).toBeGreaterThan(dernierMontage);
    }
  });

  it('declares in the home what claude, node, bd and git need, and nothing else', () => {
    const declares = montages
      .filter(m => !m.vide && sous(m.chemin, '/h'))
      .map(m => m.chemin.slice('/h/'.length))
      .sort();
    expect(declares).toEqual(
      [
        '.beads',
        '.claude',
        '.claude.json',
        '.claude/CLAUDE.md',
        '.claude/agents',
        '.claude/commands',
        '.claude/hooks',
        '.claude/keybindings.json',
        '.claude/plugins',
        '.claude/projects',
        '.claude/projects/-demo-1',
        '.claude/settings.json',
        '.claude/settings.local.json',
        '.claude/skills',
        '.config/bd',
        '.config/git/attributes',
        '.config/git/config',
        '.config/git/ignore',
        '.dolt',
        '.gitconfig',
        '.local/bin/claude',
        '.local/share/claude',
        '.npm',
        '.nvm',
      ].sort()
    );
  });

  it('writes in the home only the npm cache, the session state and the repository', () => {
    const ecrits = montes
      .filter(m => m.startsWith('--bind '))
      .map(m => m.slice('--bind '.length))
      .filter(c => sous(c, '/h'))
      .sort();
    expect(ecrits).toEqual(
      [
        '/h/.claude',
        '/h/.claude.json',
        '/h/.claude/projects/-demo-1',
        '/h/.npm',
        `${REPO}/.beads`,
        `${COPIE}/packages/a`,
      ].sort()
    );
  });

  it('keeps the configuration of claude and its other projects read-only', () => {
    for (const c of ['settings.json', 'skills', 'plugins', 'projects']) {
      expect(montes, c).toContain(`--ro-bind /h/.claude/${c}`);
    }
    expect(montes.indexOf('--bind /h/.claude/projects/-demo-1')).toBeGreaterThan(
      montes.indexOf('--ro-bind /h/.claude/projects')
    );
  });

  it('keeps the repository of the home: every tree in sight, the copy read before its package is written', () => {
    for (const t of [REPO, COPIE, AUTRE]) {
      expect(montes.indexOf(`--ro-bind ${t}`), t).toBeGreaterThan(montes.indexOf('--tmpfs /h'));
    }
    expect(montes.lastIndexOf(`--ro-bind ${COPIE}`)).toBeLessThan(
      montes.indexOf(`--bind ${COPIE}/packages/a`)
    );
    expect(montes).toContain(`--ro-bind ${COPIE}/.git`);
  });

  it('mounts no declared path of the home that is absent from the disk', () => {
    const absent = plan(
      {
        trees: [REPO, COPIE],
        copie: COPIE,
        paquets: ['packages/a'],
        montages,
        paquetsDeLaCopie: [{ dossier: 'packages/a', pkg: { name: 'a' } }],
      },
      { existe: (p: string) => [COPIE, `${COPIE}/packages/a`, '/h/.claude'].includes(p) }
    ).args;
    expect(absent).not.toContain('/h/.nvm');
    expect(absent).toContain('/h/.claude');
  });
});
