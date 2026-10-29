import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  canWrap,
  couvre,
  racineSousLaMaison,
} from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { sortie, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';
import { enProcessus } from './cadre.js';

const commitIntegre = enProcessus<string | null>('scripts/circuit.mjs', 'commitIntegre');
const schemaDeFiche = enProcessus<unknown>('scripts/resultats.mjs', 'schemaDeFiche');

// grillhouse-0yu.5: the tri of the discoveries at the end of a ticket, as Chromium and Mozilla give
// each new report a verdict before it is filed. After the queue brings the lot onto main, the
// circuit launches the explorateur (Sonnet, out of the envelope, with the rights of reading) on
// the discoveries the sheets of the ticket filed; its sheet gives each one its verdict and its
// piece: traitee, doublon, sans-suite, a-porter or non-confirmee. Each verdict is written at the
// ticket of its discovery, its label set there; an a-porter or a non-confirmee reopens under
// `a-valider`, in the pane's list « à valider ». Witness: BPScript, 161 discoveries filed closed
// since 2026-10-12, none read one by one; on 320.17, 9 discoveries, one real defect.
// The trial repository and its stand-ins: ./circuit-essai.ts.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-tri-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const {
  BEADS,
  revenirAuDebut,
  ticket,
  scenario,
  circuit,
  essai,
  sessions,
  args,
  etat,
  entrees,
  bilans,
  commentaires,
} = circuitEssai(ESSAIS);

// The value that follows <option> in the arguments of a session.
const valeur = (a: string[], option: string) => a[a.indexOf(option) + 1];
// A ticket of the stand-in bd: its status, its labels, its comments' texts.
const leTicket = (id: string) =>
  (
    JSON.parse(readFileSync(path.join(BEADS, `${id}.json`), 'utf8')) as {
      status: string;
      labels: string[];
      close_reason?: string;
    }[]
  )[0];
const sesCommentaires = (id: string) => {
  try {
    return readFileSync(path.join(BEADS, `${id}.comments.jsonl`), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(l => (JSON.parse(l) as { text: string }).text);
  } catch {
    return [];
  }
};
// The developpeur's scenario, its code right, its sheet carrying the discoveries <sujets>.
const avecDecouvertes = (...sujets: string[]) =>
  `${CODE_JUSTE}passation 'Code écrit.'\nfiche '${JSON.stringify({
    statut: 'FAIT',
    decouvertes: sujets.map(sujet => ({
      sujet,
      corps: `${sujet} : packages/forms/src/index.mjs:1`,
    })),
  })}'\n`;

describe.runIf(canWrap)(
  'the tri of the discoveries at the end of a ticket',
  { timeout: 300_000 },
  () => {
    afterEach(revenirAuDebut);

    it('critère 1 — a ticket without discovery ends integrated with no session of the tri', () => {
      const id = 'demo-tri-aucune';
      ticket(id, '000-forms');
      scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(0);
      expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
      // The explorateur of the plan alone.
      expect(sessions(id, 'explorateur')).toBe(1);
      expect(commentaires(id).filter(t => t.startsWith('Circuit · tri'))).toEqual([]);
      expect(bilans(id).at(-1)?.text).not.toMatch(/tri des découvertes/);
    });

    it('critères 1, 3, 4, 5, 6 and 7 — after the queue, the explorateur sorts each discovery; each verdict at its ticket, its label set, an a-porter and a non-confirmee reopened under a-valider', () => {
      const id = 'demo-tri';
      ticket(id, '000-forms');
      scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(
        id,
        'developpeur',
        avecDecouvertes('La mesure de zéro', 'La mesure négative', 'Le nom de la mesure')
      );
      // The lot is on main when the tri plays: its piece reads the code there.
      scenario(
        id,
        'explorateur-2',
        `git log --oneline -1 > "$e/tri.main"\nfiche '${JSON.stringify({
          verdicts: [
            {
              decouverte: `${id}.1`,
              verdict: 'a-porter',
              texte: 'mesure(0) rend 0, que le classeur divise.',
              piece: 'packages/forms/src/index.mjs:1 rend 2 * x.',
            },
            {
              decouverte: `${id}.2`,
              verdict: 'non-confirmee',
              texte: 'Que rend mesure(-1) ? Une sonde par l’entrée construite le dirait.',
            },
            {
              decouverte: `${id}.3`,
              verdict: 'sans-suite',
              texte: 'hypothétique : aucun usage ne lit ce nom.',
            },
          ],
        })}'\n`
      );
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(0);
      expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
      expect(leTicket(id).status).toBe('closed');
      // Critère 1: one session of the tri, the explorateur's, after the queue, on the lot on main.
      expect(sessions(id, 'explorateur')).toBe(2);
      expect(essai(id, 'tri.main')).toContain(id);
      const a = args(id, 'explorateur', 2);
      expect(valeur(a, '--agent')).toBe('explorateur');
      expect(valeur(a, '--model')).toBe('sonnet');
      expect(JSON.parse(valeur(a, '--json-schema'))).toEqual(schemaDeFiche('tri'));
      const prompt = essai(id, 'explorateur-2.prompt');
      for (const n of [1, 2, 3]) {
        expect(prompt).toContain(`${id}.${n}`);
      }
      expect(prompt).toContain('La mesure négative');
      // The commit the queue integrated for this ticket, the one its closure names.
      const integre = String(leTicket(id).close_reason).replace('intégré : ', '');
      expect(integre).toMatch(/^[0-9a-f]{7}$/);
      expect(prompt).toContain(`SON COMMIT SUR MAIN : ${integre} `);
      // Critère 6: the rights of reading, the build of a package among them.
      const reglages = JSON.parse(valeur(a, '--settings')) as {
        permissions: { allow: string[]; deny: string[] };
      };
      expect(reglages.permissions.allow).toContain('Bash(npm run build -- --filter=*)');
      expect(reglages.permissions.deny).toContain('Bash(bd comments add*)');
      // Critère 3: each verdict at the ticket of its discovery, its label set there.
      const [porter, nonConfirmee, sansSuite] = [1, 2, 3].map(n => `${id}.${n}`);
      expect(leTicket(porter).labels).toEqual(
        expect.arrayContaining(['decouverte', 'a-porter', 'a-valider'])
      );
      expect(sesCommentaires(porter)).toContainEqual(
        expect.stringMatching(
          /^Circuit · tri : a-porter — mesure\(0\) rend 0, que le classeur divise\. \(packages\/forms\/src\/index\.mjs:1 rend 2 \* x\.\)/
        )
      );
      // Critère 4: an a-porter and a non-confirmee reopen under a-valider; the others stay closed.
      expect(leTicket(porter).status).toBe('open');
      expect(leTicket(nonConfirmee).status).toBe('open');
      expect(leTicket(nonConfirmee).labels).toEqual(
        expect.arrayContaining(['non-confirmee', 'a-valider'])
      );
      expect(leTicket(sansSuite).status).toBe('closed');
      expect(leTicket(sansSuite).labels).toContain('sans-suite');
      expect(leTicket(sansSuite).labels).not.toContain('a-valider');
      expect(sesCommentaires(sansSuite)).toContainEqual(
        expect.stringContaining('sans-suite — hypothétique : aucun usage ne lit ce nom.')
      );
      // Critère 5: the question a non-confirmee lacks is written at its ticket.
      expect(sesCommentaires(nonConfirmee)).toContainEqual(
        expect.stringContaining('non-confirmee — Que rend mesure(-1) ?')
      );
      // At the ticket, the tri in one line; its end kept with the circuit's results.
      expect(commentaires(id)).toContainEqual(
        expect.stringMatching(/^Circuit · tri : 3 découvertes triées/)
      );
      expect(entrees(id)).toContainEqual(
        expect.objectContaining({
          etape: 'tri',
          tri: {
            decouvertes: 3,
            conforme: true,
            verdicts: { 'sans-suite': 1, 'a-porter': 1, 'non-confirmee': 1 },
          },
        })
      );
      // Critère 7: the bilan counts the session of the tri and its verdicts.
      expect(bilans(id).at(-1)?.text).toContain(
        '- tri des découvertes : 1 séance, 3 découvertes (1 sans-suite, 1 a-porter, 1 non-confirmee)'
      );
    });

    // grillhouse-6ve, critère 4: the explorateur of the tri reads its discovery and the commit of
    // main in the forms its instruction names, one command per call, in the main tree, each under
    // a rule of its rights; its verdict carries the piece it replayed. Witness: BPScript 320.39,
    // its three verdicts `non-confirmee` on one compound command refused.
    it('6ve, critère 4 — the explorateur of the tri runs bd show and git show in their simple forms, each under a rule of its rights, and gives a proven verdict', () => {
      const id = 'demo-tri-preuve';
      ticket(id, '000-forms');
      scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur', avecDecouvertes('La mesure de zéro'));
      const LANCEES = [`bd show ${id}.1`, 'git show --stat "$commit"'];
      scenario(
        id,
        'explorateur-2',
        [
          `commit=$(printf '%s\\n' "$prompt" | sed -n 's/^SON COMMIT SUR MAIN : \\([0-9a-f]*\\).*/\\1/p')`,
          `pwd > "$e/tri.pwd"`,
          `${LANCEES[0]} > "$e/tri.show"`,
          `${LANCEES[1]} > "$e/tri.git"`,
          `fiche "$(node -e 'const [c, l] = process.argv.slice(1); console.log(JSON.stringify({ verdicts: [{ decouverte: "${id}.1", verdict: "a-porter", texte: "mesure(0) rend 0.", piece: "$ git show --stat " + c + "\\n" + l }] }))' "$commit" "$(grep -m1 index.mjs "$e/tri.git")")"`,
          '',
        ].join('\n')
      );
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(0);
      expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
      // In the main tree, its discovery read and the commit of main shown.
      expect(essai(id, 'tri.pwd').trim()).toBe(essai(id, 'explorateur-2.pwd').trim());
      expect(essai(id, 'tri.show')).toContain(`"${id}.1"`);
      expect(essai(id, 'tri.git')).toContain('packages/forms/src/index.mjs');
      // Each command it ran, under a rule of its rights, refused by none; its instruction names
      // each, and the form.
      const { allow, deny } = (
        JSON.parse(valeur(args(id, 'explorateur', 2), '--settings')) as {
          permissions: { allow: string[]; deny: string[] };
        }
      ).permissions;
      for (const c of LANCEES.map(l => l.replace('"$commit"', 'abc1234'))) {
        expect(
          allow.some(regle => couvre(regle, c)),
          c
        ).toBe(true);
        expect(
          deny.some(regle => couvre(regle, c)),
          c
        ).toBe(false);
      }
      const prompt = essai(id, 'explorateur-2.prompt').replace(/\s+/g, ' ');
      for (const c of ['`bd show …`', '`git show …`']) {
        expect(prompt, c).toContain(c);
      }
      expect(prompt).toContain('une commande par appel');
      // The verdict proven: a-porter, its piece the commit replayed.
      expect(sessions(id, 'explorateur')).toBe(2);
      expect(leTicket(`${id}.1`).labels).toEqual(expect.arrayContaining(['a-porter', 'a-valider']));
      expect(sesCommentaires(`${id}.1`)).toContainEqual(
        expect.stringMatching(
          /^Circuit · tri : a-porter — mesure\(0\) rend 0\. \(\$ git show --stat [0-9a-f]{7}\n.*index\.mjs/s
        )
      );
    });

    it('critère 3 — a writing at a discovery’s ticket that fails is named on the line of the tri, and a reopening that failed is not counted', () => {
      const id = 'demo-tri-echec';
      ticket(id, '000-forms');
      scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur', avecDecouvertes('La mesure de zéro', 'La mesure négative'));
      const porter = (n: number) => ({
        decouverte: `${id}.${n}`,
        verdict: 'a-porter',
        texte: 'mesure(0) rend 0.',
        piece: 'packages/forms/src/index.mjs:1 rend 2 * x.',
      });
      // The second discovery's ticket gone: bd can label it no more, nor reopen it.
      scenario(
        id,
        'explorateur-2',
        `rm -f "$racine/.beads/${id}.2.json"\nfiche '${JSON.stringify({ verdicts: [porter(1), porter(2)] })}'\n`
      );
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(0);
      expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
      expect(leTicket(`${id}.1`).status).toBe('open');
      const ligne = commentaires(id).find(t =>
        t.startsWith('Circuit · tri : 2 découvertes triées')
      );
      expect(ligne).toContain(`rouvertes sous a-valider : ${id}.1 ;`);
      expect(ligne).toMatch(
        new RegExp(
          `écritures en échec : ${id.replaceAll('-', '\\-')}\\.2 : étiquette \\(.*\\), réouverture \\(`
        )
      );
    });

    it('critères 2 and 7 — a sheet missing a discovery is asked again once; twice, the discoveries stay as they are, said at the ticket, the integration kept', () => {
      const id = 'demo-tri-incomplet';
      ticket(id, '000-forms');
      scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur', avecDecouvertes('La mesure de zéro', 'La mesure négative'));
      const une = `fiche '${JSON.stringify({
        verdicts: [{ decouverte: `${id}.1`, verdict: 'doublon', texte: `de ${id}.2` }],
      })}'\n`;
      scenario(id, 'explorateur-2', une);
      scenario(id, 'explorateur-3', une);
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(0);
      expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
      expect(leTicket(id).status).toBe('closed');
      // Asked again once, the same session, the line that lacks named.
      expect(sessions(id, 'explorateur')).toBe(3);
      expect(valeur(args(id, 'explorateur', 3), '--resume')).toBe(
        valeur(args(id, 'explorateur', 2), '--session-id')
      );
      expect(essai(id, 'explorateur-3.prompt')).toContain(`verdicts : sans ligne pour ${id}.2`);
      // The discoveries as they were: closed, labelled decouverte alone, no verdict written.
      for (const n of [1, 2]) {
        const d = leTicket(`${id}.${n}`);
        expect(d.status).toBe('closed');
        expect(d.labels).toEqual(['decouverte']);
        expect(sesCommentaires(`${id}.${n}`).filter(t => t.startsWith('Circuit · tri'))).toEqual(
          []
        );
      }
      expect(commentaires(id)).toContainEqual(
        expect.stringMatching(
          /^Circuit · tri : le tri ne rend pas de fiche conforme .*les 2 découvertes restent telles quelles/
        )
      );
      expect(bilans(id).at(-1)?.text).toContain(
        '- tri des découvertes : 1 séance, 2 découvertes, sans fiche conforme : laissées telles quelles'
      );
    });
  }
);

// Critère 8: the texts say the tri: the common charter, the explorateur's skill, the supervisor's,
// the architecture of the package and the changelog.
// The commit the tri names is the one the queue integrated for its ticket, read in the reason of
// its closure, never main's last, another ticket's once several circuits run.
describe('the commit of the tri', () => {
  it('is the commit the queue names when it closes the ticket, or none', () => {
    expect(commitIntegre('intégré : abc1234')).toBe('abc1234');
    expect(commitIntegre('intégré : abc1234 ; la CI verte')).toBe('abc1234');
    expect(commitIntegre('découverte consignée')).toBeNull();
    expect(commitIntegre(null)).toBeNull();
    expect(commitIntegre('intégré : ')).toBeNull();
  });
});

describe('the texts that say the tri of the discoveries', () => {
  const RACINE = path.resolve(__dirname, '../../..');
  const lire = (f: string) => readFileSync(path.join(RACINE, f), 'utf8');
  it.each([
    'mods/grillhouse/charte.md',
    'mods/grillhouse/skills/explorateur/SKILL.md',
    'mods/grillhouse/skills/pitmaster/SKILL.md',
    'mods/grillhouse/skills/pitmaster/references/consigne-agent.md',
    'packages/grillhouse/docs/ARCHITECTURE.md',
    'CHANGELOG.md',
  ])('%s names the tri of the discoveries and its verdicts', f => {
    const t = lire(f);
    expect(t).toMatch(/[Tt]ri(age)? (des|of the) (découvertes|discoveries)/);
    for (const v of ['a-porter', 'non-confirmee']) {
      expect(t, v).toContain(v);
    }
  });

  it('the supervisor no longer carries the discoveries to the owner by hand', () => {
    expect(lire('mods/grillhouse/skills/pitmaster/SKILL.md')).not.toMatch(
      /je monte au responsable celles qui\s+touchent un usage réel/
    );
  });
});
