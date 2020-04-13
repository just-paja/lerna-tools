module.exports = {
  projects: [
    {
      displayName: "linter",
      runner: "jest-runner-eslint",
      testMatch: ["<rootDir>/**/*.{js,jsx}"],
      testPathIgnorePatterns: ["<rootDir>/coverage", "<rootDir>/node_modules/"]
    },
    {
      displayName: "integration",
      testPathIgnorePatterns: ["<rootDir>/node_modules/"],
      collectCoverageFrom: ["src/**/*.{js,jsx}"],
      coveragePathIgnorePatterns: ["/node_modules/", "/lib/"],
      transform: {
        "^.+\\.(js|jsx)$": "babel-jest"
      }
    }
  ],
  watchPlugins: [
    "jest-watch-typeahead/filename",
    "jest-watch-typeahead/testname",
    "jest-runner-eslint/watch-fix"
  ]
};
