// The roles that search the code (explorer, testwriter, developer, direct, reviewer) are told to
// call the indexes at the very gesture where they serve: in the instruction of their session
// (scripts/seances.mjs, `consigne`, from the templates of the supervisor's skill) and at the step
// of their skill where they search, by the names that launch the calls, and never by a name their
// rights refuse.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { consigneDuRelecteurDuDirect } from '../../scripts/direct.mjs';
import { ROLES } from '../../scripts/droits.mjs';
import { consigne } from '../../scripts/seances.mjs';

type Role = 'explorateur' | 'testwriter' | 'developpeur' | 'direct' | 'relecteur';

const COMPETENCES: Record<Role, string> = {
  explorateur: path.resolve(__dirname, '../../../../mods/grillhouse/skills/explorateur'),
  testwriter: path.resolve(__dirname, '../../../../mods/grillhouse/skills/testwriter'),
  developpeur: path.resolve(__dirname, '../../../../mods/grillhouse/skills/developpeur'),
  direct: path.resolve(__dirname, '../../../../mods/grillhouse/skills/direct'),
  relecteur: path.resolve(__dirname, '../../../../mods/grillhouse/skills/relecteur'),
};

// The templates of the instructions, by their rank (scripts/seances.mjs, `consigne`).
const ECRIVAINS = 0;
const RELECTEUR = 1;
const PLAN = 5;
const QUESTIONS_DU_PLAN = 6;
const TRI = 7;
const GESTE_MECANIQUE = 8;

const RECHERCHE = 'mcp__rtfm__rtfm_search';
const APPEL = /mcp__codegraph__codegraph_explore|codegraph explore/;
const AVANT_LE_SHELL = /avant[^.;]*\b(recherches?|chercher)\b[^.;]*\bshell\b/i;

const paragraphes = (texte: string) => texte.split(/\n\s*\n/);
// A text on one line, as it reads once wrapped.
const aPlat = (texte: string) => texte.replace(/\s+/g, ' ');

// The part of <texte> that opens on the line matching <debut> and stops before the next line
// matching <fin>; the test fails, named, when the skill no longer holds it.
function partie(texte: string, debut: RegExp, fin: RegExp): string {
  const lignes = texte.split('\n');
  const i = lignes.findIndex(l => debut.test(l));
  expect(i, `partie introuvable : ${debut}`).toBeGreaterThanOrEqual(0);
  const j = lignes.findIndex((l, n) => n > i && fin.test(l));
  return lignes.slice(i, j < 0 ? undefined : j).join('\n');
}
const competence = (role: Role) => readFileSync(path.join(COMPETENCES[role], 'SKILL.md'), 'utf8');
const section = (role: Role, titre: RegExp) => partie(competence(role), titre, /^## /);

describe('the instruction of a session names the index at the gesture of the search', () => {
  const CONSIGNES: [string, () => string][] = [
    ['testwriter, developer and direct', () => consigne({}, ECRIVAINS)],
    ['reviewer', () => consigne({}, RELECTEUR)],
    ['reviewer of a direct', () => consigneDuRelecteurDuDirect({})],
    ['explorer on the plan', () => consigne({}, PLAN)],
  ];

  for (const [qui, texte] of CONSIGNES) {
    it(`${qui}: one paragraph names the search and the calls of the index by their launching names, to use before a search by the shell`, () => {
      const auGeste = paragraphes(texte()).filter(
        p => p.includes(RECHERCHE) && APPEL.test(p) && AVANT_LE_SHELL.test(aPlat(p))
      );
      expect(auGeste, qui).not.toEqual([]);
    });
  }
});

describe('the skill of a role names the index at the step where the role searches the code', () => {
  const ETAPES: [string, () => string][] = [
    [
      'explorer, the survey of the plan',
      () =>
        partie(
          section('explorateur', /^## Dans le circuit : le plan/),
          /^1\. \*\*Le relevé/,
          /^2\. /
        ),
    ],
    ['testwriter, the reading before the tests', () => section('testwriter', /^## Au démarrage/)],
    [
      'developer, the reading before the code',
      () =>
        [
          section('developpeur', /^## Au démarrage/),
          section('developpeur', /^## Avant le code/),
        ].join('\n'),
    ],
    [
      'direct, the reading before the tests and the code',
      () => section('direct', /^## Au démarrage/),
    ],
    [
      'reviewer, the pass of what exists',
      () => partie(section('relecteur', /^## Les six passes/), /^5\. \*\*L'existant/, /^6\. /),
    ],
    [
      'reviewer, the conformity of each element',
      () => section('relecteur', /^## D'abord, la passe d'architecture/),
    ],
  ];

  for (const [etape, texte] of ETAPES) {
    it(`${etape}: names the search and the calls of the index by their launching names`, () => {
      const lu = aPlat(texte());
      expect(lu, etape).toContain(RECHERCHE);
      expect(lu, etape).toMatch(APPEL);
    });
  }
});

describe('no role is named an index tool its rights refuse', () => {
  const RANGS: Record<Role, number[]> = {
    explorateur: [PLAN, QUESTIONS_DU_PLAN, TRI, GESTE_MECANIQUE],
    testwriter: [ECRIVAINS],
    developpeur: [ECRIVAINS],
    direct: [ECRIVAINS],
    relecteur: [RELECTEUR],
  };

  // Every text the role reads that names its tools: its skill, its references, its instructions.
  function lus(role: Role): string {
    const dossier = COMPETENCES[role];
    const fichiers = readdirSync(dossier, { recursive: true, encoding: 'utf8' })
      .filter(f => f.endsWith('.md'))
      .map(f => readFileSync(path.join(dossier, f), 'utf8'));
    return [...fichiers, ...RANGS[role].map(rang => consigne({}, rang))].join('\n');
  }
  // The rules the names of <texte> call for, under their bare or launching form.
  const demandees = (texte: string) => [
    ...new Set([
      ...[...texte.matchAll(/\b(?:mcp__(?:rtfm|codegraph)__)?((rtfm|codegraph)_[a-z]+)\b/g)].map(
        m => `mcp__${m[2]}__${m[1]}`
      ),
      ...(/codegraph explore/.test(texte) ? ['Bash(codegraph explore *)'] : []),
    ]),
  ];

  for (const role of Object.keys(COMPETENCES) as Role[]) {
    it(`${role}: each index tool its skill and its instructions name is one of its rights`, () => {
      const nommes = demandees(lus(role));
      expect(nommes, role).not.toEqual([]);
      expect(
        nommes.filter(n => !ROLES[role].commandes.includes(n)),
        role
      ).toEqual([]);
    });
  }

  it('the reading of a result whole is named to the roles that write alone', () => {
    const quiLeNomme = (Object.keys(COMPETENCES) as Role[]).filter(role =>
      lus(role).includes('rtfm_expand')
    );
    expect(quiLeNomme.sort()).toEqual(['developpeur', 'direct', 'testwriter']);
  });
});
