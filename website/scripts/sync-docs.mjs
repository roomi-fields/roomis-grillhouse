#!/usr/bin/env node

/**
 * Bring the repository's changelog into the site, and write each page's
 * structured data.
 *
 * Source:  packages/grillhouse/CHANGELOG.md, and the pages of website/docs/
 * Target:  website/docs/CHANGELOG.md and website/src/page-schemas.json
 *          (regenerated on every build, gitignored)
 *
 * The changelog keeps one source of truth, the file the release writes. The
 * pages of the site are written for the site, in website/docs/, and carry
 * their own frontmatter; this script reads it to build their structured data.
 */

import { execFileSync } from 'node:child_process';

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const websiteRoot = resolve(__dirname, '..');
const repoRoot = resolve(websiteRoot, '..');
const docsDir = resolve(websiteRoot, 'docs');

/**
 * What each page *is*, for the machines.
 *
 *   HowTo    — a procedure the reader follows, steps taken from its H2s
 *   TechArticle (default) — reference and explanation
 */
const SCHEMA_TYPE = {
  'getting-started.md': 'HowTo',
};

/** The date of the last commit that touched a file, the date its content changed. */
function lastCommitDate(file) {
  try {
    const iso = execFileSync('git', ['log', '-1', '--format=%cI', '--', file], {
      cwd: repoRoot,
      encoding: 'utf-8',
    }).trim();
    if (iso) return iso;
  } catch {
    // no git, or a shallow clone with no commit touching this file
  }
  return null;
}

const ORGANIZATION_ID = 'https://roomi-fields.com/#organization';
const WEBSITE_ID = 'https://grillhouse.roomi-fields.com/#website';
const SOFTWARE_ID = 'https://grillhouse.roomi-fields.com/#software';

/** Strip markdown decoration from a heading so the schema carries plain text. */
function plainText(markdown) {
  return markdown
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Headings of one level, in document order, skipping fenced code blocks. */
function headings(body, level) {
  const marker = '#'.repeat(level);
  const out = [];
  let fenced = false;
  for (const line of body.split('\n')) {
    if (line.startsWith('```')) fenced = !fenced;
    if (fenced) continue;
    if (line.startsWith(`${marker} `)) out.push(plainText(line.slice(marker.length)));
  }
  return out;
}

/**
 * The frontmatter of a page, split from its body. The pages write each value
 * as one quoted YAML string on one line, as Prettier leaves it: single-quoted
 * (`title: '…'`, a quote doubled inside) or, when the value holds a single
 * quote, double-quoted (`title: "…"`, read as JSON).
 */
function splitFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return { meta: {}, body: text };
  const meta = {};
  for (const line of match[1].split('\n')) {
    const single = line.match(/^(\w+):\s*'(.*)'\s*$/);
    const double = line.match(/^(\w+):\s*(".*")\s*$/);
    if (single) meta[single[1]] = single[2].replace(/''/g, "'");
    else if (double) meta[double[1]] = JSON.parse(double[2]);
  }
  return { meta, body: text.slice(match[0].length) };
}

/** Headings that organise a page without being a step in it. */
const NOT_A_STEP = /^(next steps|see also|related|overview|summary|links)$/i;

/**
 * Build the page's own structured data. Returns null when the page has nothing
 * truthful to say.
 */
function buildSchema(file, body, meta, modified) {
  const type = SCHEMA_TYPE[file] ?? 'TechArticle';
  const name = meta.title ?? headings(body, 1)[0] ?? '';
  if (!name || !meta.description) return null;

  const common = {
    '@context': 'https://schema.org',
    '@type': type,
    name,
    description: meta.description,
    inLanguage: 'en',
    datePublished: '2026-10-07',
    dateModified: modified ? modified.slice(0, 10) : new Date().toISOString().slice(0, 10),
    publisher: { '@id': ORGANIZATION_ID },
    isPartOf: { '@id': WEBSITE_ID },
    about: { '@id': SOFTWARE_ID },
  };

  if (type === 'HowTo') {
    const steps = headings(body, 2)
      .filter(text => text && !NOT_A_STEP.test(text))
      .map((text, i) => ({ '@type': 'HowToStep', position: i + 1, name: text }));
    if (steps.length < 2) return { ...common, '@type': 'TechArticle' };
    return { ...common, step: steps };
  }

  return common;
}

function renderFrontmatter(meta) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(meta)) {
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.map(v => JSON.stringify(v)).join(', ')}]`);
    } else if (typeof value === 'string') {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else if (value && typeof value === 'object') {
      lines.push(`${key}:`);
      for (const [k, v] of Object.entries(value)) lines.push(`  ${k}: ${JSON.stringify(v)}`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push('---', '');
  return lines.join('\n');
}

mkdirSync(docsDir, { recursive: true });

/**
 * Per-page structured data, keyed by document id. It travels in its own file
 * rather than in each page's frontmatter: a JSON string carried through YAML
 * and MDX comes out the other end corrupted.
 */
const schemas = {};

for (const file of readdirSync(docsDir)) {
  if (!file.endsWith('.md') || file === 'CHANGELOG.md') continue;
  const path = resolve(docsDir, file);
  const { meta, body } = splitFrontmatter(readFileSync(path, 'utf-8'));
  const schema = buildSchema(file, body, meta, lastCommitDate(path));
  if (schema) schemas[file.replace(/\.md$/, '')] = schema;
  console.log(`  ${file}`);
}

// Sync packages/grillhouse/CHANGELOG.md → website/docs/CHANGELOG.md
{
  const changelogSrc = resolve(repoRoot, 'packages/grillhouse/CHANGELOG.md');
  const changelogDst = resolve(docsDir, 'CHANGELOG.md');
  const changelogDate = lastCommitDate(changelogSrc);
  const fm = renderFrontmatter({
    title: 'Release history and per-version changelog',
    description:
      'The per-version changelog of Roomi’s Grillhouse: what each release added, changed and fixed.',
    keywords: ['grillhouse changelog', 'grillhouse release history', 'grillhouse versions'],
    sidebar_position: 99,
    slug: '/changelog',
    ...(changelogDate ? { last_update: { date: changelogDate } } : {}),
  });
  let body = readFileSync(changelogSrc, 'utf-8');
  body = body.replace(/^#\s+Changelog\s*\n+/, '');
  writeFileSync(changelogDst, fm + body, 'utf-8');
  console.log('  CHANGELOG.md');
}

writeFileSync(
  resolve(websiteRoot, 'src', 'page-schemas.json'),
  `${JSON.stringify(schemas, null, 2)}\n`,
  'utf-8'
);
console.log(`  page-schemas.json (${Object.keys(schemas).length} pages)`);

console.log('Docs sync complete.');
