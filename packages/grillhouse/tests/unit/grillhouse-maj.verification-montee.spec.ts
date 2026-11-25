// La vérification que lance la montée (`grillhouse maj`) est de la sorte « Montée » : poste fermé
// par le superviseur (`grillhouse machine fermer`), elle prend sa part, la fermeture ne refusant que
// le travail neuf. Petit test : la vérification d'un projet d'essai note la sorte qu'elle reçoit.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { verifier } from '../../scripts/grillhouse-maj.mjs';
import { SORTE_DE_LA_MONTEE } from '../../scripts/places-de-la-machine.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'maj-verification-montee-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

describe('la vérification de la montée', () => {
  it('se nomme « Montée » à sa part de la machine', () => {
    const projet = mkdtempSync(path.join(ESSAIS, 'projet-'));
    const note = path.join(projet, 'sorte.txt');
    writeFileSync(
      path.join(projet, 'package.json'),
      JSON.stringify({
        name: 'essai',
        scripts: {
          verifier: `node -e "require('fs').writeFileSync('${note}', process.env.GRILLHOUSE_VERIFICATION_SORTE || '')"`,
        },
      })
    );
    const v = (verifier as unknown as (p: string, o: object) => { code: number | null })(projet, {
      fichiersAFinir: false,
      installer: false,
    });
    expect(v.code).toBe(0);
    expect(readFileSync(note, 'utf8')).toBe(SORTE_DE_LA_MONTEE);
    expect(SORTE_DE_LA_MONTEE).toBe('Montée');
  });

  it.each([
    ['la mise à jour laisse à faire', { fichiersAFinir: true, installer: false }],
    ['`npm install` vient d’abord', { fichiersAFinir: false, installer: true }],
  ])('nomme au superviseur la commande qui la joue poste fermé quand %s', (_cas, bilan) => {
    const projet = mkdtempSync(path.join(ESSAIS, 'projet-'));
    writeFileSync(
      path.join(projet, 'package.json'),
      JSON.stringify({ name: 'essai', scripts: { verifier: 'true' } })
    );
    const v = (verifier as unknown as (p: string, o: object) => { ligne: string })(projet, bilan);
    expect(v.ligne).toContain('GRILLHOUSE_VERIFICATION_SORTE=Montée npm run verifier');
  });
});
