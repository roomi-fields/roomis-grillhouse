// grillhouse-pkl.5, criterion 1 — the envelope opens where the tools of the project's language
// write, as the module of the language declares it (`sorties`, scripts/jointure.d.ts), as a
// sandbox of Bazel or of Nix opens in writing what the action declares. A project of cargo gets
// its `target/` and, in cargo's home, its registry, git dependencies, advisories and the files
// of its locks and of its cache in writing, the home itself (its `env`, which the shells source,
// its configuration, its binaries) and `~/.rustup` read-only, and nothing of Turborepo; a project
// of TypeScript gets the envelope it had before the module declared its outputs, mount for mount,
// save the cache of Vite at the root of the copy, proper to the session as in each package. The
// plan writes the components it names (`composants` of the module, `paquetsDuLangage`), a crate
// or a package out of the frame, not the whole copy.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Langage } from '../../scripts/jointure.js';
import { paquetsDuLangage, plan, sortiesDuLangage } from '../../scripts/enveloppe/enveloppe.mjs';
import cargo from '../../scripts/langages/cargo/index.mjs';
import exemples from '../../scripts/langages/cargo/exemples.mjs';
import typescript from '../../scripts/langages/typescript/index.mjs';
import { avecFauxCargo, installerFauxCargo } from './langages/cargo/faux-cargo.js';

const pairs = (args: string[], flag: string) =>
  args.flatMap((a, i) => (a === flag ? [args[i + 1] ?? ''] : []));
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'enveloppe-sorties-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const disque = (presents: string[]) => {
  const ici = new Set(presents);
  return { existe: (p: string) => ici.has(p) };
};

// The plan of the session of <role> in the copy /wt of the main tree /main, the home /h, its plan
// <composant>, the shared test material <matiere>, the outputs of <langage>.
function enveloppe(
  langage: Langage,
  o: { composant: string; matiere: string; role?: string; presents: string[] }
): string[] {
  const { magasins, lectures, sorties } = sortiesDuLangage(langage.sorties, {
    maison: '/h',
    principal: '/main',
  });
  return (
    plan(
      {
        trees: ['/main', '/wt'],
        copie: '/wt',
        paquets: [o.composant],
        role: o.role ?? 'developpeur',
        matieres: [o.matiere],
        magasins,
        lectures,
        sorties,
        paquetsDeLaCopie: [
          { dossier: o.composant, pkg: { name: 'a' } },
          { dossier: o.matiere, pkg: { name: 'm' } },
        ],
      },
      disque(o.presents)
    ).args ?? []
  );
}

describe('grillhouse-pkl.5, critère 1 — l’enveloppe d’un projet cargo', () => {
  const ECRITS = [
    '/h/.cargo/registry',
    '/h/.cargo/git',
    '/h/.cargo/advisory-dbs',
    '/h/.cargo/.package-cache',
    '/h/.cargo/.package-cache-mutate',
    '/h/.cargo/.global-cache',
  ];
  const presents = [
    '/wt/.git',
    '/wt/crates/a',
    '/wt/crates/m',
    '/wt/target',
    '/main/.beads',
    '/h/.cargo',
    '/h/.rustup',
    ...ECRITS,
  ];
  const args = enveloppe(cargo as unknown as Langage, {
    composant: 'crates/a',
    matiere: 'crates/m',
    presents,
  });

  it('opens target/ of the copy, and in cargo’s home its stores, locks and cache, in writing', () => {
    const ecrits = pairs(args, '--bind');
    for (const d of ['/wt/target', ...ECRITS]) {
      expect(ecrits, d).toContain(d);
    }
    // target/ comes back in writing over the copy, which stays read-only.
    expect(pairs(args, '--ro-bind')).toContain('/wt');
    expect(args.lastIndexOf('/wt/target')).toBeGreaterThan(args.indexOf('/wt'));
  });

  it('shows cargo’s home and rustup read-only, before its stores, and writes no file a shell sources', () => {
    const lus = pairs(args, '--ro-bind');
    for (const d of ['/h/.cargo', '/h/.rustup']) {
      expect(lus, d).toContain(d);
    }
    const ecrits = pairs(args, '--bind');
    for (const d of [
      '/h/.cargo',
      '/h/.cargo/env',
      '/h/.cargo/config.toml',
      '/h/.cargo/bin',
      '/h/.cargo/.crates.toml',
      '/h/.cargo/.crates2.json',
      '/h/.rustup',
    ]) {
      expect(ecrits, d).not.toContain(d);
    }
    // Written inside a directory read-only: the store comes after the home that holds it.
    const home = args.indexOf('/h/.cargo');
    for (const d of ECRITS) {
      expect(args.indexOf(d), d).toBeGreaterThan(home);
    }
  });

  it('mounts nothing of Turborepo or of Vite', () => {
    expect(args.filter(a => /\.turbo|\.vite/.test(a))).toEqual([]);
    expect(pairs(args, '--tmpfs')).toEqual(['/dev/shm']);
  });

  it('declares its outputs: the directories with a trailing slash, the files of its locks without', () => {
    const s = (cargo as unknown as Langage).sorties;
    expect(s).toEqual({
      ecrites: [
        'target/',
        '~/.cargo/registry/',
        '~/.cargo/git/',
        '~/.cargo/advisory-dbs/',
        '~/.cargo/.package-cache',
        '~/.cargo/.package-cache-mutate',
        '~/.cargo/.global-cache',
        '~/.cache/sccache/',
      ],
      propres: [],
      lues: ['~/.cargo/', '~/.rustup/'],
    });
    expect(sortiesDuLangage(s, { maison: '/h', principal: '/main' }).fichiers).toEqual([
      '/h/.cargo/.package-cache',
      '/h/.cargo/.package-cache-mutate',
      '/h/.cargo/.global-cache',
    ]);
  });
});

describe('grillhouse-pkl.5 — le plan d’un projet cargo écrit le crate qu’il nomme', () => {
  const CARGO = path.join(ESSAIS, 'cargo');
  let restaurer = () => {};
  let espace = '';
  beforeAll(() => {
    mkdirSync(CARGO, { recursive: true });
    restaurer = avecFauxCargo(installerFauxCargo(CARGO), path.join(CARGO, 'journal'));
    espace = (exemples.preparer(CARGO) as { depots: { espace: string } }).depots.espace;
  });
  afterAll(() => restaurer());

  it('the components of the copy are its crates, by the module of its language', () => {
    expect(paquetsDuLangage(cargo as unknown as Langage, espace)).toContainEqual({
      dossier: 'crates/core',
      pkg: { name: 'ws-core' },
      hors: false,
    });
  });

  it('a plan naming a crate opens that crate alone, the copy read-only', () => {
    const r = plan(
      {
        trees: ['/main', espace],
        copie: espace,
        paquets: ['crates/core'],
        role: 'developpeur',
        paquetsDeLaCopie: paquetsDuLangage(cargo as unknown as Langage, espace),
      },
      disque([path.join(espace, 'crates/core')])
    );
    const args = r.args ?? [];
    expect(r.refus).toBeUndefined();
    expect(pairs(args, '--bind')).toEqual([path.join(espace, 'crates/core')]);
    expect(pairs(args, '--ro-bind')).toContain(espace);
  });
});

// A package out of the frame (`docs/agents/hors-cadre.txt`, as BPScript lists some) is no
// component of the module, yet a plan that names it writes it alone, as before the module gave the
// components of the envelope.
describe('grillhouse-pkl.5 — un paquet hors cadre nommé par le plan s’ouvre seul', () => {
  const HORS = path.join(ESSAIS, 'hors');
  const ecrire = (rel: string, texte: string) => {
    mkdirSync(path.dirname(path.join(HORS, rel)), { recursive: true });
    writeFileSync(path.join(HORS, rel), texte);
  };
  ecrire(
    'package.json',
    JSON.stringify({
      name: 'essai',
      workspaces: ['packages/*'],
      grillhouse: { langages: ['typescript'] },
    })
  );
  ecrire('packages/a/package.json', JSON.stringify({ name: 'a' }));
  ecrire('packages/h/package.json', JSON.stringify({ name: 'h' }));
  ecrire('docs/agents/hors-cadre.txt', 'h un outil à part\n');

  it('the components of the envelope hold the package out of the frame', () => {
    const liste = paquetsDuLangage(typescript as unknown as Langage, HORS);
    expect(liste).toContainEqual({ dossier: 'packages/a', pkg: { name: 'a' }, hors: false });
    expect(liste).toContainEqual({ dossier: 'packages/h', pkg: { name: 'h' }, hors: true });
  });

  it('a plan naming it writes it alone, the copy read-only', () => {
    const r = plan(
      {
        trees: ['/main', HORS],
        copie: HORS,
        paquets: ['packages/h'],
        role: 'developpeur',
        paquetsDeLaCopie: paquetsDuLangage(typescript as unknown as Langage, HORS),
      },
      disque([path.join(HORS, 'packages/h')])
    );
    expect(r.refus).toBeUndefined();
    expect(pairs(r.args ?? [], '--bind')).toEqual([path.join(HORS, 'packages/h')]);
    expect(pairs(r.args ?? [], '--ro-bind')).toContain(HORS);
  });
});

describe('grillhouse-pkl.5, critère 1 — l’enveloppe d’un projet typescript, inchangée', () => {
  const presents = [
    '/wt/.git',
    '/wt/.turbo',
    '/wt/node_modules/.vite',
    '/wt/packages/a',
    '/wt/packages/m',
    '/wt/packages/m/.turbo',
    '/wt/packages/m/node_modules/.vite',
    '/main/.beads',
    '/main/.turbo/cache',
  ];
  const ts = typescript as unknown as Langage;
  const de = (role: string) =>
    enveloppe(ts, { composant: 'packages/a', matiere: 'packages/m', role, presents });
  // The arguments of the envelope before the module declared its outputs (main at a3c4954), on
  // the same disk, save the cache of Vite at the root of the copy, now proper to the session.
  const debut = ['--ro-bind', '/', '/', '--dev-bind', '/dev', '/dev', '--tmpfs', '/dev/shm'];
  const copie = ['--unshare-pid', '--proc', '/proc', '--ro-bind', '/wt', '/wt'];
  const racine = [
    ...['--tmpfs', '/wt/.turbo', '--tmpfs', '/wt/node_modules/.vite'],
    ...['--ro-bind', '/wt/.git', '/wt/.git'],
  ];
  const magasin = ['--bind', '/main/.turbo/cache', '/main/.turbo/cache'];
  const tickets = ['--bind', '/main/.beads', '/main/.beads'];
  const duPlan = ['--bind', '/wt/packages/a', '/wt/packages/a'];

  it('the developpeur: the same mounts, the outputs of the material proper to the session', () => {
    expect(de('developpeur')).toEqual([
      ...debut,
      ...copie,
      ...racine,
      ...magasin,
      ...tickets,
      ...duPlan,
      ...['--ro-bind', '/wt/packages/m', '/wt/packages/m'],
      ...['--tmpfs', '/wt/packages/m/.turbo'],
      ...['--tmpfs', '/wt/packages/m/node_modules/.vite'],
      ...['--chdir', '/wt'],
    ]);
  });

  it('the testwriter: the same mounts, the material in writing', () => {
    expect(de('testwriter')).toEqual([
      ...debut,
      ...copie,
      ...racine,
      ...magasin,
      ...tickets,
      ...duPlan,
      ...['--bind', '/wt/packages/m', '/wt/packages/m'],
      ...['--chdir', '/wt'],
    ]);
  });

  // Witness: commandes-en-enveloppe.nuit.spec.ts, whose copy links its node_modules to the
  // repository's; bwrap could not make the mount point through the link, « Can't mkdir ».
  it('mounts nothing over an output a symbolic link carries out of the copy', () => {
    const { lectures, magasins, sorties } = sortiesDuLangage(ts.sorties, {
      maison: '/h',
      principal: '/main',
    });
    const args =
      plan(
        {
          trees: ['/main', '/wt'],
          copie: '/wt',
          paquets: ['packages/a'],
          role: 'developpeur',
          lectures,
          magasins,
          sorties,
          paquetsDeLaCopie: [{ dossier: 'packages/a', pkg: { name: 'a' } }],
        },
        {
          existe: (p: string) => presents.includes(p),
          lien: (p: string) => (p === '/wt/node_modules' ? '/main/node_modules' : null),
        }
      ).args ?? [];
    expect(pairs(args, '--tmpfs')).toEqual(['/dev/shm', '/wt/.turbo']);
  });
});
