# Issue tracker: Beads (`bd`)

Issues for this repo live in Beads, a git-backed tracker: data under `.beads/`, commands via the `bd` CLI, ids `<prefix>-xxx` (the prefix is set by `npm run setup`). No remote service. The project owner opens the work; agents take tickets, never invent them.

## Conventions

- One ticket = one agent session's worth of work; the body holds the brief, the plan, and (on close) the answer.
- Every ticket opens with an **Architecture** section, three answers written before any code: the mature model (how the mature product of the domain handles it, named), the address (where it lives in the specified architecture), the common mechanism (existing, or missing — then the missing mechanism is the work, and the reported case only its witness). A ticket without it does not start.
- A ticket that changes a behaviour then carries an **Acceptance criteria** section (« Critères d'acceptation »): numbered, checkable statements, edge cases and refusals included, covering every place that applies the same rule (found through the index). It does not go to the `testeur` without it.
- A change of behaviour is one ticket that passes from agent to agent, never a ticket per post: in the ticket's copy, the `testeur` writes the tests and delivers `tests.patch`; the `developpeur` finds them there and delivers `code.patch`; the `relecteur` writes its verdict (`ACCEPTÉ` or `RENDU`) on the same ticket; a fresh `integrateur` agent judges both lots, commits them in one commit on the branch `agent/<ticket>` through `scripts/integration/integrer.mjs` (the ticket is labelled `en-file`), and the queue (`scripts/integration/file.mjs`) brings that branch onto main, closes the ticket and pushes main.
- One ticket, one delivery: a goal whose split is unknown opens an exploration ticket (no code, agent `explorateur`), which closes on the realisation tickets it proposes in its handoff; the supervisor creates those the owner validates. A realisation ticket touches one component and enters in one commit; the `commit-msg` hook refuses a second commit for a ticket whose delivery stands; a revert (`Revert "…"`, `Reapply "…"`) passes and withdraws the delivery it names.
- A ticket is born of the owner's word, or of a direct need of a project that uses the frame (a defect it meets). An agent creates no ticket: a discovery during work stays a remark in its handoff, with its example and address; a discovery that blocks stops the agent, and its handoff names it. The supervisor brings to the owner only the remarks that touch a real use.
- Types: `epic` (a chantier, always at the root: an epic has no mother), `task`, `bug`, `decision`. A mother under a chantier is a `task`; the session start lists an epic that has a mother. Priority `0`-`4`, 0 highest.
- Comments carry progress and handoffs: `bd comments add <id> "<text>"`.
- Labels used by the skills: `a-valider` (proposed, waits for the owner), `circuit` (the owner said to launch it: the ticket is in the flow, and only such a ticket waits in the pane's AGENTS), `attend-responsable` (a rule waits for the owner's word), `arbitrage` (a design question went to the `arbitre` agent; the lot enters only with its verdict).

## Numéros et titres

- A chantier is an `epic` at the root; under it, every subject has a mother ticket (a `task`), open while work remains under it. Every ticket is created under its mother, so Beads numbers it natively: `320.1`, `320.2`, `320.2.1`.
- The title reads `<number> — <subject> — <component>`, the number being the id without the whole prefix of the project (`bd config get issue_prefix`, which may hold dashes: `bp-mono-`); a mother takes `parent` as its component: `320.2.1 — Publie l'objet de la scène — binder`.
- Creating one:

  ```bash
  n=$(bd create "<subject>" --parent <mother> --no-inherit-labels -t task -l a-valider -d "<body>" --silent)
  bd update "$n" --title "${n#"$(bd config get issue_prefix)"-} — <subject> — <component>"
  ```

- Each agent goes by the fixed number of its role, in the order of the flow: 0 `chef-de-chantier` (leads one ticket from claim to pushed commit), 1 `explorateur`, 2 `arbitre`, 3 `testeur`, 4 `developpeur`, 5 `relecteur`, 6 `integrateur`. One says « 320.2.1, agent 4 »; a relaunched agent keeps its number.

## When a skill says "publish to the issue tracker"

`bd create "<title>" -t task -p <n> -d "<body>"` with `--parent <mother> --no-inherit-labels` (a child never inherits its mother's `circuit`) and the title of « Numéros et titres », `-l <label>` for labels.

## When a skill says "fetch the relevant ticket"

`bd show <id>`, then `bd comments <id>` (the handoff lives there). `bd list --parent <id>` lists an epic's children; `bd list --pretty` shows the tree.

## Working a ticket

- **Frontier**: `bd ready` → open, unblocked, unclaimed, in order.
- **Claim**: `bd update <id> --claim` (assignee = you, status in_progress) **before any work**.
- **Blocking**: `bd dep add <blocked-id> <blocker-id>`; `bd blocked` shows what waits.
- **Resolve**: `bd comments add <id> "Réponse : …"` then `bd close <id> --reason "<motif>"`.

## Handoff

The handoff is a comment on the ticket being worked, written by `bd comments add <id>`, not a temp file or a skill's document: the next session finds it with `bd show` or `bd comments <id>`.

The handoff notes the clock time at which each phase ended: code, tests, review, fixes, commit.
