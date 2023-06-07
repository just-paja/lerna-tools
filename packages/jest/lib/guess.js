const { configureIntegration } = require('./integration.js')
const { configureLinter } = require('./linter.js')
const { configureProject } = require('./project.js')
const { getPackagesSync } = require('@lerna/project')
const { setPluginEnvVars } = require('./plugins.js')

function nonEmpty(item) {
  return Boolean(item)
}

function guessProjectConfig(rootDir) {
  const integration = configureIntegration(rootDir)
  const linter = configureLinter(rootDir)
  return configureProject(rootDir, [integration, linter].filter(nonEmpty))
}

function guessRootConfig(directory) {
  const packages = getPackagesSync(directory)
  const project = configureProject(
    directory,
    packages.reduce(
      (aggr, pkg) => aggr.concat(guessProjectConfig(pkg.location).projects),
      []
    )
  )
  setPluginEnvVars(directory)
  return project
}

module.exports = {
  guessRootConfig,
  guessProjectConfig,
}
