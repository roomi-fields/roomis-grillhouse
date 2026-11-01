/**
 * Emit each page's own structured data.
 *
 * The site-wide block in docusaurus.config.ts says who publishes this and what
 * the software is. It cannot say what *this page* is, and every page carrying
 * the same description is what an engine reads as incoherence. The generator
 * (website/scripts/sync-docs.mjs) works that out from the source document and
 * writes it to src/page-schemas.json, keyed by document id. This wrapper looks
 * the page up and puts it in the head with its own address filled in — only
 * the renderer knows that.
 *
 * The data travels in its own file, not in frontmatter: a JSON string carried
 * through YAML and MDX arrives corrupted, and the page then silently renders
 * no structured data at all.
 */

import React, { type ReactNode } from 'react';
import Head from '@docusaurus/Head';
import Layout from '@theme-original/DocItem/Layout';
import type LayoutType from '@theme/DocItem/Layout';
import type { WrapperProps } from '@docusaurus/types';
import { useDoc } from '@docusaurus/plugin-content-docs/client';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

import pageSchemas from '@site/src/page-schemas.json';

type Props = WrapperProps<typeof LayoutType>;

/**
 * Escape the three characters that make a JSON payload ambiguous inside an
 * HTML document. They stay valid JSON as unicode escapes, and without them a
 * page whose text contains `<` or `&` loses its block entirely.
 */
function serialize(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

export default function LayoutWrapper(props: Props): ReactNode {
  const { metadata } = useDoc();
  const {
    siteConfig: { url: siteUrl },
  } = useDocusaurusContext();

  const schema = (pageSchemas as Record<string, Record<string, unknown>>)[metadata.id];
  const permalink = `${siteUrl}${metadata.permalink}`;
  const page = schema
    ? { ...schema, url: permalink, mainEntityOfPage: { '@type': 'WebPage', '@id': permalink } }
    : null;

  return (
    <>
      {page && (
        <Head>
          <script type="application/ld+json">{serialize(page)}</script>
        </Head>
      )}
      <Layout {...props} />
    </>
  );
}
