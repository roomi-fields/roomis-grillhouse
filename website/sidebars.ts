import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    {
      type: 'doc',
      id: 'overview',
      label: 'Overview',
    },
    {
      type: 'category',
      label: 'The model',
      collapsed: false,
      items: ['elephant-goldfish', 'circuit', 'grill'],
    },
    {
      type: 'doc',
      id: 'getting-started',
      label: 'Getting started',
    },
    {
      type: 'doc',
      id: 'CHANGELOG',
      label: 'Release history',
    },
  ],
};

export default sidebars;
