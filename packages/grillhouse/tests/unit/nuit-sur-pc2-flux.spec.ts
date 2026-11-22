// Le flux de nuit du dépôt (.github/workflows/nuit.yml) joue sur PC2, la nuit, dans le créneau que le
// responsable a fixé (01:45 → 03:45 heure de Paris, les planifications étant en UTC), partage avec
// la CI de jour (ci.yml) un groupe de concurrence sans annulation de l'attente, et pose lui-même ce
// que les tests exigent quand l'exécuteur ne l'a pas : le programme temporal (version fixée, somme
// de contrôle vérifiée par la commande du cadre), la commande claude à la version de ci.yml, uv.
// Le gabarit de projet déclare le même groupe dans son ci.yml et son nuit.yml, et joue sa nuit sans
// l'équipement d'une machine (`--sans-equipement`), son exécuteur par défaut étant celui de GitHub.
//
// Petits tests : le texte des flux, lu.
//
// @lit .github/workflows/** templates/projet/.github/workflows/**
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const DEPOT = path.resolve(__dirname, '../../../..');
type Etape = { name?: string; if?: string; run?: string; uses?: string };
type Job = { 'runs-on': unknown; steps: Etape[] };
type Flux = {
  on: { schedule?: { cron: string }[] };
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean };
  jobs: Record<string, Job>;
};
const lire = (f: string) => parse(readFileSync(path.join(DEPOT, f), 'utf8')) as Flux;
const nuit = lire('.github/workflows/nuit.yml');
const ci = lire('.github/workflows/ci.yml');
const nuitGabarit = lire('templates/projet/.github/workflows/nuit.yml');
const ciGabarit = lire('templates/projet/.github/workflows/ci.yml');
const etapes = (f: Flux) => Object.values(f.jobs).flatMap(j => j.steps);
const runs = (f: Flux) => etapes(f).map(e => e.run ?? '');

describe('le flux de nuit se joue dans le créneau de PC2', () => {
  it('se déclenche chaque nuit, entre 01:45 et 03:45 heure de Paris, été comme hiver', () => {
    const cron = nuit.on.schedule?.[0]?.cron ?? '';
    const [minute, heure, ...reste] = cron.split(' ');
    expect(reste).toEqual(['*', '*', '*']);
    const utc = Number(heure) * 60 + Number(minute);
    // Paris : UTC+1 l'hiver, UTC+2 l'été.
    for (const decalage of [60, 120]) {
      const paris = utc + decalage;
      expect(paris).toBeGreaterThanOrEqual(1 * 60 + 45);
      expect(paris).toBeLessThanOrEqual(3 * 60 + 45);
    }
  });
});

describe('la CI de jour et la nuit s’attendent sur PC2', () => {
  it.each([
    ['du dépôt', nuit, ci],
    ['du gabarit de projet', nuitGabarit, ciGabarit],
  ])('les flux %s déclarent le même groupe de concurrence', (_nom, n, c) => {
    expect(n.concurrency?.group).toBeTruthy();
    expect(n.concurrency?.group).toBe(c.concurrency?.group);
  });

  it.each([
    ['nuit.yml du dépôt', nuit],
    ['ci.yml du dépôt', ci],
    ['nuit.yml du gabarit', nuitGabarit],
    ['ci.yml du gabarit', ciGabarit],
  ])('%s n’annule pas l’attente : cancel-in-progress est faux', (_nom, f) => {
    expect(f.concurrency?.['cancel-in-progress']).toBe(false);
  });
});

describe('le flux de nuit pose ce que les tests exigent quand l’exécuteur ne l’a pas', () => {
  const pose = (outil: string) => etapes(nuit).find(e => new RegExp(outil).test(e.run ?? ''));

  it('pose le programme temporal par la commande du cadre, à sa version fixée et sa somme vérifiée, et l’exporte', () => {
    const e = pose('temporal installer');
    expect(e?.run).toContain('temporal installer --programme-seul');
    expect(e?.run).toContain('TEMPORAL');
    expect(e?.run).toContain('GITHUB_ENV');
    expect(e?.if ?? '').not.toContain('github-hosted');
  });

  it('pose la commande claude à la version de ci.yml, seulement quand elle manque', () => {
    const version = /@anthropic-ai\/claude-code@([\w.-]+)/.exec(runs(ci).join('\n'))?.[1];
    expect(version).toBeTruthy();
    const e = pose('anthropic-ai/claude-code');
    expect(e?.run).toContain(`@anthropic-ai/claude-code@${version}`);
    expect(e?.run).toMatch(/command -v claude/);
    expect(e?.if ?? '').not.toContain('github-hosted');
  });

  it('pose uv seulement quand il manque, sans droit d’administrateur', () => {
    const e = etapes(nuit).find(x => /\buv\b/.test(`${x.name ?? ''} ${x.uses ?? ''}`));
    expect(e).toBeDefined();
    expect(e?.if ?? '').not.toContain('github-hosted');
    const garde = `${e?.if ?? ''} ${e?.run ?? ''}`;
    expect(garde).toMatch(/command -v uv|hashFiles|uv --version/);
    expect(garde).not.toMatch(/\bsudo\b|apt(-get)? /);
  });

  it('ne pose aucun secret sur la machine', () => {
    const texte = readFileSync(path.join(DEPOT, '.github/workflows/nuit.yml'), 'utf8');
    expect(texte).not.toMatch(/secrets\./);
  });
});

describe('le gabarit de projet joue sa nuit sans l’équipement d’une machine', () => {
  it('joue tout sauf @poste et @equipee sur son exécuteur par défaut', () => {
    const tests = runs(nuitGabarit).filter(r => /tests-de-nuit/.test(r));
    expect(tests).toHaveLength(1);
    expect(tests[0]).toMatch(/--hors-du-poste --sans-equipement/);
  });
});
