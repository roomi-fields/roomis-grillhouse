#!/usr/bin/env node
// The written interface of each component against its code.
//
// - The public API of a component is reported by API Extractor from its built declarations:
//   `docs/INTERFACE.api.md`, kept in the repository. The check refuses an API that changed
//   without its report; `--ecrire` writes the reports. A package's entry is its main entry
//   (`types`, or `exports["."].types`); its other entries (test material) are not its API. A
//   module of `src/` has `<types directory>/<module>/index.d.ts`. Types of a neighbour stay
//   references to it.
// - Each export of the report has its title in `docs/INTERFACE.md`, and each element title is
//   an export. An element title starts with its name in code: « ## `parse`(source, previous?) ».
// - When the interface has a « ## Les fautes » section, its codes (`PARSE_EXPECTED`…) are exactly
//   the codes with the same prefixes found in the component's production code.
//
//   node scripts/interfaces-contre-code.mjs            checks every component (run after the build)
//   node scripts/interfaces-contre-code.mjs --ecrire   writes the API reports
//
// A component without `docs/INTERFACE.md` is reported and skipped. A project that prefers a
// bench per component calls `verifierComposant(racine, composant)` from its test.
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { composants } from './consommateurs.mjs';

const require = createRequire(import.meta.url);
const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|svelte|vue)$/;
const isTest = rel =>
  /(^|\/)(test|tests|__tests__)\//.test(rel) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel);
const CODE = /\b[A-Z][A-Z0-9]*_[A-Z0-9_]*[A-Z0-9]\b/g;

const lireJson = p => JSON.parse(readFileSync(p, 'utf8'));

// The built entry of a component's public API, or null.
export function entree(racine, c) {
  const pj = path.join(c.dir, 'package.json');
  if (existsSync(pj)) {
    const p = lireJson(pj);
    const point = p.exports?.['.'];
    const types =
      (typeof point === 'object' && (point.types ?? point.import?.types)) || p.types || p.typings;
    return types ? path.join(c.dir, types) : null;
  }
  const racinePj = path.join(racine, 'package.json');
  const types = existsSync(racinePj) ? lireJson(racinePj).types : null;
  if (!types) return null;
  return path.join(racine, path.dirname(types), path.basename(c.dir), 'index.d.ts');
}

// The exported names of an API Extractor report.
export function exportsDuRapport(rapport) {
  const noms = new Set();
  const re =
    /^export (?:declare )?(?:abstract )?(?:default )?(?:function|const|let|var|class|interface|type|enum|namespace) (\w+)/gm;
  for (const m of rapport.matchAll(re)) noms.add(m[1]);
  for (const m of rapport.matchAll(/^export \{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const nom = part
        .split(/\s+as\s+/)
        .pop()
        .trim();
      if (nom) noms.add(nom);
    }
  }
  return noms;
}

// The element names and the fault codes an interface text declares (code blocks are not titles).
export function declare(texte) {
  const elements = new Set();
  let fautes = null;
  let section = null;
  let bloc = false;
  for (const l of texte.split('\n')) {
    if (/^\s*(```|~~~)/.test(l)) bloc = !bloc;
    const titre = !bloc && /^(#{2,3}) (.+)$/.exec(l);
    if (titre) {
      section = titre[1] === '##' ? titre[2].trim() : section;
      const nom = /^`([A-Za-z_$][\w$]*)/.exec(titre[2].trim());
      if (nom) elements.add(nom[1]);
      if (section === 'Les fautes' && fautes === null) fautes = new Set();
      continue;
    }
    if (section === 'Les fautes') for (const m of l.matchAll(CODE)) fautes.add(m[0]);
  }
  return { elements, fautes };
}

// The codes with one of <prefixes> found in the production code under <dir>.
function codesDuCode(dir, racine, prefixes) {
  const trouves = new Set();
  const walk = d => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (['node_modules', 'dist', 'docs'].includes(e.name) || e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (SOURCE.test(e.name) && !isTest(path.relative(racine, p))) {
        for (const m of readFileSync(p, 'utf8').matchAll(CODE)) {
          if (prefixes.some(pr => m[0].startsWith(pr))) trouves.add(m[0]);
        }
      }
    }
  };
  walk(dir);
  return trouves;
}

// Runs API Extractor on one component: its report and whether it is up to date.
function rapportApi(racine, c, entreeDts, ecrire) {
  const { Extractor, ExtractorConfig } = require('@microsoft/api-extractor');
  const pj = existsSync(path.join(c.dir, 'package.json'))
    ? path.join(c.dir, 'package.json')
    : path.join(racine, 'package.json');
  const tsconfig = [path.join(c.dir, 'tsconfig.json'), path.join(racine, 'tsconfig.json')].find(
    existsSync
  );
  const tmp = mkdtempSync(path.join(tmpdir(), 'api-'));
  const messages = [];
  try {
    const config = ExtractorConfig.prepare({
      configObject: {
        projectFolder: path.dirname(pj),
        mainEntryPointFilePath: entreeDts,
        compiler: tsconfig ? { tsconfigFilePath: tsconfig } : undefined,
        apiReport: {
          enabled: true,
          reportFolder: path.join(c.dir, 'docs'),
          reportTempFolder: tmp,
          reportFileName: 'INTERFACE',
        },
        docModel: { enabled: false },
        dtsRollup: { enabled: false },
        tsdocMetadata: { enabled: false },
        messages: {
          extractorMessageReporting: { 'ae-missing-release-tag': { logLevel: 'none' } },
          tsdocMessageReporting: { default: { logLevel: 'none' } },
        },
      },
      packageJsonFullPath: pj,
    });
    const resultat = Extractor.invoke(config, {
      localBuild: ecrire,
      messageCallback: m => {
        if (m.logLevel === 'error' || m.logLevel === 'warning') messages.push(m.text);
        m.handled = true;
      },
    });
    const rapport = path.join(c.dir, 'docs', 'INTERFACE.api.md');
    return {
      ajour: resultat.succeeded && !resultat.apiReportChanged,
      texte: existsSync(rapport) ? readFileSync(rapport, 'utf8') : '',
      messages,
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// The refusals and reports for one component.
export function verifierComposant(racine, c, { ecrire = false } = {}) {
  const refus = [];
  const signaux = [];
  const rel = path.relative(racine, c.dir);
  const iface = path.join(c.dir, 'docs', 'INTERFACE.md');
  if (!existsSync(iface)) {
    signaux.push(`${rel} n'a pas d'interface (docs/INTERFACE.md) : rien n'est vérifié.`);
    return { refus, signaux };
  }
  const { elements, fautes } = declare(readFileSync(iface, 'utf8'));
  const dts = entree(racine, c);
  if (!dts || !existsSync(dts)) {
    refus.push(
      `${rel} : son entrée construite (${dts ?? 'types absent'}) manque ; construis d'abord.`
    );
  } else {
    const api = rapportApi(racine, c, dts, ecrire);
    for (const m of api.messages) signaux.push(`${rel} : ${m}`);
    if (!api.ajour && !ecrire) {
      refus.push(
        `${rel} : l'API a changé sans son rapport docs/INTERFACE.api.md ; node scripts/interfaces-contre-code.mjs --ecrire le régénère.`
      );
    }
    const exportes = exportsDuRapport(api.texte);
    for (const n of exportes) {
      if (!elements.has(n))
        refus.push(
          `${rel} exporte ${n}, que docs/INTERFACE.md ne décrit pas (titre « ## \`${n}\` »).`
        );
    }
    for (const n of elements) {
      if (!exportes.has(n))
        refus.push(`${rel} : docs/INTERFACE.md décrit ${n}, que le code n'exporte pas.`);
    }
  }
  if (fautes) {
    const prefixes = [...new Set([...fautes].map(f => f.slice(0, f.indexOf('_') + 1)))];
    const dansLeCode = codesDuCode(c.dir, racine, prefixes);
    for (const f of fautes) {
      if (!dansLeCode.has(f))
        refus.push(`${rel} : la faute ${f} est listée, mais le code ne la produit pas.`);
    }
    for (const f of dansLeCode) {
      if (!fautes.has(f))
        refus.push(`${rel} : le code produit ${f}, que « Les fautes » ne liste pas.`);
    }
  }
  return { refus, signaux };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const racine = process.cwd();
  const ecrire = process.argv.includes('--ecrire');
  let refuse = false;
  for (const c of composants(racine)) {
    const { refus, signaux } = verifierComposant(racine, c, { ecrire });
    for (const s of signaux) process.stderr.write(`⚠️  ${s}\n`);
    for (const r of refus) process.stderr.write(`⛔ ${r}\n`);
    refuse ||= refus.length > 0;
  }
  process.exit(refuse ? 1 : 0);
}
