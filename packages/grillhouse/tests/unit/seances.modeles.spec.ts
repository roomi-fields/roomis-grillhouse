// The model of each session under the envelope (scripts/seances.mjs): the circuit names it in the
// arguments of the launcher (`--modele`), Sonnet for the testwriter and the developpeur, Opus for
// the developpeur's last session alone, and fixes no effort. The launcher here is a program of
// trial (GRILLHOUSE_LANCEUR, in place of lancer.sh) that writes its arguments and ranges a sheet.
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import * as seances from '../../scripts/seances.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'seances-modeles-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const jusquALaFiche = seances.jusquALaFiche as (
  ctx: object,
  role: string,
  texte: string,
  options: object
) => Promise<unknown>;

// One session of <role> through the launcher of trial; the arguments it received, one per word.
async function argumentsDeLaSeance(role: string, options: { fort?: boolean }, home?: string) {
  const dossier = mkdtempSync(path.join(ESSAIS, 'seance-'));
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
    essaiDeLActe: 1,
    bd: () => ({ status: 0, stdout: '[{}]', stderr: '' }),
  };
  const compte = path.join(dossier, 'lancements');
  const lanceur = path.join(dossier, 'lancer.sh');
  writeFileSync(
    lanceur,
    `#!/bin/sh\necho "$*" >> ${compte}\nid=$(echo "$*" | sed -n 's/.*--seance \\([^ ]*\\).*/\\1/p')\nr=${dossier}/seances/$id\nmkdir -p $r\necho '{"structured_output":{"statut":"FAIT"}}' > $r/resultat.json\necho 0 > $r/fin\n`
  );
  chmodSync(lanceur, 0o755);
  const avant = { lanceur: process.env.GRILLHOUSE_LANCEUR, home: process.env.HOME };
  process.env.GRILLHOUSE_LANCEUR = lanceur;
  if (home) {
    process.env.HOME = home;
  }
  try {
    await jusquALaFiche(ctx, role, 'consigne', {
      id: 'seance-essai',
      evenement: 'neuve',
      fiche: 'geste',
      prendrePlace: () => ({ rattacher: () => {}, rendre: () => {} }),
      ...options,
    });
  } finally {
    for (const [cle, valeur] of [
      ['GRILLHOUSE_LANCEUR', avant.lanceur],
      ['HOME', avant.home],
    ] as const) {
      if (valeur === undefined) {
        delete process.env[cle];
      } else {
        process.env[cle] = valeur;
      }
    }
  }
  return readFileSync(compte, 'utf8').trim().split(/\s+/);
}
const valeur = (a: string[], option: string) => a[a.indexOf(option) + 1];

describe('le modèle de chaque séance sous l’enveloppe est nommé par le circuit', () => {
  it.each(['testwriter', 'developpeur'])(
    'le %s hors du modèle fort : le lanceur reçoit --modele sonnet',
    async role => {
      const a = await argumentsDeLaSeance(role, { fort: false });
      expect(valeur(a, '--modele')).toBe('sonnet');
    }
  );

  it('une séance sans l’option fort nomme Sonnet aussi', async () => {
    const a = await argumentsDeLaSeance('developpeur', {});
    expect(valeur(a, '--modele')).toBe('sonnet');
  });

  it('le développeur à sa dernière séance : le lanceur reçoit --modele opus', async () => {
    const a = await argumentsDeLaSeance('developpeur', { fort: true });
    expect(valeur(a, '--modele')).toBe('opus');
  });

  it.each([
    ['testwriter', false],
    ['developpeur', false],
    ['developpeur', true],
  ])('le %s (fort : %s) : aucune séance ne fixe l’effort', async (role, fort) => {
    const a = await argumentsDeLaSeance(role, { fort });
    expect(a).not.toContain('--effort');
    expect(a).not.toContain('high');
  });

  it('un autre réglage du compte ne change aucun argument de séance', async () => {
    const maison = mkdtempSync(path.join(ESSAIS, 'maison-'));
    mkdirSync(path.join(maison, '.claude'));
    writeFileSync(
      path.join(maison, '.claude', 'settings.json'),
      JSON.stringify({ model: 'opus', effortLevel: 'max' })
    );
    for (const [role, fort] of [
      ['testwriter', false],
      ['developpeur', false],
      ['developpeur', true],
    ] as const) {
      const sans = await argumentsDeLaSeance(role, { fort });
      const avec = await argumentsDeLaSeance(role, { fort }, maison);
      // The ids of the session differ from one launch to the next; the options do not.
      const options = (a: string[]) => a.filter(m => !m.startsWith('/') && !/^seance-/.test(m));
      expect(options(avec)).toEqual(options(sans));
      expect(valeur(avec, '--modele')).toBe(fort ? 'opus' : 'sonnet');
    }
  });
});
