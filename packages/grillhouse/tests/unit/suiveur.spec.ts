// The follower of the board (scripts/suiveur.mjs, `grillhouse tableau --suivre`): one producer that
// follows the events and writes, from one measure, the status line's text and the pane's line, as
// watchman or `tsc --watch` keep one watch, one state, many readers.
// Witness: Romain, 2026-11-12, the status bar and the pane showing two different states.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Suiveur = typeof import('../../scripts/suiveur.mjs');

// The module is read at the load of the file, so that a module not yet written fails each test by
// its missing names, not the whole file at its load.
const suiveur = (await import(/* @vite-ignore */ '../../scripts/suiveur.mjs').catch(
  () => ({})
)) as Suiveur;
const {
  AVANCEMENT,
  PEREMPTION,
  REBOND,
  SECOURS,
  delaiAvantLaMesure,
  empreinteDesCircuits,
  lireEtat,
  mesurerUneFois,
  prendreLeVerrou,
  rebondir,
  relayer,
  veiller,
} = suiveur;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'suiveur-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const dossier = (nom: string) => mkdtempSync(path.join(ESSAIS, `${nom}-`));

const MIN = 60_000;
// A guard far above the normal wait of a watch, not a measure.
const GARDE = 10_000;

const attendre = async (condition: () => boolean, ms = GARDE) => {
  const fin = Date.now() + ms;
  while (!condition() && Date.now() < fin) {
    await new Promise(r => setTimeout(r, 20));
  }
  return condition();
};

describe('one measure feeds the status line and the pane', () => {
  const tableauDEssai = (n: number) => ({
    etat: `🌙 1 · ⏳ ${n} · Grillhouse : 2 en cours`,
    lignes: [{ texte: 'DEMO' }],
  });

  it('measures once and derives the status text and the pane line from that one call', async () => {
    const commun = dossier('commun');
    let appels = 0;
    const mesure = () => {
      appels += 1;
      return Promise.resolve(tableauDEssai(appels));
    };
    const r = await mesurerUneFois('/depot', { commun, mesure, maintenant: 1_000 });
    expect(appels).toBe(1);
    expect(r.texte).toBe('🌙 1 · ⏳ 1 · Grillhouse : 2 en cours');
    expect(JSON.parse(r.ligne)).toEqual(tableauDEssai(1));
    expect(r.ligne).not.toContain('\n');
    // The file the status line reads carries the same text as the pane's line.
    expect(lireEtat(readFileSync(path.join(commun, 'grillhouse-etat.txt'), 'utf8'), 1_000)).toBe(
      r.texte
    );
  });

  it('gives the other projects of the pane to the one measure', async () => {
    const commun = dossier('commun');
    const recu: unknown[] = [];
    const mesure = (_racine: string, o: { projets?: string[] }) => {
      recu.push(o.projets);
      return Promise.resolve(tableauDEssai(0));
    };
    await mesurerUneFois('/depot', { commun, mesure, projets: ['/autre'], maintenant: 1 });
    expect(recu).toEqual([['/autre']]);
  });

  it('writes the time of the measure with the status text', async () => {
    const commun = dossier('commun');
    await mesurerUneFois('/depot', {
      commun,
      mesure: () => Promise.resolve(tableauDEssai(1)),
      maintenant: 5_000,
    });
    const contenu = readFileSync(path.join(commun, 'grillhouse-etat.txt'), 'utf8');
    expect(lireEtat(contenu, 5_000 + PEREMPTION)).toBe(tableauDEssai(1).etat);
  });
});

describe('the status line shows nothing from a stale measure', () => {
  const ecrit = async (maintenant: number) => {
    const commun = dossier('commun');
    await mesurerUneFois('/depot', {
      commun,
      mesure: () => Promise.resolve({ etat: 'ÉTAT', lignes: [] }),
      maintenant,
    });
    return readFileSync(path.join(commun, 'grillhouse-etat.txt'), 'utf8');
  };

  it('shows the text while the measure is younger than 10 minutes', async () => {
    expect(PEREMPTION).toBe(10 * MIN);
    expect(lireEtat(await ecrit(1_000), 1_000 + 10 * MIN)).toBe('ÉTAT');
  });
  it('shows nothing once the measure is older than 10 minutes', async () => {
    expect(lireEtat(await ecrit(1_000), 1_000 + 10 * MIN + 1)).toBe('');
  });
  it('shows nothing for an empty, unreadable or timeless content', () => {
    expect(lireEtat('', 1)).toBe('');
    expect(lireEtat('pas du json', 1)).toBe('');
    expect(lireEtat(JSON.stringify({ texte: 'ÉTAT' }), 1)).toBe('');
  });
});

describe('the next measure without an event', () => {
  it('falls back to a measure every 5 minutes', () => {
    expect(SECOURS).toBe(5 * MIN);
    expect(delaiAvantLaMesure({ derniere: 0, maintenant: 0, avancement: false })).toBe(5 * MIN);
    expect(delaiAvantLaMesure({ derniere: 0, maintenant: 2 * MIN, avancement: false })).toBe(
      3 * MIN
    );
  });
  it('measures again every 10 s while a line of progress shows, and only then', () => {
    expect(AVANCEMENT).toBe(10_000);
    expect(delaiAvantLaMesure({ derniere: 0, maintenant: 3_000, avancement: true })).toBe(7_000);
    expect(delaiAvantLaMesure({ derniere: 0, maintenant: 3_000, avancement: false })).toBe(
      5 * MIN - 3_000
    );
  });
  it('is due at once when the wait is over', () => {
    expect(delaiAvantLaMesure({ derniere: 0, maintenant: 20 * MIN, avancement: false })).toBe(0);
    expect(delaiAvantLaMesure({ derniere: 0, maintenant: 11_000, avancement: true })).toBe(0);
  });
});

describe('the light poll of Temporal', () => {
  const c = (ticket: string, etape: string, extra: object = {}) => ({
    ticket,
    etape,
    tentative: 1,
    vivant: true,
    avancement: { faits: 1, prevus: 5 },
    ...extra,
  });
  it('is the same for the same set of circuits, in any order, whatever their progress counters', () => {
    const a = [c('x-1', 'tests'), c('x-2', 'code')];
    const b = [c('x-2', 'code', { avancement: { faits: 4, prevus: 5 } }), c('x-1', 'tests')];
    expect(empreinteDesCircuits(a)).toBe(empreinteDesCircuits(b));
  });
  it('changes when a circuit changes step, ends, arrives or goes', () => {
    const base = [c('x-1', 'tests'), c('x-2', 'code')];
    const e = empreinteDesCircuits(base);
    expect(empreinteDesCircuits([c('x-1', 'code'), c('x-2', 'code')])).not.toBe(e);
    expect(empreinteDesCircuits([c('x-1', 'tests', { vivant: false }), c('x-2', 'code')])).not.toBe(
      e
    );
    expect(empreinteDesCircuits([...base, c('x-3', 'tests')])).not.toBe(e);
    expect(empreinteDesCircuits([base[0]])).not.toBe(e);
  });
  it('tells an empty set from a set', () => {
    expect(empreinteDesCircuits([])).not.toBe(empreinteDesCircuits([c('x-1', 'tests')]));
  });
});

describe('bursts of events fold into one measure', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it('keeps the bounce under a second', () => {
    expect(REBOND).toBeGreaterThan(0);
    expect(REBOND).toBeLessThan(1_000);
  });
  it('measures once for events that come close together', () => {
    const mesure = vi.fn();
    const r = rebondir(REBOND, mesure);
    r.demander();
    vi.advanceTimersByTime(REBOND / 2);
    r.demander();
    vi.advanceTimersByTime(REBOND / 2);
    r.demander();
    expect(mesure).not.toHaveBeenCalled();
    vi.advanceTimersByTime(REBOND);
    expect(mesure).toHaveBeenCalledTimes(1);
  });
  it('measures again for an event after the bounce', () => {
    const mesure = vi.fn();
    const r = rebondir(REBOND, mesure);
    r.demander();
    vi.advanceTimersByTime(REBOND);
    r.demander();
    vi.advanceTimersByTime(REBOND);
    expect(mesure).toHaveBeenCalledTimes(2);
  });
  it('measures no more once cancelled', () => {
    const mesure = vi.fn();
    const r = rebondir(REBOND, mesure);
    r.demander();
    r.annuler();
    vi.advanceTimersByTime(10 * REBOND);
    expect(mesure).not.toHaveBeenCalled();
  });
});

describe('the watch of files', () => {
  const depot = () => {
    const racine = dossier('depot');
    const commun = path.join(racine, '.git');
    mkdirSync(path.join(racine, '.beads'), { recursive: true });
    mkdirSync(path.join(commun, 'refs/heads'), { recursive: true });
    writeFileSync(path.join(commun, 'HEAD'), 'ref: refs/heads/main\n');
    return { racine, commun };
  };
  const suivre = async (changer: (d: { racine: string; commun: string }) => void) => {
    const d = depot();
    let mesures = 0;
    const v = veiller({
      racine: d.racine,
      commun: d.commun,
      rebond: 50,
      quand: () => (mesures += 1),
    });
    // The watch is armed once `veiller` has returned.
    await new Promise(r => setTimeout(r, 200));
    const avant = Date.now();
    changer(d);
    const vu = await attendre(() => mesures > 0, 3_000);
    const delai = Date.now() - avant;
    await new Promise(r => setTimeout(r, 400));
    v.fermer();
    return { vu, delai, mesures };
  };

  it('asks for a measure on a change under .beads/', async () => {
    const r = await suivre(d => writeFileSync(path.join(d.racine, '.beads/issues.jsonl'), '{}\n'));
    expect(r.vu).toBe(true);
    expect(r.delai).toBeLessThan(3_000);
  });
  it('asks for a measure when HEAD moves', async () => {
    const r = await suivre(d =>
      writeFileSync(path.join(d.commun, 'HEAD'), 'ref: refs/heads/autre\n')
    );
    expect(r.vu).toBe(true);
  });
  it('asks for a measure when a reference moves', async () => {
    const r = await suivre(d => writeFileSync(path.join(d.commun, 'refs/heads/main'), 'abc\n'));
    expect(r.vu).toBe(true);
  });
  it('folds a burst of writes into one measure', async () => {
    const r = await suivre(d => {
      for (let i = 0; i < 5; i++) {
        writeFileSync(path.join(d.racine, '.beads/issues.jsonl'), `{"n":${i}}\n`);
      }
    });
    expect(r.mesures).toBe(1);
  });
  it('asks for nothing once closed', async () => {
    const d = depot();
    let mesures = 0;
    const v = veiller({
      racine: d.racine,
      commun: d.commun,
      rebond: 50,
      quand: () => (mesures += 1),
    });
    await new Promise(r => setTimeout(r, 200));
    v.fermer();
    writeFileSync(path.join(d.racine, '.beads/issues.jsonl'), '{}\n');
    await new Promise(r => setTimeout(r, 400));
    expect(mesures).toBe(0);
  });
});

describe('one follower writes per repository', () => {
  const vivants =
    (...pids: number[]) =>
    (pid: number) =>
      pids.includes(pid);

  it('gives the lock to the first follower and refuses the second, naming the holder', () => {
    const commun = dossier('commun');
    const un = prendreLeVerrou(commun, { pid: 100, vivant: vivants(100, 200) });
    const deux = prendreLeVerrou(commun, { pid: 200, vivant: vivants(100, 200) });
    expect(un.pris).toBe(true);
    expect(deux.pris).toBe(false);
    expect(deux.detenteur).toBe(100);
  });
  it('takes over the lock of a dead process', () => {
    const commun = dossier('commun');
    prendreLeVerrou(commun, { pid: 100, vivant: vivants(100) });
    const suite = prendreLeVerrou(commun, { pid: 200, vivant: vivants(200) });
    expect(suite.pris).toBe(true);
  });
  it('frees the lock for the next follower once released', () => {
    const commun = dossier('commun');
    const un = prendreLeVerrou(commun, { pid: 100, vivant: vivants(100, 200) });
    un.liberer();
    expect(prendreLeVerrou(commun, { pid: 200, vivant: vivants(100, 200) }).pris).toBe(true);
  });
  it('keeps the lock of a living holder across a lock of the same process', () => {
    const commun = dossier('commun');
    prendreLeVerrou(commun, { pid: 100, vivant: vivants(100, 200) });
    prendreLeVerrou(commun, { pid: 200, vivant: vivants(100, 200) });
    expect(prendreLeVerrou(commun, { pid: 300, vivant: vivants(100, 200, 300) }).detenteur).toBe(
      100
    );
  });

  it('relays the line the writer writes, without measuring', async () => {
    const commun = dossier('commun');
    const recues: string[] = [];
    const mesure = () => Promise.resolve({ etat: 'E', lignes: [{ texte: 'une' }] });
    const r = relayer(commun, ligne => recues.push(ligne));
    await new Promise(res => setTimeout(res, 200));
    const ecrit = await mesurerUneFois('/depot', { commun, mesure, maintenant: 1 });
    expect(await attendre(() => recues.length > 0)).toBe(true);
    expect(recues[recues.length - 1]).toBe(ecrit.ligne);
    r.fermer();
  });
  it('relays the line already written when it starts', async () => {
    const commun = dossier('commun');
    const ecrit = await mesurerUneFois('/depot', {
      commun,
      mesure: () => Promise.resolve({ etat: 'E', lignes: [] }),
      maintenant: 1,
    });
    const recues: string[] = [];
    const r = relayer(commun, ligne => recues.push(ligne));
    expect(await attendre(() => recues.length > 0)).toBe(true);
    expect(recues[0]).toBe(ecrit.ligne);
    r.fermer();
  });
});
