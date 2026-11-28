// A project holds no follow-up of its supervisor: the note of resumption replaces
// `pitmaster/SUIVI.md` (greffon.md, §5.2). `grillhouse maj` removes the file the template placed,
// and leaves to the project the one it filled. Mechanism: installation.md §5.4.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { MIGRATIONS, migrer } from '../../scripts/migrations.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-suivi-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const FICHIER = 'pitmaster/SUIVI.md';
// The file as the template of a project placed it.
const GABARIT = `# Suivi de la supervision

Tenu par la compétence \`pitmaster\`. Une question s'écrit ici dès qu'elle naît ; tranchée, elle en
sort et sa réponse va dans son ticket.

## Dernier tour

- Date : aucun tour encore
- Agents lancés : aucun
- À vérifier au prochain tour : rien

## R — à confirmer par le responsable

Chaque point : contexte, exemple, règle, recommandation, question, ticket.

## S — à surveiller

Chaque point : ce qui se surveille, ce qui le fermera.

## F — fermés

Chaque point : ce qui l'a fermé, le ticket.
`;
const REMPLI = GABARIT.replace(
  '- Date : aucun tour encore',
  '- Date : 2026-11-03, le lot demo-4 à relire'
);

// A project holding `suivi` at pitmaster/SUIVI.md, none when null.
function projet(suivi: string | null) {
  const p = mkdtempSync(path.join(ESSAIS, 'projet-'));
  writeFileSync(path.join(p, 'package.json'), '{}\n');
  if (suivi !== null) {
    mkdirSync(path.join(p, 'pitmaster'));
    writeFileSync(path.join(p, FICHIER), suivi);
  }
  return p;
}
// What an update of a project that recorded 0.50.0 says of the follow-up.
function monter(p: string) {
  const lus = migrer(p, '0.50.0', MIGRATIONS) as { lignes: string[]; aFaire: string[] }[];
  const nomme = (l: string) => l.includes(FICHIER);
  return {
    faites: lus.flatMap(r => r.lignes).filter(nomme),
    aFaire: lus.flatMap(r => r.aFaire).filter(nomme),
  };
}

describe('the update retires the follow-up of the supervisor', () => {
  it('removes a pitmaster/SUIVI.md identical to the template, and says so', () => {
    const p = projet(GABARIT);
    const r = monter(p);
    expect(existsSync(path.join(p, FICHIER))).toBe(false);
    expect(r.faites).toHaveLength(1);
    expect(r.aFaire).toEqual([]);
    // A project without the file hears nothing of it.
    expect(monter(projet(null))).toEqual({ faites: [], aFaire: [] });
  });

  it('changes nothing at a second update', () => {
    const p = projet(GABARIT);
    expect(monter(p).faites).toHaveLength(1);
    expect(monter(p)).toEqual({ faites: [], aFaire: [] });
    expect(existsSync(path.join(p, FICHIER))).toBe(false);
  });

  it('leaves a file the project filled, with a line « à faire » that names it and says where its open content goes', () => {
    const p = projet(REMPLI);
    const r = monter(p);
    expect(readFileSync(path.join(p, FICHIER), 'utf8')).toBe(REMPLI);
    expect(r.faites).toEqual([]);
    expect(r.aFaire).toHaveLength(1);
    expect(r.aFaire[0]).toMatch(/note de reprise/);
    expect(r.aFaire[0]).toMatch(/ticket/);
    expect(r.aFaire[0]).toMatch(/retir/);
  });

  it('says it again at each update while the file stays', () => {
    const p = projet(REMPLI);
    const premiere = monter(p).aFaire;
    expect(premiere).toHaveLength(1);
    expect(monter(p).aFaire).toEqual(premiere);
    rmSync(path.join(p, FICHIER));
    expect(monter(p)).toEqual({ faites: [], aFaire: [] });
  });
});
