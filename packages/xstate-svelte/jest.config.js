const { jest: lernaAliases } = require('lerna-alias');

module.exports = {
  moduleNameMapper: lernaAliases(),
  transform: {
    '^.+\\.svelte$': [
      'svelte-jester',
      {
        preprocess: true,
        rootMode: 'upward'
      }
    ],
    '^.+\\.ts$': 'ts-jest'
  },
  watchPathIgnorePatterns: ['/lib/', '/dist/', '/es/']
};
