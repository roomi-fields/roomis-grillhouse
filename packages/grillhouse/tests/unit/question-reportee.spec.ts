// Une question qu'on ne tranche que plus tard se reporte (`grillhouse circuit <ticket> --reporter
// <heure>`, src/temporal/circuit/appel.ts) : le ticket est reporté (`bd update --defer`), le circuit
// reste en attente, et la question se tait jusqu'à l'heure dans l'attente, le crochet d'arrêt et
// l'ouverture (`horsAttente` de scripts/superviseur.mjs), comme le report d'une revue. Un test petit.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Usage, lireLAppel } from '../../src/temporal/circuit/appel.js';
import { horsAttente } from '../../scripts/superviseur.mjs';
import { lesReponses } from '../../scripts/reponses-du-circuit.mjs';

describe('la réponse --reporter', () => {
  it('reads the hour of the deferral, with its motive', () => {
    expect(lireLAppel(['essai-1', '--reporter', '+6h', '--contexte', 'ce soir'])).toMatchObject({
      ticket: 'essai-1',
      reporter: '+6h',
      contexte: 'ce soir',
      reprendre: false,
      arreter: false,
    });
    expect(lireLAppel(['essai-1', '--reprendre'])).toMatchObject({ reporter: null });
  });

  it('refuses a deferral without its hour, or beside another answer', () => {
    expect(() => lireLAppel(['essai-1', '--reporter'])).toThrow(Usage);
    expect(() => lireLAppel(['essai-1', '--reporter', '--reprendre'])).toThrow(Usage);
    for (const autre of [['--reprendre'], ['--arreter'], ['--etendre', 'a'], ['--recommencer']]) {
      expect(() => lireLAppel(['essai-1', '--reporter', '+1h', ...autre]), autre[0]).toThrow(Usage);
    }
  });

  it('is among the answers a waiting circuit accepts', () => {
    expect(lesReponses('essai-1', 'RUNNING', true)).toContain('--reporter <heure>');
  });
});

// L'instant de la saisie : le 28 novembre 2026 à 15:30, heure locale de la machine.
describe('les formes de l’heure que --reporter accepte et refuse', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 28, 15, 30, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const appel = (heure: string) => lireLAppel(['essai-1', '--reporter', heure]);
  const refus = (argv: string[]): string => {
    try {
      lireLAppel(argv);
    } catch (x) {
      expect(x).toBeInstanceOf(Usage);
      return (x as Error).message;
    }
    throw new Error(`appel accepté : ${argv.join(' ')}`);
  };

  it.each([
    '8:30',
    '08:30',
    '17:00',
    '00:00',
    '23:59',
    '2026-11-29',
    '2028-02-29',
    '2026-11-28 15:31',
    '2026-11-28T23:59',
    '2026-11-29 08:00',
    '2027-01-01T00:00',
    '+6h',
    '+2d',
    '+1h',
  ])('accepte « %s »', heure => {
    expect(appel(heure)).toMatchObject({ ticket: 'essai-1', reporter: heure });
  });

  it.each([
    'tomorrow',
    'next monday',
    'demain',
    '8h',
    '6h',
    '+6',
    '+30m',
    '+1w',
    '+h',
    '+1.5h',
    '08:30:15',
    ' 08:30',
    '8:5',
    '29/11/2026',
    '2026-11',
    '2026-11-29 8h',
    '2026-11-29T09:00:00',
    '2026-11-29T09:00Z',
    '2026-11-29  09:00',
    '',
  ])('refuse la forme « %s »', heure => {
    expect(() => appel(heure)).toThrow(Usage);
  });

  it.each([
    '2026-02-30',
    '2027-02-29',
    '2026-13-01',
    '2026-11-31 08:00',
    '2026-12-00',
    '2026-11-29 24:00',
    '2026-11-29T08:60',
    '24:00',
    '25:99',
    '08:60',
  ])('refuse la date ou l’heure impossible « %s »', heure => {
    expect(() => appel(heure)).toThrow(Usage);
  });

  it.each([
    '2026-11-27',
    '2026-11-28',
    '2025-12-31 23:00',
    '2026-11-28 15:29',
    '2026-11-28 15:30',
    '2026-11-28T08:00',
    '+0h',
    '+0d',
  ])('refuse « %s », qui n’est pas strictement après l’instant de la saisie', heure => {
    expect(() => appel(heure)).toThrow(Usage);
  });

  it.each([
    ['une forme illisible', ['essai-1', '--reporter', 'tomorrow']],
    ['une heure passée', ['essai-1', '--reporter', '2026-11-27']],
    ['l’heure absente', ['essai-1', '--reporter']],
  ])('pour %s, dit que l’heure est à venir et cite les formes acceptées', (_cas, argv) => {
    const message = refus(argv);
    expect(message).toContain('à venir');
    for (const forme of ['H:MM', 'AAAA-MM-JJ HH:MM', 'AAAA-MM-JJTHH:MM', '+6h', '+2d']) {
      expect(message).toContain(forme);
    }
    expect(message).toMatch(/AAAA-MM-JJ(?![ T]HH)/);
  });

  it('ne cite dans son message que des formes qu’elle accepte', () => {
    const message = refus(['essai-1', '--reporter']);
    expect(message).not.toMatch(/demain|tomorrow/);
    // Les formes absolues sont citées par leur gabarit : aucune date écrite, qui passerait.
    expect(message).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    for (const cite of message.match(/\+\d+[a-z]+|\b\d{1,2}:\d{2}\b/g) ?? []) {
      expect(appel(cite), cite).toMatchObject({ reporter: cite });
    }
  });
});

describe('la question d’un ticket reporté', () => {
  const maintenant = Date.parse('2026-11-12T12:00:00Z');
  it('keeps quiet before its hour, as a closed ticket', () => {
    const hors = horsAttente(
      [
        { id: 'a', status: 'open', defer_until: '2026-11-12T23:00:00Z' },
        { id: 'b', status: 'closed' },
      ],
      maintenant
    );
    expect([...hors].sort()).toEqual(['a', 'b']);
  });

  it('goes up again once its hour has passed, as an open ticket', () => {
    const hors = horsAttente(
      [
        { id: 'a', status: 'open', defer_until: '2026-11-12T08:00:00Z' },
        { id: 'c', status: 'in_progress' },
      ],
      maintenant
    );
    expect([...hors]).toEqual([]);
  });
});

// Beads writes `defer_until` at the local wall time of the machine, with a « Z » it does not mean:
// `bd update --defer 17:30` at Paris gives `…T17:30:00Z`, and `--defer +1h` at 15:28 gives
// `…T16:28:00Z`.
describe('the hour of a deferral, as Beads writes it', () => {
  it('a question deferred to 17:30 goes up again at 17:30 local time', () => {
    vi.stubEnv('TZ', 'Europe/Paris');
    try {
      const reporte = [{ id: 'a', status: 'open', defer_until: '2026-11-12T17:30:00Z' }];
      expect([...horsAttente(reporte, new Date(2026, 10, 12, 17, 29).getTime())]).toEqual(['a']);
      expect([...horsAttente(reporte, new Date(2026, 10, 12, 17, 31).getTime())]).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
