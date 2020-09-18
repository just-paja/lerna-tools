module.exports = {
  projects: [
    {
      displayName: 'linter',
      runner: 'jest-runner-standard',
      testMatch: ['<rootDir>/**/*.{js,jsx}'],
      testPathIgnorePatterns: [
        '<rootDir>/coverage',
        '<rootDir>/node_modules/',
        '<rootDir>/dist'
      ]
    },
    {
      displayName: 'integration',
      testPathIgnorePatterns: ['<rootDir>/node_modules/'],
      collectCoverageFrom: ['src/**/*.{js,jsx}'],
      coveragePathIgnorePatterns: ['/node_modules/', '/lib/'],
      transform: {
        '^.+\\.(js|jsx)$': 'babel-jest'
      }
    }
  ],
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname'
  ]
}
