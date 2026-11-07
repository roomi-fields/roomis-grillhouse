// grillhouse-4nr.2, criteria 10 and 12: the common client library (src/temporal/client.ts), the
// one module that opens the Temporal client and the worker's connection. Its address and its
// namespace come from Temporal's own variables (TEMPORAL_ADDRESS, TEMPORAL_NAMESPACE), as the
// `temporal` program and the SDKs read them; the client it opens is lazy, so that opening it opens
// no network: a test small, without a server.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ADRESSE_PAR_DEFAUT,
  ATTRIBUTS_DE_RECHERCHE,
  adresseDuServeur,
  espaceDeNoms,
  lienDuTableauWeb,
  ouvrirLeClient,
} from '../../src/temporal/client.js';

const SOURCES = path.resolve(__dirname, '../../src/temporal');

describe('the address and the namespace of the server', () => {
  it('are the account’s server on the loopback and the default namespace by default', () => {
    expect(ADRESSE_PAR_DEFAUT).toBe('127.0.0.1:7233');
    expect(adresseDuServeur({})).toBe('127.0.0.1:7233');
    expect(espaceDeNoms({})).toBe('default');
  });

  it('come from TEMPORAL_ADDRESS and TEMPORAL_NAMESPACE when they are set', () => {
    expect(adresseDuServeur({ TEMPORAL_ADDRESS: '127.0.0.1:9999' })).toBe('127.0.0.1:9999');
    expect(espaceDeNoms({ TEMPORAL_NAMESPACE: 'essai' })).toBe('essai');
  });
});

describe('the page of a workflow on the web UI of the server', () => {
  it('is on the server’s host, its port plus 1000, the namespace and the id encoded', () => {
    expect(lienDuTableauWeb('127.0.0.1:7233', 'default', 'circuit:/depot/x:demo-5')).toBe(
      'http://127.0.0.1:8233/namespaces/default/workflows/circuit%3A%2Fdepot%2Fx%3Ademo-5'
    );
    expect(lienDuTableauWeb('localhost:9999', 'essai', 'w')).toBe(
      'http://localhost:10999/namespaces/essai/workflows/w'
    );
  });
});

describe('the search attributes of the frame', () => {
  it('are the ticket and the step, two keywords, which the server registers at its start', () => {
    expect(ATTRIBUTS_DE_RECHERCHE).toEqual({
      GrillhouseTicket: 'Keyword',
      GrillhouseEtape: 'Keyword',
    });
  });
});

describe('the client opens no network (criterion 10)', () => {
  it('opening it on an address where nothing listens succeeds, and closing it too', async () => {
    const c = ouvrirLeClient({ adresse: '127.0.0.1:1', espace: 'essai' });
    expect(c.adresse).toBe('127.0.0.1:1');
    expect(c.client.options.namespace).toBe('essai');
    await c.fermer();
  });
});

describe('the one module that opens the Temporal client (criterion 12)', () => {
  // The sources of src/temporal/, each path from it.
  const sources = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap(e =>
      e.isDirectory()
        ? sources(path.join(dir, e.name)).map(f => path.join(e.name, f))
        : e.name.endsWith('.ts')
          ? [e.name]
          : []
    );

  it('no other source names Connection, NativeConnection nor builds a Client', () => {
    const ouvrants = sources(SOURCES).filter(f =>
      /\b(?:NativeConnection|Connection)\b|new\s+Client\s*\(/.test(
        readFileSync(path.join(SOURCES, f), 'utf8')
      )
    );
    expect(ouvrants).toEqual(['client.ts']);
  });

  it('the sonde’s worker and the state of the service read it', () => {
    for (const f of ['travailleur.ts', 'etat.ts']) {
      expect(readFileSync(path.join(SOURCES, f), 'utf8'), f).toMatch(/from '\.\/client\.js'/);
    }
  });
});
