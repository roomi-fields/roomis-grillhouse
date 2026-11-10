/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
// Le circuit trace chaque changement d'état par un effet `trace` (scripts/effets.mjs), que son
// joueur écrit au journal d'états sans jamais l'arrêter ni lui ajouter d'attente : pas de clé, pas
// de lecture avant écriture, un échec dit une fois sur la sortie d'erreur.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { ARRETS, ecrireEtat } from '../../scripts/circuit.mjs';
import { AVEC_CLE, ecrireLEffet, rendusDe } from '../../scripts/effets.mjs';
import { createRequire } from 'node:module';

// Le module se charge à l'appel : s'il manque, chaque test échoue seul.
const lireLeJournal = (...a: any[]) =>
  createRequire(path.join(__dirname, 'x.cjs'))(
    path.resolve(__dirname, '../../scripts/journal-des-etats.mjs')
  ).lireLeJournal(...a);

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'journal-circuit-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

let n = 0;
function projet(): string {
  const racine = path.join(ESSAIS, `p${++n}`);
  mkdirSync(racine);
  execFileSync('git', ['init', '-q', racine]);
  return racine;
}
function ctx(racine: string) {
  return {
    ticket: 'd-1',
    racine,
    journal: 'j',
    paquets: [],
    rendus: [] as { genre: string; ligne?: Record<string, unknown> }[],
  };
}
const ISO_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)$/;

describe('une transition d’étape du circuit émet sa trace', () => {
  it('émet une ligne circuit datée avec le ticket, l’étape et la boucle', () => {
    const c = ctx(projet());
    ecrireEtat(c, { etape: '3', tentative: 2, rapport: '', finale: false, boucles: { code: 2 } });
    const [trace] = rendusDe(c, 'trace');
    expect(trace.ligne).toEqual({
      ts: expect.stringMatching(ISO_LOCAL),
      genre: 'circuit',
      ticket: 'd-1',
      etape: '3',
      boucle: 2,
      place: null,
      raison: '',
    });
  });

  it('une transition normale a une raison vide et aucune boucle quand l’étape n’en a pas', () => {
    const c = ctx(projet());
    ecrireEtat(c, { etape: '1', tentative: 1, rapport: '', finale: false, boucles: null });
    const [trace] = rendusDe(c, 'trace');
    expect(trace.ligne).toMatchObject({ etape: '1', boucle: null, raison: '' });
  });

  it('un arrêt porte son nom d’arrêt en raison', () => {
    const c = ctx(projet());
    ecrireEtat(c, {
      etape: '3.1',
      tentative: 3,
      rapport: 'rouge',
      finale: false,
      boucles: { code: 3 },
      code: ARRETS.controles,
      raison: 'controles',
    });
    expect(rendusDe(c, 'trace')[0].ligne).toMatchObject({
      etape: '3.1',
      boucle: 3,
      raison: 'controles',
    });
  });

  it('un bouclage porte la cause du retour en raison, la boucle comptée', () => {
    const c = ctx(projet());
    ecrireEtat(c, {
      etape: '2',
      tentative: 2,
      rapport: '',
      finale: false,
      boucles: { tests: 2 },
      raison: 'le développeur renvoie au testwriter',
    });
    expect(rendusDe(c, 'trace')[0].ligne).toMatchObject({
      boucle: 2,
      raison: 'le développeur renvoie au testwriter',
    });
  });
});

describe('le joueur de l’effet trace', () => {
  it('écrit la ligne au journal du projet, rejouable sans clé', () => {
    const racine = projet();
    expect(AVEC_CLE.has('trace')).toBe(false);
    const ligne = {
      ts: '2026-11-09T10:00:00+01:00',
      genre: 'circuit',
      ticket: 'd-1',
      etape: '2',
      boucle: null,
      place: null,
      raison: '',
    };
    const r = ecrireLEffet(ctx(racine), { genre: 'trace', ligne }, null);
    expect(r.status).toBe(0);
    expect(lireLeJournal(racine, {}).lignes).toEqual([ligne]);
  });

  it('un journal qui ne s’écrit pas laisse le circuit continuer, dit une fois sur la sortie d’erreur', () => {
    const racine = path.join(ESSAIS, 'absent', 'nulle-part');
    const ecrit = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const ligne = {
        ts: '2026-11-09T10:00:00+01:00',
        genre: 'circuit',
        ticket: 'd-1',
        etape: '2',
      };
      const a = ecrireLEffet(ctx(racine), { genre: 'trace', ligne }, null);
      const b = ecrireLEffet(ctx(racine), { genre: 'trace', ligne }, null);
      expect(a.status).toBe(0);
      expect(b.status).toBe(0);
      const dits = ecrit.mock.calls.filter(([t]) => /journal/i.test(String(t)));
      expect(dits).toHaveLength(1);
    } finally {
      ecrit.mockRestore();
    }
  });
});
