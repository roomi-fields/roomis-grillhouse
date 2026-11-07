// The prefix of the tickets of a project (scripts/prefixe-des-tickets.mjs), in the key `issue-prefix`
// of its committed `.beads/config.yaml`: read there, never from `bd` (absent in a CI), and written
// there by one function, which the preparation of a new project and the update call.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ecrireLePrefixe, prefixe } from '../../scripts/prefixe-des-tickets.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'prefixe-des-tickets-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const DEPOT = path.resolve(__dirname, '../../../..');

const CONFIG_BEADS = '.beads/config.yaml';
// A directory with <contenu> as the file of Beads (none when <contenu> is null).
const racineBeads = (contenu: string | null) => {
  const r = mkdtempSync(path.join(ESSAIS, 'beads-'));
  if (contenu !== null) {
    mkdirSync(path.join(r, '.beads'));
    writeFileSync(path.join(r, CONFIG_BEADS), contenu);
  }
  return r;
};
// Runs <f> with a PATH that holds no `bd`, then puts the PATH back.
const sansBd = <T>(f: () => T): T => {
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
  symlinkSync(process.execPath, path.join(bin, 'node'));
  const avant = process.env.PATH;
  process.env.PATH = `${bin}:/usr/bin:/bin`;
  try {
    return f();
  } finally {
    process.env.PATH = avant;
  }
};

describe('the prefix of the tickets, read from the committed file of Beads, never from `bd`', () => {
  it('reads the prefix of the key `issue-prefix`, quoted or not', () => {
    expect(prefixe(racineBeads('issue-prefix: "tck"\n'))).toBe('tck');
    expect(prefixe(racineBeads("issue-prefix: 'tck'\n"))).toBe('tck');
    expect(prefixe(racineBeads('no-db: false\nissue-prefix: tck # le projet\n'))).toBe('tck');
  });

  it('answers the same with `bd` absent from the PATH as with it present', () => {
    const r = racineBeads('issue-prefix: "tck"\n');
    expect(sansBd(() => prefixe(r))).toBe(prefixe(r));
  });

  it('says by its name that the file is missing, and counts nothing by halves', () => {
    expect(() => prefixe(racineBeads(null))).toThrow(CONFIG_BEADS);
  });

  it('says by its name that the key `issue-prefix` is missing, a commented line not being the key', () => {
    expect(() => prefixe(racineBeads('# issue-prefix: "tck"\nno-db: false\n'))).toThrow(
      'issue-prefix'
    );
  });
});

describe('the prefix committed in Grillhouse', () => {
  it('is `grillhouse` in the file of Beads of the repository', () => {
    expect(readFileSync(path.join(DEPOT, CONFIG_BEADS), 'utf8')).toMatch(
      /^issue-prefix:\s*["']?grillhouse["']?\s*$/m
    );
  });
});

describe('the one writer of the key', () => {
  it('replaces a key written empty, adds an absent one, and leaves one that holds a value', () => {
    const vide = racineBeads('issue-prefix: ""\nno-db: false\n');
    expect(ecrireLePrefixe(vide, 'tck')).toBe('issue-prefix: "tck"');
    expect(readFileSync(path.join(vide, CONFIG_BEADS), 'utf8')).toBe(
      'issue-prefix: "tck"\nno-db: false\n'
    );
    const absente = racineBeads('# issue-prefix: ""\n');
    ecrireLePrefixe(absente, 'tck');
    expect(prefixe(absente)).toBe('tck');
    const remplie = racineBeads('issue-prefix: "autre"\n');
    expect(ecrireLePrefixe(remplie, 'tck')).toBeNull();
    expect(prefixe(remplie)).toBe('autre');
  });
});
