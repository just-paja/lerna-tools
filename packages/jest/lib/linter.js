const { testPluginExistence } = require('./plugins')
const { configureSuite } = require('./suite')

const testMatch = ['<rootDir>/**/*.{js,jsx,mjs}']

function configureLinter (rootDir) {
  if (testPluginExistence('jest-runner-standard')) {
    return configureSuite(rootDir, 'linter', {
      runner: 'jest-runner-standard',
      testMatch
    })
  }
  if (testPluginExistence('jest-runner-eslint')) {
    return configureSuite(rootDir, 'linter', {
      runner: 'jest-runner-eslint',
      testMatch
    })
  }
}

module.exports = {
  configureLinter
}
