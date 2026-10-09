#!/usr/bin/env node
// The index of the interfaces: one line per component, then one line per element it provides,
// generated from the components' `docs/INTERFACE.md`. An agent loads it at start and opens an
// interface, then one of its sections, only when the index names it.
//
//   node scripts/index-interfaces.mjs            writes docs/agents/index-des-interfaces.md
//   node scripts/index-interfaces.mjs --verifier refuses (exit 1) when that file is out of date
//
// An interface is found at `packages/<x>/docs/INTERFACE.md`, `src/<x>/docs/INTERFACE.md` and
// `docs/INTERFACE.md`. Its title and first sentence give the component's line; each `##` and
// `###` heading, with the first sentence under it, gives an element's line.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const SORTIE = 'docs/agents/index-des-interfaces.md';

// The interface files of the repository at <racine>, as paths relative to it, in a stable order.
export function interfaces(racine) {
  const found = [];
  for (const parent of ['packages', 'src']) {
    const dir = path.join(racine, parent);
    if (!existsSync(dir)) continue;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const rel = path.join(parent, e.name, 'docs', 'INTERFACE.md');
      if (e.isDirectory() && existsSync(path.join(racine, rel))) found.push(rel);
    }
  }
  if (existsSync(path.join(racine, 'docs', 'INTERFACE.md'))) found.push('docs/INTERFACE.md');
  return found.sort();
}

const firstSentence = lines => {
  const text = lines.join(' ').replace(/\s+/g, ' ').trim();
  const m = /^(.+?[.!?])(\s|$)/.exec(text);
  return m ? m[1] : text;
};

// The index lines of one interface: its component line, then one line per heading.
export function entrees(rel, contenu) {
  const lignes = contenu.split('\n');
  const composant = rel === 'docs/INTERFACE.md' ? '(racine)' : rel.split('/')[1];
  const titre = (lignes.find(l => l.startsWith('# ')) ?? `# ${composant}`).slice(2).trim();
  const sections = [];
  let courante = { niveau: 1, titre, corps: [] };
  const fermer = () => sections.push(courante);
  for (const l of lignes) {
    const m = /^(#{1,3}) (.+)$/.exec(l);
    if (m) {
      if (m[1].length === 1) continue;
      fermer();
      courante = { niveau: m[1].length, titre: m[2].trim(), corps: [] };
    } else if (l.trim() && !l.startsWith('|') && !l.startsWith('```')) {
      if (courante.corps.length < 6) courante.corps.push(l.replace(/^[-*]\s+/, ''));
    }
  }
  fermer();
  const [tete, ...reste] = sections;
  const out = [
    `## ${composant} — ${tete.titre}`,
    '',
    `${firstSentence(tete.corps)} (\`${rel}\`)`,
    '',
  ];
  for (const s of reste) {
    const indent = s.niveau === 3 ? '  ' : '';
    const phrase = firstSentence(s.corps);
    out.push(`${indent}- **${s.titre}**${phrase ? ` — ${phrase}` : ''}`);
  }
  out.push('');
  return out;
}

export function index(racine) {
  const corps = interfaces(racine).flatMap(rel =>
    entrees(rel, readFileSync(path.join(racine, rel), 'utf8'))
  );
  return [
    '# Index des interfaces',
    '',
    'Généré par `node scripts/index-interfaces.mjs` depuis les `INTERFACE.md` ; ne pas éditer.',
    "Une ligne par composant, puis une par élément qu'il fournit ; l'interface donne le détail.",
    '',
    ...corps,
  ].join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const racine = process.cwd();
  const attendu = index(racine);
  const cible = path.join(racine, SORTIE);
  if (process.argv.includes('--verifier')) {
    const present = existsSync(cible) ? readFileSync(cible, 'utf8') : '';
    if (present !== attendu) {
      process.stderr.write(
        `⛔ ${SORTIE} n'est pas à jour avec les interfaces : node scripts/index-interfaces.mjs le régénère.\n`
      );
      process.exit(1);
    }
  } else {
    writeFileSync(cible, attendu);
  }
}
