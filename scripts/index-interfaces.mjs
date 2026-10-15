#!/usr/bin/env node
// The index of the interfaces: one line per component, then one line per element it provides,
// generated from the components' `docs/INTERFACE.md`. An agent loads it at start and opens an
// interface, then one of its sections, only when the index names it.
//
//   node scripts/index-interfaces.mjs            writes docs/agents/index-des-interfaces.md
//   node scripts/index-interfaces.mjs --verifier refuses (exit 1) when that file is out of date
//   node scripts/index-interfaces.mjs --publie <composant>
//                                                prints what the providers of <composant> publish
//
// The providers of a component are the components whose `## Consommateurs` section names it: the
// frame's one written and checked record of who uses whom (scripts/consommateurs.mjs). The launcher
// (scripts/enveloppe/lancer.sh) writes the section `--publie` prints after the instruction of a role
// agent; the relecteur prints it by the same command.
//
// An interface is found at `packages/<x>/docs/INTERFACE.md` and `src/<x>/docs/INTERFACE.md` for
// each component of `composants` (a package out of the frame has none), and at
// `docs/INTERFACE.md`. Its title and first sentence give the component's line, headed by the title
// alone when the title already begins with the component's folder name (exact case, followed by a
// blank or ending the title), else by `<component> — <title>`; the root interface is always
// headed `(racine) — <title>`. Each `##` and `###` heading of the generated part (between the
// marks `<!-- généré: début -->` and `<!-- généré: fin -->`, written by `npm run api`), with the
// first sentence under it, gives an element's line; a heading outside the generated part gives
// none, and an interface without marks (the root one) gives no element line. Code blocks (``` or
// ~~~, indented or not) are skipped whole. The `## Consommateurs` section gives one line that
// names each consumer with the elements it uses.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { composants, declares } from './consommateurs.mjs';
import { DEBUT, FIN, marques } from './interfaces-contre-code.mjs';

export const SORTIE = 'docs/agents/index-des-interfaces.md';

// The interface files of the repository at <racine>, as paths relative to it, in a stable order:
// the interface of each component that `composants` gives, and the root interface.
export function interfaces(racine) {
  const found = composants(racine)
    .map(c => path.relative(racine, path.join(c.dir, 'docs', 'INTERFACE.md')))
    .filter(rel => existsSync(path.join(racine, rel)));
  if (existsSync(path.join(racine, 'docs', 'INTERFACE.md'))) found.push('docs/INTERFACE.md');
  return found.sort();
}

// The heading of a component's line: the title as it is when it already begins with the component's
// name, exact case, followed by a blank or ending the title; else the name, a dash, the title.
const tetiere = (composant, titre) =>
  composant !== '(racine)' &&
  titre.startsWith(composant) &&
  (titre.length === composant.length || /\s/.test(titre[composant.length]))
    ? titre
    : `${composant} — ${titre}`;

const firstSentence = lines => {
  const text = lines.join(' ').replace(/\s+/g, ' ').trim();
  const m = /^(.+?[.!?])(\s|$)/.exec(text);
  return m ? m[1] : text;
};

// One interface read once: its component, its heading, its first sentence, and its parts in their
// order, each an element of its generated part `{ titre, phrase }` or its declared consumers
// `{ consommateurs }` (Map consumer → Set of element names).
export function lire(rel, contenu) {
  const lignes = contenu.split('\n');
  const composant = rel === 'docs/INTERFACE.md' ? '(racine)' : rel.split('/')[1];
  const titre = (lignes.find(l => l.startsWith('# ')) ?? `# ${composant}`).slice(2).trim();
  const sections = [];
  let courante = { niveau: 1, titre, corps: [] };
  const fermer = () => sections.push(courante);
  let cloture = null;
  // The generated part is read where the check finds its marks; invalid marks give none.
  const m0 = marques(contenu);
  let generee = false;
  for (const [i, l] of lignes.entries()) {
    // A code block is skipped whole: a `## …` written inside it is code, not a heading.
    const f = /^\s*(```|~~~)/.exec(l);
    if (cloture) {
      if (f && f[1] === cloture) cloture = null;
      continue;
    }
    if (f) {
      cloture = f[1];
      continue;
    }
    if (l.trim() === DEBUT || l.trim() === FIN) {
      fermer();
      generee = m0.etat === 'ok' && i === m0.debut;
      courante = { niveau: 2, titre: '', corps: [], generee, ignoree: true };
      continue;
    }
    const m = /^(#{1,3}) (.+)$/.exec(l);
    if (m) {
      if (m[1].length === 1) continue;
      fermer();
      courante = { niveau: m[1].length, titre: m[2].trim(), corps: [], generee };
    } else if (l.trim() && !l.startsWith('|')) {
      if (courante.corps.length < 6 || courante.titre === 'Consommateurs')
        courante.corps.push(l.replace(/^[-*]\s+/, ''));
    }
  }
  fermer();
  const [tete, ...reste] = sections;
  const parties = [];
  for (const s of reste) {
    if (s.ignoree) continue;
    if (s.niveau === 2 && s.titre === 'Consommateurs') {
      parties.push({
        consommateurs: declares(`## Consommateurs\n${s.corps.map(l => `- ${l}`).join('\n')}`),
      });
    } else if (s.generee) {
      parties.push({ titre: s.titre, phrase: firstSentence(s.corps) });
    }
  }
  return {
    rel,
    composant,
    tetiere: tetiere(composant, tete.titre),
    phrase: firstSentence(tete.corps),
    parties,
  };
}

// The index lines of one interface: its component line, then one line per heading.
export function entrees(rel, contenu) {
  const { tetiere: t, phrase, parties } = lire(rel, contenu);
  const out = [`## ${t}`, '', `${phrase} (\`${rel}\`)`, ''];
  for (const p of parties) {
    if (p.consommateurs) {
      const liste = [...p.consommateurs]
        .map(([qui, noms]) => `${qui} (${[...noms].join(', ')})`)
        .join(' ; ');
      out.push(`- **Consommateurs** — ${liste || 'aucun'}`);
    } else {
      out.push(`- **${p.titre}**${p.phrase ? ` — ${p.phrase}` : ''}`);
    }
  }
  out.push('');
  return out;
}

const TITRE_PUBLIE = "## Ce que les composants d'avant publient";

// What the components before <composant> publish, as the section the launcher writes after the
// instruction of a role agent (scripts/enveloppe/lancer.sh). <composant> is the component's path
// in the repository at <racine> (`packages/a`, `src/parser`), or `.` for a copy of the whole
// repository. Its providers are the components whose `## Consommateurs` section names it; for
// each, its first sentence, the elements declared for it, then each element of its generated
// part with its address (`<interface> § <heading>`). Each interface is read once.
export function publie(racine, composant) {
  if (composant === '.') {
    return [
      TITRE_PUBLIE,
      '',
      `Ta copie montre tout le dépôt : \`${SORTIE}\` porte ce que publie chaque composant.`,
    ].join('\n');
  }
  const nom = path.basename(composant);
  const fournisseurs = interfaces(racine)
    .map(rel => lire(rel, readFileSync(path.join(racine, rel), 'utf8')))
    .flatMap(i => {
      const declare = i.parties.find(p => p.consommateurs?.has(nom));
      return declare && i.composant !== nom
        ? [{ ...i, declare: declare.consommateurs.get(nom) }]
        : [];
    });
  if (fournisseurs.length === 0) {
    return [
      TITRE_PUBLIE,
      '',
      `\`${nom}\` ne dépend d’aucun composant : aucune section « Consommateurs » ne le nomme.`,
    ].join('\n');
  }
  const out = [
    TITRE_PUBLIE,
    '',
    `\`${nom}\` dépend de ces composants ; chaque élément publié se lit à son adresse.`,
  ];
  for (const f of fournisseurs) {
    const elements = f.parties.filter(p => !p.consommateurs);
    out.push(
      '',
      `### ${f.tetiere}`,
      '',
      `${f.phrase} (\`${f.rel}\`)`,
      `Déclaré pour \`${nom}\` : ${[...f.declare].join(', ')}.`,
      ''
    );
    if (elements.length === 0) {
      out.push('Son interface n’a pas de part générée : elle dit elle-même ce qu’elle publie.');
    }
    for (const e of elements) {
      out.push(`- ${e.titre}${e.phrase ? ` — ${e.phrase}` : ''} (\`${f.rel}\` § ${e.titre})`);
    }
  }
  return out.join('\n');
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
  const i = process.argv.indexOf('--publie');
  if (i >= 0) {
    const composant = process.argv[i + 1];
    if (!composant) {
      process.stderr.write('usage: node scripts/index-interfaces.mjs --publie <composant>\n');
      process.exit(2);
    }
    process.stdout.write(`${publie(racine, composant)}\n`);
    process.exit(0);
  }
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
