// L'heure d'un report (`grillhouse circuit <ticket> --reporter <heure>`) : une heure seule vise sa
// prochaine occurrence, aujourd'hui si elle est à venir, demain sinon (le « snooze » d'une demande
// de relecture). `heureDuReport(heure, maintenant)` de scripts/reponses-du-circuit.mjs rend
// `{ defer, quand }` : ce que reçoit `bd update --defer`, et le groupe de mots des textes
// (« reportée <quand> »). L'instant est injecté, en heure locale de la machine. Un test petit.
import { describe, expect, it } from 'vitest';
import { heureDuReport } from '../../scripts/reponses-du-circuit.mjs';

const a = (h: number, m: number, s = 0) => new Date(2026, 10, 20, h, m, s);

describe('l’heure d’un report', () => {
  it('une heure déjà passée dans la journée vise demain à cette heure', () => {
    expect(heureDuReport('08:30', a(23, 15))).toEqual({
      defer: '2026-11-21 08:30',
      quand: 'à demain 08:30',
    });
  });

  it('une heure à venir vise aujourd’hui, dite telle qu’écrite', () => {
    expect(heureDuReport('17:30', a(9, 0))).toEqual({
      defer: '2026-11-20 17:30',
      quand: 'au 17:30',
    });
  });

  it('une heure à H:MM est lue et la date visée est écrite en HH:MM', () => {
    expect(heureDuReport('8:30', a(9, 0)).defer).toBe('2026-11-21 08:30');
    expect(heureDuReport('9:05', a(8, 0)).defer).toBe('2026-11-20 09:05');
  });

  it('l’heure comparée à la seconde : strictement après l’instant vise aujourd’hui', () => {
    expect(heureDuReport('08:30', a(8, 29, 59)).defer).toBe('2026-11-20 08:30');
    expect(heureDuReport('08:30', a(8, 30, 0)).defer).toBe('2026-11-21 08:30');
    expect(heureDuReport('08:30', a(8, 30, 20)).defer).toBe('2026-11-21 08:30');
  });

  it('demain franchit la fin du mois et de l’année', () => {
    expect(heureDuReport('00:10', new Date(2026, 11, 31, 23, 0)).defer).toBe('2027-01-01 00:10');
    expect(heureDuReport('07:00', new Date(2026, 10, 30, 12, 0)).defer).toBe('2026-12-01 07:00');
  });

  it('minuit et 23:59 sont des heures seules', () => {
    expect(heureDuReport('00:00', a(12, 0)).defer).toBe('2026-11-21 00:00');
    expect(heureDuReport('23:59', a(12, 0)).defer).toBe('2026-11-20 23:59');
  });

  it('toute autre forme est passée telle quelle à bd, dite telle qu’écrite', () => {
    for (const forme of [
      '+9h',
      'demain',
      '8h',
      '2026-11-25 08:30',
      '2026-11-25',
      '25:99',
      '24:00',
      '08:60',
      '08:30:15',
      ' 08:30',
    ]) {
      expect(heureDuReport(forme, a(23, 15)), forme).toEqual({
        defer: forme,
        quand: `au ${forme}`,
      });
    }
  });
});
