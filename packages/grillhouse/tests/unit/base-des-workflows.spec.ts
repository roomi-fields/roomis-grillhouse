// The base of a pass in the workflows (scripts/base-des-workflows.mjs): a workflow that plays
// `verifier` gives it a base (`--base <commit>`) for a push alone. A pull request, the call of the
// workflow by the release (workflow_call), the nightly schedule and any run without a push event
// play the complete pass. The control reads the text of each workflow of `.github/workflows`.
//
// Small tests: the text of a workflow, without a repository or a process.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const DEPOT = path.resolve(__dirname, '../../../..');
const CONTROLE = path.resolve(__dirname, '../../scripts/base-des-workflows.mjs');

type Controle = {
  erreursDeBase: (texte: string) => string[];
  erreursDesWorkflows: (racine: string) => string[];
};
// Loaded at the start of the file, so that a control not yet written fails each test by its
// assertion, not the whole file by its load.
let controle: Controle;
beforeAll(async () => {
  try {
    controle = (await import(/* @vite-ignore */ CONTROLE)) as Controle;
  } catch {
    const absent = () => {
      throw new Error('scripts/base-des-workflows.mjs ne se charge pas');
    };
    controle = { erreursDeBase: absent, erreursDesWorkflows: absent };
  }
});
const erreursDeBase = (texte: string) => controle.erreursDeBase(texte);
const erreursDesWorkflows = (racine: string) => controle.erreursDesWorkflows(racine);

const CHECKOUT = '      - uses: actions/checkout@v5\n        with:\n          fetch-depth: 0\n';
// A workflow of triggers <on> whose step <etape> plays verifier.
const flux = (on: string, etape: string) =>
  `name: CI\non:\n${on}\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n${CHECKOUT}${etape}`;
const PUSH = '  push:\n    branches: [main]\n';

const SANS_CONDITION = '      - run: npm run verifier -- --base ${{ github.event.before }}\n';
const SOUS_PUSH =
  "      - if: github.event_name == 'push' && github.event.before != ''\n" +
  '        run: npm run verifier -- --base ${{ github.event.before }}\n';
const SANS_BASE = '      - run: npm run verifier\n';

describe('the control of the base in the workflows', () => {
  it('refuses a base given without a condition on a push', () => {
    expect(erreursDeBase(flux(PUSH, SANS_CONDITION)).length).toBeGreaterThan(0);
  });

  it('refuses a base given under a schedule trigger', () => {
    const on = "  schedule:\n    - cron: '0 2 * * *'\n";
    expect(erreursDeBase(flux(on, SANS_CONDITION)).length).toBeGreaterThan(0);
  });

  it('refuses a base given under a pull request trigger', () => {
    const on = '  pull_request:\n    branches: [main]\n';
    expect(erreursDeBase(flux(on, SANS_CONDITION)).length).toBeGreaterThan(0);
  });

  it('refuses a base given under a workflow_call trigger', () => {
    const on = '  workflow_call:\n';
    expect(erreursDeBase(flux(on, SANS_CONDITION)).length).toBeGreaterThan(0);
  });

  it('refuses a base given under every trigger of the CI, without a condition', () => {
    const on = `${PUSH}  pull_request:\n  schedule:\n    - cron: '0 2 * * *'\n  workflow_call:\n`;
    expect(erreursDeBase(flux(on, SANS_CONDITION)).length).toBeGreaterThan(0);
  });

  it('refuses a base whose condition is not on a push', () => {
    const etape =
      "      - if: github.event_name == 'pull_request'\n" +
      '        run: npm run verifier -- --base ${{ github.event.before }}\n';
    expect(erreursDeBase(flux(PUSH, etape)).length).toBeGreaterThan(0);
  });

  it('accepts a base conditioned on a push', () => {
    expect(erreursDeBase(flux(PUSH, SOUS_PUSH))).toEqual([]);
  });

  it('accepts a base conditioned on a push among the other triggers of the CI', () => {
    const on = `${PUSH}  pull_request:\n  schedule:\n    - cron: '0 2 * * *'\n  workflow_call:\n`;
    expect(erreursDeBase(flux(on, SOUS_PUSH))).toEqual([]);
  });

  it('accepts a base whose push condition lies in the line itself', () => {
    const etape =
      "      - run: npm run verifier ${{ github.event_name == 'push' && github.event.before != '' && format('--base {0}', github.event.before) || '' }}\n";
    expect(erreursDeBase(flux(PUSH, etape))).toEqual([]);
  });

  it('accepts a workflow that plays verifier without a base', () => {
    const on = `${PUSH}  pull_request:\n`;
    expect(erreursDeBase(flux(on, SANS_BASE))).toEqual([]);
  });

  it('accepts a workflow that does not play verifier', () => {
    expect(erreursDeBase(flux(PUSH, '      - run: npm run build\n'))).toEqual([]);
  });
});

describe('the workflows of the repository', () => {
  it('give a base to verifier for a push alone', () => {
    expect(erreursDesWorkflows(DEPOT)).toEqual([]);
  });
});

type Etape = { run?: string; if?: string; with?: Record<string, unknown>; uses?: string };
type Flux = { jobs: Record<string, { steps?: Etape[] }> };

// The tranches of the verification are the jobs of the CI that a base measures: the tests.
describe('the CI of Grillhouse', () => {
  const texte = readFileSync(path.join(DEPOT, '.github/workflows/ci.yml'), 'utf8');
  const etapes = (parse(texte) as Flux).jobs.tranches.steps ?? [];

  it('fetches the whole history, which a base of the lot needs', () => {
    const co = etapes.find(e => e.uses?.startsWith('actions/checkout'));
    expect(co?.with?.['fetch-depth']).toBe(0);
  });

  it('measures a push against the commit before it, github.event.before', () => {
    const avec = etapes.filter(e => /--base/.test(e.run ?? '') || /--base/.test(e.if ?? ''));
    expect(avec.length).toBeGreaterThan(0);
    expect(avec.map(e => `${e.if ?? ''}\n${e.run ?? ''}`).join('\n')).toContain(
      'github.event.before'
    );
  });

  it('passes the base only when the event is a push and the commit before it is not empty', () => {
    const avec = etapes.filter(e => /--base/.test(e.run ?? '') || /--base/.test(e.if ?? ''));
    for (const e of avec) {
      const t = `${e.if ?? ''}\n${e.run ?? ''}`;
      expect(t).toMatch(/github\.event_name\s*==\s*'push'/);
      expect(t).toMatch(/github\.event\.before\s*!=\s*''/);
    }
    expect(erreursDeBase(texte)).toEqual([]);
  });

  it('plays verifier without a base for every other event', () => {
    const sans = etapes.filter(
      e => /^npm run verifier( |$)/.test((e.run ?? '').trim()) && !/--base/.test(e.run ?? '')
    );
    expect(sans.length).toBeGreaterThan(0);
    for (const e of sans) {
      expect(e.if ?? '').not.toMatch(/--base/);
      expect(e.if ?? '').toMatch(/github\.event_name\s*!=\s*'push'/);
    }
  });
});
