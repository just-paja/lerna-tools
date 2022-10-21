const path = require('path')

const { getPackagesSync } = require('@lerna/project')
const { getWatchPlugins } = require('./plugins')

function configureProject (rootDir, projects, config = {}) {
  process.env.NODE_PATH = path.join(rootDir, '..', 'packages')
  return {
    collectCoverageFrom: [
      '**/*.js',
      '**/*.jsx',
      '**/*.mjs',
      '!**/__fixtures__/**',
      '!**/__samples__/**',
      '!**/static/**',
      '!**/coverage/**',
      '!jest.*'
    ],
    ...config,
    watchPlugins: getWatchPlugins(config.watchPlugins),
    rootDir,
    projects
  }
}

function getPackageTestProjects (pkg) {
  const jestConfig = require(path.join(pkg.location, 'jest.config.js'))
  return jestConfig.projects
}

function configureRoot (directory, config) {
  const packages = getPackagesSync(directory)
  const projects = packages.reduce(
    (aggr, pkg) => aggr.concat(getPackageTestProjects(pkg)),
    []
  )
  return configureProject(directory, projects, config)
}

module.exports = {
  configureRoot,
  configureProject
}
