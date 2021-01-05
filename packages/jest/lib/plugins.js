const fs = require('fs')
const path = require('path')

function testPluginExistence (pluginName) {
  try {
    return require.resolve(pluginName)
  } catch (e) {
    return null
  }
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
  getWatchPlugins,
  testPluginExistence
}
