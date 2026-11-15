/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
// `grillhouse maj` pose la clé `issue-prefix` de `.beads/config.yaml` quand aucune clé active n'y est
// (absente, commentée ou vide), avec la valeur que le store de Beads donne (`bd config get
// issue_prefix`, par l'option `bd(args, cwd)`), et `prefixe(projet)` la lit ensuite. Sans valeur du
// store, elle n'écrit rien et le bilan dit `prefixe: { manque: true }`.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { afterAll, describe, expect, it } from 'vitest';
import { mettreAJour, rapport } from '../../scripts/grillhouse-maj.mjs';
import { prefixe, prefixeDuStore } from '../../scripts/prefixe-des-tickets.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'grillhouse-maj-prefixe-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const DEPOT = path.resolve(__dirname, '../../../..');
const CONFIG = '.beads/config.yaml';

const COMMENTEE = `# Issue prefix for this repository (used by bd init)
# issue-prefix: ""
`;

// Un projet de TypeScript dont `.beads/config.yaml` vaut <config> (aucun fichier quand null).
function projet(nom: string, config: string | null) {
  const racine = path.join(ESSAIS, nom);
  mkdirSync(racine, { recursive: true });
  writeFileSync(path.join(racine, 'package.json'), `${JSON.stringify({ name: nom })}\n`);
  declarerLesLangages(racine);
  if (config !== null) {
    mkdirSync(path.join(racine, '.beads'), { recursive: true });
    writeFileSync(path.join(racine, CONFIG), config);
  }
  return racine;
}

type Sortie = { status: number | null; stdout: string; stderr: string };
// Un Beads de substitution dont `config get issue_prefix` rend <sortie>.
const beadsQui = (sortie: Sortie) => {
  const appels: string[][] = [];
  const bd = (args: string[]) => {
    appels.push(args);
    if (args[0] === 'config' && args[1] === 'get' && args[2] === 'issue_prefix') {
      return sortie;
    }
    return { status: 0, stdout: '', stderr: '' };
  };
  return { bd, appels };
};
const valeur = (v: string) => beadsQui({ status: 0, stdout: `${v}\n`, stderr: '' });

describe('la valeur du store de Beads, lue par une seule fonction', () => {
  it('rend la valeur du store, sans son retour à la ligne', () => {
    const racine = projet('store-valeur', COMMENTEE);
    const { bd, appels } = valeur('SH');
    expect(prefixeDuStore(racine, bd)).toBe('SH');
    expect(appels).toContainEqual(['config', 'get', 'issue_prefix']);
  });

  it('rend la chaîne vide pour une valeur vide, un échec ou un espace réservé', () => {
    const racine = projet('store-vide', COMMENTEE);
    expect(prefixeDuStore(racine, valeur('').bd)).toBe('');
    expect(prefixeDuStore(racine, beadsQui({ status: 1, stdout: 'SH\n', stderr: 'boom' }).bd)).toBe(
      ''
    );
    expect(prefixeDuStore(racine, valeur('issue_prefix (not set in config.yaml)').bd)).toBe('');
  });
});

describe('la montée pose issue-prefix quand aucune clé active n existe', () => {
  it('une clé commentée devient la clé active, et prefixe() rend la valeur du store', () => {
    const racine = projet('commentee', COMMENTEE);
    const b = mettreAJour(racine, DEPOT, { bd: valeur('OSD').bd });
    expect(readFileSync(path.join(racine, CONFIG), 'utf8')).toContain('issue-prefix: "OSD"');
    expect(prefixe(racine)).toBe('OSD');
    expect(b.prefixe).toEqual({ pose: 'issue-prefix: "OSD"' });
  });

  it('une clé absente est ajoutée, une clé écrite vide est remplacée', () => {
    const absente = projet('absente', '');
    mettreAJour(absente, DEPOT, { bd: valeur('OB').bd });
    expect(prefixe(absente)).toBe('OB');
    const vide = projet('vide', 'issue-prefix: ""\nautre: 1\n');
    mettreAJour(vide, DEPOT, { bd: valeur('SH').bd });
    expect(prefixe(vide)).toBe('SH');
    expect(readFileSync(path.join(vide, CONFIG), 'utf8')).toContain('autre: 1');
  });

  it('deux montées de suite donnent le même fichier, la seconde sans rien poser', () => {
    const racine = projet('deux-fois', COMMENTEE);
    mettreAJour(racine, DEPOT, { bd: valeur('SH').bd });
    const premier = readFileSync(path.join(racine, CONFIG), 'utf8');
    const b = mettreAJour(racine, DEPOT, { bd: valeur('SH').bd });
    expect(readFileSync(path.join(racine, CONFIG), 'utf8')).toBe(premier);
    expect(b.prefixe).toBeUndefined();
  });

  it('une clé déjà active reste intacte, même si le store dit autre chose', () => {
    const contenu = '# début\nissue-prefix: "GH"   # le mien\n';
    const racine = projet('active', contenu);
    const b = mettreAJour(racine, DEPOT, { bd: valeur('XX').bd });
    expect(readFileSync(path.join(racine, CONFIG), 'utf8')).toBe(contenu);
    expect(b.prefixe).toBeUndefined();
  });

  it('un projet sans .beads/config.yaml reste sans, et ne demande rien à Beads pour le préfixe', () => {
    const racine = projet('sans-beads', null);
    const { bd, appels } = valeur('SH');
    const b = mettreAJour(racine, DEPOT, { bd });
    expect(() => readFileSync(path.join(racine, CONFIG))).toThrow();
    expect(b.prefixe).toBeUndefined();
    expect(appels.filter(a => a.includes('issue_prefix'))).toEqual([]);
  });
});

describe('la montée ne devine aucun préfixe', () => {
  it.each([
    ['une valeur vide', { status: 0, stdout: '\n', stderr: '' }],
    ['un échec de bd', { status: 1, stdout: '', stderr: 'boom' }],
    ['un espace réservé', { status: 0, stdout: 'issue_prefix (not set)\n', stderr: '' }],
  ])('%s : aucune clé écrite, le bilan dit que le préfixe manque', (_nom, sortie) => {
    const racine = projet(`manque-${_nom.replace(/\W/g, '')}`, COMMENTEE);
    const b = mettreAJour(racine, DEPOT, { bd: beadsQui(sortie).bd });
    expect(readFileSync(path.join(racine, CONFIG), 'utf8')).toBe(COMMENTEE);
    expect(b.prefixe).toEqual({ manque: true });
    expect(() => prefixe(racine)).toThrow(/issue-prefix/);
  });
});

describe('le rapport de la montée dit la clé posée', () => {
  it('une clé posée donne une ligne qui dit la clé et sa valeur', () => {
    const racine = projet('rapport-pose', COMMENTEE);
    const b = mettreAJour(racine, DEPOT, { bd: valeur('OSD').bd });
    const ligne = rapport(b)
      .split('\n')
      .find(l => l.includes('issue-prefix'));
    expect(ligne).toBeDefined();
    expect(ligne).toContain('OSD');
  });

  it('une clé déjà active ne donne aucune ligne sur issue-prefix', () => {
    const racine = projet('rapport-active', 'issue-prefix: "GH"\n');
    const b = mettreAJour(racine, DEPOT, { bd: valeur('GH').bd });
    expect(rapport(b)).not.toContain('issue-prefix');
  });
});
