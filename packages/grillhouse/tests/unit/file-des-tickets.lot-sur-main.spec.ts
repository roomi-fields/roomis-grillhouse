// A ticket whose lot is on main never starts again by the queue of the tickets
// (scripts/file-des-tickets.mjs), reopened or left open: as a merge queue drops a merged entry
// whatever the state of its ticket (bors, GitHub's merge queue). `ticketsAPartir` leaves it out,
// `enFileSurMain` names it for the board and the supervisor's opening, and `lotEstSurMain` is the
// reading they share, over the one rule `lotSurMain` (scripts/integration/integrer.mjs). Work to
// do again on an integrated lot is a new ticket; a lot withdrawn by a revert starts again.
//
// The history is a trial repository read by git; the prefix is the key `issue-prefix` of its
// `.beads/config.yaml`, read without `bd`.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { enFileSurMain, lotEstSurMain, ticketsAPartir } from '../../scripts/file-des-tickets.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'file-lot-sur-main-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ARCHITECTURE = '## Architecture\n\n- Adresse : scripts/x.mjs.';
let n = 0;
const T = (id: string, o: object = {}) => ({
  id,
  status: 'open',
  priority: 2,
  labels: ['circuit'],
  created_at: `2026-11-02T10:00:${String(n++).padStart(2, '0')}Z`,
  description: ARCHITECTURE,
  ...o,
});
const ids = (l: { id: string }[]) => l.map(t => t.id);
const surMain = (...livres: string[]) => {
  const lus: string[] = [];
  return {
    lus,
    de: (id: string) => {
      lus.push(id);
      return livres.includes(id);
    },
  };
};

function depot(config: string | null = 'issue-prefix: "demo"\n') {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  if (config !== null) {
    mkdirSync(path.join(racine, '.beads'));
    writeFileSync(path.join(racine, '.beads/config.yaml'), config);
  }
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', racine, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
      encoding: 'utf8',
    }).trim();
  git('init', '-q', '-b', 'main');
  const commit = (fichier: string, message: string) => {
    writeFileSync(path.join(racine, fichier), `${message}\n`);
    git('add', '-A');
    git('commit', '-q', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  commit('base.txt', 'base');
  return { racine, git, commit };
}

describe('un ticket dont le lot est sur main ne repart pas par la file', () => {
  it('resté ouvert et étiqueté circuit, ses dépendances fermées, il ne part pas ; les autres partent', () => {
    const tous = [
      T('demo-1', { dependencies: [{ type: 'blocks', depends_on_id: 'demo-3' }] }),
      T('demo-2'),
      T('demo-3', { status: 'closed' }),
    ];
    expect(ids(ticketsAPartir(tous, { surMain: surMain('demo-1').de }))).toEqual(['demo-2']);
  });

  it('sans lecture de main donnée, la règle des dépendances décide seule', () => {
    expect(ids(ticketsAPartir([T('demo-1')]))).toEqual(['demo-1']);
  });

  it('la file le nomme, lui seul', () => {
    const tous = [T('demo-1'), T('demo-2'), T('demo-4')];
    expect(ids(enFileSurMain(tous, { surMain: surMain('demo-4', 'demo-1').de }))).toEqual([
      'demo-1',
      'demo-4',
    ]);
    expect(enFileSurMain(tous)).toEqual([]);
  });

  it('main ne se lit que pour un ticket qui partirait : ni fermé, ni tenu, ni en cours, ni sans architecture', () => {
    const tous = [
      T('demo-1', { status: 'closed' }),
      T('demo-2', { dependencies: [{ type: 'blocks', depends_on_id: 'demo-9' }] }),
      T('demo-3'),
      T('demo-4', { description: '## Besoin' }),
      T('demo-5', { labels: ['circuit', 'direct'] }),
      T('demo-6'),
    ];
    const s = surMain('demo-1', 'demo-2', 'demo-3', 'demo-4', 'demo-5');
    const o = { enCours: new Set(['demo-3']), surMain: s.de };
    expect(enFileSurMain(tous, o)).toEqual([]);
    expect(ids(ticketsAPartir(tous, o))).toEqual(['demo-6']);
    expect([...new Set(s.lus)]).toEqual(['demo-6']);
  });
});

describe('la lecture de main que la file, le panneau et l’ouverture partagent', () => {
  it('dit sur main le ticket qu’un commit de main livre, pas les autres', () => {
    const { racine, commit } = depot();
    commit('lot.txt', 'feat: le lot (demo-1)');
    const lu = lotEstSurMain(racine);
    expect(lu('demo-1')).toBe(true);
    expect(lu('demo-2')).toBe(false);
  });

  it('un lot retiré par un revert n’est plus sur main : son ticket repart', () => {
    const { racine, git, commit } = depot();
    commit('lot.txt', 'feat: le lot (demo-1)');
    git('revert', '--no-edit', 'HEAD');
    const tous = [T('demo-1')];
    expect(ids(ticketsAPartir(tous, { surMain: lotEstSurMain(racine) }))).toEqual(['demo-1']);
  });

  it('un préfixe qui ne se lit pas ne tient aucun ticket : le circuit nomme la faute', () => {
    const { racine, commit } = depot(null);
    commit('lot.txt', 'feat: le lot (demo-1)');
    expect(lotEstSurMain(racine)('demo-1')).toBe(false);
  });
});
