const path = require('path')

let filterFn = name => name

function filterSuiteName(fn) {
  filterFn = fn
}

function configureSuite(rootDir, ident, config = {}) {
  const pkg = require(path.join(rootDir, 'package.json'))
  return {
    displayName: getSuiteIdent(pkg, ident),
    rootDir,
    roots: ['<rootDir>'],
    moduleFileExtensions: [
      'cjs',
      'cjsx',
      'cts',
      'ctsx',
      'js',
      'json',
      'jsx',
      'mjs',
      'mjsx',
      'mts',
      'mtsx',
      'node',
      'ts',
      'tsx',
    ],
    testPathIgnorePatterns: [
      '/__fixtures__/',
      '/__samples__/',
      '/coverage/',
      '/node_modules/',
      '/static/',
      '/dist/',
    ],
    ...config,
  }
}

function getSuiteIdent(pkg, specifier) {
  return filterFn(`${pkg.name}-${specifier}`)
}

module.exports = {
  configureSuite,
  filterSuiteName,
}
