// The streams of a role session out of the envelope (`lancer` of scripts/seances.mjs): claude is
// launched in stream-json, its standard input carrying the skills of the role then the
// instruction; of its output stream, `resultat.json` keeps the line `type: result` alone, and the
// ticket's log that line, the lines that are no message of the stream and, without a result, the
// text of the last assistant message. A test of size medium: claude is a stand-in program.
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { lireLEntree } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as droits from '../../scripts/droits.mjs';
import { limiteDUsage } from '../../scripts/limite-d-usage.mjs';
import * as seances from '../../scripts/seances.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'seances-flux-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

interface Resultat {
  seance: number | null;
  sortie: string;
}
const lancer = seances.lancer as (
  ctx: object,
  role: string,
  consigne: string,
  options: object
) => Promise<Resultat>;
const jusquALaFiche = seances.jusquALaFiche as unknown as (
  ctx: object,
  role: string,
  consigne: string,
  options: object
) => Promise<unknown>;
const competencesDuRole = (role: string) =>
  (droits as unknown as { competencesDuRole: (r: string) => string[] }).competencesDuRole(role);

const PLACE = () => ({ rattacher: () => {}, rendre: () => {} });
const CONSIGNE =
  'TON TICKET : demo-1\n\nUne consigne de « plusieurs » lignes, avec "des" signes.\n';
const HORS_ENVELOPPE = ['explorateur', 'questionneur', 'relecteur'];

const ligne = (o: object) => JSON.stringify(o);
const INIT = ligne({ type: 'system', subtype: 'init', session_id: 's', marque: 'MARQUE-INIT' });
const assistant = (text: string) =>
  ligne({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } });
const outil = (content: string) =>
  ligne({
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content }] },
  });
const resultat = (reste: object = {}) =>
  ligne({
    type: 'result',
    subtype: 'success',
    is_error: false,
    session_id: 's',
    result: 'MARQUE-RESULTAT',
    structured_output: { verdict: 'ACCEPTÉ' },
    ...reste,
  });
const LIMITE = 'You have hit your limit · resets 2am (Europe/Paris)';

interface Jeu {
  flux: string[];
  erreurs?: string;
  code?: number;
}

// A world whose claude plays, at its n-th launch, the n-th of <jeux> (the last one afterwards):
// it keeps its arguments (`args-<n>`) and its standard input (`entree-<n>`).
function monde(...jeux: Jeu[]) {
  const dossier = mkdtempSync(path.join(ESSAIS, 'monde-'));
  const sorties = mkdtempSync(path.join(ESSAIS, 'sorties-'));
  const faux = path.join(sorties, 'claude');
  jeux.forEach((j, i) => {
    writeFileSync(path.join(sorties, `flux-${i + 1}`), j.flux.map(l => `${l}\n`).join(''));
    writeFileSync(path.join(sorties, `erreurs-${i + 1}`), j.erreurs ? `${j.erreurs}\n` : '');
    writeFileSync(path.join(sorties, `code-${i + 1}`), String(j.code ?? 0));
  });
  writeFileSync(
    faux,
    `#!/bin/bash
d=${sorties}
n=$(( $(cat $d/n 2>/dev/null || echo 0) + 1 )); echo $n > $d/n
printf '%s\\0' "$@" > $d/args-$n
cat > $d/entree-$n
avant=; for a in "$@"; do case "$avant" in --session-id|--resume) id=$a;; esac; avant=$a; done
mkdir -p $d/transcriptions; echo '{}' > $d/transcriptions/$id.jsonl
j=$n; [ -f $d/flux-$j ] || j=${jeux.length}
cat $d/flux-$j
cat $d/erreurs-$j >&2
exit $(cat $d/code-$j)
`
  );
  chmodSync(faux, 0o755);
  const config = path.join(sorties, 'config');
  mkdirSync(path.join(config, 'grillhouse'), { recursive: true });
  const ctx = {
    racine: dossier,
    copie: dossier,
    ticket: 'demo-1',
    sujet: 'essai',
    paquets: ['.'],
    tmp: dossier,
    journal: path.join(dossier, 'journal'),
    fiches: path.join(dossier, 'fiches.jsonl'),
    transcriptions: path.join(sorties, 'transcriptions'),
    immobileMs: 60_000,
    rendus: [] as object[],
    bd: () => ({ status: 0, stdout: '[{}]', stderr: '' }),
  };
  const lu = (f: string) => readFileSync(path.join(sorties, f), 'utf8');
  return {
    ctx,
    config,
    args: (n = 1) => lu(`args-${n}`).split('\0').slice(0, -1),
    entree: (n = 1) => lu(`entree-${n}`),
    lancements: () => Number(lu('n')),
    journal: () => readFileSync(ctx.journal, 'utf8'),
    resultatRange: (id: string) => {
      const f = seances.rangDeLaSeance(ctx, id).resultat;
      return existsSync(f) ? readFileSync(f, 'utf8') : '';
    },
    // <f> under the claude of this world; the API key of the poste when <cle> is given.
    async sous<T>(f: () => Promise<T>, cle?: string) {
      const noms = ['CLAUDE_BIN', 'GRILLHOUSE_REGISTRE', 'XDG_CONFIG_HOME', 'ANTHROPIC_API_KEY'];
      const avant = Object.fromEntries(noms.map(n => [n, process.env[n]]));
      delete process.env.ANTHROPIC_API_KEY;
      Object.assign(process.env, {
        CLAUDE_BIN: faux,
        GRILLHOUSE_REGISTRE: path.join(sorties, 'registre.jsonl'),
        XDG_CONFIG_HOME: config,
      });
      if (cle) {
        writeFileSync(path.join(config, 'grillhouse', 'api.env'), `ANTHROPIC_API_KEY=${cle}\n`);
      }
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
    },
  };
}
type Monde = ReturnType<typeof monde>;

const jouer = (
  m: Monde,
  role = 'relecteur',
  session = ['--session-id', 'seance-1'],
  cle?: string
) =>
  m.sous(
    () =>
      lancer(m.ctx, role, CONSIGNE, {
        horsEnveloppe: true,
        session,
        evenement: 'essai',
        prendrePlace: PLACE,
      }),
    cle
  );
const fiche = (m: Monde) =>
  m.sous(() =>
    jusquALaFiche(m.ctx, 'relecteur', CONSIGNE, {
      horsEnveloppe: true,
      id: 'seance-1',
      evenement: 'essai',
      prendrePlace: PLACE,
      signeDeVie: () => {},
    })
  );
const arretDe = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as { nom: string };
  }
  return null;
};

const FLUX_EN_FLUX = ['--input-format', '--output-format'];
// The launch <n> of <m> speaks stream-json both ways, and receives the skills of <role>.
function recoitSesCompetences(m: Monde, role: string, n = 1) {
  const a = m.args(n);
  for (const option of FLUX_EN_FLUX) {
    expect(
      a.filter(x => x === option),
      option
    ).toHaveLength(1);
    expect(a[a.indexOf(option) + 1], option).toBe('stream-json');
  }
  expect(a).toContain('--verbose');
  expect(a).toContain('-p');
  expect(a).toContain('--json-schema');
  const entree = lireLEntree(m.entree(n));
  expect(entree, m.entree(n).slice(0, 300)).not.toBeNull();
  expect(entree?.competences).toEqual(competencesDuRole(role));
  expect(entree?.consigne).toBe(CONSIGNE);
}

describe('une séance hors de l’enveloppe reçoit les compétences de son rôle', () => {
  it.each(HORS_ENVELOPPE)(
    'la séance neuve du %s parle en flux et reçoit sa liste puis sa consigne entière',
    async role => {
      const m = monde({ flux: [resultat()] });
      await jouer(m, role);
      recoitSesCompetences(m, role);
    }
  );

  it('la séance reprise reçoit la même entrée', async () => {
    const m = monde({ flux: [resultat()] });
    await jouer(m, 'relecteur', ['--resume', 'seance-1']);
    expect(m.args()).toContain('--resume');
    recoitSesCompetences(m, 'relecteur');
  });

  it('la séance rejouée après un refus de la clé d’API, lu dans son flux, reçoit la même entrée', async () => {
    const refus = resultat({
      is_error: true,
      terminal_reason: 'api_error',
      api_error_status: 401,
      result: 'Invalid API key',
      structured_output: undefined,
    });
    const m = monde({ flux: [INIT, refus], code: 1 }, { flux: [INIT, resultat()] });
    const r = await jouer(m, 'relecteur', ['--session-id', 'seance-1'], 'sk-ant-essai');
    expect(m.lancements()).toBe(2);
    recoitSesCompetences(m, 'relecteur', 1);
    recoitSesCompetences(m, 'relecteur', 2);
    expect(r.sortie).toBe(resultat());
    expect(r.seance).toBe(0);
  });
});

describe('du flux d’une séance, son résultat ne garde que la ligne du résultat', () => {
  const FLUX = [INIT, assistant('MARQUE-ASSISTANT'), outil('MARQUE-OUTIL'), resultat()];

  it.each([0, 1])(
    'resultat.json porte la seule ligne « type: result », et le code %i de claude reste celui de la séance',
    async code => {
      const m = monde({ flux: [...FLUX, ligne({ type: 'system', subtype: 'apres' })], code });
      const r = await jouer(m);
      expect(m.resultatRange('seance-1').trim()).toBe(resultat());
      expect(r.sortie).toBe(resultat());
      expect(r.seance).toBe(code);
    }
  );

  it('la fiche se lit dans ce résultat', async () => {
    const m = monde({ flux: FLUX });
    expect(await fiche(m)).toEqual({ verdict: 'ACCEPTÉ' });
    expect(m.lancements()).toBe(1);
  });

  it('un flux sans ligne de résultat ne donne aucun résultat, et le code de claude reste', async () => {
    const m = monde({ flux: [INIT, assistant('parti')], code: 3 });
    const r = await jouer(m);
    expect(m.resultatRange('seance-1').trim()).toBe('');
    expect(r.sortie).toBe('');
    expect(r.seance).toBe(3);
  });

  it('un flux sans ligne de résultat ne donne aucune fiche, même avec une fiche citée par un message', async () => {
    const m = monde({ flux: [INIT, assistant(resultat()), outil(resultat())] });
    expect(await arretDe(fiche(m))).toMatchObject({ nom: 'sans-fiche' });
  });

  it('la limite d’usage dite par le résultat arrête la séance', async () => {
    const m = monde({
      flux: [INIT, resultat({ is_error: true, result: LIMITE, structured_output: undefined })],
      code: 1,
    });
    expect(await arretDe(fiche(m))).toMatchObject({ nom: 'limite-d-usage' });
    expect(m.lancements()).toBe(1);
  });
});

describe('le journal du ticket reçoit d’un flux ce qui n’est pas la conversation', () => {
  const HORS_DU_FLUX = [
    'Warning: une ligne qui n’est pas un message du flux',
    '{"type":"assistant", une ligne tronquée MARQUE-TRONQUEE',
  ];

  it('la ligne du résultat, les lignes qui ne sont pas des messages, telles quelles, et les erreurs', async () => {
    const m = monde({
      flux: [
        HORS_DU_FLUX[0],
        INIT,
        assistant('MARQUE-ASSISTANT'),
        outil('MARQUE-OUTIL'),
        HORS_DU_FLUX[1],
        resultat(),
      ],
      erreurs: 'MARQUE-ERREUR-STANDARD',
    });
    await jouer(m);
    const lignes = m.journal().split('\n');
    for (const attendue of [...HORS_DU_FLUX, resultat(), 'MARQUE-ERREUR-STANDARD']) {
      expect(
        lignes.filter(l => l === attendue),
        attendue
      ).toHaveLength(1);
    }
    for (const marque of ['MARQUE-INIT', 'MARQUE-ASSISTANT', 'MARQUE-OUTIL']) {
      expect(m.journal(), marque).not.toContain(marque);
    }
  });

  it('sans ligne de résultat, le texte du dernier message de l’assistant, et d’aucun autre message', async () => {
    const m = monde({
      flux: [
        INIT,
        assistant('MARQUE-PREMIER'),
        assistant('MARQUE-DERNIER'),
        outil('MARQUE-OUTIL'),
        HORS_DU_FLUX[0],
      ],
      code: 1,
    });
    await jouer(m);
    expect(m.journal()).toContain('MARQUE-DERNIER');
    expect(m.journal()).toContain(HORS_DU_FLUX[0]);
    for (const marque of ['MARQUE-INIT', 'MARQUE-PREMIER', 'MARQUE-OUTIL']) {
      expect(m.journal(), marque).not.toContain(marque);
    }
  });

  it('sans ligne de résultat, la limite d’usage dite par l’assistant se lit à la fin du journal', async () => {
    const autres = Array.from({ length: 40 }, (_, i) => outil(`ligne ${i}`));
    const m = monde({ flux: [INIT, assistant(LIMITE), ...autres], code: 1 });
    await jouer(m);
    expect(limiteDUsage({ journal: m.journal() })).not.toBeNull();
  });

  it('un résultat d’outil qui cite une limite d’usage n’entre pas au journal et n’arrête rien sur elle', async () => {
    const m = monde({ flux: [INIT, assistant('Je lis le journal.'), outil(LIMITE)], code: 1 });
    expect(await arretDe(fiche(m))).toMatchObject({ nom: 'sans-fiche' });
    expect(limiteDUsage({ journal: m.journal() })).toBeNull();
  });
});
