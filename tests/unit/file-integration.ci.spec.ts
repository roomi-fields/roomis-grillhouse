import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { chantier, type Chantier } from './integration-essai.js';
import { LONG } from './file-integration-essai.js';

// The integration queue (scripts/integration/file.mjs): it judges the tests by their status
// (grillhouse-3uv.56), and reads the CI of the commit it pushes.
// The queue's interface is told in tests/unit/file-integration.spec.ts; the trial harness is
// ./integration-essai.ts, and the matter these files share ./file-integration-essai.ts.

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'file-integration-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// grillhouse-3uv.56 critères 11 and 21: a failed installation of the replay copy comes up in one
// form, the refusals of the replay module; the queue judges `npm run verifier`, the guards included, as
// integrer.mjs does, by its exit code. Guards that pass, whatever text they write, are green;
// guards that fail, whatever text they write, make the tests red.
const GARDES_BAVARDES = `import fs from 'node:fs';
fs.appendFileSync(process.env.PRINCIPAL + '.gardes', 'g');
process.stderr.write("Les dépendances de la copie ne s'installent pas.\\n");
process.exit(fs.existsSync('GARDE_ROUGE') ? 1 : 0);
`;
describe('grillhouse-3uv.56 critères 11 and 21 — the queue judges the tests by their status', () => {
  it(
    'critère 21: guards that pass (exit 0) while writing the text of an installation refusal let a replaced branch enter',
    () => {
      const m = chantier(ESSAIS);
      m.poser({ 'gardes.mjs': GARDES_BAVARDES }, 'gardes bavardes');
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.ticket('demo-2', { 'src/b/index.ts': 'export const b = 2;\n' });
      m.livrer('demo-1');
      m.livrer('demo-2');
      const gardes = m.gardes();
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.gardes().length).toBeGreaterThan(gardes.length);
      expect(m.sujets().slice(0, 2)).toEqual(['feat: lot (demo-2)', 'feat: lot (demo-1)']);
      expect(m.bd('demo-2').status).toBe('closed');
    },
    LONG
  );
  it(
    'critère 21: guards that fail while writing the text of an installation refusal take the branch out as red tests',
    () => {
      const m = chantier(ESSAIS);
      m.poser({ 'gardes.mjs': GARDES_BAVARDES }, 'gardes bavardes');
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.ticket('demo-2', { 'src/b/index.ts': 'export const b = 2;\n' });
      m.livrer('demo-1');
      m.livrer('demo-2');
      m.poser({ GARDE_ROUGE: '' }, 'garde rouge');
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets()[0]).toBe('garde rouge');
      const t = m.bd('demo-2');
      expect(t.status).toBe('open');
      const refus = t.comments.at(-1)!.text;
      expect(refus).toContain('ses tests sont rouges une fois la branche replacée.');
      expect(refus).not.toContain("Le verrou de la branche replacée ne s'installe pas.");
    },
    LONG
  );
});

// 2026-10-17 (grill, Q13): the queue reads the CI of the commit it pushes, as a merge queue waits
// for its checks; a red CI reopens the ticket. The CI is the fake gh of ./integration-essai.ts.
describe('the queue reads the CI of the commit it pushes', () => {
  const ci = (m: Chantier, scenario: Record<string, unknown>) =>
    writeFileSync(path.join(m.bin, 'gh.json'), JSON.stringify(scenario));
  const appelsGh = (m: Chantier) => {
    const f = path.join(m.bin, 'gh-appels');
    return existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n') : [];
  };
  const textes = (m: Chantier, id: string) => m.bd(id).comments.map(c => c.text);

  it(
    'a green CI leaves the ticket closed: the run of the pushed commit, then its watch',
    () => {
      const m = chantier(ESSAIS);
      ci(m, { runs: [{ databaseId: 41, status: 'queued', conclusion: '' }], watch: 0 });
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.livrer('demo-1');
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(appelsGh(m)).toEqual([
        `run list --commit ${m.sha('main')} --json databaseId,status,conclusion`,
        'run watch 41 --exit-status',
      ]);
      expect(r.stdout).toContain('verte (passage 41)');
      expect(m.bd('demo-1').status).toBe('closed');
      expect(textes(m, 'demo-1').join('\n')).not.toMatch(/CI rouge|CI non lue/);
    },
    LONG
  );

  it(
    'a red CI reopens the ticket, with the address of the run and the end of its failed log',
    () => {
      const m = chantier(ESSAIS);
      ci(m, {
        runs: [{ databaseId: 42, status: 'in_progress', conclusion: '' }],
        watch: 1,
        url: 'https://github.com/demo/demo/actions/runs/42',
        log: 'test\tUNIT\t✗ critère 3 — rouge sur la CI',
      });
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.livrer('demo-1');
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.bd('demo-1').status).toBe('open');
      const rouge = textes(m, 'demo-1').at(-1);
      expect(rouge).toContain('CI rouge');
      expect(rouge).toContain('https://github.com/demo/demo/actions/runs/42');
      expect(rouge).toContain('critère 3 — rouge sur la CI');
      expect(appelsGh(m)).toContain('run view 42 --log-failed');
    },
    LONG
  );

  it(
    'without a run found, the ticket is told the CI was not read, and stays closed',
    () => {
      const m = chantier(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.livrer('demo-1');
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.bd('demo-1').status).toBe('closed');
      const texte = textes(m, 'demo-1').at(-1);
      expect(texte).toContain('CI non lue');
      expect(texte).toContain('aucun passage de la CI');
      expect(appelsGh(m).filter(a => a.startsWith('run watch'))).toEqual([]);
    },
    LONG
  );
});
