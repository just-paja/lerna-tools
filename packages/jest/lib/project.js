const path = require('path')

const { getPackagesSync } = require('@lerna/project')
const { getWatchPlugins } = require('./plugins.js')

function configureProject(rootDir, projects, config = {}) {
  process.env.NODE_PATH = path.join(rootDir, '..', 'packages')
  return {
    collectCoverageFrom: [
      '**/*.{cjs,js,jsx,mjs}',
      '**/*.{ts,tsx,cts,mts,ctsx,mtsx}',
      '!*.d.ts',
      '!**/__fixtures__/**',
      '!**/__samples__/**',
      '!**/__jest__/**',
      '!**/dist/**',
      '!**/static/**',
      '!**/coverage/**',
      '!**/scripts/**',
      '!jest.*',
    ],
    coverageProvider: 'v8',
    ...config,
    watchPlugins: getWatchPlugins(config.watchPlugins),
    rootDir,
    projects,
  }
}

function getPackageTestProjects(pkg) {
  const jestConfig = require(path.join(pkg.location, 'jest.config.js'))
  return jestConfig.projects
}

function configureRoot(directory, config) {
  const packages = getPackagesSync(directory)
  const projects = packages.reduce(
    (aggr, pkg) => aggr.concat(getPackageTestProjects(pkg)),
    []
  )
  return configureProject(directory, projects, config)
}

module.exports = {
  configureRoot,
  configureProject,
}
