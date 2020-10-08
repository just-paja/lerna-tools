module.exports = {
  projects: [
    {
      displayName: 'linter',
      runner: 'jest-runner-standard',
      testMatch: ['<rootDir>/**/*.{js,jsx}'],
      testPathIgnorePatterns: [
        '<rootDir>/coverage',
        '<rootDir>/node_modules/',
        '<rootDir>/dist',
        '/__fixtures__/'
      ]
    },
    {
      displayName: 'integration',
      testPathIgnorePatterns: ['<rootDir>/node_modules/', '__fixtures__'],
      transform: {
        '^.+\\.(js|jsx)$': 'babel-jest'
      }
    }
  ],
  collectCoverage: true,
  collectCoverageFrom: ['lib/*.js', 'bin/*.js'],
  coveragePathIgnorePatterns: [
    '**/node_modules/**',
    '**/coverage/**',
    '**/__tests__/**'
  ],
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname'
  ]
}
