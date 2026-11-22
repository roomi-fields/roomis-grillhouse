// What the copy of a ticket says of its plan (scripts/activites.mjs): whether the plan plays tests at
// all (`sansTests`), whether the copy holds a change of the plan (`livre`), and the fingerprint of
// the files of the plan (`empreinte`), which the circuit compares before and after a session of the
// developpeur: the same fingerprint is a session that changed no file of the plan, the stop
// « sans-livraison » when it then goes red. A test of size medium: the copy is a trial git
// repository.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { architecture } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as activites from '../../scripts/activites.mjs';

interface Ctx {
  copie: string;
  racine: string;
  paquets: string[];
}
const { sansTests, livre, empreinte } = activites as unknown as {
  sansTests: (ctx: Ctx) => boolean;
  livre: (ctx: Ctx) => boolean;
  empreinte: (ctx: Ctx, chemins?: string[]) => string;
};

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'activites-livraison-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ecrire = (dossier: string, rel: string, texte: string) => {
  mkdirSync(path.dirname(path.join(dossier, rel)), { recursive: true });
  writeFileSync(path.join(dossier, rel), texte);
};
const git = (dossier: string, ...args: string[]) =>
  execFileSync('git', ['-C', dossier, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    encoding: 'utf8',
  });

// A project whose package `forms` plays its tests (`test:unit`), `binder` carries only the script
// `test:vitest` that the module of the language no longer reads, `site` has none; a folder `spec`
// of documents, no package.
function projet(nom: string) {
  const dossier = path.join(ESSAIS, nom);
  ecrire(dossier, 'package.json', JSON.stringify({ name: 'essai', workspaces: ['packages/*'] }));
  ecrire(dossier, 'docs/ARCHITECTURE.md', architecture());
  ecrire(
    dossier,
    'packages/forms/package.json',
    JSON.stringify({ name: '@essai/forms', scripts: { 'test:unit': 'vitest run' } })
  );
  ecrire(dossier, 'packages/forms/src/index.mjs', 'export const mesure = x => x;\n');
  ecrire(
    dossier,
    'packages/binder/package.json',
    JSON.stringify({ name: '@essai/binder', scripts: { 'test:vitest': 'vitest run' } })
  );
  ecrire(dossier, 'packages/binder/src/index.mjs', 'export const lie = 1;\n');
  ecrire(dossier, 'packages/site/package.json', JSON.stringify({ name: '@essai/site' }));
  ecrire(dossier, 'spec/mesure.md', '# La mesure\n');
  git(dossier, 'init', '-q', '-b', 'main');
  git(dossier, 'add', '-A');
  git(dossier, 'commit', '-qm', 'base');
  return dossier;
}
const ctxDe = (dossier: string, paquets: string[]): Ctx => ({
  copie: dossier,
  racine: dossier,
  paquets,
});

describe('un plan qui ne joue aucun test', () => {
  const dossier = projet('sans-tests');
  it('un plan de documents seuls, hors de tout paquet, ne joue aucun test', () => {
    expect(sansTests(ctxDe(dossier, ['spec']))).toBe(true);
  });
  it('un paquet sans script de tests ne joue aucun test', () => {
    expect(sansTests(ctxDe(dossier, ['packages/site']))).toBe(true);
  });
  it('un paquet dont le script est encore test:vitest ne joue aucun test', () => {
    expect(sansTests(ctxDe(dossier, ['packages/binder']))).toBe(true);
    expect(sansTests(ctxDe(dossier, ['packages/binder', 'spec']))).toBe(true);
  });
  it('un plan qui tient un paquet qui joue ses tests en joue', () => {
    expect(sansTests(ctxDe(dossier, ['packages/forms']))).toBe(false);
    expect(sansTests(ctxDe(dossier, ['packages/forms', 'spec']))).toBe(false);
    expect(sansTests(ctxDe(dossier, ['.']))).toBe(false);
  });
});

describe('la livraison d’une séance du développeur dans la copie', () => {
  it('une copie propre ne livre rien ; un fichier changé du plan, neuf ou retiré, est une livraison', () => {
    const d = projet('livraison');
    const plan = ctxDe(d, ['packages/forms']);
    expect(livre(plan)).toBe(false);
    ecrire(d, 'packages/forms/src/neuf.mjs', 'export const n = 1;\n');
    expect(livre(plan)).toBe(true);
    unlinkSync(path.join(d, 'packages/forms/src/neuf.mjs'));
    expect(livre(plan)).toBe(false);
    unlinkSync(path.join(d, 'packages/forms/src/index.mjs'));
    expect(livre(plan)).toBe(true);
  });

  it('un fichier changé hors du plan n’est pas une livraison', () => {
    const d = projet('hors-plan');
    ecrire(d, 'packages/binder/src/index.mjs', 'export const lie = 2;\n');
    expect(livre(ctxDe(d, ['packages/forms']))).toBe(false);
    expect(livre(ctxDe(d, ['packages/forms', 'packages/binder']))).toBe(true);
  });
});

describe('l’empreinte des fichiers du plan', () => {
  it('reste la même tant qu’aucun fichier du plan ne change, et change avec le contenu d’un fichier déjà changé', () => {
    const d = projet('empreinte');
    const plan = ctxDe(d, ['packages/forms']);
    const propre = empreinte(plan);
    expect(empreinte(plan)).toBe(propre);
    ecrire(d, 'packages/forms/src/index.mjs', 'export const mesure = x => 2 * x;\n');
    const premiere = empreinte(plan);
    expect(premiere).not.toBe(propre);
    // The status is the same, the content is not: the fingerprint follows the content.
    ecrire(d, 'packages/forms/src/index.mjs', 'export const mesure = x => 3 * x;\n');
    expect(empreinte(plan)).not.toBe(premiere);
  });

  it('un fichier neuf du plan la change, son retrait la rend à la copie propre', () => {
    const d = projet('empreinte-neuf');
    const plan = ctxDe(d, ['packages/forms']);
    const propre = empreinte(plan);
    ecrire(d, 'packages/forms/test/mesure.test.mjs', 'it("x", () => {});\n');
    expect(empreinte(plan)).not.toBe(propre);
    unlinkSync(path.join(d, 'packages/forms/test/mesure.test.mjs'));
    expect(empreinte(plan)).toBe(propre);
  });

  it('un fichier changé hors du plan ne la change pas', () => {
    const d = projet('empreinte-hors-plan');
    const plan = ctxDe(d, ['packages/forms']);
    const propre = empreinte(plan);
    ecrire(d, 'packages/binder/src/index.mjs', 'export const lie = 2;\n');
    ecrire(d, 'spec/mesure.md', '# La mesure, autrement\n');
    expect(empreinte(plan)).toBe(propre);
  });

  it('sur d’autres chemins, elle suit ces chemins : la copie entière voit ce que le plan ne voit pas', () => {
    const d = projet('empreinte-chemins');
    const plan = ctxDe(d, ['packages/forms']);
    const toute = empreinte(plan, ['.']);
    ecrire(d, 'spec/mesure.md', '# La mesure, autrement\n');
    expect(empreinte(plan, ['.'])).not.toBe(toute);
    expect(empreinte(plan, ['spec'])).not.toBe(empreinte(plan, ['packages/forms']));
  });
});
