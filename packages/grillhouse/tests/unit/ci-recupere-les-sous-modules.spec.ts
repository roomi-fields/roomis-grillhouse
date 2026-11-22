// The workflows of the frame's template (templates/projet/.github/workflows) fetch the project's
// submodules at each checkout, as the frame reads them on the poste (`grillhouse.partage`): a
// private one by the repository's secret SOUS_MODULES, else by the workflow's own token.
//
// Small tests: the text of each workflow, without a repository or a process.
//
// @lit .github/workflows/** templates/projet/.github/workflows/**
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const FLUX = path.resolve(__dirname, '../../../../templates/projet/.github/workflows');

interface Etape {
  uses?: string;
  with?: Record<string, unknown>;
}
const recuperations = (nom: string): Etape[] => {
  const flux = parse(readFileSync(path.join(FLUX, nom), 'utf8')) as {
    jobs: Record<string, { steps?: Etape[] }>;
  };
  return Object.values(flux.jobs)
    .flatMap(j => j.steps ?? [])
    .filter(e => (e.uses ?? '').startsWith('actions/checkout@'));
};

describe.each(['ci.yml', 'nuit.yml'])('%s du gabarit récupère les sous-modules', nom => {
  it('each checkout takes the submodules, recursively', () => {
    const etapes = recuperations(nom);
    expect(etapes.length).toBeGreaterThan(0);
    for (const e of etapes) {
      expect(e.with?.submodules).toBe('recursive');
    }
  });

  it('a private submodule is read by the secret SOUS_MODULES, else the token of the workflow', () => {
    for (const e of recuperations(nom)) {
      expect(e.with?.token).toBe('${{ secrets.SOUS_MODULES || github.token }}');
    }
  });
});
