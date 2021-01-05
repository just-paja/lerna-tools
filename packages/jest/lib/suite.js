const path = require('path')

const { getSetupFiles, getSetupFilesAfterEnv } = require('./plugins')

let filterFn = name => name

function filterSuiteName (fn) {
  filterFn = fn
}

function configureSuite (rootDir, ident, config = {}) {
  const pkg = require(path.join(rootDir, 'package.json'))
  return {
    displayName: getSuiteName(pkg, ident),
    name: getSuiteIdent(pkg, ident),
    rootDir,
    roots: ['<rootDir>'],
    moduleFileExtensions: ['js', 'jsx', 'json', 'mjs', 'node'],
    testPathIgnorePatterns: [
      '/coverage/',
      '/node_modules/',
      '/static/',
      '/dist/'
    ],
    transform: {
      '^.+\\.(js|jsx|mjs)$': 'babel-jest'
    },
    ...config,
    setupFiles: getSetupFiles(rootDir, config.setupFiles),
    setupFilesAfterEnv: getSetupFilesAfterEnv(
      rootDir,
      config.setupFilesAfterEnv
    )
  }
}

function getSuiteIdent (pkg, specifier) {
  return `${pkg.name}-${specifier}`
}

function getSuiteName (pkg, specifier) {
  return filterFn(`${pkg.name} ${specifier}`)
}

module.exports = {
  configureSuite,
  filterSuiteName
}
