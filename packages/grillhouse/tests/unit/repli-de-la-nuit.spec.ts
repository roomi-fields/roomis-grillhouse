// Le repli de la nuit de Grillhouse (scripts/repli-de-la-nuit.mjs) : la nuit locale de PC3 lit, par
// `gh`, les jobs du flux Nuit du jour (`gh run view --json jobs`, chaque job `{ name, status,
// conclusion, startedAt }`, le nom d'une tranche « tranches (26.x, 2) ») et décide, par tranche :
// - une tranche terminée sur PC2, verte ou rouge, n'est jamais rejouée ;
// - une tranche dont le job n'a pas démarré 60 minutes après l'heure du flux est annulée et jouée
//   sur PC3 ;
// - une tranche partie puis interrompue (annulée, exécuteur perdu) compte comme non jouée et se
//   rejoue en entier ;
// - une tranche qui tourne, ou en attente depuis moins de 60 minutes, reste à PC2 ;
// - le relevé dit quelles tranches ont joué où.
//
// Petit test : la décision est une fonction de ce que `gh` rend, sans processus.
import { describe, expect, it } from 'vitest';

interface Job {
  name: string;
  status: string;
  conclusion: string | null;
  startedAt: string | null;
}
interface Decision {
  aRejouer: number[];
  aAnnuler: number[];
  enAttente: number[];
  pc2: number[];
  pc3: number[];
}
type Choisir = (o: { jobs: Job[]; heureDuFlux: string; maintenant: string }) => Decision;

const choisir = async (o: Parameters<Choisir>[0]) => {
  const m = (await import('../../scripts/repli-de-la-nuit.mjs')) as unknown as {
    choisirLeRepli: Choisir;
  };
  return m.choisirLeRepli(o);
};

const FLUX = '2026-11-23T00:45:00Z';
const A = (minutes: number) => new Date(Date.parse(FLUX) + minutes * 60_000).toISOString();
const tranche = (
  n: number,
  status: string,
  conclusion: string | null,
  startedAt: string | null
) => ({
  name: `tranches (26.x, ${n})`,
  status,
  conclusion,
  startedAt,
});
const fusion: Job = { name: 'fusion (26.x)', status: 'queued', conclusion: null, startedAt: null };

describe('le repli de la nuit sur PC3', () => {
  it('une tranche terminée verte ou rouge sur PC2 n’est jamais rejouée', async () => {
    const d = await choisir({
      jobs: [
        tranche(1, 'completed', 'success', A(1)),
        tranche(2, 'completed', 'failure', A(1)),
        tranche(3, 'completed', 'success', A(2)),
        fusion,
      ],
      heureDuFlux: FLUX,
      maintenant: A(300),
    });
    expect(d.aRejouer).toEqual([]);
    expect(d.aAnnuler).toEqual([]);
    expect(d.pc2).toEqual([1, 2, 3]);
    expect(d.pc3).toEqual([]);
  });

  it('une tranche non démarrée 60 minutes après l’heure du flux est annulée et jouée sur PC3', async () => {
    const d = await choisir({
      jobs: [
        tranche(1, 'completed', 'success', A(1)),
        tranche(2, 'queued', null, null),
        tranche(3, 'queued', null, null),
      ],
      heureDuFlux: FLUX,
      maintenant: A(61),
    });
    expect(d.aAnnuler).toEqual([2, 3]);
    expect(d.aRejouer).toEqual([2, 3]);
    expect(d.pc2).toEqual([1]);
    expect(d.pc3).toEqual([2, 3]);
  });

  it('une tranche en attente depuis moins de 60 minutes reste à PC2, sans annulation', async () => {
    const d = await choisir({
      jobs: [tranche(1, 'queued', null, null), tranche(2, 'completed', 'success', A(1))],
      heureDuFlux: FLUX,
      maintenant: A(59),
    });
    expect(d.aAnnuler).toEqual([]);
    expect(d.aRejouer).toEqual([]);
    expect(d.enAttente).toEqual([1]);
  });

  it('la borne est de 60 minutes pleines : à 60 minutes exactement la tranche passe à PC3', async () => {
    const d = await choisir({
      jobs: [tranche(1, 'queued', null, null)],
      heureDuFlux: FLUX,
      maintenant: A(60),
    });
    expect(d.aRejouer).toEqual([1]);
  });

  it('une tranche qui tourne n’est ni annulée ni rejouée, quelle que soit l’heure', async () => {
    const d = await choisir({
      jobs: [tranche(1, 'in_progress', null, A(5))],
      heureDuFlux: FLUX,
      maintenant: A(400),
    });
    expect(d.aAnnuler).toEqual([]);
    expect(d.aRejouer).toEqual([]);
  });

  it('une tranche partie puis interrompue compte comme non jouée et se rejoue, sans annulation à faire', async () => {
    const d = await choisir({
      jobs: [tranche(1, 'completed', 'cancelled', A(3)), tranche(2, 'completed', 'success', A(3))],
      heureDuFlux: FLUX,
      maintenant: A(200),
    });
    expect(d.aRejouer).toEqual([1]);
    expect(d.aAnnuler).toEqual([]);
    expect(d.pc2).toEqual([2]);
    expect(d.pc3).toEqual([1]);
  });

  it('une tranche annulée avant d’avoir démarré se rejoue aussi', async () => {
    const d = await choisir({
      jobs: [tranche(3, 'completed', 'cancelled', null)],
      heureDuFlux: FLUX,
      maintenant: A(70),
    });
    expect(d.aRejouer).toEqual([3]);
  });

  it('ne lit que les jobs de tranches : la fusion et les mesures ne sont pas des tranches', async () => {
    const d = await choisir({
      jobs: [
        tranche(1, 'completed', 'success', A(1)),
        fusion,
        { name: 'mesures (26.x)', status: 'queued', conclusion: null, startedAt: null },
      ],
      heureDuFlux: FLUX,
      maintenant: A(500),
    });
    expect(d.aRejouer).toEqual([]);
    expect(d.pc2).toEqual([1]);
  });

  it('un flux sans aucun job de tranche ne rejoue rien', async () => {
    const d = await choisir({ jobs: [], heureDuFlux: FLUX, maintenant: A(500) });
    expect(d).toMatchObject({ aRejouer: [], aAnnuler: [], enAttente: [], pc2: [], pc3: [] });
  });

  it('le relevé dit quelles tranches ont joué où : PC2 pour les terminées, PC3 pour les rejouées', async () => {
    const d = await choisir({
      jobs: [
        tranche(1, 'completed', 'failure', A(1)),
        tranche(2, 'queued', null, null),
        tranche(3, 'completed', 'cancelled', A(2)),
      ],
      heureDuFlux: FLUX,
      maintenant: A(90),
    });
    expect(d.pc2).toEqual([1]);
    expect(d.pc3).toEqual([2, 3]);
  });
});

describe('les mesures de temps du flux, dans le repli de la nuit', () => {
  const job = (name: string, status: string, conclusion: string | null): Job => ({
    name,
    status,
    conclusion,
    startedAt: status === 'queued' ? null : A(1),
  });
  const mesures = async (jobs: Job[], fluxTermine = false) => {
    const m = (await import('../../scripts/repli-de-la-nuit.mjs')) as unknown as {
      choisirLeRepli: (o: object) => { mesures: string };
    };
    return m.choisirLeRepli({ jobs, heureDuFlux: FLUX, maintenant: A(30), fluxTermine }).mesures;
  };

  it('le job vert est vert, le job rouge est rouge', async () => {
    expect(await mesures([job('mesures (26.x)', 'completed', 'success')])).toBe('verte');
    expect(await mesures([job('mesures (26.x)', 'completed', 'failure')])).toBe('rouge');
  });

  it('le job qui attend ou tourne reste au flux, le job interrompu se rejoue', async () => {
    expect(await mesures([job('mesures (26.x)', 'queued', null)])).toBe('en-cours');
    expect(await mesures([job('mesures (26.x)', 'in_progress', null)])).toBe('en-cours');
    expect(await mesures([job('mesures (26.x)', 'completed', 'cancelled')])).toBe('a-rejouer');
  });

  it('un job absent se rejoue quand le flux est fini, attend sinon', async () => {
    expect(await mesures([], true)).toBe('a-rejouer');
    expect(await mesures([])).toBe('en-cours');
  });
});
