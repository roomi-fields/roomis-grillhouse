// The copy of another ticket is an optional mount of the envelope (scripts/enveloppe/enveloppe.mjs,
// `plan`): another circuit removes it at any moment, between the list of the worktrees and the
// mounts of bwrap included, so its mount is one bwrap skips when its source is gone
// (`--ro-bind-try`, the optional mounts of the containers), and the session leaves without it. The
// main tree and the copy of the session, which the session cannot do without, keep a mount that
// fails without its source. Witness: BPScript, bp-mono-vbwf.320.20.1, « bwrap: Can't find source
// path …/.claude/worktrees/bp-mono-vbwf.320.7.3 ».
import { describe, expect, it } from 'vitest';
import { montagesDeLaSeance, plan } from '../../scripts/enveloppe/enveloppe.mjs';

const REPO = '/h/dev/projet';
const COPIE = `${REPO}/.claude/worktrees/demo-1`;
const AUTRE = `${REPO}/.claude/worktrees/demo-2`;
const montages = montagesDeLaSeance({
  cacheNpm: '/h/.npm',
  claude: '/h/.claude',
  projet: '/h/.claude/projects/-demo-1',
  etatJetable: '/t/claude.json',
  scratchpads: '/tmp/claude-1/-demo-1',
  sessions: ['/run/user/1'],
}) as { chemin: string }[];
const SUR_DISQUE = [
  ...montages.map(m => m.chemin),
  '/t/claude.json',
  REPO,
  `${REPO}/.beads`,
  COPIE,
  `${COPIE}/.git`,
  `${COPIE}/packages/a`,
];

// The mounts of the plan as `<flag> <source> <target>`, in order, on a disk that holds <presents>.
function montes(presents: string[]) {
  const disque = new Set(presents);
  const { args = [] } = plan(
    {
      trees: [REPO, COPIE, AUTRE],
      copie: COPIE,
      paquets: ['packages/a'],
      montages,
      paquetsDeLaCopie: [{ dossier: 'packages/a', pkg: { name: 'a' } }],
    },
    { existe: (p: string) => disque.has(p) }
  );
  return args.flatMap((a, i) =>
    a === '--bind' || a === '--ro-bind' || a === '--ro-bind-try'
      ? [`${a} ${args[i + 1]} ${args[i + 2]}`]
      : a === '--tmpfs'
        ? [`${a} ${args[i + 1]}`]
        : []
  );
}

describe('the copy of another ticket is an optional mount', () => {
  it('is mounted read-only by a mount bwrap skips when its source is gone', () => {
    const m = montes([...SUR_DISQUE, AUTRE]);
    expect(m).toContain(`--ro-bind-try ${AUTRE} ${AUTRE}`);
    expect(m).not.toContain(`--ro-bind ${AUTRE} ${AUTRE}`);
    expect(m).not.toContain(`--bind ${AUTRE} ${AUTRE}`);
  });

  it('comes back after the emptied home, before the copy of the session', () => {
    const m = montes([...SUR_DISQUE, AUTRE]);
    const autre = m.indexOf(`--ro-bind-try ${AUTRE} ${AUTRE}`);
    expect(autre).toBeGreaterThan(m.indexOf('--tmpfs /h'));
    expect(autre).toBeLessThan(m.lastIndexOf(`--ro-bind ${COPIE} ${COPIE}`));
  });

  it('never gets a mount that fails without its source, already gone from the disk or not', () => {
    for (const presents of [SUR_DISQUE, [...SUR_DISQUE, AUTRE]]) {
      const m = montes(presents);
      expect(m.filter(l => l.endsWith(` ${AUTRE}`) && !l.startsWith('--ro-bind-try '))).toEqual([]);
    }
  });

  it('leaves the main tree and the copy of the session a mount that fails without its source', () => {
    const m = montes([...SUR_DISQUE, AUTRE]);
    expect(m).toContain(`--ro-bind ${REPO} ${REPO}`);
    expect(m).toContain(`--ro-bind ${COPIE} ${COPIE}`);
    expect(m).not.toContain(`--ro-bind-try ${REPO} ${REPO}`);
    expect(m).not.toContain(`--ro-bind-try ${COPIE} ${COPIE}`);
  });
});
