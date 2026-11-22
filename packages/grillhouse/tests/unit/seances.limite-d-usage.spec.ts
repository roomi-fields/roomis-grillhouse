// Une séance que la limite d'usage arrête n'est pas une séance sans fiche : `jusquALaFiche` lève
// l'arrêt « limite-d-usage » (`resultat: { reprise, lisible }`, l'heure de reprise en ms ; une heure
// plus tard sans heure lisible), sans reprise de la séance coupée. Une limite ne compte ni dans la
// première ni dans la seconde séance sans fiche : une séance finie sans fiche, après une ou deux
// limites, garde ses deux lancements avant l'arrêt « sans-fiche ». Un faux claude joue les sorties.
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import * as seances from '../../scripts/seances.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'limite-d-usage-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const jusquALaFiche = seances.jusquALaFiche as (
  ctx: object,
  role: string,
  texte: string,
  options: object
) => Promise<unknown>;

const LIMITE = (reprise: string) =>
  JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: true,
    session_id: 'abc',
    result: `You've hit your limit · resets ${reprise}`,
  });
const SANS_FICHE = JSON.stringify({ type: 'result', subtype: 'success', session_id: 'abc' });

// Un faux claude qui rend, à son n-ième lancement, le contenu de `sortie-<n>` et sort de son code.
function monter(sorties: { texte: string; code?: number }[]) {
  const dossier = mkdtempSync(path.join(ESSAIS, 'essai-'));
  const faux = path.join(dossier, 'claude');
  writeFileSync(
    faux,
    '#!/bin/sh\nd="$(dirname "$0")"\nn=$(( $(cat "$d/n" 2>/dev/null || echo 0) + 1 ))\n' +
      'echo $n > "$d/n"\n' +
      // The transcript of its session, as claude writes it.
      'avant=; for a in "$@"; do case "$avant" in --session-id|--resume) id=$a;; esac; avant=$a; done\n' +
      'echo "{}" > "$d/transcriptions/$id.jsonl"\n' +
      'cat "$d/sortie-$n"\nexit $(cat "$d/code-$n" 2>/dev/null || echo 0)\n'
  );
  chmodSync(faux, 0o755);
  sorties.forEach((s, i) => {
    writeFileSync(path.join(dossier, `sortie-${i + 1}`), `${s.texte}\n`);
    writeFileSync(path.join(dossier, `code-${i + 1}`), String(s.code ?? 0));
  });
  mkdirSync(path.join(dossier, 'transcriptions'));
  const ctx = {
    racine: dossier,
    copie: dossier,
    ticket: 'demo-1',
    sujet: 'essai',
    paquets: ['.'],
    tmp: dossier,
    rendus: [] as object[],
    journal: path.join(dossier, 'journal'),
    fiches: path.join(dossier, 'fiches.jsonl'),
    transcriptions: path.join(dossier, 'transcriptions'),
    immobileMs: 60_000,
    bd: () => ({ status: 0, stdout: '[{}]', stderr: '' }),
  };
  const lancements = () => Number(readFileSync(path.join(dossier, 'n'), 'utf8'));
  return { dossier, faux, ctx, lancements };
}

async function jouer(m: ReturnType<typeof monter>, id: string) {
  const avant = { ...process.env };
  Object.assign(process.env, {
    CLAUDE_BIN: m.faux,
    GRILLHOUSE_REGISTRE: path.join(m.dossier, 'registre.jsonl'),
  });
  try {
    await jusquALaFiche(m.ctx, 'relecteur', 'consigne', {
      evenement: 'relecture',
      id,
      horsEnveloppe: true,
      prendrePlace: () => ({ rattacher: () => {}, rendre: () => {} }),
      signeDeVie: () => {},
    });
    return null as unknown as { nom: string; resultat?: { reprise: number; lisible: boolean } };
  } catch (e) {
    return e as { nom: string; resultat?: { reprise: number; lisible: boolean } };
  } finally {
    for (const k of ['CLAUDE_BIN', 'GRILLHOUSE_REGISTRE']) {
      if (avant[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = avant[k];
      }
    }
  }
}

const heureLocale = (ms: number, fuseau: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone: fuseau,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(ms);

describe('une séance que la limite d’usage arrête', () => {
  it('lève l’arrêt « limite-d-usage » avec l’heure de reprise, sans reprendre la séance', async () => {
    const m = monter([{ texte: LIMITE('2am (Europe/Paris)'), code: 1 }]);
    const avant = Date.now();
    const arret = await jouer(m, 'seance-limite');
    expect(arret).toMatchObject({ nom: 'limite-d-usage', resultat: { lisible: true } });
    expect(arret.resultat!.reprise).toBeGreaterThan(avant);
    expect(arret.resultat!.reprise).toBeLessThanOrEqual(avant + 25 * 3_600_000);
    expect(heureLocale(arret.resultat!.reprise, 'Europe/Paris')).toBe('02:00');
    expect(m.lancements()).toBe(1);
  });

  it('sans heure lisible, se reporte d’une heure', async () => {
    const m = monter([{ texte: LIMITE('plus tard (Europe/Paris)'), code: 1 }]);
    const avant = Date.now();
    const arret = await jouer(m, 'seance-limite-illisible');
    const apres = Date.now();
    expect(arret).toMatchObject({ nom: 'limite-d-usage', resultat: { lisible: false } });
    expect(arret.resultat!.reprise).toBeGreaterThanOrEqual(avant + 3_600_000);
    expect(arret.resultat!.reprise).toBeLessThanOrEqual(apres + 3_600_000);
  });

  it('arrête aussi la séance reprise après une première finie sans fiche', async () => {
    const m = monter([{ texte: SANS_FICHE }, { texte: LIMITE('2am (Europe/Paris)'), code: 1 }]);
    const arret = await jouer(m, 'seance-sans-fiche-puis-limite');
    expect(arret).toMatchObject({ nom: 'limite-d-usage' });
    expect(m.lancements()).toBe(2);
  });
});

describe('une limite d’usage ne compte pas dans les deux séances sans fiche', () => {
  it('après une limite, une séance finie sans fiche garde ses deux lancements avant « sans-fiche »', async () => {
    const m = monter([
      { texte: LIMITE('2am (Europe/Paris)'), code: 1 },
      { texte: SANS_FICHE },
      { texte: SANS_FICHE },
    ]);
    expect(await jouer(m, 'seance-1')).toMatchObject({ nom: 'limite-d-usage' });
    expect(await jouer(m, 'seance-2')).toMatchObject({ nom: 'sans-fiche' });
    expect(m.lancements()).toBe(3);
  });

  it('après deux limites successives, elle garde encore ses deux lancements', async () => {
    const m = monter([
      { texte: LIMITE('2am (Europe/Paris)'), code: 1 },
      { texte: LIMITE('3am (Europe/Paris)'), code: 1 },
      { texte: SANS_FICHE },
      { texte: SANS_FICHE },
    ]);
    expect(await jouer(m, 'seance-1')).toMatchObject({ nom: 'limite-d-usage' });
    expect(await jouer(m, 'seance-2')).toMatchObject({ nom: 'limite-d-usage' });
    expect(await jouer(m, 'seance-3')).toMatchObject({ nom: 'sans-fiche' });
    expect(m.lancements()).toBe(4);
  });

  it('une séance qui finit en erreur sans « resets » reste une séance sans fiche', async () => {
    const m = monter([
      { texte: JSON.stringify({ type: 'result', is_error: true, result: 'rate limit' }), code: 1 },
      { texte: JSON.stringify({ type: 'result', is_error: true, result: 'rate limit' }), code: 1 },
    ]);
    expect(await jouer(m, 'seance-sans-reset')).toMatchObject({ nom: 'sans-fiche' });
    expect(m.lancements()).toBe(2);
  });
});
