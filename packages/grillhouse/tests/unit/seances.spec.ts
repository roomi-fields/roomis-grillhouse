// The sessions of the agents as activities (scripts/seances.mjs, grillhouse-4nr.3), as Temporal
// runs an activity: the group of a session sends a sign of life `{ pid, depart, seanceId }`, a
// cancellation kills it, a second attempt that finds the group of the first alive waits for it (or
// kills it when it stands still) before it launches, in `lancer`, and the id of the session comes from the
// caller. The groups here are small shell processes, not sessions of claude.
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { signalerGroupe } from '../../scripts/mesure-de-la-machine.mjs';
import * as seances from '../../scripts/seances.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'seances-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

interface Vie {
  pid: number;
  depart: string | number | null;
  seanceId: string;
}
interface Jeu {
  code: number | null;
  pid: number | null;
  bloque: boolean;
  annulee: boolean;
  erreur: string | null;
}
const jouerLeGroupe = seances.jouerLeGroupe as (o: {
  cmd: string;
  args: string[];
  seanceId?: string;
  immobileMs: number;
  traces?: () => number;
  signeDeVie?: (v: Vie | null) => void;
  annulation?: AbortSignal | null;
}) => Promise<Jeu>;
const jusquALaFiche = seances.jusquALaFiche as (
  ctx: object,
  role: string,
  texte: string,
  options: object
) => Promise<unknown>;
const seance = seances.seance as (ctx: object, role: string, options: object) => Promise<unknown>;
const idDeSeance = seances.idDeSeance as (ctx: object, evenement: string) => string;
const rangDeLaSeance = seances.rangDeLaSeance as (
  ctx: object,
  id: string
) => { dossier: string; fin: string; resultat: string; horsPlan: string };

// The traces of a group that keeps moving.
const bouge = () => Date.now();
const attendre = (ms: number) => new Promise(r => setTimeout(r, ms));
describe('le signe de vie, et l’annulation qui tue le groupe', () => {
  it('sends { pid, depart, seanceId } at its launch and at each step of its watch, then null at its end', async () => {
    const vies: (Vie | null)[] = [];
    const r = await jouerLeGroupe({
      cmd: 'sh',
      args: ['-c', 'sleep 0.6'],
      seanceId: 'seance-1',
      immobileMs: 400,
      traces: bouge,
      signeDeVie: v => vies.push(v),
    });
    expect(r).toMatchObject({ code: 0, bloque: false, annulee: false });
    const vivantes = vies.filter(Boolean) as Vie[];
    expect(vivantes.length).toBeGreaterThan(1);
    // The start of the leader, read while it runs (`departDe`).
    expect(vivantes[0]).toMatchObject({ pid: r.pid, seanceId: 'seance-1' });
    expect(vivantes[0].depart).toBeTruthy();
    expect(new Set(vivantes.map(v => v.pid))).toEqual(new Set([r.pid]));
    expect(vies.at(-1)).toBeNull();
  });

  it('cancelled, kills the whole group and ends cancelled', async () => {
    const annulation = new AbortController();
    let pid = 0;
    const jeu = jouerLeGroupe({
      cmd: 'sh',
      args: ['-c', 'sleep 30 & sleep 30; wait'],
      seanceId: 's',
      immobileMs: 60_000,
      traces: bouge,
      signeDeVie: v => {
        if (v) {
          pid = v.pid;
        }
      },
      annulation: annulation.signal,
    });
    await attendre(300);
    expect(signalerGroupe(pid, 0)).toBe(true);
    annulation.abort();
    const r = await jeu;
    expect(r.annulee).toBe(true);
    await attendre(200);
    expect(signalerGroupe(pid, 0)).toBe(false);
  });

  it('cancelled before its launch, launches nothing', async () => {
    const annulation = new AbortController();
    annulation.abort();
    const vies: unknown[] = [];
    const r = await jouerLeGroupe({
      cmd: 'sh',
      args: ['-c', 'exit 0'],
      immobileMs: 1000,
      signeDeVie: v => vies.push(v),
      annulation: annulation.signal,
    });
    expect(r).toMatchObject({ pid: null, annulee: true });
    expect(vies).toEqual([]);
  });

  it('standing still, its group is killed and the play ends blocked', async () => {
    const r = await jouerLeGroupe({
      cmd: 'sh',
      args: ['-c', 'sleep 30 & sleep 30; wait'],
      immobileMs: 300,
      traces: () => 0,
    });
    expect(r.bloque).toBe(true);
    await attendre(200);
    expect(signalerGroupe(r.pid as number, 0)).toBe(false);
  });
});

describe('un second essai sur un groupe encore vivant l’attend, ou le tue immobile', () => {
  // A copy of trial and the context of a session out of the envelope: the fake claude
  // (CLAUDE_BIN) ends at once without a sheet and leaves in its group a process of <reste>
  // seconds, which writes its end in the trace; the place of the machine is a fake one.
  function essai(reste: number, immobileMs: number, repriseEnEchec = false) {
    const dossier = mkdtempSync(path.join(ESSAIS, 'essai-'));
    const trace = path.join(dossier, 'trace');
    const faux = path.join(dossier, 'claude');
    writeFileSync(
      faux,
      `#!/bin/sh\necho "lance $(date +%s%N)" >> ${trace}\n(sleep ${reste}; echo "fin $(date +%s%N)" >> ${trace}) &\n${
        repriseEnEchec ? `case "$*" in *--resume*) exit 1;; esac\n` : ''
      }exit 0\n`
    );
    chmodSync(faux, 0o755);
    const ctx = {
      racine: dossier,
      copie: dossier,
      ticket: 'demo-1',
      sujet: 'essai',
      paquets: ['.'],
      tmp: dossier,
      journal: path.join(dossier, 'journal'),
      fiches: path.join(dossier, 'fiches.jsonl'),
      transcriptions: path.join(dossier, 'transcriptions'),
      immobileMs,
      bd: () => ({ status: 0, stdout: '[{}]', stderr: '' }),
    };
    const env = { CLAUDE_BIN: faux, GRILLHOUSE_REGISTRE: path.join(dossier, 'registre.jsonl') };
    const temps = (genre: string) =>
      readFileSync(trace, 'utf8')
        .split('\n')
        .filter(l => l.startsWith(`${genre} `))
        .map(l => Number(BigInt(l.split(' ')[1]) / 1_000_000n));
    return { ctx, env, temps };
  }
  const PLACE = () => ({ rattacher: () => {}, rendre: () => {} });
  // jusquALaFiche until its stop « sans-fiche », its two launches played, under <env>.
  async function deuxEssais(ctx: object, env: Record<string, string>) {
    const avant = { ...process.env };
    Object.assign(process.env, env);
    const vies: (Vie | null)[] = [];
    try {
      await expect(
        jusquALaFiche(ctx, 'relecteur', 'consigne', {
          evenement: 'relecture',
          id: 'seance-essai',
          horsEnveloppe: true,
          prendrePlace: PLACE,
          signeDeVie: (v: Vie | null) => vies.push(v),
        })
      ).rejects.toThrow(/sans-fiche/);
    } finally {
      for (const k of Object.keys(env)) {
        if (avant[k] === undefined) {
          delete process.env[k];
        } else {
          process.env[k] = avant[k];
        }
      }
    }
    return vies;
  }

  it('the second attempt waits for the group the first left alive, then launches', async () => {
    const { ctx, env, temps } = essai(4, 60_000);
    await deuxEssais(ctx, env);
    const lances = temps('lance');
    const fins = temps('fin');
    expect(lances).toHaveLength(2);
    expect(fins.length).toBeGreaterThanOrEqual(1);
    expect(lances[1]).toBeGreaterThanOrEqual(fins[0]);
  });

  it('a resumption that fails leaves its group alive, and the fresh session waits for it', async () => {
    const { ctx, env, temps } = essai(4, 60_000, true);
    const avant = { ...process.env };
    Object.assign(process.env, env);
    try {
      await expect(
        seance(ctx, 'developpeur', {
          tentative: 2,
          derniere: false,
          seanceId: 'seance-neuve',
          reprise: { agent: 'developpeur', seance: 'seance-reprise' },
          constats: [],
          lectures: { lots: () => [], references: () => [] },
          horsEnveloppe: true,
          prendrePlace: PLACE,
          signeDeVie: () => {},
        })
      ).rejects.toThrow(/sans-fiche/);
    } finally {
      for (const k of Object.keys(env)) {
        if (avant[k] === undefined) {
          delete process.env[k];
        } else {
          process.env[k] = avant[k];
        }
      }
    }
    const lances = temps('lance');
    const fins = temps('fin');
    expect(lances.length).toBeGreaterThanOrEqual(2);
    expect(fins.length).toBeGreaterThanOrEqual(1);
    expect(lances[1]).toBeGreaterThanOrEqual(fins[0]);
  });

  it('the second attempt kills the group the first left standing still, then launches', async () => {
    const { ctx, env, temps } = essai(30, 400);
    const t = Date.now();
    const vies = await deuxEssais(ctx, env);
    expect(temps('lance')).toHaveLength(2);
    expect(temps('fin')).toEqual([]);
    expect(Date.now() - t).toBeLessThan(15_000);
    const premier = (vies.find(Boolean) as Vie).pid;
    await attendre(200);
    expect(signalerGroupe(premier, 0)).toBe(false);
  });
});

// grillhouse-4nr.6.2: each session ranges its result under its id (lancer.sh, `rangDeLaSeance`),
// and two attempts of an activity never share an id (`idDeSeance`, `<séance>-e<essai>`). Only an
// attempt Temporal plays again (the attempt 2 or more of its activity, `essaiDeLActe`), at the
// launch the dead attempt made last (its sign of life names it, `lancement:<événement>:<relance>`,
// and its session, `seanceId`), takes the result that session ranged, with no second session; a
// session dead without a result is launched anew, under the id of this attempt.
describe('une séance reprend le résultat de l’essai mort, ou repart sous son propre identifiant', () => {
  // A session in the envelope, its launcher a program of trial (GRILLHOUSE_LANCEUR, in place of
  // lancer.sh) that ranges its exit code and its result under the session it opens or resumes, as
  // lancer.sh does: the resumption of seance-reprise ends in error, the first other launch gives a
  // result without a sheet, the next ones a sheet; each launch written with its arguments.
  function enveloppe(essaiDeLActe = 1) {
    const dossier = mkdtempSync(path.join(ESSAIS, 'enveloppe-'));
    const ctx = {
      racine: dossier,
      copie: dossier,
      ticket: 'demo-1',
      sujet: 'essai',
      paquets: ['.'],
      tmp: dossier,
      journal: path.join(dossier, 'journal'),
      fiches: path.join(dossier, 'fiches.jsonl'),
      transcriptions: path.join(dossier, 'transcriptions'),
      immobileMs: 60_000,
      essaiDeLActe,
      bd: () => ({ status: 0, stdout: '[{}]', stderr: '' }),
    };
    const compte = path.join(dossier, 'lancements');
    const lanceur = path.join(dossier, 'lancer.sh');
    writeFileSync(
      lanceur,
      `#!/bin/sh\necho "$*" >> ${compte}\nid=$(echo "$*" | sed -n 's/.*--\\(seance\\|reprise\\) \\([^ ]*\\).*/\\2/p')\nr=${dossier}/seances/$id\nmkdir -p $r\ncase "$*" in *'--reprise seance-reprise'*) echo '{}' > $r/resultat.json; echo 1 > $r/fin; exit 0;; esac\nif [ $(grep -vc -- '--reprise seance-reprise' ${compte}) -eq 1 ]; then echo '{}' > $r/resultat.json; else echo '{"structured_output":{"statut":"FAIT"}}' > $r/resultat.json; fi\necho 0 > $r/fin\n`
    );
    chmodSync(lanceur, 0o755);
    const lancements = () => {
      try {
        return readFileSync(compte, 'utf8').split('\n').filter(Boolean);
      } catch {
        return [];
      }
    };
    return { ctx, lanceur, lancements };
  }
  const PLACE = () => ({ rattacher: () => {}, rendre: () => {} });
  const avecLeLanceur = async <T>(lanceur: string, f: () => Promise<T>) => {
    const avant = process.env.GRILLHOUSE_LANCEUR;
    process.env.GRILLHOUSE_LANCEUR = lanceur;
    try {
      return await f();
    } finally {
      if (avant === undefined) {
        delete process.env.GRILLHOUSE_LANCEUR;
      } else {
        process.env.GRILLHOUSE_LANCEUR = avant;
      }
    }
  };
  // The dead attempt's last sign of life, its session ended: its first launch, of seance-morte.
  const MORTE = {
    pid: 2_000_000_000,
    depart: null,
    seanceId: 'seance-morte',
    lancement: 'lancement:neuve:1',
  };
  // The result the dead session ranged: a sheet, or a result without one.
  const resultatMort = (
    ctx: { tmp: string },
    sortie = '{"structured_output":{"statut":"FAIT"}}'
  ) => {
    const r = rangDeLaSeance(ctx, 'seance-morte');
    mkdirSync(r.dossier, { recursive: true });
    writeFileSync(r.fin, '0\n');
    writeFileSync(r.resultat, `${sortie}\n`);
  };
  const jusqua = (ctx: object, precedent: object | null, vies: unknown[] = []) =>
    jusquALaFiche(ctx, 'developpeur', 'consigne', {
      id: 'seance-essai',
      evenement: 'neuve',
      fiche: 'geste',
      prendrePlace: PLACE,
      signeDeVie: (v: unknown) => vies.push(v),
      precedent,
    });

  it('two attempts of one session never share an id; one attempt names the same', () => {
    const sous = (essaiDeLActe: number) => ({ cle: 'circuit:/r:demo-1:run:3', essaiDeLActe });
    expect(idDeSeance(sous(1), 'neuve')).not.toBe(idDeSeance(sous(2), 'neuve'));
    expect(idDeSeance(sous(2), 'neuve')).toBe(idDeSeance(sous(2), 'neuve'));
    expect(idDeSeance(sous(1), 'neuve')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it('a first launch without a sheet: the second launch resumes it, each sign of life naming its launch', async () => {
    const { ctx, lanceur, lancements } = enveloppe();
    const vies: unknown[] = [];
    const fiche = await avecLeLanceur(lanceur, () => jusqua(ctx, null, vies));
    expect(lancements()).toHaveLength(2);
    expect(lancements()[1]).toContain('--reprise seance-essai');
    expect(fiche).toEqual({ statut: 'FAIT' });
    const noms = vies.filter(Boolean).map(v => (v as { lancement: string }).lancement);
    expect(new Set(noms)).toEqual(new Set(['lancement:neuve:1', 'lancement:neuve:2']));
  });

  it('the result is ranged under the session’s id, and read from there', async () => {
    const { ctx, lanceur } = enveloppe();
    await avecLeLanceur(lanceur, () => jusqua(ctx, null));
    const r = rangDeLaSeance(ctx, 'seance-essai');
    expect(readFileSync(r.fin, 'utf8').trim()).toBe('0');
    expect(readFileSync(r.resultat, 'utf8')).toContain('structured_output');
  });

  it('an attempt Temporal plays again takes the dead session’s sheet: no launch', async () => {
    const { ctx, lanceur, lancements } = enveloppe(2);
    resultatMort(ctx);
    const fiche = await avecLeLanceur(lanceur, () => jusqua(ctx, MORTE));
    expect(lancements()).toEqual([]);
    expect(fiche).toEqual({ statut: 'FAIT' });
  });

  it('the dead session’s result without a sheet: its relaunch resumes the dead session', async () => {
    const { ctx, lanceur, lancements } = enveloppe(2);
    resultatMort(ctx, '{}');
    // The launcher's count: this launch is not the first, its result a sheet.
    writeFileSync(path.join(ctx.tmp, 'lancements'), 'un lancement avant\n');
    const fiche = await avecLeLanceur(lanceur, () => jusqua(ctx, MORTE));
    expect(lancements().slice(1)).toEqual([expect.stringContaining('--reprise seance-morte')]);
    expect(fiche).toEqual({ statut: 'FAIT' });
  });

  it('a session dead without a result is launched anew, under this attempt’s id', async () => {
    const { ctx, lanceur, lancements } = enveloppe(2);
    await avecLeLanceur(lanceur, () => jusqua(ctx, MORTE));
    expect(lancements()[0]).toContain('--seance seance-essai');
    expect(lancements().join('\n')).not.toContain('seance-morte');
  });

  // grillhouse-4nr.6.2, renvoi de d827494, point 1: the dead attempt was at the resumption of its
  // session (relance 2), whose result is ranged: it is taken, whatever the rank of that launch.
  it('the dead attempt died at its relaunch, its result ranged: it is taken, no launch', async () => {
    const { ctx, lanceur, lancements } = enveloppe(2);
    resultatMort(ctx);
    const fiche = await avecLeLanceur(lanceur, () =>
      jusqua(ctx, { ...MORTE, lancement: 'lancement:neuve:2' })
    );
    expect(lancements()).toEqual([]);
    expect(fiche).toEqual({ statut: 'FAIT' });
  });

  // Point 2: the launch line of the dead attempt died in memory with it; the session taken up
  // writes it, so that the bilan counts the session as the circuit's.
  it('the session taken up writes its launch line, under the dead session’s id', async () => {
    const { ctx, lanceur } = enveloppe(2);
    resultatMort(ctx);
    const rendus: { genre: string; entree?: { lancement?: unknown } }[] = [];
    await avecLeLanceur(lanceur, () => jusqua({ ...ctx, rendus }, MORTE));
    const lancements = rendus.flatMap(e =>
      e.genre === 'fiche' && e.entree?.lancement ? [e.entree.lancement] : []
    );
    expect(lancements).toEqual([{ role: 'developpeur', seance: 'seance-morte' }]);
  });

  it('the first attempt of an activity, a sign of life before it: the session launches', async () => {
    const { ctx, lanceur, lancements } = enveloppe(1);
    resultatMort(ctx);
    await avecLeLanceur(lanceur, () => jusqua(ctx, MORTE));
    expect(lancements().length).toBeGreaterThan(0);
  });

  it('an attempt played again whose dead attempt made another launch last: it launches', async () => {
    const { ctx, lanceur, lancements } = enveloppe(2);
    resultatMort(ctx);
    await avecLeLanceur(lanceur, () => jusqua(ctx, { ...MORTE, lancement: 'lancement:autre:1' }));
    expect(lancements().length).toBeGreaterThan(0);
  });

  it('a resumption that fails, then the fresh session of the same attempt: it launches and gives its sheet', async () => {
    const { ctx, lanceur, lancements } = enveloppe(1);
    const r = (await avecLeLanceur(lanceur, () =>
      seance(ctx, 'developpeur', {
        tentative: 2,
        derniere: false,
        seanceId: 'seance-neuve',
        reprise: { agent: 'developpeur', seance: 'seance-reprise' },
        constats: [],
        lectures: { lots: () => [], references: () => [] },
        prendrePlace: PLACE,
        signeDeVie: () => {},
      })
    )) as { fiche: unknown };
    expect(r.fiche).toMatchObject({ statut: 'FAIT' });
    const l = lancements();
    expect(l[0]).toContain('--reprise seance-reprise');
    expect(l[1]).toContain('--seance seance-neuve');
    expect(l.slice(2).every(x => x.includes('--reprise seance-neuve'))).toBe(true);
  });
});

describe('l’identifiant de séance vient de l’appelant', () => {
  it('a session without an id is refused before any launch', async () => {
    await expect(
      jusquALaFiche({}, 'developpeur', 'consigne', { evenement: 'neuve' })
    ).rejects.toThrow(/identifiant/);
  });

  it('a session without its event is refused before any launch', async () => {
    await expect(jusquALaFiche({}, 'developpeur', 'consigne', { id: 'a' })).rejects.toThrow(
      /événement/
    );
  });
});
