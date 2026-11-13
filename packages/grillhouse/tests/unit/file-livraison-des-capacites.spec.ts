/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
// L'entrée d'un ticket sur main (`fermerLEntree`, scripts/integration/file.mjs) livre la capacité
// qu'il exporte : un ticket portant `export:<capacité>`, fermé par l'entrée, joue `bd ship
// <capacité>` (qui pose `provides:<capacité>`, le signal que lit la file d'un autre projet). Un
// ticket sans `export:` ne joue aucun `bd ship`. Un `bd ship` qui échoue est une faute nommée :
// `livraison` de la sortie la dit en une ligne (la capacité et la raison de Beads), son
// commentaire au ticket la dit entière, et l'entrée reste faite. Sans faute, `livraison` est null.
//
// L'historique est un dépôt d'essai lu par git ; Beads est une substitution dans le processus.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { fermerLEntree } from '../../scripts/integration/file.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'file-livraison-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

type Ticket = { id: string; status: string; labels: string[]; close_reason?: string };
type Reponse = { status: number; stdout: string; stderr: string };
const repondre = (stdout = '', status = 0, stderr = ''): Reponse => ({ status, stdout, stderr });

// Un Beads de substitution sur le ticket <t> ; `bd ship <cap>` rend <ship> (pose provides:<cap>
// quand il réussit), chaque appel gardé dans l'ordre.
function beads(t: Ticket, ship: (cap: string) => Reponse = () => repondre()) {
  const appels: string[][] = [];
  const bd = (...a: string[]): Reponse => {
    appels.push(a);
    if (a[0] === 'config') {
      return repondre('demo\n');
    }
    if (a[0] === 'show') {
      return repondre(JSON.stringify([t]));
    }
    if (a[0] === 'close') {
      t.status = 'closed';
      t.close_reason = a[a.indexOf('--reason') + 1];
    }
    if (a[0] === 'ship') {
      const r = ship(a[1]);
      if (r.status === 0) {
        t.labels.push(`provides:${a[1]}`);
      }
      return r;
    }
    return repondre();
  };
  return { bd, appels };
}

function depot() {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', racine, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
      encoding: 'utf8',
    }).trim();
  git('init', '-q', '-b', 'main');
  writeFileSync(path.join(racine, 'package.json'), '{}\n');
  git('add', '-A');
  git('commit', '-qm', 'feat: lot (demo-1)');
  return { racine, tip: git('rev-parse', 'HEAD') };
}

const entrer = (t: Ticket, ship?: (cap: string) => Reponse) => {
  const d = depot();
  const b = beads(t, ship);
  const dites: string[] = [];
  const o = { racine: d.racine, principale: 'main', bd: b.bd, dire: (l: string) => dites.push(l) };
  const sortie = fermerLEntree(o, {
    ticket: t.id,
    branche: `agent/${t.id}`,
    commit: d.tip,
  }) as { livraison: string | null };
  const ships = b.appels.filter(a => a[0] === 'ship');
  const commentaires = b.appels.filter(a => a[0] === 'comments' && a[1] === 'add').map(a => a[3]);
  return { sortie, ships, appels: b.appels, commentaires };
};

describe('l’entrée d’un ticket qui exporte une capacité la livre', () => {
  it('un ticket qui porte export:<capacité> joue bd ship <capacité>, une fois fermé', () => {
    const t: Ticket = { id: 'demo-1', status: 'open', labels: ['en-file', 'export:X'] };
    const r = entrer(t);
    expect(r.ships).toEqual([['ship', 'X']]);
    const iFerme = r.appels.findIndex(a => a[0] === 'close');
    const iShip = r.appels.findIndex(a => a[0] === 'ship');
    expect(iFerme).toBeGreaterThanOrEqual(0);
    expect(iShip).toBeGreaterThan(iFerme);
    expect(t.labels).toContain('provides:X');
    expect(r.sortie.livraison).toBeNull();
  });

  it('plusieurs capacités exportées : chacune est livrée', () => {
    const t: Ticket = { id: 'demo-1', status: 'open', labels: ['export:X', 'export:Y', 'circuit'] };
    const r = entrer(t);
    expect(r.ships.map(a => a[1]).sort()).toEqual(['X', 'Y']);
  });

  it('un ticket sans export: ne joue aucun bd ship', () => {
    const t: Ticket = {
      id: 'demo-1',
      status: 'open',
      labels: ['en-file', 'circuit', 'provides:Z'],
    };
    const r = entrer(t);
    expect(r.ships).toEqual([]);
    expect(r.sortie.livraison).toBeNull();
  });
});

describe('un bd ship qui échoue est une faute nommée de l’intégration', () => {
  it('la sortie nomme la capacité et la raison, le ticket en porte le commentaire, l’entrée est faite', () => {
    const t: Ticket = { id: 'demo-1', status: 'open', labels: ['en-file', 'export:X'] };
    const r = entrer(t, () => repondre('', 1, 'ship refusé : pas de ticket exportant X'));
    expect(t.status).toBe('closed');
    expect(r.sortie.livraison).toContain('X');
    expect(r.sortie.livraison).toContain('ship refusé');
    expect(r.commentaires.some(c => c.includes('bd ship X') && c.includes('ship refusé'))).toBe(
      true
    );
    expect(t.labels).not.toContain('provides:X');
  });

  it('la faute d’une capacité n’empêche pas de livrer l’autre, et nomme celle qui échoue', () => {
    const t: Ticket = { id: 'demo-1', status: 'open', labels: ['export:X', 'export:Y'] };
    const r = entrer(t, cap => (cap === 'X' ? repondre('', 1, 'refus') : repondre()));
    expect(r.ships.map(a => a[1]).sort()).toEqual(['X', 'Y']);
    expect(r.sortie.livraison).toContain('X');
    expect(r.sortie.livraison).not.toContain('Y');
    expect(t.labels).toContain('provides:Y');
  });
});
