// The names a component publishes to another enter the description from the plan (grillhouse-la3):
// as a code owner's approval covers what it reviewed, the explorateur's sheet of the plan carries
// the names the ticket publishes (the provider, each consumer, its names), and the circuit writes
// them in the section « ## Noms publiés » of the description, which the guard
// consommateurs-arbitres reads; the guard stays as it is. Witnesses: BPScript 320.14.2.10
// (criterion 6 named `designatedRef` and its consumers, the guard refused the lot, the supervisor
// added « ## Noms publiés » by hand), 320.28, 320.6.5, the same day.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as circuit from '../../scripts/circuit.mjs';
import { juger } from '../../scripts/langages/typescript/consommateurs-arbitres.mjs';
import { lireFiche, schemaDeFiche } from '../../scripts/resultats.mjs';

const RACINE = path.resolve(__dirname, '../../../..');
const plat = (f: string) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\s+/g, ' ');

interface Noms {
  fournisseur: string;
  consommateur: string;
  noms: string[];
}
const decrireLePlan = circuit.decrireLePlan as (
  description: string,
  criteres: string[],
  questions: object[],
  sorte?: object | null,
  noms?: Noms[]
) => string;
const ficheDuPlan = circuit.ficheDuPlan as (
  plans: { fiche: object; reponse?: boolean }[],
  champ: string
) => Record<string, unknown> | null;

const PLAN = { criteres: [], paquets: ['000-forms', '020-loader'], questions: [] };
const sortie = (fiche: object) =>
  JSON.stringify({ type: 'result', session_id: 's', structured_output: fiche });

// BPScript 320.14.2.10: 000-forms publishes designatedRef to three consumers.
const DESIGNATED: Noms[] = ['020-loader', '040-checker', '130-projector'].map(consommateur => ({
  fournisseur: '000-forms',
  consommateur,
  noms: ['designatedRef'],
}));
// The ticket before the plan: its Architecture names neither the consumers nor the name, as a
// criterion alone named them in BPScript 320.14.2.10.
const AVANT = [
  '## Architecture',
  '',
  'Un lecteur commun des tables.',
  '',
  '## Critères',
  '',
  '1. Les lignes de 020-loader, 040-checker et 130-projector dans la section « Consommateurs » de l’INTERFACE de 000-forms gagnent designatedRef.',
].join('\n');

const interfaceDe = (lignes: string[]) =>
  ['# 000-forms', '', '## Consommateurs', '', ...lignes, ''].join('\n');
const HEAD = interfaceDe([
  '- `020-loader` : memberFound',
  '- `040-checker` : refOf',
  '- `130-projector` : memberFound, refOf',
]);

// The guard on a lot that changes the interface of 000-forms to <apres>, under the ticket whose
// description is <description>, no arbitrage at the ticket.
const garde = (description: string, apres: string) =>
  juger(
    'demo-1',
    [{ rel: 'packages/000-forms/docs/INTERFACE.md', avant: HEAD, apres }],
    () => [],
    () => ({ title: 'demo-1 — un lecteur commun — 000-forms, 020-loader', description })
  );

describe('critère 1 — la fiche du plan porte les noms publiés, le circuit les écrit dans « ## Noms publiés »', () => {
  it('the sheet of the plan carries `noms_publies`: the provider, the consumer and its names', () => {
    const s = schemaDeFiche('explorateur') as {
      properties: Record<
        string,
        { type: string; items: { required: string[]; properties: Record<string, unknown> } }
      >;
    };
    const n = s.properties.noms_publies;
    expect(n.type).toBe('array');
    expect(n.items.required).toEqual(['fournisseur', 'consommateur', 'noms']);
    expect(lireFiche('explorateur', sortie({ ...PLAN, noms_publies: DESIGNATED })).erreur).toBe(
      undefined
    );
    expect(
      lireFiche(
        'explorateur',
        sortie({
          ...PLAN,
          noms_publies: [{ fournisseur: '000-forms', consommateur: '020-loader' }],
        })
      ).erreur
    ).toContain('noms');
  });

  it('the circuit writes each provider, consumer and name in the section « ## Noms publiés »', () => {
    const d = decrireLePlan(AVANT, [], [], null, DESIGNATED);
    expect(d).toContain('## Noms publiés');
    const section = d.slice(d.indexOf('## Noms publiés'));
    for (const c of ['020-loader', '040-checker', '130-projector']) {
      expect(section).toContain(`- \`000-forms\` publie à \`${c}\` : \`designatedRef\``);
    }
    // The criteria the ticket holds stay as they are.
    expect(d).toContain('1. Les lignes de 020-loader');
  });

  it('the section is written again at each plan: one section, the last sheet’s names alone', () => {
    const d = decrireLePlan(AVANT, [], [], null, DESIGNATED);
    const encore = decrireLePlan(d, [], [], null, [
      { fournisseur: '000-forms', consommateur: '020-loader', noms: ['refOf2'] },
    ]);
    expect(encore.match(/## Noms publiés/g)).toHaveLength(1);
    expect(encore).toContain('`refOf2`');
    expect(encore).not.toContain('designatedRef`');
    // A plan that publishes no name writes no section.
    expect(decrireLePlan(d, [], [], null, [])).not.toContain('## Noms publiés');
  });

  // The relecteur of 4cd9154: a section the supervisor wrote by hand (BPScript's gesture today)
  // was lost when the plan was written again from a sheet without `noms_publies`.
  it('a sheet without `noms_publies` keeps the section the description holds; an empty list erases it', () => {
    const main = [
      '## Architecture',
      '',
      'x',
      '',
      '## Noms publiés',
      '',
      '- `000-forms` publie à `020-loader` : `designatedRef`',
      '',
      '## Critères',
      '',
      '1. c',
    ].join('\n');
    const gardee = decrireLePlan(main, [], [], null, undefined);
    expect(gardee.match(/## Noms publiés/g)).toHaveLength(1);
    expect(gardee).toContain('- `000-forms` publie à `020-loader` : `designatedRef`');
    expect(decrireLePlan(main, [], [])).toContain('## Noms publiés');
    expect(decrireLePlan(main, [], [], null, [])).not.toContain('## Noms publiés');
  });

  it('the names survive the answer to the questionneur: an answer that says none keeps the plan’s', () => {
    const premier = { ...PLAN, noms_publies: DESIGNATED };
    const reponse = { ...PLAN, reponses: [{ numero: '1', reponse: 'GARDE', texte: 't' }] };
    expect(
      ficheDuPlan([{ fiche: premier }, { fiche: reponse, reponse: true }], 'noms_publies')
        ?.noms_publies
    ).toEqual(DESIGNATED);
    const change = { ...reponse, noms_publies: [] };
    expect(
      ficheDuPlan([{ fiche: premier }, { fiche: change, reponse: true }], 'noms_publies')
        ?.noms_publies
    ).toEqual([]);
    expect(ficheDuPlan([], 'noms_publies')).toBeNull();
  });
});

describe('critère 2 — un lot qui ajoute ces noms aux lignes « Consommateurs » passe la garde, sans arbitrage', () => {
  it('replays BPScript 320.14.2.10: the three lines gain designatedRef, the plan publishes it', () => {
    const apres = interfaceDe([
      '- `020-loader` : memberFound, designatedRef',
      '- `040-checker` : refOf, designatedRef',
      '- `130-projector` : memberFound, refOf, designatedRef',
    ]);
    // Before the fix: the criterion alone names them, the guard refuses.
    expect(garde(AVANT, apres)).toHaveLength(3);
    expect(garde(decrireLePlan(AVANT, [], [], null, DESIGNATED), apres)).toEqual([]);
  });
});

describe('critère 3 — un nom que le plan ne publie pas reste refusé', () => {
  it('refuses a name, or a consumer, the section does not publish', () => {
    const description = decrireLePlan(AVANT, [], [], null, DESIGNATED);
    const nom = garde(description, interfaceDe(['- `020-loader` : memberFound, asRecord']));
    expect(nom).toHaveLength(1);
    expect(nom[0].message).toContain('ne nomme pas `asRecord`');
    const consommateur = garde(description, interfaceDe(['- `900-driver` : designatedRef']));
    expect(consommateur).toHaveLength(1);
    expect(consommateur[0].message).toContain('`900-driver`');
  });
});

describe('critère 4 — la compétence explorateur et le gabarit de sa consigne disent quand remplir ces noms', () => {
  it('the explorateur’s skill and the template of his instruction name `noms_publies` and when to fill it', () => {
    for (const f of [
      'mods/grillhouse/skills/explorateur/SKILL.md',
      'mods/grillhouse/skills/pitmaster/references/consigne-agent.md',
    ]) {
      const texte = plat(f);
      expect(texte, f).toContain('`noms_publies`');
      expect(texte, f).toContain('« Consommateurs »');
      expect(texte, f).toContain('« ## Noms publiés »');
    }
  });
});
