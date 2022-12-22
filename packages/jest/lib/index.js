const { configureLinter } = require('./linter.js')
const { configureRoot, configureProject } = require('./project.js')
const { configureSuite, filterSuiteName } = require('./suite.js')
const { guessProjectConfig, guessRootConfig } = require('./guess.js')

module.exports = {
  configureLinter,
  configureProject,
  configureRoot,
  configureSuite,
  filterSuiteName,
  guessProjectConfig,
  guessRootConfig,
}
