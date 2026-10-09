# Issue tracker: Beads (`bd`)

Issues for this repo live in Beads, a git-backed tracker: data under `.beads/`, commands via the `bd` CLI, ids `<prefix>-xxx` (the prefix is set by `npm run setup`). No remote service. The project owner opens the work; agents take tickets, never invent them.

## Conventions

- One ticket = one agent session's worth of work; the body holds the brief, the plan, and (on close) the answer.
- Every ticket opens with an **Architecture** section, three answers written before any code: the mature model (how the mature product of the domain handles it, named), the address (where it lives in the specified architecture), the common mechanism (existing, or missing — then the missing mechanism is the work, and the reported case only its witness). A ticket without it does not start.
- A change of behaviour takes two tickets: the tests ticket (agent `testeur`), then the code ticket that depends on it (`bd dep add <code> <tests>`, agent `developpeur`). The `relecteur` agent writes its verdict (`ACCEPTÉ` or `RENDU`) on the code ticket; a fresh `integrateur` agent judges both lots and commits them in one commit through `scripts/integration/integrer.mjs`.
- One ticket, one delivery: a goal whose split is unknown opens an exploration ticket (no code, agent `explorateur`), which closes on the realisation tickets it proposes, labelled `a-valider`. A realisation ticket touches one component and enters in one commit; the `commit-msg` hook refuses a second commit for a ticket.
- A discovery during work becomes a new ticket, created by the agent under the ticket that found it (see « Numéros et titres »), labelled `a-valider`. A discovery that blocks: `bd dep add <id> <new>` and `bd update <id> --status blocked`.
- Types: `epic` (a chantier), `task`, `bug`, `decision`. Priority `0`-`4`, 0 highest.
- Comments carry progress and handoffs: `bd comments add <id> "<text>"`.
- Labels used by the skills: `a-valider` (proposed, waits for the owner), `attend-responsable` (a rule waits for the owner's word), `arbitrage` (a design question went to the `arbitre` agent; the lot enters only with its verdict).

## Numéros et titres

- Every subject has a mother ticket, open while work remains under it. Every ticket is created under its mother, so Beads numbers it natively: `320.1`, `320.2`, `320.2.1`. A discovery goes under the ticket that found it (`320.2.2.1`).
- The title reads `<number> — <subject> — <component>`, the number being the id without its prefix; a mother takes `parent` as its component: `320.2.1 — Publie l'objet de la scène — binder`.
- Creating one:

  ```bash
  n=$(bd create "<subject>" --parent <mother> -t task -l a-valider -d "<body>" --silent)
  bd update "$n" --title "${n#*-} — <subject> — <component>"
  ```

- Each agent goes by the fixed number of its role, in the order of the flow: 1 `explorateur`, 2 `arbitre`, 3 `testeur`, 4 `developpeur`, 5 `relecteur`, 6 `integrateur`. One says « 320.2.1, agent 4 »; a relaunched agent keeps its number.

## When a skill says "publish to the issue tracker"

`bd create "<title>" -t task -p <n> -d "<body>"` with `--parent <mother>` and the title of « Numéros et titres », `-l <label>` for labels.

## When a skill says "fetch the relevant ticket"

`bd show <id>`, then `bd comments <id>` (the handoff lives there). `bd list --parent <id>` lists an epic's children; `bd list --pretty` shows the tree.

## Working a ticket

- **Frontier**: `bd ready` → open, unblocked, unclaimed, in order.
- **Claim**: `bd update <id> --claim` (assignee = you, status in_progress) **before any work**.
- **Blocking**: `bd dep add <blocked-id> <blocker-id>`; `bd blocked` shows what waits.
- **Resolve**: `bd comments add <id> "Réponse : …"` then `bd close <id> --reason "<motif>"`.

## Handoff

`/handoff` writes its document as a comment on the ticket being worked (`bd comments add`), not in a temp file, so the next session finds it with `bd show`.

The handoff notes the clock time at which each phase ended: code, tests, review, fixes, commit.
