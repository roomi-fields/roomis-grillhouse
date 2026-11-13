/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument,@typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
// La file des tickets d'un projet respecte les dépendances entre projets de Beads
// (`external:<projet>:<capacité>`) : un ticket dont une capacité n'est pas livrée par son projet
// fournisseur ne part pas. Le signal « livré » est l'étiquette `provides:<capacité>` sur un ticket
// fermé du fournisseur (que pose `bd ship`) ; `externes` donne, par nom de projet (la clé de
// `external_projects`), les tickets de ce fournisseur. Un projet absent de `externes` est une
// faute nommée, jamais un départ en silence. `attentesExternes` dit, pour le tableau et la file,
// ce que chaque ticket de la file attend d'un autre projet.
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const FILE = path.resolve(__dirname, '../../scripts/file-des-tickets.mjs');
/* eslint-disable @typescript-eslint/no-explicit-any */
const charger = (): any => createRequire(path.join(__dirname, 'x.cjs'))(FILE);
const ticketsAPartir = (...a: any[]) => charger().ticketsAPartir(...a);
const attentesExternes = (...a: any[]) => charger().attentesExternes(...a);
/* eslint-enable @typescript-eslint/no-explicit-any */

interface Ticket {
  id: string;
  status: string;
  priority: number;
  labels: string[];
  created_at: string;
  description?: string;
  dependencies?: Array<{ type: string; depends_on_id: string }>;
}
let n = 0;
const ARCHITECTURE = '## Besoin\n\nUn besoin.\n\n## Architecture\n\n- Adresse : scripts/x.mjs.';
const T = (id: string, o: Partial<Ticket> = {}): Ticket => ({
  id,
  status: 'open',
  priority: 2,
  labels: ['circuit'],
  created_at: `2026-11-02T10:00:${String(++n % 60).padStart(2, '0')}Z`,
  description: ARCHITECTURE,
  ...o,
});
const externe = (...cibles: string[]) =>
  cibles.map(c => ({ type: 'blocks', depends_on_id: `external:${c}` }));
const ids = (l: Array<{ id: string }>) => l.map(t => t.id);

// Le fournisseur osc-bridge : un ticket qui exporte X, fermé ou non, livré ou non.
const fournisseur = (o: Partial<Ticket> = {}) =>
  T('ob-1', { status: 'closed', labels: ['export:X'], ...o });

describe('un ticket qui attend la capacité d’un autre projet part dès qu’elle est livrée', () => {
  it('une capacité non livrée retient le ticket', () => {
    const tous = [T('sh-1', { dependencies: externe('osc-bridge:X') })];
    const externes = { 'osc-bridge': [fournisseur({ status: 'open' })] };
    expect(ids(ticketsAPartir(tous, { externes }))).toEqual([]);
  });

  it('un ticket fermé qui exporte X sans l’étiquette provides:X ne livre pas', () => {
    const tous = [T('sh-1', { dependencies: externe('osc-bridge:X') })];
    const externes = { 'osc-bridge': [fournisseur()] };
    expect(ids(ticketsAPartir(tous, { externes }))).toEqual([]);
  });

  it('un ticket fermé portant provides:X livre : le ticket part', () => {
    const tous = [T('sh-1', { dependencies: externe('osc-bridge:X') })];
    const externes = { 'osc-bridge': [fournisseur({ labels: ['export:X', 'provides:X'] })] };
    expect(ids(ticketsAPartir(tous, { externes }))).toEqual(['sh-1']);
  });

  it('provides:X sur un ticket resté ouvert ne livre pas', () => {
    const tous = [T('sh-1', { dependencies: externe('osc-bridge:X') })];
    const externes = {
      'osc-bridge': [fournisseur({ status: 'open', labels: ['export:X', 'provides:X'] })],
    };
    expect(ids(ticketsAPartir(tous, { externes }))).toEqual([]);
  });

  it('une autre capacité livrée ne livre pas X', () => {
    const tous = [T('sh-1', { dependencies: externe('osc-bridge:X') })];
    const externes = { 'osc-bridge': [fournisseur({ labels: ['export:Y', 'provides:Y'] })] };
    expect(ids(ticketsAPartir(tous, { externes }))).toEqual([]);
  });

  it('chaque capacité compte : deux attendues, une seule livrée retient', () => {
    const tous = [T('sh-1', { dependencies: externe('osc-bridge:X', 'osc-bridge:Y') })];
    const livre = (c: string) =>
      fournisseur({ id: `ob-${c}`, labels: [`export:${c}`, `provides:${c}`] });
    expect(ids(ticketsAPartir(tous, { externes: { 'osc-bridge': [livre('X')] } }))).toEqual([]);
    expect(
      ids(ticketsAPartir(tous, { externes: { 'osc-bridge': [livre('X'), livre('Y')] } }))
    ).toEqual(['sh-1']);
  });

  it('chaque projet fournisseur se lit dans le sien : provides:X chez un autre projet ne livre pas', () => {
    const tous = [T('sh-1', { dependencies: externe('osc-bridge:X') })];
    const externes = {
      'osc-bridge': [],
      osd: [fournisseur({ labels: ['export:X', 'provides:X'] })],
    };
    expect(ids(ticketsAPartir(tous, { externes }))).toEqual([]);
  });

  it('une dépendance interne fermée et une externe livrée laissent partir ; l’interne ouverte retient', () => {
    const livre = fournisseur({ labels: ['export:X', 'provides:X'] });
    const tous = [
      T('sh-1', { status: 'closed' }),
      T('sh-2', {
        dependencies: [{ type: 'blocks', depends_on_id: 'sh-1' }, ...externe('osc-bridge:X')],
      }),
      T('sh-3'),
      T('sh-4', {
        dependencies: [{ type: 'blocks', depends_on_id: 'sh-3' }, ...externe('osc-bridge:X')],
      }),
    ];
    expect(ids(ticketsAPartir(tous, { externes: { 'osc-bridge': [livre] } }))).toEqual([
      'sh-2',
      'sh-3',
    ]);
  });

  it('un ticket sans dépendance externe part sans que `externes` soit donné', () => {
    expect(ids(ticketsAPartir([T('sh-1')]))).toEqual(['sh-1']);
  });
});

describe('un projet fournisseur que la configuration ne résout pas retient le ticket, la faute nommée', () => {
  it('external_projects absent : le ticket ne part pas, et la faute nomme le projet', () => {
    const tous = [T('sh-1', { dependencies: externe('osc-bridge:X') })];
    expect(ids(ticketsAPartir(tous))).toEqual([]);
    const [a] = attentesExternes(tous);
    expect(a.ticket).toBe('sh-1');
    expect(a.attend).toBe('osc-bridge:X');
    expect(a.faute).toContain('osc-bridge');
  });

  it('un projet absent de external_projects : retenu, la faute nomme le projet manquant', () => {
    const tous = [T('sh-1', { dependencies: externe('osc-bridge:X') })];
    const externes = { osd: [] };
    expect(ids(ticketsAPartir(tous, { externes }))).toEqual([]);
    const [a] = attentesExternes(tous, { externes });
    expect(a.faute).toContain('osc-bridge');
  });

  it('un projet résolu mais sa capacité non livrée : l’attente est nommée, sans faute', () => {
    const tous = [T('sh-1', { dependencies: externe('osc-bridge:X') })];
    const externes = { 'osc-bridge': [fournisseur()] };
    expect(attentesExternes(tous, { externes })).toEqual([
      { ticket: 'sh-1', attend: 'osc-bridge:X', faute: null },
    ]);
  });
});

describe('ce qu’un ticket de la file attend d’un autre projet', () => {
  it('une capacité livrée n’est plus attendue', () => {
    const tous = [T('sh-1', { dependencies: externe('osc-bridge:X') })];
    const externes = { 'osc-bridge': [fournisseur({ labels: ['export:X', 'provides:X'] })] };
    expect(attentesExternes(tous, { externes })).toEqual([]);
  });

  it('un ticket attend plusieurs capacités de projets différents : chacune est nommée', () => {
    const tous = [T('sh-1', { dependencies: externe('osc-bridge:X', 'osd:Y') })];
    const externes = { 'osc-bridge': [], osd: [] };
    const attentes = attentesExternes(tous, { externes });
    expect(attentes.map((a: { attend: string }) => a.attend).sort()).toEqual([
      'osc-bridge:X',
      'osd:Y',
    ]);
    expect(attentes.every((a: { ticket: string }) => a.ticket === 'sh-1')).toBe(true);
  });

  it('un ticket hors de la file (fermé, ou déjà en circuit) n’attend rien', () => {
    const tous = [
      T('sh-1', { status: 'closed', dependencies: externe('osc-bridge:X') }),
      T('sh-2', { dependencies: externe('osc-bridge:X') }),
    ];
    const externes = { 'osc-bridge': [] };
    expect(
      attentesExternes(tous, { externes, enCours: new Set(['sh-2']) }).map(
        (a: { ticket: string }) => a.ticket
      )
    ).toEqual([]);
  });
});
