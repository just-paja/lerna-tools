const fs = require('fs')
const path = require('path')

function parsePluginName(pluginName) {
  return Array.isArray(pluginName) ? pluginName[0] : pluginName
}

function testPluginExistence(pluginName) {
  try {
    return require.resolve(parsePluginName(pluginName))
  } catch (e) {
    return null
  }
}

function getTransforms(extra) {
  return Object.entries({
    '^.+\\.(js|jsx|mjs)$': ['babel-jest', { rootMode: 'upward' }],
    '.+\\.(css|styl|less|sass|scss)$': 'jest-css-modules-transform',
  })
    .filter(([, transformModule]) => testPluginExistence(transformModule))
    .reduce(
      (aggr, [match, transformModule]) => ({
        ...aggr,
        [match]: transformModule,
      }),
      { ...extra }
    )
}

function getWatchPlugins(extra) {
  return [
    ...[
      'jest-runner-eslint/watch-fix',
      'jest-watch-select-projects',
      'jest-watch-typeahead/filename',
      'jest-watch-typeahead/testname',
    ].filter(testPluginExistence),
    ...(extra || []),
  ]
}

function getSetupFiles(directory, extra) {
  return [
    ...['jest-date-mock'].filter(testPluginExistence),
    ...[
      path.resolve(directory, '..', '..', 'jest.setup.js'),
      path.join(directory, 'jest.setup.js'),
    ].filter(fs.existsSync),
    ...(extra || []),
  ]
}

function getSetupFilesAfterEnv(directory, extra) {
  return [
    ...['jest-enzyme', 'jest-extended'].filter(testPluginExistence),
    ...[
      path.resolve(directory, '..', '..', 'jest.afterEnv.js'),
      path.join(directory, 'jest.afterEnv.js'),
    ].filter(fs.existsSync),
    ...(extra || []),
  ]
}

module.exports = {
  getSetupFiles,
  getSetupFilesAfterEnv,
  getTransforms,
  getWatchPlugins,
  testPluginExistence,
}
