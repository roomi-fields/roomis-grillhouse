// grillhouse-f24, critères 1, 2, 6 et 7 — l’entrée du circuit (`main`), jouée dans son propre
// processus, dans un dépôt d’essai, avec un faux `bd` : un grand test, donc un test de nuit.
// Les cas de la même règle qui se jouent sans processus vivent dans circuit.inattendu.spec.ts.
// Témoin : SyntHub SH-13y.6.8 sous 0.29.0 (2026-11-02), `pyo3-build-config.workspace = true` sans
// l’entrée racine ; le faux cargo de ./langages/cargo/faux-cargo.ts la refuse comme cargo (101).
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { architecture } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { ARRETS } from '../../scripts/etapes.mjs';
import { avecFauxCargo, installerFauxCargo } from './langages/cargo/faux-cargo.js';

const CIRCUIT = path.resolve(__dirname, '../../scripts/circuit.mjs');
const TICKET = 'essai-1';
const LIGNE_DE_CARGO = '`dependency.pyo3-build-config` was not found in `workspace.dependencies`';

// What the ticket’s state holds before the stop and must still hold after it.
const CONSTAT = {
  titre: 'packages/grillhouse/src/x.ts:3',
  regle: 'une règle',
  role: 'developpeur',
  corps: 'Un constat ouvert.',
  piece: 'packages/grillhouse/src/x.ts:3',
};
const REFUS = {
  rapport: 'Le refus de l’intégration.',
  piece: 'Le refus',
  empreinte: 'abc',
  lance: false,
  relance: false,
};
const CONTROLES_ROUGES = 'La sortie rouge des derniers contrôles.';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'circuit-inattendu-nuit-'));
const JOURNAL = path.join(ESSAIS, 'journal');
let restaurer = () => {};
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), JOURNAL);
});
afterAll(() => restaurer());
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const git = (dossier: string, ...args: string[]) => {
  const r = spawnSync('git', ['-C', dossier, ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
  }
};
const ecrire = (racine: string, fichiers: Record<string, string>) => {
  for (const [rel, texte] of Object.entries(fichiers)) {
    mkdirSync(path.dirname(path.join(racine, rel)), { recursive: true });
    writeFileSync(path.join(racine, rel), texte);
  }
};

function projet(nom: string, racineDeclare: boolean): string {
  const dir = mkdtempSync(path.join(ESSAIS, `${nom}-`));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'essai@example.com');
  git(dir, 'config', 'user.name', 'essai');
  ecrire(dir, {
    'docs/ARCHITECTURE.md': architecture(['cargo']),
    'Cargo.toml': `[workspace]\nmembers = ["crates/*"]\n${
      racineDeclare ? '\n[workspace.dependencies]\npyo3-build-config = "0.22"\n' : ''
    }`,
    'crates/service/Cargo.toml':
      '[package]\nname = "service"\nversion = "0.1.0"\nedition = "2021"\n\n' +
      '[dependencies]\npyo3-build-config.workspace = true\n',
    'crates/service/src/lib.rs': '',
  });
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'essai');
  return dir;
}

describe('grillhouse-f24, critères 1, 2, 6 et 7 — l’entrée du circuit', () => {
  function bd(): { dossier: string; commentaires: string; comments: string } {
    const dossier = mkdtempSync(path.join(ESSAIS, 'bd-'));
    const commentaires = path.join(dossier, 'commentaires.txt');
    const comments = path.join(dossier, 'comments.json');
    writeFileSync(comments, '[]');
    writeFileSync(
      path.join(dossier, 'bd'),
      `#!/usr/bin/env node
const fs = require('node:fs');
const a = process.argv.slice(2);
if (a[0] === 'show') {
  process.stdout.write(JSON.stringify([{ id: a[1], title: a[1] + ' — Sujet — service', description: '## Architecture\\nx', issue_type: 'task', labels: [] }]));
} else if (a[0] === 'comments' && a[1] === 'add') {
  fs.appendFileSync(${JSON.stringify(commentaires)}, a.slice(3).join(' ') + '\\n');
} else if (a[0] === 'comments') {
  process.stdout.write(fs.readFileSync(${JSON.stringify(comments)}, 'utf8'));
} else {
  process.stdout.write('[]');
}
`
    );
    chmodSync(path.join(dossier, 'bd'), 0o755);
    return { dossier, commentaires, comments };
  }

  // The state a killed circuit leaves: at 3 Code, no stop.
  function etatSansFin(depot: string): string {
    const fichier = path.join(depot, '.claude', 'worktrees', `${TICKET}.circuit.json`);
    ecrire(depot, {
      [path.relative(depot, fichier)]: JSON.stringify({
        etape: 'developpeur',
        tentative: 1,
        code: null,
        raison: null,
        rapport: null,
        finale: false,
        processus: 2147483646,
        depart: 'inexistant',
        paquets: [],
        constats: [CONSTAT],
        refus: REFUS,
        controlesRouges: CONTROLES_ROUGES,
        verifie: 'arbre-verifie',
      }),
    });
    return fichier;
  }

  function reprendre(depot: string, dossierBd: string) {
    const code =
      `import { main } from ${JSON.stringify(CIRCUIT)};\n` +
      `process.exitCode = await main(process.argv.slice(1));`;
    return spawnSync(process.execPath, ['--input-type=module', '-e', code, TICKET, '--reprendre'], {
      cwd: depot,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${dossierBd}${path.delimiter}${process.env.PATH ?? ''}`,
        XDG_CACHE_HOME: path.join(ESSAIS, 'cache'),
        HOME: ESSAIS,
      },
    });
  }

  interface Etat {
    code: number | null;
    raison: string | null;
    etape: string;
    question: { arret: string; qui: string; question: string };
    constats: unknown;
    refus: unknown;
    controlesRouges: unknown;
    verifie: unknown;
  }
  const lireEtat = (fichier: string): Etat => JSON.parse(readFileSync(fichier, 'utf8')) as Etat;

  it('critères 2 et 7: --reprendre on a copy whose manifest does not read writes the stop « inattendu » and does not die', () => {
    const depot = projet('reprise', false);
    const fichier = etatSansFin(depot);
    const faux_bd = bd();
    const r = reprendre(depot, faux_bd.dossier);
    expect(r.status, r.stderr).toBe(ARRETS.inattendu);
    const etat = lireEtat(fichier);
    expect(etat).toMatchObject({
      code: ARRETS.inattendu,
      raison: 'inattendu',
      etape: 'developpeur',
    });
    expect(etat.question).toMatchObject({ arret: 'inattendu', qui: 'superviseur' });
    expect(etat.question.question).toContain(LIGNE_DE_CARGO);
    expect(etat.question.question).toContain(`npx grillhouse circuit ${TICKET} --reprendre`);
    expect(r.stderr).toContain('inattendu');
    expect(
      existsSync(faux_bd.commentaires) ? readFileSync(faux_bd.commentaires, 'utf8') : ''
    ).toContain('inattendu');
  });

  it('critère 7: the stop « inattendu » keeps the ticket’s state: open finding, integration refusal, red checks, verified tree', () => {
    const depot = projet('etat-garde', false);
    const fichier = etatSansFin(depot);
    const r = reprendre(depot, bd().dossier);
    expect(r.status, r.stderr).toBe(ARRETS.inattendu);
    const etat = lireEtat(fichier);
    expect(etat.code).toBe(ARRETS.inattendu);
    expect(etat.constats).toEqual([CONSTAT]);
    expect(etat.refus).toEqual(REFUS);
    expect(etat.controlesRouges).toBe(CONTROLES_ROUGES);
    expect(etat.verifie).toBe('arbre-verifie');
  });

  it('critère 6: the cause standing, --reprendre writes the same stop again, a stop and not a loop', () => {
    const depot = projet('reprise-deux', false);
    const fichier = etatSansFin(depot);
    const faux_bd = bd();
    const premier = reprendre(depot, faux_bd.dossier);
    const second = reprendre(depot, faux_bd.dossier);
    expect(premier.status, premier.stderr).toBe(ARRETS.inattendu);
    expect(second.status, second.stderr).toBe(ARRETS.inattendu);
    expect(lireEtat(fichier)).toMatchObject({
      code: ARRETS.inattendu,
      raison: 'inattendu',
      etape: 'developpeur',
    });
  });

  it('critères 1 et 6: an exception of another kind, deeper in the run, ends on the same stop at the step it fell', () => {
    // The copy reads; the ticket’s comments come back unreadable (not JSON), which the run reads
    // before any session.
    const depot = projet('profonde', true);
    const fichier = etatSansFin(depot);
    const faux_bd = bd();
    writeFileSync(faux_bd.comments, '{ pas du JSON');
    const r = reprendre(depot, faux_bd.dossier);
    expect(r.status, r.stderr).toBe(ARRETS.inattendu);
    const etat = lireEtat(fichier);
    expect(etat).toMatchObject({
      code: ARRETS.inattendu,
      raison: 'inattendu',
      etape: 'developpeur',
    });
    expect(etat.code).not.toBeNull();
    expect(etat.raison).not.toBeNull();
    expect(etat.question.question).toMatch(/JSON/);
    expect(etat.question.question).toContain('--reprendre');
  });
});
