import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const SITE_URL = 'https://grillhouse.roomi-fields.com';
const REPOSITORY = 'https://github.com/roomi-fields/roomis-grillhouse';
const NPM = 'https://www.npmjs.com/package/@roomi-fields/grillhouse';
const PROJECT_PAGE = 'https://roomi-fields.com/projects/grillhouse/';

/** First commit of the project. A real fixed fact, safe to write down. */
const PUBLISHED = '2026-10-07';

/**
 * A hardcoded "last updated" goes stale the day after it is written. It is read
 * from the last commit that touched the site or the changelog instead. Needs the
 * full history, so the deploy workflow checks out with fetch-depth 0.
 */
function lastModified(): string {
  try {
    const iso = execFileSync('git', ['log', '-1', '--format=%cI', '--', '.', '../CHANGELOG.md'], {
      encoding: 'utf8',
    }).trim();
    if (iso) return iso.slice(0, 10);
  } catch {
    // shallow clone, or no git at all — fall through
  }
  return new Date().toISOString().slice(0, 10);
}

/**
 * The version of the frame is the `version` of its npm package. It is read
 * there rather than written here, where it would go stale at the next release.
 */
function frameVersion(): string {
  const manifest = new URL('../packages/grillhouse/package.json', import.meta.url);
  return (JSON.parse(readFileSync(manifest, 'utf8')) as { version: string }).version;
}

const MODIFIED = lastModified();

const DESCRIPTION =
  'Roomi’s Grillhouse, an elephant–goldfish framework for building with Claude Code agents: a grill that decides the architecture, then a circuit per ticket where fresh agents write the tests, the code and the review.';

const config: Config = {
  title: 'Roomi’s Grillhouse',
  tagline: 'An elephant–goldfish framework for building with Claude Code agents',
  favicon: 'img/favicon.svg',

  future: {
    v4: true,
  },

  url: SITE_URL,
  baseUrl: '/',

  organizationName: 'roomi-fields',
  projectName: 'roomis-grillhouse',
  deploymentBranch: 'gh-pages',
  trailingSlash: false,

  onBrokenLinks: 'warn',

  markdown: {
    // The changelog is plain Markdown that names placeholders such as
    // `<commit>` outside code; read as MDX it does not compile. A `.md` file is
    // read as CommonMark, an `.mdx` file as MDX.
    format: 'detect',
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  headTags: [
    {
      tagName: 'script',
      attributes: { type: 'application/ld+json' },
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Organization',
            '@id': 'https://roomi-fields.com/#organization',
            name: 'roomi-fields',
            url: 'https://roomi-fields.com',
            founder: {
              '@type': 'Person',
              name: 'Romain Peyrichou',
              url: 'https://github.com/roomi-fields',
            },
            sameAs: ['https://github.com/roomi-fields', 'https://www.npmjs.com/org/roomi-fields'],
          },
          {
            '@type': 'WebSite',
            '@id': `${SITE_URL}/#website`,
            name: 'Roomi’s Grillhouse',
            url: `${SITE_URL}/`,
            inLanguage: 'en',
            publisher: { '@id': 'https://roomi-fields.com/#organization' },
            datePublished: PUBLISHED,
            dateModified: MODIFIED,
          },
          {
            '@type': 'SoftwareApplication',
            '@id': `${SITE_URL}/#software`,
            name: 'Roomi’s Grillhouse',
            description: DESCRIPTION,
            applicationCategory: 'DeveloperApplication',
            operatingSystem: 'Linux',
            url: `${SITE_URL}/`,
            downloadUrl: NPM,
            codeRepository: REPOSITORY,
            publisher: { '@id': 'https://roomi-fields.com/#organization' },
            author: {
              '@type': 'Person',
              name: 'Romain Peyrichou',
              url: 'https://github.com/roomi-fields',
            },
            license: 'https://opensource.org/licenses/MIT',
            softwareVersion: frameVersion(),
            datePublished: PUBLISHED,
            dateModified: MODIFIED,
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          },
        ],
      }),
    },
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/',
          editUrl: `${REPOSITORY}/tree/main/website/`,
          showLastUpdateTime: true,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
        sitemap: {
          changefreq: 'weekly',
          priority: 0.5,
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    docs: {
      sidebar: { hideable: true },
      versionPersistence: 'localStorage',
    },
    metadata: [
      {
        name: 'keywords',
        content:
          'claude-code, elephant-goldfish-model, spec-driven-development, ai-agents, multi-agent, agentic-coding, code-review, tdd',
      },
      { name: 'description', content: DESCRIPTION },
      { name: 'robots', content: 'index, follow' },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'Roomi’s Grillhouse' },
      { name: 'twitter:card', content: 'summary' },
    ],
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Roomi’s Grillhouse',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docs',
          position: 'left',
          label: 'Docs',
        },
        {
          to: '/changelog',
          label: 'Releases',
          position: 'left',
        },
        {
          href: NPM,
          label: 'npm',
          position: 'right',
        },
        {
          href: REPOSITORY,
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'The model',
          items: [
            { label: 'Elephant and goldfish', to: '/elephant-goldfish' },
            { label: 'The circuit of a ticket', to: '/circuit' },
            { label: 'The grill', to: '/grill' },
          ],
        },
        {
          title: 'Start',
          items: [
            { label: 'Getting started', to: '/getting-started' },
            { label: 'Release history', to: '/changelog' },
          ],
        },
        {
          title: 'Project',
          items: [
            { label: 'GitHub', href: REPOSITORY },
            { label: 'npm', href: NPM },
            { label: 'Issues', href: `${REPOSITORY}/issues` },
            { label: 'roomi-fields.com', href: PROJECT_PAGE },
          ],
        },
      ],
      copyright: `MIT © ${new Date().getFullYear()} Romain Peyrichou`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
