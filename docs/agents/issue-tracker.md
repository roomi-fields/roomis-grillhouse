# Issue tracker: Beads (`bd`)

Issues for this repo live in Beads, a git-backed tracker: data under `.beads/`, commands via the `bd` CLI, ids `<prefix>-xxx` (the prefix is set by `npm run setup`). No remote service. The project owner opens the work; agents take tickets, never invent them.

## Conventions

- One ticket = one agent session's worth of work; the body holds the brief, the plan, and (on close) the answer.
- Every ticket opens with an **Architecture** section, three answers written before any code: the mature model (how the mature product of the domain handles it, named), the address (where it lives in the specified architecture), the common mechanism (existing, or missing — then the missing mechanism is the work, and the reported case only its witness). A ticket without it does not start.
- A realisation ticket is created with its **Acceptance criteria** section (`## Critères d'acceptation`) after « Architecture »: criteria numbered `1.`, `2.`… (cited « critère 1 » in tests and comments), each a checkable statement answering a real need of the current use, edge cases and refusals included, covering every place that applies the same rule (found through the index). So the flow starts on criteria already numbered, and no agent rewrites the ticket to number them; a ticket does not go to the `testeur` without them.
- A change of behaviour is one ticket that passes from agent to agent, never a ticket per post: in the ticket's copy, the `testeur` writes the tests; the `developpeur` finds them there and writes the code; the `relecteur` gives its verdict (`ACCEPTÉ` or `RENDU`, each finding naming « Agent : <rôle> <composant> ») as its final answer, which the circuit writes on the same ticket; the circuit (`scripts/circuit.mjs`) leads them, sends a lot RENDU back to the agents its findings name, and on `ACCEPTÉ` builds both lots from the copy and commits them in one commit on the branch `agent/<ticket>` through `scripts/integration/integrer.mjs` (the ticket is labelled `en-file`); the queue (`scripts/integration/file.mjs`) brings that branch onto main, closes the ticket and pushes main.
- One ticket, one delivery: a goal whose split is unknown opens an exploration ticket (no code, agent `explorateur`), which closes on the realisation tickets it proposes, recorded closed and labelled `decouverte`; the supervisor reopens those the owner validates. A realisation ticket names the components it touches (« Numéros et titres ») and enters in one commit, under its own number alone; the `commit-msg` hook refuses a second commit for a closed ticket whose delivery stands, and lets a ticket reopened after its delivery (open in Beads) take correction commits; a revert (`Revert "…"`, `Reapply "…"`) passes and withdraws the delivery it names.
- An open ticket is born of the owner's word, or of a direct need of a project that uses the frame (a defect it meets). A discovery during work is recorded, with its example and address, in a closed ticket under the ticket that found it, labelled `decouverte` (see « Numéros et titres »); it reopens on the owner's word. A discovery that blocks stops the agent, and its handoff names it. The supervisor brings to the owner the discoveries that touch a real use.
- Types: `epic` (a chantier, always at the root: an epic has no mother), `task`, `bug`, `decision`. A mother under a chantier is a `task`; the session start lists an epic that has a mother. Priority `0`-`4`, 0 highest.
- Comments carry progress and handoffs: `bd comments add <id> "<text>"`. In a ticket's circuit, each comment carries its author: the circuit launches each session with `BEADS_ACTOR` naming its role (`testeur <composant>`, `developpeur <composant>`, `relecteur`, `regulateur`), writes its own lines (`Circuit · …`) as `circuit` and the reviewer's verdict as `relecteur`; the queue (`scripts/integration/file.mjs`) writes as `file`; a verdict is a comment of the author `relecteur` whose first word is `ACCEPTÉ` or `RENDU`. An agent does not change its author: its rights refuse bd's `--actor`, `-a`/`--author` and the variable `BEADS_ACTOR`.
- Labels used by the skills: `a-valider` (proposed, waits for the owner), `decouverte` (a discovery recorded closed; it reopens on the owner's word), `circuit` (the owner said to launch it: the ticket is in the flow, and only such a ticket waits in the pane's AGENTS), `attend-responsable` (a rule waits for the owner's word), `arbitrage` (a design question went to the `referent-technique` agent; the lot enters only with its verdict).

## Numéros et titres

- A chantier is an `epic` at the root; under it, every subject has a mother ticket (a `task`), open while work remains under it. Every ticket is created under its mother, so Beads numbers it natively: `320.1`, `320.2`, `320.2.1`.
- The title reads `<number> — <subject> — <components>`, the number being the id without the whole prefix of the project (`bd config get issue_prefix`, which may hold dashes: `bp-mono-`). The components are the ones the ticket touches, separated by commas, the provider first, then its readers (charte, « Un ticket de réalisation nomme ses composants »): `320.5.2 — Publie l'objet de la scène — 020-loader, 050-emitter`. A mother takes `parent` as its component.
- Creating one: `bash scripts/ticket.sh <mother> <subject> <components> <body> [label]` prints its id; the label is `a-valider` by default, and `decouverte` creates it closed (« découverte consignée »).

- A ticket goes through ten numbered steps, the automatic ones included (`scripts/etapes.mjs`, the one list): 1 Exploration (`explorateur`), 2 Arbitrage (`referent-technique` for a design question, `regulateur` for a stop of the circuit), then for each component 3 Tests (`testeur`), 4 Preuve du rouge, 5 Code (`developpeur`), 6 Contrôles, then 7 Passe finale, 8 Relecture (`relecteur`), 9 Intégration, 10 File : main, poussée, CI. One says « 320.2.1, step 5 »; the pane shows each ticket at its step.

## When a skill says "publish to the issue tracker"

`bash scripts/ticket.sh` (« Numéros et titres »); a child never inherits its mother's `circuit`.

## When a skill says "fetch the relevant ticket"

`bd show <id>`, then `bd comments <id>` (the handoff lives there). `bd list --parent <id>` lists an epic's children; `bd list --pretty` shows the tree.

## Working a ticket

- **Frontier**: `bd ready` → open, unblocked, unclaimed, in order.
- **Claim**: `bd update <id> --claim` (assignee = you, status in_progress) **before any work**.
- **Blocking**: `bd dep add <blocked-id> <blocker-id>`; `bd blocked` shows what waits.
- **Resolve**: `bd comments add <id> "Réponse : …"` then `bd close <id> --reason "<motif>"`.

## Handoff

The handoff is a comment on the ticket being worked, written by `bd comments add <id>`, not a temp file or a skill's document: the next session finds it with `bd show` or `bd comments <id>`.

The time each session takes is the register's (`scripts/registre.mjs`), which reads its transcript: the handoff does not declare it. An agent's final answer is one line, « passation au ticket »: the circuit reads the ticket.
