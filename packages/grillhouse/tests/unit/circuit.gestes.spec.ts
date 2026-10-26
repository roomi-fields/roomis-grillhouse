import { rmSync } from 'node:fs';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { sortie, ARRETS, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts), grillhouse-3uv.95.4
// (decision 3 of 3uv.95): as a CI applies its rules (retry, regenerate, skip a job without object)
// without asking anyone, the circuit makes the mechanical gestures itself, with no session, each
// written at the ticket and in the log with its rule (GESTES of scripts/etapes.mjs); every other
// stop goes up to the supervisor, its state carrying the fact, its piece (file:line, or command and
// output) and the question, and who must answer it (MONTEES). Witness: BP 320.9, 45 sessions of the
// regulator, 22 of the technical referent, 14 montées that were mechanical gestures.
// The trial repository and its stand-ins: ./circuit-essai.ts; each file of the circuit's tests
// builds its own, in a trial directory of its own.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const {
  revenirAuDebut,
  ticket,
  scenario,
  circuit,
  essai,
  sessions,
  etat,
  ordre,
  journal,
  commentaires,
  entrees,
} = circuitEssai(ESSAIS);

// A developpeur session that changes no file.
const RIEN = "passation 'Rien à écrire.'\n";
// The gestures the circuit writes at the ticket, and the questions it sends up.
const gestes = (id: string) => commentaires(id).filter(t => /^Circuit · geste : /.test(t));
const questions = (id: string) => commentaires(id).filter(t => /^Circuit · question : /.test(t));
// The question a circuit's state carries at a montée.
interface Question {
  arret: string;
  fait: string;
  piece: string;
  question: string;
  qui: string;
}
const question = (id: string) =>
  (etat(id) as unknown as { question: Question | null } | null)?.question ?? null;
// A blocking finding of the reviewer for <role>.
const rendu = (role: string) =>
  `fiche '${JSON.stringify({
    verdict: 'RENDU',
    constats: [
      {
        titre: 'packages/forms/src/index.mjs',
        genre: 'bloquant',
        regle: 'critère 1',
        role,
        corps: 'mesure de 0 doit rendre 0.',
        piece: 'packages/forms/src/index.mjs:1',
      },
    ],
  })}'\n`;

describe.runIf(canWrap)('the gestures the circuit makes itself', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);

  // BP 320.9, B5: 995-tools had nothing to deliver, four montées and 49 min.
  it('a developpeur with nothing to deliver goes to the checks: green, the circuit goes on, the gesture at the ticket', () => {
    const id = 'demo-geste-rien';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur-1', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    scenario(id, 'developpeur-2', RIEN);
    scenario(id, 'relecteur-1', rendu('developpeur'));
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id)).toEqual([
      'testwriter',
      'developpeur',
      'relecteur',
      'developpeur',
      'relecteur',
    ]);
    expect(gestes(id)).toEqual([
      expect.stringMatching(
        /^Circuit · geste : rien-a-livrer → aux contrôles, qui jugent le lot \(règle : /
      ),
    ]);
    expect(journal(id)).toContain('geste : rien-a-livrer →');
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });

  it('a developpeur with nothing to deliver whose checks stay red goes up to the supervisor, the red as its piece', () => {
    const id = 'demo-geste-rien-rouge';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', RIEN);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS['sans-livraison']);
    expect(sessions(id, 'developpeur')).toBe(1);
    expect(gestes(id)).toEqual([expect.stringMatching(/ · geste : rien-a-livrer → /)]);
    expect(etat(id)).toMatchObject({ raison: 'sans-livraison', code: ARRETS['sans-livraison'] });
    expect(question(id)).toMatchObject({ arret: 'sans-livraison', qui: 'superviseur' });
    expect(question(id)?.piece).toContain('packages/forms/test/mesure.test.mjs');
    expect(question(id)?.question).toContain('--reprendre');
  });

  // A command of the checks at 75 plays once more (the gesture `rejeu`); at 75 again, the circuit
  // ends at 75 (the gesture `a-repasser`). The package's test script stands at 75 for as many runs
  // as its file `repasser` counts.
  const A_75 = (n: number) =>
    `cat > $c/repasser.mjs <<'EOF'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
if (existsSync('repasser')) {
  const n = Number(readFileSync('repasser', 'utf8'));
  if (n <= 1) rmSync('repasser');
  else writeFileSync('repasser', String(n - 1));
  console.log('⏱ à repasser (code 75)');
  process.exit(75);
}
process.exit(spawnSync('vitest', ['run'], { stdio: 'inherit' }).status ?? 1);
EOF
printf '${n}' > $c/repasser
node -e "const f='$c/package.json';const p=JSON.parse(require('fs').readFileSync(f,'utf8'));p.scripts['test:vitest']='node repasser.mjs';require('fs').writeFileSync(f,JSON.stringify(p,null,2))"
`;
  const lignes = (texte: string, motif: RegExp) => texte.split('\n').filter(l => motif.test(l));

  it('a command of the checks at 75 plays once more, the gesture and its rule at the ticket and in the log, no session launched on it', () => {
    const id = 'demo-geste-rejeu';
    ticket(id, '000-forms, 030-binder');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}${A_75(1)}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(gestes(id)).toEqual([
      expect.stringMatching(
        /^Circuit · geste : rejeu → la commande joue une seconde fois \(règle : une commande des contrôles hors de la passe finale, ou l’intégration, à 75 rejoue une fois avant l’arrêt\)$/
      ),
    ]);
    expect(lignes(journal(id), /^geste : /)).toEqual([
      expect.stringMatching(/^geste : rejeu → la commande joue une seconde fois \(règle : /),
    ]);
    // No session on the gesture: the testwriter and the developpeur of the ticket, then the reviewer.
    expect(ordre(id)).toEqual(['testwriter', 'developpeur', 'relecteur']);
    expect(questions(id)).toEqual([]);
  });

  it('a command of the checks still at 75 after its second run ends the circuit at 75, the gesture and its rule at the ticket and in the log, no session launched on it', () => {
    const id = 'demo-geste-a-repasser';
    ticket(id, '000-forms, 030-binder');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}${A_75(2)}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS['a-repasser']);
    expect(gestes(id)).toEqual([
      expect.stringMatching(/^Circuit · geste : rejeu → /),
      expect.stringMatching(
        /^Circuit · geste : a-repasser → le circuit finit à 75, que le superviseur rejoue au repos par --reprendre \(règle : seul le code 75 du vérificateur dit la charge de la machine\)$/
      ),
    ]);
    expect(lignes(journal(id), /^geste : a-repasser/)).toEqual([
      expect.stringMatching(/^geste : a-repasser → le circuit finit à 75, .*\(règle : /),
    ]);
    expect(ordre(id)).toEqual(['testwriter', 'developpeur']);
    // A gesture, not a question: nothing goes up.
    expect(questions(id)).toEqual([]);
    expect(question(id)).toBeNull();
    expect(etat(id)).toMatchObject({ raison: 'a-repasser', code: ARRETS['a-repasser'] });
    // grillhouse-3uv.95.9: the end at 75 says who answers it, the supervisor, who replays it.
    expect(entrees(id).filter(x => x.montee)).toEqual([
      expect.objectContaining({
        montee: { code: ARRETS['a-repasser'], raison: 'a-repasser' },
      }),
    ]);
  });
});

describe.runIf(canWrap)(
  'a stop no gesture settles goes up to the supervisor',
  { timeout: 300_000 },
  () => {
    afterEach(revenirAuDebut);

    // A16 of 320.3: the guard consommateurs-arbitres asked for an arbitrage; a finding of forms,
    // judged at the checks of the plan, which no developpeur settles.
    it('a finding to settle goes up with its file and line as its piece, no session launched on it', () => {
      const id = 'demo-montee-arbitrer';
      ticket(id, '000-forms, 030-binder');
      scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(
        id,
        'developpeur',
        `${CODE_JUSTE}echo oui > $c/../binder/arbitrer.txt\npassation 'Code écrit.'\n`
      );
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(ARRETS.controles);
      expect(ordre(id)).toEqual(['testwriter', 'developpeur']);
      const q = question(id);
      expect(q).toMatchObject({ arret: 'controles', qui: 'superviseur' });
      expect(q?.piece).toContain('packages/forms/src/index.mjs:1');
      expect(q?.piece).toContain('la mesure attend un arbitrage.');
      expect(q?.fait.trim()).not.toBe('');
      expect(questions(id)).toEqual([
        expect.stringMatching(
          /^Circuit · question : controles à 3\.1 Contrôles — .* — au superviseur : /s
        ),
      ]);
    });

    // grillhouse-3uv.95.3, criteria 1 and 2: a session its lock stops on a write out of the plan
    // ends the circuit at « hors-plan », for the supervisor, who extends the plan or refuses.
    it('a session stopped out of the plan goes up, the write as its piece, no second session', () => {
      const id = 'demo-montee-hors-plan';
      ticket(id, '000-forms, 030-binder');
      scenario(
        id,
        'testwriter',
        `echo "⛔ hors-plan — packages/autre/x.ts est dans packages/autre" > "$TMPDIR/hors-plan"\n`
      );
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(ARRETS['hors-plan']);
      expect(sessions(id, 'testwriter')).toBe(1);
      expect(essai(id, 'testwriter-1.paquets')).toBe('packages/forms:packages/binder');
      expect(etat(id)).toMatchObject({ etape: 'testwriter', raison: 'hors-plan' });
      const q = question(id);
      expect(q).toMatchObject({ arret: 'hors-plan', qui: 'superviseur' });
      expect(q?.piece).toContain('packages/autre/x.ts');
      expect(q?.question).toContain('--etendre');
      expect(questions(id)).toHaveLength(1);
    });
  }
);
