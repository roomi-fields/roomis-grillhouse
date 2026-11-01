---
title: 'The elephant and the goldfish — how Grillhouse maps the model'
description: 'Grillhouse implements the Elephant–Goldfish Model: an agent that holds the context writes, agents that hold none review, and a human settles the trade-offs. Here is how each part of the model maps onto Grillhouse.'
slug: '/elephant-goldfish'
---

# The elephant and the goldfish

Grillhouse implements the **Elephant–Goldfish Model**: an agent that holds the context writes,
agents that hold none review, and a human settles the trade-offs.

Dave Rensin
[describes the model](https://medium.com/@drensin/elephants-goldfish-and-the-new-golden-age-of-software-engineering-c33641a48874).
Google open-sourced its own plugin for it,
[EGM](https://github.com/google/elephant-goldfish-model), in October 2026. Grillhouse was built on
the same principle independently, with its first public commit on 2026-10-07, and applies it to
every ticket, from its design to its merge.

:::note

Grillhouse is not affiliated with Google, and is not endorsed by Google. EGM is cited here as
another implementation of the same model.

:::

## The correspondence

| Elephant–Goldfish                         | Grillhouse                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| The elephant holds the context and drafts | The supervisor, and the explorer, which writes the plan of a ticket       |
| Goldfish: fresh, read-only reviewers      | The questioner (the plan), the reviewer (the lot), each a fresh sub-agent |
| The human approves the design before code | The grill; the owner validates architecture, frame and interfaces         |
| Design before implementation              | A decision is taken and written in the ticket before any code             |
| Not for a small, clear fix                | A gesture without new behaviour leaves the circuit of code                |
| A drift report between documents and code | Guards hold interfaces and languages against the code at every pass       |

## Past the design

Grillhouse carries the model past the design:

- A fresh agent, the testwriter, writes the tests from the specification before any code.
- The developer works under write locks, and only on the packages of the plan.
- The reviewer returns one conformity line per element that the lot adds, changes or removes.

## Not in Grillhouse yet

Two practices of EGM are not in Grillhouse yet, and both are planned:

- a design review by several fresh lenses, before the owner validates the design;
- a drift report on the architecture's prose.
