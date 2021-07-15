const { jest: lernaAliases } = require('lerna-alias');

// module.exports = {
//   preset: 'jest-puppeteer',
//   testRegex: './*\\.test\\.ts$',
//   transform: {
//     '^.+\\.tsx?$': 'ts-jest'
//   },
//   moduleNameMapper: lernaAliases()
// };

module.exports = {
  preset: 'ts-jest',
  moduleNameMapper: {
    ...lernaAliases(),
    'xstate/lib/(.+)': '<rootDir>/../core/src/$1.ts'
  },
  watchPathIgnorePatterns: ['/lib/', '/dist/', '/es/']
};
