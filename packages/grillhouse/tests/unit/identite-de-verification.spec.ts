// grillhouse-6ay — la phase et le ticket d'une vérification, de son appelant au verrou de la machine.
// Le rejeu de l'intégration et de la file (scripts/integration/rejeu.mjs, `tester`) pose l'identité
// dans l'environnement de `npm run verifier` seul, jamais dans celui de la préparation ; la nuit
// (scripts/nuit.sh) la pose de même, « Nuit » sans ticket. La lecture par le verrou est dans
// tests/unit/verrou-de-machine.spec.ts, la ligne du panneau dans tests/unit/tableau-verrou.spec.ts.
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { declarerLeLangage } from '@roomi-fields/grillhouse-matiere/test-fixtures';

const RACINE = path.resolve(__dirname, '../../../..');
const REJEU = pathToFileURL(
  path.join(RACINE, 'packages/grillhouse/scripts/integration/rejeu.mjs')
).href;
const NUIT = path.join(RACINE, 'packages/grillhouse/scripts/nuit.sh');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'identite-de-verification-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

let n = 0;
const unDossier = () => {
  const d = path.join(ESSAIS, `essai-${++n}`);
  mkdirSync(d, { recursive: true });
  return d;
};

describe('grillhouse-6ay critère 9 — le rejeu passe l’identité à npm run verifier seul', () => {
  interface Rejeu {
    ouvrirCopie: (o: { racine: string; copie: string; ref: string; dire: (l: string) => void }) => {
      refus?: string;
      tester: (identite?: { sorte: string; ticket: string | null }) => { status: number };
    };
  }
  // A project of trial, a repository with one commit, and an `npm` that records, for each call,
  // its arguments and the two variables of the identity it received.
  function ouvrir() {
    const racine = unDossier();
    const copie = path.join(racine, 'copie');
    const journal = path.join(racine, 'appels');
    const bin = path.join(racine, 'bin');
    mkdirSync(bin);
    writeFileSync(
      path.join(bin, 'npm'),
      `#!/bin/sh
echo "$* | sorte=\${GRILLHOUSE_VERIFICATION_SORTE:-} ticket=\${GRILLHOUSE_VERIFICATION_TICKET:-}" >> ${JSON.stringify(journal)}
exit 0
`
    );
    chmodSync(path.join(bin, 'npm'), 0o755);
    declarerLeLangage(racine);
    const git = (...a: string[]) =>
      spawnSync('git', ['-C', racine, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
        encoding: 'utf8',
      });
    git('init', '-q');
    git('add', 'package.json', 'docs');
    git('commit', '-q', '-m', 'essai');
    return { racine, copie, journal, bin };
  }
  const lire = (journal: string) => readFileSync(journal, 'utf8').split('\n').filter(Boolean);
  async function jouer(identite: { sorte: string; ticket: string | null } | undefined) {
    const o = ouvrir();
    const ancien = process.env.PATH;
    process.env.PATH = `${o.bin}${path.delimiter}${ancien ?? ''}`;
    try {
      const { ouvrirCopie } = (await import(REJEU)) as Rejeu;
      const ouverte = ouvrirCopie({
        racine: o.racine,
        copie: o.copie,
        ref: 'HEAD',
        dire: () => {},
      });
      expect(ouverte.refus).toBeUndefined();
      expect(ouverte.tester(identite).status).toBe(0);
      return lire(o.journal);
    } finally {
      process.env.PATH = ancien;
    }
  }

  it('critère 9 : l’intégration passe « Intégration » et le ticket du lot', async () => {
    const appels = await jouer({ sorte: 'Intégration', ticket: 'SH-ae6.5' });
    expect(appels.filter(a => a.startsWith('run verifier'))).toEqual([
      'run verifier | sorte=Intégration ticket=SH-ae6.5',
    ]);
  });

  it('critère 9 : la file passe « File » et le ticket de l’entrée qu’elle rejoue', async () => {
    const appels = await jouer({ sorte: 'File', ticket: 'bp-mono-vbwf.320.11' });
    expect(appels.filter(a => a.startsWith('run verifier'))).toEqual([
      'run verifier | sorte=File ticket=bp-mono-vbwf.320.11',
    ]);
  });

  it('critère 9 : sans ticket connu, la variable du ticket n’est pas posée', async () => {
    const appels = await jouer({ sorte: 'File', ticket: null });
    expect(appels.filter(a => a.startsWith('run verifier'))).toEqual([
      'run verifier | sorte=File ticket=',
    ]);
  });

  it('critère 9 : les autres commandes du rejeu (préparation, installation) ne reçoivent pas l’identité', async () => {
    const appels = await jouer({ sorte: 'Intégration', ticket: 'SH-ae6.5' });
    expect(appels.filter(a => !a.startsWith('run verifier'))).toEqual(
      appels.filter(a => !a.startsWith('run verifier')).filter(a => a.endsWith('sorte= ticket='))
    );
  });
});

describe('grillhouse-6ay critères 2 et 9 — la nuit passe « Nuit », sans ticket', () => {
  it('critère 2 : la ligne de la passe complète de la nuit pose GRILLHOUSE_VERIFICATION_SORTE=Nuit et aucun ticket', () => {
    const lignes = readFileSync(NUIT, 'utf8')
      .split('\n')
      .filter(l => l.includes('run verifier'));
    const passe = lignes.find(l => l.includes('monter npm --prefix'));
    expect(passe).toBeDefined();
    expect(passe).toContain('GRILLHOUSE_VERIFICATION_SORTE=Nuit');
    expect(passe).not.toContain('GRILLHOUSE_VERIFICATION_TICKET');
  });
});
