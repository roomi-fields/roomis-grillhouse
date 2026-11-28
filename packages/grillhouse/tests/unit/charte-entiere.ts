// The common charter as a reader of CLAUDE.md receives it: charte.md, the core, and the modules it
// imports by a relative path (`@charte/<module>.md`), which Claude Code reads whole. As Claude Code
// does, an import inside a block of code or a span of code is none.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const CHARTE = path.resolve(__dirname, '../../../../mods/grillhouse/charte.md');

// The paths of the modules the text <texte> imports, relative to the charter, in their order.
export function importsDeLaCharte(texte: string): string[] {
  const sansCode = texte.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
  return [...sansCode.matchAll(/(?<![^\s(])@(charte\/[\w-]+\.md)/g)].map(m => m[1]!);
}

// The core, each module imported by its name, and the whole text: the core, then the modules.
export function lireLaCharte(fichier = CHARTE) {
  const noyau = readFileSync(fichier, 'utf8');
  const modules: Record<string, string> = {};
  for (const f of importsDeLaCharte(noyau)) {
    const chemin = path.join(path.dirname(fichier), f);
    modules[path.basename(f, '.md')] = existsSync(chemin) ? readFileSync(chemin, 'utf8') : '';
  }
  return { noyau, modules, entiere: [noyau, ...Object.values(modules)].join('\n\n') };
}
