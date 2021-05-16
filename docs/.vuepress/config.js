module.exports = {
  title: 'XState Docs',
  base: '/docs/',
  description:
    'Documentation for XState: State Machines and Statecharts for the Modern Web',
  markdown: {
    toc: { includeLevel: [2, 3] }
  },
  themeConfig: {
    lastUpdated: 'Last Updated',
    repo: 'davidkpiano/xstate',
    docsDir: 'docs',
    editLinks: true,
    logo: '/logo.svg',
    algolia: {
      apiKey: 'ddd397151aad9f0662ca36e5b39fed61',
      indexName: 'xstatejs'
    },
    nav: [
      { text: 'API', link: 'https://xstate.js.org/api' },
      { text: 'Visualizer', link: 'https://xstate.js.org/viz' },
      { text: 'Discord', link: 'https://discord.gg/xtWgFTgvNV' },
      {
        text: 'Community',
        link: 'https://github.com/davidkpiano/xstate/discussions'
      }
    ],
    sidebar: [
      {
        title: 'About',
        children: [
          '/about/concepts',
          '/about/goals',
          '/about/showcase',
          '/about/resources',
          '/about/tutorials'
        ]
      },
      {
        title: 'Guides',
        children: [
          '/guides/start',
          '/guides/installation',
          '/guides/machines',
          '/guides/states',
          '/guides/statenodes',
          '/guides/events',
          '/guides/transitions',
          '/guides/hierarchical',
          '/guides/parallel',
          '/guides/effects',
          '/guides/actions',
          '/guides/guards',
          '/guides/context',
          '/guides/models',
          '/guides/activities',
          '/guides/communication',
          '/guides/actors',
          '/guides/delays',
          '/guides/final',
          '/guides/history',
          '/guides/ids',
          '/guides/interpretation',
          '/guides/testing',
          '/guides/typescript'
        ]
      },
      {
        title: 'Tutorials',
        children: [
          '/tutorials/reddit',
          {
            title: '7GUIs',
            children: [
              '/tutorials/7guis/counter',
              '/tutorials/7guis/temperature',
              '/tutorials/7guis/flight',
              '/tutorials/7guis/timer'
            ]
          }
        ]
      },
      {
        title: 'Recipes',
        children: [
          '/recipes/react',
          '/recipes/vue',
          '/recipes/rxjs',
          '/recipes/ember',
          '/recipes/stencil',
          '/recipes/svelte'
        ]
      },
      {
        title: 'Packages',
        children: [
          'packages/xstate-react/',
          'packages/xstate-vue/',
          'packages/xstate-graph/',
          'packages/xstate-fsm/',
          'packages/xstate-test/',
          'packages/xstate-immer/',
          'packages/xstate-inspect/',
          'packages/xstate-svelte/'
        ]
      },
      {
        title: 'Patterns',
        children: ['/patterns/sequence']
      },
      {
        title: 'Examples',
        children: [
          '/examples/counter',
          '/examples/todomvc',
          '/examples/calculator',
          '/examples/covid-tracker'
        ]
      }
    ]
  },
  plugins: [
    ['@vuepress/google-analytics', { ga: 'UA-129726387-1' }],
    'vuepress-plugin-export'
  ]
};
