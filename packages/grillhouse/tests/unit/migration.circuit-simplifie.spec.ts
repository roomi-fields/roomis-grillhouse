import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { migrer as migrerTout } from '../../scripts/migrations.mjs';
import {
  migrer,
  nom,
  restes as restesDe,
  version,
} from '../../scripts/migrations/0.24.0-circuit-simplifie.mjs';

// grillhouse-3uv.95.11 critère 2: the circuit of 0.24.0 has no regulator and no technical referent
// (decision 3 of grillhouse-3uv.95); a migration rewrites in a project what that changes, and only
// that. The rubric « Ce qui monte au superviseur » of its CLAUDE.md, when it holds the paragraph of
// the former template, says the new circuit, the project's list kept; the project's own
// `docs/agents/issue-tracker.md`, when it holds the bytes of a former template, becomes the
// template's; a text the project modified that still names a removed role, and a copy of a removed
// role under `.claude/agents/` or `.claude/skills/`, is named, not written. Replayable without
// effect. A tracked file of the project that still calls a script of the frame at its former
// address under `scripts/` is named with its file:line and what replaces it, never rewritten.

const DEPOT = path.resolve(__dirname, '../../../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-circuit-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

type Ligne = string | { aFaire: string };
// grillhouse-3dr.2.3: a project of TypeScript declares its language.
const PKG = `${JSON.stringify({ name: 'p', grillhouse: { langages: ['typescript'] } }, null, 2)}\n`;
const projet = (fichiers: Record<string, string> = {}) => {
  const p = mkdtempSync(path.join(ESSAIS, 'projet-'));
  for (const [f, t] of Object.entries({ 'package.json': PKG, ...fichiers })) {
    mkdirSync(path.dirname(path.join(p, f)), { recursive: true });
    writeFileSync(path.join(p, f), t);
  }
  return p;
};
const lire = (p: string, f: string) => readFileSync(path.join(p, f), 'utf8');
const aFaire = (lignes: Ligne[]) =>
  lignes.filter((l): l is { aFaire: string } => typeof l !== 'string').map(l => l.aFaire);
const faites = (lignes: Ligne[]) => lignes.filter((l): l is string => typeof l === 'string');
// The section « Ce qui monte au superviseur » of a CLAUDE.md, up to the next section.
const rubrique = (t: string) => /^## Ce qui monte au superviseur\n[^]*?(?=^## )/m.exec(t)?.[0];

const TETE = '# BPScript\n\nUn langage.\n\n## Comment on arbitre\n\n1. La référence mature.\n\n';
const SUITE = '## Commandes\n\n- `npm test`.\n';
// The rubric of the template of 0.22.x and 0.23.x, its placeholder as the template held it.
const ANCIENNE =
  "## Ce qui monte au superviseur\n\nLe fonctionnel que le régulateur ne tranche jamais seul : <le langage, le moteur audio, une\ninterface publiée…>. Le cadre et l'architecture montent toujours (charte commune).\n\n";
// The same, its list filled by a project.
const REMPLIE =
  "## Ce qui monte au superviseur\n\nLe fonctionnel que le régulateur ne tranche jamais seul : une règle du langage, le moteur\naudio. Le cadre et l'architecture montent toujours (charte commune).\n\n";
const GABARIT = readFileSync(path.join(DEPOT, 'templates/projet/CLAUDE.md'), 'utf8');
const SUIVI = readFileSync(
  path.join(DEPOT, 'templates/projet/docs/agents/issue-tracker.md'),
  'utf8'
);
const FORME = (v: string) =>
  readFileSync(path.join(__dirname, `../formes/issue-tracker-${v}.md`), 'utf8');

describe('migration 0.24.0 — the circuit without regulator nor technical referent', () => {
  it('is the migration of 0.24.0, « circuit simplifié »', () => {
    expect(version).toBe('0.24.0');
    expect(nom).toBe('circuit simplifié');
  });

  it('the rubric of the former template becomes the rubric of the template of this version', () => {
    const p = projet({ 'CLAUDE.md': `${TETE}${ANCIENNE}${SUITE}` });
    const lignes = migrer(p) as Ligne[];
    expect(faites(lignes)).toHaveLength(1);
    expect(faites(lignes)[0]).toMatch(/^CLAUDE\.md : /);
    expect(aFaire(lignes)).toEqual([]);
    expect(rubrique(GABARIT)).toBeDefined();
    expect(lire(p, 'CLAUDE.md')).toBe(`${TETE}${rubrique(GABARIT)}${SUITE}`);
  });

  it('the template of this version names neither the regulator nor the technical referent in its rubric', () => {
    expect(rubrique(GABARIT)).not.toMatch(/r[ée]gulat|r[ée]f[ée]rent/i);
    expect(rubrique(GABARIT)).toMatch(/monte au superviseur, avec sa pièce/);
  });

  it('a list the project filled is kept, the rest of the paragraph rewritten', () => {
    const p = projet({ 'CLAUDE.md': `${TETE}${REMPLIE}${SUITE}` });
    expect(faites(migrer(p) as Ligne[])).toHaveLength(1);
    const r = rubrique(lire(p, 'CLAUDE.md')) ?? '';
    expect(r).not.toMatch(/régulateur/);
    expect(r.replace(/\s+/g, ' ')).toContain(
      "qu'il ne tranche jamais seul : une règle du langage, le moteur audio. Le cadre et l'architecture montent toujours (charte commune)."
    );
    expect(r.split('\n').every(l => l.length <= 100)).toBe(true);
    expect(lire(p, 'CLAUDE.md').startsWith(TETE)).toBe(true);
    expect(lire(p, 'CLAUDE.md').endsWith(SUITE)).toBe(true);
  });

  it('a paragraph the project added to the rubric stays', () => {
    const ajout = '- Une scène du corpus réécrite.\n\n';
    const p = projet({ 'CLAUDE.md': `${TETE}${ANCIENNE}${ajout}${SUITE}` });
    migrer(p);
    expect(lire(p, 'CLAUDE.md')).toBe(`${TETE}${rubrique(GABARIT)}${ajout}${SUITE}`);
  });

  it('a rubric the project modified that still names a removed role is named, not written', () => {
    const texte = `${TETE}## Ce qui monte au superviseur\n\nCe que le régulateur ne tranche pas : le langage.\n\n${SUITE}`;
    const p = projet({ 'CLAUDE.md': texte });
    const lignes = migrer(p) as Ligne[];
    expect(faites(lignes)).toEqual([]);
    expect(aFaire(lignes)).toHaveLength(1);
    expect(aFaire(lignes)[0]).toMatch(/^CLAUDE\.md : .*Ce qui monte au superviseur/);
    expect(lire(p, 'CLAUDE.md')).toBe(texte);
  });

  it('a rubric of the project’s own that names no removed role is left as it is, silently', () => {
    const texte = `${TETE}## Ce qui monte au superviseur\n\n- Une règle du langage.\n- L'architecture.\n\n${SUITE}`;
    const p = projet({ 'CLAUDE.md': texte });
    expect(migrer(p)).toEqual([]);
    expect(lire(p, 'CLAUDE.md')).toBe(texte);
  });

  for (const v of ['0.22', '0.23']) {
    it(`the issue tracker’s guide of the template of ${v}.x becomes the template’s`, () => {
      const p = projet({ 'docs/agents/issue-tracker.md': FORME(v) });
      const lignes = migrer(p) as Ligne[];
      expect(faites(lignes)).toHaveLength(1);
      expect(faites(lignes)[0]).toMatch(/^docs\/agents\/issue-tracker\.md : /);
      expect(lire(p, 'docs/agents/issue-tracker.md')).toBe(SUIVI);
    });
  }

  it('an issue tracker’s guide the project modified that names a removed role is named, not written', () => {
    const texte = `${FORME('0.23')}\n- Our own line.\n`;
    const p = projet({ 'docs/agents/issue-tracker.md': texte });
    const lignes = migrer(p) as Ligne[];
    expect(faites(lignes)).toEqual([]);
    expect(aFaire(lignes)).toHaveLength(1);
    expect(aFaire(lignes)[0]).toMatch(/^docs\/agents\/issue-tracker\.md : /);
    expect(lire(p, 'docs/agents/issue-tracker.md')).toBe(texte);
  });

  it('a copy of a removed role under .claude/agents/ or .claude/skills/ is named with the command that removes it', () => {
    const p = projet({
      '.claude/agents/regulateur.md': '---\nname: regulateur\n---\nModifié.\n',
      '.claude/skills/referent-technique/SKILL.md': '---\nname: referent-technique\n---\n',
      '.claude/agents/relecteur.md': '---\nname: relecteur\n---\n',
    });
    const lignes = migrer(p) as Ligne[];
    expect(faites(lignes)).toEqual([]);
    const restes = aFaire(lignes);
    expect(restes).toHaveLength(2);
    expect(restes.some(l => l.includes('`git rm .claude/agents/regulateur.md`'))).toBe(true);
    expect(restes.some(l => l.includes('`git rm -r .claude/skills/referent-technique`'))).toBe(
      true
    );
    expect(existsSync(path.join(p, '.claude/agents/regulateur.md'))).toBe(true);
    expect(existsSync(path.join(p, '.claude/skills/referent-technique/SKILL.md'))).toBe(true);
  });

  it('writes neither the settings nor the package.json, where no version wrote a setting of a role', () => {
    const reglages = `${JSON.stringify({ permissions: { allow: ['Bash(bd *)'] } }, null, 2)}\n`;
    const pkg = `${JSON.stringify({ name: 'p', grillhouse: { langages: ['typescript'], version: '0.22.2', nuit: 'nuit' } }, null, 2)}\n`;
    const p = projet({ '.claude/settings.json': reglages, 'package.json': pkg });
    expect(migrer(p)).toEqual([]);
    expect(lire(p, '.claude/settings.json')).toBe(reglages);
    expect(lire(p, 'package.json')).toBe(pkg);
  });

  it('a second pass changes no byte and reports nothing more', () => {
    const p = projet({
      'CLAUDE.md': `${TETE}${REMPLIE}${SUITE}`,
      'docs/agents/issue-tracker.md': FORME('0.22'),
    });
    migrer(p);
    const claude = lire(p, 'CLAUDE.md');
    const suivi = lire(p, 'docs/agents/issue-tracker.md');
    expect(migrer(p)).toEqual([]);
    expect(lire(p, 'CLAUDE.md')).toBe(claude);
    expect(lire(p, 'docs/agents/issue-tracker.md')).toBe(suivi);
  });

  it('a project without any of these files is left as it is', () => {
    expect(migrer(projet())).toEqual([]);
  });

  it('a tracked file that calls a script of the frame at its former address stays to the project, with its file:line and its replacement, not written', () => {
    const fichiers = {
      'outils/crochet.sh':
        'set -e\nnode scripts/index-interfaces.mjs --verifier\nnode scripts/consommateurs.mjs\n',
      'outils/nuit.sh': '# la nuit\n\nnode "$RACINE/scripts/code-mort.mjs"\n',
      'outils/branches.sh': 'grep -q "scripts/un-commit-par-ticket.mjs" .beads/hooks/commit-msg\n',
      'outils/garde.mjs':
        "const { trancher } = await import(path.join(racine, 'scripts', 'dette.mjs'));\n",
      'outils/propre.sh': 'node packages/a/scripts/code-mort.mjs\nnode scripts/mien.mjs\n',
      'CHANGELOG.md': '- node scripts/code-mort.mjs\n',
    };
    const p = projet(fichiers);
    execFileSync('git', ['-C', p, 'init', '-q']);
    execFileSync('git', ['-C', p, 'add', '.']);
    expect(migrer(p)).toEqual([]);
    const restes = restesDe(p) as string[];
    const de = (fl: string) => restes.filter(l => l.startsWith(`${fl} : `));
    expect(de('outils/crochet.sh:2')[0]).toContain('`grillhouse index-interfaces`');
    expect(de('outils/crochet.sh:3')[0]).toContain('`grillhouse consommateurs`');
    expect(de('outils/crochet.sh:3')[0]).toContain('`@roomi-fields/grillhouse/consommateurs`');
    expect(de('outils/nuit.sh:3')[0]).toContain('`grillhouse code-mort`');
    expect(de('outils/branches.sh:1')[0]).toContain('`grillhouse hook commit-msg`');
    expect(de('outils/garde.mjs:1')[0]).toContain('`@roomi-fields/grillhouse/dette`');
    expect(restes).toHaveLength(5);
    for (const [fl, texte] of Object.entries(fichiers)) {
      expect(lire(p, fl)).toBe(texte);
    }
  });

  // grillhouse-3uv.95.11.2 critère 2: the report sees a path to a former copy written in pieces,
  // as BPScript wrote them before its migration (8030741b0): a path built behind a variable inside
  // a URL, and the segments of a path.join down a directory of scripts/.
  it('a path built in pieces, `$1/scripts/<copie>` in a URL or path.join down a directory, stays to the project', () => {
    const fichiers = {
      'packages/995-tools/src/generation-des-paquets.sh':
        'paquets_geles() {\n  printf \' %s \' "$(node --input-type=module -e \'const { horsCadre } = await import(process.argv[1]); console.log([...horsCadre(process.argv[2])].join(" "))\' "file://$1/scripts/consommateurs.mjs" "$1")"\n}\n',
      'packages/995-tools/src/verif-portes.mjs':
        "const RACINE = path.resolve(import.meta.dirname, '..', '..', '..');\nconst RAPPORTEUR_DUREE = path.join(RACINE, 'scripts', 'vitest-config', 'duree.reporter.mjs');\n",
    };
    const p = projet(fichiers);
    execFileSync('git', ['-C', p, 'init', '-q']);
    execFileSync('git', ['-C', p, 'add', '.']);
    const restes = restesDe(p) as string[];
    const de = (fl: string) => restes.filter(l => l.startsWith(`${fl} : `));
    expect(de('packages/995-tools/src/generation-des-paquets.sh:2')[0]).toContain(
      'scripts/consommateurs.mjs'
    );
    expect(de('packages/995-tools/src/verif-portes.mjs:2')[0]).toContain(
      'scripts/vitest-config/duree.reporter.mjs, copie du cadre retirée ; `@roomi-fields/grillhouse/vitest-config/duree` la remplace'
    );
    expect(restes).toHaveLength(2);
  });

  // BPScript 8030741b0, packages/995-tools/src/verif-un-seul-etage.mjs:25: a step up is no
  // directory of another package.
  it('path.join up by `..` to the root’s scripts/ stays to the project', () => {
    const p = projet({
      'packages/995-tools/src/verif-un-seul-etage.mjs':
        "const { trancher } = await import(path.join(import.meta.dirname, '..', '..', '..', 'scripts', 'dette.mjs'));\n",
      'b.sh': 'node ../scripts/code-mort.mjs\n',
    });
    execFileSync('git', ['-C', p, 'init', '-q']);
    execFileSync('git', ['-C', p, 'add', '.']);
    const restes = restesDe(p) as string[];
    expect(restes).toHaveLength(2);
    expect(restes[1]).toMatch(/^packages\/995-tools\/src\/verif-un-seul-etage\.mjs:1 : /);
    expect(restes[1]).toContain('`@roomi-fields/grillhouse/dette`');
  });

  it('a path into the installed package, or a scripts/ of a package of the project, is not named', () => {
    const p = projet({
      'a.sh': '"file://$1/node_modules/@roomi-fields/grillhouse/scripts/paquets.mjs"\n',
      'b.mjs':
        "path.join(RACINE, 'node_modules', '@roomi-fields', 'grillhouse', 'scripts', 'vitest-config', 'duree.reporter.mjs');\npath.join(RACINE, 'packages', 'a', 'scripts', 'dette.mjs');\n",
    });
    execFileSync('git', ['-C', p, 'init', '-q']);
    execFileSync('git', ['-C', p, 'add', '.']);
    expect(restesDe(p)).toEqual([]);
  });

  it('a tracked path that is no regular file (a submodule, a link to a directory, a file gone) is skipped', () => {
    const p = projet({ 'outils/a.sh': 'node scripts/code-mort.mjs\n', 'outils/parti.sh': '' });
    mkdirSync(path.join(p, 'vendor/moteur'), { recursive: true });
    execFileSync('git', ['-C', p, 'init', '-q']);
    execFileSync('git', ['-C', p, 'add', '.']);
    execFileSync('git', [
      '-C',
      p,
      'update-index',
      '--add',
      '--cacheinfo',
      `160000,${'1'.repeat(40)},vendor/moteur`,
    ]);
    symlinkSync('vendor/moteur', path.join(p, 'lien'));
    execFileSync('git', ['-C', p, 'add', 'lien']);
    rmSync(path.join(p, 'outils/parti.sh'));
    const restes = restesDe(p) as string[];
    expect(restes).toHaveLength(1);
    expect(restes[0]).toMatch(/^outils\/a\.sh:1 : /);
  });

  it('a script the project still holds at that address is its own, and not named', () => {
    const p = projet({
      'scripts/code-mort.mjs': '',
      'outils/a.sh': 'node scripts/code-mort.mjs\n',
    });
    execFileSync('git', ['-C', p, 'init', '-q']);
    execFileSync('git', ['-C', p, 'add', '.']);
    expect(restesDe(p)).toEqual([]);
  });

  it('a modified copy of a removed role is named once, by this migration, not by the one of the copies', () => {
    const f = '.claude/agents/regulateur.md';
    const p = projet({
      [f]: 'Modifié.\n',
      '.claude/grillhouse/fichiers.txt': '.claude/agents/\n',
      '.claude/grillhouse/empreintes.json': JSON.stringify({
        fichiers: { [f]: createHash('sha256').update('copie\n').digest('hex') },
      }),
    });
    const tout = migrerTout(p, '0.22.2') as { aFaire: string[] }[];
    const sur = tout.flatMap(r => r.aFaire).filter(l => l.startsWith(f));
    expect(sur).toHaveLength(1);
    expect(sur[0]).toContain('rôle que la 0.24.0 supprime');
    expect(existsSync(path.join(p, f))).toBe(true);
  });
});
