/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
// A closure that fails at the entry of a ticket on main (`fermerLEntree`,
// scripts/integration/file.mjs) is said: Beads refuses `bd close` on a ticket an open dependency
// blocks (« cannot close …: blocked by open issues »), and the lot is on main all the same. The
// outcome names the fault in one line (`fermeture`), its comment at the ticket says it whole, no
// capability is delivered for a ticket left open, its working directory stays for the circuit that
// stops, and main is pushed. The queue then gives the circuit the issue « echec »
// (`issueDeLEntree`, src/temporal/file/contrat.ts), on which it stops with its question to the
// supervisor; a closure done gives « ferme ». Witness: OB-80g.4 (osc-bridge, 2026-11-21),
// integrated, left open, started again by the queue half an hour later.
//
// The history is a trial repository read by git; Beads is a stand-in in the process.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { fermerLEntree } from '../../scripts/integration/file.mjs';
import { issueDeLEntree } from '../../src/temporal/file/contrat.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'file-fermeture-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

type Ticket = { id: string; status: string; labels: string[]; close_reason?: string };
type Reponse = { status: number; stdout: string; stderr: string };
const repondre = (stdout = '', status = 0, stderr = ''): Reponse => ({ status, stdout, stderr });
const REFUS = 'cannot close demo-1: blocked by open issues [demo-8] (use --force to override)';

// A stand-in Beads over the ticket <t>, whose `bd close` answers <close> (and closes the ticket
// when it succeeds), each call kept in order.
function beads(t: Ticket, close: () => Reponse) {
  const appels: string[][] = [];
  const bd = (...a: string[]): Reponse => {
    appels.push(a);
    if (a[0] === 'show') {
      return repondre(JSON.stringify([t]));
    }
    if (a[0] === 'close') {
      const r = close();
      if (r.status === 0) {
        t.status = 'closed';
        t.close_reason = a[a.indexOf('--reason') + 1];
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
  const travail = path.join(racine, '.claude', 'worktrees', 'demo-1.travail');
  mkdirSync(travail, { recursive: true });
  return { racine, tip: git('rev-parse', 'HEAD'), travail };
}

const entrer = (t: Ticket, close: () => Reponse = () => repondre()) => {
  const d = depot();
  const b = beads(t, close);
  const rendus: { genre: string; texte?: string }[] = [];
  const o = { racine: d.racine, principale: 'main', bd: b.bd, dire: () => {}, rendus };
  // The entry played, as the queue plays it again at the resumption of the circuit.
  const rejouer = () =>
    fermerLEntree(o, { ticket: t.id, branche: `agent/${t.id}`, commit: d.tip }) as {
      poussee: string | null;
      raison: string | null;
      fermeture: string | null;
    };
  const sortie = rejouer();
  return { sortie, rejouer, appels: b.appels, d, commentaires: rendus.map(r => r.texte ?? '') };
};

describe('une fermeture de ticket qui échoue à l’entrée sur main se dit', () => {
  it('la sortie nomme la faute et la raison de Beads, le ticket en porte le commentaire', () => {
    const t: Ticket = { id: 'demo-1', status: 'open', labels: ['circuit', 'en-file'] };
    const r = entrer(t, () => repondre('', 1, REFUS));
    expect(t.status).toBe('open');
    expect(r.sortie.fermeture).toContain('bd close demo-1');
    expect(r.sortie.fermeture).toContain('blocked by open issues [demo-8]');
    expect(r.sortie.fermeture).not.toContain('\n');
    expect(r.commentaires.some(c => c.includes(REFUS) && c.includes(r.d.tip.slice(0, 7)))).toBe(
      true
    );
  });

  it('un ticket resté ouvert ne livre aucune capacité et garde son dossier de travail', () => {
    const t: Ticket = { id: 'demo-1', status: 'open', labels: ['circuit', 'export:X'] };
    const r = entrer(t, () => repondre('', 1, REFUS));
    expect(r.appels.filter(a => a[0] === 'ship')).toEqual([]);
    expect(existsSync(r.d.travail)).toBe(true);
  });

  it('une fermeture faite ne dit aucune faute, et le dossier de travail part', () => {
    const t: Ticket = { id: 'demo-1', status: 'open', labels: ['circuit', 'en-file'] };
    const r = entrer(t);
    expect(t.status).toBe('closed');
    expect(r.sortie.fermeture).toBeNull();
    expect(existsSync(r.d.travail)).toBe(false);
  });

  it('le commentaire ne conseille que de lever ce qui l’empêche, puis --reprendre', () => {
    const t: Ticket = { id: 'demo-1', status: 'open', labels: ['circuit'] };
    const r = entrer(t, () => repondre('', 1, REFUS));
    const commentaire = r.commentaires.find(c => c.includes(REFUS)) ?? '';
    expect(commentaire).toContain('--reprendre');
    expect(commentaire).not.toContain('à la main');
  });

  it('rejouée par la reprise, ce qui l’empêchait levé, l’entrée ferme le ticket, livre sa capacité et retire son dossier', () => {
    const t: Ticket = { id: 'demo-1', status: 'open', labels: ['circuit', 'export:X'] };
    let leve = false;
    const r = entrer(t, () => (leve ? repondre() : repondre('', 1, REFUS)));
    expect(r.sortie.fermeture).not.toBeNull();
    leve = true;
    const suite = r.rejouer();
    expect(t.status).toBe('closed');
    expect(suite.fermeture).toBeNull();
    expect(r.appels.filter(a => a[0] === 'ship')).toEqual([['ship', 'X']]);
    expect(existsSync(r.d.travail)).toBe(false);
  });
});

describe('l’issue que la file rend au circuit pour une entrée sur main', () => {
  const COMMIT = 'abcdef0123456789';

  it('une fermeture qui échoue arrête le circuit : « echec », le commit, la faute et la reprise nommés', () => {
    const issue = issueDeLEntree('demo-1', COMMIT, {
      raison: null,
      livraison: null,
      fermeture: `bd close demo-1 échoue : ${REFUS}`,
    });
    expect(issue.etat).toBe('echec');
    expect(issue.raison).toContain('abcdef0');
    expect(issue.raison).toContain(REFUS);
    expect(issue.raison).toContain('--reprendre');
  });

  it('elle garde la raison d’une poussée refusée', () => {
    const issue = issueDeLEntree('demo-1', COMMIT, {
      raison: 'La poussée de abcdef0 vers origin/main est refusée',
      fermeture: 'bd close demo-1 échoue : refus',
    });
    expect(issue.etat).toBe('echec');
    expect(issue.raison).toContain('poussée de abcdef0');
  });

  it('une fermeture faite rend « ferme », la poussée refusée et la capacité non livrée à sa suite', () => {
    expect(issueDeLEntree('demo-1', COMMIT, { raison: null, livraison: null })).toEqual({
      etat: 'ferme',
      raison: 'intégré : abcdef0',
    });
    expect(
      issueDeLEntree('demo-1', COMMIT, { raison: 'poussée refusée', livraison: 'bd ship X échoue' })
    ).toEqual({ etat: 'ferme', raison: 'intégré : abcdef0 ; poussée refusée ; bd ship X échoue' });
  });
});
