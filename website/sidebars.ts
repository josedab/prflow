import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: [
        'getting-started/installation',
        'getting-started/quickstart',
        'getting-started/github-app-setup',
      ],
    },
    {
      type: 'category',
      label: 'Core Concepts',
      items: [
        'concepts/architecture',
        'concepts/agents',
        'concepts/workflows',
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      items: [
        'guides/github-action',
        'guides/configuration',
        'guides/self-hosting',
      ],
    },
    {
      type: 'category',
      label: 'API Reference',
      items: [
        'api-reference/index',
        'api-reference/endpoints',
        'api-reference/webhooks',
      ],
    },
    {
      type: 'category',
      label: 'Contributing',
      items: [
        'contributing/overview',
        'contributing/development-setup',
      ],
    },
    'troubleshooting',
    'faq',
  ],
};

export default sidebars;
