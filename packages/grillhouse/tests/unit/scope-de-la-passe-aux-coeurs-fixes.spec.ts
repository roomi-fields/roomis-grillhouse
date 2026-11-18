// Le scope d'une passe que `scopeSystemd` (./consommation-des-passes.mjs) demande au gestionnaire
// systemd de l'utilisateur : les arguments qu'il envoie au client du bus, remplacé par un faux
// binaire de lancement posé en tête du PATH le temps de l'essai.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

const MODULE = pathToFileURL(
  path.resolve(__dirname, '../../scripts/consommation-des-passes.mjs')
).href;

type Module = {
  scopeSystemd: (o: Record<string, unknown>) => { ouvrir: () => unknown };
};

const DOSSIER = mkdtempSync(path.join(tmpdir(), 'scope-aux-coeurs-fixes-'));
afterAll(() => rmSync(DOSSIER, { recursive: true, force: true }));
const PATH_D_AVANT = process.env.PATH;
afterEach(() => {
  process.env.PATH = PATH_D_AVANT;
});

let n = 0;
/** Ouvre le scope avec un faux `busctl` qui note ses arguments, un par ligne. */
const ouvrirEtLire = async (o: Record<string, unknown>): Promise<string[]> => {
  const d = path.join(DOSSIER, `essai-${++n}`);
  const bin = path.join(d, 'bin');
  const note = path.join(d, 'arguments.txt');
  mkdirSync(bin, { recursive: true });
  writeFileSync(path.join(bin, 'busctl'), `#!/bin/sh\nprintf '%s\\n' "$@" > '${note}'\n`, {
    mode: 0o755,
  });
  process.env.PATH = `${bin}${path.delimiter}${PATH_D_AVANT}`;
  const { scopeSystemd } = (await import(MODULE)) as Module;
  const r = scopeSystemd({
    racine: d,
    sorte: 'mesure',
    coeurs: 4,
    mesurer: false,
    ...o,
  }).ouvrir() as { raison?: string };
  expect(r.raison).toBeUndefined();
  return readFileSync(note, 'utf8').split('\n').slice(0, -1);
};

type Propriete = { nom: string; signature: string; valeur: string[] };
/** Lit les propriétés après `fail` et leur compte : `<nom> <signature> <valeur…>`, `0` à la fin. */
const proprietes = (args: string[]): { compte: number; liste: Propriete[]; reste: string[] } => {
  const i = args.indexOf('fail');
  const compte = Number(args[i + 1]);
  const liste: Propriete[] = [];
  let k = i + 2;
  for (let p = 0; p < compte; p++) {
    const [nom, signature] = [args[k], args[k + 1]];
    k += 2;
    if (signature === 'au' || signature === 'ay') {
      const len = Number(args[k]);
      liste.push({ nom, signature, valeur: args.slice(k + 1, k + 1 + len) });
      k += 1 + len;
    } else {
      liste.push({ nom, signature, valeur: [args[k]] });
      k += 1;
    }
  }
  return { compte, liste, reste: args.slice(k) };
};
const de = (liste: Propriete[], nom: string): Propriete | undefined =>
  liste.find(p => p.nom === nom);

const PART = { id: 'p1', coeurs: 2, memoire: 4 * 1024 ** 3, dossier: '/x' };

describe('le scope d’une passe aux cœurs fixés', () => {
  it('permet seulement les fils donnés : le masque d’octets des fils [1,2,5,6] vaut 102', async () => {
    const { liste } = proprietes(await ouvrirEtLire({ part: PART, fils: [1, 2, 5, 6] }));
    expect(de(liste, 'AllowedCPUs')).toEqual({
      nom: 'AllowedCPUs',
      signature: 'ay',
      valeur: ['102'],
    });
  });

  it('un fil au-delà du premier octet allonge le masque : [9] donne les octets 0 puis 2', async () => {
    const { liste } = proprietes(await ouvrirEtLire({ part: PART, fils: [9] }));
    expect(de(liste, 'AllowedCPUs')?.valeur).toEqual(['0', '2']);
  });

  it('les fils de deux octets se cumulent : [0,7,8,15] donne 129 puis 129', async () => {
    const { liste } = proprietes(await ouvrirEtLire({ part: PART, fils: [0, 7, 8, 15] }));
    expect(de(liste, 'AllowedCPUs')?.valeur).toEqual(['129', '129']);
  });

  it('le scope des cœurs fixés est placé sous la tranche du cadre', async () => {
    const { liste } = proprietes(await ouvrirEtLire({ part: PART, fils: [1, 2] }));
    expect(de(liste, 'Slice')).toEqual({
      nom: 'Slice',
      signature: 's',
      valeur: ['grillhouse.slice'],
    });
  });

  it('le compte de propriétés envoyé suit les propriétés réellement passées, avec ou sans part et fils', async () => {
    for (const o of [
      { part: PART, fils: [1, 2, 5, 6] },
      { part: PART },
      { part: null, fils: [3] },
      { part: null },
    ]) {
      const { compte, liste, reste } = proprietes(await ouvrirEtLire(o));
      expect(liste).toHaveLength(compte);
      expect(reste).toEqual(['0']);
    }
  });

  it('sans fils, aucun masque ni tranche n’est demandé et les propriétés de la part restent', async () => {
    const { liste } = proprietes(await ouvrirEtLire({ part: PART }));
    expect(de(liste, 'AllowedCPUs')).toBeUndefined();
    expect(de(liste, 'Slice')).toBeUndefined();
    expect(de(liste, 'CPUWeight')).toBeDefined();
    expect(de(liste, 'MemoryMax')?.valeur).toEqual([String(4 * 1024 ** 3)]);
  });

  it('le scope reste celui de ce processus : ses PIDs portent le PID courant', async () => {
    const { liste } = proprietes(await ouvrirEtLire({ part: PART, fils: [1] }));
    expect(de(liste, 'PIDs')?.valeur).toEqual([String(process.pid)]);
  });
});
