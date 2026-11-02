/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
// grillhouse-9kq — la file des tickets d'un projet (scripts/file-des-tickets.mjs) : les tickets
// validés (`circuit`) dont toutes les dépendances sont fermées partent, par priorité Beads, sans
// geste du superviseur ; ceux dont une dépendance est ouverte restent. À la fin d'un circuit et à
// l'ouverture du superviseur ; aucun démon de plus. Chaque départ attend ensuite une place
// (scripts/places-de-la-machine.mjs). Modèle : Zuul et les files de fusion, qui lancent dès que les
// dépendances sont fermées.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { circuitsALOuverture } from '../../scripts/superviseur.mjs';

const FILE = path.resolve(__dirname, '../../scripts/file-des-tickets.mjs');
// Le module se charge à l'appel : s'il manque, chaque test échoue seul, au lieu du fichier entier.
/* eslint-disable @typescript-eslint/no-explicit-any */
const charger = (): any => createRequire(path.join(__dirname, 'x.cjs'))(FILE);
const lancerLaFile = (...a: any[]) => charger().lancerLaFile(...a);
const ticketsAPartir = (...a: any[]) => charger().ticketsAPartir(...a);
/* eslint-enable @typescript-eslint/no-explicit-any */
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'file-des-tickets-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

interface Ticket {
  id: string;
  status: string;
  priority: number;
  labels: string[];
  created_at: string;
  dependencies?: Array<{ type: string; depends_on_id: string }>;
}
let n = 0;
const T = (id: string, o: Partial<Ticket> = {}): Ticket => ({
  id,
  status: 'open',
  priority: 2,
  labels: ['circuit'],
  created_at: `2026-11-02T10:00:${String(++n % 60).padStart(2, '0')}Z`,
  ...o,
});
const bloque = (...ids: string[]) => ids.map(depends_on_id => ({ type: 'blocks', depends_on_id }));
const ids = (l: Array<{ id: string }>) => l.map(t => t.id);

describe('grillhouse-9kq critère 13 — les tickets circuit aux dépendances fermées partent', () => {
  it('un ticket circuit sans dépendance part', () => {
    expect(ids(ticketsAPartir([T('d-1')]))).toEqual(['d-1']);
  });

  it('une dépendance fermée le laisse partir, une dépendance ouverte le retient', () => {
    const tous = [
      T('d-1', { status: 'closed' }),
      T('d-2', { dependencies: bloque('d-1') }),
      T('d-3'),
      T('d-4', { dependencies: bloque('d-3') }),
    ];
    expect(ids(ticketsAPartir(tous))).toEqual(['d-2', 'd-3']);
  });

  it('toutes les dépendances comptent : une seule ouverte parmi plusieurs retient', () => {
    const tous = [
      T('d-1', { status: 'closed' }),
      T('d-2'),
      T('d-3', { dependencies: bloque('d-1', 'd-2') }),
      T('d-4', { dependencies: bloque('d-1') }),
    ];
    expect(ids(ticketsAPartir(tous))).toEqual(['d-2', 'd-4']);
  });

  it('une dépendance qui n’est pas « blocks » (parent-child, related) ne retient pas', () => {
    const tous = [
      T('d-1'),
      T('d-2', { dependencies: [{ type: 'parent-child', depends_on_id: 'd-1' }] }),
    ];
    expect(ids(ticketsAPartir(tous))).toEqual(['d-1', 'd-2']);
  });

  it('un ticket sans l’étiquette circuit, fermé ou déjà pris reste hors de la file', () => {
    const tous = [
      T('d-1', { labels: [] }),
      T('d-2', { labels: ['a-valider'] }),
      T('d-3', { status: 'closed' }),
      T('d-4', { status: 'in_progress' }),
      T('d-5'),
    ];
    expect(ids(ticketsAPartir(tous))).toEqual(['d-5']);
  });

  it('un ticket dont le circuit tourne déjà ne repart pas', () => {
    const tous = [T('d-1'), T('d-2')];
    expect(ids(ticketsAPartir(tous, { enCours: new Set(['d-1']) }))).toEqual(['d-2']);
  });

  it('par priorité Beads (0 d’abord), puis par ordre de création', () => {
    const tous = [
      T('d-1', { priority: 2, created_at: '2026-11-02T10:00:01Z' }),
      T('d-2', { priority: 0, created_at: '2026-11-02T10:00:05Z' }),
      T('d-3', { priority: 2, created_at: '2026-11-02T09:00:00Z' }),
      T('d-4', { priority: 1, created_at: '2026-11-02T10:00:09Z' }),
    ];
    expect(ids(ticketsAPartir(tous))).toEqual(['d-2', 'd-4', 'd-3', 'd-1']);
  });

  it('une dépendance hors de la liste (ticket inconnu) retient : le ticket n’est pas prêt', () => {
    expect(ids(ticketsAPartir([T('d-1', { dependencies: bloque('ailleurs-9') })]))).toEqual([]);
  });
});

describe('grillhouse-9kq critère 2 — la dépendance fermée, le ticket part sans geste du superviseur', () => {
  it('lancerLaFile lance chaque ticket prêt, dans l’ordre, par la commande donnée', () => {
    const lances: string[] = [];
    const tous = [
      T('d-1', { status: 'closed' }),
      T('d-2', { dependencies: bloque('d-1'), priority: 1 }),
      T('d-3', { priority: 0 }),
      T('d-4', { dependencies: bloque('d-3') }),
    ];
    const r = lancerLaFile('/projet', { tickets: tous, lancer: (id: string) => lances.push(id) });
    expect(lances).toEqual(['d-3', 'd-2']);
    expect(r).toEqual(['d-3', 'd-2']);
  });

  it('la dépendance fermée entre deux lectures libère le ticket retenu', () => {
    const lances: string[] = [];
    const avant = [T('d-1'), T('d-2', { dependencies: bloque('d-1') })];
    lancerLaFile('/projet', {
      tickets: avant,
      lancer: (id: string) => lances.push(id),
      enCours: new Set(['d-1']),
    });
    expect(lances).toEqual([]);
    const apres = [T('d-1', { status: 'closed' }), avant[1]];
    lancerLaFile('/projet', { tickets: apres, lancer: (id: string) => lances.push(id) });
    expect(lances).toEqual(['d-2']);
  });

  it('une file vide ne lance rien', () => {
    const lances: string[] = [];
    expect(
      lancerLaFile('/projet', { tickets: [], lancer: (id: string) => lances.push(id) })
    ).toEqual([]);
    expect(lances).toEqual([]);
  });
});

describe('grillhouse-9kq critère 13 — à l’ouverture du superviseur', () => {
  const depot = () => {
    const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
    mkdirSync(path.join(racine, '.claude', 'worktrees'), { recursive: true });
    return racine;
  };

  it('l’ouverture lance les tickets circuit prêts du projet, retient ceux qui attendent une dépendance', () => {
    const lances: string[] = [];
    const tickets = [
      T('d-1'),
      T('d-2', { dependencies: bloque('d-1') }),
      T('d-3', { priority: 0 }),
    ];
    const texte = circuitsALOuverture(depot(), {
      fermes: () => new Set(),
      tickets: () => tickets,
      lancer: (id: string) => lances.push(id),
    } as Parameters<typeof circuitsALOuverture>[1]);
    expect(lances).toEqual(['d-3', 'd-1']);
    expect(texte).toMatch(/d-3/);
  });
});
