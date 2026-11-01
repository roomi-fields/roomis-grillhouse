---
title: 'The circuit of a ticket — steps and roles in Grillhouse'
description: 'In Grillhouse a change of behaviour is one ticket that passes from fresh agent to fresh agent: the plan, the tests, the code, the final pass and review, the integration. Each step is held by one role, under its rights.'
slug: '/circuit'
---

# The circuit of a ticket

A change of behaviour is one ticket that passes from agent to agent in its own copy of the
repository: tests (testwriter), then code (developer), then review, then a commit that the queue
brings onto main, which closes it. One ticket makes one delivery, in one commit. The code is
measured against tests it did not write.

The supervisor launches the ticket's circuit once. As a CI applies its rules without asking, the
circuit makes the mechanical gestures itself (a command played once more, the regeneration of the
references) and writes each at the ticket with its rule. Every other stop ends on a question for
the supervisor, with its piece of evidence; what belongs to the owner goes up to the owner.

## The steps

| Step                          | Who holds it                                                       |
| ----------------------------- | ------------------------------------------------------------------ |
| 1 Plan                        | The explorer writes the plan, the questioner reads it once         |
| 1.1 Mechanical gesture        | The explorer plays the command of a plan that has no new behaviour |
| 2 Tests, 2.1 Proof of the red | A session of the testwriter                                        |
| 3 Code, 3.1 Checks            | A session of the developer                                         |
| 4 Final pass and review       | The final pass, the regeneration of the references, the reviewer   |
| 5 Integration                 | The commit, then the queue: main, push, CI                         |
| 5.3 Triage of the discoveries | The explorer, on the lot that entered main                         |

The number of a step says where each ticket stands. Each step carries its bounded loops
(`essai 2/3`, `tour 2/3`).

## The roles

| Role       | Skill          | What it does                                                                 |
| ---------- | -------------- | ---------------------------------------------------------------------------- |
| Supervisor | `pitmaster`    | Keeps the tickets, hands each one to a fresh agent, reviews closures.        |
| Explorer   | `explorateur`  | Writes a ticket's plan: its criteria, the packages to touch, open questions. |
| Questioner | `questionneur` | Questions a proposal it did not write; decides and writes nothing.           |
| Testwriter | `testwriter`   | Writes the ticket's tests from the specification, before any code.           |
| Developer  | `developpeur`  | Makes those tests pass; touches no test.                                     |
| Reviewer   | `relecteur`    | Reviews the lot adversarially and returns its verdict; writes nothing.       |

The plan works as an RFC. The questioner reads it once, as Amazon's bar raiser or a cockpit's
challenge and response; the explorer answers once, by question; what stays open goes up to the
supervisor.

## What holds each agent

- **The envelope.** Each agent runs as a fresh session inside a bubblewrap sandbox. It reads the
  whole copy, its indexes included, and writes only the packages its ticket's plan names. A write
  out of the plan stops the session, and the supervisor extends the plan or refuses.
- **The locks.** Hooks in each role's session hold its rights, so an agent cannot aim the code at
  its own tests, nor edit a file by the shell.
- **The sheet.** Each session ends on a structured output that its role's schema describes. The
  circuit decides on it, and on the reports of the tools, never on free text.
- **The review.** The circuit gives the reviewer the list of every element the lot adds, changes or
  removes. The reviewer returns one conformity line per element, the rule cited; a « non » sends the
  lot back.

## Discoveries

A discovery an agent makes is recorded in a closed ticket, under the ticket that found it. At the
end of the ticket, the triage gives each one its verdict, with its evidence: handled, duplicate or
without follow-up keep it closed; a defect of the current use, or one not confirmed, reopens it for
the owner. So the backlog stays the owner's plan.
