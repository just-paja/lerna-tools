const { configureLinter } = require('./linter')
const { configureProject } = require('./project')
const { configureSuite } = require('./suite')
const { getPackagesSync } = require('@lerna/project')

function nonEmpty (item) {
  return Boolean(item)
}

function guessProjectConfig (rootDir) {
  const integration = configureSuite(rootDir, 'integration')
  const linter = configureLinter(rootDir)
  return configureProject(rootDir, [integration, linter].filter(nonEmpty))
}

function guessRootConfig (directory) {
  const packages = getPackagesSync(directory)
  return configureProject(
    directory,
    packages.reduce(
      (aggr, pkg) => aggr.concat(guessProjectConfig(pkg.location).projects),
      []
    )
  )
}

module.exports = {
  guessRootConfig,
  guessProjectConfig
}
