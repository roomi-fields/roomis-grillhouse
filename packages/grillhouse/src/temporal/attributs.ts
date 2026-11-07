// The search attributes of the frame's workflows: the ticket and the step, two keywords, which the
// server registers at its start (`--search-attribute`, the unit of the server) and which a
// workflow upserts at each step, so that the board and `workflow list` read them from the server
// alone, no worker living. A module without network, which a workflow imports as the client does.
import { defineSearchAttributeKey, SearchAttributeType } from '@temporalio/common';

/** The ticket a workflow carries. */
export const ATTRIBUT_TICKET = defineSearchAttributeKey(
  'GrillhouseTicket',
  SearchAttributeType.KEYWORD
);

/** The step a workflow is at. */
export const ATTRIBUT_ETAPE = defineSearchAttributeKey(
  'GrillhouseEtape',
  SearchAttributeType.KEYWORD
);

/** Each search attribute and its type, in the words of `temporal server start-dev`. */
export const ATTRIBUTS_DE_RECHERCHE: Readonly<Record<string, 'Keyword'>> = {
  [ATTRIBUT_TICKET.name]: 'Keyword',
  [ATTRIBUT_ETAPE.name]: 'Keyword',
};
