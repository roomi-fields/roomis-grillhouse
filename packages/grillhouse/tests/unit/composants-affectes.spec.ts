import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import * as module from '../../scripts/composants-affectes.mjs';
import {
  cheminsLus,
  manquants,
  releve,
  texteDuReleve,
} from '../../scripts/composants-affectes.mjs';

// grillhouse-3uv.89, L6 — the components fixed at the opening. As the « affected components » of
// a design document (an RFC of Rust, a design doc of Chromium), the components a realisation
// ticket touches are found before its first session: for each element its section
// « Architecture » and its criteria name, its provider (the component whose interface publishes
// it) and its readers (the consumers its interface writes, the components whose code imports it,
// the tests of other components that name it and import the provider), with the components the
// ticket names itself. Witness: BPScript 320.3 (2026-10-20), where 040-checker, named in
// criterion 13 and read by a test of its own, and 020-loader joined the title on the way, each by
// a stop that went up to the supervisor.

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'composants-affectes-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const SCRIPT = path.resolve(__dirname, '../../scripts/composants-affectes.mjs');

function depot(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(ESSAIS, 'depot-'));
  // grillhouse-3dr.2.3: the project declares its language, which the survey asks.
  const racine = JSON.parse(files['package.json'] ?? '{"name":"essai","private":true}') as {
    grillhouse?: Record<string, unknown>;
  };
  racine.grillhouse = { langages: ['typescript'], ...(racine.grillhouse ?? {}) };
  files = { ...files, 'package.json': JSON.stringify(racine) };
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}

const paquet = (nom: string) => JSON.stringify({ name: nom, type: 'module' });

// The interface of `forms`: it publishes `duree` and `Level` in its generated part, and declares
// `checker` a consumer of `duree`.
const INTERFACE_FORMS = [
  '# 000-forms',
  '',
  'Forms rend les formes.',
  '',
  '## Consommateurs',
  '',
  '- `040-checker` : duree',
  '- `050-emitter` : Level',
  '',
  '<!-- généré: début -->',
  '### `duree`',
  '',
  'Rend une durée.',
  '',
  '### `Level`',
  '',
  'Un niveau.',
  '<!-- généré: fin -->',
  '',
].join('\n');

// A repository of five packages: forms provides; binder imports `duree` in its code; checker is
// the consumer forms' interface writes; emitter's test names `duree` and imports forms; driver's
// test names `duree` without importing forms.
const DEPOT = {
  'package.json': JSON.stringify({ name: 'essai', private: true, workspaces: ['packages/*'] }),
  'packages/forms/package.json': paquet('000-forms'),
  'packages/forms/src/index.ts': 'export const duree = 1;\nexport type Level = { n: number };\n',
  'packages/forms/docs/INTERFACE.md': INTERFACE_FORMS,
  'packages/forms/test/duree.test.ts': "import { duree } from '../src/index.js';\nduree;\n",
  'packages/binder/package.json': paquet('030-binder'),
  'packages/binder/src/index.ts': "import { duree } from '000-forms';\nexport const b = duree;\n",
  'packages/checker/package.json': paquet('040-checker'),
  'packages/checker/src/index.ts': 'export const c = 1;\n',
  'packages/emitter/package.json': paquet('050-emitter'),
  'packages/emitter/src/index.ts': 'export const e = 1;\n',
  'packages/emitter/test/duree.test.ts':
    "import * as f from '000-forms';\nit('lit duree', () => f.duree);\n",
  'packages/driver/package.json': paquet('900-driver'),
  'packages/driver/src/index.ts': 'export const d = 1;\n',
  'packages/driver/test/duree.test.ts': "it('sa propre duree', () => { const duree = 2; });\n",
};

const description = (architecture: string, criteres: string, avant = '') =>
  [
    avant,
    '## Architecture',
    '',
    architecture,
    '',
    "## Critères d'acceptation",
    '',
    criteres,
    '',
  ].join('\n');

describe('the survey of the components a ticket touches', () => {
  it('gives for a published element its provider, then each reader with what makes it one', () => {
    const r = releve(depot(DEPOT), description('`duree` sort.', '1. Plus de `duree`.'));
    expect(r.elements).toEqual([
      {
        nom: 'duree',
        fournisseur: '000-forms',
        lecteurs: [
          { composant: '030-binder', par: ['import'] },
          { composant: '040-checker', par: ['consommateurs'] },
          { composant: '050-emitter', par: ['packages/emitter/test/duree.test.ts'] },
        ],
      },
    ]);
    // driver's test names a `duree` of its own: it imports nothing of forms.
    expect(r.composants).not.toContain('900-driver');
    expect(r.composants).toEqual(['000-forms', '030-binder', '040-checker', '050-emitter']);
  });

  it('reads the elements of the Architecture and of the criteria only, a call or a member by its head', () => {
    const r = releve(
      depot(DEPOT),
      description(
        '`Level.declared` reste.',
        '1. `duree()` aussi.',
        '## Provenance\n\n`autre`, 900-driver.\n'
      )
    );
    expect((r.elements as { nom: string }[]).map(e => e.nom)).toEqual(['Level', 'duree']);
    expect(r.nommes).toEqual([]);
  });

  it('takes a component the ticket names, by its package name in plain text or a path of it', () => {
    const r = releve(
      depot(DEPOT),
      description(
        'Le fichier `packages/binder/src/index.ts` change.',
        '13. Chaque lecteur est relevé : 040-checker, et 050-emitter.'
      )
    );
    expect(r.nommes).toEqual(['030-binder', '040-checker', '050-emitter']);
    expect(r.composants).toEqual(['030-binder', '040-checker', '050-emitter']);
  });

  it('sets apart a symbol of the repository no interface publishes', () => {
    const r = releve(depot(DEPOT), description('`b` dit qui lie.', '1. `c` reste.'));
    expect(r.elements).toEqual([]);
    expect(r.sansFournisseur).toEqual(['b', 'c']);
    expect(r.composants).toEqual([]);
  });

  // grillhouse-3uv.92.8, criterion 3 — in BPScript 320.4, `zx`, `v`, `a`, the new faults
  // `CHECK_MEMBER_RETYPED` and `CHECK_RANGE_WIDENED` were listed « sans interface qui les
  // publie » beside real names: words of the ticket (an example of a scene, a fault to create),
  // which name no symbol of the repository and no path of it.
  it('leaves out a word of the ticket that names no symbol nor path of the repository', () => {
    const r = releve(
      depot({ ...DEPOT, 'libraries/alphabets.bpsl': 'sound piano\n' }),
      description(
        '`def zx(integer? v)` puis `zx`, `v`, `CHECK_MEMBER_RETYPED` ; `b` reste ; `libraries`.',
        '1. `actors` et `members` se refusent.'
      )
    );
    expect(r.sansFournisseur).toEqual(['b', 'libraries']);
    expect(texteDuReleve(r)).toContain('- Sans interface qui les publie : `b`, `libraries`.');
  });

  // grillhouse-3uv.92.8, criterion 1 — in BPScript 320.4, 995-tools, whose `grillhouse.lit`
  // declares `libraries`, was not found while the ticket changed `libraries/alphabets.bpsl`. As
  // the `data` of Bazel, a package that declares it reads a path is a reader of that path.
  it('finds as a reader a package whose grillhouse.lit covers a path the ticket changes', () => {
    const racine = depot({
      ...DEPOT,
      'libraries/alphabets.bpsl': 'sound piano\n',
      'libraries/autres.bpsl': 'x\n',
      'spec/LANGUAGE.md': '# Langage\n',
      'packages/tools/package.json': JSON.stringify({
        name: '995-tools',
        type: 'module',
        grillhouse: { lit: ['package.json', 'libraries'] },
      }),
      // corpus reads a folder of forms the ticket names by its component.
      'packages/corpus/package.json': JSON.stringify({
        name: '990-corpus',
        type: 'module',
        grillhouse: { lit: ['packages/forms/trace'] },
      }),
      // ranker reads a path the ticket does not change.
      'packages/ranker/package.json': JSON.stringify({
        name: '090-ranker',
        type: 'module',
        grillhouse: { lit: ['spec/autre'] },
      }),
    });
    const r = releve(
      racine,
      description(
        'Documents touchés : libraries/alphabets.bpsl:46-49, spec/LANGUAGE.md ; `fusion.ts:14`.',
        '1. 000-forms garde ses formes.'
      )
    );
    expect(r.lit).toEqual([
      { composant: '990-corpus', par: ['lit packages/forms/trace (packages/forms)'] },
      { composant: '995-tools', par: ['lit libraries (libraries/alphabets.bpsl)'] },
    ]);
    expect(r.composants).toEqual(['000-forms', '990-corpus', '995-tools']);
    expect(texteDuReleve(r)).toContain(
      '- Par les chemins lus (`grillhouse.lit`) : 990-corpus (lit packages/forms/trace (packages/forms)), 995-tools (lit libraries (libraries/alphabets.bpsl)).'
    );
  });

  it('puts the provider before its readers, by the imports between them', () => {
    const r = releve(
      depot({
        ...DEPOT,
        // The provider's name sorts after its reader's: the order follows the import.
        'packages/forms/package.json': paquet('zz-forms'),
        'packages/binder/src/index.ts':
          "import { duree } from 'zz-forms';\nexport const b = duree;\n",
        'packages/emitter/test/duree.test.ts': "import { duree } from 'zz-forms';\nduree;\n",
      }),
      description('`duree` sort.', '1. 030-binder suit.')
    );
    expect(r.composants[0]).toBe('zz-forms');
  });

  it('names the components the title misses, a path, a package name or `.` covering them', () => {
    const racine = depot(DEPOT);
    const r = releve(racine, description('`duree` sort.', '1. Plus de `duree`.'));
    expect(manquants(racine, r, ['000-forms', 'packages/binder'])).toEqual([
      '040-checker',
      '050-emitter',
    ]);
    expect(manquants(racine, r, ['packages'])).toEqual([]);
    expect(manquants(racine, r, ['.'])).toEqual([]);
  });

  it('writes the survey for the Architecture section: the title list, then each element and its readers', () => {
    const r = releve(
      depot(DEPOT),
      description('`duree` sort ; `b` aussi.', '1. 040-checker garde sa lecture.')
    );
    const t = texteDuReleve(r);
    expect(t.split('\n')[0]).toBe(
      '**Composants relevés** : 000-forms, 030-binder, 040-checker, 050-emitter.'
    );
    expect(t).toContain(
      '- `duree` : fourni par 000-forms ; lu par 030-binder (import), 040-checker (consommateurs), 050-emitter (packages/emitter/test/duree.test.ts).'
    );
    expect(t).toContain('- Nommés au ticket : 040-checker.');
    expect(t).toContain('- Sans interface qui les publie : `b`.');
  });

  it('runs as a command on a draft description, its survey on the standard output', () => {
    const racine = depot(DEPOT);
    writeFileSync(path.join(racine, 'brouillon.md'), description('`duree` sort.', '1. Rien.'));
    const r = spawnSync('node', [SCRIPT, '--description', 'brouillon.md'], {
      cwd: racine,
      encoding: 'utf8',
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(
      '**Composants relevés** : 000-forms, 030-binder, 040-checker, 050-emitter.'
    );
  });

  // grillhouse-3uv.95.5: the circuit plays the survey no more; the explorateur reads it when it
  // writes the plan, whose packages name the components: no admission out of the title, no record.
  it('is the explorateur’s tool alone: no check of the title for the circuit, no admission', () => {
    for (const nom of ['verifierLeTitre', 'admettre']) {
      expect(module, nom).not.toHaveProperty(nom);
    }
    expect(readFileSync(SCRIPT, 'utf8')).not.toContain('--admettre');
  });
});

describe('grillhouse-3uv.89 — cheminsLus : ce que le package.json d’un paquet déclare que ses tests lisent', () => {
  const dir = mkdtempSync(path.join(ESSAIS, 'paquet-'));
  const manifeste = (o: unknown) =>
    writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify(o)}\n`);

  it('rend son grillhouse.lit et le lit de chacune de ses traces, chacun depuis la racine', () => {
    manifeste({
      name: 'a',
      grillhouse: {
        lit: ['packages/b/test', 'spec'],
        traces: { 'trace:x': { lit: ['packages/c/donnees'], ecrit: 'packages/a/trace/x' } },
      },
    });
    expect(cheminsLus(dir)).toEqual(['packages/b/test', 'spec', 'packages/c/donnees']);
  });

  it('ne rend rien sans déclaration, ni sans package.json', () => {
    manifeste({ name: 'a' });
    expect(cheminsLus(dir)).toEqual([]);
    expect(cheminsLus(path.join(dir, 'absent'))).toEqual([]);
  });
});
