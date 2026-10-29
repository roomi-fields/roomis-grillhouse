import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { migrer as toutesLesMigrations } from '../../scripts/migrations.mjs';
import { migrer, nom, version } from '../../scripts/migrations/0.23.2-copies-du-cadre.mjs';
import { cheminSysteme, claudeSubstitut } from '@roomi-fields/grillhouse-matiere/test-fixtures';

// grillhouse-3uv.84.6.1: a project in 0.22.x holds the frame in copies, which the former update
// listed (`.claude/grillhouse/fichiers.txt`) and fingerprinted (`.claude/grillhouse/empreintes.json`,
// the SHA-256 of each file's bytes). The trial of BPScript (84.6) kept them all beside the
// package: the copy of the guard of the index of the interfaces judged late the index the update
// had just written, the project's skills and agents hid the plugin's, `yaml` stayed a dependency
// that only the copies imported. The migration takes off what the package replaces, from that list.

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-copies-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const MAJ = path.resolve(__dirname, '../../scripts/grillhouse-maj.mjs');

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;
const lire = (racine: string, f: string) => readFileSync(path.join(racine, f), 'utf8');
const empreinte = (texte: string) => createHash('sha256').update(texte).digest('hex');
const present = (racine: string, f: string) => existsSync(path.join(racine, f));
const contenu = (racine: string): Record<string, string> => {
  const out: Record<string, string> = {};
  const parcourir = (rel: string) => {
    for (const e of readdirSync(path.join(racine, rel), { withFileTypes: true })) {
      const r = path.join(rel, e.name);
      if (e.isDirectory()) {
        parcourir(r);
      } else {
        out[r] = lire(racine, r);
      }
    }
  };
  parcourir('.');
  return out;
};
const textes = (lignes: unknown[]) => lignes.filter((l): l is string => typeof l === 'string');
const aFaire = (lignes: unknown[]): string[] =>
  lignes.flatMap(l =>
    typeof l === 'object' && l !== null && 'aFaire' in l ? [String(l.aFaire)] : []
  );

// The frame's list, as 0.22.2 wrote it: files, directories (« / »), removals (« - »).
const LISTE = `# The frame's files: \`npm run grillhouse:maj\` copies them, as they are, into a project.
METACADRE.md
tsdoc.json
.claude/grillhouse/
.claude/agents/
.claude/skills/developpeur/
docs/agents/issue-tracker.md
scripts/circuit.mjs
scripts/frontieres.mjs
scripts/index-interfaces.mjs
scripts/avancement.mjs
scripts/nuit.sh
scripts/verrous/
scripts/vitest-config/
- scripts/sortie.mjs
- .claude/agents/arbitre.md
`;

// The copies of the frame, at the content 0.22.2 copied.
const COPIES: Record<string, string> = {
  'METACADRE.md': '# Le métacadre\n',
  'tsdoc.json': json({ extends: ['@microsoft/api-extractor/extends/tsdoc-base.json'] }),
  '.claude/grillhouse/VERSION': '0.22.2\n',
  '.claude/grillhouse/charte.md': '# La charte commune\n',
  '.claude/grillhouse/fichiers.txt': LISTE,
  '.claude/agents/developpeur.md': '---\nname: developpeur\n---\n',
  '.claude/skills/developpeur/SKILL.md': '---\nname: developpeur\n---\n',
  'docs/agents/issue-tracker.md': '# Les tickets\n',
  'scripts/circuit.mjs': 'export {};\n',
  'scripts/frontieres.mjs': "import { parse } from 'jsonc-parser';\n",
  'scripts/index-interfaces.mjs':
    "import YAML from 'yaml';\nimport x from '@microsoft/api-extractor';\n",
  'scripts/avancement.mjs': 'export {};\n',
  'scripts/nuit.sh': '#!/usr/bin/env bash\n',
  'scripts/verrous/commande.mjs': 'export {};\n',
  // A former import of the base by its path, which the migration 0.23.0 of Vitest rewrites.
  'scripts/vitest-config/base.mjs': "import base from './scripts/vitest-config/base.mjs';\n",
};

// The first line the former generator of the packages' turbo.json wrote.
const ENGENDRE =
  '// Généré par `node scripts/turbo-des-paquets.mjs --ecrire` depuis les package.json, le turbo.json racine et docs/agents/hors-cadre.txt ; ne pas éditer.\n{ "extends": ["//"] }\n';

// A project of the form of BPScript at 0.22.2: the copies and their fingerprints, one copy the
// project modified (none with `retouche: false`), the turbo.json the former generator wrote for
// the former workspace of the base, files of its own beside them, npm scripts that call copies.
function projet({ retouche = true }: { retouche?: boolean } = {}) {
  const p = mkdtempSync(path.join(ESSAIS, 'projet-'));
  for (const [f, t] of Object.entries(COPIES)) {
    ecrire(p, f, t);
  }
  ecrire(
    p,
    '.claude/grillhouse/empreintes.json',
    json({
      version: '84ce43f07ce2e4168c792179c63802e5765fba3c',
      fichiers: Object.fromEntries(Object.entries(COPIES).map(([f, t]) => [f, empreinte(t)])),
      crochets: [],
    })
  );
  if (retouche) {
    ecrire(p, 'scripts/circuit.mjs', `${COPIES['scripts/circuit.mjs']}// retouche du projet\n`);
  }
  ecrire(p, 'scripts/vitest-config/turbo.json', ENGENDRE);
  ecrire(p, 'scripts/propre.mjs', "import { z } from 'zod';\n");
  ecrire(p, '.claude/agents/maison.md', '---\nname: maison\n---\n');
  ecrire(p, '.claude/settings.json', json({ model: 'opus' }));
  ecrire(p, 'packages/a/src/lire.mjs', "import { parse } from 'jsonc-parser';\n");
  ecrire(
    p,
    'package.json',
    json({
      name: 'bp',
      private: true,
      // grillhouse-3dr.2.3: a project of TypeScript declares its language.
      grillhouse: { langages: ['typescript'] },
      scripts: {
        frontieres: 'node scripts/frontieres.mjs',
        interfaces: 'node scripts/index-interfaces.mjs --verifier',
        nuit: 'npm run build && bash scripts/nuit.sh --tout',
        commande: 'node ./scripts/verrous/commande.mjs',
        avancement: 'node scripts/avancement.mjs --texte',
        circuit: 'node scripts/circuit.mjs',
        propre: 'node scripts/propre.mjs',
      },
      devDependencies: {
        '@microsoft/api-extractor': '7.59.4',
        'jsonc-parser': '3.3.1',
        yaml: '2.9.1',
        zod: '^3.22.0',
      },
    })
  );
  return p;
}

describe('migration 0.23.2 — the copies of the frame leave a project in 0.22.x', () => {
  it('is the migration of 0.23.2, « copies du cadre »', () => {
    expect(version).toBe('0.23.2');
    expect(nom).toBe('copies du cadre');
  });

  it('critère 1 — removes each listed copy at its fingerprint, then .claude/grillhouse/ whole; an emptied directory goes', () => {
    const p = projet({ retouche: false });
    const lignes = migrer(p);
    for (const f of [
      'METACADRE.md',
      '.claude/agents/developpeur.md',
      '.claude/skills/developpeur/SKILL.md',
      'scripts/frontieres.mjs',
      'scripts/index-interfaces.mjs',
      'scripts/avancement.mjs',
      'scripts/nuit.sh',
      'scripts/verrous/commande.mjs',
      'scripts/vitest-config/base.mjs',
      'scripts/circuit.mjs',
    ]) {
      expect(present(p, f), f).toBe(false);
      expect(
        textes(lignes).some(l => l.startsWith(`${f} : `)),
        f
      ).toBe(true);
    }
    expect(present(p, '.claude/grillhouse')).toBe(false);
    expect(aFaire(lignes)).toEqual([]);
    for (const d of ['.claude/skills', 'scripts/verrous', 'scripts/vitest-config']) {
      expect(present(p, d), d).toBe(false);
    }
    // What is the project's own stays, and so does the directory that holds it.
    expect(lire(p, '.claude/agents/maison.md')).toBe('---\nname: maison\n---\n');
    expect(lire(p, 'scripts/propre.mjs')).toBe("import { z } from 'zod';\n");
    expect(present(p, '.claude/settings.json')).toBe(true);
  });

  it('a file the former generator wrote, under a listed directory that is no workspace, goes with its directory', () => {
    const p = projet();
    const lignes = textes(migrer(p));
    expect(present(p, 'scripts/vitest-config')).toBe(false);
    expect(lignes.some(l => l.startsWith('scripts/vitest-config/turbo.json : '))).toBe(true);
  });

  it('a file the former generator wrote stays under a listed directory that is still a workspace', () => {
    const p = projet();
    const pkg = JSON.parse(lire(p, 'package.json')) as Record<string, unknown>;
    ecrire(p, 'package.json', json({ ...pkg, workspaces: ['scripts/vitest-config'] }));
    ecrire(p, 'scripts/vitest-config/package.json', json({ name: 'base-du-projet' }));
    migrer(p);
    expect(lire(p, 'scripts/vitest-config/turbo.json')).toBe(ENGENDRE);
  });

  it('a copy the migration 0.23.0 of Vitest rewrote (a project that recorded 0.23.0) is still the frame’s, and leaves', () => {
    const p = projet();
    ecrire(
      p,
      'scripts/vitest-config/base.mjs',
      "import base from '@roomi-fields/grillhouse/vitest-config';\n"
    );
    const lignes = migrer(p);
    expect(present(p, 'scripts/vitest-config/base.mjs')).toBe(false);
    expect(aFaire(lignes).some(l => l.includes('vitest-config'))).toBe(false);
  });

  it('a listed file the template of a project holds (tsdoc.json, docs/agents/issue-tracker.md) is the project’s, and stays', () => {
    const p = projet();
    migrer(p);
    expect(lire(p, 'tsdoc.json')).toBe(COPIES['tsdoc.json']);
    expect(lire(p, 'docs/agents/issue-tracker.md')).toBe(COPIES['docs/agents/issue-tracker.md']);
  });

  it('critère 2 — a copy the project modified stays, named with the command that removes it', () => {
    const p = projet();
    const lignes = migrer(p);
    expect(lire(p, 'scripts/circuit.mjs')).toContain('// retouche du projet');
    const restes = aFaire(lignes);
    expect(restes).toHaveLength(2);
    expect(restes[0]).toContain('scripts/circuit.mjs : copie du cadre modifiée par le projet');
    expect(restes[0]).toContain('`git rm scripts/circuit.mjs`');
    // The npm script that runs it is named: its removal breaks it.
    expect(restes[1]).toContain('le script circuit lance scripts/circuit.mjs');
    expect(restes[1]).toContain('`grillhouse circuit` le remplace');
  });

  it('critère 2 — while a modified copy stays, the list and the fingerprints stay, and the rest of .claude/grillhouse/ goes', () => {
    const p = projet();
    migrer(p);
    expect(readdirSync(path.join(p, '.claude/grillhouse')).sort()).toEqual([
      'empreintes.json',
      'fichiers.txt',
    ]);
  });

  it('critère 3 — each npm script that runs a removed copy runs its subcommand; one without subcommand is named, not rewritten', () => {
    const p = projet();
    const lignes = textes(migrer(p));
    const scripts = (JSON.parse(lire(p, 'package.json')) as { scripts: Record<string, string> })
      .scripts;
    expect(scripts).toEqual({
      frontieres: 'grillhouse frontieres',
      interfaces: 'grillhouse index-interfaces --verifier',
      nuit: 'npm run build && grillhouse nuit --tout',
      commande: 'grillhouse commande',
      avancement: 'node scripts/avancement.mjs --texte',
      circuit: 'node scripts/circuit.mjs',
      propre: 'node scripts/propre.mjs',
    });
    expect(lignes).toContain('package.json : le script frontieres lance `grillhouse frontieres`');
    expect(lignes.some(l => l.includes('avancement') && l.includes('scripts/avancement.mjs'))).toBe(
      true
    );
    expect(lignes.some(l => l.includes('le script circuit'))).toBe(false);
    expect(lignes.some(l => l.includes('le script propre'))).toBe(false);
  });

  it('critère 4 — a dependency only the removed copies imported, which the package declares, is named and left', () => {
    const p = projet();
    const lignes = textes(migrer(p));
    const pkg = JSON.parse(lire(p, 'package.json')) as { devDependencies: Record<string, string> };
    expect(pkg.devDependencies).toEqual({
      '@microsoft/api-extractor': '7.59.4',
      'jsonc-parser': '3.3.1',
      yaml: '2.9.1',
      zod: '^3.22.0',
    });
    const nommees = lignes.filter(l => l.startsWith('package.json : la dépendance '));
    expect(nommees).toHaveLength(1);
    expect(nommees[0]).toContain('yaml');
    expect(nommees[0]).toContain('`npm uninstall yaml`');
  });

  it('critère 5 — replayed on a project already migrated, it changes no byte and reports nothing', () => {
    const p = projet({ retouche: false });
    migrer(p);
    const premier = contenu(p);
    expect(migrer(p)).toEqual([]);
    expect(contenu(p)).toEqual(premier);
  });

  it('critère 5 — replayed while a modified copy stays, it changes no byte and names it again; once it is gone, .claude/grillhouse/ goes', () => {
    const p = projet();
    migrer(p);
    const premier = contenu(p);
    const second = migrer(p);
    expect(textes(second)).toEqual([]);
    expect(aFaire(second)).toEqual([
      expect.stringContaining('scripts/circuit.mjs : copie du cadre modifiée'),
      expect.stringContaining('le script circuit'),
    ]);
    expect(contenu(p)).toEqual(premier);
    rmSync(path.join(p, 'scripts/circuit.mjs'));
    expect(aFaire(migrer(p))).toEqual([]);
    expect(present(p, '.claude/grillhouse')).toBe(false);
    expect(migrer(p)).toEqual([]);
  });

  it('a project without the former list is left as it is', () => {
    const p = mkdtempSync(path.join(ESSAIS, 'neuf-'));
    ecrire(
      p,
      'package.json',
      json({
        name: 'n',
        grillhouse: { langages: ['typescript'] },
        scripts: { x: 'node scripts/x.mjs' },
      })
    );
    ecrire(p, 'scripts/x.mjs', 'export {};\n');
    const avant = contenu(p);
    expect(migrer(p)).toEqual([]);
    expect(contenu(p)).toEqual(avant);
  });

  it('played after the migrations of 0.23.0 from 0.22.2, a copy they would have rewritten is still the frame’s, and leaves', () => {
    const p = projet();
    const r = toutesLesMigrations(p, '0.22.2');
    expect(present(p, 'scripts/vitest-config')).toBe(false);
    const copies = r.find(m => m.version === '0.23.2');
    expect(copies?.aFaire).toEqual([
      expect.stringContaining('scripts/circuit.mjs : copie du cadre modifiée'),
      expect.stringContaining('le script circuit'),
    ]);
  });

  it('critère 2 — grillhouse maj writes the modified copy on its error stream, with `git rm`, its exit code non-zero, and names it again at its next run', () => {
    const p = projet();
    const bin = claudeSubstitut(mkdtempSync(path.join(ESSAIS, 'claude-')), {
      marches: ['claude-plugins-official', 'roomi-fields'],
    }).bin;
    const maj = () =>
      spawnSync(process.execPath, [MAJ], {
        cwd: p,
        encoding: 'utf8',
        env: { PATH: cheminSysteme(bin), HOME: mkdtempSync(path.join(ESSAIS, 'maison-')) },
        timeout: 120_000,
      });
    const r = maj();
    expect(r.status).not.toBe(0);
    expect(r.stdout).toMatch(/^Migration 0\.23\.2 \(copies du cadre\) :$/m);
    expect(r.stderr).toMatch(/^Migration 0\.23\.2 \(copies du cadre\), à faire :$/m);
    expect(r.stderr).toContain('`git rm scripts/circuit.mjs`');
    expect(present(p, 'scripts/frontieres.mjs')).toBe(false);
    expect(lire(p, 'scripts/circuit.mjs')).toContain('// retouche du projet');
    // The project keeps the version it recorded (none here): the next run plays the migration again.
    expect(JSON.parse(lire(p, 'package.json'))).not.toHaveProperty('grillhouse.version');
    const s = maj();
    expect(s.status).not.toBe(0);
    expect(s.stderr).toContain('`git rm scripts/circuit.mjs`');
  });
});
