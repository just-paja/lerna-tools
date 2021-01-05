const { testPluginExistence } = require('./plugins')
const { configureSuite } = require('./suite')

function configureLinter (rootDir) {
  if (testPluginExistence('jest-runner-standard')) {
    return configureSuite(rootDir, 'linter', {
      runner: 'jest-runner-standard',
      testMatch: ['<rootDir>/**/*.{js,jsx}']
    })
  }
  if (testPluginExistence('jest-runner-eslint')) {
    return configureSuite(rootDir, 'linter', {
      runner: 'jest-runner-eslint',
      testMatch: ['<rootDir>/**/*.{js,jsx}']
    })
  }
}

module.exports = {
  configureLinter
}
