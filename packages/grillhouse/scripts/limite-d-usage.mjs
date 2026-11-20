// The usage limit of `claude -p`: its text « limit · resets <time> (<zone>) », read in the result
// of a session or at the end of its log. It gives the hour the usage returns, understood in the
// zone written, at the next instant after now. A « resets » whose time or zone does not read is a
// limit without a readable hour: the circuit waits an hour. A text that cites « limit » without
// « resets », or elsewhere than at the end of the log, is not one.

const HEURE = 3_600_000;
const LIGNES_DE_FIN = 20;

// The offset of <fuseau> from UTC at the instant <ms>, in ms; throws on an unknown zone.
function decalage(fuseau, ms) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: fuseau,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
      .formatToParts(ms)
      .map(x => [x.type, Number(x.value)])
  );
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

// The first instant after <maintenant> at which the wall clock of <fuseau> reads <h>:<m>, or null.
function prochainInstant(h, m, fuseau, maintenant) {
  try {
    const jour = new Date(maintenant + decalage(fuseau, maintenant));
    for (let plus = 0; plus <= 2; plus++) {
      const local = Date.UTC(
        jour.getUTCFullYear(),
        jour.getUTCMonth(),
        jour.getUTCDate() + plus,
        h,
        m
      );
      const instant = local - decalage(fuseau, local - decalage(fuseau, local));
      if (instant > maintenant) {
        return instant;
      }
    }
  } catch {
    // An unknown zone: no readable hour.
  }
  return null;
}

// The limit <texte> says, `{ reprise, lisible }`, or null.
function lire(texte, maintenant) {
  const dit = /limit\s*·\s*resets\b([^\n"]*)/i.exec(texte ?? '');
  if (!dit) {
    return null;
  }
  const heure =
    /(?:[A-Za-z]{3,9}\s+\d{1,2},?\s+)?\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*\(([^)]+)\)/i.exec(dit[1]);
  if (heure) {
    const h12 = Number(heure[1]);
    if (h12 >= 1 && h12 <= 12) {
      const h = (h12 % 12) + (heure[3].toLowerCase() === 'pm' ? 12 : 0);
      const reprise = prochainInstant(h, Number(heure[2] ?? 0), heure[4].trim(), maintenant);
      if (reprise !== null) {
        return { reprise, lisible: true };
      }
    }
  }
  return { reprise: maintenant + HEURE, lisible: false };
}

/**
 * The usage limit that stops a session, `{ reprise, lisible }` (<reprise> the hour it returns, in
 * ms; one hour after <maintenant> when the text gives none that reads), or null: read in the
 * result <resultat>, else in the last lines of <journal>.
 */
export function limiteDUsage({ resultat = null, journal = null }, maintenant = Date.now()) {
  const dansLeResultat = lire(resultat, maintenant);
  if (dansLeResultat) {
    return dansLeResultat;
  }
  const fin = String(journal ?? '')
    .split('\n')
    .slice(-LIGNES_DE_FIN)
    .join('\n');
  return lire(fin, maintenant);
}
