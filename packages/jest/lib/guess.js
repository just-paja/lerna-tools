const path = require('path')

const { configureLinter } = require('./linter.js')
const { configureProject } = require('./project.js')
const { configureIntegration } = require('./integration.js')
const { getPackagesSync } = require('@lerna/project')

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
  process.env.NODE_PATH = path.join(directory, 'packages')
  return project
}

module.exports = {
  guessRootConfig,
  guessProjectConfig,
}
