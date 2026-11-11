// The remote cache of Turborepo shared between the CI and the poste (docs/ARCHITECTURE.md, « Le
// cache distant de Turborepo »): the CI of Grillhouse and the template's take the server, its
// token and the key of its signature from the repository's variables and secrets; a push to main
// or to a branch agent/** writes it, every other run reads it alone, and a repository without
// the variable keeps the runner's local cache. No step of the workflows touches the cache, and
// the root's turbo.json signs what it writes.
//
// Small tests: the text of the workflows and of turbo.json, read; the expression of TURBO_CACHE
// evaluated by a reading of GitHub's operators on the cases of the events.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const DEPOT = path.resolve(__dirname, '../../../..');

type Flux = {
  env?: Record<string, unknown>;
  jobs: Record<string, { steps?: { uses?: string; run?: string }[] }>;
};
const lire = (f: string) => parse(readFileSync(path.join(DEPOT, f), 'utf8')) as Flux;

const FLUX = [
  ['the CI of Grillhouse', '.github/workflows/ci.yml'],
  ['the CI of the project template', 'templates/projet/.github/workflows/ci.yml'],
] as const;

// What TURBO_CACHE gives for a run: its event, its ref, and the variable TURBO_API. The expression
// is evaluated as GitHub does (docs.github.com, « Evaluate expressions in workflows and actions »):
// `!` before `==`, before `&&`, before `||`, each of `&&` and `||` giving one of its operands; the
// subset the workflows use (strings, the three contexts, `startsWith`, parentheses).
function cacheDe(expression: string, o: { evenement: string; ref: string; api: string }): unknown {
  const corps = /^\$\{\{\s*([\s\S]*?)\s*\}\}$/.exec(expression)?.[1];
  if (corps === undefined) {
    throw new Error(`pas une expression : ${expression}`);
  }
  const contextes: Record<string, string> = {
    'vars.TURBO_API': o.api,
    'github.event_name': o.evenement,
    'github.ref': o.ref,
  };
  const jetons = corps.match(/'[^']*'|==|&&|\|\||[!(),]|[A-Za-z_][\w.]*/g) ?? [];
  let i = 0;
  const voir = () => jetons[i];
  const prendre = (attendu?: string) => {
    const j = jetons[i++];
    if (attendu !== undefined && j !== attendu) {
      throw new Error(`attendu ${attendu}, lu ${j}`);
    }
    return j;
  };
  const vrai = (v: unknown) => v !== '' && v !== false;
  const primaire = (): unknown => {
    const j = prendre();
    if (j === '(') {
      const v = ou();
      prendre(')');
      return v;
    }
    if (j === '!') {
      return !vrai(primaire());
    }
    if (j.startsWith("'")) {
      return j.slice(1, -1);
    }
    if (j === 'startsWith') {
      prendre('(');
      const a = String(ou());
      prendre(',');
      const b = String(ou());
      prendre(')');
      return a.startsWith(b);
    }
    if (Object.hasOwn(contextes, j)) {
      return contextes[j];
    }
    throw new Error(`jeton inconnu : ${j}`);
  };
  const egal = (): unknown => {
    let v = primaire();
    while (voir() === '==') {
      prendre();
      v = v === primaire();
    }
    return v;
  };
  const et = (): unknown => {
    let v = egal();
    while (voir() === '&&') {
      prendre();
      const d = egal();
      v = vrai(v) ? d : v;
    }
    return v;
  };
  const ou = (): unknown => {
    let v = et();
    while (voir() === '||') {
      prendre();
      const d = et();
      v = vrai(v) ? v : d;
    }
    return v;
  };
  const v = ou();
  expect(i, `fin de l'expression : ${corps}`).toBe(jetons.length);
  return v;
}

describe.each(FLUX)('%s takes the remote cache of Turborepo from the repository', (_, f) => {
  const flux = lire(f);
  const env = flux.env ?? {};

  it('takes the server and its team from the variables, the token and the key from the secrets', () => {
    expect(env.TURBO_API).toBe('${{ vars.TURBO_API }}');
    expect(env.TURBO_TEAM).toBe('${{ vars.TURBO_TEAM }}');
    expect(env.TURBO_TOKEN).toBe('${{ secrets.TURBO_TOKEN }}');
    expect(env.TURBO_REMOTE_CACHE_SIGNATURE_KEY).toBe(
      '${{ secrets.TURBO_REMOTE_CACHE_SIGNATURE_KEY }}'
    );
  });

  it('writes the cache on a push to main or to a branch agent/**, and reads it alone otherwise', () => {
    const cache = String(env.TURBO_CACHE);
    const api = 'https://cache.example';
    const cas = [
      ['push', 'refs/heads/main', 'local:rw,remote:rw'],
      ['push', 'refs/heads/agent/proj-1.2', 'local:rw,remote:rw'],
      ['push', 'refs/heads/develop', 'local:rw,remote:r'],
      ['pull_request', 'refs/pull/7/merge', 'local:rw,remote:r'],
      ['schedule', 'refs/heads/main', 'local:rw,remote:r'],
      ['push', 'refs/tags/v1.0.0', 'local:rw,remote:r'],
    ] as const;
    for (const [evenement, ref, attendu] of cas) {
      expect(cacheDe(cache, { evenement, ref, api }), `${evenement} ${ref}`).toBe(attendu);
    }
  });

  it('keeps the local cache alone, never an empty value, without the variable TURBO_API', () => {
    const cache = String(env.TURBO_CACHE);
    for (const evenement of ['push', 'pull_request']) {
      expect(cacheDe(cache, { evenement, ref: 'refs/heads/main', api: '' })).toBe('local:rw');
    }
  });

  it('adds no step of cache', () => {
    const etapes = Object.values(flux.jobs).flatMap(j => j.steps ?? []);
    expect(etapes.filter(e => /cache|turbo/i.test(e.uses ?? ''))).toEqual([]);
    expect(etapes.filter(e => /turbo (login|link)/.test(e.run ?? ''))).toEqual([]);
  });
});

describe("the root's turbo.json of Grillhouse", () => {
  it('signs the artifacts of the remote cache', () => {
    const conf = JSON.parse(readFileSync(path.join(DEPOT, 'turbo.json'), 'utf8')) as {
      remoteCache?: unknown;
    };
    expect(conf.remoteCache).toEqual({ signature: true });
  });
});
