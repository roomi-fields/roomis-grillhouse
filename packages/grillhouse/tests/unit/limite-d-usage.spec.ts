// La limite d'usage de `claude -p` (scripts/limite-d-usage.mjs) : son texte « limit · resets <heure>
// (<fuseau>) » se lit au résultat de la séance ou à la fin de son journal, et donne l'heure de
// reprise, comprise dans le fuseau écrit, au prochain instant futur ; un « resets » dont l'heure ou
// le fuseau ne se lit pas est une limite sans heure lisible (le report est d'une heure). Un texte
// qui cite « limit » sans « resets », ou ailleurs qu'en fin de journal, n'en est pas une.
// Tests petits : la fonction seule, l'heure de l'instant donnée.
import { describe, expect, it } from 'vitest';
import { limiteDUsage } from '../../scripts/limite-d-usage.mjs';

interface Limite {
  reprise: number;
  lisible: boolean;
}
const lire = limiteDUsage as (
  source: { resultat?: string | null; journal?: string | null },
  maintenant: number
) => Limite | null;

const HEURE = 3_600_000;
// 23:00 à Paris (UTC+1 en novembre), le 19 novembre.
const MAINTENANT = Date.parse('2026-11-19T22:00:00Z');
const dansLeResultat = (texte: string, maintenant = MAINTENANT) =>
  lire({ resultat: texte }, maintenant);

describe('la limite d’usage lue au résultat de la séance', () => {
  it('donne l’heure de reprise dans le fuseau écrit, au prochain instant futur', () => {
    const l = dansLeResultat('You’ve hit your limit · resets 2am (Europe/Paris)');
    expect(l).toEqual({ reprise: Date.parse('2026-11-20T01:00:00Z'), lisible: true });
  });

  it('lit de même une date écrite devant l’heure', () => {
    const l = dansLeResultat('limit · resets Nov 20, 2am (Europe/Paris)');
    expect(l).toEqual({ reprise: Date.parse('2026-11-20T01:00:00Z'), lisible: true });
  });

  it('passe au lendemain quand l’heure du jour est déjà passée', () => {
    const l = dansLeResultat(
      'limit · resets 11pm (Europe/Paris)',
      Date.parse('2026-11-19T22:30:00Z')
    );
    expect(l).toEqual({ reprise: Date.parse('2026-11-20T22:00:00Z'), lisible: true });
  });

  it('lit les minutes, l’après-midi et un autre fuseau', () => {
    const l = dansLeResultat(
      'limit · resets 2:30pm (America/New_York)',
      Date.parse('2026-11-20T12:00:00Z')
    );
    expect(l).toEqual({ reprise: Date.parse('2026-11-20T19:30:00Z'), lisible: true });
  });

  it('lit midi et minuit', () => {
    const midi = dansLeResultat('limit · resets 12pm (UTC)', Date.parse('2026-11-20T13:00:00Z'));
    expect(midi?.reprise).toBe(Date.parse('2026-11-21T12:00:00Z'));
    const minuit = dansLeResultat('limit · resets 12am (UTC)', Date.parse('2026-11-20T13:00:00Z'));
    expect(minuit?.reprise).toBe(Date.parse('2026-11-21T00:00:00Z'));
  });

  it('lit la limite au milieu d’une phrase du résultat', () => {
    const l = dansLeResultat('Claude usage limit · resets 2am (Europe/Paris) — try later');
    expect(l?.lisible).toBe(true);
  });
});

describe('une limite d’usage dont l’heure ne se lit pas', () => {
  it.each([
    ['une heure illisible', 'limit · resets soon (Europe/Paris)'],
    ['un fuseau inconnu', 'limit · resets 2am (Mars/Olympus)'],
    ['aucun fuseau', 'limit · resets 2am'],
  ])('avec %s, se reporte d’une heure', (_nom, texte) => {
    expect(dansLeResultat(texte)).toEqual({ reprise: MAINTENANT + HEURE, lisible: false });
  });
});

describe('un texte qui n’est pas une limite d’usage', () => {
  it('cite « limit » sans « resets »', () => {
    expect(dansLeResultat('The rate limit of the tool is 5 per minute')).toBeNull();
    expect(dansLeResultat('limit reached')).toBeNull();
  });

  it('est vide ou absent', () => {
    expect(dansLeResultat('')).toBeNull();
    expect(lire({}, MAINTENANT)).toBeNull();
    expect(lire({ resultat: null, journal: null }, MAINTENANT)).toBeNull();
  });
});

describe('la limite d’usage lue à la fin du journal', () => {
  const ligne = (n: number) => `ligne ${n} du journal`;
  const corps = Array.from({ length: 60 }, (_, i) => ligne(i));

  it('se lit dans les dernières lignes du journal', () => {
    const journal = [...corps, 'limit · resets 2am (Europe/Paris)', ''].join('\n');
    expect(lire({ resultat: '', journal }, MAINTENANT)).toEqual({
      reprise: Date.parse('2026-11-20T01:00:00Z'),
      lisible: true,
    });
  });

  it('ne se lit pas ailleurs qu’en fin de journal', () => {
    const journal = ['limit · resets 2am (Europe/Paris)', ...corps].join('\n');
    expect(lire({ resultat: '', journal }, MAINTENANT)).toBeNull();
  });

  it('cite « limit » en fin de journal sans « resets » : pas une limite', () => {
    const journal = [...corps, 'the limit was raised'].join('\n');
    expect(lire({ resultat: '', journal }, MAINTENANT)).toBeNull();
  });

  it('un « resets » illisible en fin de journal est une limite sans heure lisible', () => {
    const journal = [...corps, 'limit · resets later (Europe/Paris)'].join('\n');
    expect(lire({ resultat: '', journal }, MAINTENANT)).toEqual({
      reprise: MAINTENANT + HEURE,
      lisible: false,
    });
  });
});
