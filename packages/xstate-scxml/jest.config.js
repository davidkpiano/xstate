const { jest: lernaAliases } = require('lerna-alias');

module.exports = {
  preset: 'ts-jest',
  moduleNameMapper: {
    ...lernaAliases(),
    'xstate/lib/(.+)': '<rootDir>/../core/src/$1.ts'
  },
  watchPathIgnorePatterns: ['/lib/', '/dist/', '/es/']
};
