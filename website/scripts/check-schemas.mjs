#!/usr/bin/env node
/**
 * Every documentation page must carry its own structured data.
 *
 * A build can succeed while a page renders no structured data at all: a JSON
 * string corrupted on its way through frontmatter, or a lookup key that does
 * not match the document id, leaves the page silent. Run after
 * `docusaurus build`, against the built HTML rather than the source, because
 * what matters is what a crawler receives.
 *
 * Usage:  node scripts/check-schemas.mjs
 */

import { readFileSync, readdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const websiteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = join(websiteRoot, 'build');

/** Pages that are not documentation and carry no page-level schema. */
const EXEMPT = new Set(['404.html', 'changelog.html']);

const REQUIRED = ['url', 'description', 'dateModified', 'publisher', 'isPartOf', 'about'];

function blocks(html) {
  const found = [];
  const re = /<script[^>]*ld\+json[^>]*>([\s\S]*?)<\/script>/g;
  for (const match of html.matchAll(re)) {
    try {
      found.push(JSON.parse(match[1]));
    } catch (e) {
      found.push({ __unparseable: e instanceof Error ? e.message : String(e) });
    }
  }
  return found;
}

const problems = [];
let checked = 0;

for (const file of readdirSync(buildDir).filter(f => f.endsWith('.html'))) {
  if (EXEMPT.has(file)) continue;

  const parsed = blocks(readFileSync(join(buildDir, file), 'utf-8'));

  const broken = parsed.find(b => b.__unparseable);
  if (broken) {
    problems.push(`${file}: a structured-data block does not parse — ${broken.__unparseable}`);
    continue;
  }

  const page = parsed.find(b => !b['@graph'] && b['@type'] !== 'BreadcrumbList');
  if (!page) {
    problems.push(`${file}: no page-level structured data (only the site-wide block)`);
    continue;
  }

  const missing = REQUIRED.filter(key => !page[key]);
  if (missing.length) {
    problems.push(`${file}: ${page['@type']} is missing ${missing.join(', ')}`);
    continue;
  }

  if (page['@type'] === 'HowTo' && !(page.step?.length >= 2)) {
    problems.push(`${file}: HowTo with fewer than two steps`);
    continue;
  }

  checked += 1;
}

if (problems.length) {
  console.error('✗ structured data is missing or broken:');
  for (const p of problems) console.error(`    ${p}`);
  console.error('\nRebuild and check website/src/page-schemas.json and the DocItem wrapper.');
  process.exit(1);
}

console.log(`✓ ${checked} pages carry their own structured data`);
