const fs = require('fs')
const path = require('path')

function testPluginExistence (pluginName) {
  try {
    return require.resolve(pluginName)
  } catch (e) {
    return null
  }
}

function getTransforms (extra) {
  return Object.entries({
    '^.+\\.(js|jsx|mjs)$': 'babel-jest',
    '.+\\.(css|styl|less|sass|scss)$': 'jest-css-modules-transform'
  })
    .filter(([match, transformModule]) => testPluginExistence(transformModule))
    .reduce(
      (aggr, [match, transformModule]) => ({
        ...aggr,
        [match]: transformModule
      }),
      {}
    )
}

function getWatchPlugins (extra) {
  return [
    ...[
      'jest-runner-eslint/watch-fix',
      'jest-watch-select-projects',
      'jest-watch-typeahead/filename',
      'jest-watch-typeahead/testname'
    ].filter(testPluginExistence),
    ...(extra || [])
  ]
}

function getSetupFiles (directory, extra) {
  return [
    ...['jest-date-mock'].filter(testPluginExistence),
    ...[
      path.resolve(directory, '..', '..', 'jest.setup.js'),
      path.join(directory, 'jest.setup.js')
    ].filter(fs.existsSync),
    ...(extra || [])
  ]
}

function getSetupFilesAfterEnv (directory, extra) {
  return [
    ...['jest-enzyme', 'jest-extended'].filter(testPluginExistence),
    ...[
      path.resolve(directory, '..', '..', 'jest.afterEnv.js'),
      path.join(directory, 'jest.afterEnv.js')
    ].filter(fs.existsSync),
    ...(extra || [])
  ]
}

module.exports = {
  getSetupFiles,
  getSetupFilesAfterEnv,
  getTransforms,
  getWatchPlugins,
  testPluginExistence
}
