const { constants } = require('jest-config');

module.exports = {
  transform: {
    [constants.DEFAULT_JS_PATTERN]: 'babel-jest',
    '^.+\\.vue$': 'vue-jest',
    '^.+\\.svelte$': [
      'svelte-jester',
      {
        preprocess: true,
        rootMode: 'upward'
      }
    ]
  },
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname'
  ]
};
