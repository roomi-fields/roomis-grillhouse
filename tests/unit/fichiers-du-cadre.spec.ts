// grillhouse-3uv.29, critère 11: the list of the frame's files (.claude/grillhouse/fichiers.txt)
// covers every file that one of its files calls or imports — `bash …`, `node …`, `import … from`,
// a path under scripts/ — so that a project updated by `grillhouse:maj` receives everything its
// scripts call. The guard reads the frame's files through what grillhouse-maj publishes (lireListe,
// fichiersDuCadre) and resolves each reference the way the caller does: from the caller's directory
// for a relative path, from the root of the repository for a path under scripts/.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fichiersDuCadre, lireListe } from '../../scripts/grillhouse-maj.mjs';

const RACINE = path.resolve(__dirname, '../..');
const LISTE = '.claude/grillhouse/fichiers.txt';
const SCRIPT = /\.(?:sh|bash|mjs|cjs|js|py)$/;
// A path-like token ending with a script extension.
const JETON = /[\w.$/{}-]*[\w-]+\.(?:sh|bash|mjs|cjs|js|py)\b/g;
// The same token, called by `bash`, `node` or imported by `import … from`.
const APPEL = /\b(?:bash|node|from)\s+["'`]?([\w.$/{}-]*[\w-]+\.(?:sh|bash|mjs|cjs|js|py))\b/g;
const SOUS_SCRIPTS = /(?:^|[^\w./-])(scripts\/[\w./-]+\.(?:sh|bash|mjs|cjs|js|py))\b/g;

const estFichier = (racine: string, rel: string) => {
  const abs = path.join(racine, rel);
  return existsSync(abs) && statSync(abs).isFile();
};
const dansLeDepot = (rel: string) => rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);

// The files of the repository that a frame file calls or imports.
function appeles(racine: string, fichier: string): string[] {
  const texte = readFileSync(path.join(racine, fichier), 'utf8');
  const dossier = path.dirname(fichier);
  const out = new Set<string>();
  // A called file is any file reached by `bash`, `node` or `import … from`; any other token counts
  // only when it reaches a file under scripts/ (a configuration the project writes, named in a
  // string, is not called).
  const garder = (rel: string, appel: boolean) => {
    const n = path.normalize(rel);
    if (
      dansLeDepot(n) &&
      n !== fichier &&
      (appel || n.startsWith('scripts/')) &&
      estFichier(racine, n)
    ) {
      out.add(n);
    }
  };
  for (const m of texte.matchAll(SOUS_SCRIPTS)) {
    garder(m[1] ?? '', true);
  }
  if (SCRIPT.test(fichier)) {
    const appels = new Set([...texte.matchAll(APPEL)].map(m => m[1] ?? ''));
    for (const m of texte.matchAll(JETON)) {
      const jeton = m[0] ?? '';
      // `$ici/../x.sh`, `${racine}/scripts/x.sh`: the variable stands for a directory; what
      // follows it is the path, relative to the caller or to the root.
      const brut = jeton.replace(/^.*\$\{?\w+\}?\/?/, '').replace(/^\/+/, '');
      if (!brut) {
        continue;
      }
      garder(path.join(dossier, brut), appels.has(jeton));
      garder(brut, appels.has(jeton));
    }
  }
  return [...out];
}

// The files a frame file calls or imports that the list does not cover, as « caller → called ».
function manquants(racine: string): string[] {
  const { garder } = lireListe(readFileSync(path.join(racine, LISTE), 'utf8'));
  const couverts = new Set<string>(fichiersDuCadre(racine, garder) as string[]);
  const out: string[] = [];
  for (const f of [...couverts].sort()) {
    for (const a of appeles(racine, f).sort()) {
      if (!couverts.has(a)) {
        out.push(`${f} → ${a}`);
      }
    }
  }
  return out;
}

function depot(fichiers: Record<string, string>) {
  const r = mkdtempSync(path.join(tmpdir(), 'cadre-liste-'));
  for (const [f, t] of Object.entries(fichiers)) {
    mkdirSync(path.dirname(path.join(r, f)), { recursive: true });
    writeFileSync(path.join(r, f), t);
  }
  return r;
}

describe('critère 11 — the list of the frame covers every file its files call or import', () => {
  it('critère 11: in this repository, every file a frame file calls or imports is in the list', () => {
    expect(manquants(RACINE)).toEqual([]);
  });

  it('critère 11: the preparation of the working copies, called by the three copies, is in the list', () => {
    const { garder } = lireListe(readFileSync(path.join(RACINE, LISTE), 'utf8'));
    expect(fichiersDuCadre(RACINE, garder)).toContain('scripts/sous-modules.sh');
  });

  it('critère 11: the guard sees `bash`, `node`, `import … from`, `new URL` and a path under scripts/', () => {
    const r = depot({
      [LISTE]: 'scripts/outils/\nscripts/nuit.sh\n.claude/skills/x/\n',
      'scripts/outils/a.mjs':
        "import { b } from '../b.mjs';\nconst c = new URL('../c.sh', import.meta.url);\n",
      'scripts/nuit.sh':
        'ici="$(dirname "$0")"\nbash "$ici/d.sh"\nnode "$racine/scripts/e.mjs"\nbash outil-racine.sh\n',
      '.claude/skills/x/SKILL.md': 'Lance `node scripts/f.mjs --texte`.\n',
      'scripts/b.mjs': '',
      'scripts/c.sh': '',
      'scripts/d.sh': '',
      'scripts/e.mjs': '',
      'scripts/f.mjs': '',
      'outil-racine.sh': '',
    });
    expect(manquants(r)).toEqual([
      '.claude/skills/x/SKILL.md → scripts/f.mjs',
      'scripts/nuit.sh → outil-racine.sh',
      'scripts/nuit.sh → scripts/d.sh',
      'scripts/nuit.sh → scripts/e.mjs',
      'scripts/outils/a.mjs → scripts/b.mjs',
      'scripts/outils/a.mjs → scripts/c.sh',
    ]);
  });

  it('critère 11: a file covered by a listed directory, one the repository lacks, or a configuration named in a string, is not missing', () => {
    const r = depot({
      [LISTE]: 'scripts/outils/\n',
      'scripts/outils/a.sh':
        'bash "$(dirname "$0")/b.sh"\nnode scripts/outils/c.mjs\nnode scripts/projet-seul.mjs\n' +
        "const CONFIGURATION = '.config-du-projet.cjs';\n",
      'scripts/outils/b.sh': '',
      '.config-du-projet.cjs': '',
      'scripts/outils/c.mjs': '',
    });
    expect(manquants(r)).toEqual([]);
  });

  it('critère 11: a file outside the list is not read, so what it calls is not required', () => {
    const r = depot({
      [LISTE]: 'scripts/a.sh\n',
      'scripts/a.sh': 'echo a\n',
      'scripts/hors-cadre.sh': 'bash scripts/b.sh\n',
      'scripts/b.sh': '',
    });
    expect(manquants(r)).toEqual([]);
  });
});
