const { configureLinter } = require('./linter')
const { configureRoot, configureProject } = require('./project')
const { configureSuite, filterSuiteName } = require('./suite')
const { guessProjectConfig, guessRootConfig } = require('./guess')

module.exports = {
  configureLinter,
  configureProject,
  configureRoot,
  configureSuite,
  filterSuiteName,
  guessProjectConfig,
  guessRootConfig,
}
