const { testPluginExistence } = require('./plugins.js')
const { configureSuite } = require('./suite.js')

const testMatch = ['<rootDir>/**/*.{cjs,js,jsx,mjs}']

function configureLinter(rootDir) {
  if (testPluginExistence('jest-runner-standard')) {
    return configureSuite(rootDir, 'linter', {
      runner: 'jest-runner-standard',
      testMatch,
    })
  }
  if (testPluginExistence('jest-runner-eslint')) {
    return configureSuite(rootDir, 'linter', {
      runner: 'jest-runner-eslint',
      testMatch,
    })
  }
  return null
}

module.exports = {
  configureLinter,
}
