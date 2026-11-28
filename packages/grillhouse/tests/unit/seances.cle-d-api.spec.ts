// The session of an agent takes the API key of the poste (`api.env` of the frame's directory of
// configuration) while it lasts, and plays again on the subscription, once, when the API refuses
// it for an empty credit or a refused key (`lancer` of scripts/seances.mjs). The fake claude
// (CLAUDE_BIN) and the fake launcher (GRILLHOUSE_LANCEUR) note the key their environment holds.
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import * as seances from '../../scripts/seances.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'seances-cle-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

interface Resultat {
  code: number | null;
  seance: number | null;
  erreur: string | null;
  sortie: string;
  id: string;
}
const lancer = seances.lancer as (
  ctx: object,
  role: string,
  consigne: string,
  options: object
) => Promise<Resultat>;

const CLE = 'sk-ant-secret-valeur';
const BRUT = 'MARQUEUR-BRUT';
const FICHE = '{"type":"result","is_error":false,"structured_output":{"statut":"FAIT"}}';
const PLACE = () => ({ rattacher: () => {}, rendre: () => {} });

const credit = (
  statut: number | null = 400,
  texte = 'Credit balance is too low to access the Anthropic API.'
) => refus(statut, `${texte} ${BRUT}`);
const refus = (statut: number | null, texte: string) =>
  JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: true,
    terminal_reason: 'api_error',
    ...(statut === null ? {} : { api_error_status: statut }),
    result: texte,
  });
const invalide = (statut: number | null = 401, texte = 'Invalid API key · Fix external API key') =>
  refus(statut, `${texte} ${BRUT}`);

// The two names a month can take, local or universal time.
const mois = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return [
    `${d.getFullYear()}-${p(d.getMonth() + 1)}`,
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}`,
  ];
};

function monde({ delai = 0 } = {}) {
  const dossier = mkdtempSync(path.join(ESSAIS, 'monde-'));
  const config = path.join(dossier, 'config', 'grillhouse');
  mkdirSync(config, { recursive: true });
  const trace = path.join(dossier, 'trace');
  const reponse = path.join(dossier, 'reponse-avec-cle.json');
  const faux = path.join(dossier, 'claude');
  // With a key, the refusal of the file `reponse-avec-cle.json` (exit 1); without, a sheet.
  writeFileSync(
    faux,
    `#!/bin/sh\necho "cle=\${ANTHROPIC_API_KEY-absente} $*" >> ${trace}\nif [ -n "\${ANTHROPIC_API_KEY+x}" ]; then sleep ${delai}; cat ${reponse}; exit 1; fi\necho '${FICHE}'\nexit 0\n`
  );
  chmodSync(faux, 0o755);
  const contexte = (nom: string) => {
    const d = path.join(dossier, nom);
    mkdirSync(d, { recursive: true });
    return {
      racine: d,
      copie: d,
      ticket: 'demo-1',
      sujet: 'essai',
      paquets: ['.'],
      tmp: d,
      journal: path.join(d, 'journal'),
      fiches: path.join(d, 'fiches.jsonl'),
      transcriptions: path.join(d, 'transcriptions'),
      immobileMs: 60_000,
    };
  };
  const lancements = () =>
    existsSync(trace) ? readFileSync(trace, 'utf8').split('\n').filter(Boolean) : [];
  return {
    dossier,
    config,
    faux,
    reponse,
    contexte,
    lancements,
    ecrireLaCle: () => writeFileSync(path.join(config, 'api.env'), `ANTHROPIC_API_KEY=${CLE}\n`),
    refuser: (json: string) => writeFileSync(reponse, `${json}\n`),
    notes: () => readdirSync(config).filter(n => n.startsWith('api-epuise-')),
  };
}

// <f> under the environment of the circuit: the config of the poste, the fake claude, no key of
// the circuit unless <extra> gives one.
async function sous<T>(
  m: ReturnType<typeof monde>,
  f: () => Promise<T>,
  extra: Record<string, string> = {},
  lanceur?: string
) {
  const pose: Record<string, string> = {
    XDG_CONFIG_HOME: path.join(m.dossier, 'config'),
    CLAUDE_BIN: m.faux,
    GRILLHOUSE_REGISTRE: path.join(m.dossier, 'registre.jsonl'),
    ...(lanceur ? { GRILLHOUSE_LANCEUR: lanceur } : {}),
    ...extra,
  };
  const noms = [...Object.keys(pose), 'ANTHROPIC_API_KEY', 'GRILLHOUSE_LANCEUR'];
  const avant = Object.fromEntries(noms.map(n => [n, process.env[n]]));
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GRILLHOUSE_LANCEUR;
  Object.assign(process.env, pose);
  try {
    return await f();
  } finally {
    for (const n of noms) {
      if (avant[n] === undefined) {
        delete process.env[n];
      } else {
        process.env[n] = avant[n];
      }
    }
  }
}

const horsEnveloppe = (id: string) => ({
  horsEnveloppe: true,
  session: ['--session-id', id],
  evenement: 'relecture',
  prendrePlace: PLACE,
});
const jeu = (m: ReturnType<typeof monde>, nom = 'a', id = 'seance-1') =>
  lancer(m.contexte(nom), 'relecteur', 'consigne', horsEnveloppe(id));
const journal = (m: ReturnType<typeof monde>, nom = 'a') =>
  readFileSync(path.join(m.dossier, nom, 'journal'), 'utf8');
const fiches = (m: ReturnType<typeof monde>, nom = 'a') => {
  const f = path.join(m.dossier, nom, 'fiches.jsonl');
  return existsSync(f) ? readFileSync(f, 'utf8') : '';
};

describe('sans le fichier de la clé, la séance part comme avant', () => {
  it('launches without any key, notes nothing and launches once, even on a refusal', async () => {
    const m = monde();
    m.refuser(credit());
    const r = await sous(m, () => jeu(m));
    expect(m.lancements()).toHaveLength(1);
    expect(m.lancements()[0]).toContain('cle=absente');
    expect(m.notes()).toEqual([]);
    expect(r.sortie).toContain('"structured_output"');
  });
});

describe('avec le fichier de la clé, la séance part avec elle', () => {
  it('launches with the key of the file and never writes it to the log, the sheets or the result', async () => {
    const m = monde();
    m.ecrireLaCle();
    m.refuser(credit());
    const r = await sous(m, () => jeu(m));
    expect(m.lancements()[0]).toContain(`cle=${CLE}`);
    for (const texte of [journal(m), fiches(m), r.sortie, r.erreur ?? '']) {
      expect(texte).not.toContain(CLE);
    }
  });

  it('keeps the key of the circuit’s environment and applies neither the file nor a relaunch on a refusal', async () => {
    const m = monde();
    m.ecrireLaCle();
    m.refuser(credit());
    const r = await sous(m, () => jeu(m), { ANTHROPIC_API_KEY: 'sk-ant-du-circuit' });
    expect(m.lancements()).toHaveLength(1);
    expect(m.lancements()[0]).toContain('cle=sk-ant-du-circuit');
    expect(m.notes()).toEqual([]);
    expect(r.seance).toBe(1);
    expect(r.sortie).toContain(BRUT);
  });
});

describe('un crédit épuisé ou une clé refusée relance la séance sur l’abonnement', () => {
  it.each([
    ['crédit épuisé, statut et texte', credit(), /crédit épuisé/],
    ['crédit épuisé, texte seul', credit(null), /crédit épuisé/],
    ['clé refusée, statut et texte', invalide(), /clé refusée/],
    ['clé refusée, statut seul', invalide(401, 'Authentication failed'), /clé refusée/],
  ])(
    '%s: one relaunch without the key, its result is the relaunch’s',
    async (_n, reponse, motif) => {
      const m = monde();
      m.ecrireLaCle();
      m.refuser(reponse);
      const r = await sous(m, () => jeu(m));
      const l = m.lancements();
      expect(l).toHaveLength(2);
      expect(l[0]).toContain(`cle=${CLE}`);
      expect(l[1]).toContain('cle=absente');
      expect(r.sortie).toContain('"structured_output"');
      expect(r.sortie).not.toContain(BRUT);
      expect(r.seance).toBe(0);
      expect(r.erreur ?? '').toBe('');
      expect(journal(m)).toMatch(motif);
    }
  );

  it('resumes the session of the first attempt, the other options unchanged', async () => {
    const m = monde();
    m.ecrireLaCle();
    m.refuser(credit());
    await sous(m, () => jeu(m, 'a', 'seance-42'));
    const [premier, second] = m.lancements().map(l => l.replace(/^cle=\S+ /, ''));
    expect(premier).toContain('--session-id seance-42');
    expect(second).toBe(premier.replace('--session-id seance-42', '--resume seance-42'));
    expect(second).not.toContain('--session-id');
  });

  it('counts one session of the circuit: one launch line, under the id of the first attempt', async () => {
    const m = monde();
    m.ecrireLaCle();
    m.refuser(credit());
    await sous(m, () => jeu(m, 'a', 'seance-7'));
    const lignes = fiches(m)
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l) as { lancement?: { seance: string } })
      .filter(e => e.lancement);
    expect(lignes).toHaveLength(1);
    expect(lignes[0].lancement?.seance).toBe('seance-7');
  });

  it('notes the reason and the month at the log, once, without the key nor the raw output', async () => {
    const m = monde();
    m.ecrireLaCle();
    m.refuser(credit());
    await sous(m, () => jeu(m));
    const lignes = journal(m)
      .split('\n')
      .filter(l => /crédit épuisé/.test(l));
    expect(lignes).toHaveLength(1);
    expect(mois().some(x => lignes[0].includes(x))).toBe(true);
    expect(journal(m)).not.toContain(CLE);
    expect(journal(m)).not.toContain(BRUT);
  });
});

describe('le mois noté est un fichier de présence', () => {
  it('creates api-epuise-AAAA-MM beside api.env, empty of the key', async () => {
    const m = monde();
    m.ecrireLaCle();
    m.refuser(credit());
    await sous(m, () => jeu(m));
    const notes = m.notes();
    expect(notes).toHaveLength(1);
    expect(mois().map(x => `api-epuise-${x}`)).toContain(notes[0]);
    expect(readFileSync(path.join(m.config, notes[0]), 'utf8')).not.toContain(CLE);
  });

  it('takes the key no more once the month is noted, the log saying it once', async () => {
    const m = monde();
    m.ecrireLaCle();
    m.refuser(invalide());
    await sous(m, () => jeu(m, 'a', 's-1'));
    const avant = m.lancements().length;
    const r = await sous(m, () => jeu(m, 'b', 's-2'));
    const apres = m.lancements().slice(avant);
    expect(apres).toHaveLength(1);
    expect(apres[0]).toContain('cle=absente');
    expect(r.sortie).toContain('"structured_output"');
    expect(`${journal(m, 'a')}${journal(m, 'b')}`.match(/clé refusée/g)).toHaveLength(1);
  });

  it('only tests the presence of the month file: a directory of that name counts', async () => {
    const m = monde();
    m.ecrireLaCle();
    m.refuser(credit());
    for (const x of new Set(mois())) {
      mkdirSync(path.join(m.config, `api-epuise-${x}`));
    }
    await sous(m, () => jeu(m));
    expect(m.lancements()).toHaveLength(1);
    expect(m.lancements()[0]).toContain('cle=absente');
  });

  it('takes the key again in a new month: the file of another month does not count', async () => {
    const m = monde();
    m.ecrireLaCle();
    m.refuser(credit());
    writeFileSync(path.join(m.config, 'api-epuise-2020-01'), '');
    await sous(m, () => jeu(m));
    expect(m.lancements()[0]).toContain(`cle=${CLE}`);
  });

  it('two parallel sessions refused each relaunch once; one writes the line of the log, the other none', async () => {
    const m = monde({ delai: 1 });
    m.ecrireLaCle();
    m.refuser(credit());
    const [r1, r2] = await sous(m, () => Promise.all([jeu(m, 'a', 's-a'), jeu(m, 'b', 's-b')]));
    for (const r of [r1, r2]) {
      expect(r.sortie).toContain('"structured_output"');
      expect(r.seance).toBe(0);
    }
    expect(m.lancements().filter(l => l.includes('cle=absente'))).toHaveLength(2);
    expect(m.notes()).toHaveLength(1);
    const dites = `${journal(m, 'a')}${journal(m, 'b')}`.match(/crédit épuisé/g);
    expect(dites).toHaveLength(1);
  });
});

describe('une erreur que le circuit ne reconnaît pas garde la clé et suit le chemin des séances en échec', () => {
  it.each([
    [
      'erreur d’API sans terminal_reason, texte de crédit',
      JSON.stringify({
        type: 'result',
        is_error: true,
        api_error_status: 400,
        result: 'Credit balance is too low',
      }),
    ],
    ['clé invalide sans statut 401', refus(null, 'invalid x-api-key')],
    ['limite de débit', refus(429, 'Rate limit exceeded')],
    ['surcharge', refus(529, 'Overloaded')],
    ['erreur serveur', refus(500, 'Internal server error')],
    ['erreur de requête autre', refus(400, 'prompt is too long')],
    [
      'texte de crédit d’un résultat sans erreur',
      JSON.stringify({ type: 'result', is_error: false, result: 'Credit balance is too low' }),
    ],
  ])('%s: no relaunch, nothing noted, the refusal is the result', async (_n, reponse) => {
    const m = monde();
    m.ecrireLaCle();
    m.refuser(reponse);
    const r = await sous(m, () => jeu(m));
    expect(m.lancements()).toHaveLength(1);
    expect(m.notes()).toEqual([]);
    expect(r.seance).toBe(1);
    expect(r.sortie).toBe(reponse);
    expect(journal(m)).not.toMatch(/crédit épuisé|clé refusée/);
  });

  it('texte de crédit hors d’un JSON: no relaunch, nothing noted, no result, the text at the log', async () => {
    const texte = 'Credit balance is too low to access the Anthropic API.';
    const m = monde();
    m.ecrireLaCle();
    m.refuser(texte);
    const r = await sous(m, () => jeu(m));
    expect(m.lancements()).toHaveLength(1);
    expect(m.notes()).toEqual([]);
    expect(r.seance).toBe(1);
    expect(r.sortie).toBe('');
    expect(journal(m).split('\n')).toContain(texte);
  });
});

describe('la session de l’enveloppe, par le lanceur, prend la clé et se relance de la même façon', () => {
  // A launcher of trial ranging its result under the session it opens, as lancer.sh does: a key
  // in its environment gets a refusal, none a sheet.
  function lanceur(m: ReturnType<typeof monde>) {
    const fichier = path.join(m.dossier, 'lancer.sh');
    const trace = path.join(m.dossier, 'lanceur');
    writeFileSync(
      fichier,
      `#!/bin/sh\necho "cle=\${ANTHROPIC_API_KEY-absente} $*" >> ${trace}\nid=$(echo "$*" | sed -n 's/.*--\\(seance\\|reprise\\) \\([^ ]*\\).*/\\2/p')\nr=${m.dossier}/enveloppe/seances/$id\nmkdir -p $r\nif [ -n "\${ANTHROPIC_API_KEY+x}" ]; then cat ${m.reponse} > $r/resultat.json; echo 1 > $r/fin; else echo '${FICHE}' > $r/resultat.json; echo 0 > $r/fin; fi\n`
    );
    chmodSync(fichier, 0o755);
    return {
      fichier,
      appels: () =>
        existsSync(trace) ? readFileSync(trace, 'utf8').split('\n').filter(Boolean) : [],
    };
  }
  const enveloppe = (m: ReturnType<typeof monde>, nom: string) =>
    lancer(m.contexte(nom), 'developpeur', 'consigne', {
      ouvre: 'seance-9',
      evenement: 'neuve',
      prendrePlace: PLACE,
    });

  it('gives the launcher the key, then launches it again under the same session without it', async () => {
    const m = monde();
    const l = lanceur(m);
    m.ecrireLaCle();
    m.refuser(credit());
    const r = await sous(m, () => enveloppe(m, 'enveloppe'), {}, l.fichier);
    const appels = l.appels();
    expect(appels).toHaveLength(2);
    expect(appels[0]).toContain(`cle=${CLE}`);
    expect(appels[0]).toContain('--seance seance-9');
    expect(appels[1]).toContain('cle=absente');
    expect(appels[1]).toContain('--reprise seance-9');
    expect(appels[1]).not.toContain('--seance');
    expect(r.sortie).toContain('"structured_output"');
    expect(r.seance).toBe(0);
    expect(m.notes()).toHaveLength(1);
  });

  it('launches the launcher once, without key, when the file is absent', async () => {
    const m = monde();
    const l = lanceur(m);
    const r = await sous(m, () => enveloppe(m, 'enveloppe'), {}, l.fichier);
    expect(l.appels()).toHaveLength(1);
    expect(l.appels()[0]).toContain('cle=absente');
    expect(r.sortie).toContain('"structured_output"');
  });

  it('does not relaunch on a transient error of the API', async () => {
    const m = monde();
    const l = lanceur(m);
    m.ecrireLaCle();
    m.refuser(refus(429, 'Rate limit exceeded'));
    const r = await sous(m, () => enveloppe(m, 'enveloppe'), {}, l.fichier);
    expect(l.appels()).toHaveLength(1);
    expect(m.notes()).toEqual([]);
    expect(r.seance).toBe(1);
  });
});
