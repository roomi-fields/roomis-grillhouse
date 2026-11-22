// The greens the proof of the red lists are those of the test files of the lot. A single
// integration binary (Rust `tests/it/main.rs`) plays every module it aggregates, and its run names
// each of them: the modules the lot changes are judged as the lot's, the others are main's, whose
// greens say nothing of the lot and whose reds are existing reds.
// Witness: SyntHub SH-cgi.17 under 0.45.1: the proof listed 9 « verts non nommés » of db_lock.rs,
// librarian_command.rs and sound_identity_shared.rs, modules of other tickets already on main.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { declarerLeLangage } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as activites from '../../scripts/activites.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'preuve-verts-du-lot-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const IT = 'crates/service/tests/it';

// A copy whose HEAD holds the binary and the module db_lock, and whose lot adds the module
// neuf and declares it in the binary.
function copie() {
  const dossier = mkdtempSync(path.join(ESSAIS, 'copie-'));
  const git = (...a: string[]) =>
    spawnSync('git', ['-C', dossier, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
      encoding: 'utf8',
    });
  declarerLeLangage(dossier);
  mkdirSync(path.join(dossier, IT), { recursive: true });
  writeFileSync(path.join(dossier, IT, 'main.rs'), 'mod db_lock;\n');
  writeFileSync(path.join(dossier, IT, 'db_lock.rs'), '// main holds it\n');
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'départ');
  writeFileSync(path.join(dossier, IT, 'main.rs'), 'mod db_lock;\nmod neuf;\n');
  writeFileSync(path.join(dossier, IT, 'neuf.rs'), '// the lot adds it\n');
  const fiches = path.join(ESSAIS, `${path.basename(dossier)}.fiches.jsonl`);
  writeFileSync(
    fiches,
    ['explorateur', 'testwriter']
      .map(role => `${JSON.stringify({ role, fiche: { statut: 'FAIT' } })}\n`)
      .join('')
  );
  return {
    copie: dossier,
    fiches,
    paquets: ['.'],
    journal: path.join(ESSAIS, 'journal'),
    ticket: 'essai-1',
  };
}
type Copie = ReturnType<typeof copie>;
const preuve = activites.preuve as unknown as (
  ctx: Copie,
  o: { mesure: { cle: string; runs: unknown[] } }
) => { ok: boolean; rouges: number; texte: string; resume: string };

const cas = (module: string, nom: string, etat: 'passed' | 'failed') => ({
  titre: `${module}::${nom}`,
  nom: `${module}::${nom}`,
  etat,
  message: etat === 'failed' ? 'panicked' : '',
});
// The proof of the lot of <c> on one run of the binary that reports the modules <modules>.
function prouver(c: Copie, modules: Record<string, ReturnType<typeof cas>[]>) {
  const jour = activites.separerLesFichiersDuJour(c, activites.testsDuLot(c)).jour;
  return preuve(c, {
    mesure: {
      cle: activites.cleDeLaMesure(c, jour),
      runs: [
        {
          groupe: [`${IT}/main.rs`],
          entier: false,
          code: Object.values(modules).some(t => t.some(x => x.etat === 'failed')) ? 1 : 0,
          resultats: Object.entries(modules).map(([module, tests]) => ({
            fichier: path.join(c.copie, IT, `${module}.rs`),
            etat: tests.some(x => x.etat === 'failed') ? 'failed' : 'passed',
            message: '',
            tests,
          })),
          constructions: [],
        },
      ],
    },
  });
}

describe('les verts que la preuve liste sont ceux des fichiers de test du lot', () => {
  it('les verts d’un module que le lot ne touche pas ne sont ni listés ni comptés', () => {
    const r = prouver(copie(), {
      db_lock: [
        cas('db_lock', 'a_connection_waits', 'passed'),
        cas('db_lock', 'it_syncs', 'passed'),
      ],
      neuf: [cas('neuf', 'un_cas', 'failed'), cas('neuf', 'un_vert', 'passed')],
    });
    expect(r.texte).toContain(`${IT}/neuf.rs › neuf::un_vert`);
    expect(r.texte).not.toContain('db_lock.rs');
    expect(r.resume).toContain('1 vert(s) non nommé(s)');
    expect(r.resume).toContain('1 rouge(s)');
    expect(r.ok).toBe(true);
  });

  it('un lot dont les modules sont tous verts ne se voit prêter aucun vert d’un autre module', () => {
    const r = prouver(copie(), {
      db_lock: [cas('db_lock', 'a_connection_waits', 'passed')],
      neuf: [cas('neuf', 'un_vert', 'passed')],
    });
    expect(r.resume).toContain('1 vert(s) non nommé(s)');
    expect(r.texte).not.toContain('db_lock.rs');
  });

  it('le rouge d’un module que le lot ne touche pas est un rouge existant, pas un rouge du lot', () => {
    const r = prouver(copie(), {
      db_lock: [cas('db_lock', 'a_connection_waits', 'failed')],
      neuf: [cas('neuf', 'un_cas', 'failed')],
    });
    expect(r.rouges).toBe(2);
    expect(r.texte).toContain(`rouge existant : ${IT}/db_lock.rs › db_lock::a_connection_waits`);
    expect(r.texte).toContain(`- ${IT}/neuf.rs › neuf::un_cas`);
    expect(r.texte).not.toContain('ne se charge pas');
  });
});
