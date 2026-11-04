import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// Ticket grillhouse-44b.9, critères 1, 2, 6, 7, 8, 9 et 10 : le crochet d'écriture des agents
// (sous-commande `style-a-l-ecriture`, PostToolUse de Write, Edit et MultiEdit) applique au fichier
// écrit seul la mise en forme et les corrections automatiques du lint, depuis le paquet qui porte
// le fichier ; un constat que rien ne corrige est rendu à l'agent (`additionalContext` du crochet,
// avec `<fichier>:<ligne>` et la règle), sans jamais bloquer ni échouer.

const DEPOT = path.resolve(__dirname, '../../../..');
const SCRIPT = path.join(DEPOT, 'packages/grillhouse/scripts/style-a-l-ecriture.mjs');
const CROCHET = path.join(DEPOT, 'mods/grillhouse/hooks/crochet.mjs');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'style-a-l-ecriture-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const lire = (racine: string, f: string) => readFileSync(path.join(racine, f), 'utf8');
const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;

const MAL_FORME = 'const  a = {b:1}\nif (a) console.log(a)\n';
const BIEN_FORME = 'const a = { b: 1 };\nif (a) {\n  console.log(a);\n}\n';
// Rien ne corrige `no-unused-vars` : le constat est à la ligne 3.
const NON_CORRIGEABLE = 'const a = 1;\nexport const b = a;\nconst inutile = 3;\n';

// Un projet d'essai : la racine couvre `tools/` et `packages/` ; `a` couvre `src/` et change la
// mise en forme (guillemets doubles) ; `b` couvre `lib/` seulement.
function projet({ outils = true } = {}) {
  const r = mkdtempSync(path.join(ESSAIS, 'projet-'));
  ecrire(
    r,
    'package.json',
    json({
      name: 'essai',
      private: true,
      workspaces: ['packages/*'],
      scripts: {
        'format:check': 'prettier --check "tools/**/*.js" "packages/**/*.js"',
        lint: 'eslint tools packages --ext .js',
      },
    })
  );
  ecrire(r, '.prettierrc', json({ singleQuote: true, semi: true }));
  ecrire(
    r,
    '.eslintrc.cjs',
    `module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  rules: { curly: ['error', 'all'], 'no-unused-vars': 'error' },
};
`
  );
  ecrire(
    r,
    'packages/a/package.json',
    json({
      name: 'a',
      scripts: {
        'format:check': 'prettier --check "src/**/*.js"',
        lint: 'eslint src --ext .js',
      },
    })
  );
  ecrire(r, 'packages/a/.prettierrc', json({ singleQuote: false, semi: true }));
  ecrire(
    r,
    'packages/b/package.json',
    json({
      name: 'b',
      scripts: {
        'format:check': 'prettier --check "lib/**/*.js"',
        lint: 'eslint lib --ext .js',
      },
    })
  );
  if (outils) {
    symlinkSync(path.join(DEPOT, 'node_modules'), path.join(r, 'node_modules'), 'dir');
  }
  return r;
}

type Sortie = { status: number | null; stdout: string; stderr: string };
const crochet = (r: string, f: string, tool_name = 'Write'): Sortie =>
  spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    input: JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name,
      tool_input: { file_path: path.join(r, f) },
    }),
    cwd: r,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, CLAUDE_PROJECT_DIR: r },
  });
// Ce que le crochet rend à l'agent : le texte de `additionalContext`, '' sans rien.
const rendu = (s: Sortie): string => {
  expect(s.status, s.stderr).toBe(0);
  if (s.stdout.trim() === '') {
    return '';
  }
  const o = JSON.parse(s.stdout) as {
    hookSpecificOutput?: { hookEventName?: string; additionalContext?: string };
  };
  expect(o.hookSpecificOutput?.hookEventName).toBe('PostToolUse');
  return o.hookSpecificOutput?.additionalContext ?? '';
};

describe('critère 1 — le crochet applique la mise en forme et les corrections du lint au fichier écrit', () => {
  it.each(['Write', 'Edit', 'MultiEdit'])(
    'un fichier mal formé écrit par %s est réécrit',
    outil => {
      const r = projet();
      ecrire(r, 'tools/x.js', MAL_FORME);
      expect(rendu(crochet(r, 'tools/x.js', outil))).toBe('');
      expect(lire(r, 'tools/x.js')).toBe(BIEN_FORME);
    }
  );
  it('un fichier déjà juste reste tel quel, le crochet sort sans rien rendre', () => {
    const r = projet();
    ecrire(r, 'tools/x.js', BIEN_FORME);
    expect(rendu(crochet(r, 'tools/x.js'))).toBe('');
    expect(lire(r, 'tools/x.js')).toBe(BIEN_FORME);
  });
  it('une autre sorte d’outil (Bash) ne touche aucun fichier', () => {
    const r = projet();
    ecrire(r, 'tools/x.js', MAL_FORME);
    expect(rendu(crochet(r, 'tools/x.js', 'Bash'))).toBe('');
    expect(lire(r, 'tools/x.js')).toBe(MAL_FORME);
  });
});

describe('critère 2 — un constat que rien ne corrige est rendu à l’agent, avec sa ligne et sa règle', () => {
  it('le constat porte le fichier, la ligne et la règle', () => {
    const r = projet();
    ecrire(r, 'tools/x.js', NON_CORRIGEABLE);
    const texte = rendu(crochet(r, 'tools/x.js'));
    expect(texte).toMatch(/tools\/x\.js:3/);
    expect(texte).toContain('no-unused-vars');
  });
  it('un fichier mal formé ET non corrigeable : mis en forme, et le constat reste rendu', () => {
    const r = projet();
    ecrire(r, 'tools/x.js', `const  inutile = {b:1}\n`);
    const texte = rendu(crochet(r, 'tools/x.js'));
    expect(texte).toMatch(/tools\/x\.js:1/);
    expect(texte).toContain('no-unused-vars');
    expect(lire(r, 'tools/x.js')).toBe('const inutile = { b: 1 };\n');
  });
  it('deux constats sont rendus tous deux, chacun avec sa ligne', () => {
    const r = projet();
    ecrire(r, 'tools/x.js', 'const un = 1;\nconst deux = 2;\n');
    const texte = rendu(crochet(r, 'tools/x.js'));
    expect(texte).toMatch(/tools\/x\.js:1/);
    expect(texte).toMatch(/tools\/x\.js:2/);
  });
});

describe('critère 6 — le crochet ne touche que le fichier écrit, et que s’il est couvert', () => {
  it.each([
    ['docs/note.md', '#  Titre\n\n\n\ntexte\n'],
    ['tools/data.json', '{"a":1,\n"b":   2}\n'],
    ['package-lock.json', '{"a":1,\n"b":   2}\n'],
    ['mods/x/hors-motif.js', MAL_FORME],
  ])('%s, que rien ne couvre, reste tel quel : le crochet sort sans rien rendre', (f, texte) => {
    const r = projet();
    ecrire(r, f, texte);
    expect(rendu(crochet(r, f))).toBe('');
    expect(lire(r, f)).toBe(texte);
  });
  it('un fichier voisin mal formé n’est pas touché', () => {
    const r = projet();
    ecrire(r, 'tools/x.js', MAL_FORME);
    ecrire(r, 'tools/voisin.js', MAL_FORME);
    rendu(crochet(r, 'tools/x.js'));
    expect(lire(r, 'tools/x.js')).toBe(BIEN_FORME);
    expect(lire(r, 'tools/voisin.js')).toBe(MAL_FORME);
  });
  it('un fichier absent ou hors du projet n’échoue pas', () => {
    const r = projet();
    expect(rendu(crochet(r, 'tools/absent.js'))).toBe('');
    expect(rendu(crochet(r, '../hors-du-projet.js'))).toBe('');
  });
});

describe('critère 7 — la configuration et les motifs viennent du paquet qui porte le fichier', () => {
  it('un fichier couvert par le script de son paquet est mis en forme, avec la configuration du paquet', () => {
    const r = projet();
    ecrire(r, 'packages/a/src/x.js', "const s = 'x';\nexport { s };\n");
    rendu(crochet(r, 'packages/a/src/x.js'));
    expect(lire(r, 'packages/a/src/x.js')).toBe('const s = "x";\nexport { s };\n');
  });
  it('sans configuration propre, la configuration de la racine, trouvée en remontant', () => {
    const r = projet();
    ecrire(r, 'packages/b/lib/x.js', 'const s = "x";\nexport { s };\n');
    rendu(crochet(r, 'packages/b/lib/x.js'));
    expect(lire(r, 'packages/b/lib/x.js')).toBe("const s = 'x';\nexport { s };\n");
  });
  it('un fichier hors des motifs du script de son paquet reste tel quel, même couvert par ceux de la racine', () => {
    const r = projet();
    ecrire(r, 'packages/b/src/x.js', MAL_FORME);
    expect(rendu(crochet(r, 'packages/b/src/x.js'))).toBe('');
    expect(lire(r, 'packages/b/src/x.js')).toBe(MAL_FORME);
  });
  it('un constat du lint d’un fichier hors des motifs de son paquet n’est pas rendu', () => {
    const r = projet();
    ecrire(r, 'packages/b/src/x.js', NON_CORRIGEABLE);
    expect(rendu(crochet(r, 'packages/b/src/x.js'))).toBe('');
  });
  it('un fichier que nul paquet ne porte relève des motifs de la racine', () => {
    const r = projet();
    ecrire(r, 'tools/x.js', 'const s = "x";\nexport { s };\n');
    rendu(crochet(r, 'tools/x.js'));
    expect(lire(r, 'tools/x.js')).toBe("const s = 'x';\nexport { s };\n");
  });
  it('un paquet sans script de lint ne voit que la mise en forme', () => {
    const r = projet();
    ecrire(
      r,
      'packages/c/package.json',
      json({ name: 'c', scripts: { 'format:check': 'prettier --check "src/**/*.js"' } })
    );
    ecrire(r, 'packages/c/src/x.js', 'const  inutile = {b:1}\n');
    expect(rendu(crochet(r, 'packages/c/src/x.js'))).toBe('');
    expect(lire(r, 'packages/c/src/x.js')).toBe('const inutile = { b: 1 };\n');
  });
});

describe('critère 8 — le crochet n’échoue jamais sur l’outil lui-même', () => {
  it('un projet sans Prettier ni ESLint installé ne voit aucun effet', () => {
    const r = projet({ outils: false });
    ecrire(r, 'tools/x.js', MAL_FORME);
    const s = crochet(r, 'tools/x.js');
    expect(rendu(s)).toBe('');
    expect(s.stderr).toBe('');
    expect(lire(r, 'tools/x.js')).toBe(MAL_FORME);
  });
  it('un projet sans package.json ne voit aucun effet', () => {
    const r = mkdtempSync(path.join(ESSAIS, 'nu-'));
    ecrire(r, 'x.js', MAL_FORME);
    expect(rendu(crochet(r, 'x.js'))).toBe('');
    expect(lire(r, 'x.js')).toBe(MAL_FORME);
  });
  it('une syntaxe invalide est rendue comme constat, avec sa ligne, sans interrompre', () => {
    const r = projet();
    const mauvais = 'const a = 1;\nconst = ;\n';
    ecrire(r, 'tools/x.js', mauvais);
    const texte = rendu(crochet(r, 'tools/x.js'));
    expect(texte).toMatch(/tools\/x\.js:2/);
    expect(lire(r, 'tools/x.js')).toBe(mauvais);
  });
  it('une syntaxe invalide dans un paquet est rendue de même', () => {
    const r = projet();
    ecrire(r, 'packages/a/src/x.js', 'export const a = ;\n');
    expect(rendu(crochet(r, 'packages/a/src/x.js'))).toMatch(/packages\/a\/src\/x\.js:1/);
  });
  it('une entrée qui n’est pas du JSON sort 0 sans rien rendre', () => {
    const r = projet();
    const s = spawnSync(process.execPath, [SCRIPT], {
      encoding: 'utf8',
      input: 'pas du json',
      cwd: r,
      env: { PATH: process.env.PATH, CLAUDE_PROJECT_DIR: r },
    });
    expect(rendu(s)).toBe('');
  });
});

describe('critère 9 — un constat revient à chaque écriture tant qu’il subsiste, sans bloquer', () => {
  it('le même constat est rendu à deux écritures de suite, le crochet sortant 0 chaque fois', () => {
    const r = projet();
    ecrire(r, 'tools/x.js', NON_CORRIGEABLE);
    const premier = crochet(r, 'tools/x.js');
    const second = crochet(r, 'tools/x.js');
    expect(premier.status).toBe(0);
    expect(second.status).toBe(0);
    expect(rendu(premier)).toMatch(/tools\/x\.js:3/);
    expect(rendu(second)).toMatch(/tools\/x\.js:3/);
  });
  it('le constat cesse quand l’agent le corrige', () => {
    const r = projet();
    ecrire(r, 'tools/x.js', NON_CORRIGEABLE);
    expect(rendu(crochet(r, 'tools/x.js'))).not.toBe('');
    ecrire(r, 'tools/x.js', 'const a = 1;\nexport const b = a;\n');
    expect(rendu(crochet(r, 'tools/x.js'))).toBe('');
  });
});

describe('critère 10 — le crochet joue par le greffon et la sous-commande grillhouse', () => {
  const hooks = () =>
    JSON.parse(readFileSync(path.join(DEPOT, 'mods/grillhouse/hooks/hooks.json'), 'utf8')) as {
      hooks: Record<string, { matcher?: string; hooks: { command: string }[] }[]>;
    };
  it('hooks.json déclare PostToolUse pour Write, Edit et MultiEdit, par crochet.mjs', () => {
    const groupes = hooks().hooks.PostToolUse ?? [];
    expect(groupes).toHaveLength(1);
    expect(groupes[0].matcher?.split('|').sort()).toEqual(['Edit', 'MultiEdit', 'Write']);
    expect(groupes[0].hooks.map(h => h.command)).toEqual([
      'node "${CLAUDE_PLUGIN_ROOT}/hooks/crochet.mjs" style-a-l-ecriture',
    ]);
  });
  it('de bout en bout, crochet.mjs puis `grillhouse style-a-l-ecriture` depuis CLAUDE_PROJECT_DIR', () => {
    const r = projet();
    ecrire(r, 'tools/x.js', MAL_FORME);
    const s = spawnSync(process.execPath, [CROCHET, 'style-a-l-ecriture'], {
      encoding: 'utf8',
      input: JSON.stringify({
        hook_event_name: 'PostToolUse',
        tool_name: 'Edit',
        tool_input: { file_path: path.join(r, 'tools/x.js') },
      }),
      cwd: r,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        CLAUDE_PROJECT_DIR: r,
        CLAUDE_PLUGIN_ROOT: path.join(DEPOT, 'mods/grillhouse'),
      },
    });
    expect(rendu(s)).toBe('');
    expect(lire(r, 'tools/x.js')).toBe(BIEN_FORME);
  });
});
