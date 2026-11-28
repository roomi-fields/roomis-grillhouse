// A role session commits nothing: it receives no line of attribution of commit or pull request,
// whatever the settings of the project say. It receives the output style the machine's user chooses
// (<home>/.claude/settings.json), unless the project chooses one (docs/architecture/machine.md,
// §3.2).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { optionsDuRole, ROLES } from '../../scripts/droits.mjs';

const DEPOT = path.resolve(__dirname, '../../../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'droits-attribution-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// A project whose settings and local settings choose their own lines of attribution.
const PROJET = path.join(ESSAIS, 'projet');
mkdirSync(path.join(PROJET, '.claude'), { recursive: true });
for (const f of ['settings.json', 'settings.local.json']) {
  writeFileSync(
    path.join(PROJET, '.claude', f),
    JSON.stringify({ attribution: { commit: 'Co-Authored-By: x', pr: 'Made by x' } })
  );
}

const reglages = (role: string, racine: string) => {
  const o = optionsDuRole(role, {
    racine,
    copie: DEPOT,
    ticket: 'demo-1',
    home: path.join(ESSAIS, 'vide'),
  });
  return JSON.parse(o[o.indexOf('--settings') + 1]) as Record<string, unknown>;
};

describe('a role session receives no line of attribution of commit or pull request', () => {
  it.each(Object.keys(ROLES))('%s: the settings of the session empty both lines', role => {
    expect(reglages(role, DEPOT).attribution).toEqual({ commit: '', pr: '' });
  });

  it.each(Object.keys(ROLES))(
    '%s: the lines the settings of the project choose give way to the command line',
    role => {
      expect(reglages(role, PROJET).attribution).toEqual({ commit: '', pr: '' });
    }
  );

  it.each(Object.keys(ROLES))('%s: the git instructions of Claude Code stay untouched', role => {
    expect(reglages(role, PROJET)).not.toHaveProperty('includeGitInstructions');
  });
});

let essai = 0;
const dossier = (nom: string) => path.join(ESSAIS, `${++essai}-${nom}`);
const ecrireReglages = (base: string, fichier: string, contenu: string) => {
  mkdirSync(path.join(base, '.claude'), { recursive: true });
  writeFileSync(path.join(base, '.claude', fichier), contenu);
};
const choisir = (style: string) => JSON.stringify({ outputStyle: style });

// A session in a copy distinct from the main tree, on a machine whose user settings hold `poste`
// (no file when absent).
const session = (poste?: string) => {
  const racine = dossier('arbre');
  const copie = dossier('copie');
  const home = dossier('home');
  for (const d of [racine, copie]) {
    mkdirSync(d, { recursive: true });
    writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 'p' }));
    declarerLesLangages(d);
  }
  mkdirSync(home, { recursive: true });
  if (poste !== undefined) {
    ecrireReglages(home, 'settings.json', poste);
  }
  const lire = (role: string) => {
    const o = optionsDuRole(role, { racine, copie, ticket: 'demo-1', home });
    return JSON.parse(o[o.indexOf('--settings') + 1]) as Record<string, unknown>;
  };
  return { racine, copie, home, lire };
};

describe('a role session receives the output style the user of the machine chooses', () => {
  it.each(Object.keys(ROLES))('%s: the settings of the session carry that style', role => {
    expect(session(choisir('Concise')).lire(role).outputStyle).toBe('Concise');
  });

  it('the style carried is the one chosen, whatever its name', () => {
    expect(session(choisir('Explanatory')).lire('questionneur').outputStyle).toBe('Explanatory');
  });

  it('the style is read beside the other settings of the user, which stay out', () => {
    const poste = JSON.stringify({ outputStyle: 'Concise', model: 'x', env: { A: '1' } });
    const r = session(poste).lire('developpeur');
    expect(r.outputStyle).toBe('Concise');
    expect(r).not.toHaveProperty('model');
    expect(r.env).not.toHaveProperty('A');
  });

  it('project files that choose no style leave the style of the machine', () => {
    const s = session(choisir('Concise'));
    ecrireReglages(s.copie, 'settings.json', JSON.stringify({ permissions: {} }));
    ecrireReglages(s.copie, 'settings.local.json', JSON.stringify({}));
    ecrireReglages(s.racine, 'settings.local.json', JSON.stringify({}));
    expect(s.lire('relecteur').outputStyle).toBe('Concise');
  });

  it('the settings.json of the main tree, which a session in a copy does not read, leaves the style of the machine', () => {
    const s = session(choisir('Concise'));
    ecrireReglages(s.racine, 'settings.json', choisir('Explanatory'));
    expect(s.lire('testwriter').outputStyle).toBe('Concise');
  });

  it.each(Object.keys(ROLES))(
    '%s: the style adds itself to the settings and changes no other',
    role => {
      const s = session();
      const sans = s.lire(role);
      ecrireReglages(s.home, 'settings.json', choisir('Concise'));
      expect(s.lire(role)).toEqual({ ...sans, outputStyle: 'Concise' });
    }
  );
});

describe('a role session carries no output style when the user of the machine chooses none', () => {
  it.each(Object.keys(ROLES))('%s: no settings file of the user', role => {
    expect(session().lire(role)).not.toHaveProperty('outputStyle');
  });

  it.each([
    ['settings without a style', JSON.stringify({ model: 'x' })],
    ['settings that cannot be read as JSON', '{ not json'],
  ])('%s', (_cas, poste) => {
    expect(session(poste).lire('developpeur')).not.toHaveProperty('outputStyle');
  });
});

describe('a style the project chooses is not overridden from the command line', () => {
  const FICHIERS = [
    ['settings.json of the copy', 'copie', 'settings.json'],
    ['settings.local.json of the main tree', 'racine', 'settings.local.json'],
    ['settings.local.json of the copy', 'copie', 'settings.local.json'],
  ] as const;

  describe.each(FICHIERS)('chosen in the %s', (_nom, base, fichier) => {
    it.each(Object.keys(ROLES))('%s: no style when the machine chooses one', role => {
      const s = session(choisir('Concise'));
      ecrireReglages(s[base], fichier, choisir('Explanatory'));
      expect(s.lire(role)).not.toHaveProperty('outputStyle');
    });

    it('no style when the machine chooses none', () => {
      const s = session();
      ecrireReglages(s[base], fichier, choisir('Explanatory'));
      expect(s.lire('developpeur')).not.toHaveProperty('outputStyle');
    });
  });
});
